import { db } from "./db";

/**
 * Benchmark context from the corpus. Spec §8 rules: a sector percentile is
 * shown only at n ≥ 30 for that sector; below that, the cross-corpus
 * percentile with the sample size stated plainly. Latest complete scan per
 * site only, so re-scans don't double-count.
 */

export type DimKey = "d1" | "d2" | "d3" | "d4" | "d5";

export interface Benchmark {
  sectorName: string | null;
  sectorN: number;
  sectorPercentile: number | null; // % of sector sites this composite beats
  allN: number;
  allPercentile: number | null;
  rungDist: Record<number, number>; // corpus-wide rung distribution
  /** Per-pillar percentile against the same pool the composite used
   *  (sector at n≥30, otherwise the whole corpus). Null where unmeasured. */
  dimPercentiles: Record<DimKey, number | null>;
  /** Median score of the pool per pillar — the "typical firm analysed". */
  dimMedians: Record<DimKey, number | null>;
  dimPool: "sector" | "all";
  dimPoolN: number;
  /** Where the comparison pool's businesses are based, from recorded country
   *  data — e.g. "UK", "mostly UK", "international". Null when we don't know. */
  poolOrigin: string | null;
}

interface Row {
  site_id: number;
  composite: number | null;
  rung: number | null;
  sector: string | null;
  country: string | null;
  created_at: string;
  d1: number | null;
  d2: number | null;
  d3: number | null;
  d4: number | null;
  d5: number | null;
}

const DIM_KEYS: DimKey[] = ["d1", "d2", "d3", "d4", "d5"];

export async function getBenchmark(
  siteId: number,
  sector: string | null,
  composite: number | null,
  dims?: Partial<Record<DimKey, number | null>>,
): Promise<Benchmark> {
  const { data } = await db()
    .from("scans")
    .select("site_id, composite, rung, d1, d2, d3, d4, d5, created_at, sites!inner(sector, country, opt_out, domain)")
    .eq("status", "complete")
    .order("created_at", { ascending: false });

  const latestPerSite = new Map<number, Row>();
  for (const r of (data ?? []) as unknown as (Row & { sites: { sector: string | null; country: string | null; opt_out: boolean; domain: string } })[]) {
    if (r.sites?.opt_out) continue;
    if (!latestPerSite.has(r.site_id))
      latestPerSite.set(r.site_id, { ...r, sector: r.sites?.sector ?? null, country: r.sites?.country ?? null });
  }
  const rows = [...latestPerSite.values()].filter((r) => r.composite != null);

  const rungDist: Record<number, number> = {};
  for (const r of rows) if (r.rung != null) rungDist[r.rung] = (rungDist[r.rung] ?? 0) + 1;

  const pct = (pool: Row[]) => {
    if (composite == null || pool.length < 2) return null;
    const others = pool.filter((r) => r.site_id !== siteId);
    if (others.length === 0) return null;
    const beaten = others.filter((r) => (r.composite ?? 0) < composite).length;
    return Math.round((beaten / others.length) * 100);
  };

  const sectorRows = sector ? rows.filter((r) => r.sector === sector) : [];
  const sectorN = sectorRows.length;

  const dimPool: "sector" | "all" = sectorN >= 30 ? "sector" : "all";
  const dimRows = dimPool === "sector" ? sectorRows : rows;
  const dimPercentiles = {} as Record<DimKey, number | null>;
  const dimMedians = {} as Record<DimKey, number | null>;
  for (const k of DIM_KEYS) {
    const pool = dimRows
      .filter((r) => r[k] != null)
      .map((r) => r[k] as number)
      .sort((a, b) => a - b);
    dimMedians[k] = pool.length ? pool[Math.floor(pool.length / 2)] : null;

    const mine = dims?.[k];
    if (mine == null) {
      dimPercentiles[k] = null; // unmeasured is unmeasured, never zero
      continue;
    }
    const others = dimRows.filter((r) => r.site_id !== siteId && r[k] != null);
    dimPercentiles[k] =
      others.length < 2
        ? null
        : Math.round((others.filter((r) => (r[k] as number) < mine).length / others.length) * 100);
  }

  return {
    sectorName: sector,
    sectorN,
    sectorPercentile: sectorN >= 30 ? pct(sectorRows) : null,
    allN: rows.length,
    allPercentile: pct(rows),
    rungDist,
    dimPercentiles,
    dimMedians,
    dimPool,
    dimPoolN: dimRows.length,
    poolOrigin: describePoolOrigin(dimRows),
  };
}

/** Honest origin phrase for a pool: named only when the data supports it. */
function describePoolOrigin(pool: Row[]): string | null {
  const known = pool.map((r) => r.country).filter((c): c is string => !!c);
  if (pool.length === 0 || known.length < pool.length * 0.6) return null;
  const counts = new Map<string, number>();
  for (const c of known) counts.set(c, (counts.get(c) ?? 0) + 1);
  const [top, topN] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  const share = topN / pool.length;
  if (share >= 0.9) return top;
  if (share >= 0.6) return `mostly ${top}`;
  return "international";
}

export interface ObservatoryStats {
  sites: number;
  scans: number;
  signalsStored: number;
  rungDist: Record<number, number>;
  bySector: { sector: string; n: number; rungs: Record<number, number> }[];
  pctBlockingAnyAiBot: number;
  pctWafBlocked: number;
  pctLlmsTxt: number;
  pctSellsMarkup: number;
  pctAnyCallable: number;
  totalLatentForms: number;
  agentHits: number;
}

export async function getObservatoryStats(): Promise<ObservatoryStats> {
  const supabase = db();
  const [{ count: sites }, { count: scans }, { count: signalsStored }, { count: agentHits }] =
    await Promise.all([
      supabase.from("sites").select("*", { count: "exact", head: true }),
      supabase.from("scans").select("*", { count: "exact", head: true }),
      supabase.from("signals").select("*", { count: "exact", head: true }),
      supabase.from("agent_hits").select("*", { count: "exact", head: true }),
    ]);

  const { data: scanRows } = await supabase
    .from("scans")
    .select("id, site_id, rung, created_at, sites!inner(sector, opt_out, domain)")
    .eq("status", "complete")
    .order("created_at", { ascending: false });

  const latest = new Map<number, { id: number; rung: number | null; sector: string | null }>();
  for (const r of (scanRows ?? []) as unknown as { id: number; site_id: number; rung: number | null; sites: { sector: string | null; opt_out: boolean; domain: string } }[]) {
    if (r.sites?.opt_out) continue;
    if (!latest.has(r.site_id)) latest.set(r.site_id, { id: r.id, rung: r.rung, sector: r.sites?.sector ?? null });
  }
  const scanIds = [...latest.values()].map((r) => r.id);

  const rungDist: Record<number, number> = {};
  const sectorMap = new Map<string, Record<number, number>>();
  for (const r of latest.values()) {
    if (r.rung != null) rungDist[r.rung] = (rungDist[r.rung] ?? 0) + 1;
    if (r.sector && r.rung != null) {
      const s = sectorMap.get(r.sector) ?? {};
      s[r.rung] = (s[r.rung] ?? 0) + 1;
      sectorMap.set(r.sector, s);
    }
  }

  const { data: sigRows } = await supabase
    .from("signals")
    .select("scan_id, signal_key, value_bool, value_num, value_text")
    .in("scan_id", scanIds.length ? scanIds : [-1])
    .in("signal_key", [
      "robots_gptbot", "robots_claudebot", "robots_google_extended", "robots_perplexitybot",
      "agent_access_blocked", "llms_txt", "structured_data_types",
      "mcp_probe_well_known", "mcp_probe_path", "webmcp_tools_found", "forms_as_latent_tools",
    ]);

  const perScan = new Map<number, Record<string, { b?: boolean | null; n?: number | null; t?: string | null }>>();
  for (const s of sigRows ?? []) {
    const m = perScan.get(s.scan_id) ?? {};
    m[s.signal_key] = { b: s.value_bool, n: s.value_num, t: s.value_text };
    perScan.set(s.scan_id, m);
  }

  let blockingAny = 0, waf = 0, llms = 0, sells = 0, callable = 0, forms = 0;
  for (const m of perScan.values()) {
    if (["robots_gptbot", "robots_claudebot", "robots_google_extended", "robots_perplexitybot"].some((k) => m[k]?.t === "blocked")) blockingAny++;
    if (m["agent_access_blocked"]?.b) waf++;
    if (m["llms_txt"]?.b) llms++;
    if (/Service|Offer|Product/.test(m["structured_data_types"]?.t ?? "")) sells++;
    if (m["mcp_probe_well_known"]?.b || m["mcp_probe_path"]?.b || (m["webmcp_tools_found"]?.n ?? 0) > 0) callable++;
    forms += Number(m["forms_as_latent_tools"]?.n ?? 0);
  }
  const n = Math.max(perScan.size, 1);
  const pc = (x: number) => Math.round((x / n) * 100);

  return {
    sites: sites ?? 0,
    scans: scans ?? 0,
    signalsStored: signalsStored ?? 0,
    rungDist,
    bySector: [...sectorMap.entries()]
      .map(([sector, rungs]) => ({ sector, n: Object.values(rungs).reduce((a, b) => a + b, 0), rungs }))
      .sort((a, b) => b.n - a.n),
    pctBlockingAnyAiBot: pc(blockingAny),
    pctWafBlocked: pc(waf),
    pctLlmsTxt: pc(llms),
    pctSellsMarkup: pc(sells),
    pctAnyCallable: pc(callable),
    totalLatentForms: forms,
    agentHits: agentHits ?? 0,
  };
}
