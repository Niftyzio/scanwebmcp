const ECOMMERCE_MARKERS = /(?:"@type"\s*:\s*"(?:Product|Offer)"|shopify|woocommerce|add(?:ed)?[ _-]?to[ _-]?cart|\/cart(?:[/?"']|$)|product:price:amount|itemprop=["']price)/i;
const EXCLUDED_PATH = /\/(?:admin|account|login|logout|sign[-_]?in|auth|checkout|payment|private|wp-admin)(?:\/|$)/i;

export function isLikelyEcommerce(html: string): boolean {
  return ECOMMERCE_MARKERS.test(html);
}

function sameOriginLinks(origin: string, html: string): URL[] {
  const links = new Map<string, URL>();
  for (const match of html.matchAll(/href\s*=\s*["']([^"'#]+)["']/gi)) {
    try {
      const url = new URL(match[1], origin);
      url.hash = "";
      if (url.origin !== origin || !/^https?:$/.test(url.protocol)) continue;
      if (url.username || url.password || EXCLUDED_PATH.test(url.pathname)) continue;
      if (/\.(?:css|js|mjs|json|xml|png|jpe?g|gif|svg|webp|ico|pdf|zip)(?:$|\?)/i.test(url.pathname)) continue;
      links.set(url.toString(), url);
    } catch {
      // Ignore malformed navigation.
    }
  }
  return [...links.values()];
}

function bestLink(links: URL[], pattern: RegExp, used: Set<string>): URL | undefined {
  return links.find((url) => !used.has(url.toString()) && pattern.test(url.pathname));
}

/** Select linked browsing contexts only; never guess a state-changing route.
 * E-commerce receives up to four contexts, other sites up to three. */
export function discoverWebMCPContexts(origin: string, homepageHtml: string): string[] {
  const home = `${origin}/`;
  const links = sameOriginLinks(origin, homepageHtml);
  const chosen: string[] = [home];
  const used = new Set(chosen);
  const add = (url?: URL) => {
    if (!url || used.has(url.toString())) return;
    used.add(url.toString());
    chosen.push(url.toString());
  };

  if (isLikelyEcommerce(homepageHtml)) {
    add(bestLink(links, /\/(?:collections?|catalog(?:ue)?|shop|store|products?)(?:\/|$)/i, used));
    add(bestLink(links, /\/(?:products?|product|p)\/[^/]+/i, used));
    // A cart page is safe to view. The scanner never invokes its tools.
    add(bestLink(links, /\/cart(?:\/|$)/i, used));
    for (const link of links) {
      if (/\/(?:home|mobile-wifi|category|categories)(?:\/|$)/i.test(link.pathname)) add(link);
      if (chosen.length >= 4) break;
    }
    return chosen.slice(0, 4);
  }

  const promising = /\/(?:mcp|tools?|features?|questions?|faq|pricing|proof|docs?|services?|products?)(?:\/|$)/i;
  for (const link of links) {
    if (promising.test(link.pathname)) add(link);
    if (chosen.length >= 3) break;
  }
  return chosen;
}
