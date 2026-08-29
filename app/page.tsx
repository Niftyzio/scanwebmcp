import WebMCPTools from "@/components/WebMCPTools";
import ScanForm from "@/components/ScanForm";
import RecentScans from "@/components/RecentScans";
import { db } from "@/lib/db";

// The addictive number: refreshed at most every 5 minutes, climbing daily.
export const revalidate = 300;

async function CorpusCounter() {
  try {
    const { count } = await db()
      .from("sites")
      .select("*", { count: "exact", head: true })
      .eq("opt_out", false);
    if (!count || count < 100) return null;
    return (
      <p className="corpus-counter">
        <span className="corpus-count">{count.toLocaleString("en-GB")}</span> websites scanned — and
        counting. Every one re-draws the benchmark. <a href="/observatory">Watch it grow →</a>
      </p>
    );
  } catch {
    return null; // the counter is a flourish, never a point of failure
  }
}

export default function Home() {
  return (
    <main className="wrap">
      <WebMCPTools mode="site" />
      <section className="hero">
        <p className="kicker">AI agents arrived this week. What will they find on your site?</p>
        <h1>
          Which of your business capabilities could an AI agent <em>call</em> today?
        </h1>
        <p className="lede">
          Enter a URL. In about twenty seconds you get a live, dated, evidenced answer: where the
          site sits on the <a href="/ladder">Agent Surface Ladder</a> — Invisible → Readable →
          Answerable → Callable → Transactable — and the three opportunities most worth taking.
        </p>
        <ScanForm />
        <CorpusCounter />
        <p className="muted small">
          Free. No login. Public pages only, six pages per scan, evidence attached to every claim.
          This page is itself agent-callable: in ChatGPT&apos;s desktop browser, just ask it to
          &ldquo;scan example.com with the Agent Surface Scan&rdquo;.
        </p>
      </section>
      <RecentScans />
    </main>
  );
}
