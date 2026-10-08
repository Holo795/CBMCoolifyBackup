# Configuration

## Controller environment variables

| Variable | Required | Default | Description |
| --- | :---: | --- | --- |
| `DATABASE_URL` | ✅ (prod) | — | PostgreSQL connection string for the controller's metadata DB. |
| `BETTER_AUTH_SECRET` | ✅ | `dev-insecure…` | Long random string for session signing. Also the fallback for `MASTER_KEY`. `AUTH_SECRET` is accepted as an alias. |
| `BETTER_AUTH_URL` | ✅ | `http://localhost:3000` | The public URL the app is served at (used by auth + links in alerts). `APP_URL` is accepted as an alias. In production it is the only origin trusted for sign-in requests. |
| `MASTER_KEY` | recommended | falls back to `BETTER_AUTH_SECRET` | Base64, 32 bytes. Encrypts all secrets at rest (and restic repo passwords). **Back this up.** |
| `AGENT_IMAGE` | — | `ghcr.io/holo795/cbm-agent` | Agent image the install command / `/install.sh` tells hosts to run. |
| `AGENT_IMAGE_TAG` | — | `latest` | Tag for the agent image. |
| `COOLIFY_API_RATE_LIMIT` | — | `120` | Calls per minute CBM allows itself towards each Coolify instance. Coolify limits its API per user (its own `API_RATE_LIMIT`, 200 a minute by default); a call that still gets "429 Too Many Attempts" waits what Coolify asks and is retried. Lower it if you use the same Coolify token elsewhere. |
| `AGENT_CONTROLLER_URL` | — | falls back to `BETTER_AUTH_URL` | URL agents dial to reach the controller, if it differs from the browser URL (e.g. `http://host.docker.internal:3000` in local dev). |
| `PASSWORD_BREACH_CHECK` | — | `true` | Refuse new passwords (sign-up, change, reset) that appear in a known breach, via HaveIBeenPwned's k-anonymity API (only the first 5 characters of the password's SHA-1 leave the server). If the API can't be reached within 3 s the password is accepted. `false` turns it off. |

Generate secrets:

```bash
openssl rand -hex 32                                                      # BETTER_AUTH_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"  # MASTER_KEY
```

### Startup checks (production)

Since 2.1, a production controller (`NODE_ENV=production`, as in the image) **refuses to start**
rather than run insecurely:

- **`BETTER_AUTH_SECRET` missing or left at the public default** — anyone could forge a session
  cookie.
- **`MASTER_KEY` set but not a base64-encoded 32-byte key** — it used to be ignored silently in
  favour of the key derived from `BETTER_AUTH_SECRET`; fixing it later would then have made every
  stored secret undecryptable. Leaving `MASTER_KEY` **empty** is still allowed (the derived key is
  used).

**Upgrading an install that ran with the default secret and no `MASTER_KEY`.** Its stored secrets
(Coolify tokens, destination credentials, keys) were encrypted with the key derived from the
default secret. Set `MASTER_KEY` to that key first, so they keep decrypting, then set a real
`BETTER_AUTH_SECRET` (everyone signs in again):

```bash
MASTER_KEY=Sim+zqQAguUSPC+1o13hyzhjra/Ul+BPul7ZsVI6ghs=   # derived from the public default
```

That key is derived from a public string, so it protects nothing. Once the controller is up, plan
a move to a fresh key by re-entering your secrets.

A failed database migration also stops the container now, instead of starting the app on an
out-of-date schema.

### Optional OAuth login

Set the pair(s) you want: each configured provider gets a **Continue with …** button on the
sign-in page. `GITLAB_ISSUER` is only needed for a self-managed GitLab (default `https://gitlab.com`).
The callback URL to register with the provider is `<BETTER_AUTH_URL>/api/auth/callback/<provider>`
(`github`, `google` or `gitlab`).

| Provider | Variables |
| --- | --- |
| GitHub | `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` |
| Google | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| GitLab | `GITLAB_ISSUER`, `GITLAB_CLIENT_ID`, `GITLAB_CLIENT_SECRET` |

### Email (SMTP)

Optional — enables password reset, account verification, and emailed invitations. You can
also set these from **Settings → Email (SMTP)** in the UI; **any value set here overrides the
UI and locks that field** (config-as-code wins). Env-provided SMTP is trusted (no "send test"
needed). Full guide: **[Email (SMTP)](email.md)**.

| Variable | Default | Description |
| --- | --- | --- |
| `SMTP_HOST` | — | SMTP server hostname, e.g. `smtp.mailgun.org`. |
| `SMTP_PORT` | — | `587` (STARTTLS) or `465` (implicit TLS). |
| `SMTP_SECURE` | — | `true` for implicit TLS (port 465). Unset: the UI setting, else `true` only on port 465. |
| `SMTP_USER` / `SMTP_PASSWORD` | — | SMTP credentials. |
| `SMTP_FROM` | — | From address, e.g. `backups@yourdomain.com`. |
| `SMTP_FROM_NAME` | — | Optional display name, e.g. `CBM Backups`. |

---

## Agent environment variables

Most are set by the install command; you rarely set them by hand. The ones marked **(CBM)** can
also be changed from CBM (**Agents** → **Default settings**, or the gear on an agent's row):
CBM's values apply on the next heartbeat, without a restart. A variable set on the host wins
over CBM — the field is then locked in the dialog and shows the host's value.

| Variable | Default | Description |
| --- | --- | --- |
| `CONTROLLER_URL` | `http://localhost:3000` | Where the agent reaches the controller. |
| `ENROLLMENT_TOKEN` | — | The instance's enrollment token (instance card → **…** → **Install command**); exchanged for a bearer token on first start. |
| `AGENT_TOKEN` | — | Bearer token (set automatically after enrollment). |
| `AGENT_HOSTNAME` | OS hostname | Identifies this agent (one agent per instance + hostname). |
| `AGENT_SERVER_UUID` | — | Pin this agent to a Coolify server (disables auto-detection). Usually left unset. |
| `AGENT_CONCURRENCY` **(CBM)** | `2` | How many jobs the agent runs at once (1–16). |
| `AGENT_WORK_DIR` | `/var/lib/cbm-agent` (image) | Local staging directory for artifacts before upload (`/tmp/cbm-agent` when run outside the image). |
| `AGENT_MIN_FREE_MB` **(CBM)** | `1024` | Free space kept on the work dir's disk: a backup checks it before freezing anything, a local copy never eats into it, and a restore/mirror/drill needs twice the snapshot size on top. |
| `AGENT_STAGING_MODE` **(CBM)** | `auto` | How volumes are copied. **tar**: `auto` (through the work dir when it has room, otherwise straight to the destination), `local` (always through the work dir; refuse when it doesn't fit) or `direct` (always straight to the destination). **restic**: `auto` and `direct` read each volume in place (no copy, only changed files), `local` copies it to the work dir first. See [Backups → Disk space on the agent host](backups.md#disk-space-on-the-agent-host). |
| `DOCKER_BIN` | `docker` | Path to the Docker CLI. |
| `POLL_INTERVAL_MS` | `5000` | Job poll interval. |
| `HEARTBEAT_INTERVAL_MS` | `30000` | Heartbeat interval. |
| `LOG_LEVEL` **(CBM)** | `info` | `debug`, `info`, `warn` or `error`. |
| `AGENT_FREEZE_METHOD` **(CBM)** | `pause` | How containers are frozen during a copy: `pause` (`docker pause`) or `cgroup` (the same freeze, invisible to Docker, so a health-checked container stays healthy behind Coolify's proxy; needs privileged containers). See [Backups → Freezing and health checks](backups.md#freezing-and-health-checks). |
| `RESTIC_READ_CONCURRENCY` **(CBM)** | `2` | Files restic reads at once (1–32). Raise it on fast disks (NVMe), e.g. 4 to 8. |
| `RESTIC_PACK_SIZE` **(CBM)** | `16` | Size of the packs restic writes, in MiB (4–128). Bigger packs mean fewer files on a remote (SFTP, S3), e.g. 64, at the cost of memory. |
| `RESTIC_CACHE_DIR` | `<work dir>/restic-cache` | restic's cache of the repositories' index. In the work dir (a persistent volume), so it survives agent updates and restic doesn't download the index again on every run. |

The agent container must mount the Docker socket and (for "local" destinations) a persistent
`/backups` volume — the install command does both.

---

## App settings (in the UI)

- **Settings → Timezone** — IANA timezone used to evaluate schedules (cron) and display every
  timestamp. Stored server-side, the same for everyone.
- **Settings → Failure alerts** — a webhook URL (Discord / Slack / custom) notified on backup
  failures, missing backups, and overdue backups. See [Alerts](alerts.md).
- **Settings → Email (SMTP)** — SMTP details (unless set by env), a test send, and the "Require
  email verification" switch. See [Email](email.md).
- **Settings → Disaster recovery** — the metadata self-backup and the recovery file. See
  [Disaster recovery](disaster-recovery.md).
- **Settings → Restore drills** — "Run a drill every week". See
  [Restore](restore.md#test-restores-restore-drills).
- **Settings → API tokens (MCP)** — **New token** creates a machine token with its own role. See
  [MCP server](mcp.md).

Settings is admin-only; on wide screens a sticky nav on the left jumps between these sections.
