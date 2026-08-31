import { SITE_NAME, SITE_ORIGIN, siteUrl } from "./site";

const errorSchema = {
  type: "object",
  additionalProperties: false,
  required: ["error", "code", "message", "resolution"],
  properties: {
    error: { type: "string", description: "Backward-compatible human-readable error." },
    code: { type: "string", description: "Stable machine-readable error code." },
    message: { type: "string", description: "Concise explanation of the failure." },
    resolution: { type: "string", description: "A concrete next step for the caller." },
  },
} as const;

export const OPENAPI_DOCUMENT = {
  openapi: "3.1.0",
  info: {
    title: `${SITE_NAME} Public API`,
    version: "1.0.0",
    summary: "Scan public websites for AI-agent readability, answerability, and callability.",
    description:
      "A free, no-key API for requesting a public website scan, reading its public Agent Surface Ladder result, and retrieving aggregate Observatory data. The scanner honours robots.txt and refuses private network targets.",
    termsOfService: siteUrl("/about-scanner"),
    contact: { name: "ScanWebMCP.com", email: "sara@nocodelab.ai", url: siteUrl("/contact") },
    license: { name: "AGPL-3.0", identifier: "AGPL-3.0-only", url: "https://www.gnu.org/licenses/agpl-3.0.html" },
  },
  jsonSchemaDialect: "https://json-schema.org/draft/2020-12/schema",
  servers: [{ url: SITE_ORIGIN, description: "Production" }],
  externalDocs: { description: "Developer guide", url: siteUrl("/developers") },
  tags: [
    { name: "Scans", description: "Request and read public website agent-surface scans." },
    { name: "Observatory", description: "Read aggregate, non-identifying corpus statistics." },
  ],
  paths: {
    "/api/scan": {
      post: {
        operationId: "scanAgentSurface",
        summary: "Scan a public website",
        description:
          "Starts a polite public-web scan or returns a sufficiently recent cached result. Automated callers should set requester to agent. A scan may take 10–40 seconds.",
        tags: ["Scans"],
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ScanRequest" },
              examples: { basic: { summary: "Scan a domain", value: { url: "example.com", requester: "agent" } } },
            },
          },
        },
        responses: {
          "200": {
            description: "The new or cached scan reference.",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ScanRequestResult" } } },
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "429": { $ref: "#/components/responses/RateLimited" },
          "500": { $ref: "#/components/responses/ServerError" },
        },
      },
    },
    "/api/scan/{slug}": {
      get: {
        operationId: "getPublicScanResult",
        summary: "Read a public scan result",
        description:
          "Returns the public rung, five dimension scores, completion time, and lock status for a scan. Exact signals and recommendations are omitted unless the requesting browser has report access.",
        tags: ["Scans"],
        security: [],
        parameters: [
          {
            name: "slug",
            in: "path",
            required: true,
            description: "Domain-derived slug returned by scanAgentSurface.",
            schema: { type: "string", minLength: 1, example: "example.com" },
          },
        ],
        responses: {
          "200": {
            description: "Public scan result.",
            content: { "application/json": { schema: { $ref: "#/components/schemas/PublicScanResult" } } },
          },
          "404": { $ref: "#/components/responses/NotFound" },
          "500": { $ref: "#/components/responses/ServerError" },
        },
      },
    },
    "/api/observatory": {
      get: {
        operationId: "getObservatorySnapshot",
        summary: "Read aggregate benchmark data",
        description:
          "Returns the current number of completed scans and a non-identifying sector and rung breakdown. Responses are briefly cached at the edge.",
        tags: ["Observatory"],
        security: [],
        responses: {
          "200": {
            description: "Aggregate Observatory snapshot.",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ObservatorySnapshot" } } },
          },
          "503": { $ref: "#/components/responses/TemporarilyUnavailable" },
        },
      },
    },
  },
  components: {
    schemas: {
      ScanRequest: {
        type: "object",
        additionalProperties: false,
        required: ["url"],
        properties: {
          url: { type: "string", minLength: 1, description: "Public HTTP(S) website URL or domain.", example: "example.com" },
          requester: { type: "string", enum: ["human", "agent"], default: "human", description: "Identifies an automated caller for cache and reporting behavior." },
          rescan: { type: "boolean", default: false, description: "Requests a fresh scan when the one-hour domain cooldown permits it." },
          sector: { type: "string", description: "Optional known sector slug from the public taxonomy." },
        },
      },
      ScanRequestResult: {
        type: "object",
        additionalProperties: false,
        required: ["slug", "status", "cached"],
        properties: {
          slug: { type: "string", description: "Identifier for the result endpoint.", example: "example.com" },
          status: { type: "string", enum: ["running", "complete", "failed"] },
          cached: { type: "boolean", description: "Whether a stored result or in-flight scan was reused." },
          cachedAt: { type: "string", format: "date-time" },
          freshScanAvailableAt: { type: "string", format: "date-time" },
        },
      },
      PublicScanResult: {
        type: "object",
        additionalProperties: false,
        required: ["domain", "slug", "status", "rubricVersion", "rung", "rungName", "scores", "completedAt", "locked", "opportunities", "signals"],
        properties: {
          domain: { type: "string", example: "example.com" },
          slug: { type: "string", example: "example.com" },
          status: { type: "string" },
          rubricVersion: { type: "string" },
          rung: { type: ["integer", "null"], minimum: 0, maximum: 4 },
          rungName: { type: ["string", "null"], enum: ["Invisible", "Readable", "Answerable", "Callable", "Transactable", null] },
          scores: { $ref: "#/components/schemas/DimensionScores" },
          completedAt: { type: ["string", "null"], format: "date-time" },
          locked: { type: "boolean", description: "True when detailed evidence requires the emailed report-access link." },
          opportunities: { type: "array", items: { type: "object" } },
          signals: { type: "array", items: { type: "object" } },
        },
      },
      DimensionScores: {
        type: "object",
        additionalProperties: false,
        required: ["d1", "d2", "d3", "d4", "d5", "composite"],
        properties: Object.fromEntries(
          ["d1", "d2", "d3", "d4", "d5", "composite"].map((key) => [
            key,
            { type: ["number", "null"], minimum: 0, maximum: 100 },
          ]),
        ),
      },
      ObservatorySnapshot: {
        type: "object",
        additionalProperties: false,
        required: ["sites", "scans", "bySector"],
        properties: {
          sites: { type: "integer", minimum: 0 },
          scans: { type: "integer", minimum: 0 },
          bySector: {
            type: "array",
            items: {
              type: "object",
              required: ["sector", "label", "n", "rungs"],
              properties: {
                sector: { type: ["string", "null"] },
                label: { type: "string" },
                n: { type: "integer", minimum: 0 },
                rungs: { type: "object", additionalProperties: { type: "integer", minimum: 0 } },
              },
            },
          },
        },
      },
      Error: errorSchema,
    },
    responses: {
      BadRequest: {
        description: "The request body or target URL is invalid.",
        content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
      },
      RateLimited: {
        description: "The public scan limit has been reached.",
        headers: { "Retry-After": { schema: { type: "integer" }, description: "Suggested wait in seconds when known." } },
        content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
      },
      NotFound: {
        description: "No scan exists for this slug.",
        content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
      },
      TemporarilyUnavailable: {
        description: "Live benchmark data is temporarily unavailable.",
        content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
      },
      ServerError: {
        description: "The scan could not be completed.",
        content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
      },
    },
  },
} as const;

export const MCP_SERVER_CARD = {
  name: "ScanWebMCP.com",
  description: "Scan a public website for what AI agents can read, answer, and call.",
  version: "1.0.0",
  serverUrl: siteUrl("/mcp"),
  transport: "streamable-http",
  authentication: { type: "none" },
  icon: siteUrl("/favicon.ico"),
  documentationUrl: siteUrl("/developers"),
  tools: [
    { name: "scan_agent_surface", description: "Scan a website and return its public Ladder rung and dimension scores." },
    { name: "get_ladder_definition", description: "Read the published Agent Surface Ladder definitions and weights." },
    { name: "email_report", description: "Send an already-scanned website's full evidenced report after the human supplies an email address." },
    { name: "get_observatory_stats", description: "Read aggregate agent-readiness findings from the live scan corpus." },
  ],
} as const;

export const MCP_DOCS_SERVER_CARD = {
  name: "ScanWebMCP.com Documentation",
  description: "Read ScanWebMCP.com product, API, methodology, privacy, and scanner guidance.",
  version: "1.0.0",
  serverUrl: siteUrl("/mcp/docs"),
  transport: "streamable-http",
  authentication: { type: "none" },
  icon: siteUrl("/favicon.ico"),
  documentationUrl: siteUrl("/developers"),
  tools: [
    { name: "search_scanwebmcp_docs", description: "Search canonical ScanWebMCP.com guidance." },
    { name: "get_scanwebmcp_guide", description: "Read one canonical guide with its source URL." },
  ],
} as const;

export const ARD_CATALOG = {
  entries: [
    {
      identifier: "urn:air:scanwebmcp.com:mcp:scanner",
      displayName: "ScanWebMCP.com MCP server",
      description: "Scan public websites and read the Agent Surface Ladder through MCP tools.",
      type: "application/mcp-server-card+json",
      version: "1.0.0",
      url: siteUrl("/.well-known/mcp/server-card.json"),
      tags: ["website-scanner", "agent-readiness", "mcp", "webmcp"],
      capabilities: ["scan-agent-surface", "read-methodology", "read-benchmarks", "deliver-report"],
    },
    {
      identifier: "urn:air:scanwebmcp.com:mcp:documentation",
      displayName: "ScanWebMCP.com Documentation MCP server",
      description: "Search and read canonical ScanWebMCP product and developer guidance.",
      type: "application/mcp-server-card+json",
      version: "1.0.0",
      url: siteUrl("/.well-known/mcp/docs-server-card.json"),
      tags: ["documentation", "mcp", "agent-readiness"],
      capabilities: ["search-documentation", "read-guide"],
    },
    {
      identifier: "urn:air:scanwebmcp.com:api:public",
      displayName: "ScanWebMCP.com Public API",
      description: "No-key REST API for requesting scans and reading public results.",
      type: "application/vnd.oai.openapi+json",
      version: "1.0.0",
      url: siteUrl("/openapi.json"),
      tags: ["rest-api", "website-scanner", "agent-readiness"],
      capabilities: ["scan-agent-surface", "get-public-result", "get-observatory"],
    },
    {
      identifier: "urn:air:scanwebmcp.com:skill:scan-webmcp",
      displayName: "Scan a website's agent surface",
      description: "Instructions for using ScanWebMCP safely and interpreting its public result.",
      type: "application/ai-skill+md",
      version: "1.0.0",
      url: siteUrl("/skills/scan-webmcp/SKILL.md"),
      tags: ["agent-skill", "website-audit", "agent-readiness"],
      capabilities: ["choose-interface", "scan-website", "interpret-agent-readiness"],
    },
  ],
} as const;

export const API_CATALOG = {
  linkset: [
    {
      anchor: siteUrl("/.well-known/api-catalog"),
      item: [
        {
          href: siteUrl("/api/scan"),
          title: "Website scan API",
          "service-desc": [
            { href: siteUrl("/openapi.json"), type: "application/vnd.oai.openapi+json;version=3.1" },
          ],
          "service-doc": [{ href: siteUrl("/developers"), type: "text/html" }],
        },
        {
          href: siteUrl("/api/observatory"),
          title: "Observatory API",
          "service-desc": [
            { href: siteUrl("/openapi.json"), type: "application/vnd.oai.openapi+json;version=3.1" },
          ],
          "service-doc": [{ href: siteUrl("/developers"), type: "text/html" }],
        },
      ],
    },
  ],
} as const;

export const AGENT_SKILLS_INDEX = {
  $schema: "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
  version: "0.2.0",
  skills: [
    {
      name: "scan-webmcp",
      description: "Scan a public website and interpret its evidenced Agent Surface Ladder result.",
      type: "skill-md",
      url: siteUrl("/skills/scan-webmcp/SKILL.md"),
      digest: "sha256:25685285b0c8a7af8e5762717de0b6f922c421c4cae525f70d55550bfc7b41d1",
    },
  ],
} as const;
