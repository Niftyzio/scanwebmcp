"use client";

import { useState } from "react";
import { SECTOR_TAXONOMY, matchSector } from "@/lib/sectors";

export default function ScanForm() {
  const [url, setUrl] = useState("");
  const [industry, setIndustry] = useState("");
  const [state, setState] = useState<"idle" | "scanning" | "error">("idle");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    const sector = matchSector(industry);
    if (industry.trim() && !sector) {
      setState("error");
      setError("Pick your industry from the list — start typing and choose a match (or leave it blank).");
      return;
    }
    setState("scanning");
    setError("");
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), ...(sector ? { sector: sector.slug } : {}) }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Scan failed");
      location.href = `/scan/${j.slug}`;
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "Scan failed");
    }
  }

  return (
    <form onSubmit={submit} className="scan-form" aria-busy={state === "scanning"}>
      <input
        type="text"
        inputMode="url"
        placeholder="yourbusiness.com"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        disabled={state === "scanning"}
        aria-label="Website to scan"
        required
      />
      <input
        type="text"
        list="industry-list"
        placeholder="Your industry — start typing…"
        value={industry}
        onChange={(e) => setIndustry(e.target.value)}
        disabled={state === "scanning"}
        aria-label="Your industry (optional, sharpens the comparison)"
        autoComplete="off"
      />
      <datalist id="industry-list">
        {SECTOR_TAXONOMY.map((s) => (
          <option key={s.slug} value={s.label} />
        ))}
      </datalist>
      <button type="submit" disabled={state === "scanning"}>
        {state === "scanning" ? "Scanning… (~20s)" : "Scan it"}
      </button>
      {state === "error" && <p className="error">{error}</p>}
    </form>
  );
}
