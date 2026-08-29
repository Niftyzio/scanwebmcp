import { runScan, validateTarget, RUBRIC_VERSION } from "./engine";
import { pickOpportunities } from "./opportunities";
import { db } from "./db";

export interface ScanRecord {
  id: number;
  slug: string;
  domain: string;
  status: string;
  rubric_version: string;
  rung: number | null;
  composite: number | null;
  d1: number | null;
  d2: number | null;
  d3: number | null;
  d4: number | null;
  d5: number | null;
  started_at: string | null;
  completed_at: string | null;
  error: string | null;
}

const slugify = (domain: string) =>
  domain.replace(/^www\./, "").replace(/[^a-z0-9.]+/gi, "-").toLowerCase();

/**
 * One scan per domain per 24h unless explicitly re-scanned (spec §10 caching
 * rule). Returns the existing scan when the cache holds.
 */
export async function requestScan(opts: {
  url: string;
  trigger: "user" | "rescan" | "agent" | "seed";
  requesterType: "human" | "agent";
  userAgent?: string;
}): Promise<{ slug: string; status: string; cached: boolean }> {
  const { domain } = validateTarget(opts.url);
  const supabase = db();

  const { data: site } = await supabase
    .from("sites")
    .select("id, opt_out, last_scanned_at")
    .eq("domain", domain)
    .maybeSingle();

  if (site?.opt_out) throw new Error("This domain has opted out of scanning.");

  const slug = slugify(domain);
  if (site && opts.trigger !== "rescan") {
    const { data: recent } = await supabase
      .from("scans")
      .select("slug, status, completed_at")
      .eq("site_id", site.id)
      .eq("status", "complete")
      .gte("completed_at", new Date(Date.now() - 24 * 3600_000).toISOString())
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (recent) return { slug: recent.slug, status: "complete", cached: true };
  }

  let siteId = site?.id;
  if (!siteId) {
    const { data: created, error } = await supabase
      .from("sites")
      .insert({ domain, first_scanned_at: new Date().toISOString() })
      .select("id")
      .single();
    if (error) throw new Error(`Could not register site: ${error.message}`);
    siteId = created.id;
  }

  const { data: scan, error: scanErr } = await supabase
    .from("scans")
    .insert({
      site_id: siteId,
      slug,
      rubric_version: RUBRIC_VERSION,
      status: "running",
      started_at: new Date().toISOString(),
      trigger: opts.trigger,
      requester_type: opts.requesterType,
      user_agent: opts.userAgent?.slice(0, 300) ?? null,
    })
    .select("id")
    .single();
  if (scanErr) {
    // Unique slug collision from a concurrent run — surface the existing page.
    if (scanErr.code === "23505") return { slug, status: "running", cached: true };
    throw new Error(`Could not create scan: ${scanErr.message}`);
  }

  try {
    const result = await runScan(opts.url);
    const opportunities = pickOpportunities(result);

    const { error: sigErr } = await supabase.from("signals").insert(
      result.signals.map((s) => ({
        scan_id: scan.id,
        dimension: s.dimension,
        signal_key: s.signalKey,
        value_bool: s.valueBool ?? null,
        value_num: s.valueNum ?? null,
        value_text: s.valueText ?? null,
        evidence_url: s.evidenceUrl,
        evidence_snippet: s.evidenceSnippet?.slice(0, 500) ?? null,
        observed_at: s.observedAt,
      })),
    );
    if (sigErr) throw new Error(`Signal storage failed: ${sigErr.message}`);

    await supabase.from("opportunities").insert(
      opportunities.map((o) => ({
        scan_id: scan.id,
        rank: o.rank,
        template_key: o.templateKey,
        rendered_text: `**${o.title}** — ${o.text}`,
        impact: o.impact,
        ease: o.ease,
      })),
    );

    await supabase
      .from("scans")
      .update({
        status: "complete",
        completed_at: new Date().toISOString(),
        rung: result.rung,
        composite: result.scores.composite,
        d1: result.scores.d1,
        d2: result.scores.d2,
        d3: result.scores.d3,
        d4: result.scores.d4,
        d5: result.scores.d5,
        error: result.errors.join("; ") || null,
      })
      .eq("id", scan.id);

    await supabase
      .from("sites")
      .update({ last_scanned_at: new Date().toISOString() })
      .eq("id", siteId);

    return { slug, status: "complete", cached: false };
  } catch (e) {
    await supabase
      .from("scans")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error: e instanceof Error ? e.message : String(e),
      })
      .eq("id", scan.id);
    throw e;
  }
}

/** Latest scan (any status) for a result slug, with signals + opportunities. */
export async function getScanPage(slug: string) {
  const supabase = db();
  const { data: scan } = await supabase
    .from("scans")
    .select("*, sites!inner(domain)")
    .eq("slug", slug)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!scan) return null;

  const [{ data: signals }, { data: opportunities }] = await Promise.all([
    supabase.from("signals").select("*").eq("scan_id", scan.id).order("id"),
    supabase.from("opportunities").select("*").eq("scan_id", scan.id).order("rank"),
  ]);
  return { scan, signals: signals ?? [], opportunities: opportunities ?? [] };
}

export async function logAgentHit(opts: {
  toolName: string;
  argumentsJson?: unknown;
  agentUa?: string;
  outcome: string;
  scanId?: number;
}) {
  await db()
    .from("agent_hits")
    .insert({
      scan_id: opts.scanId ?? null,
      tool_name: opts.toolName,
      arguments_json: opts.argumentsJson ?? null,
      agent_ua: opts.agentUa?.slice(0, 300) ?? null,
      outcome: opts.outcome,
    });
}
