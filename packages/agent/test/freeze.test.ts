import { test } from "node:test";
import assert from "node:assert/strict";
import { freezeScript } from "../src/freeze.js";

test("the cgroup freeze script sets each cgroup and waits for the kernel", () => {
  const s = freezeScript(
    [
      { kind: "v2", dir: "/sys/fs/cgroup/system.slice/docker-abc.scope" },
      { kind: "v1", dir: "/sys/fs/cgroup/freezer/docker/def" },
    ],
    true,
  );
  assert.match(s, /echo 1 > '\/sys\/fs\/cgroup\/system.slice\/docker-abc.scope\/cgroup.freeze'/);
  assert.match(s, /echo FROZEN > '\/sys\/fs\/cgroup\/freezer\/docker\/def\/freezer.state'/);
  assert.match(s, /grep -q 'frozen 1' .*cgroup.events' && grep -q 'FROZEN'/);
  assert.match(s, /\[ \$i -gt 1000 \] && exit 3/, "gives up after ~10 s");
  const thaw = freezeScript([{ kind: "v2", dir: "/sys/fs/cgroup/x" }], false);
  assert.match(thaw, /echo 0 > '\/sys\/fs\/cgroup\/x\/cgroup.freeze'.*'frozen 0'/);
  // A path can't break out of its shell word.
  assert.match(freezeScript([{ kind: "v2", dir: "/a'b" }], true), /'\/a'\\''b\/cgroup.freeze'/);
});
