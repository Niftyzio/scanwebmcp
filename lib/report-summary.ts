export interface ReportSignalSummaryInput {
  signal_key: string;
  value_num: number | string | null;
  value_text: string | null;
}

const MEASURED_WEBMCP_VERDICTS = new Set([
  "active_tools_found",
  "manifest_declared_unverified",
  "registration_code_unverified",
  "none_detected",
]);

/** Public-safe WebMCP headline data. Names and evidence remain in the gated report. */
export function summarizeLiveWebMCP(signals: ReportSignalSummaryInput[]): {
  liveCount: number;
  measured: boolean;
} {
  const runtime = signals.find((signal) => signal.signal_key === "webmcp_registration");
  const tools = signals.find((signal) => signal.signal_key === "webmcp_tools_found");
  const storedCount = Number(tools?.value_num ?? 0);
  return {
    liveCount: Number.isFinite(storedCount) ? Math.max(0, storedCount) : 0,
    measured: MEASURED_WEBMCP_VERDICTS.has(String(runtime?.value_text ?? "")),
  };
}
