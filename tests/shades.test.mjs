// Shades in the room popup: the position shown, and what a slider sends.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LIB, fakeHass } from "./fake.mjs";

const { posOf, canPosition, shadeCalls } = await import(LIB + "roompop.js");

const hass = fakeHass({ states: {
  "cover.left": { state: "open", attributes: { current_position: 40, supported_features: 15 } },
  "cover.right": { state: "open", attributes: { current_position: 70, supported_features: 15 } },
  "cover.simple": { state: "closed", attributes: { supported_features: 11 } },
} });

test("position: the shade's own value, else closed 0 and open 100", () => {
  assert.equal(posOf(hass.states["cover.left"]), 40);
  assert.equal(posOf(hass.states["cover.simple"]), 0);
  assert.equal(posOf({ state: "open", attributes: {} }), 100);
  assert.equal(posOf({ state: "open", attributes: { current_position: 0 } }), 0, "0 % stays 0, not 100");
});

test("only shades with the position feature get a slider value", () => {
  assert.equal(canPosition(hass, "cover.left"), true);
  assert.equal(canPosition(hass, "cover.simple"), false);
});

test("0 % closes and 100 % opens, for all of them at once", () => {
  assert.deepEqual(shadeCalls(hass, ["cover.left", "cover.simple"], 0), [["close_cover", ["cover.left", "cover.simple"]]]);
  assert.deepEqual(shadeCalls(hass, ["cover.left", "cover.simple"], 100), [["open_cover", ["cover.left", "cover.simple"]]]);
});

test("in between: a position for those that can, up or down for the others", () => {
  assert.deepEqual(shadeCalls(hass, ["cover.left", "cover.right", "cover.simple"], 30), [
    ["set_cover_position", ["cover.left", "cover.right"], { position: 30 }],
    ["close_cover", ["cover.simple"]],
  ]);
  assert.deepEqual(shadeCalls(hass, ["cover.left", "cover.simple"], 50), [
    ["set_cover_position", ["cover.left"], { position: 50 }],
    ["open_cover", ["cover.simple"]],
  ], "50 % opens a shade without a position");
  assert.deepEqual(shadeCalls(hass, ["cover.simple"], 80), [["open_cover", ["cover.simple"]]]);
});

// #31: a motorized window is a cover, but no shade. Chips, room buttons and Good night leave it alone.
const { isShade } = await import(LIB + "domains.js");
const { roomStats } = await import(LIB + "layouts.js");

test("isShade: shades, blinds and covers without a class are shades; windows, garages, gates, doors, dampers are not", () => {
  const dc = { shade: "shade", blind: "blind", plain: undefined, window: "window", garage: "garage", gate: "gate", door: "door", damper: "damper" };
  const hs = fakeHass({ states: Object.fromEntries(Object.entries(dc).map(([k, c]) => [`cover.${k}`, { state: "open", attributes: c ? { device_class: c } : {} }])) });
  const yes = Object.keys(dc).filter((k) => isShade(hs, `cover.${k}`));
  assert.deepEqual(yes, ["shade", "blind", "plain"]);
  assert.equal(isShade(hs, "light.shade"), false, "only covers");
  assert.equal(isShade(hs, "cover.gone"), true, "a cover without a state yet counts like one without a class");
});

test("a room with a shade and a motorized window counts only the shade", () => {
  const hs = fakeHass({ states: {
    "cover.blind": { state: "open", attributes: { device_class: "blind", current_position: 60 } },
    "cover.skylight": { state: "open", attributes: { device_class: "window", current_position: 30 } },
  } });
  const ctx = { hass: hs, settings: { s: {}, arrange: (_id, items, exists) => ({ items: items.filter(exists), hidden: [] }) } };
  const st = roomStats(ctx, { id: "attic", name: "Attic", tiles: ["cover.blind", "cover.skylight"] });
  assert.deepEqual(st.shades, ["cover.blind"]);
});

const { tiltControls, hasTilt } = await import(LIB + "domains.js");
const cover = (features) => ({ state: "open", attributes: { supported_features: features } });

test("slats that can be set get a slider, no buttons (#39)", () => {
  // The demo's Living Room Window: position, stop and every slat feature.
  assert.deepEqual(tiltControls(cover(511)), { slider: true, open: false, close: false, stop: false });
  // A pergola roof that only moves its slats.
  assert.deepEqual(tiltControls(cover(16 | 32 | 64 | 128)), { slider: true, open: false, close: false, stop: false });
});

test("slats that only open and close get buttons, stop when they can (#39)", () => {
  assert.deepEqual(tiltControls(cover(1 | 2 | 4 | 16 | 32)), { slider: false, open: true, close: true, stop: false });
  assert.deepEqual(tiltControls(cover(16 | 32 | 64)), { slider: false, open: true, close: true, stop: true });
});

test("a cover without slats gets no slat controls (#39)", () => {
  assert.deepEqual(tiltControls(cover(15)), { slider: false, open: false, close: false, stop: false });
  assert.deepEqual(tiltControls(cover(undefined)), { slider: false, open: false, close: false, stop: false });
  assert.deepEqual(tiltControls(undefined), { slider: false, open: false, close: false, stop: false });
  assert.equal(hasTilt(cover(15)), false);
  assert.equal(hasTilt(cover(240)), true, "a pergola roof with nothing but slats still gets its popup");
});
