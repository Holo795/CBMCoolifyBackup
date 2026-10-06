# Troubleshooting / FAQ

### An instance shows "agent offline" / a resource shows "Agent unavailable"
No agent has sent a heartbeat in the last ~90s for that instance/server. Check the `cbm-agent`
container is running on the host (`docker ps`, `docker logs cbm-agent`) and that
`CONTROLLER_URL` is reachable from it. Re-run the install command to reconfigure.

### "No online agent on server X"
The resource is on a Coolify server that has no online agent. Install an agent on that host, or
fix its connectivity. In a multi-server instance you need one agent **per server**. See
[Multi-server](multi-server.md).

### A backup is enabled but nothing runs
Toggling "Include in scheduled backups" isn't enough — you also need a **schedule** (on the
instance, the server, or the resource). Without one, nothing is backed up automatically. Use
**Back up now** on the resource's page to test on demand.

### "Nothing to verify" on a destination
The destination has no recorded backups yet, so reconciliation has nothing to check. Run a
backup to it first.

### A snapshot is flagged "missing"
Its files were deleted at the destination. The backup can't be restored. Investigate what
removed them; the database record stays so you can see the loss.

### Restore failed: artifact not found
The backup's files are gone from the destination (or, for a local destination, the producing
agent's host is down). Check the destination and run **Verify** from its **…** menu.

### "Not enough free space on the agent host"
A volume didn't fit in the agent's work dir (minus `AGENT_MIN_FREE_MB`). The message gives the
size needed and the space usable. Free some space on the host, lower **Free space kept**, or set
the agent's **copy mode** to `auto` or `direct` (**Agents** → gear on the agent's row): a **tar**
destination then sends large volumes straight to the destination, and a **restic** one reads
them in place without any copy. See
[Backups → Disk space on the agent host](backups.md#disk-space-on-the-agent-host).

### "restic on a volume needs the agent to run in Docker"
restic reads volumes in place from a container started from the agent's own image, which the
agent finds by inspecting its own container. An agent started outside Docker can't: install it
with the install command, or set the copy mode to `local`.

### A destination shows "not deletion-proof"
The deletion-protection check found the S3 bucket doesn't stop CBM's own key from deleting
backups for good: versioning is off or suspended, or the key may delete old versions
(`s3:DeleteObjectVersion`). Its tooltip says which. See
[Retention → Protection against deletion](reconciliation-retention.md#protection-against-deletion).

### A setting is greyed out in an agent's settings
That setting is set by an environment variable on the host (e.g. `AGENT_CONCURRENCY`), which
wins over CBM. Remove the variable from the agent container to manage it from CBM.

### restic over SSH/SFTP fails to connect
restic's SFTP backend needs a working SSH connection from the **agent's host**:
- key auth is most reliable; password auth uses `sshpass`;
- if you use a **jump host**, the agent's host must reach the bastion;
- the **base path must already exist** on the target (restic won't `mkdir -p` it);
- run **Test** from the destination's **…** menu to confirm reachability (note: Test runs from
  the controller).

### The controller didn't pick up the new image
Container registries can lag on `:latest`. On the host: `docker pull
ghcr.io/holo795/cbm-controller:latest`, then redeploy, and confirm the running container's image
id matches. Or pin a version tag (`:vX.Y.Z`).

### I lost my MASTER_KEY
Encrypted secrets and (with restic) encrypted backups are unrecoverable. You'll need to
reconnect instances and re-enter destination credentials. **Always back up `MASTER_KEY`.**

### Does CBM replace Coolify's built-in backups?
It supersedes them: Coolify only backs up databases; CBM backs up apps, services, volumes, bind
mounts and databases, with restore-to-new, multiple destinations, restic, alerts and more. You
can disable Coolify's native DB backups once CBM covers them.

### Where are local backups on disk?
On the agent's host, under `/backups` (bind-mounted by the install command). For the restic
engine, in a `restic-repo` subfolder there.
