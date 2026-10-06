# Backups

CBM's guiding rule: **never stop or recreate a running container.** Resources keep their state
and uptime through a backup.

## How each resource type is captured

| Resource | What CBM does |
| --- | --- |
| **PostgreSQL / MySQL / MariaDB / MongoDB** (standalone) | Logical dump while running (`pg_dump` / `mysqldump --single-transaction` / `mongodump`). No freeze, application-consistent. **Every database of the server** is included, not only the one Coolify created (since 2.1; earlier versions dumped only that one). System schemas holding users and grants (`mysql`, Mongo's `admin`) are left out so a restore never replaces the target's own credentials. Credentials are read from the live container / Coolify API and never stored in the manifest. |
| **Redis / KeyDB / Dragonfly** | Live RDB export (`--rdb`), no freeze. Falls back to a frozen volume copy only if no compatible CLI is present. |
| **Applications** | Each named volume + Git commit / image provenance (so the code can be re-pinned to match the data on restore). |
| **Docker-compose services** | Every named volume of the stack **plus** a logical dump of each database living inside the service (e.g. the Postgres in n8n) — application-consistent and restorable across engine versions. |
| **Host bind mounts** | Data stored in host folders (RW binds) is captured too. System binds (docker socket, `/etc/*`, `/proc`, …) are skipped. |
| **Environment variables** | Captured into the snapshot (encrypted) so it can be restored even if the original resource no longer exists in Coolify. |

For volumes, the agent briefly **freezes** (`docker pause`) only the running containers that
mount the volume **read-write**, copies it, then resumes them. Read-only mounts and resources
with no volumes are never touched.

### Resources with nothing to copy

- **Running, but no volume, host folder or database** (a stateless app or service): the snapshot
  keeps the **configuration only** — image or Git commit, environment and Coolify settings —
  shown as *configuration only*. It can't be restored in place or test-restored (there is no
  data), but **Clone** recreates the resource from it. If Coolify can't be read when the backup
  starts (API down, token revoked…), that configuration would be missing: the run then **fails**
  and alerts instead of storing an empty snapshot. (A backup *with* data keeps its data and only
  logs a warning.) If a container has written more than 50 MB inside itself (outside any
  volume), the backup log warns: those files aren't backed up and are lost whenever Coolify
  redeploys — add a volume if they are data.
- **No container on the host at all** (never deployed, deleted, or stopped and removed): the run
  is marked *skipped* — nothing is stored and no alert is sent.

### Live mode (no freeze)
Per resource you can opt into **"Copy live, without freezing (at my own risk)"** (resource →
**Options** tab) — copy volumes with zero interruption, accepting that a file rewritten exactly
during the copy could be inconsistent. Avoid it for resources that write a lot outside a
database.

### Integrity
Each archive is streamed through `tar -tf` (it must open) before upload, and after upload the
agent confirms every artifact actually landed at the destination.

---

## Hooks (per container)

Per resource you can set **pre/post-backup commands** that run inside its containers, so a
multi-container service can quiesce each part independently. They live in the **Backup hooks**
card of the resource's **Options** tab (admins only: a hook runs an arbitrary command in a
production container).

- **Targets.** The agent reports each resource's containers, so the rows are there before the
  first backup. A row targets the docker compose **service** (e.g. `worker`) when the container
  has one: that name survives redeploys, whereas Coolify renames app containers on every deploy.
  A service with several replicas runs the hook in each of them. A single-container resource
  has one *primary container* row.
- **A target that no longer matches anything is skipped** (with a warning in the backup log),
  never redirected to another container.
- **Order and failure.** Pre commands run in order; a failing or timed-out **pre** command
  **aborts** the backup. **Post** commands always run afterwards (even on failure), in
  **reverse order**, so they undo the pre steps.
- **Time limit.** Each command has a limit (default 300 s, up to 3600). The image's `timeout`
  stops the command inside the container; with busybox (Alpine) a compound command's children
  may outlive it, and an image without `timeout` keeps running it — the backup itself never waits
  past the limit.

Example: `php artisan down` (pre) / `php artisan up` (post), or flushing a cache before the copy.

---

## Scheduling & retention

Schedules are cron expressions evaluated in your configured timezone (**Settings → Timezone**).
Admins edit them in a side panel: **Set** / **Edit** on the instance card (**Coolify
instances**), with a **Frequency** control (*Hourly*, *Daily* 02:00, *Weekly* Monday 02:00,
*Monthly* the 1st at 02:00, or *Custom* cron), a **Mode** card, a **Destination** and the
**Retention**. The **…** menu next to it has *Remove the schedule*. Scope, most specific
wins:

1. a **per-resource** override (resource → **Schedule** tab → *Override schedule for this
   resource*; *revert to inherited* drops it), else
2. a **per-server** schedule (multi-server instances), else
3. the **instance** schedule.

Each schedule has a destination, a mode, and **grandfather-father-son retention**
(keep N daily / weekly / monthly; 7 / 4 / 6 by default). Retention runs after each scheduled
fire and after each successful backup on a schedule; for restic it is delegated to
`restic forget --prune`. See [Reconciliation & retention](reconciliation-retention.md).

**Modes:** `backup` keeps versioned snapshots; `sync` keeps a single copy — each run writes a new one and the previous copy is deleted only once the new one is verified. Retention isn't asked for in `sync` mode.

A resource must have **"Include in scheduled backups"** enabled to be picked up (the
**Scheduled** switch on the **Resources** list, or the resource's **Options** tab) — and a
schedule must exist (enabling the toggle alone doesn't back anything up).

You can also back up on demand (operators): **Backup** on a row of the **Resources** list or
**Back up now** on a resource page, which use the resource's effective schedule for the
destination and mode (with no schedule, any existing destination in `backup` mode). **Back up
Coolify** (the control plane's own database + data) is on the instance card.

---

## Storage

After capture, artifacts are stored via the destination's engine — one file each (**tar**) or in
an incremental, deduplicated, encrypted repository (**restic**). See [Destinations](destinations.md).
The agent runs up to `AGENT_CONCURRENCY` backups at once (default 2) — editable from CBM, see
[Agent settings](#agent-settings).

### Disk space on the agent host
Before copying a volume or host folder, the agent measures it and compares it with the free space
on its work dir (minus `AGENT_MIN_FREE_MB`, kept free on top). What happens next depends on the
agent's **copy mode** (`AGENT_STAGING_MODE`, default `auto`):

| Mode | Fits | Doesn't fit |
| --- | --- | --- |
| **auto** | Copied to the work dir, then uploaded | **Sent straight to the destination** |
| **local** | Copied to the work dir, then uploaded | The backup fails with the sizes involved |
| **direct** | Always sent straight to the destination | — |

A copy made on the host ends the freeze as soon as it's written; a **direct** send keeps the
containers frozen until the upload finishes (the backup log warns when that happens), so it
trades a longer pause for no local space. Encryption is applied while copying, so an encrypted
backup needs no more room than a plain one. Database dumps always go through the work dir.

The **restic** engine backs up a local folder: it always needs the copy on the host, so with
too little room the backup fails with the sizes involved, whatever the mode.

### Agent settings
Admins can set the agents' concurrency, free space kept, copy mode and log level from CBM:
**Agents** → **Default settings** for all agents, or the gear on an agent's row to override
them for that host (leave a field empty to keep the default). Changes apply on the agent's next
heartbeat. A value set by environment variable on the host wins: the field is locked and shows
the host's value. See [Configuration](configuration.md#agent-environment-variables).
