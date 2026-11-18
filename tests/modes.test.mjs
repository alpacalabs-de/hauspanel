// The Modes chip: which of the picked switches and helpers count, and what the chip says.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LIB, fakeHass } from "./fake.mjs";

const { modeIds, modesSummary, modesText } = await import(LIB + "modes.js");
const { setLanguage, BUILTIN } = await import(LIB + "i18n.js");
await setLanguage("en");
const en = BUILTIN.en;

const hass = fakeHass({
  states: {
    "input_boolean.guest_mode": { state: "off", attributes: { friendly_name: "Guest mode" } },
    "input_boolean.party_mode": { state: "off", attributes: { friendly_name: "Party mode" } },
    "switch.christmas_lights": { state: "off", attributes: { friendly_name: "Christmas lights" } },
    "input_boolean.cleaning": { state: "unavailable", attributes: { friendly_name: "Cleaning" } },
  },
});
const set = (id, state) => { hass.states[id] = { ...hass.states[id], state }; };

test("nothing on: the chip says all off", () => {
  const sum = modesSummary(hass, ["input_boolean.guest_mode", "input_boolean.party_mode"]);
  assert.deepEqual(sum.ids, ["input_boolean.guest_mode", "input_boolean.party_mode"]);
  assert.deepEqual(sum.on, []);
  assert.equal(modesText(hass, sum), en.all_off);
});

test("one on: the chip says its name", () => {
  set("input_boolean.party_mode", "on");
  const sum = modesSummary(hass, ["input_boolean.guest_mode", "input_boolean.party_mode"]);
  assert.deepEqual(sum.on, ["input_boolean.party_mode"]);
  assert.equal(modesText(hass, sum), "Party mode");
});

test("two on: the chip counts them", () => {
  set("switch.christmas_lights", "on");
  const sum = modesSummary(hass, ["input_boolean.party_mode", "switch.christmas_lights"]);
  assert.equal(sum.on.length, 2);
  assert.equal(modesText(hass, sum), en.n_on.replace("{n}", "2"));
});

test("a mode that isn't there drops out, one that can't be reached stays but is not on", () => {
  const sum = modesSummary(hass, ["input_boolean.gone", "input_boolean.cleaning", "input_boolean.guest_mode"]);
  assert.deepEqual(sum.ids, ["input_boolean.cleaning", "input_boolean.guest_mode"]);
  assert.deepEqual(sum.on, []);
  assert.equal(modesText(hass, sum), en.all_off);
});

test("no mode at all: no chip", () => {
  assert.equal(modesSummary(hass, []), null);
  assert.equal(modesSummary(hass, ["input_boolean.gone"]), null);
  assert.equal(modesSummary(hass, undefined), null);
  assert.equal(modesText(hass, null), "");
});

test("only switches and helpers are kept, in their order", () => {
  assert.deepEqual(modeIds({ modes: ["switch.a", "input_boolean.b"] }), ["switch.a", "input_boolean.b"]);
  // Anything else that found its way into the setting is left out, so nothing unswitchable shows up.
  assert.deepEqual(modeIds({ modes: ["light.a", "scene.b", "switch.c", 7, null] }), ["switch.c"]);
  assert.deepEqual(modeIds({}), []);
  assert.deepEqual(modeIds(undefined), []);
});
