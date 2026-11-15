// Timers on tiles: minutes left and how they read.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LIB } from "./fake.mjs";

const { minutesLeft, leftText, canHaveTimer } = await import(LIB + "timers.js");
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

test("lights, switches, fans and helpers can have a timer; locks and covers not", () => {
  for (const id of ["light.desk", "switch.plug", "fan.ceiling", "input_boolean.guest"]) assert.equal(canHaveTimer(id), true, id);
  for (const id of ["lock.front", "cover.garage", "climate.living", "media_player.tv"]) assert.equal(canHaveTimer(id), false, id);
});
