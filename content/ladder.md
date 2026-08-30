<!--
SPDX-FileCopyrightText: 2026 Sara Simeone
SPDX-License-Identifier: LicenseRef-Agent-Surface-Ladder
-->

# The Agent Surface Ladder — v1.0

*A published, versioned rubric for how much of a business an AI agent can see, understand, and act on. By Sara Simeone (Agentic Sara). Rubric version 1.0.0 · published August 2026.*

*Copyright © 2026 Sara Simeone. All rights reserved. This authored rubric text is governed by the repository's [separate content terms](../LICENSES/LicenseRef-Agent-Surface-Ladder.txt).*

AI agents stopped being hypothetical visitors this year. ChatGPT's desktop browser executes website-registered tools as of 25 August 2026; Chrome is trialling the same standard (WebMCP); Claude and ChatGPT have called MCP endpoints for over a year. The question for a business is no longer *whether* agents will visit, but what they find when they do: something to read, something to ask, something to call — or nothing at all.

**Scope.** The rubric measures businesses that sell products or services to buyers — firms whose customers ask questions, enquire, book or order. Media, government and reference sites sit outside its scope by design; their scores read as out-of-scope, not as verdicts.

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

**Rung 4 requires consented verification.** Transactable means completing a real action end to end. The public automated scan does not book, order, purchase or submit on a site's behalf without permission, so it assesses up to rung 3. Rung 4 is awarded only through a consented invocation test; an advertised transactional tool is not enough on its own.

## What is measured

Five dimensions feed the rung. The public result shows the score, rung and dimension summary; the free emailed report unlocks every observed signal with its exact URL and timestamp. The weighting of observations into scores is the rubric's method, refined against the benchmark corpus and versioned with every scan.

| Dimension | What we capture |
|---|---|
| D1 Legibility | Can an agent read you at all? robots.txt agent directives, llms.txt, content without JavaScript, sitemap, structured data, title/meta coherence — and whether you serve agents an optimised representation. |
| D2 Answerability | Can an agent answer a buyer's question about you? Price visibility, service definitions, FAQ coverage, and whether those pages are even discoverable. |
| D3 Callability | Is there anything an agent can invoke? MCP endpoints (content-validated), WebMCP registrations, booking embeds — and forms, which are tools with a schema waiting to be written. |
| D4 Transactability | How far from intent to commitment? Contact affordances, friction markers, the path to action. |
| D5 Standing | Would an agent trust and cite you? Entity clarity, named people, consistency. (Deliberately coarse in v1.) |

Two measurement rules distinguish this rubric from a checklist:

1. **Evidence, not opinion.** Every finding records what was observed, at which URL, at what time. A claim without a timestamp and a URL is not a finding.
2. **Validated verdicts, not status codes.** A URL that answers "200 OK" with a login page is not an MCP endpoint; an llms.txt that returns an HTML error page is not an llms.txt. Every probe checks what actually came back.

## A worked example: rung 3 in the wild

Firecrawl's keyless launch removed the last human step between an agent and its product — no signup, no API key, no card. An agent can discover it, call it, and use it, this afternoon. That is what Callable looks like as a commercial decision rather than a technical aspiration — and it was done by a real company, this quarter, as customer acquisition.

## Versioning

**The rubric is refined quarterly against the benchmark corpus.** As the dataset grows, thresholds and weightings are re-cut to match how the agent-facing web actually behaves — a living standard, not a frozen checklist. Scores are comparable only within a rubric version: this is v1.0.0, changes are logged here, and every scan records the version it was scored against.

*The first implementation of this rubric is the [Agent Surface Scan](/) — which is itself agent-callable, because a rubric about callability that an agent cannot call would be embarrassing.*
