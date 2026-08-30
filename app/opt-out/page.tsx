import type { Metadata } from "next";

export const metadata: Metadata = { title: "Opt out of scanning" };

export default function OptOut() {
  return (
    <main className="wrap article editorial-page">
      <h1>Opt out of scanning</h1>
      <p>
        If you&apos;d rather your domain weren&apos;t scanned or shown here, email{" "}
        <a href="mailto:sara@nocodelab.ai?subject=Agent%20Surface%20Scan%20opt-out">
          sara@nocodelab.ai
        </a>{" "}
        from an address at the domain in question, with the domain in the subject line. We remove it
        from future scans and public pages and keep only a record of the opt-out itself. You can
        also add <code>AgentSurfaceScan</code> to your robots.txt disallow rules — we honour it.
      </p>
    </main>
  );
}
