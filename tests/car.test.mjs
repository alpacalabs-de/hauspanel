// Cars: which devices count as one, and how a Volkswagen is read without a device tracker.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LIB, fakeHass } from "./fake.mjs";

const { carDevices, carSlots, carOpenings, chargeMinutes, isVwCar, carText } = await import(LIB + "car.js");

const km = (v) => ({ state: String(v), attributes: { unit_of_measurement: "km", device_class: "distance" } });
const pct = (v) => ({ state: String(v), attributes: { unit_of_measurement: "%" } });
const bin = (state, device_class) => ({ state, attributes: { device_class } });

/**
 * A Volkswagen as the volkswagen_connect integration builds it: no device tracker, no lock and no
 * climate entity, entity ids in whatever language Home Assistant was set up in (here German), and
 * the meaning carried by the translation key.
 */
const vw = ({ platform = "volkswagen_connect", open = {}, locked = "off", extra = {} } = {}) => {
  const ents = {
    "sensor.passat_batterieladestand": ["soc", pct(62)],
    "sensor.passat_tankfullstand": ["fuel_level_current_level", pct(45)],
    "sensor.passat_reichweite_gesamt": ["cruising_range_combined", km(520)],
    "sensor.passat_reichweite_sekundar": ["cruising_range_secondary_engine", km(48)],
    "sensor.passat_reichweite_primar": ["cruising_range_primary_engine", km(472)],
    "sensor.passat_ladezustand": ["charging_state", { state: "charging", attributes: {} }],
    "sensor.passat_verbleibende_ladezeit": ["charge_time_remaining", { state: "65535", attributes: { unit_of_measurement: "min" } }],
    "sensor.passat_kilometerstand": ["odometer", km(31400)],
    "sensor.passat_inspektion_fallig_in_tage": ["inspection_due_days", { state: "210", attributes: {} }],
    "binary_sensor.passat_verriegelt": ["locked", bin(locked, "lock")],
    "binary_sensor.passat_tur_vorne_links": ["open_state_front_left_door", bin(open.door || "off", "door")],
    "binary_sensor.passat_fenster_vorne_links": ["state_front_left_door_window_lifter", bin(open.window || "off", "window")],
    "binary_sensor.passat_offen": ["open", bin(open.door === "on" || open.window === "on" ? "on" : "off", "opening")],
    ...extra,
  };
  return fakeHass({
    devices: { passat: { name: "Passat" } },
    entities: Object.fromEntries(Object.entries(ents).map(([id, [key]]) => [id, { device_id: "passat", platform, translation_key: key }])),
    states: Object.fromEntries(Object.entries(ents).map(([id, [, st]]) => [id, st])),
  });
};

/** A car from an integration that does have a tracker, the way HausPanel found them before. */
const classic = () =>
  fakeHass({
    devices: { id3: { name: "ID.3" } },
    entities: Object.fromEntries(["sensor.id3_reichweite", "sensor.id3_batteriestand", "device_tracker.id3", "lock.id3"]
      .map((id) => [id, { device_id: "id3", platform: "some_other" }])),
    states: {
      "sensor.id3_reichweite": km(310),
      "sensor.id3_batteriestand": pct(74),
      "device_tracker.id3": { state: "home", attributes: {} },
      "lock.id3": { state: "locked", attributes: {} },
    },
  });

test("a Volkswagen counts as a car although it has no device tracker", () => {
  const hass = vw();
  assert.deepEqual(carDevices(hass), ["passat"]);
  assert.equal(isVwCar(hass, "passat"), true);
  const s = carSlots(hass, "passat");
  assert.equal(s.battery, "sensor.passat_batterieladestand");
  assert.equal(s.fuel, "sensor.passat_tankfullstand");
  assert.equal(s.range, "sensor.passat_reichweite_gesamt");
  // The source gives the secondary engine the EV icon and the primary one the petrol pump.
  assert.equal(s.erange, "sensor.passat_reichweite_sekundar");
  assert.equal(s.frange, "sensor.passat_reichweite_primar");
  assert.equal(s.mileage, "sensor.passat_kilometerstand");
  assert.equal(s.tracker, undefined, "there is none, and that is fine");
  assert.equal(carText(hass, "passat").includes("62 %"), true);
});

test("the same entities from another integration are not read that way", () => {
  const hass = vw({ platform: "template" });
  assert.equal(isVwCar(hass, "passat"), false);
  // Without the platform nothing matches by translation key, and the German ids are no match either.
  assert.deepEqual(carDevices(hass), []);
});

test("doors, windows and locks come from the car's own contacts", () => {
  assert.deepEqual(carOpenings(vw(), "passat"), { open: [], locks: 1, unlocked: 0 });
  assert.deepEqual(carOpenings(vw({ open: { door: "on" } }), "passat"), { open: ["car_door"], locks: 1, unlocked: 0 });
  assert.deepEqual(carOpenings(vw({ open: { window: "on" } }), "passat"), { open: ["car_window"], locks: 1, unlocked: 0 });
  assert.deepEqual(carOpenings(vw({ open: { door: "on", window: "on" } }), "passat").open, ["car_door", "car_window"]);
  // device class lock: "on" means unlocked.
  assert.deepEqual(carOpenings(vw({ locked: "on" }), "passat"), { open: [], locks: 1, unlocked: 1 });
  // Diagnostic copies of the same door must not be counted a second time.
  const withDiag = vw({ open: { door: "on" } });
  withDiag.entities["binary_sensor.passat_tur_hinten_links"] = { entity_id: "binary_sensor.passat_tur_hinten_links", device_id: "passat", platform: "volkswagen_connect", translation_key: "locked_state_rear_left_door", entity_category: "diagnostic" };
  withDiag.states["binary_sensor.passat_tur_hinten_links"] = bin("on", "lock");
  assert.deepEqual(carOpenings(withDiag, "passat"), { open: ["car_door"], locks: 1, unlocked: 0 });
});

test("a charge time of 65535 is no time at all", () => {
  assert.equal(chargeMinutes("65535"), null, "Volkswagen's placeholder");
  assert.equal(chargeMinutes("invalid"), null);
  assert.equal(chargeMinutes("-5"), null);
  assert.equal(chargeMinutes("0"), null);
  assert.equal(chargeMinutes(undefined), null);
  assert.equal(chargeMinutes("45"), 45);
  assert.equal(chargeMinutes("90.5"), 90.5);
});

test("cars with a tracker are found exactly as before", () => {
  const hass = classic();
  assert.deepEqual(carDevices(hass), ["id3"]);
  const s = carSlots(hass, "id3");
  assert.equal(s.tracker, "device_tracker.id3");
  assert.equal(s.lock, "lock.id3");
  assert.equal(s.battery, "sensor.id3_batteriestand");
  // No platform of ours, so no translation keys are consulted.
  assert.equal(isVwCar(hass, "id3"), false);
});
