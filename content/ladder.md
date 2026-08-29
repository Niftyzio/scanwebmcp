# The Agent Surface Ladder — v1.0

*A published, versioned rubric for how much of a business an AI agent can see, understand, and act on. By Sara Simeone (Agentic Sara). Rubric version 1.0.0 · published September 2026.*

AI agents stopped being hypothetical visitors this year. ChatGPT's desktop browser executes website-registered tools as of 25 August 2026; Chrome is trialling the same standard (WebMCP); Claude and ChatGPT have called MCP endpoints for over a year. The question for a business is no longer *whether* agents will visit, but what they find when they do: something to read, something to ask, something to call — or nothing at all.

The Ladder names five positions. A business sits on the highest rung it fully satisfies. Every rung is a position of opportunity: the point is never that you have failed a check, but that the next rung is specific, nearby, and nameable.

## The five rungs

| Rung | Name | You are here if… |
|---|---|---|
| 0 | **Invisible** | Agents are blocked in robots.txt, or your core content doesn't exist without JavaScript. Agents cannot reliably read you at all. |
| 1 | **Readable** | An agent can retrieve your pages and understand what you do. |
| 2 | **Answerable** | An agent can answer a buyer's real questions — what you offer, for whom, at what price band, with what availability — without a human stepping in. |
| 3 | **Callable** | At least one of your capabilities is invocable: an MCP endpoint, a documented API, or a registered WebMCP tool. |
| 4 | **Transactable** | An agent can complete a meaningful action end to end — book, order, submit, purchase — with human *confirmation* rather than human *labour*. |

Rungs are gated: you cannot be Callable while Invisible — an endpoint nobody can discover doesn't count.

## What is measured

Five dimensions feed the rung and the composite score. Weights are published because a rubric you can't inspect is an opinion, not a standard.

| Dimension | Weight | What it asks |
|---|---|---|
| D1 Legibility | 25% | Can an agent read you at all? robots.txt agent directives, llms.txt, content without JavaScript, sitemap, structured data, title/meta coherence — and whether you serve agents an optimised representation. |
| D2 Answerability | 30% | Can an agent answer a buyer's question about you? Price specificity, service definitions, FAQ coverage, and whether those pages are even discoverable. |
| D3 Callability | 20% | Is there anything an agent can invoke? Validated MCP endpoint probes, WebMCP registrations, booking embeds — and forms, which are tools with a schema waiting to be written. |
| D4 Transactability | 15% | How far from intent to commitment? Contact affordances, friction markers, steps to action. |
| D5 Standing | 10% | Would an agent trust and cite you? Entity clarity, named people, consistency. (Deliberately crude in v1; the weight rises as measurement improves.) |

Two measurement rules distinguish this rubric from a checklist:

1. **Evidence, not opinion.** Every finding records what was observed, at which URL, at what time. A claim without a timestamp and a URL is not a finding.
2. **Validated verdicts, not status codes.** A URL that answers "200 OK" with a login page is not an MCP endpoint; an llms.txt that returns an HTML error page is not an llms.txt. Every probe checks what actually came back.

## A worked example: rung 3 in the wild

Firecrawl's keyless launch removed the last human step between an agent and its product — no signup, no API key, no card. An agent can discover it, call it, and use it, this afternoon. That is what Callable looks like as a commercial decision rather than a technical aspiration — and it was done by a real company, this quarter, as customer acquisition.

## Versioning

Scores are comparable only within a rubric version. This is v1.0.0; changes are logged here, and every scan records the version it was scored against.

*The first implementation of this rubric is the [Agent Surface Scan](/) — which is itself agent-callable, because a rubric about callability that an agent cannot call would be embarrassing.*
