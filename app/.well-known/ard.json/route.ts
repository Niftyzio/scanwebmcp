import { ARD_CATALOG } from "@/lib/agent-discovery";

export function GET() {
  return Response.json(ARD_CATALOG, {
    headers: { "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400" },
  });
}
