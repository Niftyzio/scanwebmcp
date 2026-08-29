"use client";

import { useState } from "react";

export default function PromptPack({ prompt }: { prompt: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="prompt-pack">
      <button
        className="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(prompt);
            setCopied(true);
            setTimeout(() => setCopied(false), 2500);
          } catch {
            /* clipboard unavailable */
          }
        }}
      >
        {copied ? "Copied — paste it into your AI" : "Copy the prompt for your own AI"}
      </button>
      <details className="small">
        <summary className="muted">See what you&apos;re copying</summary>
        <pre className="snippet prompt-preview">{prompt}</pre>
      </details>
    </div>
  );
}
