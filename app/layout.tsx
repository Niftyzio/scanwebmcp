import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Agent Surface Scan",
  description:
    "Which of your business capabilities could an AI agent call today? A free, evidenced scan against the Agent Surface Ladder.",
};

const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Agent Surface Scan",
  url: "https://scanwebmcp.vercel.app",
  applicationCategory: "BusinessApplication",
  description:
    "Enter a URL and get a live, evidenced answer to which of a business's capabilities an AI agent could call today, scored against the Agent Surface Ladder v1.0.",
  offers: { "@type": "Offer", price: "0", priceCurrency: "GBP" },
  author: {
    "@type": "Person",
    name: "Sara Simeone",
    alternateName: "Agentic Sara",
    url: "https://www.nocodelab.ai",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
        />
        <header className="site-header">
          <a href="/" className="wordmark">
            Agent Surface Scan
          </a>
          <nav>
            <a href="/ladder">The Ladder</a>
            <a href="/observatory">Observatory</a>
            <a href="/make-callable">Make it callable</a>
            <a href="/about-scanner">How we scan</a>
          </nav>
        </header>
        {children}
        <footer className="site-footer">
          <p>
            Rubric: Agent Surface Ladder v1.0 · by{" "}
            <a href="https://www.nocodelab.ai" rel="author">
              Sara Simeone
            </a>{" "}
            (Agentic Sara) · <a href="https://github.com/Niftyzio/scanwebmcp">Source (AGPL-3.0)</a> ·{" "}
            <a href="/opt-out">Opt out</a>
          </p>
          <p className="muted">
            This page registers WebMCP tools — open it in ChatGPT&apos;s desktop browser and ask it to
            scan a site.
          </p>
        </footer>
      </body>
    </html>
  );
}
