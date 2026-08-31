import { AGENT_SKILLS_INDEX } from "@/lib/agent-discovery";

export function GET() {
  return Response.json(AGENT_SKILLS_INDEX, {
    headers: {
      "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
      Link: '</.well-known/agent-skills/index.json>; rel="canonical"',
    },
  });
}
