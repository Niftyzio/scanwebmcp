import { NextResponse } from "next/server";
import { getScanPage } from "@/lib/scan-service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const page = await getScanPage(slug);
  if (!page) return NextResponse.json({ error: "No scan at this slug" }, { status: 404 });
  const { scan, signals, opportunities } = page;
  return NextResponse.json({
    domain: scan.sites.domain,
    slug: scan.slug,
    status: scan.status,
    rubricVersion: scan.rubric_version,
    rung: scan.rung,
    rungName: scan.rung == null ? null : ["Invisible", "Readable", "Answerable", "Callable", "Transactable"][scan.rung],
    scores: { d1: scan.d1, d2: scan.d2, d3: scan.d3, d4: scan.d4, d5: scan.d5, composite: scan.composite },
    completedAt: scan.completed_at,
    opportunities: opportunities.map((o) => ({ rank: o.rank, text: o.rendered_text, impact: o.impact, ease: o.ease })),
    signals: signals.map((s) => ({
      dimension: s.dimension,
      key: s.signal_key,
      value: s.value_bool ?? s.value_num ?? s.value_text,
      detail: s.value_text,
      evidenceUrl: s.evidence_url,
      evidenceSnippet: s.evidence_snippet,
      observedAt: s.observed_at,
    })),
  });
}
