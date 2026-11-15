// Window open while the heating runs: which rooms, and what counts as heating.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LIB, fakeHass } from "./fake.mjs";

const { windowHeatRooms, isHeating } = await import(LIB + "notices.js");

const heat = (action, extra = {}) => ({ state: "heat", attributes: { hvac_action: action, ...extra } });

test("heating means hvac_action heating, or heat mode below the target when there is no action", () => {
  assert.equal(isHeating(heat("heating")), true);
  assert.equal(isHeating(heat("preheating")), true);
  assert.equal(isHeating(heat("idle")), false);
  assert.equal(isHeating({ state: "off", attributes: { hvac_action: "heating" } }), false);
  assert.equal(isHeating({ state: "heat", attributes: { current_temperature: 19, temperature: 21 } }), true);
  assert.equal(isHeating({ state: "heat", attributes: { current_temperature: 22, temperature: 21 } }), false);
  assert.equal(isHeating({ state: "auto", attributes: { current_temperature: 19, temperature: 21 } }), false, "auto without an action: unknown, so no");
});

test("a room shows when one of its windows is open and its heating runs", () => {
  const hass = fakeHass({
    states: {
      "binary_sensor.living_window": { state: "on", attributes: { device_class: "window" } },
      "binary_sensor.living_door": { state: "on", attributes: { device_class: "door" } },
      "binary_sensor.bath_window": { state: "on", attributes: { device_class: "window" } },
      "binary_sensor.kitchen_window": { state: "off", attributes: { device_class: "window" } },
      "binary_sensor.hidden_window": { state: "on", attributes: { device_class: "opening" } },
      "climate.living": heat("heating"),
      "climate.bath": heat("idle"),
      "climate.kitchen": heat("heating"),
      "climate.hidden": heat("heating"),
    },
    devices: { d_bath: { area_id: "bath" } },
    entities: {
      "binary_sensor.living_window": { area_id: "living" },
      "binary_sensor.living_door": { area_id: "living" },
      "climate.living": { area_id: "living" },
      "binary_sensor.bath_window": { device_id: "d_bath" },
      "climate.bath": { device_id: "d_bath" },
      "binary_sensor.kitchen_window": { area_id: "kitchen" },
      "climate.kitchen": { area_id: "kitchen" },
      "binary_sensor.hidden_window": { area_id: "attic", hidden: true },
      "climate.hidden": { area_id: "attic" },
    },
  });
  const rooms = windowHeatRooms(hass);
  assert.deepEqual(rooms.map((r) => r.area), ["living"], "bath doesn't heat, kitchen window is shut, the attic window is hidden");
  assert.deepEqual(rooms[0].windows, ["binary_sensor.living_window"], "doors don't count");
  assert.deepEqual(rooms[0].climates, ["climate.living"]);
});
