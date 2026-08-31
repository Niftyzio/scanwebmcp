import { describe, expect, it } from "vitest";
import { selectReportEvidence, weakestReportDimension } from "./webmcp-report-tools";

const scores = { d1: 90, d2: 30, d3: 60, d4: 65, d5: 40 };
const signals = [
  { dimension: "D2", key: "faq_coverage" },
  { dimension: "D3", key: "webmcp_registration" },
  { dimension: "D3", key: "mcp_probe_path" },
];

describe("WebMCP report tool chaining", () => {
  it("identifies the weakest scored dimension", () => {
    expect(weakestReportDimension(scores)).toMatchObject({ code: "D2", label: "answerability" });
  });

  it("defaults evidence to the weakest dimension", () => {
    expect(selectReportEvidence({ scores, signals })).toEqual({
      ok: true,
      focus: "D2",
      signals: [{ dimension: "D2", key: "faq_coverage" }],
    });
  });

  it("selects a requested dimension case-insensitively", () => {
    expect(selectReportEvidence({ scores, signals, dimension: "d3" })).toEqual({
      ok: true,
      focus: "D3",
      signals: [
        { dimension: "D3", key: "webmcp_registration" },
        { dimension: "D3", key: "mcp_probe_path" },
      ],
    });
  });

  it("returns useful refusals for unknown keys and invalid dimensions", () => {
    expect(selectReportEvidence({ scores, signals, signalKey: "missing" })).toEqual({
      ok: false,
      message: "No signal named missing in this scan.",
    });
    expect(selectReportEvidence({ scores, signals, dimension: "D8" })).toEqual({
      ok: false,
      message: "Dimension must be D1, D2, D3, D4 or D5.",
    });
  });
});
