// Several inverters (#20): every solar source of the energy settings counts, not just the first one.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LIB, fakeHass } from "./fake.mjs";

const { withEnergyPicks, solarSources, solarRates, solarName } = await import(LIB + "energy.js");
const { livePower } = await import(LIB + "energyflow.js");
const { sumSeries } = await import(LIB + "solar.js");

const w = (v) => ({ state: String(v), attributes: { device_class: "power", unit_of_measurement: "W" } });
const twoRoofs = {
  energy_sources: [
    { type: "solar", stat_energy_from: "sensor.pv_east_kwh", stat_rate: "sensor.pv_east_w", name: "East roof" },
    { type: "solar", stat_energy_from: "sensor.pv_west_kwh", stat_rate: "sensor.pv_west_w" },
  ],
};

test("live power adds up every inverter", () => {
  const hass = fakeHass({ states: { "sensor.grid": w(-500), "sensor.pv_east_w": w(2000), "sensor.pv_west_w": w(1500) } });
  const p = livePower(hass, twoRoofs, "sensor.grid");
  assert.equal(p.solar, 3500);
  assert.equal(p.house, 3000);
});

test("an inverter that says nothing counts as zero, the other one still counts", () => {
  const hass = fakeHass({ states: { "sensor.grid": w(0), "sensor.pv_east_w": w(2000), "sensor.pv_west_w": { state: "unavailable", attributes: { device_class: "power", unit_of_measurement: "W" } } } });
  assert.equal(livePower(hass, twoRoofs, "sensor.grid").solar, 2000);
});

test("one inverter works as it always did", () => {
  const prefs = { energy_sources: [{ type: "solar", stat_energy_from: "sensor.pv_kwh", stat_rate: "sensor.pv_w" }] };
  const hass = fakeHass({ states: { "sensor.grid": w(100), "sensor.pv_w": w(800) } });
  assert.equal(livePower(hass, prefs, "sensor.grid").solar, 800);
  assert.deepEqual(solarRates(prefs), ["sensor.pv_w"]);
  assert.deepEqual(solarSources(prefs), [{ energy: "sensor.pv_kwh", rate: "sensor.pv_w", name: null }]);
  assert.deepEqual(solarSources(null), []);
});

test("each inverter gets its own power sensor, the old single pick still fits the first one", () => {
  const byHand = withEnergyPicks(twoRoofs, { solarBy: { "sensor.pv_east_kwh": "sensor.east_w2", "sensor.pv_west_kwh": "sensor.west_w2" } });
  assert.deepEqual(solarRates(byHand), ["sensor.east_w2", "sensor.west_w2"]);
  const old = withEnergyPicks(twoRoofs, { solar: "sensor.east_w2" });
  assert.deepEqual(solarRates(old), ["sensor.east_w2", "sensor.pv_west_w"], "the old pick only stands for the first source");
  const both = withEnergyPicks(twoRoofs, { solar: "sensor.old_w", solarBy: { "sensor.pv_east_kwh": "sensor.east_w2" } });
  assert.equal(solarRates(both)[0], "sensor.east_w2", "the picked list wins over the old single pick");
  assert.equal(twoRoofs.energy_sources[0].stat_rate, "sensor.pv_east_w", "Home Assistant's settings stay as they are");
});

test("two inverters are told apart by their energy sensors, one is just called Solar", () => {
  const hass = fakeHass({ states: { "sensor.pv_east_kwh": { state: "5", attributes: { friendly_name: "East meter" } } } });
  const [east, west] = solarSources(twoRoofs);
  assert.equal(solarName(hass, east, true), "East roof", "its own name from the energy settings");
  assert.equal(solarName(hass, { ...east, name: null }, true), "East meter", "otherwise the energy sensor's name");
  assert.equal(solarName(hass, { ...east, name: null }, false), "Solar", "with one inverter the name stays out of the way");
  assert.equal(solarName(hass, west, true), "Solar", "a sensor Home Assistant does not know falls back");
  assert.equal(solarName(hass, { energy: "sensor.gone", rate: null, name: null }, true), "Solar");
});

test("two curves become one, sampled on all their times", () => {
  const a = [{ t: 0, v: 1 }, { t: 10, v: 3 }];
  const b = [{ t: 5, v: 2 }, { t: 10, v: 4 }];
  assert.deepEqual(sumSeries([a, b]), [{ t: 0, v: 1 }, { t: 5, v: 3 }, { t: 10, v: 7 }]);
  assert.deepEqual(sumSeries([a]), a, "one curve comes back as it is");
  assert.deepEqual(sumSeries([[], a, []]), a, "empty lists do not count");
  assert.deepEqual(sumSeries([]), []);
});
