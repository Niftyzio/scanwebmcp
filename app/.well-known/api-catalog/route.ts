import { API_CATALOG } from "@/lib/agent-discovery";

export function GET() {
  return Response.json(API_CATALOG, {
    headers: {
      "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
      "Content-Type": 'application/linkset+json;profile="https://www.rfc-editor.org/info/rfc9727"; charset=utf-8',
    },
  });
}
