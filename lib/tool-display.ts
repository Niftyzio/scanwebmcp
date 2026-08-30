const EXACT_TOOL_LABELS: Record<string, string> = {
  about: "About this site",
  request_listing: "Request a listing",
  surprise_me: "Generate a surprise",
  share_on_x: "Share on X",
  share_on_linkedin: "Share on LinkedIn",
  record_unsupported_request: "Record an unsupported request",
};

const title = (value: string) => value
  .split(/[-_]+/)
  .filter(Boolean)
  .map((word) => word.length <= 3 && word === word.toUpperCase()
    ? word
    : `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
  .join(" ");

const resourceLabel = (value: string) => ({
  docs: "documentation",
  llms: "AI index",
  blog: "blog",
  articles: "articles",
}[value] ?? value.replace(/[-_]+/g, " "));

/** Human-facing label only. The report always retains and displays the exact
 * registered identifier alongside it as evidence. */
export function friendlyToolName(name: string): string {
  if (EXACT_TOOL_LABELS[name]) return EXACT_TOOL_LABELS[name];

  const parts = name.split(".").filter(Boolean);
  if (parts.length >= 3) {
    const brand = title(parts[0]);
    const action = parts.at(-1)!;
    const resource = parts.slice(1, -1).map(resourceLabel).join(" ");
    if (action === "search") return `Search ${brand} ${resource}`;
    if (action === "get-markdown") return `Read a ${brand} ${resource} page`;
    if (action === "get-index") return `Browse ${brand} ${resource}`;
    return `${title(action)} · ${brand} ${resource}`;
  }

  return title(name.replaceAll(".", " ")) || name;
}
