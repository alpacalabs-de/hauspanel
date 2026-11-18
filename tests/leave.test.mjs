// Leaving home: a heating thermostat is set back to away or eco, otherwise switched off,
// and devices left alone by hand are skipped everywhere.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LIB, fakeHass } from "./fake.mjs";

const { heatSetback, leaveItems } = await import(LIB + "leave.js");

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
