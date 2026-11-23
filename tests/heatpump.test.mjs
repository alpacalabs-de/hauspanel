// Heat pumps: which devices count as one, and what an EMS-ESP compressor activity says.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LIB, fakeHass } from "./fake.mjs";

const { heatPumps, heatPumpOf, hpSlots, heatPumpText, activityState, chargeSwitch, runningParts } = await import(LIB + "heatpump.js");
const { t } = await import(LIB + "i18n.js");

const deg = (v) => ({ state: String(v), attributes: { unit_of_measurement: "°C", device_class: "temperature" } });
const w = (v) => ({ state: String(v), attributes: { unit_of_measurement: "W", device_class: "power" } });

/** A Buderus boiler as EMS-ESP builds it over MQTT discovery: no water heater, no water pumps. */
const ems = ({ platform = "mqtt", activity = "off", dhw = false } = {}) => {
  const p = dhw ? "dhw_" : "ww";
  const sensors = {
    [`sensor.boiler_curflowtemp`]: deg(38.5),
    [`sensor.boiler_rettemp`]: deg(32.1),
    [`sensor.boiler_outdoortemp`]: deg(4),
    [`sensor.boiler_${p}curtemp2`]: deg(51),
    [`sensor.boiler_hpcompspd`]: { state: "42", attributes: { unit_of_measurement: "%" } },
    [`sensor.boiler_hpcurrpower`]: w(1800),
    [`sensor.boiler_hpactivity`]: String(activity),
  };
  const bin = { [`binary_sensor.boiler_${p}3wayvalve`]: "off" };
  return fakeHass({
    devices: { boiler: { name: "Boiler" } },
    entities: Object.fromEntries(Object.keys({ ...sensors, ...bin }).map((id) => [id, { device_id: "boiler", platform }])),
    states: { ...sensors, ...bin },
  });
};

test("an EMS-ESP boiler without a water heater is a heat pump", () => {
  const hass = ems({ activity: "heating" });
  assert.deepEqual(heatPumps(hass), [{ dev: "boiler", wh: null, climate: null }]);
  assert.deepEqual(hpSlots(hass, "boiler"), {
    flow: "sensor.boiler_curflowtemp",
    ret: "sensor.boiler_rettemp",
    outside: "sensor.boiler_outdoortemp",
    tank: "sensor.boiler_wwcurtemp2",
    demand: "sensor.boiler_hpcompspd",
    valve3: "binary_sensor.boiler_ww3wayvalve",
    power: "sensor.boiler_hpcurrpower",
    activity: "sensor.boiler_hpactivity",
  });
  // Any of its entities opens the popup.
  assert.deepEqual(heatPumpOf(hass, "sensor.boiler_hpactivity"), { dev: "boiler", wh: null, climate: null });
});

/** An EMS-ESP boiler that also reports its heating circuit pump and its hot water circulation. */
const emsPumps = ({ platform = "mqtt", pc1 = "off", circ = "off", demand = 0, dhw = false } = {}) => {
  const p = dhw ? "dhw_" : "ww";
  const states = {
    "sensor.boiler_curflowtemp": deg(38.5),
    "sensor.boiler_hpcompspd": { state: String(demand), attributes: { unit_of_measurement: "%" } },
    "sensor.boiler_hpcurrpower": w(1800),
    "sensor.boiler_hpactivity": "heating",
    "binary_sensor.boiler_pc1on": pc1,
    [`switch.boiler_${p}circ`]: circ,
  };
  return fakeHass({
    devices: { boiler: { name: "Boiler" } },
    entities: Object.fromEntries(Object.keys(states).map((id) => [id, { device_id: "boiler", platform }])),
    states,
  });
};

test("EMS-ESP: the heating circuit pump and the hot water circulation are found", () => {
  const s = hpSlots(emsPumps(), "boiler");
  assert.equal(s.pc1, "binary_sensor.boiler_pc1on");
  assert.equal(s.circ, "switch.boiler_wwcirc");
  assert.equal(hpSlots(emsPumps({ dhw: true }), "boiler").circ, "switch.boiler_dhw_circ");
  // Same names from another integration are not a heat pump's pumps.
  const other = hpSlots(emsPumps({ platform: "template" }), "boiler");
  assert.equal(other.pc1, undefined);
  assert.equal(other.circ, undefined);
});

test("EMS-ESP: Running now names the compressor, the circuit pump and the circulation", () => {
  const labels = (hass, running) => runningParts(hass, hpSlots(hass, "boiler"), [], running).map(([, l]) => l);
  // It heats: without the compressor the list would be empty, since EMS-ESP has no water pumps.
  assert.deepEqual(labels(emsPumps(), true), [t("hp_compressor")]);
  // A compressor that still reports a speed counts as running as well.
  assert.deepEqual(labels(emsPumps({ demand: 42 }), false), [t("hp_compressor")]);
  // Everything that is on, in order.
  assert.deepEqual(labels(emsPumps({ pc1: "on", circ: "on" }), true),
    [t("hp_compressor"), t("hp_circuit_pump"), t("hp_circ")]);
  assert.deepEqual(labels(emsPumps({ pc1: "on" }), false), [t("hp_circuit_pump")]);
  // Resting, with no speed: nothing runs.
  assert.deepEqual(labels(emsPumps(), false), []);
});

test("heat pumps with water pumps keep their old Running now list", () => {
  const hass = fakeHass({
    devices: { hp: { name: "Heat pump" } },
    entities: {
      "binary_sensor.hp_wasserpumpe_1": { device_id: "hp", platform: "modbus" },
      "binary_sensor.hp_wasserpumpe_2": { device_id: "hp", platform: "modbus" },
      "binary_sensor.hp_3_wege_ventil": { device_id: "hp", platform: "modbus" },
      "binary_sensor.hp_heizstab": { device_id: "hp", platform: "modbus" },
      "sensor.hp_nachfrageanteil": { device_id: "hp", platform: "modbus" },
    },
    states: {
      "binary_sensor.hp_wasserpumpe_1": "on",
      "binary_sensor.hp_wasserpumpe_2": "off",
      "binary_sensor.hp_3_wege_ventil": "on",
      "binary_sensor.hp_heizstab": "off",
      "sensor.hp_nachfrageanteil": { state: "80", attributes: { unit_of_measurement: "%" } },
    },
  });
  const s = hpSlots(hass, "hp");
  const pumpIds = ["binary_sensor.hp_wasserpumpe_1", "binary_sensor.hp_wasserpumpe_2"];
  // No compressor line here, even though it runs and reports a demand: it has no activity sensor.
  assert.deepEqual(runningParts(hass, s, pumpIds, true).map(([, l]) => l),
    [t("hp_pump_n", { n: 1 }), t("hp_valve")]);
});

test("newer EMS-ESP writes dhw where older ones wrote ww", () => {
  const s = hpSlots(ems({ dhw: true }), "boiler");
  assert.equal(s.tank, "sensor.boiler_dhw_curtemp2");
  assert.equal(s.valve3, "binary_sensor.boiler_dhw_3wayvalve");
});

test("the same sensor names from another integration are not a heat pump", () => {
  const hass = ems({ platform: "template", activity: "heating" });
  assert.deepEqual(heatPumps(hass), []);
  assert.deepEqual(hpSlots(hass, "boiler"), {});
});

test("the compressor activity says what it is doing", () => {
  const text = (activity) => heatPumpText(ems({ activity }), { dev: "boiler", wh: null, climate: null });
  assert.equal(text("heating"), `${t("hp_heating")} · 51° ${t("hp_tank_short")}`);
  assert.equal(text("hot water"), `${t("hp_hot_water")} · 51° ${t("hp_tank_short")}`);
  assert.equal(text("off"), `${t("hp_idle")} · 51° ${t("hp_tank_short")}`);
  // Defrosting says so instead of "heating", a compressor fault instead of "resting".
  assert.equal(text("defrost"), `${t("hp_defrost")} · 51° ${t("hp_tank_short")}`);
  assert.equal(text("compressor alarm"), `${t("hp_alarm")} · 51° ${t("hp_tank_short")}`);
});

test("activityState knows idle, hot water and everything in between", () => {
  // Spelling from EMS-ESP: underscores, capitals and extra spaces all mean the same.
  assert.equal(activityState("Hot Water"), "hot_water");
  assert.equal(activityState("hot_water"), "hot_water");
  assert.equal(activityState("heating & dhw"), "hot_water");
  assert.equal(activityState("heating"), "running");
  assert.equal(activityState("cooling"), "running");
  assert.equal(activityState("pool heating"), "running");
  // Defrosting is the compressor working, a fault is not.
  assert.equal(activityState("defrost"), "defrost");
  assert.equal(activityState("Defrosting"), "defrost");
  assert.equal(activityState("compressor alarm"), "alarm");
  assert.equal(activityState("Alarm"), "alarm");
  assert.equal(activityState("alarming system"), "running");
  assert.equal(activityState(" OFF "), "idle");
  assert.equal(activityState("none"), "idle");
  assert.equal(activityState("not installed"), "idle");
  assert.equal(activityState("unavailable"), "idle");
  assert.equal(activityState("unknown"), "idle");
  // No sensor at all: the pumps and the valve decide, as before.
  assert.equal(activityState(undefined), null);
  assert.equal(activityState(null), null);
});

/** The kind of heat pump HausPanel already knew: a water heater plus German register names. */
const classic = ({ pump = "off", valve = "off" } = {}) =>
  fakeHass({
    devices: { hp: { name: "Heat pump" } },
    entities: {
      "water_heater.wp": { device_id: "hp", platform: "weishaupt" },
      "sensor.wp_vorlauftemperatur": { device_id: "hp", platform: "weishaupt" },
      "sensor.wp_speichertemperatur": { device_id: "hp", platform: "weishaupt" },
      "binary_sensor.wp_wasserpumpe_1": { device_id: "hp", platform: "weishaupt" },
      "binary_sensor.wp_3_wege_ventil": { device_id: "hp", platform: "weishaupt" },
      "climate.heizkreis": { device_id: "zone", platform: "weishaupt" },
    },
    states: {
      "water_heater.wp": "heat_pump",
      "sensor.wp_vorlauftemperatur": deg(40),
      "sensor.wp_speichertemperatur": deg(48),
      "binary_sensor.wp_wasserpumpe_1": pump,
      "binary_sensor.wp_3_wege_ventil": valve,
      "climate.heizkreis": "heat",
    },
  });

test("a water heater heat pump keeps working the way it did", () => {
  const hass = classic({ pump: "on" });
  assert.deepEqual(heatPumps(hass), [{ dev: "hp", wh: "water_heater.wp", climate: "climate.heizkreis" }]);
  const p = heatPumps(hass)[0];
  assert.equal(heatPumpText(hass, p), `${t("hp_heating")} · 48° ${t("hp_tank_short")}`);
  assert.equal(heatPumpText(classic({ pump: "on", valve: "on" }), p), `${t("hp_hot_water")} · 48° ${t("hp_tank_short")}`);
  assert.equal(heatPumpText(classic(), p), `${t("hp_idle")} · 48° ${t("hp_tank_short")}`);
});

/** EMS-ESP puts the hot water charge switch on the thermostat, a device of its own. */
const charged = (opts = {}, { switches = ["switch.thermostat_wwcharge"], platform = "mqtt" } = {}) => {
  const hass = ems(opts);
  hass.devices.thermostat = { name: "Thermostat" };
  for (const id of switches) {
    hass.entities[id] = { entity_id: id, device_id: "thermostat", platform };
    hass.states[id] = { entity_id: id, state: "off", attributes: {} };
  }
  return hass;
};
const add = (hass, dev, states, platform = "mqtt") => {
  for (const [id, v] of Object.entries(states)) {
    hass.entities[id] = { entity_id: id, device_id: dev, platform };
    hass.states[id] = { entity_id: id, ...v };
  }
  return hass;
};

test("the hot water charge switch is found when there is no doubt", () => {
  assert.equal(chargeSwitch(charged()), "switch.thermostat_wwcharge");
  // Newer EMS-ESP spells it dhw here too.
  assert.equal(chargeSwitch(charged({}, { switches: ["switch.thermostat_dhw_charge"] })), "switch.thermostat_dhw_charge");
});

test("an unclear charge switch gets no button", () => {
  // Two switches: there is no telling which heat pump they belong to.
  assert.equal(chargeSwitch(charged({}, { switches: ["switch.thermostat_wwcharge", "switch.thermostat_2_dhwcharge"] })), null);
  // The same name from another integration.
  assert.equal(chargeSwitch(charged({}, { platform: "template" })), null);
  // Two EMS-ESP heat pumps.
  const two = add(charged(), "boiler2", { "sensor.boiler2_curflowtemp": deg(30), "sensor.boiler2_hpcurrpower": w(500) });
  assert.equal(chargeSwitch(two), null);
  // A water heater does the job itself.
  const wh = add(charged(), "boiler", { "water_heater.boiler_dhw": { state: "eco", attributes: {} } });
  assert.equal(chargeSwitch(wh), null);
  // No switch at all.
  assert.equal(chargeSwitch(ems()), null);
});

test("a device is listed once, even with a water heater and EMS-ESP names", () => {
  const hass = ems({ activity: "heating" });
  hass.entities["water_heater.boiler_dhw"] = { entity_id: "water_heater.boiler_dhw", device_id: "boiler", platform: "mqtt" };
  hass.states["water_heater.boiler_dhw"] = { entity_id: "water_heater.boiler_dhw", state: "eco", attributes: {} };
  assert.deepEqual(heatPumps(hass), [{ dev: "boiler", wh: "water_heater.boiler_dhw", climate: null }]);
});
