// Timers on tiles: minutes left and how they read.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LIB } from "./fake.mjs";

const { minutesLeft, leftText, canHaveTimer, customStep, customStart, CUSTOM_MAX } = await import(LIB + "timers.js");
const i18n = await import(LIB + "i18n.js");

test("minutes left round up, never below one", () => {
  const now = Date.UTC(2026, 10, 14, 20, 0, 0);
  assert.equal(minutesLeft(new Date(now + 30 * 60000).toISOString(), now), 30);
  assert.equal(minutesLeft(new Date(now + 29 * 60000 + 1000).toISOString(), now), 30);
  assert.equal(minutesLeft(new Date(now + 10000).toISOString(), now), 1);
  assert.equal(minutesLeft(new Date(now - 5000).toISOString(), now), 1, "already due: still 1 until Home Assistant switches");
});

test("short texts: minutes, hours, both", async () => {
  await i18n.setLanguage("de");
  assert.equal(leftText(12), "12 Min.");
  assert.equal(leftText(60), "1 Std.");
  assert.equal(leftText(80), "1 Std. 20 Min.");
  await i18n.setLanguage("en");
  assert.equal(leftText(120), "2 h");
});

test("lights, switches, fans and helpers can have a timer; locks and plain covers not", () => {
  for (const id of ["light.desk", "switch.plug", "fan.ceiling", "input_boolean.guest"]) assert.equal(canHaveTimer(id), true, id);
  for (const id of ["lock.front", "cover.garage", "climate.living", "media_player.tv"]) assert.equal(canHaveTimer(id), false, id);
});

test("only a motorized window may close on a timer", async () => {
  const { isWindowCover, WINDOW_MINUTES, TIMER_MINUTES } = await import(LIB + "timers.js");
  const cover = (device_class, supported_features) => ({ states: { "cover.x": { state: "open", attributes: { device_class, supported_features } } } });
  // 2 is CoverEntityFeature.CLOSE; 11 is OPEN + CLOSE + SET_POSITION.
  assert.equal(canHaveTimer("cover.x", cover("window", 11)), true, "a motorized window");
  assert.equal(canHaveTimer("cover.x", cover("window", 2)), true, "close is enough");
  assert.equal(canHaveTimer("cover.x", cover("garage", 11)), false, "a garage door never");
  assert.equal(canHaveTimer("cover.x", cover("gate", 11)), false, "a gate never");
  assert.equal(canHaveTimer("cover.x", cover("shade", 11)), false, "a shade never");
  assert.equal(canHaveTimer("cover.x", cover("door", 11)), false, "a plain door never");
  assert.equal(canHaveTimer("cover.x", cover("window", 1)), false, "it must be able to close");
  assert.equal(canHaveTimer("cover.x", cover(undefined, 11)), false, "no device class, no timer");
  assert.equal(canHaveTimer("cover.x", { states: {} }), false, "unknown entity");
  assert.equal(canHaveTimer("cover.x"), false, "no hass at hand: never");
  assert.equal(isWindowCover(cover("window", 11), "light.desk"), false, "only covers are windows");
  // Airing is shorter than switching a lamp off.
  assert.deepEqual(WINDOW_MINUTES, [10, 15, 30, 60]);
  assert.deepEqual(TIMER_MINUTES, [15, 30, 60, 120]);
});

test("a window closes, everything else goes off", async () => {
  const { withTimer } = await import(LIB + "timers.js");
  const at = new Date(Date.now() + 12 * 60000 - 1000).toISOString();
  const ctx = { timers: { at: () => at } };
  assert.equal(withTimer(ctx, "cover.kitchen_window", "Open"), "Open · closes in 12 min");
  assert.equal(withTimer(ctx, "light.desk", "On"), "On · off in 12 min");
  assert.equal(withTimer({ timers: { at: () => null } }, "cover.kitchen_window", "Open"), "Open", "no timer, no text");
});

test("a group shows the timer that goes off first", async () => {
  const { groupTimerText } = await import(LIB + "timers.js");
  const now = Date.now();
  const map = { "light.a": new Date(now + 40 * 60000).toISOString(), "light.b": new Date(now + 12 * 60000 - 1000).toISOString() };
  const ctx = { timers: { at: (id) => map[id] || null } };
  assert.equal(groupTimerText(ctx, ["light.a", "light.b", "light.c"]), "off in 12 min");
  assert.equal(groupTimerText(ctx, ["light.c"]), "");
  assert.equal(groupTimerText({}, ["light.a"]), "");
});

test("other time: quarter-hour steps between 15 minutes and 12 hours (#31)", () => {
  assert.equal(customStep(120, 1), 135);
  assert.equal(customStep(120, -1), 105);
  // Off the quarter hour (a window's 10 minutes), the next step lands on it.
  assert.equal(customStep(10, 1), 15);
  assert.equal(customStep(70, -1), 60);
  assert.equal(customStep(70, 1), 75);
  // Never below 15 minutes or above what Home Assistant takes.
  assert.equal(customStep(15, -1), 15);
  assert.equal(customStep(CUSTOM_MAX, 1), 720);
  assert.equal(customStep(705, 1), 720);
  assert.equal(CUSTOM_MAX, 12 * 60);
});

test("other time starts at the longest fixed time and reads in hours and minutes (#31)", () => {
  assert.equal(customStart(false), 120);
  assert.equal(customStart(true), 60);
  assert.equal(leftText(customStep(customStart(true), 1)), "1 h 15 min");
  assert.equal(leftText(720), "12 h");
});
