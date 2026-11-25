// Room popup: pure helpers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LIB } from "./fake.mjs";

const { climateTiles } = await import(LIB + "roompop.js");

const st = (modes) => ({ state: "heat", attributes: { hvac_modes: modes } });
const hass = {
  states: {
    "climate.radiator_a": st(["off", "heat"]),
    "climate.radiator_b": st(["off", "heat", "auto"]),
    "climate.ac": st(["off", "cool", "heat", "dry", "fan_only"]),
    "climate.ac2": st(["off", "heat_cool"]),
  },
};

test("room popup thermostats: heating in the ring, a single air conditioner is just 'Air conditioning' (A59)", () => {
  const r = climateTiles(hass, ["climate.ac", "climate.radiator_a"]);
  assert.equal(r.ring, "climate.radiator_a");
  assert.deepEqual(r.tiles, [{ id: "climate.ac", heat: false, named: false }]);
});

test("room popup thermostats: a second radiator gets its own name and the radiator icon (A59)", () => {
  const r = climateTiles(hass, ["climate.radiator_a", "climate.radiator_b"]);
  assert.equal(r.ring, "climate.radiator_a");
  assert.deepEqual(r.tiles, [{ id: "climate.radiator_b", heat: true, named: true }]);
});

test("room popup thermostats: several air conditioners are named, none alone falls back to the first (A59)", () => {
  const r = climateTiles(hass, ["climate.ac", "climate.ac2", "climate.radiator_a"]);
  assert.equal(r.ring, "climate.radiator_a");
  assert.deepEqual(r.tiles.map((x) => [x.id, x.heat, x.named]), [["climate.ac", false, true], ["climate.ac2", false, true]]);
  assert.deepEqual(climateTiles(hass, ["climate.ac"]), { ring: "climate.ac", tiles: [] });
  assert.deepEqual(climateTiles(hass, []), { ring: undefined, tiles: [] });
});
