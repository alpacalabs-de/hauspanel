// Devices with a power meter only (#44): a power sensor shown as a device that is on above a threshold.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LIB, fakeHass } from "./fake.mjs";

const { powerRun, powerThreshold, powerDeviceText, todayKwh, powerStatus, POWER_ON_DEFAULT, isPowerSensor } = await import(LIB + "powerdevice.js");
const { editToggle } = await import(LIB + "tile.js");
const { meterSensors } = await import(LIB + "usage.js");
const { HOUSE_KEYS, Settings } = await import(LIB + "store.js");

const MIN = 60000;
const T0 = Date.UTC(2026, 10, 25, 12, 0);
const at = (min, w) => ({ t: T0 + min * MIN, w });

test("power device: on above the threshold, a short dip stays on, a long pause goes off (#44)", () => {
  // 2 kW, a 1-minute dip to 5 W, back up: still on, running since the first reading.
  const pts = [at(0, 0), at(5, 2000), at(20, 5), at(21, 2000)];
  assert.deepEqual(powerRun(pts, 20, T0 + 30 * MIN), { on: true, since: T0 + 5 * MIN, offAt: null });
  // Down to 5 W at minute 40: still on for under 2 minutes, then off.
  const down = [...pts, at(40, 5)];
  const r = powerRun(down, 20, T0 + 41 * MIN);
  assert.equal(r.on, true);
  assert.equal(r.offAt, T0 + 42 * MIN);
  assert.deepEqual(powerRun(down, 20, T0 + 43 * MIN), { on: false, since: null, offAt: null });
  // Exactly at the threshold is not above it.
  assert.equal(powerRun([at(0, 20)], 20, T0).on, false);
  // Nothing at all: off.
  assert.deepEqual(powerRun([], 20, T0), { on: false, since: null, offAt: null });
});

test("power device: 'since' over an oven that cycles its heating (#44)", () => {
  // Preheat at minute 10, then the element cycles: 1 min off, 3 min on, … for half an hour.
  const pts = [at(0, 1), at(10, 2400)];
  for (let m = 14; m < 40; m += 4) pts.push(at(m, 3), at(m + 1, 2400));
  const r = powerRun(pts, 20, T0 + 40 * MIN);
  assert.equal(r.on, true);
  assert.equal(r.since, T0 + 10 * MIN, "the cycling does not restart the run");
  // An earlier run that ended with a long pause does not count: since is the new start.
  const two = [at(0, 2000), at(10, 2), at(30, 2000)];
  assert.equal(powerRun(two, 20, T0 + 35 * MIN).since, T0 + 30 * MIN);
  // A pause that ends just under 2 minutes keeps the old start.
  const near = [at(0, 2000), at(10, 2), at(11.9, 2000)];
  assert.equal(powerRun(near, 20, T0 + 15 * MIN).since, T0);
});

test("power device: threshold from the setting, else the default (#44)", () => {
  assert.equal(POWER_ON_DEFAULT, 20);
  assert.equal(powerThreshold(undefined), 20);
  assert.equal(powerThreshold({}), 20);
  assert.equal(powerThreshold({ on: 50 }), 50);
  assert.equal(powerThreshold({ on: 0 }), 20);
  assert.equal(powerThreshold({ on: "x" }), 20);
  // A heater at 35 W: on with the default, off with a threshold of 50 W.
  assert.equal(powerRun([at(0, 35)], powerThreshold({}), T0).on, true);
  assert.equal(powerRun([at(0, 35)], powerThreshold({ on: 50 }), T0).on, false);
  // The store keeps it per sensor, and it travels with the house settings.
  const s = new Settings(() => {});
  s.togglePowerDevice("sensor.oven_power");
  assert.deepEqual(s.s.powerDevices, { "sensor.oven_power": {} });
  s.setPowerThreshold("sensor.oven_power", 60);
  assert.equal(powerThreshold(s.s.powerDevices["sensor.oven_power"]), 60);
  s.togglePowerDevice("sensor.oven_power");
  assert.deepEqual(s.s.powerDevices, {});
  assert.ok(HOUSE_KEYS.includes("powerDevices"));
});

test("power device: the state reads the current power, in kW too (#44)", () => {
  const hass = fakeHass({ states: { "sensor.oven_power": { state: "2.1", attributes: { device_class: "power", unit_of_measurement: "kW" }, last_updated: new Date(Date.now() - 5 * MIN).toISOString() } } });
  hass.callWS = () => new Promise(() => {}); // history still loading
  const s = powerStatus(hass, "sensor.oven_power", 20);
  assert.equal(s.on, true);
  assert.equal(s.w, 2100);
});

test("power device: today's energy only with an energy sensor on the same device (#44)", () => {
  const hass = fakeHass({
    states: {
      "sensor.oven_power": { state: "0", attributes: { device_class: "power", unit_of_measurement: "W" } },
      "sensor.lamp_power": { state: "0", attributes: { device_class: "power", unit_of_measurement: "W" } },
      "sensor.oven_energy": { state: "12.5", attributes: { device_class: "energy", unit_of_measurement: "kWh" } },
    },
    entities: {
      "sensor.oven_power": { device_id: "oven" },
      "sensor.oven_energy": { device_id: "oven" },
      "sensor.lamp_power": { device_id: "lamp" },
    },
  });
  assert.equal(meterSensors(hass, "sensor.oven_power").energy, "sensor.oven_energy");
  assert.equal(meterSensors(hass, "sensor.lamp_power").energy, null);
  let asked = 0;
  hass.callWS = () => { asked++; return new Promise(() => {}); };
  assert.equal(todayKwh(hass, null), null);
  assert.equal(asked, 0, "nothing asked without an energy sensor");
  assert.equal(powerDeviceText(hass, { on: false }, null), "Off");
  assert.equal(powerDeviceText(hass, { on: false }, 1.2), "Off · today 1.2 kWh");
  assert.match(powerDeviceText(hass, { on: true, w: 2100, since: Date.now() - 35 * MIN }, 1.2), /^On · 2\.1 kW · for 35 min$/);
});

test("power device: only a power sensor gets the Device button (#44)", () => {
  const hass = fakeHass({
    states: {
      "sensor.oven_power": { state: "0", attributes: { device_class: "power" } },
      "sensor.oven_energy": { state: "1", attributes: { device_class: "energy" } },
      "sensor.kitchen_temperature": { state: "21", attributes: { device_class: "temperature" } },
      "sensor.plain": "5",
    },
  });
  const ctx = { hass, settings: { s: {} } };
  assert.equal(editToggle(ctx, "sensor.oven_power"), "power");
  assert.equal(editToggle(ctx, "sensor.oven_energy"), null);
  assert.equal(editToggle(ctx, "sensor.kitchen_temperature"), null);
  assert.equal(editToggle(ctx, "sensor.plain"), null);
  assert.equal(isPowerSensor(hass, "sensor.oven_power"), true);
  assert.equal(isPowerSensor(hass, "switch.oven"), false);
});

// ---- "On now" lists power devices that are on, with the tile's own state (#44)
const { runningPowerDevices } = await import(LIB + "powerdevice.js");

test("power device: listed under On now while on, not when off, a short dip stays listed (#44)", async () => {
  const now = Date.now();
  const iso = (min) => new Date(now - min * MIN).toISOString();
  const pw = (state, min, extra = {}) => ({ state, attributes: { device_class: "power", unit_of_measurement: "W", ...extra }, last_updated: iso(min) });
  const hass = fakeHass({
    states: {
      "sensor.run_oven_power": pw("2400", 3),
      "sensor.run_dip_power": pw("4", 1), // dropped a minute ago, after half an hour on
      "sensor.run_off_power": pw("3", 10), // dropped ten minutes ago: off
      "sensor.run_idle_power": pw("0", 60),
      "sensor.run_lamp_power": pw("60", 5), // above the threshold, but not set as a device
      "sensor.run_temp": { state: "200", attributes: { device_class: "temperature" } },
    },
    devices: { oven: { id: "oven", name: "Oven" }, dip: { id: "dip", name: "Kettle" }, off: { id: "off", name: "Heater" } },
    entities: { "sensor.run_oven_power": { device_id: "oven" }, "sensor.run_dip_power": { device_id: "dip" }, "sensor.run_off_power": { device_id: "off" } },
  });
  const hist = {
    "sensor.run_oven_power": [{ s: "1", lu: (now - 40 * MIN) / 1000 }, { s: "2400", lu: (now - 35 * MIN) / 1000 }],
    "sensor.run_dip_power": [{ s: "2000", lu: (now - 30 * MIN) / 1000 }, { s: "4", lu: (now - 1 * MIN) / 1000 }],
    "sensor.run_off_power": [{ s: "1800", lu: (now - 30 * MIN) / 1000 }, { s: "3", lu: (now - 10 * MIN) / 1000 }],
    "sensor.run_idle_power": [{ s: "0", lu: (now - 60 * MIN) / 1000 }],
  };
  hass.callWS = (m) => Promise.resolve(m.type === "history/history_during_period" ? { [m.entity_ids[0]]: hist[m.entity_ids[0]] || [] } : {});
  const conf = { "sensor.run_oven_power": {}, "sensor.run_dip_power": {}, "sensor.run_off_power": {}, "sensor.run_idle_power": { on: 10 }, "sensor.run_temp": {} };
  let loaded = 0;
  runningPowerDevices(hass, conf, () => loaded++);
  await new Promise((r) => setTimeout(r, 10));
  assert.ok(loaded >= 4, "the history loads once per device");
  const list = runningPowerDevices(hass, conf);
  assert.deepEqual(list.map((d) => d.id), ["sensor.run_oven_power", "sensor.run_dip_power"]);
  const [oven, dip] = list;
  assert.equal(oven.name, "Oven");
  assert.equal(oven.icon, "mdi:stove");
  assert.equal(oven.status.since, now - 35 * MIN, "running since the history says, like the tile");
  assert.equal(powerDeviceText(hass, oven.status, null), "On · 2.4 kW · for 35 min");
  // The dip: still on (the tile's hysteresis), going off two minutes after it began.
  assert.equal(dip.status.on, true);
  assert.equal(dip.status.offAt, now - 1 * MIN + 2 * MIN);
  assert.equal(dip.icon, "mdi:kettle");
  // No setting, nothing listed.
  assert.deepEqual(runningPowerDevices(hass, undefined), []);
});
