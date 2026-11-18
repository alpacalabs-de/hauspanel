// Notices: own entities that show on Home only while they say so.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LIB, fakeHass } from "./fake.mjs";

const { noticeActive, activeNotices, parseWhen, groupNotices, groupKey, shortNames } = await import(LIB + "notices.js");

test("a helper or switch shows while it is on", () => {
  const hass = fakeHass({ states: { "input_boolean.mail": "on", "binary_sensor.letterbox": "off", "switch.x": "unavailable" } });
  assert.equal(noticeActive(hass.states["input_boolean.mail"], { id: "input_boolean.mail" }), true);
  assert.equal(noticeActive(hass.states["binary_sensor.letterbox"], { id: "binary_sensor.letterbox" }), false);
  assert.equal(noticeActive(hass.states["switch.x"], { id: "switch.x" }), false);
});

test("a sensor shows at the states you enter, numbers compared", () => {
  const hass = fakeHass({ states: { "sensor.washer": "Finished", "sensor.mail_count": "2", "sensor.tank": "15,5" } });
  assert.equal(noticeActive(hass.states["sensor.washer"], { when: ["finished"] }), true, "case does not matter");
  assert.equal(noticeActive(hass.states["sensor.washer"], { when: [] }), false, "a sensor without states never shows");
  assert.equal(noticeActive(hass.states["sensor.mail_count"], { when: [">0"] }), true);
  assert.equal(noticeActive(hass.states["sensor.mail_count"], { when: [">=3"] }), false);
  assert.equal(noticeActive(hass.states["sensor.washer"], { when: ["<20"] }), false, "text is no number");
  assert.deepEqual(parseWhen(" done, finished ;  >0 ,"), ["done", "finished", ">0"]);
});

test("only the active notices, in their order", () => {
  const hass = fakeHass({ states: { "input_boolean.b": "on", "input_boolean.a": "on", "input_boolean.c": "off" } });
  const list = [{ id: "input_boolean.b" }, { id: "input_boolean.c" }, { id: "input_boolean.a" }, { id: "input_boolean.gone" }];
  assert.deepEqual(activeNotices(hass, list).map((n) => n.id), ["input_boolean.b", "input_boolean.a"]);
  assert.deepEqual(activeNotices(hass, undefined), []);
});

const POLLEN = [
  { id: "sensor.pollen_birch", group: "Pollen" },
  { id: "sensor.pollen_grass", group: "Pollen" },
  { id: "sensor.pollen_alder", group: " pollen " },
  { id: "input_boolean.mail" },
];

test("two notices of one group that show at once become one group, where the first one stood", () => {
  const out = groupNotices(POLLEN, ["input_boolean.mail", "sensor.pollen_birch", "sensor.pollen_grass"]);
  assert.deepEqual(out, [
    { id: "input_boolean.mail" },
    { group: "Pollen", key: "pollen", ids: ["sensor.pollen_birch", "sensor.pollen_grass"] },
  ]);
});

test("the group's name may be written differently, and spaces around it don't matter", () => {
  assert.equal(groupKey({ group: "  Pollen  " }), "pollen");
  assert.equal(groupKey({ group: "high  pollen" }), "high pollen");
  assert.equal(groupKey({}), "");
  const out = groupNotices(POLLEN, ["sensor.pollen_grass", "sensor.pollen_alder"]);
  assert.deepEqual(out, [{ group: "Pollen", key: "pollen", ids: ["sensor.pollen_grass", "sensor.pollen_alder"] }]);
});

test("alone in its group, and without a group, a notice stays a normal pill", () => {
  assert.deepEqual(groupNotices(POLLEN, ["sensor.pollen_birch"]), [{ id: "sensor.pollen_birch" }]);
  assert.deepEqual(groupNotices(POLLEN, ["input_boolean.mail", "sensor.pollen_alder"]),
    [{ id: "input_boolean.mail" }, { id: "sensor.pollen_alder" }]);
  assert.deepEqual(groupNotices([], ["sensor.unknown"]), [{ id: "sensor.unknown" }]);
  assert.deepEqual(groupNotices(POLLEN, []), []);
  assert.deepEqual(groupNotices(undefined, undefined), []);
});

test("the names in a group's line lose the beginning they share", () => {
  assert.deepEqual(shortNames(["Pollen Birch", "Pollen Grass"]), ["Birch", "Grass"]);
  assert.deepEqual(shortNames(["Pollen · Birch", "pollen · Grass"]), ["Birch", "Grass"], "case and separators aside");
  assert.deepEqual(shortNames(["Birch", "Grass"]), ["Birch", "Grass"], "nothing shared, nothing cut");
  assert.deepEqual(shortNames(["Pollen Birch", "Pollen Birchwood"]), ["Birch", "Birchwood"], "whole words only");
  assert.deepEqual(shortNames(["Pollen", "Pollen Grass"]), ["Pollen", "Pollen Grass"], "one would be left with nothing");
  assert.deepEqual(shortNames(["Pollen"]), ["Pollen"]);
  assert.deepEqual(shortNames([]), []);
});
