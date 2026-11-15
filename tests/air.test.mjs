// "Time to air": rooms with high CO2 or humidity, unless a window is already open.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LIB, fakeHass } from "./fake.mjs";

const { airRooms, airText } = await import(LIB + "notices.js");

const co2 = (v) => ({ state: String(v), attributes: { device_class: "carbon_dioxide", unit_of_measurement: "ppm" } });
const hum = (v) => ({ state: String(v), attributes: { device_class: "humidity", unit_of_measurement: "%" } });
const win = (on) => ({ state: on ? "on" : "off", attributes: { device_class: "window" } });
const areas = { bed: { name: "Bedroom" }, bath: { name: "Bath" }, office: { name: "Office" }, garden: { name: "Garden" }, wg: { name: "Wintergarten" } };

test("a room with high CO2 or humidity shows, with what is high", () => {
  const hass = fakeHass({
    areas,
    states: { "sensor.bed_co2": co2(1520), "sensor.bed_hum": hum(50), "sensor.bath_hum": hum(74), "sensor.office_co2": co2(900) },
    entities: { "sensor.bed_co2": { area_id: "bed" }, "sensor.bed_hum": { area_id: "bed" }, "sensor.bath_hum": { area_id: "bath" }, "sensor.office_co2": { area_id: "office" } },
  });
  const r = airRooms(hass);
  assert.deepEqual(r.map((x) => x.area), ["bath", "bed"]);
  assert.equal(r.find((x) => x.area === "bed").co2Id, "sensor.bed_co2");
  assert.equal(airText(hass, r.find((x) => x.area === "bed")), "CO₂ 1,520 ppm");
  assert.equal(airText(hass, r.find((x) => x.area === "bath")), "Humidity 74 %");
});

test("an open window, outdoor rooms, outdoor sensors and hidden sensors don't count", () => {
  const hass = fakeHass({
    areas,
    states: {
      "sensor.bed_co2": co2(1800), "binary_sensor.bed_window": win(true),
      "sensor.garden_hum": hum(95), "sensor.wg_hum": hum(80),
      "sensor.outdoor_humidity": hum(90), "sensor.office_hidden": co2(2000),
    },
    entities: {
      "sensor.bed_co2": { area_id: "bed" }, "binary_sensor.bed_window": { area_id: "bed" },
      "sensor.garden_hum": { area_id: "garden" }, "sensor.wg_hum": { area_id: "wg" },
      "sensor.outdoor_humidity": { area_id: "office" }, "sensor.office_hidden": { area_id: "office", hidden: true },
    },
  });
  assert.deepEqual(airRooms(hass).map((x) => x.area), ["wg"], "a winter garden is indoors");
});
