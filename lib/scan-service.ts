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

export const slugify = (domain: string) =>
  domain.replace(/[^a-z0-9.]+/gi, "-").toLowerCase();

export type ScanTrigger = "user" | "rescan" | "agent" | "seed";

export interface ScanRequestResult {
  slug: string;
  status: string;
  cached: boolean;
  cachedAt?: string;
  freshScanAvailableAt?: string;
}

function assertDb(error: { message: string } | null, operation: string): void {
  if (error) throw new Error(`${operation}: ${error.message}`);
}

/**
 * Automated and agent traffic may reuse a result for 24h. A human explicitly
 * asking to scan gets the shorter per-domain safety cooldown: after one hour a
 * new historical scan row is created. Cached responses carry their timestamp so
 * a client can never present an old report as a newly completed scan.
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
export const RESCAN_COOLDOWN_MS = 3600_000; // 1h
export const CACHE_WINDOW_MS = 24 * 3600_000; // automated/agent reuse

export function cacheWindowForTrigger(trigger: ScanTrigger): number {
  return trigger === "user" || trigger === "rescan" ? RESCAN_COOLDOWN_MS : CACHE_WINDOW_MS;
}

export function freshScanAvailableAt(
  completedAt: string,
  cacheWindowMs = RESCAN_COOLDOWN_MS,
): string {
  return new Date(new Date(completedAt).getTime() + cacheWindowMs).toISOString();
}

export async function requestScan(opts: {
  url: string;
  trigger: ScanTrigger;
  requesterType: "human" | "agent";
  userAgent?: string;
  sector?: string;
  ipHash?: string;
}): Promise<ScanRequestResult> {
  const { domain } = validateTarget(opts.url);
  const supabase = db();
  const declaredSector = normaliseSector(opts.sector);

  if (opts.ipHash && opts.trigger !== "seed") {
    const { data: allowed, error } = await supabase.rpc("consume_rate_limit", {
      requested_kind: "scan",
      requested_hash: opts.ipHash,
      maximum_events: IP_SCANS_PER_HOUR,
      window_seconds: 3600,
    });
    assertDb(error, "Could not check the scan rate limit");
    if (!allowed)
      throw new Error(
        "Rate limit: that's a lot of scans in one hour from this connection. Results stay live at their links — come back in a bit for more.",
      );
  }

  const { data: site, error: siteReadError } = await supabase
    .from("sites")
    .select("id, opt_out, last_scanned_at, sector, country")
    .eq("domain", domain)
    .maybeSingle();
  assertDb(siteReadError, "Could not read the site record");

  if (site?.opt_out) throw new Error("This domain has opted out of scanning.");
  if (site && !site.sector && declaredSector) {
    const { error } = await supabase.from("sites").update({ sector: declaredSector }).eq("id", site.id);
    assertDb(error, "Could not update the site sector");
  }

  const slug = slugify(domain);
  if (site) {
    // Fresh-enough result → report it explicitly as cached. Human scan actions
    // use the one-hour safety cooldown; they never silently reuse a day-old
    // report. Automated traffic keeps the wider resource-protection window.
    const windowMs = cacheWindowForTrigger(opts.trigger);
    const { data: recent, error } = await supabase
      .from("scans")
      .select("slug, status, completed_at")
      .eq("site_id", site.id)
      .eq("status", "complete")
      .gte("completed_at", new Date(Date.now() - windowMs).toISOString())
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    assertDb(error, "Could not read the scan cache");
    if (recent?.completed_at) {
      return {
        slug: recent.slug,
        status: "complete",
        cached: true,
        cachedAt: recent.completed_at,
        freshScanAvailableAt: freshScanAvailableAt(recent.completed_at, windowMs),
      };
    }
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
    const { data: rubric, error: rubricError } = await supabase
      .from("rubric_versions")
      .select("weights_json")
      .eq("version", RUBRIC_VERSION)
      .maybeSingle();
    assertDb(rubricError, "Could not load the scoring rubric");
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

    const { error: opportunityError } = await supabase.from("opportunities").insert(
      opportunities.map((o) => ({
        scan_id: scan.id,
        rank: o.rank,
        template_key: o.templateKey,
        rendered_text: `**${o.title}** — ${o.text}`,
        impact: o.impact,
        ease: o.ease,
      })),
    );
    assertDb(opportunityError, "Opportunity storage failed");

    const { error: completeError } = await supabase
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
    assertDb(completeError, "Could not complete the scan record");

    const { error: siteUpdateError } = await supabase
      .from("sites")
      .update({
        last_scanned_at: new Date().toISOString(),
        // Page evidence (declared address, phone prefix, postcode) fills in
        // what the TLD couldn't — never overwrites a country already known.
        ...(!site?.country && result.countryGuess ? { country: result.countryGuess } : {}),
      })
      .eq("id", siteId);
    assertDb(siteUpdateError, "Could not update the site record");

    // Render backfill: a scan whose WebMCP check degraded (renderer saturated
    // or down) queues itself for one automatic re-scan on the cron drumbeat.
    // Bursts degrade to "unmeasured" in the moment and heal afterwards, so
    // render capacity bounds latency, never completeness.
    const renderDegraded = result.signals.some(
      (s) =>
        s.signalKey === "webmcp_registration" &&
        (s.valueText ?? "").startsWith("render_unavailable"),
    );
    if (renderDegraded) {
      const { data: queued, error: queueReadError } = await supabase
        .from("scan_queue")
        .select("id")
        .eq("domain", domain)
        .eq("status", "pending")
        .limit(1)
        .maybeSingle();
      assertDb(queueReadError, "Could not read the render backfill queue");
      if (!queued) {
        const { error: queueInsertError } = await supabase
          .from("scan_queue")
          .insert({ domain, status: "pending", error: "render_backfill" });
        assertDb(queueInsertError, "Could not queue the render backfill");
      }
    }

    return { slug, status: "complete", cached: false };
  } catch (e) {
    const { error: failureWriteError } = await supabase
      .from("scans")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error: e instanceof Error ? e.message : String(e),
      })
      .eq("id", scan.id);
    if (failureWriteError) console.error(`Could not mark failed scan ${scan.id}: ${failureWriteError.message}`);
    throw e;
  }
}

/** Latest scan (any status) for a result slug, with signals + opportunities. */
export async function getScanPage(slug: string) {
  const supabase = db();
  const { data: scan, error: scanError } = await supabase
    .from("scans")
    .select("*, sites!inner(domain, sector)")
    .eq("slug", slug)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  assertDb(scanError, "Could not read the scan page");
  if (!scan) return null;

  const [signalResult, opportunityResult] = await Promise.all([
    supabase.from("signals").select("*").eq("scan_id", scan.id).order("id"),
    supabase.from("opportunities").select("*").eq("scan_id", scan.id).order("rank"),
  ]);
  assertDb(signalResult.error, "Could not read scan signals");
  assertDb(opportunityResult.error, "Could not read scan opportunities");
  return { scan, signals: signalResult.data ?? [], opportunities: opportunityResult.data ?? [] };
}

export async function logAgentHit(opts: {
  toolName: string;
  argumentsJson?: unknown;
  agentUa?: string;
  outcome: string;
  scanId?: number;
  ipHash?: string;
}) {
  const supabase = db();
  if (opts.ipHash) {
    const { data: allowed, error: countError } = await supabase.rpc("consume_rate_limit", {
      requested_kind: "agent_hit",
      requested_hash: opts.ipHash,
      maximum_events: 120,
      window_seconds: 3600,
    });
    assertDb(countError, "Could not check the instrumentation rate limit");
    if (!allowed) throw new Error("Rate limit: too many instrumentation events.");
  }
  const { error } = await supabase
    .from("agent_hits")
    .insert({
      scan_id: opts.scanId ?? null,
      tool_name: opts.toolName,
      arguments_json: opts.argumentsJson ?? null,
      agent_ua: opts.agentUa?.slice(0, 300) ?? null,
      outcome: opts.outcome,
      requester_ip_hash: opts.ipHash ?? null,
    });
  assertDb(error, "Could not log the agent invocation");
}
