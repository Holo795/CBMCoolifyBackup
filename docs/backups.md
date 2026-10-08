# Backups

CBM's guiding rule: **never stop or recreate a running container.** Resources keep their state
and uptime through a backup.

## How each resource type is captured

| Resource | What CBM does |
| --- | --- |
| **PostgreSQL / MySQL / MariaDB / MongoDB** (standalone) | Logical dump while running (`pg_dump` / `mysqldump --single-transaction` / `mongodump`). No freeze, application-consistent. **Every database of the server** is included, not only the one Coolify created (since 2.1; earlier versions dumped only that one). System schemas holding users and grants (`mysql`, Mongo's `admin`) are left out so a restore never replaces the target's own credentials. Credentials are read from the live container / Coolify API and never stored in the manifest. MySQL / MariaDB are dumped as `root` when its password is known; when it isn't (`MARIADB_RANDOM_ROOT_PASSWORD` / `MYSQL_RANDOM_ROOT_PASSWORD`), as the application user the image created (`MARIADB_USER` / `MYSQL_USER`), which has every right on its database. A login the database refuses (a password changed in the database after the container was created - MySQL only reads these variables the first time) moves on to the next one before the dump is declared failed. Passwords given as files (`*_PASSWORD_FILE`, Docker secrets) are read inside the container. When the database's image has no client tools (`mariadb-dump`, `pg_dump`…), the dump runs from a short-lived container of the engine's **official image** - the server's version when the container says it (`MARIADB_VERSION`, `PG_MAJOR`, the data folder's `PG_VERSION`…) - attached to the database's network; restores do the same. A login set in CBM wins over all of this (see [Database dump login](#database-dump-login)). |
| **Redis / KeyDB / Dragonfly** | Live RDB export (`--rdb`), no freeze. Falls back to a frozen volume copy only if no compatible CLI is present. |
| **Applications** | Each named volume + Git commit / image provenance (so the code can be re-pinned to match the data on restore). |
| **Image versions** | For every container: the image as written, the digest it ran and its version, so a restore runs the same version as the data (see [Restore](restore.md#image-versions)). |
| **Docker-compose services** | Every named volume of the stack **plus** a logical dump of each database living inside the service (e.g. the Postgres in n8n) — application-consistent and restorable across engine versions. |
| **Host bind mounts** | Data stored in host folders (RW binds) is captured too. System binds (docker socket, `/etc/*`, `/proc`, …) are skipped. A folder that sits inside another one of the resource (`…/data` and `…/data/uploads`) is copied with it, not read twice. |
| **Coolify control plane** ("Back up Coolify") | A logical dump of Coolify's own database, plus its folders on the host (read live): `source/` (the `.env` holding the **APP_KEY** that decrypts the secrets stored in the database), `ssh/` (the keys to every server) and `proxy/` (Traefik's configuration and certificates) - found next to the `.env` the `coolify` container mounts, usually under `/data/coolify`. `applications/`, `services/`… are each resource's own data, backed up with that resource. The backup log lists the folders taken, and the backup **fails** if the `.env` is missing: without the APP_KEY the copy couldn't rebuild Coolify. (Before 2.4.4 only the database was kept on a standard install.) |
| **Environment variables** | Captured into the snapshot (encrypted) so it can be restored even if the original resource no longer exists in Coolify. |

For volumes, the agent briefly **freezes** only the running containers that mount them
**read-write**, copies them, then resumes them — **once per backup**, for all of a resource's
volumes and folders together (with restic, after a first pass that runs without freezing).
Read-only mounts and resources with no volumes are never touched. The backup log says how long
the containers stayed frozen.

### Freezing and health checks
With `docker pause`, Docker reports a container that has a **health check** as *unhealthy* the
moment it's frozen, and keeps doing so until its next check — after it's resumed. Coolify's
proxy (Traefik) only routes to healthy containers, so a two-second freeze can make the app
unreachable for up to its check **interval** (30 s by default), as soon as Traefik refreshes in
between (any Docker event on the host). The backup log warns before freezing such a container,
and says when it was reported healthy again.

To avoid it, set the agent's **freeze method** to **Invisible to Docker (cgroup)** (**Agents** →
default settings or the gear on an agent's row; `AGENT_FREEZE_METHOD=cgroup`). The containers are
frozen the same way — the kernel's cgroup freezer, which `docker pause` uses — but without telling
Docker: they stay healthy and keep their route; requests simply wait during the freeze. It runs a
short-lived **privileged** helper container on the host (see [Security](security.md)); where that
isn't possible the agent falls back to `docker pause` and says so. A container left frozen by an
agent killed mid-backup is thawed when the agent starts again, whichever method froze it.

Otherwise, shorten the app's health check interval in Coolify (the outage is at most that long),
or use live mode below.

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

### SQLite databases
With the restic engine, a SQLite database found in a volume or host folder (a `.sqlite`,
`.sqlite3` or `.db` file of 32 MiB or more, four levels deep at most - n8n, Uptime Kuma…) is copied
consistently **while the application runs** (`VACUUM INTO`, from a short-lived container of the
agent's image; the live database is opened read-only), and that copy is backed up in place of the
live file; its `-wal` / `-shm` files are left out. A frozen pass then doesn't re-read a large
database that changed, and the copy is never caught half-written. A restore puts back that
consistent file, without the old journal. The copy needs the database's size free on the agent
host; without it, the live file is backed up as before (the log says so).

### Live mode (no freeze)
Per resource you can opt into **"Copy live, without freezing (at my own risk)"** (resource →
**Options** tab) — copy volumes with zero interruption, accepting that a file rewritten exactly
during the copy could be inconsistent. Avoid it for resources that write a lot outside a
database.

Live mode never applies to a database container whose logical dump failed: its files are then the
only copy of the database, so that container is frozen anyway (the others stay live) and the log
says so.

### Database dump login
By default the agent dumps a database with the credentials its container's environment gives
(see the table above). When that isn't enough - the password was changed in the database since
the container was created, the root password is random and a database created by another user
must be in the dump, or the image takes its credentials some other way - an admin can set the
login to use on the resource's **Options** tab → **Database dump login**: a user and a password,
stored encrypted (master key) and never shown again. It is used for every database container of
the resource, for backups and for restores in place. Remove it to go back to the environment. The
card only shows for a resource with a database: a database itself, one whose containers include a
PostgreSQL, MySQL, MariaDB or MongoDB (as its agent reports), one whose last backup holds a dump, or
one that already has a login set.

A MySQL / MariaDB dumped as a user other than `root` only holds the databases that user can see.
When the server has others, the backup says which ones, with a warning: they are then only in the
copy of the volume - set a login that sees them.

### Backups with warnings
A backup that completes but lost something on the way - a database inside the resource that
couldn't be dumped, live mode not applied - is shown **with warnings** (orange) in the lists, and its
page lists them. Check them: the data is there, but not everything you may count on.

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
Coolify** (the control plane's own database, `.env`, SSH keys and proxy configuration) is on the
instance card.

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

| Mode | tar: fits | tar: doesn't fit | restic |
| --- | --- | --- | --- |
| **auto** | Copied to the work dir, then uploaded | **Sent straight to the destination** | **Read in place** (below) |
| **local** | Copied to the work dir, then uploaded | The backup fails with the sizes involved | Copied to the work dir as a `.tar` (fails the same way when it doesn't fit) |
| **direct** | Always sent straight to the destination | — | **Read in place** |

A copy made on the host ends the freeze as soon as it's written; a **direct** send keeps the
containers frozen until the upload finishes (the backup log warns when that happens), so it
trades a longer pause for no local space. Encryption is applied while copying, so an encrypted
backup needs no more room than a plain one. Database dumps always go through the work dir.

### restic: volumes read in place
With the **restic** engine (copy mode **auto** or **direct**), the agent doesn't copy a volume or
host folder at all: restic reads it where it is, from a short-lived container started from the
agent's own image with the volume mounted read-only. restic remembers the previous backup of the
same volume, so it only reads the files that changed since — a large volume that changes little
backs up in seconds, and needs no room on the host.

When containers must be frozen, the agent makes **two passes**: a first one **without freezing**
carries the bulk of the changes, then a short **frozen** pass reads only what moved in between —
typically about a second, even for the very first backup of a large volume. Each pass reads **all
the resource's volumes and folders in one restic command**: restic's start (loading the
repository's index) is paid once, not once per folder, which is most of what a frozen pass costs
when little changed. The backup log shows what each pass read (`12 new, 3 changed, 4 210 unchanged
files - 1.2 MiB added`).

The first pass stays in the repository as the final pass's starting point (tagged `pass:warm`):
removing it right away would need the repository's exclusive lock, and wait behind any other
backup of the same destination. A later prune of that destination drops the first passes older
than a day. While a job waits for the repository's lock (a prune behind a long backup, for
instance), the activity bar says so and names the jobs using that destination.

The volumes and folders are stored in a restic snapshot of their own (tagged with the backup and
`part:volume`, each under its own path), next to the backup's main snapshot (database dumps,
configuration); CBM keeps them together: they are
restored, checked, mirrored and deleted as one backup. A restore writes straight into the volume
(files that weren't in the backup are removed, and the folder's owner and permissions come back),
and a restore drill reads the volume back from the repository without copying it to the host. A
mirror copy turns each volume into a regular `.tar` for the target. restic keeps a cache of each
repository's index in the work dir (`restic-cache`), so it survives agent updates; it can be
deleted at any time. How many files restic reads at once and the size of the packs it writes are
agent settings (see [Agent settings](#agent-settings)).

Copy mode **local** keeps the previous behaviour with restic (a `.tar` copy of each volume on the
host, frozen for the whole copy), for hosts where that's preferred. Backups taken that way stay
restorable as before.

### Excluded paths
Per resource (**Options** tab → **Excluded paths**, admin), list what its volume and host-folder
copies leave out — data you can get back otherwise: dumps already stored elsewhere, logs, models
re-downloaded from a registry… One per line:

- `/path` starts at the root of **each** volume or folder of the resource (`/backups`, `/logs`);
- a bare name, without a slash, is matched at **any depth** (`logs`, `*.tmp`);
- `*` and `?` wildcards work. A path in the middle of a tree (`app/logs`) is refused: write
  `/app/logs`;
- to leave out a **whole mounted folder or volume**, write its path **on the host**
  (`/data/coolify/applications/<uuid>/logs`) or where a container **mounts** it
  (`/var/www/var/log`). A path *inside* a mount, written either way
  (`/data/coolify/applications/<uuid>/data/cache`, `/data/cache`), leaves out only that part of it.
  The backup log says which mounts were left out entirely.
- each exclusion is read **one way only**: a path that is (or is inside) one of the resource's
  host folders is a host path; otherwise one that is (or is inside) a place where a container
  mounts something is a container path; otherwise it keeps the meaning above. A host path is never
  applied as a path inside a container (a host folder under `/data/...` isn't the `/data` a
  container mounts), nor the other way round. Write `host:/…` or `container:/…` to say which one
  you mean.

Both engines honour them, and the backup log lists them. A **restore in place leaves excluded
paths as they are** on the target — it never deletes what it didn't back up. Database dumps
aren't affected.

### Agent settings
Admins can set the agents' concurrency, free space kept, copy mode, log level and restic tuning
(files read at once, pack size) from CBM:
**Agents** → **Default settings** for all agents, or the gear on an agent's row to override
them for that host (leave a field empty to keep the default). Changes apply on the agent's next
heartbeat. A value set by environment variable on the host wins: the field is locked and shows
the host's value. See [Configuration](configuration.md#agent-environment-variables).
