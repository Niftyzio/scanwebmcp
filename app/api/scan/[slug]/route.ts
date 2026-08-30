import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getScanPage } from "@/lib/scan-service";
import { hasReportAccess, REPORT_ACCESS_COOKIE } from "@/lib/report-access";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const page = await getScanPage(slug);
  if (!page) return NextResponse.json({ error: "No scan at this slug" }, { status: 404 });
  const { scan, signals, opportunities } = page;
  const gateEnabled = process.env.REPORT_GATE !== "off";
  const cookieStore = await cookies();
  const unlocked =
    !gateEnabled || hasReportAccess(cookieStore.get(REPORT_ACCESS_COOKIE)?.value, scan.slug);
  const response = NextResponse.json({
    domain: scan.sites.domain,
    slug: scan.slug,
    status: scan.status,
    rubricVersion: scan.rubric_version,
    rung: scan.rung,
    rungName: scan.rung == null ? null : ["Invisible", "Readable", "Answerable", "Callable", "Transactable"][scan.rung],
    scores: { d1: scan.d1, d2: scan.d2, d3: scan.d3, d4: scan.d4, d5: scan.d5, composite: scan.composite },
    completedAt: scan.completed_at,
    locked: !unlocked,
    opportunities: unlocked
      ? opportunities.map((o) => ({ rank: o.rank, text: o.rendered_text, impact: o.impact, ease: o.ease }))
      : [],
    signals: unlocked
      ? signals.map((s) => ({
          dimension: s.dimension,
          key: s.signal_key,
          value: s.value_bool ?? s.value_num ?? s.value_text,
          detail: s.value_text,
          evidenceUrl: s.evidence_url,
          evidenceSnippet: s.evidence_snippet,
          observedAt: s.observed_at,
        }))
      : [],
  });
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Cookie");
  return response;
}
