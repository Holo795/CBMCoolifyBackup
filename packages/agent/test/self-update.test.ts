import { test } from "node:test";
import assert from "node:assert/strict";
import { compareVersions } from "@cbm/shared";
import { recreateSpec } from "../src/self-update.js";

const ID = "3f1c2b9a8d7e6f5a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a";

const image = {
  Config: {
    Env: ["PATH=/usr/local/bin:/usr/bin", "NODE_VERSION=24.1.0", "AGENT_WORK_DIR=/var/lib/cbm-agent"],
    Labels: { "org.opencontainers.image.source": "x" },
    Cmd: ["node", "packages/agent/dist/index.js"],
    WorkingDir: "/app",
  },
};

const container = {
  Id: ID,
  Name: "/cbm-agent",
  Config: {
    Hostname: ID.slice(0, 12),
    Image: "ghcr.io/holo795/cbm-agent:latest",
    Env: [...image.Config.Env, "CONTROLLER_URL=https://cbm.example.com", "ENROLLMENT_TOKEN=cbm_x"],
    Labels: { "org.opencontainers.image.source": "x", team: "ops" },
    Cmd: ["node", "packages/agent/dist/index.js"],
    WorkingDir: "/app",
  },
  HostConfig: {
    Binds: ["/var/run/docker.sock:/var/run/docker.sock", "/backups:/backups", "cbm-agent-work:/var/lib/cbm-agent"],
    RestartPolicy: { Name: "unless-stopped", MaximumRetryCount: 0 },
    Dns: ["1.1.1.1"],
    NetworkMode: "bridge",
  },
  NetworkSettings: {
    Networks: {
      bridge: { Aliases: null, IPAMConfig: null },
      coolify: { Aliases: [ID.slice(0, 12), "backup-agent"], IPAMConfig: { IPv4Address: "10.0.1.20" } },
    },
  },
};

test("recreate spec keeps the container's own settings, not its image's", () => {
  const { create, networks } = recreateSpec(container, image, "ghcr.io/holo795/cbm-agent:2.6.0", { AGENT_HOSTNAME: "host1" });
  assert.equal(create.Image, "ghcr.io/holo795/cbm-agent:2.6.0");
  // The new image's PATH / Node version apply: only what the container set over its image is kept.
  assert.deepEqual(create.Env, ["CONTROLLER_URL=https://cbm.example.com", "ENROLLMENT_TOKEN=cbm_x", "AGENT_HOSTNAME=host1"]);
  assert.deepEqual(create.Labels, { team: "ops" });
  assert.deepEqual(create.HostConfig, container.HostConfig);
  assert.equal(create.Cmd, undefined);
  assert.equal(create.WorkingDir, undefined);
  // The default hostname (short id) isn't carried over.
  assert.equal(create.Hostname, undefined);
  assert.deepEqual(create.NetworkingConfig, { EndpointsConfig: { bridge: {} } });
  // Other networks are connected after create, without the old id as an alias.
  assert.deepEqual(networks, [{ name: "coolify", aliases: ["backup-agent"], ipv4: "10.0.1.20" }]);
});

test("recreate spec keeps an AGENT_HOSTNAME already set, a chosen hostname and a custom command", () => {
  const c = {
    ...container,
    Config: {
      ...container.Config,
      Hostname: "backup-host",
      Env: [...container.Config.Env, "AGENT_HOSTNAME=web-1"],
      Cmd: ["node", "--max-old-space-size=512", "packages/agent/dist/index.js"],
    },
    HostConfig: { ...container.HostConfig, NetworkMode: "host" },
  };
  const { create, networks } = recreateSpec(c, image, "img:2", { AGENT_HOSTNAME: "other" });
  assert.ok((create.Env as string[]).includes("AGENT_HOSTNAME=web-1"));
  assert.ok(!(create.Env as string[]).includes("AGENT_HOSTNAME=other"));
  assert.equal(create.Hostname, "backup-host");
  assert.deepEqual(create.Cmd, c.Config.Cmd);
  // Host networking: no endpoint at create.
  assert.equal(create.NetworkingConfig, undefined);
  assert.equal(networks.length, 2);
});

test("versions compare numerically", () => {
  assert.ok(compareVersions("2.5.1", "2.6.0") < 0);
  assert.ok(compareVersions("2.10.0", "2.9.9") > 0);
  assert.equal(compareVersions("v2.6.0", "2.6.0"), 0);
  assert.equal(compareVersions("2.6.0-rc.1", "2.6.0"), 0);
});
