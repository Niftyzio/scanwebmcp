import { runScan, validateTarget, detectCountry, RUBRIC_VERSION, REFERENCE_SCORING, type ScoringConfig } from "./engine";
import { pickOpportunities } from "./opportunities";
import { matchSector } from "./sectors";
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
/** Self-declared industry: only slugs from the pre-seeded taxonomy are
 *  recorded, so the backend never fills with free-text noise and growing
 *  sectors are countable (spec: benchmark a sector once its sample justifies
 *  it). Never overwrites a sector already on record. */
function normaliseSector(input?: string): string | null {
  if (!input) return null;
  return matchSector(input)?.slug ?? null;
}


/** Abuse limits: a scan costs the target site ~10 polite fetches and us a
 *  worker slot, so both are metered. Per-requester cap is enforced against
 *  the database (serverless instances share no memory); re-scans get a
 *  per-domain cooldown so nobody uses the scanner to hammer a third party. */
const IP_SCANS_PER_HOUR = 10;
const RESCAN_COOLDOWN_MS = 3600_000; // 1h
const CACHE_WINDOW_MS = 24 * 3600_000; // spec §10

export async function requestScan(opts: {
  url: string;
  trigger: "user" | "rescan" | "agent" | "seed";
  requesterType: "human" | "agent";
  userAgent?: string;
  sector?: string;
  ipHash?: string;
}): Promise<{ slug: string; status: string; cached: boolean }> {
  const { domain } = validateTarget(opts.url);
  const supabase = db();
  const declaredSector = normaliseSector(opts.sector);

  if (opts.ipHash && opts.trigger !== "seed") {
    const { count } = await supabase
      .from("scans")
      .select("*", { count: "exact", head: true })
      .eq("requester_ip_hash", opts.ipHash)
      .gte("created_at", new Date(Date.now() - 3600_000).toISOString());
    if ((count ?? 0) >= IP_SCANS_PER_HOUR)
      throw new Error(
        "Rate limit: that's a lot of scans in one hour from this connection. Results stay live at their links — come back in a bit for more.",
      );
  }

  const { data: site } = await supabase
    .from("sites")
    .select("id, opt_out, last_scanned_at, sector, country")
    .eq("domain", domain)
    .maybeSingle();

  if (site?.opt_out) throw new Error("This domain has opted out of scanning.");
  if (site && !site.sector && declaredSector) {
    await supabase.from("sites").update({ sector: declaredSector }).eq("id", site.id);
  }

  const slug = slugify(domain);
  if (site) {
    // Fresh-enough result → serve it. Re-scans shorten the window rather than
    // bypassing it, so the button can't be used to hammer a site.
    const windowMs = opts.trigger === "rescan" ? RESCAN_COOLDOWN_MS : CACHE_WINDOW_MS;
    const { data: recent } = await supabase
      .from("scans")
      .select("slug, status, completed_at")
      .eq("site_id", site.id)
      .eq("status", "complete")
      .gte("completed_at", new Date(Date.now() - windowMs).toISOString())
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (recent) return { slug: recent.slug, status: "complete", cached: true };
  }

  let siteId = site?.id;
  if (!siteId) {
    const { data: created, error } = await supabase
      .from("sites")
      .insert({
        domain,
        first_scanned_at: new Date().toISOString(),
        sector: declaredSector,
        country: detectCountry(null, domain), // TLD guess now; page evidence refines it post-scan
      })
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
      requester_ip_hash: opts.ipHash ?? null,
    })
    .select("id")
    .single();
  if (scanErr) throw new Error(`Could not create scan: ${scanErr.message}`);

  try {
    // Production scoring comes from the private rubric store; the code's
    // reference values are the fallback for standalone use.
    let scoring: ScoringConfig = REFERENCE_SCORING;
    const { data: rubric } = await supabase
      .from("rubric_versions")
      .select("weights_json")
      .eq("version", RUBRIC_VERSION)
      .maybeSingle();
    const wj = rubric?.weights_json as { weights?: ScoringConfig["weights"]; gates?: ScoringConfig["gates"] } | null;
    if (wj?.weights && wj?.gates) scoring = { weights: wj.weights, gates: wj.gates };

    const result = await runScan(opts.url, scoring);
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
      .update({
        last_scanned_at: new Date().toISOString(),
        // Page evidence (declared address, phone prefix, postcode) fills in
        // what the TLD couldn't — never overwrites a country already known.
        ...(!site?.country && result.countryGuess ? { country: result.countryGuess } : {}),
      })
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
    .select("*, sites!inner(domain, sector)")
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
