import { describe, expect, it } from "vitest";
import type { LookupAddress, LookupAllOptions } from "node:dns";
import { createSafeLookup, isPublicIp, validatePublicUrl } from "./safe-http";

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

describe("safe DNS lookup", () => {
  const publicAddresses: LookupAddress[] = [
    { address: "2606:4700:4700::1111", family: 6 },
    { address: "1.1.1.1", family: 4 },
  ];
  const resolver = (
    _hostname: string,
    _options: LookupAllOptions,
    callback: (error: NodeJS.ErrnoException | null, addresses: LookupAddress[]) => void,
  ) => callback(null, publicAddresses);

  it("returns an address array when the caller requests all addresses", async () => {
    const safeLookup = createSafeLookup(resolver);
    const result = await new Promise<string | LookupAddress[]>((resolve, reject) => {
      safeLookup("example.com", { all: true }, (error, addresses) =>
        error ? reject(error) : resolve(addresses));
    });

    expect(result).toEqual(publicAddresses);
  });

  it("returns one address and family for the single-address contract", async () => {
    const safeLookup = createSafeLookup(resolver);
    const result = await new Promise<{ address: string | LookupAddress[]; family?: number }>((resolve, reject) => {
      safeLookup("example.com", { all: false }, (error, address, family) =>
        error ? reject(error) : resolve({ address, family }));
    });

    expect(result).toEqual({ address: publicAddresses[0].address, family: 6 });
  });

  it("rejects the complete DNS answer if any address is private", async () => {
    const unsafeResolver = (
      _hostname: string,
      _options: LookupAllOptions,
      callback: (error: NodeJS.ErrnoException | null, addresses: LookupAddress[]) => void,
    ) => callback(null, [...publicAddresses, { address: "127.0.0.1", family: 4 }]);
    const safeLookup = createSafeLookup(unsafeResolver);

    await expect(new Promise((resolve, reject) => {
      safeLookup("example.com", { all: true }, (error, addresses) =>
        error ? reject(error) : resolve(addresses));
    })).rejects.toThrow(/private or reserved/);
  });
});
