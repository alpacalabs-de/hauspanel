// Smoke, gas and leak sensors share one group; its name follows what is in it (#9).
import { test } from "node:test";
import assert from "node:assert/strict";
import { LIB } from "./fake.mjs";

const { hazardInfo } = await import(LIB + "domains.js");
const { t } = await import(LIB + "i18n.js");

const sensor = (dc, on = false) => ({ state: on ? "on" : "off", attributes: { device_class: dc } });
const hassOf = (states) => ({ states });

test("only smoke detectors stay smoke alarms", () => {
  const hz = hazardInfo(hassOf({ "binary_sensor.a": sensor("smoke") }), ["binary_sensor.a"]);
  assert.equal(hz.label, t("smoke_alarms"));
});

test("only leak sensors are not called smoke alarms", () => {
  const hass = hassOf({ "binary_sensor.a": sensor("moisture"), "binary_sensor.b": sensor("moisture", true) });
  const hz = hazardInfo(hass, ["binary_sensor.a", "binary_sensor.b"]);
  assert.equal(hz.label, t("leak_sensors"));
  assert.equal(hz.alarm, t("hz_water_alarm"));
});

test("a mix is called detectors, and smoke wins the alarm text", () => {
  const hass = hassOf({ "binary_sensor.a": sensor("moisture", true), "binary_sensor.b": sensor("smoke", true) });
  const hz = hazardInfo(hass, ["binary_sensor.a", "binary_sensor.b"]);
  assert.equal(hz.label, t("hazard_sensors"));
  assert.equal(hz.alarm, t("ov_smoke_alarm"));
});

const { hazardAlarms, hazardBatteries } = await import(LIB + "notices.js");
const { fakeHass } = await import("./fake.mjs");

test("an alarm shows on Home, a hidden detector does not", () => {
  const hass = fakeHass({
    states: { "binary_sensor.leak": sensor("moisture", true), "binary_sensor.old": sensor("smoke", true), "binary_sensor.door": sensor("door", true) },
    entities: { "binary_sensor.old": { hidden: true } },
  });
  assert.deepEqual(hazardAlarms(hass), ["binary_sensor.leak"]);
});

test("a detector with a weak battery on its device shows once", () => {
  const batt = (v) => ({ state: String(v), attributes: { device_class: "battery", unit_of_measurement: "%" } });
  const hass = fakeHass({
    states: { "binary_sensor.smoke": sensor("smoke"), "sensor.smoke_battery": batt(15), "binary_sensor.leak": sensor("moisture"), "sensor.leak_battery": batt(80),
      "binary_sensor.gas": sensor("gas"), "sensor.gas_battery": batt(5) },
    entities: { "binary_sensor.smoke": { device_id: "d1" }, "sensor.smoke_battery": { device_id: "d1" }, "binary_sensor.leak": { device_id: "d2" }, "sensor.leak_battery": { device_id: "d2" },
      "binary_sensor.gas": { device_id: "d3" }, "sensor.gas_battery": { device_id: "d3" } },
  });
  assert.deepEqual(hazardBatteries(hass).map((b) => [b.id, b.level]), [["binary_sensor.smoke", 15], ["binary_sensor.gas", 5]]);
  assert.deepEqual(hazardBatteries(hass, ["d3"]).map((b) => b.id), ["binary_sensor.smoke"]);
});

test("with the panel's security items only those detectors count", () => {
  const hass = fakeHass({ states: { "binary_sensor.smoke": sensor("smoke", true), "binary_sensor.pool_gas": sensor("gas", true) } });
  assert.deepEqual(hazardAlarms(hass, ["binary_sensor.smoke"]), ["binary_sensor.smoke"]);
});
