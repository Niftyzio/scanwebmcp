"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import type { ObservatorySnapshot, SectorBreakdown } from "@/lib/benchmark";

type LiveObservatoryCorpusProps = {
  initialSnapshot: ObservatorySnapshot;
  signalsStored: number;
  agentHits: number;
  agentHitOutcomes: { ok: number; refused: number; error: number };
  children: ReactNode;
};

function validCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function validRungs(value: unknown): value is Record<number, number> {
  if (typeof value !== "object" || value == null || Array.isArray(value)) return false;
  return Object.values(value).every(validCount);
}

function validSector(value: unknown): value is SectorBreakdown {
  if (typeof value !== "object" || value == null) return false;
  const row = value as Partial<SectorBreakdown>;
  return (
    (typeof row.sector === "string" || row.sector === null) &&
    typeof row.label === "string" &&
    validCount(row.n) &&
    validRungs(row.rungs)
  );
}

function validSnapshot(value: unknown): value is ObservatorySnapshot {
  if (typeof value !== "object" || value == null) return false;
  const snapshot = value as Partial<ObservatorySnapshot>;
  return (
    validCount(snapshot.sites) &&
    validCount(snapshot.scans) &&
    Array.isArray(snapshot.bySector) &&
    snapshot.bySector.every(validSector)
  );
}

export default function LiveObservatoryCorpus({
  initialSnapshot,
  signalsStored,
  agentHits,
  agentHitOutcomes,
  children,
}: LiveObservatoryCorpusProps) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);

  useEffect(() => {
    let active = true;
    let controller: AbortController | null = null;

    async function refresh() {
      controller?.abort();
      controller = new AbortController();
      try {
        const response = await fetch("/api/observatory", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) return;
        const next: unknown = await response.json();
        if (active && validSnapshot(next)) setSnapshot(next);
      } catch {
        // Preserve the last verified snapshot through transient failures.
      }
    }

    void refresh();
    const interval = window.setInterval(refresh, 30_000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      active = false;
      controller?.abort();
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, []);

  return (
    <>
      <div className="observatory-live-counts" aria-live="polite" aria-atomic="true">
        <span className="observatory-live-label"><span className="live-dot" aria-hidden="true" />Live now</span>
        <span><strong>{snapshot.sites.toLocaleString("en-GB")}</strong> unique websites successfully scanned</span>
        <span><strong>{snapshot.scans.toLocaleString("en-GB")}</strong> completed scan runs, including re-scans</span>
      </div>

      {children}

      <h2>By sector</h2>
      <table>
        <thead>
          <tr><th>Sector</th><th>Sites</th><th>Invisible</th><th>Readable</th><th>Answerable</th><th>Callable+</th></tr>
        </thead>
        <tbody>
          {snapshot.bySector.map((row) => (
            <tr key={row.sector ?? "unclassified"}>
              <td>{row.label}</td>
              <td>{row.n}</td>
              <td>{row.rungs[0] ?? 0}</td>
              <td>{row.rungs[1] ?? 0}</td>
              <td>{row.rungs[2] ?? 0}</td>
              <td>{(row.rungs[3] ?? 0) + (row.rungs[4] ?? 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">
        Each business appears once in the ladder using its latest completed scan; re-scans update
        its position without duplicating the website. Sites without a selected industry appear as
        Unclassified. <a href="/case-study">Read the case study →</a>{" "}
        Sector percentiles appear on result pages once a sector reaches 30 scanned sites. Corpus:
        {" "}{snapshot.sites} sites · {snapshot.scans} scans · {signalsStored.toLocaleString()} stored signals ·{" "}
        {agentHits} WebMCP and MCP tool invocations against this site&apos;s own agent surface:{" "}
        {agentHitOutcomes.ok} completed, {agentHitOutcomes.refused} refused safely and{" "}
        {agentHitOutcomes.error} errored.
      </p>
    </>
  );
}
