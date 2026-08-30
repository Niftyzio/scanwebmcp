"use client";

import { useState } from "react";
import { SECTOR_TAXONOMY, BENCHMARKED_SLUGS } from "@/lib/sectors";

export default function ScanForm() {
  const [url, setUrl] = useState("");
  const [industry, setIndustry] = useState("");
  const [state, setState] = useState<"idle" | "scanning" | "error">("idle");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setState("scanning");
    setError("");
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), ...(industry ? { sector: industry } : {}) }),
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
      {/* Native select: the OS picker works everywhere, including mobile,
          where datalist search is unusable. Benchmarked sectors first; the
          long tail stays selectable so sector demand keeps being recorded. */}
      <select
        value={industry}
        onChange={(e) => setIndustry(e.target.value)}
        disabled={state === "scanning"}
        aria-label="Your industry (optional, sharpens the comparison)"
      >
        <option value="">Your industry (optional)</option>
        <optgroup label="Benchmarked sectors">
          {BENCHMARKED_SLUGS.map((slug) => {
            const s = SECTOR_TAXONOMY.find((t) => t.slug === slug);
            return s ? (
              <option key={s.slug} value={s.slug}>
                {s.label}
              </option>
            ) : null;
          })}
        </optgroup>
        <optgroup label="More industries">
          {SECTOR_TAXONOMY.filter((s) => !BENCHMARKED_SLUGS.includes(s.slug)).map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.label}
            </option>
          ))}
        </optgroup>
      </select>
      <button type="submit" disabled={state === "scanning"}>
        {state === "scanning" ? "Scanning… (~20s)" : "Scan it"}
      </button>
      {state === "error" && <p className="error">{error}</p>}
    </form>
  );
}
