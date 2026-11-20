// Lights marked "not counted" (a word clock, an aquarium): they keep their tile, but no count,
// no dot and no group button takes them along.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeHass, LIB } from "./fake.mjs";

const { countedLights } = await import(LIB + "model.js");
const { roomStats, onText } = await import(LIB + "layouts.js");
const { editToggle } = await import(LIB + "tile.js");

/** A context with just enough of HausPanel for roomStats: the states and the panel settings. */
const ctx = (hass, s = {}) => ({
  hass,
  settings: { s, arrange: (_id, items, exists) => ({ items: items.filter(exists), hidden: [] }) },
});

const area = (id, tiles) => ({ id, name: id, tiles });

test("countedLights leaves out the marked lights and nothing else", () => {
  const ids = ["light.a", "light.b", "light.c"];
  assert.deepEqual(countedLights({ uncounted: { "light.b": true } }, ids), ["light.a", "light.c"]);
  // No setting at all, an empty list, and a mark for something that is not in the list.
  assert.deepEqual(countedLights({}, ids), ids);
  assert.deepEqual(countedLights(undefined, ids), ids);
  assert.deepEqual(countedLights({ uncounted: { "light.z": true } }, ids), ids);
  assert.deepEqual(countedLights({ uncounted: { "light.a": true } }, []), []);
});

test("a room with only a not counted light on says all off and shows no dot for it", () => {
  const hass = fakeHass({ states: { "light.word_clock": "on", "light.ceiling": "off" } });
  const a = area("living", ["light.word_clock", "light.ceiling"]);
  const before = roomStats(ctx(hass), a);
  assert.equal(before.on, 1);
  assert.equal(before.total, 2);
  assert.equal(before.lightsOn, 1);
  assert.deepEqual(before.dotIds, ["light.word_clock", "light.ceiling"]);

  const after = roomStats(ctx(hass, { uncounted: { "light.word_clock": true } }), a);
  assert.equal(after.on, 0);
  assert.equal(after.total, 1);
  assert.equal(after.lightsOn, 0);
  assert.deepEqual(after.lights, ["light.ceiling"]);
  assert.deepEqual(after.dotIds, ["light.ceiling"]);
  // The tile itself stays in the room, it is only left out of the counting.
  assert.ok(after.items.includes("light.word_clock"));
  assert.equal(onText(after), onText({ total: 1, on: 0 }));
});

test("a room without a mark counts as before, sockets keep their own dot", () => {
  const hass = fakeHass({ states: { "light.a": "on", "light.b": "on", "switch.plug": "on" } });
  const s = roomStats(ctx(hass, { uncounted: {} }), area("office", ["light.a", "light.b", "switch.plug"]));
  assert.equal(s.on, 2);
  assert.equal(s.total, 2);
  assert.deepEqual(s.lights, ["light.a", "light.b"]);
  assert.deepEqual(s.dotIds, ["light.a", "light.b", "switch.plug"]);
});

test("editToggle: counting for lights, meter only for measuring sockets, nothing else", () => {
  const hass = fakeHass({
    states: {
      "light.ceiling": "on",
      "switch.plug": { state: "on" },
      "switch.ac": "off",
      "sensor.plug_power": { state: "42", attributes: { device_class: "power" } },
      "media_player.tv": "off",
    },
    entities: {
      "switch.plug": { device_id: "d1" },
      "sensor.plug_power": { device_id: "d1" },
      "switch.ac": { device_id: "d2" },
    },
  });
  assert.equal(editToggle(ctx(hass), "light.ceiling"), "count");
  // A socket only gets the button when something at its device measures power.
  assert.equal(editToggle(ctx(hass), "switch.plug"), "meter");
  assert.equal(editToggle(ctx(hass), "switch.ac"), null);
  // Already set to meter only: the button stays, so it can be switched back.
  assert.equal(editToggle(ctx(hass, { meters: { "switch.ac": true } }), "switch.ac"), "meter");
  // Anything else, a bundle key, a separator and an entity that is gone.
  assert.equal(editToggle(ctx(hass), "media_player.tv"), null);
  assert.equal(editToggle(ctx(hass), "wbx:garden"), null);
  assert.equal(editToggle(ctx(hass), "sep:1"), null);
  assert.equal(editToggle(ctx(hass), "light.gone"), null);
  assert.equal(editToggle(ctx(hass), undefined), null);
});

test("every light of a room not counted: no lights left to switch", () => {
  const hass = fakeHass({ states: { "light.aquarium": "on" } });
  const s = roomStats(ctx(hass, { uncounted: { "light.aquarium": true } }), area("hall", ["light.aquarium"]));
  assert.deepEqual(s.lights, []);
  assert.equal(s.total, 0);
  assert.equal(s.lightsOn, 0);
});
