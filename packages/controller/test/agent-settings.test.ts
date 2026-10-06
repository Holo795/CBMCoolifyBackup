import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAgentSettings, settingsForAgent, settingsFromForm } from "../src/lib/agent-settings";

const form = (o: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) fd.set(k, v);
  return fd;
};

test("an agent's own settings win over the defaults; invalid stored values are dropped", () => {
  assert.deepEqual(
    settingsForAgent({ concurrency: 3, stagingMode: "auto", logLevel: "loud" }, { stagingMode: "direct", minFreeMb: -5 }),
    { concurrency: 3, stagingMode: "direct" },
  );
  assert.deepEqual(parseAgentSettings(null), {});
  assert.deepEqual(parseAgentSettings("nope"), {});
});

test("the settings form: empty fields inherit, numbers are checked", () => {
  assert.deepEqual(settingsFromForm(form({ concurrency: "", minFreeMb: "", stagingMode: "", logLevel: "" })), { settings: {} });
  assert.deepEqual(settingsFromForm(form({ concurrency: "4", minFreeMb: "2048", stagingMode: "local", logLevel: "debug" })), {
    settings: { concurrency: 4, minFreeMb: 2048, stagingMode: "local", logLevel: "debug" },
  });
  assert.equal(settingsFromForm(form({ concurrency: "40" })).error, "concurrency");
  assert.equal(settingsFromForm(form({ stagingMode: "sideways" })).error, "stagingMode");
});
