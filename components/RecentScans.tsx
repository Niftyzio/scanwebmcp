"use client";

import { useEffect, useState } from "react";
import { readRecentScans, type RecentScan } from "./RememberScan";

/** The visitor's own past results — every result page stays live at its link,
 *  and this list makes sure losing the tab never means losing the report. */
export default function RecentScans() {
  const [scans, setScans] = useState<RecentScan[]>([]);
  useEffect(() => setScans(readRecentScans()), []);
  if (scans.length === 0) return null;

  return (
    <section className="recent-scans" aria-labelledby="recent">
      <h2 id="recent">Your scans</h2>
      <p className="muted small">
        Every result stays live at its link — bookmark it, share it, re-scan it any time.
      </p>
      <ul>
        {scans.map((s) => (
          <li key={s.slug}>
            <a href={`/scan/${s.slug}`}>
              <strong>{s.domain}</strong>
              {s.composite != null && <span className="recent-score">{s.composite}/100</span>}
              <span className="muted small"> · {s.verdict}</span>
              <span className="muted small recent-date">
                {new Date(s.at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
