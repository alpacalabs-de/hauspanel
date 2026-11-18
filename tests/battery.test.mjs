// House use with a home battery (#10): charging is not use, discharging is.
// And where the battery's charge level comes from (#20).
import { test } from "node:test";
import assert from "node:assert/strict";
import { LIB, fakeHass } from "./fake.mjs";

const { houseUse, withEnergyPicks } = await import(LIB + "energy.js");
const { livePower } = await import(LIB + "energyflow.js");
const { batterySources, batteryKey, batterySoc, socSensor, socSensors, deviceSoc, capacityOf, batteryName } = await import(LIB + "battery.js");
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test("without a battery nothing changes", () => {
  const u = houseUse({ imp: 2, sol: 3, exp: 1 });
  close(u.use, 4); close(u.solar, 2); close(u.grid, 2);
});

test("sun that goes into the battery is not use", () => {
  const u = houseUse({ imp: 0, sol: 5, exp: 0, charge: 3 });
  close(u.use, 2); close(u.solar, 2);
});

test("the battery giving at night counts as use", () => {
  const u = houseUse({ imp: 0.5, discharge: 2 });
  close(u.use, 2.5); close(u.battery, 2); close(u.grid, 0.5);
});

test("charging from the grid comes off the grid share", () => {
  const u = houseUse({ imp: 4, sol: 0, charge: 3 });
  close(u.use, 1); close(u.gridToBattery, 3); close(u.grid, 1);
});

test("live house power adds grid, solar and battery", () => {
  const w = (v) => ({ state: String(v), attributes: { device_class: "power", unit_of_measurement: "W" } });
  const hass = fakeHass({ states: { "sensor.grid": w(-300), "sensor.sun": w(2000), "sensor.batt": w(-1200) } });
  const prefs = { energy_sources: [{ type: "solar", stat_rate: "sensor.sun" }, { type: "battery", stat_rate: "sensor.batt" }] };
  const p = livePower(hass, prefs, "sensor.grid");
  assert.equal(p.house, 500); assert.equal(p.battery, -1200); assert.equal(p.grid, -300);
});

// --- Charge level (#20) ---

const pct = (v) => ({ state: String(v), attributes: { device_class: "battery", unit_of_measurement: "%" } });
const kwh = (v) => ({ state: String(v), attributes: { device_class: "energy", unit_of_measurement: "kWh" } });

const one = {
  energy_sources: [{
    type: "battery", stat_energy_from: "sensor.batt_out", stat_energy_to: "sensor.batt_in",
    stat_rate: "sensor.batt_w", stat_soc: "sensor.batt_soc",
  }],
};

test("the charge level comes from the energy settings", () => {
  const hass = fakeHass({ states: { "sensor.batt_soc": pct(72), "sensor.batt_w": kwh(0) } });
  const soc = batterySoc(hass, one);
  assert.equal(soc.pct, 72);
  assert.equal(soc.parts.length, 1);
  assert.equal(soc.parts[0].id, "sensor.batt_soc");
  assert.equal(soc.parts[0].name, "Battery", "one battery keeps the plain name");
});

test("without stat_soc the sensor on the same device does it", () => {
  const hass = fakeHass({
    states: { "sensor.batt_out": kwh(10), "sensor.house_soc": pct(40), "sensor.phone_soc": pct(90) },
    entities: {
      "sensor.batt_out": { device_id: "dev1" },
      "sensor.house_soc": { device_id: "dev1" },
      "sensor.phone_soc": { device_id: "dev2" },
    },
  });
  const prefs = { energy_sources: [{ type: "battery", stat_energy_from: "sensor.batt_out", stat_energy_to: "sensor.batt_in" }] };
  const [s] = batterySources(prefs);
  assert.equal(deviceSoc(hass, s), "sensor.house_soc", "the phone on another device stays out of it");
  assert.equal(batterySoc(hass, prefs).pct, 40);
  assert.deepEqual(socSensors(hass), ["sensor.house_soc", "sensor.phone_soc"], "the picker offers every percent sensor");
  // A statistic Home Assistant knows but no entity does falls back to the device as well.
  const ext = { energy_sources: [{ ...prefs.energy_sources[0], stat_soc: "tibber:battery_soc" }] };
  assert.equal(socSensor(hass, batterySources(ext)[0], null), "sensor.house_soc");
});

test("two batteries count by their size, without a size they count the same", () => {
  const prefs = {
    energy_sources: [
      { type: "battery", stat_energy_from: "sensor.a_out", stat_energy_to: "sensor.a_in", stat_soc: "sensor.a_soc", capacity: 10, name: "Cellar" },
      { type: "battery", stat_energy_from: "sensor.b_out", stat_energy_to: "sensor.b_in", stat_soc: "sensor.b_soc", entity_capacity: "sensor.b_cap" },
    ],
  };
  const hass = fakeHass({ states: { "sensor.a_soc": pct(100), "sensor.b_soc": pct(50), "sensor.b_cap": kwh(30), "sensor.b_out": kwh(5) } });
  const soc = batterySoc(hass, prefs);
  assert.equal(soc.pct, 62.5, "(100 × 10 + 50 × 30) / 40");
  assert.equal(soc.parts[0].name, "Cellar");
  assert.equal(soc.parts[1].name, "b out", "several batteries are told apart by their sensors");
  assert.equal(capacityOf(hass, batterySources(prefs)[1]), 30);
  // Without any capacity both count the same.
  const flat = { energy_sources: prefs.energy_sources.map(({ capacity, entity_capacity, ...s }) => s) };
  assert.equal(batterySoc(hass, flat).pct, 75);
});

test("a battery that says nothing falls out, no battery gives null", () => {
  const hass = fakeHass({ states: { "sensor.batt_soc": { state: "unavailable", attributes: { device_class: "battery", unit_of_measurement: "%" } } } });
  assert.equal(batterySoc(hass, one), null);
  assert.equal(batterySoc(fakeHass({}), one), null, "a sensor Home Assistant does not know counts for nothing");
  assert.equal(batterySoc(fakeHass({}), { energy_sources: [{ type: "solar", stat_energy_from: "sensor.pv" }] }), null);
  assert.equal(batterySoc(fakeHass({}), null), null);
  // One battery of two keeps counting on its own.
  const two = { energy_sources: [one.energy_sources[0], { type: "battery", stat_energy_from: "sensor.b_out", stat_soc: "sensor.b_soc" }] };
  const half = fakeHass({ states: { "sensor.batt_soc": { state: "unknown", attributes: { device_class: "battery" } }, "sensor.b_soc": pct(30) } });
  assert.equal(batterySoc(half, two).pct, 30);
});

test("picked by hand beats Home Assistant's own sensors", () => {
  const hass = fakeHass({ states: { "sensor.batt_soc": pct(72), "sensor.my_soc": pct(55) } });
  const picks = { batteryBy: { "sensor.batt_out": { power: "sensor.my_w", soc: "sensor.my_soc" } } };
  assert.equal(socSensor(hass, batterySources(one)[0], picks), "sensor.my_soc");
  // The picks go into the settings, so everything downstream sees them.
  const picked = withEnergyPicks(one, picks);
  assert.equal(picked.energy_sources[0].stat_rate, "sensor.my_w", "the power sensor brings the battery circle back");
  assert.equal(batterySoc(hass, picked).pct, 55);
  assert.equal(one.energy_sources[0].stat_rate, "sensor.batt_w", "Home Assistant's settings stay as they are");
});

test("every battery has a key of its own, even without a meter", () => {
  assert.equal(batteryKey({ stat_energy_from: "sensor.a" }, 0), "sensor.a");
  assert.equal(batteryKey({ stat_energy_to: "sensor.b" }, 1), "sensor.b");
  assert.equal(batteryKey({ stat_soc: "sensor.c" }, 2), "sensor.c");
  assert.equal(batteryKey({}, 3), "battery_3", "a battery counted per direction still has its place");
  assert.deepEqual(batterySources(one)[0], {
    key: "sensor.batt_out", from: "sensor.batt_out", to: "sensor.batt_in", rate: "sensor.batt_w",
    soc: "sensor.batt_soc", capacity: null, entityCapacity: null, name: null,
  });
  assert.equal(batteryName(fakeHass({}), { name: "Cellar" }, true), "Cellar");
  assert.equal(batteryName(fakeHass({}), { from: "sensor.gone" }, true), "Battery");
});
