// Doors, gates and locks: when they count as a warning, and the "may be open" time windows.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LIB, fakeHass, at } from "./fake.mjs";

const sv = await import(LIB + "securityview.js");
const { buildModel } = await import(LIB + "model.js");
const rules = {};
sv.setSecAllowSource(() => rules);
const setRule = (id, r) => { for (const k of Object.keys(rules)) delete rules[k]; if (r) rules[id] = r; };

test("a daytime window allows inside and not outside", () => {
  setRule("cover.gate", { from: "07:00", to: "19:00", days: [] });
  assert.equal(sv.allowedNow("cover.gate", at(1, "07:00")), true, "starts at 07:00");
  assert.equal(sv.allowedNow("cover.gate", at(1, "12:30")), true);
  assert.equal(sv.allowedNow("cover.gate", at(1, "18:59")), true);
  assert.equal(sv.allowedNow("cover.gate", at(1, "19:00")), false, "ends before 19:00");
  assert.equal(sv.allowedNow("cover.gate", at(1, "06:59")), false);
});

test("a window over midnight belongs to the day it starts", () => {
  setRule("lock.door", { from: "22:00", to: "06:00", days: [5] }); // Friday night only
  assert.equal(sv.allowedNow("lock.door", at(5, "23:30")), true, "Friday 23:30");
  assert.equal(sv.allowedNow("lock.door", at(6, "05:00")), true, "Saturday 05:00 is still Friday night");
  assert.equal(sv.allowedNow("lock.door", at(6, "07:00")), false, "Saturday 07:00");
  assert.equal(sv.allowedNow("lock.door", at(6, "23:30")), false, "Saturday night is not allowed");
  assert.equal(sv.allowedNow("lock.door", at(5, "05:00")), false, "Friday 05:00 belongs to Thursday night");
});

test("weekdays limit a window, no weekdays means every day", () => {
  setRule("cover.gate", { from: "08:00", to: "18:00", days: [1, 2, 3, 4, 5] });
  assert.equal(sv.allowedNow("cover.gate", at(3, "10:00")), true, "Wednesday");
  assert.equal(sv.allowedNow("cover.gate", at(0, "10:00")), false, "Sunday");
  setRule("cover.gate", { from: "08:00", to: "18:00" });
  assert.equal(sv.allowedNow("cover.gate", at(0, "10:00")), true, "Sunday without a weekday list");
});

test("broken or missing rules never allow", () => {
  setRule("cover.gate", null);
  assert.equal(sv.allowedNow("cover.gate", at(1, "12:00")), false);
  setRule("cover.gate", { from: "", to: "19:00" });
  assert.equal(sv.allowedNow("cover.gate", at(1, "12:00")), false, "empty start");
  setRule("cover.gate", { from: "7", to: "19:00" });
  assert.equal(sv.allowedNow("cover.gate", at(1, "12:00")), false, "no minutes");
  setRule("cover.gate", { from: "07:00", to: "25:00" });
  assert.equal(sv.allowedNow("cover.gate", at(1, "12:00")), false, "no such time");
  setRule("cover.gate", { from: "00:00", to: "24:00" });
  assert.equal(sv.allowedNow("cover.gate", at(1, "23:59")), true, "the whole day");
});

test("what counts as a warning", () => {
  setRule("x", null);
  const hass = fakeHass({ states: {
    "lock.front": "unlocked", "lock.back": "locked",
    "cover.garage": "open", "cover.gate": "closed",
    "binary_sensor.window": { state: "on", attributes: { device_class: "window" } },
    "binary_sensor.door": { state: "off", attributes: { device_class: "door" } },
    "alarm_control_panel.home": "armed_away",
  } });
  assert.equal(sv.isAlert(hass, "lock.front"), true, "unlocked lock");
  assert.equal(sv.isAlert(hass, "lock.back"), false);
  assert.equal(sv.isAlert(hass, "cover.garage"), true, "open garage");
  assert.equal(sv.isAlert(hass, "cover.gate"), false);
  assert.equal(sv.isAlert(hass, "binary_sensor.window"), true, "open window");
  assert.equal(sv.isAlert(hass, "binary_sensor.door"), false);
  assert.equal(sv.isAlert(hass, "alarm_control_panel.home"), false, "armed is fine");
  assert.equal(sv.isAlert(hass, "lock.missing"), false, "unknown entity");
});

test("an allowed window silences the warning, but never a triggered alarm", () => {
  const hass = fakeHass({ states: { "cover.gate": "open", "alarm_control_panel.home": "triggered" } });
  const now = new Date();
  const hhmm = (d) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const from = new Date(now.getTime() - 3600e3), to = new Date(now.getTime() + 3600e3);
  for (const id of ["cover.gate", "alarm_control_panel.home"]) rules[id] = { from: hhmm(from), to: hhmm(to), days: [] };
  if (from.getDate() !== to.getDate()) return; // close to midnight the window crosses days; covered above
  assert.equal(sv.isAlert(hass, "cover.gate"), false, "open gate inside its window");
  assert.equal(sv.isAllowedOpen(hass, "cover.gate"), true);
  assert.equal(sv.isAlert(hass, "alarm_control_panel.home"), true, "a triggered alarm always warns");
});

// A context just big enough for statusItems/openSecurity: the security entities and model.all for gates.
const secCtx = (hass, security, all = []) => ({ hass, model: { all }, securityItems: () => security });

test("the open count skips a lock that shows together with its lock sensor", () => {
  setRule("x", null);
  // A car: the lock often reports unknown or unavailable, the sensor at the same device knows better.
  const hass = fakeHass({
    states: {
      "lock.car_doors": { state: "unknown", attributes: {} },
      "binary_sensor.car_locked": { state: "off", attributes: { device_class: "lock" } },
    },
    devices: { car: { name: "Car" } },
    entities: { "lock.car_doors": { device_id: "car" }, "binary_sensor.car_locked": { device_id: "car" } },
  });
  const ids = ["lock.car_doors", "binary_sensor.car_locked"];
  const ctx = secCtx(hass, ids);
  assert.deepEqual(sv.openSecurity(ctx), { unlocked: [], open: [] }, "the sensor says locked, so nothing is open");
  hass.states["lock.car_doors"].state = "unavailable";
  assert.equal(sv.openSecurity(ctx).unlocked.length, 0, "unavailable counts no differently");
  hass.states["binary_sensor.car_locked"].state = "on";
  assert.deepEqual(sv.openSecurity(ctx).unlocked, ["binary_sensor.car_locked"], "the sensor says unlocked: one, not two");
  hass.states["lock.car_doors"].state = "locked";
  hass.states["binary_sensor.car_locked"].state = "off";
  assert.equal(sv.openSecurity(ctx).unlocked.length, 0);
});

test("a lock without a sensor, an open window and a gate all count", () => {
  setRule("x", null);
  const hass = fakeHass({ states: {
    "lock.front": "unlocked",
    "lock.back": "locked",
    "binary_sensor.bath_window": { state: "on", attributes: { device_class: "window" } },
    "binary_sensor.hall_door": { state: "off", attributes: { device_class: "door" } },
    "cover.yard_gate": { state: "open", attributes: { device_class: "gate" } },
    "alarm_control_panel.home": "armed_away",
  } });
  const ids = ["lock.front", "lock.back", "binary_sensor.bath_window", "binary_sensor.hall_door", "alarm_control_panel.home"];
  const { unlocked, open } = sv.openSecurity(secCtx(hass, ids, ["cover.yard_gate"]));
  assert.deepEqual(unlocked, ["lock.front"], "only the unlocked lock");
  assert.deepEqual(open, ["cover.yard_gate", "binary_sensor.bath_window"], "the gate like the popup, and the window");
});

test("an allowed time window keeps a door out of the count", () => {
  const hass = fakeHass({ states: { "binary_sensor.terrace": { state: "on", attributes: { device_class: "door" } } } });
  const ctx = secCtx(hass, ["binary_sensor.terrace"]);
  setRule("x", null);
  assert.equal(sv.openSecurity(ctx).open.length, 1, "open and no window set");
  setRule("binary_sensor.terrace", { from: "00:00", to: "24:00" });
  assert.equal(sv.openSecurity(ctx).open.length, 0, "open, but allowed right now");
});

test("a triggered alarm counts as open, an armed one does not", () => {
  setRule("x", null);
  const hass = fakeHass({ states: { "alarm_control_panel.home": "armed_away" } });
  const ctx = secCtx(hass, ["alarm_control_panel.home"]);
  assert.equal(sv.openSecurity(ctx).open.length, 0);
  hass.states["alarm_control_panel.home"].state = "triggered";
  assert.deepEqual(sv.openSecurity(ctx).open, ["alarm_control_panel.home"]);
});

test("icons: a gate contact set up as a door still gets a gate, open or closed", () => {
  const hass = fakeHass({ states: {
    "binary_sensor.entry_gate": { state: "on", attributes: { device_class: "door", friendly_name: "Entry Gate" } },
    "binary_sensor.einfahrt_kontakt": { state: "off", attributes: { device_class: "door", friendly_name: "Einfahrt" } },
    "binary_sensor.front_door": { state: "off", attributes: { device_class: "door", friendly_name: "Front Door" } },
    "binary_sensor.bath_window": { state: "on", attributes: { device_class: "window" } },
    "cover.garage": { state: "open", attributes: { device_class: "garage" } },
    "cover.yard_gate": { state: "closed", attributes: { device_class: "gate" } },
    "lock.front": { state: "unlocked", attributes: {} },
  } });
  assert.equal(sv.secIcon(hass, "binary_sensor.entry_gate", true), "mdi:gate-open");
  assert.equal(sv.secIcon(hass, "binary_sensor.einfahrt_kontakt", false), "mdi:gate");
  assert.equal(sv.secIcon(hass, "binary_sensor.front_door", false), "mdi:door-closed");
  assert.equal(sv.secIcon(hass, "binary_sensor.bath_window", true), "mdi:window-open-variant");
  assert.equal(sv.secIcon(hass, "cover.garage", true), "mdi:garage-open-variant");
  assert.equal(sv.secIcon(hass, "cover.yard_gate", false), "mdi:gate");
  assert.equal(sv.secIcon(hass, "lock.front", true), "mdi:lock-open-variant-outline");
});

// --- the room in front of a door or window name -----------------------------------------------

const rooms = () => fakeHass({
  areas: {
    kitchen: { area_id: "kitchen", name: "Kitchen" },
    bath: { area_id: "bath", name: "Bath" },
  },
  entities: {
    "binary_sensor.kitchen_window": { entity_id: "binary_sensor.kitchen_window", area_id: "kitchen", platform: "zha", name: "Window" },
    "binary_sensor.bath_window": { entity_id: "binary_sensor.bath_window", area_id: "bath", platform: "zha", name: "Window" },
    "binary_sensor.named_window": { entity_id: "binary_sensor.named_window", area_id: "kitchen", platform: "zha", name: "Kitchen window" },
    "binary_sensor.named_back": { entity_id: "binary_sensor.named_back", area_id: "kitchen", platform: "zha", name: "Window kitchen" },
    "binary_sensor.loose": { entity_id: "binary_sensor.loose", platform: "zha", name: "Window" },
  },
  states: {
    "binary_sensor.kitchen_window": { state: "on", attributes: { device_class: "window" } },
    "binary_sensor.bath_window": { state: "on", attributes: { device_class: "window" } },
    "binary_sensor.named_window": { state: "on", attributes: { device_class: "window" } },
    "binary_sensor.named_back": { state: "on", attributes: { device_class: "window" } },
    "binary_sensor.loose": { state: "on", attributes: { device_class: "window" } },
  },
});

test("two windows with the same name are told apart by their room", () => {
  const hass = rooms();
  const m = buildModel(hass, {});
  assert.deepEqual(sv.secLabel(hass, m, "binary_sensor.kitchen_window"), { room: "Kitchen", name: "Window" });
  assert.deepEqual(sv.secLabel(hass, m, "binary_sensor.bath_window"), { room: "Bath", name: "Window" });
  assert.equal(sv.secLine(hass, m, "binary_sensor.kitchen_window"), "Kitchen Window", "one line: room, then name");
});

test("a name that already says the room keeps it, front or back", () => {
  const hass = rooms();
  const m = buildModel(hass, {});
  assert.deepEqual(sv.secLabel(hass, m, "binary_sensor.named_window"), { room: null, name: "Kitchen window" });
  assert.deepEqual(sv.secLabel(hass, m, "binary_sensor.named_back"), { room: null, name: "Window kitchen" });
  assert.equal(sv.secLine(hass, m, "binary_sensor.named_window"), "Kitchen window", "nothing twice");
});

test("without a room, and under Other, the name stands alone", () => {
  const hass = rooms();
  const m = buildModel(hass, {});
  assert.deepEqual(sv.secLabel(hass, m, "binary_sensor.loose"), { room: null, name: "Window" }, "no area at all");
  assert.deepEqual(sv.secLabel(hass, { areaById: new Map(), areaOf: {} }, "binary_sensor.loose"), { room: null, name: "Window" });
  const other = { areaById: new Map([["_other", { id: "_other", name: "Other" }]]), areaOf: { "binary_sensor.loose": "_other" } };
  assert.deepEqual(sv.secLabel(hass, other, "binary_sensor.loose"), { room: null, name: "Window" }, "\"Other\" is not a room");
});
