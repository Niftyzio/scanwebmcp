/**
 * Pre-seeded industry taxonomy. The scan form only accepts entries from this
 * list (type-to-search), so the backend never fills with free-text noise and
 * growing sectors are countable. The five benchmarked sectors sit first;
 * everything else records demand until its sample justifies a benchmark
 * (spec: "If we see an increase in a specific sector, we go and benchmark it").
 */

export interface SectorEntry {
  slug: string;
  label: string; // what the user sees and types against
}

export const SECTOR_TAXONOMY: SectorEntry[] = [
  // Benchmarked today
  { slug: "accountancy", label: "Accountancy" },
  { slug: "law", label: "Legal services" },
  { slug: "beauty-dtc", label: "Beauty & skincare (online retail)" },
  { slug: "home-dtc", label: "Homeware & furniture (online retail)" },
  { slug: "training", label: "Training & education" },
  // Professional services
  { slug: "architecture", label: "Architecture" },
  { slug: "financial-advice", label: "Financial advice & wealth management" },
  { slug: "insurance", label: "Insurance" },
  { slug: "mortgage-broker", label: "Mortgage broking" },
  { slug: "recruitment", label: "Recruitment & staffing" },
  { slug: "consulting", label: "Business consulting" },
  { slug: "it-services", label: "IT services & support" },
  { slug: "software", label: "Software & SaaS" },
  { slug: "engineering", label: "Engineering services" },
  { slug: "surveying", label: "Surveying & valuation" },
  { slug: "translation", label: "Translation & language services" },
  // Agencies
  { slug: "marketing-agency", label: "Marketing agency" },
  { slug: "design-agency", label: "Design & branding agency" },
  { slug: "web-agency", label: "Web & app development agency" },
  { slug: "pr-agency", label: "PR & communications" },
  { slug: "seo-agency", label: "SEO agency" },
  { slug: "video-production", label: "Video & photography" },
  // Health & wellbeing
  { slug: "dentistry", label: "Dentistry" },
  { slug: "private-healthcare", label: "Private healthcare & clinics" },
  { slug: "physiotherapy", label: "Physiotherapy & osteopathy" },
  { slug: "optician", label: "Opticians" },
  { slug: "veterinary", label: "Veterinary" },
  { slug: "therapy-coaching", label: "Therapy, counselling & coaching" },
  { slug: "fitness", label: "Gyms, fitness & wellness" },
  { slug: "salon-spa", label: "Salons & spas" },
  // Property & trades
  { slug: "estate-agency", label: "Estate agency & lettings" },
  { slug: "property-management", label: "Property management" },
  { slug: "construction", label: "Construction & building" },
  { slug: "trades", label: "Trades (plumbing, electrical, roofing…)" },
  { slug: "landscaping", label: "Landscaping & gardening" },
  { slug: "cleaning", label: "Cleaning services" },
  { slug: "removals", label: "Removals & storage" },
  // Retail & product
  { slug: "fashion-dtc", label: "Fashion & apparel (online retail)" },
  { slug: "food-drink-dtc", label: "Food & drink (online retail)" },
  { slug: "jewellery-dtc", label: "Jewellery & accessories (online retail)" },
  { slug: "electronics-retail", label: "Electronics & gadgets retail" },
  { slug: "pet-products", label: "Pet products & services" },
  { slug: "gifts-crafts", label: "Gifts, crafts & stationery" },
  // Hospitality, travel, events
  { slug: "hotels", label: "Hotels & accommodation" },
  { slug: "restaurants", label: "Restaurants, cafés & catering" },
  { slug: "travel", label: "Travel & tours" },
  { slug: "events", label: "Events & venues" },
  { slug: "weddings", label: "Weddings" },
  // Auto, logistics, manufacturing
  { slug: "automotive", label: "Automotive sales & servicing" },
  { slug: "logistics", label: "Logistics & couriers" },
  { slug: "manufacturing", label: "Manufacturing & wholesale" },
  { slug: "printing", label: "Printing & signage" },
  // Other
  { slug: "charity", label: "Charity & non-profit" },
  { slug: "childcare", label: "Childcare & nurseries" },
  { slug: "photography", label: "Photography" },
  { slug: "media-publishing", label: "Media & publishing" },
  { slug: "agriculture", label: "Agriculture & farming" },
  { slug: "energy", label: "Energy & renewables" },
  { slug: "security", label: "Security services" },
];

/** Resolve what the user typed to a taxonomy entry (case-insensitive label match). */
export function matchSector(input: string): SectorEntry | null {
  const q = input.trim().toLowerCase();
  if (!q) return null;
  return (
    SECTOR_TAXONOMY.find((s) => s.label.toLowerCase() === q) ??
    SECTOR_TAXONOMY.find((s) => s.slug === q) ??
    null
  );
}

/** Friendly plural noun for a sector, for comparison copy. */
export function sectorNoun(slug: string | null): string {
  switch (slug) {
    case "law": return "law firms";
    case "accountancy": return "accountancy firms";
    case "beauty-dtc": return "beauty brands";
    case "home-dtc": return "homeware brands";
    case "training": return "training providers";
    case null: return "businesses";
    default: {
      const label = SECTOR_TAXONOMY.find((s) => s.slug === slug)?.label ?? slug.replace(/-/g, " ");
      return `${label.replace(/\s*\(.*\)$/, "").toLowerCase()} businesses`;
    }
  }
}
