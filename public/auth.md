# Authentication for ScanWebMCP.com

## Discover

The public REST API and MCP server require no account, API key, OAuth flow, identity assertion, or bearer token. Agents can call the documented scan, result, and observatory endpoints directly over HTTPS. The service intentionally does not publish OAuth protected-resource or authorization-server metadata because it is not an OAuth resource.

## Pick a method

Use unauthenticated HTTPS. Do not send an `Authorization` header. There is no alternate `agent_auth`, `identity_assertion`, `service_auth`, HTTP Message Signature, or cookie-based API authentication method.

## Register

Registration is not required or available for the public API. There is no client identifier, client secret, dynamic registration endpoint, or self-serve key to create.

## Claim

No identity claim is required. ScanWebMCP does not expose an `identity_endpoint`, accept an ID-JAG assertion, or mint a claim token for public API access.

## Exchange

There is no token exchange. Clients should not request or invent an `access_token`; the public endpoints accept the documented request directly.

## Use the access_token

Not applicable. Send the JSON request without bearer credentials. A `401` or `WWW-Authenticate` challenge is not part of the normal public API contract.

## Limits

Public scans are rate-limited and recent results may be returned from cache. These controls protect target websites from repeated crawling; they are not an authentication challenge. A `429` response includes a structured explanation and a retry hint.

## Report delivery

Sending a full report by email is a consequential MCP action. A direct request from the human to send a report to an address they supplied is sufficient confirmation for that transactional email. Never guess, look up, or auto-fill an address. Benchmark updates are a separate opt-in and remain disabled unless explicitly requested and confirmed.

## Errors

Clients should handle the documented JSON error object and HTTP status. A `400` means the body or target is invalid; `404` means the scan slug does not exist; `429` is an abuse limit rather than an authentication failure; and `500` or `503` is temporary service failure.

## Revocation

There is no credential to revoke. A domain controller can opt a site out of future scanning through https://www.scanwebmcp.com/opt-out, and a report recipient can decline or unsubscribe from separately opted-in benchmark updates.
