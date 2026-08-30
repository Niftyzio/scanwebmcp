"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { BENCHMARKED_SLUGS, SECTOR_TAXONOMY } from "@/lib/sectors";

const ORDERED_SECTORS = [
  ...BENCHMARKED_SLUGS.flatMap((slug) => SECTOR_TAXONOMY.filter((sector) => sector.slug === slug)),
  ...SECTOR_TAXONOMY.filter((sector) => !BENCHMARKED_SLUGS.includes(sector.slug)),
];

export default function ScanForm() {
  const [url, setUrl] = useState("");
  const [industry, setIndustry] = useState("");
  const [industryOpen, setIndustryOpen] = useState(false);
  const [industryQuery, setIndustryQuery] = useState("");
  const [activeIndustry, setActiveIndustry] = useState(0);
  const [state, setState] = useState<"idle" | "scanning" | "error">("idle");
  const [error, setError] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const industryTriggerRef = useRef<HTMLButtonElement>(null);
  const industrySearchRef = useRef<HTMLInputElement>(null);
  const industryListId = useId();

  const selectedIndustry = SECTOR_TAXONOMY.find((sector) => sector.slug === industry);
  const filteredIndustries = useMemo(() => {
    const query = industryQuery.trim().toLowerCase();
    return ORDERED_SECTORS.filter((sector) => sector.label.toLowerCase().includes(query));
  }, [industryQuery]);

  useEffect(() => {
    if (!industryOpen) return;
    const focusTimer = window.setTimeout(() => industrySearchRef.current?.focus(), 0);
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!formRef.current?.contains(event.target as Node)) setIndustryOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePress);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("pointerdown", closeOnOutsidePress);
    };
  }, [industryOpen]);

  useEffect(() => {
    if (!industryOpen) return;
    const active = filteredIndustries[activeIndustry];
    if (active) document.getElementById(`industry-${active.slug}`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndustry, filteredIndustries, industryOpen]);

  function chooseIndustry(slug: string) {
    setIndustry(slug);
    setIndustryQuery("");
    setIndustryOpen(false);
    industryTriggerRef.current?.focus();
  }

  function handleIndustryKeys(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!filteredIndustries.length && ["ArrowDown", "ArrowUp", "Enter"].includes(event.key)) {
      event.preventDefault();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndustry((current) => Math.min(current + 1, filteredIndustries.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndustry((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter" && filteredIndustries[activeIndustry]) {
      event.preventDefault();
      chooseIndustry(filteredIndustries[activeIndustry].slug);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setIndustryOpen(false);
      industryTriggerRef.current?.focus();
    } else if (event.key === "Tab") {
      setIndustryOpen(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!url.trim()) return;
    setState("scanning");
    setError("");
    try {
      const response = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), ...(industry ? { sector: industry } : {}) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Scan failed");
      location.href = `/scan/${result.slug}`;
    } catch (caught) {
      setState("error");
      setError(caught instanceof Error ? caught.message : "Scan failed");
    }
  }

  return (
    <form ref={formRef} onSubmit={submit} className="scan-form" aria-busy={state === "scanning"}>
      <div className="scan-glass">
        <span className="scan-spark" aria-hidden="true"><span /></span>
        <label className="scan-label" htmlFor="website-url">Website address</label>
        <div className="scan-primary-row">
          <span className="url-prefix" aria-hidden="true">https://</span>
          <input
            id="website-url"
            type="text"
            inputMode="url"
            placeholder="yourbusiness.com"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            disabled={state === "scanning"}
            aria-label="Website to scan"
            required
          />
          <div className="scan-industry">
            <button
              ref={industryTriggerRef}
              type="button"
              className="industry-trigger"
              aria-haspopup="listbox"
              aria-expanded={industryOpen}
              aria-controls={industryOpen ? industryListId : undefined}
              disabled={state === "scanning"}
              aria-label="Industry (optional)"
              onClick={() => {
                setActiveIndustry(0);
                if (!industryOpen) setIndustryQuery("");
                setIndustryOpen((open) => !open);
              }}
            >
              <span>{selectedIndustry?.label ?? "Industry"}</span>
              <span className="industry-chevron" aria-hidden="true" />
            </button>
          </div>
          <button className="scan-submit" type="submit" disabled={state === "scanning"}>
            <span className="scan-button-label">{state === "scanning" ? "Scanning…" : "Scan"}</span>
            {state !== "scanning" && <span className="scan-arrow" aria-hidden="true">→</span>}
          </button>
        </div>
        {industryOpen && (
          <div className="industry-popover">
            <div className="industry-search-field">
              <span aria-hidden="true" />
              <input
                ref={industrySearchRef}
                type="search"
                role="combobox"
                placeholder="Search industries…"
                value={industryQuery}
                onChange={(event) => { setIndustryQuery(event.target.value); setActiveIndustry(0); }}
                onKeyDown={handleIndustryKeys}
                aria-label="Search industries"
                aria-expanded="true"
                aria-controls={industryListId}
                aria-activedescendant={filteredIndustries[activeIndustry] ? `industry-${filteredIndustries[activeIndustry].slug}` : undefined}
                autoComplete="off"
              />
            </div>
            <div id={industryListId} className="industry-options" role="listbox" aria-label="Industries">
              {industry && !industryQuery && (
                <button type="button" className="industry-option industry-clear" onClick={() => chooseIndustry("")}>
                  <span>All industries</span><span aria-hidden="true">×</span>
                </button>
              )}
              {!industryQuery && <p className="industry-group-label">Benchmarked industries</p>}
              {filteredIndustries.map((sector, index) => {
                const isSelected = sector.slug === industry;
                const startsMoreGroup = !industryQuery && index === BENCHMARKED_SLUGS.length;
                return (
                  <div key={sector.slug} role="presentation">
                    {startsMoreGroup && <p className="industry-group-label">More industries</p>}
                    <button
                      id={`industry-${sector.slug}`}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      className={`industry-option${index === activeIndustry ? " is-active" : ""}${isSelected ? " is-selected" : ""}`}
                      onMouseEnter={() => setActiveIndustry(index)}
                      onClick={() => chooseIndustry(sector.slug)}
                    >
                      <span>{sector.label}</span>
                      {isSelected && <span className="industry-check" aria-hidden="true">✓</span>}
                    </button>
                  </div>
                );
              })}
              {filteredIndustries.length === 0 && <p className="industry-empty">No matching industry</p>}
            </div>
          </div>
        )}
      </div>
      {state === "error" && <p className="error">{error}</p>}
    </form>
  );
}
