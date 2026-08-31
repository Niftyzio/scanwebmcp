import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = {
  emailFrom: process.env.EMAIL_FROM,
  resendApiKey: process.env.RESEND_API_KEY,
  reportAccessSecret: process.env.REPORT_ACCESS_SECRET,
  baseUrl: process.env.NEXT_PUBLIC_BASE_URL,
};

function restoreEnv(name: string, value: string | undefined) {
  if (value == null) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  restoreEnv("EMAIL_FROM", ORIGINAL_ENV.emailFrom);
  restoreEnv("RESEND_API_KEY", ORIGINAL_ENV.resendApiKey);
  restoreEnv("REPORT_ACCESS_SECRET", ORIGINAL_ENV.reportAccessSecret);
  restoreEnv("NEXT_PUBLIC_BASE_URL", ORIGINAL_ENV.baseUrl);
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("transactional email branding", () => {
  it("uses ScanWebMCP.com for the sender and every generated link", async () => {
    delete process.env.EMAIL_FROM;
    process.env.RESEND_API_KEY = "test-resend-key";
    process.env.REPORT_ACCESS_SECRET = "test-report-access-secret";
    process.env.NEXT_PUBLIC_BASE_URL = "https://scanwebmcp.vercel.app";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const { sendMarketingConfirmationEmail, sendReportEmail } = await import("./email");

    await sendReportEmail({
      to: "owner@example.com",
      domain: "example.com",
      slug: "example.com",
      composite: 42,
      verdict: "Answerable",
      deliveryKey: "delivery-1",
      marketingConfirmationToken: "confirmation-token",
    });
    await sendMarketingConfirmationEmail({
      to: "owner@example.com",
      domain: "example.com",
      token: "confirmation-token",
      deliveryKey: "delivery-1",
    });

    const reportBody = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    const confirmationBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(reportBody.from).toBe("ScanWebMCP.com <scan@nocodelab.ai>");
    expect(reportBody.subject).toContain("Your ScanWebMCP.com report");
    expect(reportBody.text).toContain("https://www.scanwebmcp.com/api/report-access?token=");
    expect(reportBody.text).toContain("https://www.scanwebmcp.com/api/confirm-updates?token=");
    expect(confirmationBody.text).toContain("https://www.scanwebmcp.com/api/confirm-updates?token=");
    expect(JSON.stringify([reportBody, confirmationBody])).not.toContain("scanwebmcp.vercel.app");
  });
});
