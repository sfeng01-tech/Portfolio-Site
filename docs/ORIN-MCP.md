# ORIN MCP server

`@portfolio/orin-mcp` is a local, read-only MCP server for Codex and other MCP clients. It exposes ORIN digest dates, daily digests, source excerpts, and item search without adding a browser-authentication layer.

## Tools

- `orin_get_digest`: latest digest, a selected date, or all bookmarked items with `savedOnly: true`.
- `orin_list_dates`: recent digest dates.
- `orin_search_items`: search titles, excerpts, authors, and topics; optionally search only saved items.
- `orin_get_item`: retrieve one item by its canonical 64-character ID.

The server speaks MCP `2025-06-18` over newline-delimited JSON-RPC 2.0 on stdio. Tool results include JSON text and `structuredContent`.

## Hosting options

### Always-running laptop

This is the simplest and most private option. Codex starts `apps/orin-mcp/server.mjs` locally over stdio, so no MCP endpoint is exposed to the internet. An always-running laptop does not need a separate daemon: configure Codex to launch the server on demand.

### Render

Use `render-orin-mcp.yaml` to deploy `apps/orin-mcp/http.mjs` as a Render Web Service. The service exposes:

- `GET /health`: public readiness check.
- `POST /mcp`: authenticated MCP Streamable HTTP JSON transport.
- `DELETE /mcp`: authenticated session termination.

Set `ORIN_MCP_TOKEN` to a token of at least 32 characters. The server does not enable browser CORS or server-initiated SSE streams. Render terminates TLS at its edge and forwards plain HTTP to the service on `PORT`.

Codex can use the hosted endpoint through the local bridge:

```toml
[mcp_servers.orin]
command = "node"
args = ["/Users/sahilfaizal/Desktop/projects/Portfolio-Site/apps/orin-mcp/client.mjs"]
env = { ORIN_MCP_URL = "https://<your-render-service>.onrender.com/mcp", ORIN_MCP_TOKEN = "<secret>" }
```

Render's free tier spins down during inactivity and may cold-start on the next request. For always-available service, use a paid plan or the laptop option.

### GitHub Actions runner

GitHub Actions is not recommended for this MCP server. Job runners are ephemeral, do not provide a stable inbound endpoint for Codex, and are intended for workflow execution rather than a durable personal service. Actions remains appropriate for the scheduled ORIN collector.

## Environment

Use `ORIN_MCP_DATABASE_URL` when possible, backed by a Neon role with only `SELECT` on `orin_digests`, `orin_items`, and `orin_digest_items`. The server falls back to `ORIN_DATABASE_URL`, but that fallback has broader database permissions.

```sql
CREATE ROLE orin_agent_read LOGIN;
GRANT USAGE ON SCHEMA public TO orin_agent_read;
GRANT SELECT ON orin_digests, orin_items, orin_digest_items TO orin_agent_read;
```

Do not commit the connection string.

## Codex setup

Add this to your user-level Codex MCP configuration, replacing `<read-only Neon connection string>`:

```toml
[mcp_servers.orin]
command = "node"
args = ["/Users/sahilfaizal/Desktop/projects/Portfolio-Site/apps/orin-mcp/server.mjs"]
env = { ORIN_MCP_DATABASE_URL = "<read-only Neon connection string>" }
```

Then run Codex from the user-level configuration; do not put the database secret in a committed repository file.

## Verification

```bash
npm run test:orin-mcp
```

For the HTTP transport and remote bridge:

```bash
npm run test --workspace=@portfolio/orin-mcp
```

For a manual stdio smoke test:

```bash
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize"}' | ORIN_MCP_DATABASE_URL='<read-only connection string>' npm run mcp:orin
```
