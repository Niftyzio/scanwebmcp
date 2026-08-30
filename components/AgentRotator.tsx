"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { TRACKED_AI_AGENTS } from "@/lib/tracked-agents";

const ROTATION_MS = 3_200;

export default function AgentRotator() {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const interval = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % TRACKED_AI_AGENTS.length);
    }, ROTATION_MS);
    return () => window.clearInterval(interval);
  }, []);

  const agent = TRACKED_AI_AGENTS[activeIndex];
  return (
    <span className={`agent-rotator agent-rotator-${agent.id}`}>
      <span className="agent-rotator-label">AI agents</span>
      <span key={agent.id} className={`agent-lockup agent-${agent.id}`} aria-hidden="true">
        <Image className="agent-logo" src={agent.logo} width={24} height={24} alt="" />
        <span>{agent.name}</span>
      </span>
    </span>
  );
}
