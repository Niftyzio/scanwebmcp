"use client";

import { useEffect, useState } from "react";

type Counts = { sites: number; scans: number };
type LiveCorpusCounterProps = {
  initialSites: number;
  initialScans: number;
  variant: "home" | "observatory";
};

function validCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export default function LiveCorpusCounter({
  initialSites,
  initialScans,
  variant,
}: LiveCorpusCounterProps) {
  const [counts, setCounts] = useState<Counts>({ sites: initialSites, scans: initialScans });

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
        const next = await response.json() as Partial<Counts>;
        const { sites, scans } = next;
        if (active && validCount(sites) && validCount(scans)) {
          setCounts((current) =>
            current.sites === sites && current.scans === scans
              ? current
              : { sites, scans },
          );
        }
      } catch {
        // Keep the last verified count visible through a transient failure.
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

  if (variant === "home") {
    return (
      <p className="corpus-counter" aria-live="polite" aria-atomic="true">
        <span className="live-dot" aria-hidden="true" />
        <span className="corpus-count">{counts.sites.toLocaleString("en-GB")}</span> unique websites scanned
        <span aria-hidden="true"> · </span>
        <span>{counts.scans.toLocaleString("en-GB")} completed scans</span>
        <span aria-hidden="true"> · </span><a href="/observatory">See the live Observatory</a>
      </p>
    );
  }

  return (
    <div className="observatory-live-counts" aria-live="polite" aria-atomic="true">
      <span className="observatory-live-label"><span className="live-dot" aria-hidden="true" />Live now</span>
      <span><strong>{counts.sites.toLocaleString("en-GB")}</strong> unique websites successfully scanned</span>
      <span><strong>{counts.scans.toLocaleString("en-GB")}</strong> completed scan runs, including re-scans</span>
    </div>
  );
}
