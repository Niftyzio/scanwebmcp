export type WebMCPToolKind = "answer" | "action" | "sensitive_action";

export interface WebMCPToolDescriptor {
  name: string;
  description?: string;
  inputSchema?: unknown;
  annotations?: Record<string, unknown>;
}

export interface WebMCPObservedTool extends WebMCPToolDescriptor {
  kind: WebMCPToolKind;
  pageUrl: string;
}

export interface WebMCPContextObservation {
  requestedUrl: string;
  finalUrl: string;
  toolCount: number;
  toolNames: string[];
  witnessAvailable: boolean;
}

export interface WebMCPInventory {
  version: 1;
  totalCount: number;
  capturedCount: number;
  contextDependent: boolean;
  contexts: WebMCPContextObservation[];
  tools: WebMCPObservedTool[];
  blockedRuntimeUrls: string[];
}

const SENSITIVE_ACTION = /(?:checkout|purchase|payment|pay\b|place[_ -]?order|book(?:ing)?|reserve|subscribe|submit|send|contact|email|delete|cancel|refund|transfer|invite|publish|share)/i;
const ACTION = /(?:add|update|remove|set|show|open|navigate|start|manage|create|edit|save|select|filter|fill|upload|download|view[_ -]?(?:product|variant))/i;
const READ_ONLY_NAME = /^(?:get|search|list|read|find|browse|about)(?:[._ -]|$)/i;
const SENSITIVE_FIELDS = /(?:email|address|phone|payment|card|confirm|consent|recipient|amount|password|token)/i;

function schemaContainsSensitiveField(value: unknown, depth = 0): boolean {
  if (depth > 5 || value == null) return false;
  if (typeof value === "string") return SENSITIVE_FIELDS.test(value);
  if (Array.isArray(value)) return value.some((item) => schemaContainsSensitiveField(item, depth + 1));
  if (typeof value !== "object") return false;
  return Object.entries(value as Record<string, unknown>).some(([key, child]) =>
    SENSITIVE_FIELDS.test(key) || schemaContainsSensitiveField(child, depth + 1),
  );
}

/** Deterministic and conservative. A descriptor is only called sensitive when
 * its own name/description/schema supplies evidence; no LLM guess is needed. */
export function classifyWebMCPTool(tool: WebMCPToolDescriptor): WebMCPToolKind {
  const annotations = tool.annotations ?? {};
  if (annotations.readOnlyHint === true) return "answer";
  if (annotations.destructiveHint === true) return "sensitive_action";

  const text = `${tool.name} ${tool.description ?? ""}`;
  if (READ_ONLY_NAME.test(tool.name) && !schemaContainsSensitiveField(tool.inputSchema)) return "answer";
  if (SENSITIVE_ACTION.test(text) || schemaContainsSensitiveField(tool.inputSchema)) {
    return "sensitive_action";
  }
  if (ACTION.test(text) || annotations.readOnlyHint === false) return "action";
  return "answer";
}

function cleanDescriptor(raw: unknown): WebMCPToolDescriptor | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  if (typeof item.name !== "string" || item.name.trim().length === 0) return null;
  return {
    name: item.name.trim().slice(0, 300),
    ...(typeof item.description === "string" ? { description: item.description.slice(0, 4_000) } : {}),
    ...(item.inputSchema && typeof item.inputSchema === "object" ? { inputSchema: item.inputSchema } : {}),
    ...(item.annotations && typeof item.annotations === "object"
      ? { annotations: item.annotations as Record<string, unknown> }
      : {}),
  };
}

export function normalizeWebMCPTools(raw: unknown): WebMCPToolDescriptor[] {
  if (!Array.isArray(raw)) return [];
  const tools = new Map<string, WebMCPToolDescriptor>();
  for (const item of raw) {
    const tool = cleanDescriptor(item);
    if (tool && !tools.has(tool.name)) tools.set(tool.name, tool);
  }
  return [...tools.values()];
}

export function buildWebMCPInventory(
  contexts: WebMCPContextObservation[],
  descriptorsByContext: Map<string, WebMCPToolDescriptor[]>,
  blockedRuntimeUrls: string[] = [],
): WebMCPInventory {
  const tools = new Map<string, WebMCPObservedTool>();
  for (const context of contexts) {
    for (const descriptor of descriptorsByContext.get(context.finalUrl) ?? []) {
      if (!tools.has(descriptor.name)) {
        tools.set(descriptor.name, {
          ...descriptor,
          kind: classifyWebMCPTool(descriptor),
          pageUrl: context.finalUrl,
        });
      }
    }
  }
  const toolSets = contexts
    .filter((context) => context.witnessAvailable)
    .map((context) => [...context.toolNames].sort().join("\u0000"));
  return {
    version: 1,
    totalCount: tools.size,
    capturedCount: tools.size,
    contextDependent: new Set(toolSets).size > 1,
    contexts,
    tools: [...tools.values()],
    blockedRuntimeUrls: [...new Set(blockedRuntimeUrls)],
  };
}

const MAX_INVENTORY_BYTES = 200_000;
const MAX_CAPTURED_TOOLS = 100;

/** Signals use a Postgres text column. Bound the evidence payload while
 * preserving the exact site-wide total separately from the displayed sample. */
export function serializeWebMCPInventory(inventory: WebMCPInventory): string {
  const bounded: WebMCPInventory = {
    ...inventory,
    tools: inventory.tools.slice(0, MAX_CAPTURED_TOOLS),
    capturedCount: Math.min(inventory.tools.length, MAX_CAPTURED_TOOLS),
  };
  let json = JSON.stringify(bounded);
  while (Buffer.byteLength(json, "utf8") > MAX_INVENTORY_BYTES && bounded.tools.length > 0) {
    bounded.tools.pop();
    bounded.capturedCount = bounded.tools.length;
    json = JSON.stringify(bounded);
  }
  return json;
}

export function parseWebMCPInventory(value: unknown): WebMCPInventory | null {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== "object") return null;
    const candidate = parsed as Partial<WebMCPInventory>;
    if (candidate.version !== 1 || !Array.isArray(candidate.tools) || !Array.isArray(candidate.contexts)) return null;
    return candidate as WebMCPInventory;
  } catch {
    return null;
  }
}
