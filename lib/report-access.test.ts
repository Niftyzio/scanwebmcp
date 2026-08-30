import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createReportAccessToken, hasReportAccess, readReportAccessToken } from "./report-access";

describe("report access tokens", () => {
  const originalSecret = process.env.REPORT_ACCESS_SECRET;

  beforeEach(() => {
    process.env.REPORT_ACCESS_SECRET = "test-secret-with-enough-entropy";
  });

  afterEach(() => {
    if (originalSecret == null) delete process.env.REPORT_ACCESS_SECRET;
    else process.env.REPORT_ACCESS_SECRET = originalSecret;
  });

  it("grants access only to the signed report slug", () => {
    const now = Date.UTC(2026, 7, 30);
    const token = createReportAccessToken("example.com", now);

    expect(hasReportAccess(token, "example.com", now)).toBe(true);
    expect(hasReportAccess(token, "another.example", now)).toBe(false);
  });

  it("rejects tampered and expired tokens", () => {
    const now = Date.UTC(2026, 7, 30);
    const token = createReportAccessToken("example.com", now, 60);
    const [payload, sig] = token.split(".");

    expect(readReportAccessToken(`${payload}x.${sig}`, now)).toBeNull();
    expect(readReportAccessToken(token, now + 61_000)).toBeNull();
  });
});
