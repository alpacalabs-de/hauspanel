// The shape a camera picture reports. It decides how big cameras are fitted
// in the night view and on the Security tablet, so a 4:3 camera is not cut off.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LIB } from "./fake.mjs";

const { mediaAspect } = await import(LIB + "camera.js");

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
