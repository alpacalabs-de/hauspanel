// After an update: reload when this screen runs older code, restart (admins only) when Home Assistant does.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LIB } from "./fake.mjs";

const { updateState, codeVersion } = await import(LIB + "update.js");

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

test("the running code's version comes from the address it was loaded from", () => {
  assert.equal(codeVersion("http://ha.local:8123/hauspanel_static/1.19.0-3fa2b9c1/hauspanel.js", "1.20.0"), "1.19.0");
  assert.equal(codeVersion("https://x.ui.nabu.casa/hauspanel_static/1.20.0b1-0a1b2c3d/hauspanel.js?v=1"), "1.20.0b1");
});

test("the dev build or an unknown address falls back to the config's version", () => {
  assert.equal(codeVersion("http://localhost:8123/hauspanel_static/dev/hauspanel.js", "1.19.0"), "1.19.0");
  assert.equal(codeVersion("http://localhost:8123/local/hauspanel/hauspanel.js", "1.19.0"), "1.19.0");
  assert.equal(codeVersion("", "1.19.0"), "1.19.0");
  assert.equal(codeVersion(undefined), "");
});

test("old code kept alive past an update is asked to reload, even with the new config", () => {
  // The Companion app outlived the restart: the config says 1.20.0, the loaded code is still 1.19.0.
  const shown = codeVersion("http://ha.local:8123/hauspanel_static/1.19.0-3fa2b9c1/hauspanel.js", "1.20.0");
  assert.deepEqual(updateState(shown, { running: "1.20.0", installed: "1.20.0" }, false), { kind: "reload", version: "1.20.0" });
  // Fresh page after the update: code and Home Assistant agree.
  const fresh = codeVersion("http://ha.local:8123/hauspanel_static/1.20.0-77aa00ff/hauspanel.js", "1.20.0");
  assert.equal(updateState(fresh, { running: "1.20.0", installed: "1.20.0" }, true), null);
});
