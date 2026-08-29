"use client";

import { useEffect } from "react";

export interface RecentScan {
  slug: string;
  domain: string;
  composite: number | null;
  verdict: string;
  at: string;
}

const KEY = "agent-scan-recent";

export function readRecentScans(): RecentScan[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as RecentScan[]) : [];
  } catch {
    return [];
  }
}

/** Renders nothing — records this result in the visitor's browser so it is
 *  always one click away from the homepage, however they navigate. */
export default function RememberScan(props: Omit<RecentScan, "at">) {
  useEffect(() => {
    try {
      const rest = readRecentScans().filter((s) => s.slug !== props.slug);
      const next = [{ ...props, at: new Date().toISOString() }, ...rest].slice(0, 10);
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // Private windows or blocked storage: the live URL still works.
    }
  }, [props.slug, props.domain, props.composite, props.verdict]);
  return null;
}
