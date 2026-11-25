// Washers, dryers and dishwashers in a room: no pool pumps, and one machine seen twice shows once.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LIB, fakeHass } from "./fake.mjs";

const { appliancesIn } = await import(LIB + "usage.js");

test("a pool's filter pump is no appliance; a machine from two integrations shows once", () => {
  const hass = fakeHass({
    areas: { kitchen: { area_id: "kitchen", name: "Kitchen" }, garden: { area_id: "garden", name: "Garden" } },
    devices: {
      hc: { id: "hc", area_id: "kitchen", name: "Dishwasher" },
      wd: { id: "wd", area_id: "kitchen", name: "Dishwasher" },
      pool: { id: "pool", area_id: "garden", name: "Pool", model: "Pool Manager" },
    },
    entities: {
      "sensor.dishwasher_betriebszustand": { device_id: "hc" },
      "sensor.dishwasher_programm_fortschritt": { device_id: "hc" },
      "sensor.dish_zustand": { device_id: "wd" },
      "sensor.dish_fortschritt": { device_id: "wd" },
      "sensor.dish_verbleibende_zeit": { device_id: "wd" },
      "sensor.dish_aktuelle_leistung": { device_id: "wd" },
      "sensor.pool_filter_pump_state": { device_id: "pool" },
      "sensor.pool_filter_pump_progress": { device_id: "pool" },
    },
    states: {
      "sensor.dishwasher_betriebszustand": "ready", "sensor.dishwasher_programm_fortschritt": "0",
      "sensor.dish_zustand": "off", "sensor.dish_fortschritt": "0", "sensor.dish_verbleibende_zeit": "0", "sensor.dish_aktuelle_leistung": "0",
      "sensor.pool_filter_pump_state": "on", "sensor.pool_filter_pump_progress": "50",
    },
  });
  assert.deepEqual(appliancesIn(hass, "kitchen").map((a) => a.dev), ["wd"], "the one that tells more");
  assert.deepEqual(appliancesIn(hass, "garden"), [], "no pool pump");
});

// #43: a machine's socket on a power strip. Only the machine's outlet folds into its popup; the
// other outlets stay tiles of their own, and a socket picked by hand wins.
const { plugLinks, linkedPlugEntities, plugEntityFor } = await import(LIB + "usage.js");

/** A printer in the office and a three-outlet strip with one meter for all of them. */
function printerHouse({ strip = {}, extraDevices = {}, extraEntities = {}, extraStates = {} } = {}) {
  return fakeHass({
    devices: {
      prn: { id: "prn", area_id: "office", name: "H2D", manufacturer: "Bambu Lab", model: "H2D" },
      strip: { id: "strip", area_id: "office", name: "3D printer power strip", manufacturer: "Eve Systems", model: "Eve Energy Strip", ...strip },
      ...extraDevices,
    },
    entities: {
      "sensor.h2d_print_status": { device_id: "prn" },
      "sensor.h2d_print_progress": { device_id: "prn" },
      "switch.strip_1": { device_id: "strip", name: "3D printer", original_name: "Eve Energy Strip 1" },
      "switch.strip_2": { device_id: "strip", name: "Dryer", original_name: "Eve Energy Strip 2" },
      "switch.strip_3": { device_id: "strip", name: "Free", original_name: "Eve Energy Strip 3" },
      "switch.strip_lock": { device_id: "strip", original_name: "Child lock", entity_category: "config" },
      "sensor.strip_power": { device_id: "strip" },
      "sensor.strip_energy": { device_id: "strip" },
      ...extraEntities,
    },
    states: {
      "sensor.h2d_print_status": "unavailable", "sensor.h2d_print_progress": "unavailable",
      "switch.strip_1": "off", "switch.strip_2": "on", "switch.strip_3": "off", "switch.strip_lock": "off",
      "sensor.strip_power": { state: "12", attributes: { device_class: "power" } },
      "sensor.strip_energy": { state: "3.2", attributes: { device_class: "energy" } },
      ...extraStates,
    },
  });
}

test("power strip: only the outlet named after the printer folds in, with the strip's meters", () => {
  const hass = printerHouse();
  const folded = linkedPlugEntities(hass);
  assert.deepEqual([...folded].sort(), ["sensor.strip_energy", "sensor.strip_power", "switch.strip_1"]);
  assert.ok(!folded.has("switch.strip_2") && !folded.has("switch.strip_3"), "the other outlets stay tiles");
  assert.equal(plugEntityFor(hass, "prn"), "switch.strip_1");
});

test("power strip with outlets named only by the integration: none folds in, the meter still shows usage", () => {
  const plain = Object.fromEntries([1, 2, 3].map((n) => [`switch.strip_${n}`, { device_id: "strip", original_name: `Eve Energy Strip ${n}` }]));
  const hass = printerHouse({ extraEntities: plain });
  assert.deepEqual([...linkedPlugEntities(hass)], []);
  assert.equal(plugEntityFor(hass, "prn"), "sensor.strip_power");
});

test("a socket that was called printer once but was renamed is not taken", () => {
  const hass = printerHouse({ strip: { name: "Eve Energy Strip printer", name_by_user: "Desk strip" } });
  assert.equal(plugLinks(hass).has("prn"), false);
  assert.equal(plugEntityFor(hass, "prn"), null);
});

test("a socket picked by hand beats the automatic one", () => {
  const hass = printerHouse({
    extraDevices: { lamp: { id: "lamp", area_id: "office", name: "Desk plug" } },
    extraEntities: { "switch.desk_plug": { device_id: "lamp" }, "sensor.desk_plug_power": { device_id: "lamp" } },
    extraStates: { "switch.desk_plug": "on", "sensor.desk_plug_power": { state: "3", attributes: { device_class: "power" } } },
  });
  // Another outlet of the strip: that one folds in, the printer outlet found by name goes back to the room.
  const pick = { prn: "switch.strip_3" };
  assert.equal(plugEntityFor(hass, "prn", pick), "switch.strip_3");
  assert.deepEqual([...linkedPlugEntities(hass, pick)].sort(), ["sensor.strip_energy", "sensor.strip_power", "switch.strip_3"]);
  // A plain socket picked by hand folds in as a whole, the strip stays out.
  const other = { prn: "switch.desk_plug" };
  assert.equal(plugEntityFor(hass, "prn", other), "switch.desk_plug");
  assert.deepEqual([...linkedPlugEntities(hass, other)].sort(), ["sensor.desk_plug_power", "switch.desk_plug"]);
  // A pick that is gone falls back to the automatic one.
  assert.equal(plugEntityFor(hass, "prn", { prn: "switch.gone" }), "switch.strip_1");
});

test("a plain socket (one switch) folds in as a whole, like before, and one in the printer's room comes first", () => {
  const hass = fakeHass({
    devices: {
      prn: { id: "prn", area_id: "office", name: "P1S", manufacturer: "Bambu Lab", model: "P1S" },
      far: { id: "far", area_id: "cellar", name: "Printer plug cellar" },
      plug: { id: "plug", area_id: "office", name: "Printer plug" },
    },
    entities: {
      "sensor.p1s_print_status": { device_id: "prn" },
      "switch.far": { device_id: "far" },
      "switch.plug": { device_id: "plug" },
      "sensor.plug_power": { device_id: "plug" },
      "sensor.plug_voltage": { device_id: "plug" },
      "switch.plug_led": { device_id: "plug", entity_category: "config" },
    },
    states: { "sensor.p1s_print_status": "idle", "switch.far": "on", "switch.plug": "on", "switch.plug_led": "on",
      "sensor.plug_power": { state: "8", attributes: { device_class: "power" } }, "sensor.plug_voltage": { state: "230", attributes: { device_class: "voltage" } } },
  });
  assert.equal(plugEntityFor(hass, "prn"), "switch.plug");
  assert.deepEqual([...linkedPlugEntities(hass)].sort(), ["sensor.plug_power", "sensor.plug_voltage", "switch.plug", "switch.plug_led"]);
});

// Last in this file: WashData's answer stays loaded for the module.
test("WashData on a power strip: only the outlet named after the machine folds in", async () => {
  const { loadPlugLinks } = await import(LIB + "usage.js");
  const hass = fakeHass({
    devices: {
      wm: { id: "wm", area_id: "bath", name: "Washing machine", config_entries: ["e1"] },
      strip: { id: "strip", area_id: "bath", name: "Bathroom strip" },
    },
    entities: {
      "switch.strip_1": { device_id: "strip", name: "Washing machine" },
      "switch.strip_2": { device_id: "strip", name: "Hair dryer" },
      "sensor.strip_power": { device_id: "strip" },
    },
    states: { "switch.strip_1": "on", "switch.strip_2": "off", "sensor.strip_power": { state: "400", attributes: { device_class: "power" } } },
  });
  hass.services = { ha_washdata: {} };
  hass.connection = { sendMessagePromise: async () => ({ devices: [{ entry_id: "e1", options: { power_sensor: "sensor.strip_power" } }] }) };
  await new Promise((done) => loadPlugLinks(hass, done));
  assert.equal(plugEntityFor(hass, "wm"), "switch.strip_1");
  assert.deepEqual([...linkedPlugEntities(hass)].sort(), ["sensor.strip_power", "switch.strip_1"]);
});

// #41: Home Connect NG (renaudallard/homeassistant_homeconnect) with a dishwasher and a washer. Every
// slot takes its own domain, whatever order the registry lists the entities in.
const { applianceText, applianceState, applianceSlots } = await import(LIB + "usage.js");
const { sensorsOf, readAppliance, doorOpen } = await import(LIB + "appliance.js");

const NOW = Date.now();
const iso = (min) => new Date(NOW + min * 60000).toISOString();
const OP = (s) => `BSH.Common.EnumType.OperationState.${s}`;

/** The dishwasher from the issue, the wrong twins first in the registry. */
function hcHouse(states = {}) {
  const dw = "dw";
  const ents = [
    "binary_sensor.spuler_door_state", "switch.spuler_power_state", "select.spuler_programm", "event.spuler_programm",
    "sensor.spuler_silence_on_demand_remaining_time", "binary_sensor.spuler_salt_nearly_empty", "binary_sensor.spuler_rinse_aid_nearly_empty",
    "sensor.spuler_operation_state", "sensor.spuler_aktives_programm", "sensor.spuler_programme_progress",
    "sensor.spuler_remaining_programme_time", "sensor.spuler_fertig_um", "sensor.spuler_programme_all_count_started",
    "sensor.spuler_learning_dishwasher_phase",
  ];
  return fakeHass({
    areas: { kitchen: { area_id: "kitchen", name: "Kitchen" } },
    devices: { [dw]: { id: dw, area_id: "kitchen", name: "Geschirrspüler", manufacturer: "Bosch" } },
    entities: Object.fromEntries(ents.map((id) => [id, { device_id: dw, platform: "homeconnect" }])),
    states: {
      "binary_sensor.spuler_door_state": "off", "switch.spuler_power_state": "on", "select.spuler_programm": "Eco 50", "event.spuler_programm": "unknown",
      "sensor.spuler_silence_on_demand_remaining_time": { state: "0", attributes: { unit_of_measurement: "s" } },
      "binary_sensor.spuler_salt_nearly_empty": "off", "binary_sensor.spuler_rinse_aid_nearly_empty": "off",
      "sensor.spuler_operation_state": { state: "Ready", attributes: { value: OP("Ready") } },
      "sensor.spuler_aktives_programm": "unknown", "sensor.spuler_programme_progress": "0",
      "sensor.spuler_remaining_programme_time": { state: "8760", attributes: { unit_of_measurement: "s" } },
      "sensor.spuler_fertig_um": { state: "unknown", attributes: { device_class: "timestamp" } },
      "sensor.spuler_programme_all_count_started": "663", "sensor.spuler_learning_dishwasher_phase": "off",
      ...states,
    },
  });
}

test("Home Connect NG: each slot from its own domain, never door, power switch, select/event program or quiet mode", () => {
  const hass = hcHouse();
  const s = sensorsOf(hass, "dw");
  assert.equal(s.state, "sensor.spuler_operation_state");
  assert.equal(s.program, "sensor.spuler_aktives_programm");
  assert.equal(s.progress, "sensor.spuler_programme_progress");
  assert.equal(s.remaining, "sensor.spuler_remaining_programme_time");
  assert.equal(s.end, "sensor.spuler_fertig_um");
  assert.equal(s.count, "sensor.spuler_programme_all_count_started");
  assert.equal(s.door, "binary_sensor.spuler_door_state");
  assert.equal(s.salt, "binary_sensor.spuler_salt_nearly_empty");
  assert.equal(s.phase, undefined, "the learning phase is no program phase");
  // The tile reads the same entities as the popup.
  const [a] = appliancesIn(hass, "kitchen");
  assert.equal(a.dev, "dw");
  for (const k of ["state", "program", "progress", "remaining", "end"]) assert.equal(a[k], s[k], k);
});

test("Home Connect NG: the same slots whatever order the registry has", () => {
  const hass = hcHouse();
  const rev = { ...hass, entities: Object.fromEntries(Object.entries(hass.entities).reverse()) };
  assert.deepEqual(sensorsOf(rev, "dw"), sensorsOf(hass, "dw"));
});

test("a program only from select when there is no sensor; a disabled entity is skipped", () => {
  const hass = hcHouse();
  delete hass.entities["sensor.spuler_aktives_programm"];
  hass.entities["sensor.spuler_operation_state"].disabled_by = "user";
  const s = applianceSlots(hass, ["dw"]);
  assert.equal(s.program, "select.spuler_programm");
  assert.equal(s.state, undefined);
});

test("the program by translation_key in any language", () => {
  const hass = hcHouse();
  delete hass.entities["sensor.spuler_aktives_programm"];
  hass.entities["sensor.lave_vaisselle_programme_actif"] = { entity_id: "sensor.lave_vaisselle_programme_actif", device_id: "dw", translation_key: "active_program" };
  assert.equal(applianceSlots(hass, ["dw"]).program, "sensor.lave_vaisselle_programme_actif");
});

test("the state in one spelling: attributes.value first, else spaces and dashes as _", () => {
  assert.equal(applianceState({ state: "Startverzögerung", attributes: { value: OP("DelayedStart") } }), "delayedstart");
  assert.equal(applianceState({ state: "Delayed start", attributes: {} }), "delayed_start");
  assert.equal(applianceState({ state: "running", attributes: {} }), "running");
  assert.equal(applianceState(undefined), "");
});

test("the run from the issue: ready, delayed start, run, finished; tile and popup agree", () => {
  const steps = [
    [{ "sensor.spuler_operation_state": { state: "Ready", attributes: { value: OP("Ready") } } }, "off", null],
    [{ "sensor.spuler_operation_state": { state: "Delayed start", attributes: {} }, "sensor.spuler_aktives_programm": "Auto 2" }, "later", "Starts later"],
    [{ "sensor.spuler_operation_state": { state: "Startverzögerung", attributes: { value: OP("DelayedStart") } }, "sensor.spuler_aktives_programm": "Auto 2" }, "later", "Starts later"],
    [{ "sensor.spuler_operation_state": { state: "Run", attributes: { value: OP("Run") } }, "sensor.spuler_aktives_programm": "Auto 2",
      "sensor.spuler_programme_progress": "40", "sensor.spuler_remaining_programme_time": { state: "5400", attributes: { unit_of_measurement: "s" } },
      "sensor.spuler_fertig_um": { state: iso(90), attributes: { device_class: "timestamp" } } }, "run", "Running · 40 % · 90 min left"],
    [{ "sensor.spuler_operation_state": { state: "Finished", attributes: { value: OP("Finished") } }, "sensor.spuler_programme_progress": "100",
      "sensor.spuler_remaining_programme_time": { state: "0", attributes: { unit_of_measurement: "s" } } }, "done", null],
  ];
  for (const [st, phase, text] of steps) {
    const hass = hcHouse(st);
    const r = readAppliance(hass, sensorsOf(hass, "dw"));
    assert.equal(r.phase, phase, JSON.stringify(st));
    const [a] = appliancesIn(hass, "kitchen");
    assert.equal(applianceText(hass, a), text);
    if (phase === "run") {
      assert.equal(r.program, "Auto 2");
      assert.equal(Math.round(r.left), 90);
    }
  }
});

test("a remaining time that is a moment counts like the end; no remaining time falls back to the end", () => {
  const hass = hcHouse({
    "sensor.spuler_operation_state": { state: "Run", attributes: { value: OP("Run") } },
    "sensor.spuler_remaining_programme_time": { state: iso(30), attributes: { device_class: "timestamp" } },
  });
  assert.equal(Math.round(readAppliance(hass, sensorsOf(hass, "dw")).left), 30);
  const h2 = hcHouse({
    "sensor.spuler_operation_state": { state: "Run", attributes: { value: OP("Run") } },
    "sensor.spuler_remaining_programme_time": { state: "unknown", attributes: { unit_of_measurement: "s" } },
    "sensor.spuler_fertig_um": { state: iso(45), attributes: { device_class: "timestamp" } },
  });
  assert.equal(Math.round(readAppliance(h2, sensorsOf(h2, "dw")).left), 45);
});

test("an open door: binary_sensor on, or a sensor that says open", () => {
  const hass = fakeHass({ states: { "binary_sensor.w_door_state": "on", "binary_sensor.d_door": "off", "sensor.x_tur": "Offen", "sensor.y_door": "closed" } });
  assert.equal(doorOpen(hass, "binary_sensor.w_door_state"), true);
  assert.equal(doorOpen(hass, "binary_sensor.d_door"), false);
  assert.equal(doorOpen(hass, "sensor.x_tur"), true);
  assert.equal(doorOpen(hass, "sensor.y_door"), false);
  assert.equal(doorOpen(hass, undefined), false);
});

test("the washer: process phase, door state and remaining time as before", () => {
  const hass = fakeHass({
    areas: { bath: { area_id: "bath", name: "Bath" } },
    devices: { wm: { id: "wm", area_id: "bath", name: "Waschmaschine" } },
    entities: Object.fromEntries(["select.wm_power_state", "binary_sensor.wm_door_open", "binary_sensor.wm_door_state", "sensor.wm_operation_state",
      "sensor.wm_process_phase", "sensor.wm_programme_progress", "sensor.wm_remaining_programme_time"].map((id) => [id, { device_id: "wm" }])),
    states: {
      "select.wm_power_state": "On", "binary_sensor.wm_door_open": "off", "binary_sensor.wm_door_state": "on",
      "sensor.wm_operation_state": { state: "Pause", attributes: { value: OP("Pause") } }, "sensor.wm_process_phase": "Spülen",
      "sensor.wm_programme_progress": "60", "sensor.wm_remaining_programme_time": { state: "1200", attributes: { unit_of_measurement: "s" } },
    },
  });
  const s = sensorsOf(hass, "wm");
  assert.equal(s.state, "sensor.wm_operation_state");
  assert.equal(s.door, "binary_sensor.wm_door_state");
  assert.equal(s.phase, "sensor.wm_process_phase");
  assert.ok(doorOpen(hass, s.door));
  const r = readAppliance(hass, s);
  assert.equal(r.phase, "pause");
  assert.equal(r.step, "Spülen");
  assert.equal(applianceText(hass, appliancesIn(hass, "bath")[0]), "Paused · 60 % · 20 min left");
});

test("WashData as before: zustand, fortschritt, verbleibende_zeit in minutes", () => {
  const hass = fakeHass({
    areas: { bath: { area_id: "bath", name: "Bath" } },
    devices: { wd: { id: "wd", area_id: "bath", name: "Trockner" } },
    entities: Object.fromEntries(["sensor.tr_zustand", "sensor.tr_fortschritt", "sensor.tr_verbleibende_zeit", "sensor.tr_aktuelle_leistung", "button.tr_als_entladen_markieren"]
      .map((id) => [id, { device_id: "wd" }])),
    states: {
      "sensor.tr_zustand": "running", "sensor.tr_fortschritt": "25", "sensor.tr_verbleibende_zeit": { state: "75", attributes: { unit_of_measurement: "min" } },
      "sensor.tr_aktuelle_leistung": { state: "800", attributes: { unit_of_measurement: "W" } }, "button.tr_als_entladen_markieren": "unknown",
    },
  });
  const [a] = appliancesIn(hass, "bath");
  assert.equal(a.state, "sensor.tr_zustand");
  assert.equal(a.power, "sensor.tr_aktuelle_leistung");
  assert.equal(sensorsOf(hass, "wd").unload, "button.tr_als_entladen_markieren");
  assert.equal(applianceText(hass, a), "Running · 25 % · 75 min left");
  assert.equal(readAppliance(hass, sensorsOf(hass, "wd")).power, 800);
});
