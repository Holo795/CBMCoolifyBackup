# @cbm/mcp

MCP server for CBM — exposes the controller's `/api/v1` operations as tools so
any MCP-capable AI agent can inspect the fleet and trigger backups.

- Transports: **stdio** (local, process-spawned) and **Streamable HTTP** (remote).
- Auth: a CBM API token (**Settings → API tokens**) whose role gates what the
  agent can do. Nothing bypasses CBM's role model.

Configure with `CBM_URL`, `CBM_TOKEN`, and optionally `CBM_MCP_TRANSPORT`
(`stdio` | `http`), `CBM_MCP_HOST`, `CBM_MCP_PORT`.

Full guide, client config and the tool reference: **[docs/mcp.md](../../docs/mcp.md)**.
