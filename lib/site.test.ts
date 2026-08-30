import { afterEach, describe, expect, it, vi } from "vitest";

const originalBaseUrl = process.env.NEXT_PUBLIC_BASE_URL;

afterEach(() => {
  if (originalBaseUrl == null) delete process.env.NEXT_PUBLIC_BASE_URL;
  else process.env.NEXT_PUBLIC_BASE_URL = originalBaseUrl;
  vi.resetModules();
});

describe("canonical site origin", () => {
  it("normalizes a configured public origin", async () => {
    process.env.NEXT_PUBLIC_BASE_URL = "https://example.com/some/path?ignored=true";
    const { SITE_ORIGIN, siteUrl } = await import("./site");

    expect(SITE_ORIGIN).toBe("https://example.com");
    expect(siteUrl("/mcp")).toBe("https://example.com/mcp");
    expect(siteUrl("//evil.example/path")).toBe("https://example.com/evil.example/path");
  });

  it.each(["not a URL", "javascript:alert(1)", "https://user:pass@example.com"])(
    "falls back for an unsafe configured origin: %s",
    async (configured) => {
      process.env.NEXT_PUBLIC_BASE_URL = configured;
      const { SITE_ORIGIN } = await import("./site");

      expect(SITE_ORIGIN).toBe("https://scanwebmcp.vercel.app");
      vi.resetModules();
    },
  );
});
