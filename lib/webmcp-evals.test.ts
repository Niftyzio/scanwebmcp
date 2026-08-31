import { describe, expect, it } from "vitest";
import evalPack from "../evals/webmcp-agent-evals.json";
import {
  SCAN_WEBMCP_TOOL_NAMES,
  WEBMCP_TOOL_NAMES_BY_STATE,
  type WebMCPEvalSurface,
} from "./webmcp-surface";

type EvalCall = {
  functionName: string;
  arguments: Record<string, unknown>;
};

type EvalScenario = {
  id: string;
  surface: WebMCPEvalSurface;
  promptType: string;
  evaluates: string[];
  messages: { role: string; content: string }[];
  expectedCall: EvalCall[];
  prohibitedCalls: string[];
  successCriteria: string[];
  mockToolResults?: { afterCall: number; content: string }[];
};

const scenarios = evalPack.scenarios as EvalScenario[];
const prompt = (scenario: EvalScenario) => scenario.messages.map((message) => message.content).join(" ");
const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

describe("WebMCP agent eval pack", () => {
  it("stays compact, uniquely named and judge-readable", () => {
    expect(evalPack.version).toBe(1);
    expect(evalPack.guidance).toBe("https://developer.chrome.com/docs/ai/webmcp/evals");
    expect(scenarios.length).toBeGreaterThanOrEqual(8);
    expect(scenarios.length).toBeLessThanOrEqual(12);
    expect(new Set(scenarios.map((scenario) => scenario.id)).size).toBe(scenarios.length);
    for (const scenario of scenarios) {
      expect(scenario.messages.some((message) => message.role === "user" && message.content.trim())).toBe(true);
      expect(scenario.successCriteria.length).toBeGreaterThan(0);
    }
  });

  it("tracks the exact tool names shipped in every page state", () => {
    expect(evalPack.surfaces).toEqual(WEBMCP_TOOL_NAMES_BY_STATE);
    for (const scenario of scenarios) {
      const available = new Set<string>(WEBMCP_TOOL_NAMES_BY_STATE[scenario.surface]);
      for (const call of scenario.expectedCall) expect(available.has(call.functionName)).toBe(true);
      for (const tool of scenario.prohibitedCalls) expect(available.has(tool)).toBe(true);
    }
  });

  it("covers every shipped report tool and Chrome's core eval dimensions", () => {
    const expectedTools = new Set(scenarios.flatMap((scenario) => scenario.expectedCall.map((call) => call.functionName)));
    for (const tool of SCAN_WEBMCP_TOOL_NAMES) expect(expectedTools.has(tool)).toBe(true);

    const dimensions = new Set(scenarios.flatMap((scenario) => scenario.evaluates));
    for (const dimension of ["tool_selection", "parameters", "ordering", "journey_completion", "consent"]) {
      expect(dimensions.has(dimension)).toBe(true);
    }
    const promptTypes = new Set(scenarios.map((scenario) => scenario.promptType));
    expect(promptTypes).toEqual(new Set(["direct", "implicit", "multi_step", "safety"]));
  });

  it("keeps fixture arguments grounded in the user's words", () => {
    for (const scenario of scenarios) {
      const userPrompt = prompt(scenario);
      for (const call of scenario.expectedCall) {
        if (call.functionName === "scan_agent_surface") {
          expect(userPrompt).toContain(String(call.arguments.url));
        }
        if (call.functionName === "get_ladder_definition") {
          expect(call.arguments.rung).toBe(3);
        }
        if (call.functionName === "explain_opportunity") {
          expect(call.arguments.rank).toBe(2);
        }
        if (call.functionName === "email_report") {
          expect(call.arguments.email).toMatch(emailPattern);
          expect(userPrompt).toContain(String(call.arguments.email));
          if (call.arguments.benchmark_updates === true) {
            expect(userPrompt.toLowerCase()).toContain("benchmark updates");
          }
        }
      }
    }
  });

  it("requires clarification when email delivery lacks an explicit address", () => {
    const scenario = scenarios.find((candidate) => candidate.id === "email-missing-address");
    expect(scenario).toBeDefined();
    expect(prompt(scenario!)).not.toMatch(emailPattern);
    expect(scenario!.expectedCall).toEqual([]);
    expect(scenario!.prohibitedCalls).toContain("email_report");
  });

  it("encodes ordered completion and stops after a failed prerequisite", () => {
    const journey = scenarios.find((scenario) => scenario.id === "scan-then-email-ordered-journey");
    expect(journey?.expectedCall.map((call) => call.functionName)).toEqual([
      "scan_agent_surface",
      "email_report",
    ]);
    expect(journey?.expectedCall[1].arguments.benchmark_updates).toBe(false);

    const failure = scenarios.find((scenario) => scenario.id === "stop-after-scan-failure");
    expect(failure?.mockToolResults?.[0].afterCall).toBe(0);
    expect(failure?.expectedCall.map((call) => call.functionName)).toEqual(["scan_agent_surface"]);
    expect(failure?.prohibitedCalls).toContain("email_report");
  });
});
