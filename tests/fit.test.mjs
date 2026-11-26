// Rooms tab, "Fit to screen" (A66): columns, row height and scale so every room fits on the screen.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LIB } from "./fake.mjs";

const { planRoomsFit } = await import(`${LIB}/fit.js`);

test("21 rooms on 3 floors fit a tablet next to the panel without scrolling", () => {
  // iPad in landscape with the Sidebar layout: about 800 × 640 for the rooms, three floor headings of 34 px.
  const p = planRoomsFit([6, 8, 7], 800, 640, { heads: 3, headH: 102, gap: 8 });
  assert.equal(p.scroll, false);
  const rows = [6, 8, 7].reduce((a, k) => a + Math.ceil(k / p.cols), 0);
  assert.ok(p.cols >= 3 && p.cols <= 4, `cols ${p.cols}`);
  assert.ok(102 + rows * p.rowH + 8 * (rows + 3 - 1) <= 640, "everything fits");
  assert.ok(p.rowH >= 40 && p.scale >= 0.7 && p.scale <= 1.35);
});

test("few rooms get bigger rows, capped", () => {
  const p = planRoomsFit([7], 820, 650, { gap: 8 });
  assert.equal(p.scroll, false);
  assert.ok(p.rowH > 58 && p.rowH <= 110, `rowH ${p.rowH}`);
  assert.ok(p.scale > 1 && p.scale <= 1.35);
});

test("too many rooms for the box: the smallest rows, then it scrolls", () => {
  const p = planRoomsFit([30, 30, 30], 700, 400, { heads: 3, headH: 90, gap: 8 });
  assert.equal(p.scroll, true);
  assert.equal(p.rowH, 40);
  assert.equal(p.scale, 0.7);
  assert.ok((700 - 8 * (p.cols - 1)) / p.cols >= 150, "rows stay wide enough to read");
});

test("nothing to place", () => {
  assert.equal(planRoomsFit([], 800, 600), null);
  assert.equal(planRoomsFit([3], 0, 600), null);
});
