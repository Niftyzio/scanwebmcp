import { describe, expect, it, vi } from "vitest";
import {
  argumentsForWebMCPLogging,
  outcomeForHttpFailure,
  runTrackedWebMCPExecution,
  withWebMCPOutcome,
} from "./webmcp-execution";

describe("WebMCP execution outcomes", () => {
  it("defaults ordinary tool responses to ok", async () => {
    const record = vi.fn();
    const response = { content: [{ type: "text", text: "done" }] };

    await expect(runTrackedWebMCPExecution({
      execute: () => response,
      record,
      formatError: () => ({ error: true }),
    })).resolves.toBe(response);
    expect(record).toHaveBeenCalledWith("ok");
  });

  it("logs a refusal while returning only the public WebMCP response", async () => {
    const record = vi.fn();
    const response = { content: [{ type: "text", text: "Report not sent" }] };

    await expect(runTrackedWebMCPExecution({
      execute: () => withWebMCPOutcome(response, "refused"),
      record,
      formatError: () => ({ error: true }),
    })).resolves.toBe(response);
    expect(record).toHaveBeenCalledWith("refused");
  });

  it("logs thrown failures as errors and returns the formatted response", async () => {
    const record = vi.fn();
    const formatted = { content: [{ type: "text", text: "Tool error" }] };

    await expect(runTrackedWebMCPExecution({
      execute: () => { throw new Error("boom"); },
      record,
      formatError: () => formatted,
    })).resolves.toBe(formatted);
    expect(record).toHaveBeenCalledWith("error");
  });

  it("treats rejected requests as refusals and server failures as errors", () => {
    expect(outcomeForHttpFailure(400)).toBe("refused");
    expect(outcomeForHttpFailure(429)).toBe("refused");
    expect(outcomeForHttpFailure(500)).toBe("error");
    expect(outcomeForHttpFailure(503)).toBe("error");
  });

  it("never includes an email address in browser telemetry", () => {
    expect(argumentsForWebMCPLogging("email_report", {
      email: "person@example.org",
      url: "example.com",
      benchmark_updates: false,
    })).toEqual({ url: "example.com", benchmark_updates: false });
    expect(argumentsForWebMCPLogging("rescan", {})).toEqual({});
  });

  it("can return a useful server-failure response while recording error", async () => {
    const record = vi.fn();
    const response = { content: [{ type: "text", text: "Service unavailable" }] };
    await expect(runTrackedWebMCPExecution({
      execute: () => withWebMCPOutcome(response, "error"),
      record,
      formatError: () => ({ error: true }),
    })).resolves.toBe(response);
    expect(record).toHaveBeenCalledWith("error");
  });
});
