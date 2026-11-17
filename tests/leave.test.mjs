// Leaving home: a heating thermostat is set back to away or eco, otherwise switched off.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LIB } from "./fake.mjs";

const { heatSetback } = await import(LIB + "leave.js");

test("away preset first, then eco, otherwise off", () => {
  assert.deepEqual(heatSetback({ attributes: { preset_modes: ["comfort", "eco", "away"] } }), { service: "set_preset_mode", data: { preset_mode: "away" } });
  assert.deepEqual(heatSetback({ attributes: { preset_modes: ["Comfort", "Eco"] } }), { service: "set_preset_mode", data: { preset_mode: "Eco" } });
  assert.deepEqual(heatSetback({ attributes: {} }), { service: "turn_off", data: {} });
});
