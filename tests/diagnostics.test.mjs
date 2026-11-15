// "Info for a bug report": readable device names and the lines that go into the issue.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LIB } from "./fake.mjs";

const { deviceText, diagnosticsText } = await import(LIB + "diagnostics.js");

test("device and browser in plain words", () => {
  const ipad = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15";
  assert.equal(deviceText(ipad, true), "iPad, Safari 18");
  assert.equal(deviceText(ipad, false), "Mac, Safari 18");
  assert.equal(deviceText("Mozilla/5.0 (Linux; Android 13; SM-X200) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Fully Kiosk Browser", true), "Android tablet, Fully Kiosk, Chrome 130");
  assert.equal(deviceText("Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Home Assistant/2025.10", true), "iPhone, Home Assistant app");
  assert.equal(deviceText("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0"), "Windows, Edge 131");
});

test("the lines say when Home Assistant still runs the old version", () => {
  const base = { screen: "1.6.7", ha: "2026.11.1", panel: "HausPanel", layout: "grid", tileSize: "", lite: false, personal: false,
    language: "de (panel: de)", device: "iPad, Safari 18", size: "1180×820 @2x", rooms: 9, unassigned: 3 };
  const same = diagnosticsText({ ...base, versions: { running: "1.6.7", installed: "1.6.7" } });
  assert.match(same, /^HausPanel: on this screen 1\.6\.7, Home Assistant runs 1\.6\.7$/m);
  assert.doesNotMatch(same, /restart/);
  assert.match(same, /^Panel: HausPanel, layout grid$/m);
  const stale = diagnosticsText({ ...base, screen: "1.6.5", versions: { running: "1.6.5", installed: "1.6.7" }, lite: true, tileSize: "m" });
  assert.match(stale, /installed 1\.6\.7 \(restart needed\)/);
  assert.match(stale, /layout grid, tile size m, lite/);
  assert.equal(diagnosticsText({ ...base, versions: {} }).split("\n")[0], "HausPanel: on this screen 1.6.7");
});
