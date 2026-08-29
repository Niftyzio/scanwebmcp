"use client";

import { useState } from "react";

export default function ScanForm() {
  const [url, setUrl] = useState("");
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
        body: JSON.stringify({ url: url.trim() }),
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
      <button type="submit" disabled={state === "scanning"}>
        {state === "scanning" ? "Scanning… (~20s)" : "Scan it"}
      </button>
      {state === "error" && <p className="error">{error}</p>}
    </form>
  );
}
