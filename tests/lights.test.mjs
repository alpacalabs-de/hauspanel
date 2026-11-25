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

// Mail (Fabrizio): the Light chip on Home did not always count every light that was on, while the
// room cards did. Home now counts what the room cards count, room by room, Other included.
const { homeLights, homeLightRooms } = await import(LIB + "layouts.js");

/** Rooms as HausPanel lists them, with roomList like the panel's. */
const homeCtx = (hass, rooms, s = {}) => ({ ...ctx(hass, s), roomList: () => rooms });
const group = (members, state = "on") => ({ state, attributes: { entity_id: members } });

test("Home counts a group that stands in for hidden lamps, and a light without a room", () => {
  const hass = fakeHass({
    states: { "light.attic_all": group(["light.attic_a", "light.attic_b"]), "light.attic_a": "on", "light.attic_b": "on", "light.loose": "on", "light.ceiling": "off" },
    entities: { "light.attic_all": { platform: "group" } },
  });
  // The attic's lamps are hidden, so its group is the tile (see model.test.mjs); the loose lamp sits under Other.
  const rooms = [area("attic", ["light.attic_all"]), area("kitchen", ["light.ceiling"]), area("_other", ["light.loose"])];
  const c = homeCtx(hass, rooms);
  assert.deepEqual(homeLights(c), ["light.attic_all", "light.ceiling", "light.loose"]);
  assert.equal(homeLights(c).filter((id) => hass.states[id].state === "on").length, 2, "what the room cards add up to");
  assert.deepEqual(homeLightRooms(c).map((r) => [r.a.id, r.ids]), [["attic", ["light.attic_all"]], ["kitchen", ["light.ceiling"]], ["_other", ["light.loose"]]]);
});

test("a group next to one of its lamps elsewhere in the house counts once, through the lamp", () => {
  const hass = fakeHass({
    states: { "light.all_down": group(["light.ceiling", "light.desk"]), "light.ceiling": "on", "light.desk": "off" },
    entities: { "light.all_down": { platform: "group" } },
  });
  const c = homeCtx(hass, [area("hall", ["light.all_down"]), area("kitchen", ["light.ceiling"])]);
  assert.deepEqual(homeLights(c), ["light.ceiling"], "the group would switch and count the lamp twice");
  assert.deepEqual(homeLightRooms(c).map((r) => r.a.id), ["kitchen"]);
  // The same lamp added to two rooms by hand counts once too.
  const twice = homeCtx(hass, [area("kitchen", ["light.ceiling"]), area("office", ["light.ceiling", "light.desk"])]);
  assert.deepEqual(homeLights(twice), ["light.ceiling", "light.desk"]);
});

test("a light marked not counted stays out of Home's count", () => {
  const hass = fakeHass({ states: { "light.word_clock": "on", "light.ceiling": "on" } });
  const c = homeCtx(hass, [area("living", ["light.word_clock", "light.ceiling"])], { uncounted: { "light.word_clock": true } });
  assert.deepEqual(homeLights(c), ["light.ceiling"]);
});
