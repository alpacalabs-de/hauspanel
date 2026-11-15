// Screensaver: when it comes up, when it is night, and which of today's events it shows.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LIB, fakeHass } from "./fake.mjs";

const { saverDue, isNight, saverEvents, saverLayout } = await import(LIB + "screensaver.js");

test("comes up after the chosen minutes without a touch, only on wall layouts", () => {
  const base = { minutes: 5, idleSec: 300, layout: "grid" };
  assert.equal(saverDue(base), true);
  assert.equal(saverDue({ ...base, idleSec: 299 }), false, "not before the time");
  assert.equal(saverDue({ ...base, minutes: 0, idleSec: 99999 }), false, "off");
  for (const layout of ["grid", "sidebar", "list"]) assert.equal(saverLayout(layout), true, layout);
  assert.equal(saverDue({ ...base, layout: "phone" }), false, "phones have their own");
  assert.equal(saverDue({ ...base, layout: "security" }), false, "the security screen has its own");
});

test("stays away while a popup is open, in edit mode and in a hidden tab", () => {
  const base = { minutes: 2, idleSec: 600, layout: "grid" };
  assert.equal(saverDue({ ...base, sheets: 1 }), false, "a camera or the doorbell is open");
  assert.equal(saverDue({ ...base, editing: true }), false);
  assert.equal(saverDue({ ...base, hidden: true }), false);
});

test("night follows the sun, without sun.sun from 22 to 6", () => {
  const noon = new Date(2026, 10, 14, 12, 0);
  const late = new Date(2026, 10, 14, 23, 0);
  const early = new Date(2026, 10, 14, 5, 59);
  const morning = new Date(2026, 10, 14, 6, 0);
  assert.equal(isNight(fakeHass({ states: { "sun.sun": "below_horizon" } }), noon), true);
  assert.equal(isNight(fakeHass({ states: { "sun.sun": "above_horizon" } }), late), false);
  const none = fakeHass();
  assert.equal(isNight(none, noon), false);
  assert.equal(isNight(none, late), true);
  assert.equal(isNight(none, early), true);
  assert.equal(isNight(none, morning), false);
  assert.equal(isNight(fakeHass({ states: { "sun.sun": "unavailable" } }), late), true, "unknown sun: by the clock");
});

test("today's events: what is over drops out, all-day first, at most three", () => {
  const now = new Date(2026, 10, 14, 12, 0);
  const at = (h, m = 0) => new Date(2026, 10, 14, h, m);
  const ev = (summary, start, end, allDay = false) => ({ summary, start, end, allDay });
  const list = saverEvents([
    ev("Dentist", at(9), at(10)),
    ev("Football", at(17), at(19)),
    ev("Lunch", at(12, 30), at(13, 30)),
    ev("Birthday Anna", at(0), new Date(2026, 10, 15), true),
    ev("Running now", at(11), at(13)),
    ev("Late film", at(21), at(23)),
  ], now);
  assert.deepEqual(list.map((e) => e.summary), ["Birthday Anna", "Running now", "Lunch"]);
  assert.deepEqual(saverEvents(undefined, now), []);
});
