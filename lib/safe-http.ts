import { lookup, type LookupAddress } from "node:dns";
import { BlockList, isIP } from "node:net";
import { Agent, fetch as undiciFetch } from "undici";

const MAX_REDIRECTS = 5;
const STANDARD_PORTS = new Set(["", "80", "443"]);
const BLOCKED_V6 = new BlockList();
for (const [network, prefix] of [
  ["::", 96], ["::ffff:0:0", 96], ["64:ff9b::", 96], ["64:ff9b:1::", 48],
  ["100::", 64], ["2001:2::", 48], ["2001:10::", 28], ["2001:20::", 28],
  ["2001:db8::", 32], ["2002::", 16], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8],
] as const) BLOCKED_V6.addSubnet(network, prefix, "ipv6");

export interface SafeFetchOptions {
  method?: "GET" | "HEAD" | "POST";
  headers?: Record<string, string>;
  body?: string;
  timeoutMs: number;
  maxBodyBytes: number;
}

export interface SafeFetchResult {
  ok: boolean;
  status: number;
  contentType: string;
  body: string;
  finalUrl: string;
  headers: Headers;
  error?: string;
}

function ipv4Number(address: string): number | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;
  const octets = parts.map(Number);
  if (octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return (((octets[0] << 24) >>> 0) + (octets[1] << 16) + (octets[2] << 8) + octets[3]) >>> 0;
}

function inV4Cidr(value: number, base: string, prefix: number): boolean {
  const start = ipv4Number(base);
  if (start == null) return false;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (value & mask) === (start & mask);
}

/** Public internet addresses only. Documentation, benchmark, multicast,
 * loopback, link-local, carrier-grade NAT, and private ranges are refused. */
export function isPublicIp(address: string): boolean {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, "").split("%")[0];
  const family = isIP(normalized);
  if (family === 4) {
    const value = ipv4Number(normalized);
    if (value == null) return false;
    const blocked: [string, number][] = [
      ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
      ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
      ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
      ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
    ];
    return !blocked.some(([base, prefix]) => inV4Cidr(value, base, prefix));
  }
  if (family === 6) {
    return normalized !== "::1" && !BLOCKED_V6.check(normalized, "ipv6");
  }
  return false;
}

/** Syntactic validation happens before DNS; the same checks run again for
 * every redirect. Only standard public-web ports are within scanner scope. */
export function validatePublicUrl(input: string): URL {
  const url = new URL(input);
  if (url.protocol !== "https:" && url.protocol !== "http:")
    throw new Error("Only http(s) targets can be scanned.");
  if (url.username || url.password) throw new Error("URLs with credentials cannot be scanned.");
  if (!STANDARD_PORTS.has(url.port)) throw new Error("Only standard web ports can be scanned.");
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!host || host === "localhost" || host.endsWith(".local") || host.endsWith(".internal"))
    throw new Error("Private and internal hosts cannot be scanned.");
  if (isIP(host) && !isPublicIp(host)) throw new Error("Private and internal hosts cannot be scanned.");
  if (!isIP(host) && !host.includes(".")) throw new Error("Private and internal hosts cannot be scanned.");
  return url;
}

async function readBoundedBody(response: Response, maxBodyBytes: number): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (size < maxBodyBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      const remaining = maxBodyBytes - size;
      const chunk = value.byteLength > remaining ? value.slice(0, remaining) : value;
      chunks.push(chunk);
      size += chunk.byteLength;
      if (value.byteLength > remaining) break;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const joined = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(joined);
}

function createSafeDispatcher() {
  return new Agent({
    connect: {
      lookup(hostname, _options, callback) {
        lookup(hostname, { all: true, verbatim: true }, (error, addresses) => {
          if (error) return callback(error, "", 4);
          if (addresses.length === 0 || addresses.some((a) => !isPublicIp(a.address))) {
            const denied = new Error("Target DNS resolved to a private or reserved address.");
            return callback(denied, "", 4);
          }
          const selected = addresses[0];
          callback(null, selected.address, selected.family);
        });
      },
    },
  });
}

export async function resolvePublicHost(input: string): Promise<{ url: URL; address: string; family: 4 | 6 }> {
  const url = validatePublicUrl(input);
  if (isIP(url.hostname)) return { url, address: url.hostname, family: isIP(url.hostname) as 4 | 6 };
  const addresses = await new Promise<LookupAddress[]>((resolve, reject) => {
    lookup(url.hostname, { all: true, verbatim: true }, (error, results) => error ? reject(error) : resolve(results));
  });
  if (addresses.length === 0 || addresses.some((result) => !isPublicIp(result.address))) {
    throw new Error("Target DNS resolved to a private or reserved address.");
  }
  return { url, address: addresses[0].address, family: addresses[0].family === 6 ? 6 : 4 };
}

export async function safeFetchText(input: string, options: SafeFetchOptions): Promise<SafeFetchResult> {
  let current = validatePublicUrl(input);
  const targetSite = current.hostname.toLowerCase().replace(/^www\./, "");
  const method = options.method ?? "GET";

  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);
    const dispatcher = createSafeDispatcher();
    try {
      const response = await undiciFetch(current, {
        method,
        headers: options.headers,
        body: method === "POST" ? options.body : undefined,
        redirect: "manual",
        signal: controller.signal,
        dispatcher,
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) throw new Error(`Redirect ${response.status} had no Location header.`);
        if (redirect === MAX_REDIRECTS) throw new Error("Too many redirects.");
        const next = validatePublicUrl(new URL(location, current).toString());
        if (next.hostname.toLowerCase().replace(/^www\./, "") !== targetSite)
          throw new Error("Redirects to a different site are not allowed.");
        if (method === "POST" && next.origin !== current.origin)
          throw new Error("Cross-origin redirects are not allowed for POST requests.");
        current = next;
        continue;
      }
      const body = method === "HEAD" ? "" : await readBoundedBody(response as unknown as Response, options.maxBodyBytes);
      const responseHeaders = new Headers();
      response.headers.forEach((value, key) => responseHeaders.set(key, value));
      return {
        ok: response.ok,
        status: response.status,
        contentType: response.headers.get("content-type") ?? "",
        body,
        finalUrl: current.toString(),
        headers: responseHeaders,
      };
    } catch (error) {
      return {
        ok: false,
        status: 0,
        contentType: "",
        body: "",
        finalUrl: current.toString(),
        headers: new Headers(),
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      clearTimeout(timer);
      await dispatcher.close().catch(() => {});
    }
  }
  throw new Error("Unreachable redirect state.");
}
