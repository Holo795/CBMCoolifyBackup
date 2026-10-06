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
lost or corrupted. In the snapshot list a copy reads *mirror copy*.

How long copies are kept is set on the destination that **receives** them (the shield button on
its card → **Mirror copies received here**):

- **Deleted with their source** (default, as before): the source's retention deletes them too.
- **Own retention**: kept by the destination's own daily / weekly / monthly counts (per
  resource, dated like their source), whatever happens to the source — keep the second copy
  longer, or keep it when the source is lost.

Deleting a backup by hand never deletes its mirror copies unless you choose **Delete with its
mirror copies** in its **…** menu.

## Retention — grandfather-father-son (GFS)

Each schedule keeps a configurable number of **daily / weekly / monthly** snapshots (7 / 4 / 6
by default) and deletes the rest of that schedule's successful snapshots. Retention runs after
each scheduled fire and after each successful backup on a schedule (cheap, idempotent).

- **Files first, records second.** A snapshot being deleted shows as **deleting**: an agent
  deletes its files (and those of the mirror copies that follow it), and the database record is removed **only
  once that succeeded**. If no agent can take it or the deletion fails, the snapshot stays
  *deleting* (with the reason) and CBM retries every 6 hours — files are never orphaned.
- **tar engine:** the snapshot directories are deleted at the destination; empty parent
  directories are cleaned up too.
- **restic engine:** deletion is delegated to `restic forget --prune`, which removes the
  snapshots (the backup's main one and those of its volumes) and frees the deduplicated data.

`sync` mode keeps **one** copy instead of versioned snapshots, so retention doesn't apply to it.
Each sync run writes a new copy, and the previous one is deleted only once the new one is stored
and verified — a failed run never leaves you without a copy.

Deleting a snapshot manually (its **…** menu → **Delete**, type `DELETE` to confirm) goes through
the same files-first deletion (a running backup must be cancelled first). A destination that
schedules still use can't be deleted — point them at another destination first; deleting an
unused destination (card **…** menu → **Delete**, type its name) removes its records and asks an
agent to delete its files.

## Protection against deletion

A mirror is only a safety net if what deletes the original can't delete the copy too — a bad
retention setting, a mistake, or a compromised CBM. Two layers, on the destination's shield
button:

- **Protected destination** — CBM never deletes anything there: no retention, no manual or sync
  deletion, no prune, and the destination itself can't be deleted until protection is turned off.
  Backups pile up meanwhile. This stops CBM from deleting; it can't stop someone who holds the
  destination's credentials.
- **Storage-side protection (S3)** — the bucket itself keeps what is deleted: with **versioning**
  on, a deletion only hides an object behind a marker, and a key **without
  `s3:DeleteObjectVersion`** can't remove the old version for good. A lifecycle rule then frees
  deleted versions after a delay. CBM keeps working normally (retention, restic prune), and
  anything deleted — by CBM or with its key — stays recoverable during that delay.

### Setting up an S3 bucket
1. Turn **versioning** on for the bucket.
2. Add a lifecycle rule that expires **noncurrent versions** after, say, 30 days (and removes
   expired delete markers).
3. Give CBM a key limited to that bucket that may read, write, list and delete objects, but not
   delete versions nor change versioning or lifecycle. On AWS (MinIO takes the same policy):

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       { "Effect": "Allow", "Action": ["s3:ListBucket", "s3:ListBucketVersions", "s3:GetBucketLocation", "s3:GetBucketVersioning", "s3:GetLifecycleConfiguration"], "Resource": "arn:aws:s3:::my-backups" },
       { "Effect": "Allow", "Action": ["s3:GetObject", "s3:GetObjectVersion", "s3:PutObject", "s3:DeleteObject"], "Resource": "arn:aws:s3:::my-backups/*" },
       { "Effect": "Deny", "Action": ["s3:DeleteObjectVersion", "s3:PutBucketVersioning", "s3:PutLifecycleConfiguration"], "Resource": ["arn:aws:s3:::my-backups", "arn:aws:s3:::my-backups/*"] }
     ]
   }
   ```
4. In CBM, run **Check deletion protection** from the destination's **…** menu (it also runs when
   you save a protected S3 destination). It writes a small witness object under
   `cbm-protection-check/`, deletes it, and makes sure the old version can't be removed with
   CBM's key. The card then shows **deletion-proof** (with how long deleted versions are kept) or
   **not deletion-proof** and why.

Checked destinations are re-checked every Sunday (04:30); a destination that stops being
deletion-proof (versioning suspended, policy loosened) sends an alert. Avoid object-lock in
*compliance* mode: it also blocks restic's own housekeeping (`prune`).

To recover after a deletion, restore the previous versions with your storage's tools (remove the
delete markers, e.g. with `mc undo` or `aws s3api delete-object --version-id` using an admin key),
then run **Verify** on the destination. SSH and local destinations can't enforce this on the
storage side: use **Protected destination**, or an S3-compatible store for the copy you want
deletion-proof.
