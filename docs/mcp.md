# MCP server — drive CBM from any AI agent

CBM ships an [MCP](https://modelcontextprotocol.io) server (`@cbm/mcp`,
`ghcr.io/holo795/cbm-mcp`) that exposes CBM's operations as tools, so any
MCP-capable agent — Claude Desktop, Claude Code, Cursor, Cline, your own
agent — can inspect your fleet and trigger backups in plain language.

It is a thin client: it talks to the controller's token-authenticated
`/api/v1` REST surface. Nothing bypasses CBM's role model — a token can do
exactly what a user of that role can do, and no more.

## 1. Create a token

In the controller (admin): **Settings → API tokens (MCP) → New token**. Give it
a name, pick a role card, then **Create token**:

| Role | Can do |
|---|---|
| **viewer** | read-only: list instances, resources, snapshots, destinations, agents, jobs |
| **operator** | viewer **+** trigger a backup, mirror a snapshot, verify a destination, run a test restore |
| **admin** | full API access — grant only when you need it |

The token is shown **once**. Copy it; only its hash is stored. Revoke it any
time from the token's "…" menu → **Revoke** (it stops working immediately).

For the "reads + safe triggers" an agent usually needs, pick **operator**.

## 2. Configuration

The server is configured entirely from the environment:

| Variable | Required | Default | Meaning |
|---|---|---|---|
| `CBM_URL` | yes | — | Controller base URL, e.g. `https://cbm.example.com` |
| `CBM_TOKEN` | stdio: yes · http: optional | — | The API token. In HTTP mode, if omitted each agent must forward its own `Authorization: Bearer` |
| `CBM_MCP_TRANSPORT` | no | `stdio` | `stdio` or `http` |
| `CBM_MCP_HOST` | no | `127.0.0.1` | HTTP bind host (`0.0.0.0` in the container) |
| `CBM_MCP_PORT` | no | `8790` | HTTP port |
| `CBM_MCP_AUTH_TOKEN` | http + `CBM_TOKEN` off loopback: yes | — | Shared secret every HTTP caller must send as `Authorization: Bearer` when `CBM_TOKEN` is server-wide |

## 3. stdio — local agents (Claude Desktop, Cursor, Cline…)

The agent spawns the server and talks over stdin/stdout. Add it to the
client's MCP config.

With Docker (no checkout needed):

```json
{
  "mcpServers": {
    "cbm": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "-e", "CBM_URL=https://cbm.example.com",
        "-e", "CBM_TOKEN=cbm_pat_xxx",
        "-e", "CBM_MCP_TRANSPORT=stdio",
        "ghcr.io/holo795/cbm-mcp:latest"
      ]
    }
  }
}
```

Or with Node, from a checkout you've built (`npm run build -w @cbm/mcp`):

```json
{
  "mcpServers": {
    "cbm": {
      "command": "node",
      "args": ["/opt/cbm/packages/mcp/dist/index.js"],
      "env": { "CBM_URL": "https://cbm.example.com", "CBM_TOKEN": "cbm_pat_xxx" }
    }
  }
}
```

## 4. HTTP — remote agents

Run the server as a service and let agents connect over the network
(Streamable HTTP). Endpoint: `POST /mcp`; health probe: `GET /health`.

**Per-agent identity (recommended):** leave `CBM_TOKEN` unset and the server
uses the `Authorization: Bearer <token>` each request carries, so different
agents act as their own CBM token (and role):

```sh
docker run -d --name cbm-mcp -p 8790:8790 \
  -e CBM_URL=https://cbm.example.com \
  ghcr.io/holo795/cbm-mcp:latest
```

**Server-wide token:** with `CBM_TOKEN` set, every caller acts with that token.
Since 2.1.0 the server refuses to start that way on a non-loopback address
unless `CBM_MCP_AUTH_TOKEN` is also set; callers then send that shared secret
as their bearer token:

```sh
docker run -d --name cbm-mcp -p 8790:8790 \
  -e CBM_URL=https://cbm.example.com \
  -e CBM_TOKEN=cbm_pat_xxx \
  -e CBM_MCP_AUTH_TOKEN="$(openssl rand -hex 32)" \
  ghcr.io/holo795/cbm-mcp:latest
```

Point an HTTP MCP client at `http://your-host:8790/mcp` and put it behind TLS
and your reverse proxy.

Other guards: request bodies over 1 MiB get `413`, and a server bound to
loopback only answers requests whose `Host` is `localhost`/`127.x`/`::1`
(`403` otherwise), which blocks DNS-rebinding from a browser.

The HTTP transport is stateless (a fresh session per request), so no sticky
sessions are needed behind a load balancer.

## 5. Tools

Reads (viewer+):

- `cbm_whoami` — check the token and its role
- `cbm_list_instances`
- `cbm_list_resources` — filter by `instanceId`, `backupEnabled`
- `cbm_get_resource` — one resource + its effective schedule
- `cbm_list_snapshots` — filter by `resourceId`, `status`, `limit` (default 50, max 200)
- `cbm_get_snapshot` — one snapshot + its artifacts
- `cbm_list_destinations`
- `cbm_list_agents` — filter by `instanceId`
- `cbm_list_jobs` — filter by `type` (`backup`, `restore`, `prune`, `mirror`,
  `verify-destination`, `restore-drill`), `status`, `limit` (default 25, max 100)
- `cbm_get_job` — one job + its full event log

Triggers (operator+):

- `cbm_backup_resource` — back up a resource now
- `cbm_mirror_snapshot` — copy a snapshot to its destination's mirror
- `cbm_verify_destination` — check snapshots are present (and, with `deep`, intact)
- `cbm_test_restore` — restore a snapshot into an agent-side sandbox to prove it restores
  (never touches Coolify); read the outcome back as `lastDrill` from `cbm_get_snapshot`

Restore, self-backup and recovery-file operations are intentionally **not**
exposed — those stay in the controller UI so an agent can never overwrite a
live resource or move the disaster-recovery seed.

## 6. Security notes

- A token is a credential. Store it like a password; revoke it when done.
- Scope down: give an agent a **viewer** token unless it genuinely needs to
  trigger backups.
- The MCP server never sees your Coolify API token, destination credentials or
  encryption keys — those never leave the controller.
- `/api/v1` is rate-limited per client IP (240 requests/minute; `429` with
  `Retry-After` beyond that) and every filter is validated — an unknown
  `status`/`type` or an out-of-range `limit` is rejected with a `400`. The
  sign-in, sign-up and password-reset endpoints have their own stricter limits.
