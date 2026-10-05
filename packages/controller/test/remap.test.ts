import { test } from "node:test";
import assert from "node:assert/strict";
import { remapEnv } from "../src/lib/remap";

const DB = "ow4kw0k8wo00scsgksw4o4gk";
const DB_CLONE = "zq9m3n1b2v8c7x6l5k4j3h2g";

test("rewires a database hostname inside a connection URL", () => {
  const { envs, changes } = remapEnv(
    [{ key: "DATABASE_URL", value: `postgres://app:pw@${DB}:5432/app` }],
    { [DB]: DB_CLONE },
  );
  assert.equal(envs[0].value, `postgres://app:pw@${DB_CLONE}:5432/app`);
  assert.deepEqual(changes, [{ key: "DATABASE_URL", from: DB, to: DB_CLONE }]);
});

test("rewires a uuid embedded in a dashed container name", () => {
  const { envs } = remapEnv([{ key: "REDIS_HOST", value: `redis-${DB}` }], { [DB]: DB_CLONE });
  assert.equal(envs[0].value, `redis-${DB_CLONE}`);
});

test("does not touch a uuid that is only part of a longer token", () => {
  const value = `x${DB}y`;
  const { envs, changes } = remapEnv([{ key: "OTHER", value }], { [DB]: DB_CLONE });
  assert.equal(envs[0].value, value);
  assert.equal(changes.length, 0);
});

test("replaces every occurrence and reports each key once per mapping", () => {
  const { envs, changes } = remapEnv(
    [{ key: "HOSTS", value: `${DB},${DB}` }, { key: "PLAIN", value: "nothing here" }],
    { [DB]: DB_CLONE },
  );
  assert.equal(envs[0].value, `${DB_CLONE},${DB_CLONE}`);
  assert.equal(envs[1].value, "nothing here");
  assert.equal(changes.length, 1);
});

test("handles several mappings in one value", () => {
  const CACHE = "c4ch3c4ch3c4ch3c4ch3c4ch";
  const CACHE_CLONE = "n3wc4ch3n3wc4ch3n3wc4ch3";
  const { envs, changes } = remapEnv(
    [{ key: "URLS", value: `db=${DB};cache=${CACHE}` }],
    { [DB]: DB_CLONE, [CACHE]: CACHE_CLONE },
  );
  assert.equal(envs[0].value, `db=${DB_CLONE};cache=${CACHE_CLONE}`);
  assert.equal(changes.length, 2);
});

test("maps the dash-stripped form of a dashed uuid too", () => {
  const dashed = "1111-2222-3333";
  const clone = "aaaa-bbbb-cccc";
  const { envs } = remapEnv([{ key: "V", value: "vol_111122223333_data" }], { [dashed]: clone });
  assert.equal(envs[0].value, "vol_aaaabbbbcccc_data");
});

test("no mapping, non-string or empty values are returned as-is without mutation", () => {
  const input = [{ key: "A", value: DB }, { key: "B", value: 42 }, { key: "C", value: "" }];
  const frozen = JSON.parse(JSON.stringify(input));
  assert.equal(remapEnv(input, {}).envs, input);
  const { envs } = remapEnv(input, { [DB]: DB_CLONE });
  assert.equal(envs[1], input[1]);
  assert.equal(envs[2], input[2]);
  assert.deepEqual(input, frozen); // original untouched
});
