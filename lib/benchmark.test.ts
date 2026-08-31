import { describe, expect, it } from "vitest";
import { summariseLatestCompletedScans } from "./benchmark";

function scan(
  id: number,
  siteId: number,
  rung: number | null,
  sector: string | null,
  createdAt: string,
  optOut = false,
) {
  return {
    id,
    site_id: siteId,
    rung,
    created_at: createdAt,
    sites: { sector, opt_out: optOut, domain: `site-${siteId}.example` },
  };
}

describe("Observatory corpus summary", () => {
  it("uses the latest scan once per site and keeps uncategorized sites visible", () => {
    const summary = summariseLatestCompletedScans([
      scan(4, 1, 2, "accountancy", "2026-08-30T12:04:00Z"),
      scan(3, 3, 0, "law", "2026-08-30T12:03:00Z", true),
      scan(2, 2, 0, null, "2026-08-30T12:02:00Z"),
      scan(1, 1, 1, "accountancy", "2026-08-30T12:01:00Z"),
    ]);

    expect(summary.scanIds).toEqual([4, 2]);
    expect(summary.rungDist).toEqual({ 0: 1, 2: 1 });
    expect(summary.bySector).toEqual([
      { sector: "accountancy", label: "Accountancy", n: 1, rungs: { 2: 1 } },
      { sector: null, label: "Unclassified", n: 1, rungs: { 0: 1 } },
    ]);
  });

  it("counts a completed site even when its rung is temporarily unmeasured", () => {
    const summary = summariseLatestCompletedScans([
      scan(1, 1, null, "software", "2026-08-30T12:01:00Z"),
    ]);

    expect(summary.bySector).toEqual([
      { sector: "software", label: "Software & SaaS", n: 1, rungs: {} },
    ]);
  });
});
