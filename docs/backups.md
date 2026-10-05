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

### Live mode (no freeze)
Per resource you can opt into **"live, no freeze"** — copy volumes with zero interruption,
accepting that a file rewritten exactly during the copy could be inconsistent. Useful for
resources that write a lot outside a database.

### Integrity
Each archive is streamed through `tar -tf` (it must open) before upload, and after upload the
agent confirms every artifact actually landed at the destination.

---

## Hooks (per container)

Per resource you can set **pre/post-backup commands** that run inside its containers, so a
multi-container service can quiesce each part independently (admins only: a hook runs an
arbitrary command in a production container).

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
Scope, most specific wins:

1. a **per-resource** override, else
2. a **per-server** schedule (multi-server instances), else
3. the **instance** schedule.

Each schedule has a destination, a mode, and **grandfather-father-son retention**
(keep N daily / weekly / monthly). Retention runs after each scheduled fire; for restic it is
delegated to `restic forget --prune`. See
[Reconciliation & retention](reconciliation-retention.md).

**Modes:** `backup` keeps versioned snapshots; `sync` keeps a single copy — each run writes a new one and the previous copy is deleted only once the new one is verified.

A resource must have **"Include in scheduled backups"** enabled to be picked up — and a schedule
must exist (enabling the toggle alone doesn't back anything up).

You can also **Back up now** from any resource, and **Back up Coolify** (the control plane's own
database + data) from the instance card.

---

## Storage

After capture, artifacts are stored via the destination's engine — one file each (**tar**) or in
an incremental, deduplicated, encrypted repository (**restic**). See [Destinations](destinations.md).
The agent runs up to `AGENT_CONCURRENCY` backups at once (default 2).
