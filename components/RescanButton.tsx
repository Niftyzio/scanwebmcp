"use client";

import { useState } from "react";

export default function RescanButton({ domain }: { domain: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  return (
    <span className="rescan-control">
      <button
        className="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setMessage("");
          try {
            const res = await fetch("/api/scan", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ url: domain, rescan: true }),
            });
            const j = await res.json();
            if (!res.ok) {
              setMessage(j.error ?? "The re-scan could not be started.");
              setBusy(false);
              return;
            }
            if (j.cached) {
              const checked = j.cachedAt ? new Date(j.cachedAt).toLocaleString() : "recently";
              const retry = j.freshScanAvailableAt
                ? ` A fresh scan is available after ${new Date(j.freshScanAvailableAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`
                : "";
              setMessage(`No new scan ran: this report was generated ${checked}.${retry}`);
              setBusy(false);
              return;
            }
            location.href = `/scan/${j.slug}`;
          } catch {
            setMessage("The re-scan could not be started. Please try again.");
            setBusy(false);
          }
        }}
      >
        {busy ? "Re-scanning… (~20s)" : `Re-scan ${domain}`}
      </button>
      {message ? <small className="rescan-message" role="status">{message}</small> : null}
    </span>
  );
}
