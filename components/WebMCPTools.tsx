"use client";

import { useEffect } from "react";

/**
 * Registers this page's WebMCP tools (document.modelContext). Two surfaces:
 *  - mode="site": scan_agent_surface, get_ladder_definition
 *  - mode="scan": those plus page-state tools — the agent works on the same
 *    scan the human is looking at (get_scan_findings, get_evidence,
 *    explain_opportunity, rescan), and the page visibly responds.
 *
 * Feature-detects document.modelContext only (the navigator alias is
 * deprecated). Every invocation is logged to /api/agent-hit — including on
 * pages where modelContext is absent, nothing is registered and nothing runs.
 */

type ScanData = {
  scanId: number;
  domain: string;
  slug: string;
  rung: number;
  rungName: string;
  scores: Record<string, number>;
  opportunities: { rank: number; text: string; impact: number; ease: number }[];
  signals: {
    dimension: string;
    key: string;
    value: string | number | boolean | null;
    detail: string | null;
    evidenceUrl: string;
    evidenceSnippet: string | null;
    observedAt: string;
  }[];
};

const LADDER = [
  { rung: 0, name: "Invisible", definition: "Agents are blocked in robots.txt, or core content does not exist without JavaScript. Agents cannot reliably read the site at all." },
  { rung: 1, name: "Readable", definition: "An agent can retrieve the pages and understand what the business does." },
  { rung: 2, name: "Answerable", definition: "An agent can answer a buyer's real questions — offering, audience, price band, availability — without a human." },
  { rung: 3, name: "Callable", definition: "At least one capability is invocable: an MCP endpoint, a documented API, or a registered WebMCP tool." },
  { rung: 4, name: "Transactable", definition: "An agent can complete a meaningful action end to end — book, order, submit — with human confirmation rather than human labour." },
];

const text = (t: string) => ({ content: [{ type: "text", text: t }] });

function logHit(toolName: string, args: unknown, outcome: string, scanId?: number) {
  try {
    void fetch("/api/agent-hit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toolName, arguments: args, outcome, scanId }),
    });
  } catch {
    /* logging never breaks the page */
  }
}

export default function WebMCPTools({ mode, scan }: { mode: "site" | "scan"; scan?: ScanData }) {
  useEffect(() => {
    const mc = (document as unknown as { modelContext?: { registerTool: (t: object) => unknown } })
      .modelContext;
    if (!mc?.registerTool) return;

    const registrations: unknown[] = [];
    const register = (tool: {
      name: string;
      description: string;
      inputSchema: object;
      execute: (args: Record<string, unknown>) => Promise<unknown> | unknown;
    }) => {
      try {
        const wrapped = {
          ...tool,
          execute: async (args: Record<string, unknown>) => {
            try {
              const result = await tool.execute(args ?? {});
              logHit(tool.name, args, "ok", scan?.scanId);
              return result;
            } catch (e) {
              logHit(tool.name, args, "error", scan?.scanId);
              return text(`Tool error: ${e instanceof Error ? e.message : String(e)}`);
            }
          },
        };
        registrations.push(mc.registerTool(wrapped));
      } catch {
        /* an unsupported registration must not break the page */
      }
    };

    register({
      name: "scan_agent_surface",
      description:
        "Run an Agent Surface Scan of a website. Returns its rung on the Agent Surface Ladder (Invisible → Readable → Answerable → Callable → Transactable), dimension scores, top opportunities, and the public result URL. Takes 10–30 seconds.",
      inputSchema: {
        type: "object",
        properties: { url: { type: "string", description: "The website to scan, e.g. example.com" } },
        required: ["url"],
      },
      execute: async ({ url }) => {
        const res = await fetch("/api/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, requester: "agent" }),
        });
        const j = await res.json();
        if (!res.ok) return text(`Scan refused: ${j.error}`);
        const detail = await fetch(`/api/scan/${j.slug}`).then((r) => r.json());
        return text(
          `Scan of ${detail.domain}: rung ${detail.rung} (${detail.rungName}) on the Agent Surface Ladder. ` +
            `Scores: D1 legibility ${detail.scores.d1}, D2 answerability ${detail.scores.d2}, D3 callability ${detail.scores.d3}, D4 transactability ${detail.scores.d4}, D5 standing ${detail.scores.d5}. ` +
            `Top opportunities: ${detail.opportunities.map((o: { text: string }) => o.text).join(" · ")} ` +
            `Full evidenced result: ${location.origin}/scan/${j.slug}`,
        );
      },
    });

    register({
      name: "get_ladder_definition",
      description:
        "The Agent Surface Ladder v1.0 — the published rubric this site scores against. Optionally pass a rung number (0–4) for one rung's definition.",
      inputSchema: {
        type: "object",
        properties: { rung: { type: "number", description: "Optional rung 0-4" } },
      },
      execute: ({ rung }) => {
        if (typeof rung === "number" && LADDER[rung])
          return text(`Rung ${rung} — ${LADDER[rung].name}: ${LADDER[rung].definition}`);
        return text(
          "Agent Surface Ladder v1.0 (weights: legibility 25%, answerability 30%, callability 20%, transactability 15%, standing 10%): " +
            LADDER.map((l) => `${l.rung} ${l.name} — ${l.definition}`).join(" | "),
        );
      },
    });

    if (mode === "scan" && scan) {
      register({
        name: "get_scan_findings",
        description: `The findings of the scan currently on screen (${scan.domain}): rung, dimension scores, and the ranked opportunities.`,
        inputSchema: { type: "object", properties: {} },
        execute: () =>
          text(
            `${scan.domain} is rung ${scan.rung} (${scan.rungName}). Scores /100: legibility ${scan.scores.d1}, answerability ${scan.scores.d2}, callability ${scan.scores.d3}, transactability ${scan.scores.d4}, standing ${scan.scores.d5}. Opportunities, ranked: ${scan.opportunities
              .map((o) => `${o.rank}. ${o.text} (impact ${o.impact}/5, ease ${o.ease}/5)`)
              .join(" ")}`,
          ),
      });

      register({
        name: "get_evidence",
        description:
          "The observed, timestamped evidence behind this scan's findings. Optionally pass signal_key for one signal; the page scrolls to and opens that evidence for the human reading alongside you.",
        inputSchema: {
          type: "object",
          properties: {
            signal_key: {
              type: "string",
              description: `One of: ${scan.signals.map((s) => s.key).join(", ")}`,
            },
          },
        },
        execute: ({ signal_key }) => {
          if (signal_key) {
            const s = scan.signals.find((x) => x.key === signal_key);
            if (!s) return text(`No signal named ${signal_key} in this scan.`);
            const el = document.getElementById(`evidence-${s.key}`);
            if (el instanceof HTMLDetailsElement) {
              el.open = true;
              el.scrollIntoView({ behavior: "smooth", block: "center" });
            }
            return text(
              `${s.key} (${s.dimension}) = ${s.value}${s.detail ? ` [${s.detail}]` : ""}. Observed at ${s.observedAt} on ${s.evidenceUrl}.${s.evidenceSnippet ? ` What the agent saw: "${s.evidenceSnippet}"` : ""}`,
            );
          }
          return text(
            scan.signals
              .map((s) => `${s.dimension} ${s.key}=${s.value}${s.detail ? ` (${s.detail})` : ""} @ ${s.evidenceUrl}`)
              .join(" | "),
          );
        },
      });

      register({
        name: "explain_opportunity",
        description: "Full text of one of this scan's ranked opportunities (rank 1–3).",
        inputSchema: {
          type: "object",
          properties: { rank: { type: "number", description: "1, 2 or 3" } },
          required: ["rank"],
        },
        execute: ({ rank }) => {
          const o = scan.opportunities.find((x) => x.rank === rank);
          if (!o) return text(`This scan has ${scan.opportunities.length} opportunities; rank ${rank} doesn't exist.`);
          const el = document.getElementById(`opportunity-${o.rank}`);
          el?.scrollIntoView({ behavior: "smooth", block: "center" });
          return text(`Opportunity ${o.rank} (impact ${o.impact}/5, ease ${o.ease}/5): ${o.text}`);
        },
      });

      register({
        name: "rescan",
        description: `Run a fresh scan of ${scan.domain} now and reload this page with the new result. Use when the site has changed since ${scan.signals[0]?.observedAt ?? "the last scan"}.`,
        inputSchema: { type: "object", properties: {} },
        execute: async () => {
          const res = await fetch("/api/scan", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: scan.domain, rescan: true, requester: "agent" }),
          });
          const j = await res.json();
          if (!res.ok) return text(`Re-scan refused: ${j.error}`);
          setTimeout(() => location.reload(), 1500);
          return text(`Fresh scan of ${scan.domain} complete — the page is reloading with the new result at /scan/${j.slug}.`);
        },
      });
    }

    return () => {
      for (const r of registrations) {
        try {
          (r as { unregister?: () => void })?.unregister?.();
        } catch {
          /* ignore */
        }
      }
    };
  }, [mode, scan]);

  return null;
}
