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

test("water costs count per litre, not per the meter's own unit", async () => {
  const { waterPricePerLitre } = await import(LIB + "water.js");
  const perLitre = (w, states = {}, volume) => {
    const hass = fakeHass({ states });
    if (volume) hass.config.unit_system.volume = volume;
    return waterPricePerLitre(hass, w);
  };
  const money = (litres, p) => Math.round(litres * p * 100) / 100;
  const priceState = (unit) => ({ "sensor.price": { state: "0.0033", attributes: { unit_of_measurement: unit } } });

  // #32: a meter in litres with a fixed 3.30 per m³ costs 9.80 for 2970 L, not 9801.
  assert.equal(money(2970, perLitre({ unit: "L", priceNumber: 3.3, priceEntity: null })), 9.8);
  // The same water through a meter in m³ is unchanged: price times cubic metres.
  assert.equal(money(2970, perLitre({ unit: "m³", priceNumber: 3.3, priceEntity: null })), 9.8);
  // A price entity is priced by the unit behind the "/".
  const byEntity = { unit: "L", priceNumber: null, priceEntity: "sensor.price" };
  assert.equal(money(2970, perLitre(byEntity, priceState("EUR/L"))), 9.8);
  assert.equal(perLitre(byEntity, priceState("EUR/m³")), 0.0033 / 1000);
});

test("the water price unit follows Home Assistant's", async () => {
  const { waterPricePerLitre, toLitres } = await import(LIB + "water.js");
  const perLitre = (w, states = {}, volume) => {
    const hass = fakeHass({ states });
    if (volume) hass.config.unit_system.volume = volume;
    return waterPricePerLitre(hass, w);
  };
  const priceState = (unit) => ({ "sensor.price": { state: "0.0033", attributes: { unit_of_measurement: unit } } });
  const byEntity = { unit: "L", priceNumber: null, priceEntity: "sensor.price" };

  // A unit we don't know behind the "/" falls back to m³, as a missing unit does.
  assert.equal(perLitre(byEntity, priceState("EUR/bucket")), 0.0033 / 1000);
  assert.equal(perLitre(byEntity, { "sensor.price": { state: "0.0033", attributes: {} } }), 0.0033 / 1000);
  // With imperial units a fixed price is per gallon.
  assert.equal(Math.round(perLitre({ unit: "gal", priceNumber: 3.78541, priceEntity: null }, {}, "gal") * 1000) / 1000, 1);
  // A fixed price never takes the unit of a price entity that happens to be there as well.
  assert.equal(perLitre({ unit: "L", priceNumber: 3.3, priceEntity: "sensor.price" }, priceState("EUR/L")), 3.3 / 1000);
  // No price at all, and a price that is not a number, stay empty.
  assert.equal(perLitre({ unit: "L", priceNumber: null, priceEntity: null }), null);
  assert.equal(perLitre(byEntity, { "sensor.price": { state: "unavailable", attributes: { unit_of_measurement: "EUR/L" } } }), null);
  // The big imperial meter units count too.
  assert.equal(toLitres(1, "CCF"), 2831.68);
  assert.equal(toLitres(1, "MCF"), 28316.8);
});

test("week starts on Monday, month on the 1st", async () => {
  const { periodStart } = await import(LIB + "water.js");
  const wed = new Date(2026, 10, 18, 15, 0);
  assert.equal(periodStart("week", wed).getDate(), 16);
  assert.equal(periodStart("month", wed).getDate(), 1);
  assert.equal(periodStart("day", wed).getHours(), 0);
});
