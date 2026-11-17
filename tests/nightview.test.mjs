// Night view: when it is night for a screen, which cameras are large, and when the view comes up.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LIB } from "./fake.mjs";

const { nightNow, nightEnds, camModes, nightDue, NIGHT_PEEK_SEC } = await import(LIB + "nightview.js");
const at = (hh, mm = 0) => new Date(2026, 10, 16, hh, mm);
const sun = (state, next_rising) => ({ states: { "sun.sun": { state, attributes: { next_rising } } } });

test("by the sun, or 22 to 6 without it", () => {
  assert.equal(nightNow({}, sun("below_horizon"), at(12)), true);
  assert.equal(nightNow({}, sun("above_horizon"), at(23)), false);
  assert.equal(nightNow({}, { states: {} }, at(23)), true);
  assert.equal(nightNow({}, { states: {} }, at(12)), false);
});

test("set times, also across midnight", () => {
  const dev = { nightWhen: "time", nightFrom: "22:30", nightTo: "06:15" };
  assert.equal(nightNow(dev, null, at(22, 29)), false);
  assert.equal(nightNow(dev, null, at(22, 30)), true);
  assert.equal(nightNow(dev, null, at(3)), true);
  assert.equal(nightNow(dev, null, at(6, 15)), false);
  assert.equal(nightNow({ nightWhen: "time", nightFrom: "01:00", nightTo: "05:00" }, null, at(2)), true);
  assert.equal(nightEnds(dev, null, at(23)).getHours(), 6);
  assert.equal(nightEnds(dev, null, at(23)).getDate(), 17);
});

test("first two cameras large unless chosen, at most four large", () => {
  assert.deepEqual(camModes(["a", "b", "c"]), { a: "big", b: "big", c: "small" });
  assert.deepEqual(camModes(["a", "b", "c"], { a: "off", c: "big" }), { a: "off", b: "big", c: "big" });
  const five = camModes(["a", "b", "c", "d", "e"], { a: "big", b: "big", c: "big", d: "big", e: "big" });
  assert.equal(Object.values(five).filter((m) => m === "big").length, 4);
});

test("comes up after two quiet minutes at night, not with a popup open or on the phone", () => {
  const base = { on: true, night: true, layout: "grid", idleSec: NIGHT_PEEK_SEC };
  assert.equal(nightDue(base), true);
  assert.equal(nightDue({ ...base, idleSec: NIGHT_PEEK_SEC - 1 }), false);
  assert.equal(nightDue({ ...base, sheets: 1 }), false);
  assert.equal(nightDue({ ...base, layout: "phone" }), false);
  assert.equal(nightDue({ ...base, night: false }), false);
  assert.equal(nightDue({ ...base, on: false }), false);
});
