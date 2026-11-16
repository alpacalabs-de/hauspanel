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
