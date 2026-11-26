// The shape a camera picture reports. It decides how big cameras are fitted
// in the night view and on the Security tablet, so a 4:3 camera is not cut off.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LIB } from "./fake.mjs";

const { mediaAspect, mediaHasAudio } = await import(LIB + "camera.js");

test("a video reports its own shape, a picture its natural size", () => {
  assert.equal(mediaAspect({ videoWidth: 1920, videoHeight: 1080 }), 1.7778);
  assert.equal(mediaAspect({ naturalWidth: 1024, naturalHeight: 768 }), 1.3333, "4:3");
  assert.equal(mediaAspect({ naturalWidth: 720, naturalHeight: 1280 }), 0.5625, "upright");
  assert.equal(mediaAspect({ naturalWidth: 900, naturalHeight: 900 }), 1, "square");
  assert.equal(mediaAspect({ naturalWidth: 1920, naturalHeight: 816 }), 2.3529, "wide");
});

test("nothing measurable yet gives null, so the default shape stays", () => {
  assert.equal(mediaAspect(null), null);
  assert.equal(mediaAspect(undefined), null);
  assert.equal(mediaAspect({}), null);
  assert.equal(mediaAspect({ videoWidth: 0, videoHeight: 0 }), null);
  assert.equal(mediaAspect({ naturalWidth: 1280, naturalHeight: 0 }), null, "half measured is not measured");
});

test("the running video wins over the still picture on the same element", () => {
  assert.equal(mediaAspect({ videoWidth: 1920, videoHeight: 1080, naturalWidth: 640, naturalHeight: 640 }), 1.7778);
});

// Whether a camera carries sound at all: the baby monitor's speaker button hangs on it.
const stream = (n) => ({ tagName: "VIDEO", srcObject: { getAudioTracks: () => new Array(n).fill({}) } });

test("a WebRTC stream says straight out whether it carries sound", () => {
  assert.equal(mediaHasAudio(stream(1)), true);
  assert.equal(mediaHasAudio(stream(0)), false);
});

test("Safari lists the tracks, but only once the video is loaded", () => {
  assert.equal(mediaHasAudio({ tagName: "VIDEO", audioTracks: { length: 1 }, readyState: 4 }), true);
  assert.equal(mediaHasAudio({ tagName: "VIDEO", audioTracks: { length: 0 }, readyState: 4 }), false);
  assert.equal(mediaHasAudio({ tagName: "VIDEO", audioTracks: { length: 0 }, readyState: 0 }), null, "nothing loaded yet");
});

test("Firefox has a flag, Chrome counts decoded bytes", () => {
  assert.equal(mediaHasAudio({ tagName: "VIDEO", mozHasAudio: true }), true);
  assert.equal(mediaHasAudio({ tagName: "VIDEO", mozHasAudio: false }), false);
  assert.equal(mediaHasAudio({ tagName: "VIDEO", webkitAudioDecodedByteCount: 4096 }), true);
  // Zero bytes for the first seconds of playback means nothing yet.
  assert.equal(mediaHasAudio({ tagName: "VIDEO", webkitAudioDecodedByteCount: 0 }), null);
});

test("an MJPEG picture never has sound, and nothing measurable stays unknown", () => {
  assert.equal(mediaHasAudio({ tagName: "IMG", naturalWidth: 1280 }), false);
  assert.equal(mediaHasAudio({ tagName: "VIDEO" }), null);
  assert.equal(mediaHasAudio(null), null);
});

test("a live picture only plays sound where it was asked for", () => {
  // Checked on the source: every other caller gets a muted picture (no DOM here to run it in).
  const src = readFileSync(new URL("../custom_components/hauspanel/frontend/lib/camera.js", import.meta.url), "utf8");
  assert.match(src, /export function liveVideo\(ctx, entityId, \{ controls = false, muted = true \} = \{\}\)/);
  assert.match(src, /openCameraFull\(ctx, entityId, list = \[entityId\], \{[^}]*sound = false/);
});

// Cameras in the left panel of the Sidebar layout (A67): the chosen ones that exist, in their order.
test("side panel cameras: order kept, missing, doubled and foreign ids left out", async () => {
  const { sideCameras, SIDE_DEFAULTS } = await import(`${LIB}sidepanel.js`);
  const hass = { states: { "camera.front": {}, "camera.yard": {}, "light.x": {} } };
  assert.deepEqual(sideCameras(hass, { cameras: ["camera.yard", "camera.gone", "camera.front", "camera.yard", "light.x"] }), ["camera.yard", "camera.front"]);
  assert.deepEqual(sideCameras(hass, {}), []);
  assert.deepEqual(sideCameras(hass, { cameras: "camera.front" }), []);
  assert.equal(SIDE_DEFAULTS.camera, false);
  assert.equal(SIDE_DEFAULTS.scenesBig, false);
});
