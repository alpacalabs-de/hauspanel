// Meter readings on the energy page: which meters of the energy settings have a reading to show.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LIB, fakeHass } from "./fake.mjs";

const { meterReadings, readingText, readingLabel } = await import(LIB + "meters.js");

const kwh = (v) => ({ state: String(v), attributes: { unit_of_measurement: "kWh", device_class: "energy" } });
const m3 = (v) => ({ state: String(v), attributes: { unit_of_measurement: "m³" } });

test("the grid in both formats, feed-in, gas and water", () => {
  const hass = fakeHass({
    states: {
      "sensor.grid_in": kwh(12345.6), "sensor.grid_out": kwh(890.1),
      "sensor.heat_pump_in": kwh(4321),
      "sensor.gas_meter": m3(5678), "sensor.water_meter": m3(910),
    },
  });
  const prefs = {
    energy_sources: [
      // New format: the meters sit in flow_from / flow_to.
      { type: "grid", flow_from: [{ stat_energy_from: "sensor.grid_in" }], flow_to: [{ stat_energy_to: "sensor.grid_out" }] },
      // Old format: the meters sit right on the source.
      { type: "grid", name: "Heat pump", stat_energy_from: "sensor.heat_pump_in" },
      { type: "solar", stat_energy_from: "sensor.grid_in" },
      { type: "gas", stat_energy_from: "sensor.gas_meter" },
      { type: "water", stat_energy_from: "sensor.water_meter" },
    ],
  };
  assert.deepEqual(meterReadings(hass, prefs).map((r) => [r.kind, r.id, r.value, r.unit]), [
    ["import", "sensor.grid_in", 12345.6, "kWh"],
    ["export", "sensor.grid_out", 890.1, "kWh"],
    ["import", "sensor.heat_pump_in", 4321, "kWh"],
    ["gas", "sensor.gas_meter", 5678, "m³"],
    ["water", "sensor.water_meter", 910, "m³"],
  ]);
});

test("statistics without an entity and meters without a number fall out", () => {
  const hass = fakeHass({ states: { "sensor.ok": kwh(10), "sensor.broken": "unavailable", "sensor.empty": "unknown" } });
  const ids = (sources) => meterReadings(hass, { energy_sources: sources }).map((r) => r.id);
  assert.deepEqual(ids([{ type: "grid", flow_from: [{ stat_energy_from: "tibber:energy_consumption_abc" }, { stat_energy_from: "sensor.ok" }] }]), ["sensor.ok"]);
  assert.deepEqual(ids([{ type: "grid", flow_from: [{ stat_energy_from: "sensor.broken" }, { stat_energy_from: "sensor.empty" }] }]), []);
  assert.deepEqual(meterReadings(hass, null), []);
  assert.deepEqual(meterReadings(hass, {}), []);
});

test("the same meter in two sources gives one line", () => {
  const hass = fakeHass({ states: { "sensor.one": kwh(7) } });
  const r = meterReadings(hass, { energy_sources: [
    { type: "grid", flow_from: [{ stat_energy_from: "sensor.one" }] },
    { type: "grid", flow_from: [{ stat_energy_from: "sensor.one" }] },
  ] });
  assert.deepEqual(r.map((x) => x.id), ["sensor.one"]);
});

test("the name of the source, and the entity's own name when a source has several meters", () => {
  const hass = fakeHass({ states: { "sensor.day_rate": kwh(1), "sensor.night_rate": kwh(2), "sensor.single": kwh(3) } });
  const several = meterReadings(hass, { energy_sources: [{ type: "grid", name: "Grid", flow_from: [{ stat_energy_from: "sensor.day_rate" }, { stat_energy_from: "sensor.night_rate" }] }] });
  assert.deepEqual(several.map((r) => r.name), ["day rate", "night rate"]);
  // Both are imports, so each line says which meter it is.
  assert.deepEqual(several.map((r) => readingLabel(several, r)), ["From the grid · day rate", "From the grid · night rate"]);
  const one = meterReadings(hass, { energy_sources: [{ type: "grid", name: "Grid", flow_from: [{ stat_energy_from: "sensor.single" }] }] });
  assert.deepEqual(one.map((r) => [r.name, readingLabel(one, r)]), [["Grid", "From the grid"]]);
});

test("the reading is shown the way Home Assistant shows it", () => {
  const hass = fakeHass({ states: { "sensor.one": kwh(1234.5) } });
  const [r] = meterReadings(hass, { energy_sources: [{ type: "gas", stat_energy_from: "sensor.one" }] });
  assert.equal(readingText(hass, r), "1234.5 kWh");
  hass.formatEntityState = (st) => `${Number(st.state).toLocaleString("de-DE")} kWh`;
  assert.equal(readingText(hass, r), "1.234,5 kWh");
  assert.equal(readingText(hass, { id: "sensor.gone", unit: "kWh" }), "–");
});
