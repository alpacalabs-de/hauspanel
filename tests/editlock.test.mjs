// Locking Edit and the settings: who may change things, and the PIN.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LIB } from "./fake.mjs";

const { pinHash, lockMode, mayChange } = await import(LIB + "editlock.js");

test("the PIN is kept as a hash that stays the same", () => {
  assert.equal(pinHash("1234"), pinHash("1234"));
  assert.notEqual(pinHash("1234"), pinHash("1243"));
  assert.ok(!pinHash("1234").includes("1234"));
});

test("a PIN lock without a PIN is no lock", () => {
  assert.equal(lockMode({}), "off");
  assert.equal(lockMode({ editLock: "pin" }), "off");
  assert.equal(lockMode({ editLock: "pin", editPin: pinHash("1") }), "pin");
  assert.equal(lockMode({ editLock: "admins" }), "admins");
  assert.equal(lockMode({ editLock: "nonsense" }), "off");
});

test("who may change things", () => {
  const now = 1000;
  assert.equal(mayChange({ s: {}, isAdmin: false, now }), true);
  assert.equal(mayChange({ s: { editLock: "admins" }, isAdmin: false, now }), false);
  assert.equal(mayChange({ s: { editLock: "admins" }, isAdmin: true, now }), true);
  const pin = { editLock: "pin", editPin: pinHash("4711") };
  assert.equal(mayChange({ s: pin, isAdmin: true, now }), false, "on a family tablet the admin is the one signed in, so the PIN counts for admins too");
  assert.equal(mayChange({ s: pin, isAdmin: false, unlockedUntil: now + 1, now }), true);
  assert.equal(mayChange({ s: pin, isAdmin: false, unlockedUntil: now, now }), false);
});
