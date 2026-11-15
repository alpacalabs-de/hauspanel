// Group buttons: lights go out a few at a time, and lamps that didn't follow are named.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LIB, fakeHass } from "./fake.mjs";

const { chunks, stuckIds, failedText, switchMany, BATCH } = await import(LIB + "switching.js");

const ids = (n) => Array.from({ length: n }, (_, i) => `light.l${i + 1}`);

test("eleven lamps go out in small groups", () => {
  const g = chunks(ids(11));
  assert.equal(g.length, Math.ceil(11 / BATCH));
  assert.ok(g.every((x) => x.length <= BATCH));
  assert.deepEqual(g.flat(), ids(11));
  assert.deepEqual(chunks([]), []);
});

test("lamps not in the new state count as not reacting, unavailable ones don't", () => {
  const hass = fakeHass({ states: { "light.a": "on", "light.b": "off", "light.c": "unavailable" } });
  assert.deepEqual(stuckIds(hass, ["light.a", "light.b", "light.c"], "turn_on"), ["light.b"]);
  assert.deepEqual(stuckIds(hass, ["light.a", "light.b", "light.c"], "turn_off"), ["light.a"]);
});

test("names the lamps, at most two by name", () => {
  const hass = fakeHass({ states: { "light.floor_lamp": "off", "light.hall": "off", "light.desk": "off", "light.porch": "off" } });
  assert.equal(failedText(hass, ["light.floor_lamp"]), "floor lamp did not react");
  assert.equal(failedText(hass, ["light.floor_lamp", "light.hall"]), "floor lamp, hall did not react");
  assert.equal(failedText(hass, ["light.floor_lamp", "light.hall", "light.desk", "light.porch"]), "floor lamp, hall and 2 more did not react");
});

test("sends one call per group, a failing call doesn't stop the rest, and returns what didn't follow", async () => {
  const hass = fakeHass({ states: Object.fromEntries(ids(7).map((id) => [id, "off"])) });
  const calls = [];
  hass.callService = async (domain, service, data) => {
    calls.push(data.entity_id);
    if (calls.length === 2) throw new Error("Device is busy");
    for (const id of data.entity_id) if (id !== "light.l7") hass.states[id].state = "on";
  };
  const ctx = { hass }; // no layer: the toast is skipped here
  const stuck = await switchMany(ctx, "light", "turn_on", ids(7), { wait: async () => {}, check: 0 });
  assert.equal(calls.length, 3);
  assert.deepEqual(calls.flat(), ids(7));
  // l4–l6 were in the failing call, l7 never answers.
  assert.deepEqual(stuck, ["light.l4", "light.l5", "light.l6", "light.l7"]);
});

test("nothing to do, nothing sent", async () => {
  const hass = fakeHass();
  let n = 0;
  hass.callService = async () => { n++; };
  assert.deepEqual(await switchMany({ hass }, "light", "turn_off", []), []);
  assert.equal(n, 0);
});
