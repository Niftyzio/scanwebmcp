import { describe, expect, it } from "vitest";
import {
  CACHE_WINDOW_MS,
  RESCAN_COOLDOWN_MS,
  cacheWindowForTrigger,
  freshScanAvailableAt,
  slugify,
} from "./scan-service";

describe("result slugs", () => {
  it("keeps bare and www hosts distinct", () => {
    expect(slugify("example.com")).toBe("example.com");
    expect(slugify("www.example.com")).toBe("www.example.com");
  });
});

describe("scan freshness", () => {
  it("uses the short safety cooldown for every explicit human scan", () => {
    expect(cacheWindowForTrigger("user")).toBe(RESCAN_COOLDOWN_MS);
    expect(cacheWindowForTrigger("rescan")).toBe(RESCAN_COOLDOWN_MS);
  });

  it("retains the wider cache for agent and corpus traffic", () => {
    expect(cacheWindowForTrigger("agent")).toBe(CACHE_WINDOW_MS);
    expect(cacheWindowForTrigger("seed")).toBe(CACHE_WINDOW_MS);
  });

  it("reports exactly when a fresh scan becomes available", () => {
    expect(freshScanAvailableAt("2026-08-30T12:00:00.000Z"))
      .toBe("2026-08-30T13:00:00.000Z");
    expect(freshScanAvailableAt("2026-08-30T12:00:00.000Z", CACHE_WINDOW_MS))
      .toBe("2026-08-31T12:00:00.000Z");
  });
});
