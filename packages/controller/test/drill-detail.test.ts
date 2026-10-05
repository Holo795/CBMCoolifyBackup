import { test } from "node:test";
import assert from "node:assert/strict";
import { localizeDrillDetail } from "../src/lib/drill-detail";
import { makeT } from "../src/lib/i18n-shared";

test("known drill details are translated, others pass through", () => {
  const fr = makeT("fr");
  assert.equal(
    localizeDrillDetail("restored 3/4 tables into a sandbox postgres:17", fr),
    "3/4 tables restaurées dans un bac à sable postgres:17",
  );
  assert.equal(localizeDrillDetail("12 entries read back", fr), "12 entrées relues");
  assert.equal(localizeDrillDetail('no sandbox for engine "clickhouse" - skipped', fr), 'pas de bac à sable pour le moteur "clickhouse" - ignoré');
  assert.equal(localizeDrillDetail("pg_restore: error: boom", fr), "pg_restore: error: boom");
  const en = makeT("en");
  assert.equal(localizeDrillDetail("present and readable", en), "present and readable");
});
