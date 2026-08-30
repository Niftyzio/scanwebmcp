import { describe, expect, it } from "vitest";
import { isPublicIp, validatePublicUrl } from "./safe-http";

describe("public target validation", () => {
  it.each([
    "127.0.0.1", "10.0.0.8", "100.64.0.1", "169.254.169.254",
    "172.31.0.1", "192.168.1.1", "198.51.100.4", "::1", "fc00::1",
    "fe80::1", "2001:db8::1", "::ffff:127.0.0.1",
  ])("rejects reserved address %s", (address) => expect(isPublicIp(address)).toBe(false));

  it.each(["1.1.1.1", "8.8.8.8", "2606:4700:4700::1111"])(
    "accepts public address %s",
    (address) => expect(isPublicIp(address)).toBe(true),
  );

  it("rejects credentials, internal names, and non-standard ports", () => {
    expect(() => validatePublicUrl("http://user:pass@example.com")).toThrow(/credentials/);
    expect(() => validatePublicUrl("http://service.internal")).toThrow(/Private/);
    expect(() => validatePublicUrl("https://example.com:8443")).toThrow(/standard web ports/);
  });
});
