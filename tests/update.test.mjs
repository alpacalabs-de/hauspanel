// After an update: reload when this screen runs older code, restart (admins only) when Home Assistant does.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LIB } from "./fake.mjs";

const { updateState } = await import(LIB + "update.js");

test("a screen with older code than Home Assistant runs is asked to reload", () => {
  assert.deepEqual(updateState("1.6.5", { running: "1.6.6", installed: "1.6.6" }), { kind: "reload", version: "1.6.6" });
});

test("a newer version on disk asks admins for a restart, nobody else", () => {
  assert.deepEqual(updateState("1.6.5", { running: "1.6.5", installed: "1.6.6" }, true), { kind: "restart", version: "1.6.6" });
  assert.equal(updateState("1.6.5", { running: "1.6.5", installed: "1.6.6" }, false), null);
});

test("all the same, or no answer: nothing to say", () => {
  assert.equal(updateState("1.6.5", { running: "1.6.5", installed: "1.6.5" }, true), null);
  assert.equal(updateState("1.6.5", undefined, true), null);
});
