"use client";

import { useState } from "react";

export default function RescanButton({ domain }: { domain: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const res = await fetch("/api/scan", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: domain, rescan: true }),
          });
          const j = await res.json();
          if (res.ok) location.href = `/scan/${j.slug}`;
          else setBusy(false);
        } catch {
          setBusy(false);
        }
      }}
    >
      {busy ? "Re-scanning… (~20s)" : `Re-scan ${domain}`}
    </button>
  );
}
