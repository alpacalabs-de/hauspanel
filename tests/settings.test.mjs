// Settings: pure helpers behind the settings sheet.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LIB } from "./fake.mjs";

const { onTop } = await import(LIB + "settings.js");

test("hidden kinds: rows on top stay put when another one is switched on (A58)", () => {
  const keys = ["automation", "button", "light", "sensor", "switch"];
  // Taken when the settings open: only "sensor" hid something then.
  const top = new Set(["sensor"]);
  assert.deepEqual(onTop(keys, keys, top), ["sensor", "automation", "button", "light", "switch"]);
  // Switching on "light" later changes the setting, not the frozen set: same order, same place.
  assert.deepEqual(onTop(keys, keys, top), ["sensor", "automation", "button", "light", "switch"]);
  // Next time the settings open, the new set sorts it to the top.
  assert.deepEqual(onTop(keys, keys, new Set(["sensor", "light"])), ["light", "sensor", "automation", "button", "switch"]);
  // Rows and keys are separate lists (the rows are elements in the panel).
  assert.deepEqual(onTop(["A", "B", "C"], ["a", "b", "c"], new Set(["c"])), ["C", "A", "B"]);
});

test("own pages: a new page takes the first icon no page has yet (A60)", async () => {
  const { PAGE_ICONS, nextPageIcon } = await import(LIB + "settings.js");
  assert.ok(PAGE_ICONS.length >= 16 && PAGE_ICONS.length <= 24);
  assert.equal(new Set(PAGE_ICONS).size, PAGE_ICONS.length);
  assert.ok(PAGE_ICONS.every((ic) => ic.startsWith("mdi:")));
  assert.equal(nextPageIcon([]), PAGE_ICONS[0]);
  // The first page got another icon: its old one is free again for the next.
  assert.equal(nextPageIcon([{ icon: PAGE_ICONS[3] }]), PAGE_ICONS[0]);
  assert.equal(nextPageIcon([{ icon: PAGE_ICONS[0] }, { icon: PAGE_ICONS[1] }]), PAGE_ICONS[2]);
  // All taken: round and round as before.
  const all = PAGE_ICONS.map((icon) => ({ icon }));
  assert.equal(nextPageIcon(all), PAGE_ICONS[0]);
  assert.equal(nextPageIcon([...all, { icon: "mdi:x" }]), PAGE_ICONS[1]);
});
