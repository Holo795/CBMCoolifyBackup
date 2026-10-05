# Alerts

CBM notifies you through a single **webhook** (Settings → Failure alerts) when something is
wrong. The body carries both `content` (Discord) and `text` (Slack), so one URL works for
Discord, Slack, or any custom receiver. Leave it blank to disable.

Test it with **Send test** on the Settings page.

## What triggers an alert

| Alert | When |
| --- | --- |
| **Failed** | A backup ran and failed (the agent reported an error, or the job timed out), or a scheduled run couldn't even be queued (e.g. no agent on the resource's server). |
| **Missing** | Reconciliation found a backup whose files were **deleted at the destination** — the snapshot is flagged *missing*. You learn about it before a restore needs it. |
| **Overdue** | A scheduled backup **never ran** when it should have (controller was down, no agent online, …). Detected by an hourly sweep, debounced so you're alerted once per missed run. |
| **Corrupt** | A snapshot's stored data failed its deep integrity check (tar re-checksum or restic `check` on its files): it may not restore. |
| **Integrity check failed** | A destination's weekly repository-level integrity check failed (opt-in per destination). |
| **Restore drill failed** | A restore drill (manual, scheduled or API) could not restore the snapshot into its sandbox, or one of its checks failed. |
| **Self-backup problem** | The controller's metadata self-backup failed, or hasn't succeeded for too long. Sent once per failure episode. |

Each alert names the resource and instance, and links back to the snapshot/snapshots page.

## Why so many alerts

They catch different failure modes:

- **Failed** = it ran, but broke.
- **Missing** = it succeeded, but the files later vanished from the destination.
- **Overdue** = it never ran at all.
- **Corrupt** / **Integrity check failed** = the files are there, but their content is damaged.
- **Restore drill failed** = everything looks fine, but the backup doesn't actually restore.
- **Self-backup problem** = CBM's own metadata (schedules, snapshot index, keys) isn't protected.

Together they close the "I thought I had backups" gap from every side.

Alert messages (error text, drill details) are passed through the same secret
redaction as job logs before they leave the controller.
