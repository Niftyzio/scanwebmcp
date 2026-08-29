import type { MetadataRoute } from "next";

const BASE = "https://scanwebmcp.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/ladder", "/observatory", "/case-study", "/make-callable", "/map", "/faq", "/about-scanner", "/opt-out"].map((p) => ({
    url: `${BASE}${p}`,
    changeFrequency: "weekly",
    priority: p === "" ? 1 : 0.7,
  }));
}
