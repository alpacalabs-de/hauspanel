// House use with a home battery (#10): charging is not use, discharging is.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LIB } from "./fake.mjs";

const { houseUse } = await import(LIB + "energy.js");
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test("without a battery nothing changes", () => {
  const u = houseUse({ imp: 2, sol: 3, exp: 1 });
  close(u.use, 4); close(u.solar, 2); close(u.grid, 2);
});

test("sun that goes into the battery is not use", () => {
  const u = houseUse({ imp: 0, sol: 5, exp: 0, charge: 3 });
  close(u.use, 2); close(u.solar, 2);
});

test("the battery giving at night counts as use", () => {
  const u = houseUse({ imp: 0.5, discharge: 2 });
  close(u.use, 2.5); close(u.battery, 2); close(u.grid, 0.5);
});

test("charging from the grid comes off the grid share", () => {
  const u = houseUse({ imp: 4, sol: 0, charge: 3 });
  close(u.use, 1); close(u.gridToBattery, 3); close(u.grid, 1);
});
