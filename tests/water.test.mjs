// Water on the energy page: litres from any meter unit, flow in litres per minute.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LIB, fakeHass } from "./fake.mjs";

const { toLitres, flowLpm, flowSensor, waterSources } = await import(LIB + "water.js");

test("meter units become litres", () => {
  assert.equal(toLitres(1.5, "m³"), 1500);
  assert.equal(toLitres(20, "L"), 20);
  assert.equal(Math.round(toLitres(1, "gal") * 100) / 100, 3.79);
});

test("flow in litres per minute", () => {
  const f = (v, u) => ({ state: String(v), attributes: { unit_of_measurement: u } });
  assert.equal(flowLpm(f(6, "L/min")), 6);
  assert.equal(flowLpm(f(0.6, "m³/h")), 10);
  assert.equal(flowLpm(f("unknown", "L/min")), null);
});

test("the flow sensor on the meter's device wins", () => {
  const flow = (v) => ({ state: String(v), attributes: { device_class: "volume_flow_rate", unit_of_measurement: "L/min" } });
  const hass = fakeHass({
    states: { "sensor.meter": { state: "100", attributes: { unit_of_measurement: "m³" } }, "sensor.flow_a": flow(1), "sensor.flow_b": flow(2) },
    entities: { "sensor.meter": { device_id: "d1" }, "sensor.flow_b": { device_id: "d1" } },
  });
  assert.equal(flowSensor(hass, "sensor.meter"), "sensor.flow_b");
  assert.deepEqual(waterSources(hass, { energy_sources: [{ type: "water", stat_energy_from: "sensor.meter", number_energy_price: 4.2 }] }).map((w) => [w.unit, w.priceNumber]), [["m³", 4.2]]);
});

test("week starts on Monday, month on the 1st", async () => {
  const { periodStart } = await import(LIB + "water.js");
  const wed = new Date(2026, 10, 18, 15, 0);
  assert.equal(periodStart("week", wed).getDate(), 16);
  assert.equal(periodStart("month", wed).getDate(), 1);
  assert.equal(periodStart("day", wed).getHours(), 0);
});
