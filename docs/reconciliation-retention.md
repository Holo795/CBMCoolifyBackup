# Reconciliation & retention

## Reconciliation — detecting lost backups

CBM tracks your backups in its database, but the **files** live at the destination. If they're
deleted there (by mistake, a cleanup, a disk problem…), the database wouldn't know — and you'd
only find out at restore time. Reconciliation closes that gap.

- **What it does:** an agent lists the destination (or, for restic, queries the repo) and
  reports which recorded backups are still present. Any whose files are gone are flagged
  **missing** (shown in red on the snapshots and destinations pages) and an alert is sent.
- **When:** automatically **once a day** (03:30 in the configured timezone), or on demand with
  **Verify** in the destination card's **…** menu (operators; disabled when the destination has
  no backups yet).
- **Self-healing:** if a previously-missing backup reappears, it flips back to *succeeded*.
- **Routing:** for an SSH/S3 destination, any online agent runs the check; for a **local**
  destination, each producing agent checks its own files. If no agent can run it, the card shows
  *no agent to verify*.

A *missing* snapshot can't be restored (the files are gone) — treat it as data loss to
investigate.

## Integrity check — detecting silent corruption

Reconciliation confirms the files are *present*; the **integrity check** confirms they're not
silently *corrupt* (bit-rot, a truncated upload). It re-reads the stored content:

- **restic:** runs `restic check` (with a sampled `--read-data-subset` of 5%, so it also
  re-hashes some of the actual pack data, not just the structure).
- **tar:** re-downloads each artifact and either decrypts it (the AES-GCM tag proves integrity)
  or compares its sha256 to the manifest.

It's **opt-in per destination** (the **Weekly integrity check** switch in the card footer,
admin) because it re-reads the data and is more expensive than reconciliation; it runs weekly
(Sunday 04:00), or on demand with **Check integrity** in the card's **…** menu. A
backup that fails is flagged **corrupt** and alerted; a restic repo-level failure alerts and
shows on the destination. A corrupt backup that later passes flips back to *succeeded*.

## Mirroring — a second copy

A destination can **mirror** every backup to a second destination (the **Mirror to** selector
in the card footer, admin). Each new successful backup is copied right after it lands; backups
taken before you set it aren't copied, and a mirror copy is never mirrored again. The copy is
re-packaged under the target's own engine and encryption, so it's a **first-class snapshot** you
can restore, reconcile and integrity-check independently — your insurance if one destination is
lost or corrupted. Retention prunes the mirror together with its source.

## Retention — grandfather-father-son (GFS)

Each schedule keeps a configurable number of **daily / weekly / monthly** snapshots (7 / 4 / 6
by default) and deletes the rest of that schedule's successful snapshots. Retention runs after
each scheduled fire and after each successful backup on a schedule (cheap, idempotent).

- **Files first, records second.** A snapshot being deleted shows as **deleting**: an agent
  deletes its files (and those of its mirror copies), and the database record is removed **only
  once that succeeded**. If no agent can take it or the deletion fails, the snapshot stays
  *deleting* (with the reason) and CBM retries every 6 hours — files are never orphaned.
- **tar engine:** the snapshot directories are deleted at the destination; empty parent
  directories are cleaned up too.
- **restic engine:** deletion is delegated to `restic forget --prune`, which removes the
  snapshots and frees the deduplicated data.

`sync` mode keeps **one** copy instead of versioned snapshots, so retention doesn't apply to it.
Each sync run writes a new copy, and the previous one is deleted only once the new one is stored
and verified — a failed run never leaves you without a copy.

Deleting a snapshot manually (its **…** menu → **Delete**, type `DELETE` to confirm) goes through
the same files-first deletion (a running backup must be cancelled first). A destination that
schedules still use can't be deleted — point them at another destination first; deleting an
unused destination (card **…** menu → **Delete**, type its name) removes its records and asks an
agent to delete its files.
