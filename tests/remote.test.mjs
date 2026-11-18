// Which remote belongs to a media player, and what is sent when a button is pressed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LIB, fakeHass } from "./fake.mjs";

const { remoteFor, sendKey, PLATFORM_KEYS, swipeKeys, SWIPE_PX } = await import(LIB + "remote.js");

const KEYS = ["up", "down", "left", "right", "ok", "back", "home", "menu"];

const hassWith = (entities, states) => fakeHass({ entities, states });

test("a remote on the same device belongs to the player", () => {
  const hass = hassWith(
    {
      "media_player.tv": { device_id: "dev1", platform: "androidtv_remote" },
      "remote.tv": { device_id: "dev1", platform: "androidtv_remote" },
    },
    { "media_player.tv": "playing", "remote.tv": "on" },
  );
  const rc = remoteFor(hass, "media_player.tv");
  assert.equal(rc.type, "remote");
  assert.equal(rc.entity, "remote.tv");
  assert.equal(rc.platform, "androidtv_remote");
  assert.equal(rc.keys.ok, "DPAD_CENTER");
});

test("a remote on another device does not count", () => {
  const hass = hassWith(
    {
      "media_player.tv": { device_id: "dev1", platform: "androidtv_remote" },
      "remote.other": { device_id: "dev2", platform: "androidtv_remote" },
    },
    { "media_player.tv": "playing", "remote.other": "on" },
  );
  assert.equal(remoteFor(hass, "media_player.tv"), null);
});

test("an integration we don't know gets no remote", () => {
  const hass = hassWith(
    {
      "media_player.box": { device_id: "dev1", platform: "something_new" },
      "remote.box": { device_id: "dev1", platform: "something_new" },
    },
    { "media_player.box": "playing", "remote.box": "on" },
  );
  assert.equal(remoteFor(hass, "media_player.box"), null);
});

test("a remote entity without a state is skipped", () => {
  const hass = hassWith(
    {
      "media_player.tv": { device_id: "dev1", platform: "roku" },
      "remote.tv": { device_id: "dev1", platform: "roku" },
    },
    { "media_player.tv": "playing" },
  );
  assert.equal(remoteFor(hass, "media_player.tv"), null);
});

test("an LG TV has no remote entity, the player itself takes the buttons", () => {
  const hass = hassWith(
    { "media_player.lg": { device_id: "dev9", platform: "webostv" } },
    { "media_player.lg": "on" },
  );
  const rc = remoteFor(hass, "media_player.lg");
  assert.equal(rc.type, "webostv");
  assert.equal(rc.entity, "media_player.lg");
  assert.equal(rc.keys.ok, "ENTER");
});

test("a player that is in no registry, or has no device, gets nothing", () => {
  assert.equal(remoteFor(fakeHass({}), "media_player.gone"), null);
  const hass = hassWith({ "media_player.x": { platform: "roku" } }, { "media_player.x": "on" });
  assert.equal(remoteFor(hass, "media_player.x"), null);
});

test("every integration names all eight buttons", () => {
  for (const [platform, keys] of Object.entries(PLATFORM_KEYS)) {
    assert.deepEqual(Object.keys(keys).sort(), [...KEYS].sort(), `${platform}: buttons missing`);
    for (const k of KEYS) assert.ok(typeof keys[k] === "string" && keys[k].trim(), `${platform}.${k} is empty`);
    assert.equal(new Set(Object.values(keys)).size, KEYS.length, `${platform}: a button name is used twice`);
  }
});

test("a button goes to remote.send_command, an LG one to webostv.button", () => {
  const sent = [];
  const hass = { callService: (d, s, data) => sent.push([d, s, data]) };

  sendKey(hass, { type: "remote", entity: "remote.tv", keys: PLATFORM_KEYS.roku }, "left");
  assert.deepEqual(sent.at(-1), ["remote", "send_command", { entity_id: "remote.tv", command: "left" }]);

  sendKey(hass, { type: "webostv", entity: "media_player.lg", keys: PLATFORM_KEYS.webostv }, "ok");
  assert.deepEqual(sent.at(-1), ["webostv", "button", { entity_id: "media_player.lg", button: "ENTER" }]);

  assert.equal(sendKey(hass, { type: "remote", entity: "remote.tv", keys: {} }, "up"), null);
  assert.equal(sent.length, 2, "a button the platform has not got sends nothing");
});

test("a swipe on the touchpad sends one arrow per step of travel", () => {
  assert.deepEqual(swipeKeys(100, 0, 40), { key: "right", count: 2, rest: 20, tap: false });
  assert.deepEqual(swipeKeys(-100, 0, 40), { key: "left", count: 2, rest: -20, tap: false });
  assert.deepEqual(swipeKeys(0, 90, 40), { key: "down", count: 2, rest: 10, tap: false });
  assert.deepEqual(swipeKeys(0, -40, 40), { key: "up", count: 1, rest: 0, tap: false });
  // Without a step given it goes by SWIPE_PX.
  assert.equal(swipeKeys(SWIPE_PX * 3, 0).count, 3);
});

test("a crooked swipe counts as its main direction", () => {
  assert.equal(swipeKeys(60, 20, 40).key, "right");
  assert.equal(swipeKeys(20, -60, 40).key, "up");
  // Exactly diagonal: sideways wins, so a swipe is never without a direction.
  assert.equal(swipeKeys(50, 50, 40).key, "right");
});

test("below the step nothing is sent, and barely moving means OK", () => {
  assert.deepEqual(swipeKeys(20, 10, 40), { key: null, count: 0, rest: 20, tap: false });
  assert.deepEqual(swipeKeys(4, -3, 40), { key: null, count: 0, rest: 4, tap: true });
  assert.deepEqual(swipeKeys(0, 0, 40), { key: null, count: 0, rest: 0, tap: true });
});

test("without a saved choice the touchpad is the one that shows", () => {
  // Checked on the source: the pad needs a DOM, which there is none of here.
  const src = readFileSync(new URL("remote.js", LIB), "utf8");
  assert.match(src, /remotePad\?\.\[entityId\] === "pad" \? "pad" : "touch"/);
  assert.match(src, /touch\.hidden = mode !== "touch"/);
  assert.match(src, /pad\.hidden = mode !== "pad"/);
});
