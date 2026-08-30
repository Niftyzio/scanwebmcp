import { describe, expect, it } from "vitest";
import { summarizeLiveWebMCP } from "./report-summary";

describe("public report WebMCP summary", () => {
  it("reports witnessed live tools", () => {
    expect(summarizeLiveWebMCP([
      { signal_key: "webmcp_registration", value_num: null, value_text: "active_tools_found" },
      { signal_key: "webmcp_tools_found", value_num: 6, value_text: "about|share" },
    ])).toEqual({ liveCount: 6, measured: true });
  });

  it("distinguishes a measured zero from an unavailable runtime", () => {
    expect(summarizeLiveWebMCP([
      { signal_key: "webmcp_registration", value_num: null, value_text: "none_detected" },
    ])).toEqual({ liveCount: 0, measured: true });
    expect(summarizeLiveWebMCP([
      { signal_key: "webmcp_registration", value_num: null, value_text: "runtime_witness_unavailable" },
    ])).toEqual({ liveCount: 0, measured: false });
  });

  it("fails safely for missing or malformed stored counts", () => {
    expect(summarizeLiveWebMCP([
      { signal_key: "webmcp_tools_found", value_num: "not-a-number", value_text: null },
    ])).toEqual({ liveCount: 0, measured: false });
  });
});
