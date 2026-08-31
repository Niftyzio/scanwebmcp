"use client";

import { useEffect } from "react";
import {
  boundedWebMCPText,
  normalizeWebMCPToolMetadata,
  WEBMCP_ANNOTATIONS,
  type WebMCPToolAnnotations,
} from "@/lib/webmcp-tool-contract";
import {
  summarizeWebMCPInventoryForAgent,
  type WebMCPInventory,
} from "@/lib/webmcp-inventory";
import {
  SCAN_WEBMCP_TOOL_NAMES,
  SITE_WEBMCP_TOOL_NAMES,
} from "@/lib/webmcp-surface";
import {
  argumentsForWebMCPLogging,
  outcomeForHttpFailure,
  runTrackedWebMCPExecution,
  withWebMCPOutcome,
} from "@/lib/webmcp-execution";
import {
  selectReportEvidence,
  weakestReportDimension,
} from "@/lib/webmcp-report-tools";

/**
 * Registers this page's WebMCP tools (document.modelContext). Two surfaces:
 *  - mode="site": scan_agent_surface, get_ladder_definition, email_report
 *  - mode="scan": those plus page-state tools — the agent works on the same
 *    scan the human is looking at (get_scan_findings,
 *    get_webmcp_inventory, get_evidence, explain_opportunity, rescan), and
 *    the page visibly responds.
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
  webMCPInventory: WebMCPInventory | null;
  scores: Record<string, number>;
  opportunities: { rank: number; text: string; impact: number; ease: number }[];
  suggestedTools: {
    name: string;
    label: string;
    description: string;
    inputs: string[];
    output: string;
    confirmation: string;
    businessValue: number;
    effort: number;
    confidence: string;
    evidence: string;
  }[];
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

const text = boundedWebMCPText;
const refused = (message: string) => withWebMCPOutcome(text(message), "refused");
const failedRequest = (status: number, message: string) =>
  withWebMCPOutcome(text(message), outcomeForHttpFailure(status));

const GATE_INSTRUCTION =
  "The full findings, timestamped evidence, and ranked recommendations are email-gated. " +
  "If the human already asked for delivery and supplied an email address in this conversation, call email_report next; that direct request is sufficient confirmation for the transactional report. " +
  "Otherwise ask whether they would like the report emailed and which address to use. " +
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
        ? SCAN_WEBMCP_TOOL_NAMES
        : SITE_WEBMCP_TOOL_NAMES;
    try {
      (window as unknown as { __webmcpToolManifest?: readonly string[] }).__webmcpToolManifest = toolNames;
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
      annotations?: WebMCPToolAnnotations;
      execute: (args: Record<string, unknown>) => Promise<unknown> | unknown;
    }) => {
      const wrapped = {
        ...tool,
        ...normalizeWebMCPToolMetadata(tool),
        execute: async (args: Record<string, unknown>) => {
          const input = args ?? {};
          const loggedArgs = argumentsForWebMCPLogging(tool.name, input);
          return runTrackedWebMCPExecution({
            execute: () => tool.execute(input),
            record: (outcome) => logHit(tool.name, loggedArgs, outcome, scan?.scanId),
            formatError: (error) => text(`Tool error: ${error instanceof Error ? error.message : String(error)}`),
          });
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
        "Run an Agent Surface Scan of a website. Returns its public rung and scores. In a scan-and-email request, call this first and email_report only after it succeeds. Takes 10–30 seconds.",
      inputSchema: {
        type: "object",
        properties: { url: { type: "string", description: "The website to scan, e.g. example.com" } },
        required: ["url"],
      },
      annotations: WEBMCP_ANNOTATIONS.scan,
      execute: async ({ url }) => {
        const res = await fetch("/api/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, requester: "agent" }),
        });
        const j = await res.json();
        if (!res.ok) return failedRequest(res.status, `Scan refused: ${j.error}`);
        const detailResponse = await fetch(`/api/scan/${j.slug}`);
        const detail = await detailResponse.json();
        if (!detailResponse.ok) {
          return failedRequest(detailResponse.status, `Scan completed but its public result could not be read: ${detail.error}`);
        }
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
      annotations: WEBMCP_ANNOTATIONS.localReadOnly,
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
        "A direct request to send this report to an address the human supplied is sufficient confirmation for the transactional email. Never guess, look up, or auto-fill an address.",
      inputSchema: {
        type: "object",
        properties: {
          email: {
            type: "string",
            description: "The address the human directly requested for this report.",
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
      annotations: WEBMCP_ANNOTATIONS.sendEmail,
      execute: async ({ email, url, benchmark_updates }) => {
        let slug = scan?.slug;
        if (typeof url === "string" && url.trim()) {
          try {
            const host = new URL(url.includes("://") ? url : `https://${url}`).hostname;
            // Mirrors the server's slugify so the lookup hits the same scan.
            slug = host.replace(/[^a-z0-9.]+/gi, "-").toLowerCase();
          } catch {
            return refused("That doesn't look like a valid website address.");
          }
        }
        if (!slug) return refused("Pass the website (url) whose report should be emailed — or run scan_agent_surface first.");
        const res = await fetch("/api/report-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, slug, marketingConsent: benchmark_updates === true }),
        });
        const j = await res.json();
        if (!res.ok)
          return failedRequest(
            res.status,
            `Report not sent: ${j.error}${res.status === 404 ? " Run scan_agent_surface first." : ""}`,
          );
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
        annotations: WEBMCP_ANNOTATIONS.externalReadOnly,
        execute: () => {
          const weakest = weakestReportDimension(scan.scores);
          return scan.unlocked
            ? text(
                `${scan.domain} is rung ${scan.rung} (${scan.rungName}). Scores /100: legibility ${scan.scores.d1}, answerability ${scan.scores.d2}, callability ${scan.scores.d3}, transactability ${scan.scores.d4}, standing ${scan.scores.d5}. Weakest dimension: ${weakest.code} ${weakest.label} (${scan.scores[weakest.score]}/100); call get_evidence with dimension ${weakest.code} to inspect it. Opportunities, ranked: ${scan.opportunities
                  .map((o) => `${o.rank}. ${o.text} (impact ${o.impact}/5, ease ${o.ease}/5)`)
                  .join(" ")}`,
              )
            : text(
                `${scan.domain} is rung ${scan.rung} (${scan.rungName}). Scores /100: legibility ${scan.scores.d1}, answerability ${scan.scores.d2}, callability ${scan.scores.d3}, transactability ${scan.scores.d4}, standing ${scan.scores.d5}. ${GATE_INSTRUCTION}`,
              );
        },
      });

      register({
        name: "get_recommended_tools",
        description: scan.unlocked
          ? `The two strongest evidence-backed agent tools this scan recommends for ${scan.domain}, including inputs, outputs, human-confirmation requirements, value, effort and confidence.`
          : `Access the recommended agent tools for ${scan.domain}. This returns the email gate until the report is unlocked.`,
        inputSchema: { type: "object", properties: {} },
        annotations: WEBMCP_ANNOTATIONS.externalReadOnly,
        execute: () => {
          if (!scan.unlocked) return refused(GATE_INSTRUCTION);
          document.getElementById("tool-blueprint")?.scrollIntoView({ behavior: "smooth", block: "start" });
          if (scan.suggestedTools.length === 0)
            return text("The public scan did not reach enough capability evidence to make a responsible tool recommendation.");
          return text(scan.suggestedTools.map((tool, index) =>
            `${index + 1}. ${tool.name} — ${tool.description} Inputs: ${tool.inputs.join(", ")}. Returns: ${tool.output}. Human control: ${tool.confirmation}. Value ${tool.businessValue}/5, effort ${tool.effort}/5, ${tool.confidence.toLowerCase()} confidence. Evidence: ${tool.evidence}`,
          ).join(" | "));
        },
      });

      register({
        name: "get_webmcp_inventory",
        description: scan.unlocked
          ? `The live WebMCP tools observed across the scanned pages for ${scan.domain}: classification, first observed page, inputs, page-dependent behavior, and missing contract metadata. The page opens the matching evidence.`
          : `Access the live WebMCP tool inventory for ${scan.domain}. This returns the email gate until the report is unlocked.`,
        inputSchema: { type: "object", properties: {} },
        annotations: WEBMCP_ANNOTATIONS.externalReadOnly,
        execute: () => {
          if (!scan.unlocked) return refused(GATE_INSTRUCTION);
          const inventoryEvidence = document.getElementById("evidence-webmcp_tools_found")
            ?? document.getElementById("evidence-webmcp_registration");
          if (inventoryEvidence instanceof HTMLDetailsElement) inventoryEvidence.open = true;
          inventoryEvidence?.scrollIntoView({ behavior: "smooth", block: "center" });
          if (!scan.webMCPInventory)
            return refused(`${scan.domain}: this older scan has no structured WebMCP inventory. Run rescan to measure the current page-aware tool surface.`);
          return text(summarizeWebMCPInventoryForAgent(scan.domain, scan.webMCPInventory));
        },
      });

      register({
        name: "get_evidence",
        description:
          scan.unlocked
            ? "The timestamped evidence behind this scan. Pass signal_key or dimension D1-D5; omit both for the weakest dimension. The page opens and scrolls to the evidence."
            : "Access the report's timestamped evidence. This returns the email gate until the human has requested and unlocked the report.",
        inputSchema: {
          type: "object",
          properties: {
            signal_key: {
              type: "string",
              description: scan.unlocked
                ? "Optional exact signal key. Omit both inputs to inspect the weakest dimension."
                : "Optional signal key. Signal names are included in the unlocked report.",
            },
            dimension: {
              type: "string",
              description: "Optional D1-D5 dimension. Omit both inputs to inspect the weakest dimension.",
            },
          },
        },
        annotations: WEBMCP_ANNOTATIONS.externalReadOnly,
        execute: ({ signal_key, dimension }) => {
          if (!scan.unlocked) return refused(GATE_INSTRUCTION);
          const openEvidence = (signal: ScanData["signals"][number]) => {
            const element = document.getElementById(`evidence-${signal.key}`);
            if (element instanceof HTMLDetailsElement) element.open = true;
            element?.scrollIntoView({ behavior: "smooth", block: "center" });
          };
          const selection = selectReportEvidence({
            scores: scan.scores,
            signals: scan.signals,
            signalKey: signal_key,
            dimension,
          });
          if (!selection.ok) return refused(selection.message);
          if (typeof signal_key === "string" && signal_key) {
            const s = selection.signals[0];
            openEvidence(s);
            return text(
              `${s.key} (${s.dimension}) = ${s.value}${s.detail ? ` [${s.detail}]` : ""}. Observed at ${s.observedAt} on ${s.evidenceUrl}.${s.evidenceSnippet ? ` What the agent saw: "${s.evidenceSnippet}"` : ""}`,
            );
          }
          openEvidence(selection.signals[0]);
          return text(
            `${selection.focus} evidence: ` + selection.signals
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
        annotations: WEBMCP_ANNOTATIONS.externalReadOnly,
        execute: ({ rank }) => {
          if (!scan.unlocked) return refused(GATE_INSTRUCTION);
          const o = scan.opportunities.find((x) => x.rank === rank);
          if (!o) return refused(`This scan has ${scan.opportunities.length} opportunities; rank ${rank} doesn't exist.`);
          const el = document.getElementById(`opportunity-${o.rank}`);
          el?.scrollIntoView({ behavior: "smooth", block: "center" });
          return text(`Opportunity ${o.rank} (impact ${o.impact}/5, ease ${o.ease}/5): ${o.text}`);
        },
      });

      register({
        name: "rescan",
        description: `Run a fresh scan of ${scan.domain} now and reload this page with the new result. Use when the site has changed since ${scan.signals[0]?.observedAt ?? "the last scan"}.`,
        inputSchema: { type: "object", properties: {} },
        annotations: WEBMCP_ANNOTATIONS.scan,
        execute: async () => {
          const res = await fetch("/api/scan", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: scan.domain, rescan: true, requester: "agent" }),
          });
          const j = await res.json();
          if (!res.ok) return failedRequest(res.status, `Re-scan refused: ${j.error}`);
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
