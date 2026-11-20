// Leaving home: a heating thermostat is set back to away or eco, otherwise switched off,
// devices left alone by hand are skipped everywhere, and sockets and players picked by hand go off too.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LIB, fakeHass } from "./fake.mjs";

const { heatSetback, leaveItems, extraIds, extraOn, canTurnOff, canPause } = await import(LIB + "leave.js");

test("away preset first, then eco, otherwise off", () => {
  assert.deepEqual(heatSetback({ attributes: { preset_modes: ["comfort", "eco", "away"] } }), { service: "set_preset_mode", data: { preset_mode: "away" } });
  assert.deepEqual(heatSetback({ attributes: { preset_modes: ["Comfort", "Eco"] } }), { service: "set_preset_mode", data: { preset_mode: "Eco" } });
  assert.deepEqual(heatSetback({ attributes: {} }), { service: "turn_off", data: {} });
});

const house = () => fakeHass({
  states: {
    "light.motion_outside": "on",
    "light.lamp": "on",
    "lock.front": "unlocked",
    "climate.living": { state: "heat", attributes: { hvac_action: "heating" } },
    "media_player.radio": "playing",
  },
  areas: { outside: { area_id: "outside", name: "Outside" }, living: { area_id: "living", name: "Living Room" } },
  entities: {
    "light.motion_outside": { area_id: "outside" },
    "light.lamp": { area_id: "living" },
    "lock.front": { area_id: "living" },
    "climate.living": { area_id: "living" },
    "media_player.radio": { area_id: "living" },
  },
});

const leaveCtx = (hass, s = {}) => ({
  model: {
    lights: ["light.motion_outside", "light.lamp"],
    areaOf: Object.fromEntries(Object.keys(hass.states).map((id) => [id, hass.entities[id].area_id])),
    areaById: new Map(Object.entries(hass.areas)),
  },
  settings: { s },
});

test("nothing left alone: everything on and open counts", () => {
  const hass = house();
  const it = leaveItems(leaveCtx(hass), hass);
  assert.deepEqual([...it.lights].sort(), ["light.lamp", "light.motion_outside"]);
  assert.deepEqual(it.locks, ["lock.front"]);
  assert.deepEqual(it.heat, ["climate.living"]);
  assert.deepEqual(it.media, ["media_player.radio"]);
  assert.deepEqual(it.skipped, []);
  assert.equal(it.count, 5, "two lights, a lock, a thermostat and the radio");
  // An empty list changes nothing.
  assert.equal(leaveItems(leaveCtx(hass, { leaveSkip: [] }), hass).count, 5);
});

test("a light left alone is out of the lights and out of the count", () => {
  const hass = house();
  const it = leaveItems(leaveCtx(hass, { leaveSkip: ["light.motion_outside"] }), hass);
  assert.deepEqual(it.lights, ["light.lamp"], "the motion light outside stays alone, the other one does not");
  assert.deepEqual(it.skipped, ["light.motion_outside"]);
  assert.equal(it.count, 4);
});

test("a lock or a thermostat can be left alone too", () => {
  const hass = house();
  const it = leaveItems(leaveCtx(hass, { leaveSkip: ["lock.front", "climate.living"] }), hass);
  assert.deepEqual(it.locks, []);
  assert.deepEqual(it.heat, []);
  assert.equal(it.count, 3, "both lights and the radio are left");
  assert.deepEqual([...it.skipped].sort(), ["climate.living", "lock.front"]);
});

test("a device that has vanished keeps no line in the window", () => {
  const hass = house();
  const it = leaveItems(leaveCtx(hass, { leaveSkip: ["light.lamp", "light.gone"] }), hass);
  assert.deepEqual(it.skipped, ["light.lamp"]);
});

// ---- sockets and players picked by hand (A29) ----

const extraHouse = () => fakeHass({
  states: {
    "light.lamp": "on",
    "switch.coffee": "on",
    "switch.freezer": "off",
    "switch.socket_meter": "on",
    "media_player.tv": "on",
    "media_player.radio": "playing",
    "media_player.receiver": "standby",
    "media_player.box": "idle",
    "media_player.amp": "off",
  },
  areas: { living: { area_id: "living", name: "Living Room" } },
  entities: Object.fromEntries(["light.lamp", "switch.coffee", "switch.freezer", "switch.socket_meter",
    "media_player.tv", "media_player.radio", "media_player.receiver", "media_player.box", "media_player.amp"]
    .map((id) => [id, { area_id: "living" }])),
});

const extraCtx = (hass, s = {}) => ({
  model: {
    lights: ["light.lamp"],
    areaOf: Object.fromEntries(Object.keys(hass.states).map((id) => [id, "living"])),
    areaById: new Map(Object.entries(hass.areas)),
  },
  settings: { s },
});

test("without leaveAdd nothing changes: no sockets, players only while playing", () => {
  const hass = extraHouse();
  const it = leaveItems(extraCtx(hass), hass);
  assert.deepEqual(it.extra, []);
  assert.deepEqual(it.media, ["media_player.radio"], "a TV that is on but not playing is no music");
  assert.equal(it.count, 2, "the lamp and the radio");
  // An empty list changes nothing either.
  assert.equal(leaveItems(extraCtx(hass, { leaveAdd: [] }), hass).count, 2);
  // Only sockets and players can be picked at all.
  assert.deepEqual(extraIds({ leaveAdd: ["switch.coffee", "light.lamp", "lock.front", 7, null, "media_player.tv"] }),
    ["switch.coffee", "media_player.tv"]);
  assert.deepEqual(extraIds({}), []);
});

test("a picked socket counts while it is on, not when it is off", () => {
  const hass = extraHouse();
  const it = leaveItems(extraCtx(hass, { leaveAdd: ["switch.coffee", "switch.freezer", "switch.gone"] }), hass);
  assert.deepEqual(it.extra, ["switch.coffee"], "the coffee machine is on, the freezer is off and the third one is gone");
  assert.equal(it.count, 3, "the lamp, the radio and the coffee machine");
});

test("a picked player counts unless it is off, in standby or away", () => {
  const hass = extraHouse();
  const ids = ["media_player.tv", "media_player.box", "media_player.receiver", "media_player.amp"];
  const it = leaveItems(extraCtx(hass, { leaveAdd: ids }), hass);
  assert.deepEqual(it.extra, ["media_player.tv", "media_player.box"], "on and idle count, standby and off do not");
  assert.equal(extraOn(hass, "media_player.tv"), true);
  assert.equal(extraOn(hass, "media_player.box"), true);
  assert.equal(extraOn(hass, "media_player.receiver"), false);
  assert.equal(extraOn(hass, "media_player.amp"), false);
  assert.equal(extraOn(hass, "switch.coffee"), true);
  assert.equal(extraOn(hass, "switch.freezer"), false);
  assert.equal(extraOn(hass, "media_player.gone"), false);
});

test("a picked device that is left alone drops out, and a meter-only socket is never switched", () => {
  const hass = extraHouse();
  const s = { leaveAdd: ["switch.coffee", "media_player.tv"], leaveSkip: ["switch.coffee"] };
  const it = leaveItems(extraCtx(hass, s), hass);
  assert.deepEqual(it.extra, ["media_player.tv"]);
  assert.deepEqual(it.skipped, ["switch.coffee"]);
  // "Meter only" means watts and usage, no switching, so it stays out of the window.
  const meter = leaveItems(extraCtx(hass, { leaveAdd: ["switch.socket_meter"], meters: { "switch.socket_meter": true } }), hass);
  assert.deepEqual(meter.extra, []);
  assert.deepEqual(leaveItems(extraCtx(hass, { leaveAdd: ["switch.socket_meter"] }), hass).extra, ["switch.socket_meter"]);
});

test("a picked player that is playing belongs to its own group, not to the music as well", () => {
  const hass = extraHouse();
  const it = leaveItems(extraCtx(hass, { leaveAdd: ["media_player.radio"] }), hass);
  assert.deepEqual(it.extra, ["media_player.radio"]);
  assert.deepEqual(it.media, [], "it is switched off, so it must not be paused on top of that");
  assert.equal(it.count, 2, "the lamp and the radio, counted once");
});

test("a player without TURN_OFF is only paused, and one that can't do that either is left alone", () => {
  assert.equal(canTurnOff({ attributes: { supported_features: 256 } }), true);
  assert.equal(canTurnOff({ attributes: { supported_features: 256 + 16384 } }), true);
  assert.equal(canTurnOff({ attributes: { supported_features: 16384 } }), false);
  assert.equal(canTurnOff({ attributes: {} }), false);
  assert.equal(canTurnOff(undefined), false);
  assert.equal(canPause({ attributes: { supported_features: 1 } }), true);
  assert.equal(canPause({ attributes: { supported_features: 16384 + 1 } }), true);
  // A browse-only player (131072) can neither be switched off nor paused.
  assert.equal(canPause({ attributes: { supported_features: 131072 } }), false);
  assert.equal(canTurnOff({ attributes: { supported_features: 131072 } }), false);
  assert.equal(canPause(undefined), false);
});
