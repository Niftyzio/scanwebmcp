export const SITE_WEBMCP_TOOL_NAMES = [
  "scan_agent_surface",
  "get_ladder_definition",
  "email_report",
] as const;

export const SCAN_WEBMCP_TOOL_NAMES = [
  "scan_agent_surface",
  "get_ladder_definition",
  "get_scan_findings",
  "get_webmcp_inventory",
  "get_recommended_tools",
  "get_evidence",
  "explain_opportunity",
  "rescan",
  "email_report",
] as const;

export const WEBMCP_TOOL_NAMES_BY_STATE = {
  site: SITE_WEBMCP_TOOL_NAMES,
  scan_locked: SCAN_WEBMCP_TOOL_NAMES,
  scan_unlocked: SCAN_WEBMCP_TOOL_NAMES,
} as const;

export type WebMCPEvalSurface = keyof typeof WEBMCP_TOOL_NAMES_BY_STATE;
