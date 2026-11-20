// Wallboxes: which devices count as one, and what a SolaX HAC's Run Mode says about the car.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LIB, fakeHass } from "./fake.mjs";

const { wallboxes, wbSlots, wallboxText, runModeState, wallboxName, wallboxLabel, useModes } = await import(LIB + "wallbox.js");
const { t } = await import(LIB + "i18n.js");

const w = (v) => ({ state: String(v), attributes: { unit_of_measurement: "W", device_class: "power" } });
const kwh = (v) => ({ state: String(v), attributes: { unit_of_measurement: "kWh", device_class: "energy" } });

/** The options the HAC's Charger Use Mode select offers. */
const USE = ["Stop", "Fast", "ECO", "Green"];

/**
 * A SolaX HAC as the solax_modbus integration builds it: no plug and no charging binary sensor.
 * With `use` it also brings its Charger Use Mode select, sitting on that option.
 */
const solax = ({ platform = "solax_modbus", power = 0, mode = "Available", use = null } = {}) => {
  const ids = ["charge_power_total", "charge_added", "charge_added_cumulative", "run_mode"];
  const entities = Object.fromEntries(ids.map((k) => [`sensor.hac_${k}`, { device_id: "hac", platform }]));
  const states = {
    "sensor.hac_charge_power_total": w(power),
    "sensor.hac_charge_added": kwh(12.3),
    "sensor.hac_charge_added_cumulative": kwh(1234.5),
    "sensor.hac_run_mode": mode,
  };
  if (use) {
    entities["select.hac_charger_use_mode"] = { device_id: "hac", platform };
    states["select.hac_charger_use_mode"] = { state: use, attributes: { options: [...USE] } };
  }
  return fakeHass({ devices: { hac: { name: "SolaX HAC" } }, entities, states });
};

test("a SolaX HAC is found and its sensors land in the right slots", () => {
  const hass = solax({ power: 7400, mode: "Charging" });
  assert.deepEqual(wallboxes(hass), ["hac"]);
  assert.deepEqual(wbSlots(hass, "hac"), {
    power: "sensor.hac_charge_power_total",
    session: "sensor.hac_charge_added",
    total: "sensor.hac_charge_added_cumulative",
    runmode: "sensor.hac_run_mode",
  });
  // Watts become kilowatts like everywhere else.
  assert.equal(wallboxText(hass, "hac"), `${t("car_charging")} · 7.4 kW`);
});

test("the same sensor names from another integration are not a wallbox", () => {
  const hass = solax({ platform: "template", power: 7400, mode: "Charging" });
  assert.deepEqual(wallboxes(hass), []);
  assert.deepEqual(wbSlots(hass, "hac"), {});
});

test("Run Mode says whether the car is charging, plugged in or gone", () => {
  // No power, so the state can only come from Run Mode.
  const text = (mode) => wallboxText(solax({ mode }), "hac");
  assert.equal(text("Charging"), `${t("car_charging")} · 0.0 kW`);
  assert.equal(text("Available"), t("wb_ready"));
  assert.equal(text("Suspended EV"), t("car_plugged"));
  assert.equal(text("Charge Paused"), t("car_plugged"));
  assert.equal(text("Finishing"), t("car_plugged"));
  // A mode that says nothing about a car falls back to the sensors, which are still reporting.
  assert.equal(text("Faulted"), t("wb_ready"));
});

test("Run Mode on its own: case and spelling don't matter, unknown values say nothing", () => {
  assert.equal(runModeState("charging"), "charging");
  assert.equal(runModeState("CHARGING"), "charging");
  assert.equal(runModeState("Available"), "ready");
  assert.equal(runModeState("suspended_evse"), "plugged");
  assert.equal(runModeState(" Charge Paused "), "plugged");
  assert.equal(runModeState("unavailable"), null);
  assert.equal(runModeState("unknown"), null);
  assert.equal(runModeState(undefined), null);
  assert.equal(runModeState(""), null);
});

test("the Charger Use Mode select gets its own slot, and only from solax_modbus", () => {
  const hass = solax({ use: "ECO" });
  assert.deepEqual(wbSlots(hass, "hac"), {
    power: "sensor.hac_charge_power_total",
    session: "sensor.hac_charge_added",
    total: "sensor.hac_charge_added_cumulative",
    runmode: "sensor.hac_run_mode",
    usemode: "select.hac_charger_use_mode",
  });
  // A select with the same name from somewhere else must not become the charge mode.
  assert.equal(wbSlots(solax({ platform: "template", use: "ECO" }), "hac").usemode, undefined);
  // Without the select, nothing changes for the wallbox.
  assert.equal(wbSlots(solax({}), "hac").usemode, undefined);
});

test("the charge modes come from the select, with the current one marked", () => {
  const hass = solax({ use: "ECO" });
  assert.deepEqual(useModes(hass, "select.hac_charger_use_mode"), [
    { value: "Stop", label: "Stop", active: false },
    { value: "Fast", label: "Fast", active: false },
    { value: "ECO", label: "ECO", active: true },
    { value: "Green", label: "Green", active: false },
  ]);
  // Nothing to pick from, nothing to report, nothing there: no modes at all.
  const bare = solax({ use: "ECO" });
  delete bare.states["select.hac_charger_use_mode"].attributes.options;
  assert.equal(useModes(bare, "select.hac_charger_use_mode"), null);
  const empty = solax({ use: "ECO" });
  empty.states["select.hac_charger_use_mode"].attributes.options = [];
  assert.equal(useModes(empty, "select.hac_charger_use_mode"), null);
  for (const dead of ["unavailable", "unknown"]) assert.equal(useModes(solax({ use: dead }), "select.hac_charger_use_mode"), null);
  assert.equal(useModes(hass, "select.nope"), null);
  assert.equal(useModes(hass, undefined), null);
});

test("a charger that reports nothing at all says so", () => {
  const hass = solax({ mode: "unavailable" });
  for (const id of ["sensor.hac_charge_power_total", "sensor.hac_charge_added"]) hass.states[id].state = "unavailable";
  assert.equal(wallboxText(hass, "hac"), t("wb_no_data"));
});

test("a wallbox with the usual names works as before", () => {
  const ids = {
    "binary_sensor.wb_plug": { device_id: "wb" },
    "binary_sensor.wb_charging_state": { device_id: "wb" },
    "sensor.wb_charging_power": { device_id: "wb" },
    "sensor.wb_session_energy": { device_id: "wb" },
  };
  const hass = fakeHass({
    devices: { wb: { name: "Wallbox" } },
    entities: ids,
    states: {
      "binary_sensor.wb_plug": "on",
      "binary_sensor.wb_charging_state": "off",
      "sensor.wb_charging_power": w(0),
      "sensor.wb_session_energy": kwh(5),
    },
  });
  assert.deepEqual(wallboxes(hass), ["wb"]);
  const s = wbSlots(hass, "wb");
  assert.equal(s.power, "sensor.wb_charging_power");
  assert.equal(s.runmode, undefined);
  assert.equal(wallboxText(hass, "wb"), t("car_plugged"));
  hass.states["binary_sensor.wb_charging_state"].state = "on";
  hass.states["sensor.wb_charging_power"].state = "3500";
  assert.equal(wallboxText(hass, "wb"), `${t("car_charging")} · 3.5 kW`);
});

const kW = (v) => ({ state: String(v), attributes: { unit_of_measurement: "kW", device_class: "power" } });
const unit = (v, u) => ({ state: String(v), attributes: { unit_of_measurement: u } });

/**
 * evcc as the ha-evcc integration builds it: one device per charge point, named after evcc's own
 * values, plus the site device that holds grid, pv and the house battery.
 */
const evcc = ({ platform = "evcc_intg", lps = ["lp1"], power = 0, connected = "off", charging = "off" } = {}) => {
  const entities = { "sensor.evcc_pv_power": { device_id: "evcc", platform }, "sensor.evcc_grid_power": { device_id: "evcc", platform } };
  const states = { "sensor.evcc_pv_power": kW(3), "sensor.evcc_grid_power": kW(1) };
  for (const lp of lps) {
    const own = {
      [`sensor.evcc_${lp}_charge_power`]: kW(power),
      [`sensor.evcc_${lp}_session_energy`]: kwh(6.2),
      [`sensor.evcc_${lp}_charge_total_import`]: kwh(912.5),
      [`sensor.evcc_${lp}_charged_energy`]: kwh(6.2),
      [`sensor.evcc_${lp}_charge_duration`]: unit(42, "min"),
      [`sensor.evcc_${lp}_vehicle_soc`]: unit(64, "%"),
      [`sensor.evcc_${lp}_vehicle_range`]: unit(310, "km"),
      [`binary_sensor.evcc_${lp}_connected`]: connected,
      [`binary_sensor.evcc_${lp}_charging`]: charging,
    };
    for (const id of Object.keys(own)) entities[id] = { device_id: lp, platform };
    Object.assign(states, own);
  }
  return fakeHass({
    devices: { evcc: { name: "evcc" }, ...Object.fromEntries(lps.map((lp, i) => [lp, { name: `Carport ${i + 1}` }])) },
    entities,
    states,
  });
};

test("an evcc charge point is found and its sensors land in the right slots", () => {
  const hass = evcc({ power: 7.4, connected: "on", charging: "on" });
  assert.deepEqual(wallboxes(hass), ["lp1"]);
  assert.deepEqual(wbSlots(hass, "lp1"), {
    power: "sensor.evcc_lp1_charge_power",
    session: "sensor.evcc_lp1_session_energy",
    total: "sensor.evcc_lp1_charge_total_import",
    plug: "binary_sensor.evcc_lp1_connected",
    charging: "binary_sensor.evcc_lp1_charging",
    vsoc: "sensor.evcc_lp1_vehicle_soc",
    vrange: "sensor.evcc_lp1_vehicle_range",
  });
  // evcc reports kilowatts, so nothing is converted.
  assert.equal(wallboxText(hass, "lp1"), `${t("car_charging")} · 7.4 kW`);
  assert.equal(wallboxName(hass, "lp1"), "Carport 1");
});

test("the evcc site device is not a wallbox, and neither is a charge point without a meter", () => {
  const hass = evcc({ power: 7.4 });
  assert.ok(!wallboxes(hass).includes("evcc"));
  for (const id of ["sensor.evcc_lp1_session_energy", "sensor.evcc_lp1_charge_total_import"]) {
    delete hass.states[id];
    delete hass.entities[id];
  }
  assert.deepEqual(wallboxes(hass), []);
});

test("two evcc charge points are two wallboxes", () => {
  const hass = evcc({ lps: ["lp1", "lp2"], power: 11 });
  assert.deepEqual(wallboxes(hass).sort(), ["lp1", "lp2"]);
  assert.equal(wbSlots(hass, "lp2").power, "sensor.evcc_lp2_charge_power");
  assert.equal(wallboxName(hass, "lp2"), "Carport 2");
});

test("the same evcc names from another integration are not a wallbox", () => {
  const hass = evcc({ platform: "template", power: 7.4, connected: "on" });
  assert.deepEqual(wallboxes(hass), []);
  // Above all, a plain _connected or _charging sensor must not become plug or charging.
  assert.deepEqual(wbSlots(hass, "lp1"), { session: "sensor.evcc_lp1_session_energy" });
});

test("evcc says whether the car is plugged in or charging", () => {
  // No power, so it can only come from the two binary sensors.
  assert.equal(wallboxText(evcc({}), "lp1"), t("wb_ready"));
  assert.equal(wallboxText(evcc({ connected: "on" }), "lp1"), t("car_plugged"));
  assert.equal(wallboxText(evcc({ connected: "on", charging: "on" }), "lp1"), `${t("car_charging")} · 0.0 kW`);
  const dead = evcc({ connected: "unavailable" });
  for (const id of ["sensor.evcc_lp1_charge_power", "sensor.evcc_lp1_session_energy"]) dead.states[id].state = "unavailable";
  assert.equal(wallboxText(dead, "lp1"), t("wb_no_data"));
});

test("a wallbox without a device is named after its entities", () => {
  const hass = fakeHass({});
  assert.equal(wallboxName(hass, "pfx:keba_p30"), "KEBA P30");
  assert.equal(wallboxName(hass, "nosuchdevice"), t("wb_title"));
});

test("tiles say just Wallbox with one, the device's name with several", () => {
  // One wallbox: the plain title, as it was before.
  assert.equal(wallboxLabel(evcc({ power: 7.4 }), "lp1"), t("wb_title"));
  // Two: each is named after its device, so they can be told apart.
  const two = evcc({ lps: ["lp1", "lp2"], power: 11 });
  assert.equal(wallboxLabel(two, "lp1"), "Carport 1");
  assert.equal(wallboxLabel(two, "lp2"), "Carport 2");
  // A name the owner gave it in Home Assistant wins over the integration's own.
  two.devices.lp2.name_by_user = "Carport right";
  assert.equal(wallboxLabel(two, "lp2"), "Carport right");
  // Wallboxes without a device (KEBA) keep their entity prefix.
  const pfx = fakeHass({
    states: {
      "sensor.keba_p30_charging_power": w(0),
      "sensor.keba_p30_session_energy": kwh(5),
      "sensor.garage_charging_power": w(0),
      "sensor.garage_session_energy": kwh(5),
    },
  });
  assert.deepEqual(wallboxes(pfx).sort(), ["pfx:garage", "pfx:keba_p30"]);
  assert.equal(wallboxLabel(pfx, "pfx:keba_p30"), "KEBA P30");
  delete pfx.states["sensor.garage_charging_power"];
  assert.equal(wallboxLabel(pfx, "pfx:keba_p30"), t("wb_title"));
});
