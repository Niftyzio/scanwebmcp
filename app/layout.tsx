import type { Metadata } from "next";
import { Geist, Geist_Mono, Manrope } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import { SITE_NAME, SITE_ORIGIN } from "@/lib/site";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  applicationName: SITE_NAME,
  title: { default: SITE_NAME, template: `%s | ${SITE_NAME}` },
  description:
    "Which of your business capabilities could an AI agent call today? A free, evidenced scan against the Agent Surface Ladder.",
  authors: [{ name: "Sara Simeone", url: "https://www.linkedin.com/in/sarasimeone/" }],
  creator: "Sara Simeone",
  publisher: SITE_NAME,
  openGraph: {
    type: "website",
    url: "/",
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: "See what AI agents can read, answer, and call on any public website.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: `${SITE_NAME} — see what AI agents can read, answer, and call.` }],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: "See what AI agents can read, answer, and call on any public website.",
    images: ["/og.png"],
  },
};

const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebApplication",
      "@id": `${SITE_ORIGIN}/#application`,
      name: SITE_NAME,
      url: SITE_ORIGIN,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      description:
        "Enter a URL and get a live, evidenced answer to which of a business's capabilities an AI agent could call today, scored against the Agent Surface Ladder v1.0.",
      offers: { "@type": "Offer", price: "0", priceCurrency: "GBP" },
      author: { "@id": `${SITE_ORIGIN}/#creator` },
      sameAs: [
        "https://github.com/Niftyzio/scanwebmcp",
        "https://www.linkedin.com/in/sarasimeone/",
      ],
    },
    {
      "@type": "Service",
      "@id": `${SITE_ORIGIN}/#service`,
      name: "Website agent-readiness scanning",
      serviceType: "AI agent-readiness assessment",
      provider: { "@id": `${SITE_ORIGIN}/#creator` },
      areaServed: "Worldwide",
      availableChannel: {
        "@type": "ServiceChannel",
        serviceUrl: SITE_ORIGIN,
      },
    },
    {
      "@type": "Person",
      "@id": `${SITE_ORIGIN}/#creator`,
      name: "Sara Simeone",
      alternateName: "Agentic Sara",
      url: "https://www.linkedin.com/in/sarasimeone/",
      sameAs: ["https://www.linkedin.com/in/sarasimeone/"],
    },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${manrope.variable}`}>
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
        />
        <header className="site-header">
          <a href="/" className="wordmark">
            <span className="wordmark-mark" aria-hidden="true"><span /></span>
            <span>{SITE_NAME}</span>
          </a>
          <nav aria-label="Primary navigation">
            <a href="/about-scanner">How it works</a>
            <a href="/ladder">The Ladder</a>
            <a href="/observatory">Benchmark</a>
            <details className="nav-more">
              <summary>More</summary>
              <div>
                <a href="/case-study">Case study</a>
                <a href="/make-callable">Make it callable</a>
                <a href="/developers">Developers</a>
                <a href="/faq">Questions</a>
              </div>
            </details>
            <a href="/#scan" className="button nav-scan">Scan a site</a>
          </nav>
        </header>
        {children}
        <Analytics />
        <footer className="site-footer">
          <p className="footer-brand">{SITE_NAME}</p>
          <p className="muted">
            A free, evidence-based check of what AI agents can see and do on your website.
          </p>
          <nav aria-label="Footer navigation">
            <a href="/ladder">The Ladder</a>
            <a href="/about-scanner">How we scan</a>
            <a href="/developers">Developers</a>
            <a href="/faq">Questions</a>
            <a href="/contact">Contact</a>
            <a href="/privacy">Privacy</a>
            <a href="/opt-out">Opt out</a>
            <a href="https://github.com/Niftyzio/scanwebmcp">Source</a>
          </nav>
          <p className="footer-credit">
            Created by{" "}
            <a href="https://www.linkedin.com/in/sarasimeone/" rel="author">
              Sara Simeone
            </a>
          </p>
        </footer>
      </body>
    </html>
  );
}
