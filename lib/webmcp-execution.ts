export type WebMCPExecutionOutcome = "ok" | "refused" | "error";

const TRACKED_WEBMCP_RESULT = Symbol("tracked-webmcp-result");

type TrackedWebMCPResult<T> = {
  [TRACKED_WEBMCP_RESULT]: true;
  response: T;
  outcome: WebMCPExecutionOutcome;
};

/** Attach private telemetry state without changing the response Chrome sees. */
export function withWebMCPOutcome<T>(
  response: T,
  outcome: WebMCPExecutionOutcome,
): TrackedWebMCPResult<T> {
  return { [TRACKED_WEBMCP_RESULT]: true, response, outcome };
}

function unwrapWebMCPResult(value: unknown): {
  response: unknown;
  outcome: WebMCPExecutionOutcome;
} {
  if (
    value
    && typeof value === "object"
    && TRACKED_WEBMCP_RESULT in value
    && (value as TrackedWebMCPResult<unknown>)[TRACKED_WEBMCP_RESULT] === true
  ) {
    const tracked = value as TrackedWebMCPResult<unknown>;
    return { response: tracked.response, outcome: tracked.outcome };
  }
  return { response: value, outcome: "ok" };
}

export function outcomeForHttpFailure(status: number): WebMCPExecutionOutcome {
  return status >= 500 ? "error" : "refused";
}

export function argumentsForWebMCPLogging(
  toolName: string,
  args: Record<string, unknown>,
): Record<string, unknown> {
  return toolName === "email_report"
    ? { url: args.url, benchmark_updates: args.benchmark_updates }
    : args;
}

/** Runs one page tool, records its semantic outcome, and guarantees that the
 * private outcome envelope never leaks into the WebMCP response. */
export async function runTrackedWebMCPExecution(options: {
  execute: () => Promise<unknown> | unknown;
  record: (outcome: WebMCPExecutionOutcome) => void;
  formatError: (error: unknown) => unknown;
}): Promise<unknown> {
  try {
    const result = unwrapWebMCPResult(await options.execute());
    options.record(result.outcome);
    return result.response;
  } catch (error) {
    options.record("error");
    return options.formatError(error);
  }
}
