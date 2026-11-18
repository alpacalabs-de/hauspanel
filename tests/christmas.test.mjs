// Christmas: which devices belong to it, where they go (outside, inside, other), and the dates.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LIB, fakeHass } from "./fake.mjs";

const { xmasDevices, xmasSection, xmasPrefs, xmasEnabled, xmasIntroDue, firstAdvent, xmasSeason, seasonStart, seasonEnd, nextAdvent, xmasChipShown, isXmasEntity, watts } = await import(LIB + "christmas.js");

const hass = fakeHass({
  states: {
    "switch.lichterkette_zaun": "on",
    "light.christmas_tree": "off",
    "switch.smart_plug_8a82": "on",
    "switch.inflatable_snowman": "on",
    "light.kitchen": "on",
    "sensor.christmas_power": "12",
    "light.xmas_hidden": "on",
    "switch.xmas_config": "on",
    "light.stern_flur": "unavailable",
  },
  entities: {
    "switch.smart_plug_8a82": { labels: ["weihnachten"] },
    "light.xmas_hidden": { hidden: true },
    "switch.xmas_config": { entity_category: "config" },
  },
});

test("found by name or label, only lights and switches, not hidden or config ones", () => {
  const ids = xmasDevices(hass, xmasPrefs({}));
  assert.deepEqual(new Set(ids), new Set(["switch.lichterkette_zaun", "light.christmas_tree", "switch.smart_plug_8a82", "switch.inflatable_snowman"]));
  assert.equal(isXmasEntity(hass, "sensor.christmas_power"), false);
  assert.equal(isXmasEntity(hass, "light.kitchen"), false);
});

test("added by hand counts, removed by hand does not", () => {
  const ids = xmasDevices(hass, xmasPrefs({ xmas: { add: ["light.kitchen", "light.stern_flur", "light.gone"], hide: ["light.christmas_tree"] } }));
  assert.ok(ids.includes("light.kitchen"));
  assert.ok(ids.includes("light.stern_flur"));
  assert.ok(!ids.includes("light.gone"));
  assert.ok(!ids.includes("light.christmas_tree"));
});

test("section: outdoor room, indoor room, winter garden, name, nothing, by hand", () => {
  const model = {
    areaById: new Map([["garten", { id: "garten", name: "Garten" }], ["wohn", { id: "wohn", name: "Wohnzimmer" }], ["wg", { id: "wg", name: "Wintergarten" }],
      ["deck", { id: "deck", name: "Deck", floor: { name: "Outside" } }]]),
    areaOf: { "switch.lichterkette_zaun": "garten", "light.christmas_tree": "wohn", "switch.inflatable_snowman": "wg", "switch.smart_plug_8a82": "deck" },
  };
  const h2 = fakeHass({ states: { ...Object.fromEntries(Object.entries(hass.states).map(([k, v]) => [k, v.state])), "light.aussen_sterne": "off" } });
  const p = xmasPrefs({});
  assert.equal(xmasSection(h2, model, p, "switch.lichterkette_zaun"), "out");
  assert.equal(xmasSection(h2, model, p, "light.christmas_tree"), "in");
  assert.equal(xmasSection(h2, model, p, "switch.inflatable_snowman"), "in");
  assert.equal(xmasSection(h2, model, p, "switch.smart_plug_8a82"), "out");
  assert.equal(xmasSection(h2, model, p, "light.aussen_sterne"), "out");
  assert.equal(xmasSection(h2, model, p, "light.stern_flur"), "other");
  assert.equal(xmasSection(h2, model, xmasPrefs({ xmas: { area: { "light.christmas_tree": "other" } } }), "light.christmas_tree"), "other");
});

test("first Advent and Christmas time", () => {
  assert.equal(firstAdvent(2026).toDateString(), new Date(2026, 10, 29).toDateString());
  assert.equal(firstAdvent(2027).toDateString(), new Date(2027, 10, 28).toDateString());
  assert.equal(firstAdvent(2022).toDateString(), new Date(2022, 10, 27).toDateString()); // Christmas on a Sunday
  assert.equal(xmasSeason(new Date(2026, 10, 28, 20)), false);
  assert.equal(xmasSeason(new Date(2026, 10, 29, 8)), true);
  assert.equal(xmasSeason(new Date(2027, 0, 7, 23)), true);
  assert.equal(xmasSeason(new Date(2027, 0, 8)), false);
  assert.deepEqual(nextAdvent(new Date(2026, 11, 7)), { n: 3, date: new Date(2026, 11, 13) });
  assert.equal(nextAdvent(new Date(2026, 11, 21)), null);
});

test("Christmas time set by hand: own start date, own end, both across the new year", () => {
  const p = { from: "11-20", to: "01-15" };
  assert.equal(seasonStart(2026, p).toDateString(), new Date(2026, 10, 20).toDateString());
  assert.equal(seasonEnd(2026, p).toDateString(), new Date(2027, 0, 15).toDateString());
  assert.equal(xmasSeason(new Date(2026, 10, 19), p), false);
  assert.equal(xmasSeason(new Date(2026, 10, 20), p), true);
  assert.equal(xmasSeason(new Date(2027, 0, 15, 22), p), true);
  assert.equal(xmasSeason(new Date(2027, 0, 16), p), false);
  // Only the end changed: still from the first Advent.
  assert.equal(xmasSeason(new Date(2026, 10, 28), { to: "01-31" }), false);
  assert.equal(xmasSeason(new Date(2027, 0, 30), { to: "01-31" }), true);
  // Both within December.
  assert.equal(xmasSeason(new Date(2026, 11, 26), { from: "12-01", to: "12-26" }), true);
  assert.equal(xmasSeason(new Date(2026, 11, 27), { from: "12-01", to: "12-26" }), false);
  // Nonsense falls back to the defaults.
  assert.equal(xmasSeason(new Date(2026, 10, 29), { from: "xx", to: "13-40" }), true);
});

test("the chip: only when switched on, then in Christmas time, otherwise only while something is on", () => {
  const h3 = fakeHass({ states: { "light.christmas_tree": "off" } });
  assert.equal(xmasChipShown(h3, ["light.christmas_tree"], new Date(2026, 10, 17)), false);
  assert.equal(xmasChipShown(h3, ["light.christmas_tree"], new Date(2026, 11, 1)), true);
  assert.equal(xmasChipShown(hass, ["switch.lichterkette_zaun"], new Date(2026, 10, 17)), true);
  // In Christmas time even without devices, so the popup can say how to add them.
  assert.equal(xmasChipShown(hass, [], new Date(2026, 11, 1)), true);
  assert.equal(xmasChipShown(h3, ["light.christmas_tree"], new Date(2026, 10, 17), { from: "11-15" }), true);
});

test("the general switch: off until someone switches it on", () => {
  assert.equal(xmasEnabled({}), false);
  assert.equal(xmasEnabled({ xmas: { add: ["light.x"] } }), false);
  assert.equal(xmasEnabled({ xmas: { on: false } }), false);
  assert.equal(xmasEnabled({ xmas: { on: true } }), true);
});

test("the welcome window only comes from 1 November to 7 January", () => {
  assert.equal(xmasIntroDue(new Date(2026, 9, 31)), false);
  assert.equal(xmasIntroDue(new Date(2026, 10, 1)), true);
  assert.equal(xmasIntroDue(new Date(2026, 11, 31)), true);
  assert.equal(xmasIntroDue(new Date(2027, 0, 7)), true);
  assert.equal(xmasIntroDue(new Date(2027, 0, 8)), false);
  assert.equal(xmasIntroDue(new Date(2027, 6, 1)), false);
});

test("watts from W and kW", () => {
  assert.equal(watts({ state: "40", attributes: { unit_of_measurement: "W" } }), 40);
  assert.equal(watts({ state: "0.2", attributes: { unit_of_measurement: "kW" } }), 200);
  assert.equal(watts({ state: "unavailable", attributes: {} }), null);
});
