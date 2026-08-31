import { OPENAPI_DOCUMENT } from "@/lib/agent-discovery";

export function GET() {
  return Response.json(OPENAPI_DOCUMENT, {
    headers: {
      "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
      "Content-Type": "application/vnd.oai.openapi+json;version=3.1; charset=utf-8",
    },
  });
}
