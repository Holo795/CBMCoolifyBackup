# Reconciliation & retention

## Reconciliation — detecting lost backups

CBM tracks your backups in its database, but the **files** live at the destination. If they're
deleted there (by mistake, a cleanup, a disk problem…), the database wouldn't know — and you'd
only find out at restore time. Reconciliation closes that gap.

- **What it does:** an agent lists the destination (or, for restic, queries the repo) and
  reports which recorded backups are still present. Any whose files are gone are flagged
  **missing** (shown in red on the snapshots and destinations pages) and an alert is sent.
- **When:** automatically **once a day**, or on demand with the **Verify** button on a
  destination (disabled when the destination has no backups yet).
- **Self-healing:** if a previously-missing backup reappears, it flips back to *succeeded*.
- **Routing:** for an SSH/S3 destination, any online agent runs the check; for a **local**
  destination, each producing agent checks its own files.

A *missing* snapshot can't be restored (the files are gone) — treat it as data loss to
investigate.

## Integrity check — detecting silent corruption

Reconciliation confirms the files are *present*; the **integrity check** confirms they're not
silently *corrupt* (bit-rot, a truncated upload). It re-reads the stored content:

- **restic:** runs `restic check` (with a sampled `--read-data-subset`, so it also re-hashes some
  of the actual pack data, not just the structure).
- **tar:** re-downloads each artifact and either decrypts it (the AES-GCM tag proves integrity)
  or compares its sha256 to the manifest.

It's **opt-in per destination** (the *weekly check* toggle) because it re-reads the data and is
more expensive than reconciliation; it runs weekly, or on demand with **Check integrity**. A
backup that fails is flagged **corrupt** and alerted; a restic repo-level failure alerts and
shows on the destination. A corrupt backup that later passes flips back to *succeeded*.

## Mirroring — a second copy

A destination can **mirror** every backup to a second destination (**mirror to** on the
destination). The copy is re-packaged under the target's own engine and encryption, so it's a
**first-class snapshot** you can restore, reconcile and integrity-check independently — your
insurance if one destination is lost or corrupted. Retention prunes the mirror together with its
source.

## Retention — grandfather-father-son (GFS)

Each schedule keeps a configurable number of **daily / weekly / monthly** snapshots and deletes
the rest. Retention runs after each scheduled fire (cheap, idempotent).

- **tar engine:** CBM deletes the old snapshot directories at the destination via the agent, then
  removes the database records. Empty parent directories are cleaned up too. The database record
  is only dropped once the delete was actually handed to an agent — so files aren't orphaned if
  no agent is online (it retries next run).
- **restic engine:** deletion is delegated to `restic forget --prune`, which removes the
  snapshots and frees the deduplicated data.

`sync` mode keeps a single overwritten copy instead of versioned snapshots, so retention doesn't
apply to it.

Deleting a snapshot manually (or deleting a destination) also removes its files at the
destination via the agent.
