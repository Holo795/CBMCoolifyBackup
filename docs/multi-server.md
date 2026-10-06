# Multi-server instances

A single Coolify panel can manage several servers. CBM handles this natively.

## How it works

- **One agent per server.** Run the (same) install command on each Docker host. The enrollment
  token is per instance, shared across its servers.
- **Server captured per resource.** On sync, CBM records which Coolify server each resource is
  deployed on (from the Coolify API).
- **Auto-detected agent → server.** Each agent reports the resources it can see on its local
  Docker host; CBM matches them to the known servers and assigns the agent automatically. No
  manual mapping needed in the common case.
- **Routing.** Every backup/restore is sent to the agent on the **resource's server**. If no
  agent is online there, you get a clear error rather than a backup of the wrong host.

## Manual override

If auto-detection can't decide yet (a brand-new, empty host with nothing recognizable), set the
agent's server by hand on the **Agents** page (admin; the dropdown in the *Server* column), or
pass `AGENT_SERVER_UUID` when installing the agent.

## Per-server schedules

When an instance spans several servers, its card on **Coolify instances** shows **one row per
server** instead of the single *Instance schedule* row: the agent status there (*agent
connected*, *agent offline* or *no agent installed*), the last run, and that server's **own
schedule** (frequency + mode + destination + retention), set or edited with **Set** / **Edit**
in a side panel. The install command (card **…** menu → **Install command**) is the same for
every host. Schedule precedence is *resource override > server > instance*.

"Back up Coolify" (the control plane) stays a single action, routed to the server Coolify runs
on.

## Server mapping for restores

A restore to a new resource (e.g. after re-pointing an instance or migrating) lands on the
snapshot's server when it still exists on the target instance. Otherwise, for a multi-server
target, the card **…** menu → **Server mapping for restores** (admin) maps each source server
UUID to one of this instance's servers; unmapped sources go to the first server. See
[Disaster recovery](disaster-recovery.md).

## Local destinations are per server

A "local folder" destination is realised on **each agent's host**. So the same local destination
used by two servers is two physical folders, one per host. The destination detail page shows the
size **broken down per server**, and reconciliation / retention / restore for a local backup run
on the agent that produced it. For a single shared location, use SSH/SFTP or S3.
