import type { MetadataRoute } from "next";
import { SITE_ORIGIN } from "@/lib/site";

const BASE = SITE_ORIGIN;

export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/ladder", "/observatory", "/case-study", "/make-callable", "/map", "/faq", "/about-scanner", "/opt-out"].map((p) => ({
    url: `${BASE}${p}`,
    changeFrequency: "weekly",
    priority: p === "" ? 1 : 0.7,
  }));
}
