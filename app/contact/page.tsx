import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact ScanWebMCP.com",
  description: "How to contact ScanWebMCP.com about results, corrections, partnerships, privacy, or security.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <main className="wrap article editorial-page">
      <p className="kicker">Contact</p>
      <h1>Talk to the person behind ScanWebMCP.com</h1>
      <p>
        ScanWebMCP.com is created and maintained by Sara Simeone, also known as Agentic Sara and
        founder of NoCodeLab.ai. For questions about a scan, a correction to public evidence,
        collaboration, the Agent Surface Ladder, or the developer interfaces, email{" "}
        <a href="mailto:sara@nocodelab.ai">sara@nocodelab.ai</a>. Include the public result URL or
        domain when your message concerns a specific scan so the evidence can be checked precisely.
      </p>
      <p>
        If you control a domain and want it removed from future scans and comparison sets, use the{" "}
        <a href="/opt-out">opt-out process</a> and write from an address at that domain. Corrections
        are handled against the dated source evidence; ScanWebMCP does not silently rewrite a result
        without checking what the scanner observed.
      </p>
      <p>
        Security reports should follow the repository&apos;s{" "}
        <a href="https://github.com/Niftyzio/scanwebmcp/blob/main/SECURITY.md">private disclosure
        policy</a>. Do not include credentials, personal data, report-access links, or production
        database records in an initial message. Ask for a secure transfer method if sensitive
        supporting material is genuinely necessary.
      </p>
      <p>
        ScanWebMCP does not operate a sales-gated API. The public developer surface is documented at{" "}
        <a href="/developers">/developers</a> and requires no key. For implementation questions,
        linking the relevant OpenAPI operation or MCP tool name will usually produce the fastest,
        most concrete answer.
      </p>
    </main>
  );
}
