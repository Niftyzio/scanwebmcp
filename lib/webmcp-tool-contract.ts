export const WEBMCP_CHARACTER_LIMITS = {
  toolName: 30,
  toolDescription: 500,
  parameterDescription: 150,
  output: 1_500,
} as const;

export type WebMCPToolAnnotations = {
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
  /** Chrome-specific safety hint for content originating outside this app. */
  untrustedContentHint?: boolean;
};

export const WEBMCP_ANNOTATIONS = {
  localReadOnly: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  externalReadOnly: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
    untrustedContentHint: true,
  },
  scan: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
    untrustedContentHint: true,
  },
  sendEmail: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
} as const satisfies Record<string, WebMCPToolAnnotations>;

const OUTPUT_TRUNCATION_NOTICE =
  " … [truncated to the WebMCP output budget; use a narrower call or the visible report for full detail]";

function characterLength(value: string): number {
  return Array.from(value).length;
}

export function truncateCharacters(value: string, limit: number, suffix = "…"): string {
  if (characterLength(value) <= limit) return value;
  const suffixCharacters = Array.from(suffix);
  if (suffixCharacters.length >= limit) return suffixCharacters.slice(0, limit).join("");
  return Array.from(value)
    .slice(0, limit - suffixCharacters.length)
    .join("") + suffix;
}

export function boundedWebMCPText(value: string) {
  return {
    content: [{
      type: "text" as const,
      text: truncateCharacters(value, WEBMCP_CHARACTER_LIMITS.output, OUTPUT_TRUNCATION_NOTICE),
    }],
  };
}

function boundSchemaDescriptions(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(boundSchemaDescriptions);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, child]) => [
      key,
      key === "description" && typeof child === "string"
        ? truncateCharacters(child, WEBMCP_CHARACTER_LIMITS.parameterDescription)
        : boundSchemaDescriptions(child),
    ]),
  );
}

export function normalizeWebMCPToolMetadata(tool: {
  name: string;
  description: string;
  inputSchema: object;
  annotations?: WebMCPToolAnnotations;
}) {
  if (characterLength(tool.name) > WEBMCP_CHARACTER_LIMITS.toolName) {
    throw new Error(
      `WebMCP tool name ${tool.name} exceeds ${WEBMCP_CHARACTER_LIMITS.toolName} characters`,
    );
  }

  return {
    ...tool,
    description: truncateCharacters(tool.description, WEBMCP_CHARACTER_LIMITS.toolDescription),
    inputSchema: boundSchemaDescriptions(tool.inputSchema) as object,
  };
}
