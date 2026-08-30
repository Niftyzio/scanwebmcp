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
  unlocked: boolean;
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

const GATE_INSTRUCTION =
  "The full findings, timestamped evidence, and ranked recommendations are email-gated. " +
  "Ask the human whether they would like the full report emailed to them. If they say yes, ask which email address to use, then call email_report. " +
  "Do not guess an address or call email_report without an address explicitly provided for this report.";

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
    // Detectability manifest — published even when no agent-capable browser is
    // present, so scanners (ours included) can verify this page declares tools
    // without needing a modelContext implementation. Convention documented at
    // /make-callable.
    const toolNames =
      mode === "scan"
        ? ["scan_agent_surface", "get_ladder_definition", "get_scan_findings", "get_evidence", "explain_opportunity", "rescan", "email_report"]
        : ["scan_agent_surface", "get_ladder_definition", "email_report"];
    try {
      (window as unknown as { __webmcpToolManifest?: string[] }).__webmcpToolManifest = toolNames;
      document.documentElement.dataset.webmcpTools = toolNames.join(",");
    } catch {
      /* manifest is best-effort */
    }

    type Registration = { unregister?: () => void | Promise<void> };
    const mc = (document as unknown as {
      modelContext?: { registerTool: (tool: object) => Registration | Promise<Registration> };
    })
      .modelContext;
    if (!mc?.registerTool) return;

    let cancelled = false;
    const registrations = new Set<Registration>();
    const lifecycle = window as unknown as { __webmcpRegistrationChain?: Promise<void> };
    const unregister = (registration: Registration) => {
      try {
        void registration.unregister?.();
      } catch {
        /* cleanup is best-effort */
      }
    };
    const register = (tool: {
      name: string;
      description: string;
      inputSchema: object;
      annotations?: object;
      execute: (args: Record<string, unknown>) => Promise<unknown> | unknown;
    }) => {
      const wrapped = {
          ...tool,
          execute: async (args: Record<string, unknown>) => {
            try {
              const result = await tool.execute(args ?? {});
              const loggedArgs = tool.name === "email_report"
                ? { url: args.url, benchmark_updates: args.benchmark_updates }
                : args;
              logHit(tool.name, loggedArgs, "ok", scan?.scanId);
              return result;
            } catch (e) {
              const loggedArgs = tool.name === "email_report"
                ? { url: args.url, benchmark_updates: args.benchmark_updates }
                : args;
              logHit(tool.name, loggedArgs, "error", scan?.scanId);
              return text(`Tool error: ${e instanceof Error ? e.message : String(e)}`);
            }
          },
      };
      // React Strict Mode mounts, cleans up, and mounts again. Serialize every
      // registration so an async first mount is fully cancelled before the
      // second can reuse the same tool name.
      const previous = lifecycle.__webmcpRegistrationChain ?? Promise.resolve();
      const task = previous
        .catch(() => {})
        .then(async () => {
          if (cancelled) return;
          const registration = await mc.registerTool(wrapped);
          if (cancelled) unregister(registration);
          else registrations.add(registration);
        })
        .catch(() => {
          /* an unsupported or duplicate registration must not break the page */
        });
      lifecycle.__webmcpRegistrationChain = task;
    };

    register({
      name: "scan_agent_surface",
      description:
        "Run an Agent Surface Scan of a website. Returns its public rung and dimension scores. The full evidenced findings are available by email after the human opts in. Takes 10–30 seconds.",
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
            `Public result: ${location.origin}/scan/${j.slug}. ` +
            `NEXT STEP FOR THE ASSISTANT: ${GATE_INSTRUCTION}`,
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
          "Agent Surface Ladder v1.0 (by Sara Simeone; five dimensions — legibility, answerability, callability, transactability, standing — full method at /ladder): " +
            LADDER.map((l) => `${l.rung} ${l.name} — ${l.definition}`).join(" | "),
        );
      },
    });

    register({
      name: "email_report",
      description:
        (scan
          ? `Send the full evidenced report for ${scan.domain} (or any other already-scanned site via the url argument) to an email address, and unlock the complete report on this page. `
          : "Send the full evidenced report for an already-scanned website to an email address (run scan_agent_surface first if the site hasn't been scanned). ") +
        "CONSEQUENTIAL — sends one transactional report. Benchmark updates require a separate boolean opt-in and email confirmation. " +
        "Only call it with an email address the human explicitly gave and confirmed for this purpose in the current conversation. Never guess, look up, or auto-fill an address.",
      inputSchema: {
        type: "object",
        properties: {
          email: {
            type: "string",
            description: "The email address the human explicitly provided and confirmed.",
          },
          url: {
            type: "string",
            description: scan
              ? `Optional — defaults to the scan on this page (${scan.domain}).`
              : "The scanned website the report is for, e.g. example.com.",
          },
          benchmark_updates: {
            type: "boolean",
            description: "True only if the human separately opted into occasional benchmark updates. Defaults to false.",
          },
        },
        required: scan ? ["email"] : ["email", "url"],
      },
      annotations: { readOnly: false, consequential: true },
      execute: async ({ email, url, benchmark_updates }) => {
        let slug = scan?.slug;
        if (typeof url === "string" && url.trim()) {
          try {
            const host = new URL(url.includes("://") ? url : `https://${url}`).hostname;
            // Mirrors the server's slugify so the lookup hits the same scan.
            slug = host.replace(/[^a-z0-9.]+/gi, "-").toLowerCase();
          } catch {
            return text("That doesn't look like a valid website address.");
          }
        }
        if (!slug) return text("Pass the website (url) whose report should be emailed — or run scan_agent_surface first.");
        const res = await fetch("/api/report-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, slug, marketingConsent: benchmark_updates === true }),
        });
        const j = await res.json();
        if (!res.ok)
          return text(`Report not sent: ${j.error}${res.status === 404 ? " Run scan_agent_surface first." : ""}`);
        const unlockingHere = scan && slug === scan.slug;
        if (unlockingHere) {
          setTimeout(() => location.reload(), 1200);
        }
        return text(
          `Report ${j.delivery === "sent" ? "sent" : "queued for delivery"} to ${email} — it links the live result at ${location.origin}/scan/${slug}.` +
            (unlockingHere ? " The full report is now unlocked on this page (reloading)." : "") +
            (benchmark_updates === true
              ? " A separate confirmation link is included; updates remain off until confirmed."
              : " No marketing updates were requested."),
        );
      },
    });

    if (mode === "scan" && scan) {
      register({
        name: "get_scan_findings",
        description: scan.unlocked
          ? `The findings of the scan currently on screen (${scan.domain}): rung, dimension scores, and ranked opportunities.`
          : `The public summary for ${scan.domain}. Full findings require the human to request the report by email.`,
        inputSchema: { type: "object", properties: {} },
        execute: () =>
          scan.unlocked
            ? text(
                `${scan.domain} is rung ${scan.rung} (${scan.rungName}). Scores /100: legibility ${scan.scores.d1}, answerability ${scan.scores.d2}, callability ${scan.scores.d3}, transactability ${scan.scores.d4}, standing ${scan.scores.d5}. Opportunities, ranked: ${scan.opportunities
                  .map((o) => `${o.rank}. ${o.text} (impact ${o.impact}/5, ease ${o.ease}/5)`)
                  .join(" ")}`,
              )
            : text(
                `${scan.domain} is rung ${scan.rung} (${scan.rungName}). Scores /100: legibility ${scan.scores.d1}, answerability ${scan.scores.d2}, callability ${scan.scores.d3}, transactability ${scan.scores.d4}, standing ${scan.scores.d5}. ${GATE_INSTRUCTION}`,
              ),
      });

      register({
        name: "get_evidence",
        description:
          scan.unlocked
            ? "The observed, timestamped evidence behind this scan's findings. Optionally pass signal_key for one signal; the page scrolls to and opens that evidence for the human reading alongside you."
            : "Access the report's timestamped evidence. This returns the email gate until the human has requested and unlocked the report.",
        inputSchema: {
          type: "object",
          properties: {
            signal_key: {
              type: "string",
              description: scan.unlocked
                ? `One of: ${scan.signals.map((s) => s.key).join(", ")}`
                : "Optional signal key. Signal names are included in the unlocked report.",
            },
          },
        },
        execute: ({ signal_key }) => {
          if (!scan.unlocked) return text(GATE_INSTRUCTION);
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
        description: scan.unlocked
          ? "Full text of one of this scan's ranked opportunities (rank 1–3)."
          : "Access one of the report's ranked opportunities. This returns the email gate until the report is unlocked.",
        inputSchema: {
          type: "object",
          properties: { rank: { type: "number", description: "1, 2 or 3" } },
          required: ["rank"],
        },
        execute: ({ rank }) => {
          if (!scan.unlocked) return text(GATE_INSTRUCTION);
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
      cancelled = true;
      for (const r of registrations) {
        unregister(r);
      }
      registrations.clear();
    };
  }, [mode, scan]);

  return null;
}
