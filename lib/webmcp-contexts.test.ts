import { describe, expect, it } from "vitest";
import { discoverWebMCPContexts, isLikelyEcommerce } from "./webmcp-contexts";

describe("adaptive WebMCP context discovery", () => {
  it("selects linked e-commerce contexts without exceeding four pages", () => {
    const html = `
      <script type="application/ld+json">{"@type":"Product"}</script>
      <a href="/collections/routers">Routers</a>
      <a href="/products/mesh-pro">Mesh Pro</a>
      <a href="/cart">Cart</a>
      <a href="/account">Account</a>
      <a href="/products/another">Another</a>`;
    expect(isLikelyEcommerce(html)).toBe(true);
    expect(discoverWebMCPContexts("https://shop.example", html)).toEqual([
      "https://shop.example/",
      "https://shop.example/collections/routers",
      "https://shop.example/products/mesh-pro",
      "https://shop.example/cart",
    ]);
  });

  it("selects at most two extra high-signal contexts for a general site", () => {
    const html = `
      <a href="/about">About</a>
      <a href="/questions">Questions</a>
      <a href="/proof">Proof</a>
      <a href="https://other.example/tools">External</a>`;
    expect(discoverWebMCPContexts("https://site.example", html)).toEqual([
      "https://site.example/",
      "https://site.example/questions",
      "https://site.example/proof",
    ]);
  });

  it("never selects login, checkout or guessed paths", () => {
    const html = `<a href="/login">Login</a><a href="/checkout">Checkout</a><a href="/about">About</a>`;
    expect(discoverWebMCPContexts("https://site.example", html)).toEqual(["https://site.example/"]);
  });
});
