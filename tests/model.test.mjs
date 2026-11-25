// Rooms: which device lands in which room, floors, hiding and the room temperature.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LIB, fakeHass } from "./fake.mjs";

const { buildModel, hideMatcher } = await import(LIB + "model.js");

const house = () => fakeHass({
  floors: { ground: { floor_id: "ground", name: "Ground floor", level: 0 }, upper: { floor_id: "upper", name: "Upper floor", level: 1 } },
  areas: {
    kitchen: { area_id: "kitchen", name: "Kitchen", floor_id: "ground" },
    bedroom: { area_id: "bedroom", name: "Bedroom", floor_id: "upper" },
    attic: { area_id: "attic", name: "Attic", floor_id: "upper" },
  },
  devices: {
    d_lamp: { id: "d_lamp", area_id: "kitchen", name: "Ceiling lamp" },
    d_shade: { id: "d_shade", area_id: "bedroom", name: "Shade" },
  },
  entities: {
    "light.ceiling": { entity_id: "light.ceiling", device_id: "d_lamp", platform: "hue" },
    "light.bed_lamp": { entity_id: "light.bed_lamp", area_id: "bedroom", device_id: "d_lamp", platform: "hue" },
    "cover.bedroom_shade": { entity_id: "cover.bedroom_shade", device_id: "d_shade", platform: "shelly" },
    "light.loose": { entity_id: "light.loose", platform: "hue" },
    "switch.diagnostic": { entity_id: "switch.diagnostic", device_id: "d_lamp", platform: "hue", entity_category: "config" },
    "switch.secret": { entity_id: "switch.secret", device_id: "d_lamp", platform: "hue", hidden: true },
    "sensor.kitchen_temp": { entity_id: "sensor.kitchen_temp", area_id: "kitchen", platform: "zha" },
    "scene.kitchen_evening": { entity_id: "scene.kitchen_evening", area_id: "kitchen", platform: "homeassistant" },
  },
  states: {
    "light.ceiling": "on",
    "light.bed_lamp": "off",
    "cover.bedroom_shade": { state: "open", attributes: { current_position: 40 } },
    "light.loose": "off",
    "switch.diagnostic": "off",
    "switch.secret": "off",
    "sensor.kitchen_temp": { state: "21.5", attributes: { device_class: "temperature", unit_of_measurement: "°C" } },
    "scene.kitchen_evening": "unknown",
  },
});

test("a device's area puts it in that room", () => {
  const m = buildModel(house(), {});
  assert.deepEqual(m.areaById.get("kitchen").tiles, ["light.ceiling"]);
  assert.equal(m.areaOf["light.ceiling"], "kitchen");
});

test("an entity's own area wins over its device's area", () => {
  const m = buildModel(house(), {});
  assert.equal(m.areaOf["light.bed_lamp"], "bedroom");
  assert.ok(m.areaById.get("bedroom").tiles.includes("light.bed_lamp"));
});

test("devices without an area land in Other", () => {
  const m = buildModel(house(), {});
  assert.equal(m.areaOf["light.loose"], "_other");
  assert.ok(m.unassigned.tiles.includes("light.loose"));
});

test("hidden and configuration entities stay out", () => {
  const m = buildModel(house(), {});
  assert.equal(m.areaOf["switch.diagnostic"], undefined, "entity_category config");
  assert.equal(m.areaOf["switch.secret"], undefined, "hidden in Home Assistant");
});

test("rooms are sorted by floor, then by name", () => {
  const m = buildModel(house(), {});
  assert.deepEqual(m.areas.map((a) => a.id), ["kitchen", "attic", "bedroom"]);
  assert.equal(m.areaById.get("bedroom").floor.name, "Upper floor");
});

test("scenes and the room temperature belong to their room", () => {
  const m = buildModel(house(), {});
  const k = m.areaById.get("kitchen");
  assert.deepEqual(k.scenes, ["scene.kitchen_evening"]);
  assert.equal(k.temperature, "sensor.kitchen_temp");
  assert.ok(!k.tiles.includes("sensor.kitchen_temp"), "a sensor is no tile");
});

test("Settings → Hiding: one by one, by type, by integration, by text", () => {
  const hass = house();
  const byEntity = buildModel(hass, { entities: ["light.ceiling"] });
  assert.equal(byEntity.areaOf["light.ceiling"], undefined);
  const byDomain = buildModel(hass, { domains: ["light"] });
  assert.equal(byDomain.lights.length, 0);
  assert.ok(byDomain.areaById.get("bedroom").tiles.includes("cover.bedroom_shade"));
  const byPlatform = buildModel(hass, { platforms: ["shelly"] });
  assert.equal(byPlatform.areaOf["cover.bedroom_shade"], undefined);
  const byText = buildModel(hass, { patterns: ["bed"] });
  assert.equal(byText.areaOf["light.bed_lamp"], undefined);
  assert.equal(byText.areaOf["light.ceiling"], "kitchen");
});

test("text rules: plain text is contained, * is a wildcard over the whole id or name", () => {
  const hass = fakeHass({ states: { "sensor.phone_battery": "80", "sensor.battery_room": "20", "light.desk": "on" } });
  const plain = hideMatcher(hass, { patterns: ["battery"] });
  assert.equal(plain("sensor.phone_battery"), "pattern");
  assert.equal(plain("sensor.battery_room"), "pattern");
  const wild = hideMatcher(hass, { patterns: ["*_battery"] });
  assert.equal(wild("sensor.phone_battery"), "pattern");
  assert.equal(wild("sensor.battery_room"), "", "*_battery needs battery at the end");
  assert.equal(wild("light.desk"), "");
  assert.equal(hideMatcher(hass, { patterns: ["  "] })("light.desk"), "", "an empty rule hides nothing");
});

test("Browser Mod (the browsers themselves) stays out of rooms and security", () => {
  const hass = fakeHass({
    areas: { office: { area_id: "office", name: "Office" } },
    entities: {
      "light.browser_mod_abc_screen": { area_id: "office", platform: "browser_mod" },
      "camera.browser_mod_abc": { area_id: "office", platform: "browser_mod" },
      "light.desk": { area_id: "office", platform: "hue" },
    },
    states: { "light.browser_mod_abc_screen": "unavailable", "camera.browser_mod_abc": "unavailable", "light.desk": "on" },
  });
  const m = buildModel(hass, {});
  assert.deepEqual(m.areaById.get("office").tiles, ["light.desk"]);
  assert.ok(!m.security.includes("camera.browser_mod_abc"));
});

test("a warning service (NINA) is no detector of the house, a real safety sensor is", () => {
  const hass = fakeHass({
    areas: { office: { area_id: "office", name: "Office" } },
    entities: {
      "binary_sensor.nina_warning_1": { entity_id: "binary_sensor.nina_warning_1", area_id: "office", platform: "nina" },
      "binary_sensor.cellar_safety": { entity_id: "binary_sensor.cellar_safety", area_id: "office", platform: "zha" },
    },
    states: {
      "binary_sensor.nina_warning_1": { state: "on", attributes: { device_class: "safety" } },
      "binary_sensor.cellar_safety": { state: "on", attributes: { device_class: "safety" } },
    },
  });
  const m = buildModel(hass, {});
  assert.ok(!m.security.includes("binary_sensor.nina_warning_1"), "a NINA warning raises no detector alarm");
  assert.ok(m.security.includes("binary_sensor.cellar_safety"), "a real safety sensor still counts");
  // It stays a sensor of its room, so it can be added by hand and works as a notice.
  assert.ok(m.areaById.get("office").sensors.includes("binary_sensor.nina_warning_1"));
  assert.equal(m.areaOf["binary_sensor.nina_warning_1"], "office");
});

test("presence: occupancy sensors count, a motion sensor in the same room is left out", async () => {
  const { roomPresence } = await import(LIB + "model.js");
  const area = (ids) => ({ all: ids });
  const hass = fakeHass({ states: {
    "binary_sensor.office_presence": { state: "on", last_changed: "2026-11-09T16:00:00Z", attributes: { device_class: "occupancy" } },
    "binary_sensor.office_motion": { state: "off", last_changed: "2026-11-09T16:10:00Z", attributes: { device_class: "motion" } },
    "binary_sensor.hall_motion": { state: "off", last_changed: "2026-11-09T15:00:00Z", attributes: { device_class: "motion" } },
    "binary_sensor.attic_presence": { state: "unavailable", attributes: { device_class: "presence" } },
    "binary_sensor.attic_motion": { state: "on", attributes: { device_class: "motion" } },
  } });
  const office = roomPresence(hass, area(["binary_sensor.office_presence", "binary_sensor.office_motion"]));
  assert.equal(office.on, true, "presence says someone is there, the dropped-off motion sensor doesn't count");
  assert.deepEqual(office.ids, ["binary_sensor.office_presence"]);
  assert.equal(roomPresence(hass, area(["binary_sensor.hall_motion"])).on, false, "motion only where there is no presence sensor");
  assert.equal(roomPresence(hass, area(["binary_sensor.attic_presence", "binary_sensor.attic_motion"])), null, "an unavailable presence sensor still rules out motion");
  assert.equal(roomPresence(hass, area([])), null, "no sensor, nothing to say");
});

test("Music Assistant: a player without a room joins its twin's room and stands for it there", () => {
  const hass = fakeHass({
    areas: { office: { area_id: "office", name: "Office" } },
    devices: { ma1: { id: "ma1", name: "Desk Speaker" }, at1: { id: "at1", name: "Desk Speaker", area_id: "office" }, ma2: { id: "ma2", name: "Office TV" }, at2: { id: "at2", name: "Office TV", area_id: "office" } },
    entities: {
      "media_player.desk_speaker": { device_id: "ma1", platform: "music_assistant" },
      "media_player.desk_speaker_2": { device_id: "at1", platform: "apple_tv" },
      "media_player.office_tv_ma": { device_id: "ma2", platform: "music_assistant" },
      "media_player.apple_tv_office": { device_id: "at2", platform: "apple_tv" },
    },
    states: {
      "media_player.desk_speaker": { state: "playing", attributes: { friendly_name: "Desk Speaker" } },
      "media_player.desk_speaker_2": { state: "idle", attributes: { friendly_name: "Desk Speaker" } },
      "media_player.office_tv_ma": { state: "unavailable", attributes: { friendly_name: "Office TV" } },
      "media_player.apple_tv_office": { state: "off", attributes: { friendly_name: "Apple TV Office" } },
    },
  });
  const m = buildModel(hass, {});
  const office = m.areaById.get("office").tiles;
  assert.equal(m.areaOf["media_player.desk_speaker"], "office", "same name");
  assert.ok(office.includes("media_player.desk_speaker"));
  assert.ok(!office.includes("media_player.desk_speaker_2"), "the twin of the same name steps back");
  assert.equal(m.areaOf["media_player.office_tv_ma"], undefined, "unreachable: left out");
  assert.ok(office.includes("media_player.apple_tv_office"), "a twin with another name, and an unavailable MA player, keep the original");
  assert.ok(!m.unassigned.tiles.some((id) => id.includes("desk_speaker")), "nothing left under Other");
  assert.ok(m.media.includes("media_player.desk_speaker") && !m.media.includes("media_player.desk_speaker_2"), "the Media page lists each speaker once");
});

test("Music Assistant: a player with no twin and no room gets no tile and is not listed under media", () => {
  const hass = fakeHass({
    devices: { ma: { id: "ma", name: "Receiver" } },
    entities: { "media_player.receiver_ma": { device_id: "ma", platform: "music_assistant" } },
    states: { "media_player.receiver_ma": { state: "playing", attributes: { friendly_name: "Receiver" } } },
  });
  const m = buildModel(hass, {});
  assert.ok(!m.unassigned.tiles.includes("media_player.receiver_ma"));
  assert.ok(!m.media.includes("media_player.receiver_ma"), "the Media page shows what the rooms show");
});

test("an unreachable media player gets no tile, one that is just off does", () => {
  const hass = fakeHass({
    areas: { living: { area_id: "living", name: "Living" } },
    entities: { "media_player.tv": { area_id: "living" }, "media_player.speaker": { area_id: "living" } },
    states: { "media_player.tv": "off", "media_player.speaker": "unavailable" },
  });
  const m = buildModel(hass, {});
  assert.deepEqual(m.areaById.get("living").tiles, ["media_player.tv"]);
});

test("Music Assistant: the same device name also finds the twin's room", () => {
  const hass = fakeHass({
    areas: { office: { area_id: "office", name: "Office" } },
    devices: { ma: { id: "ma", name: "Office TV" }, at: { id: "at", name: "Office TV", area_id: "office" } },
    entities: { "media_player.office_tv_ma": { device_id: "ma", platform: "music_assistant" }, "media_player.apple_tv_office": { device_id: "at", platform: "apple_tv" } },
    states: { "media_player.office_tv_ma": { state: "idle", attributes: { friendly_name: "Living TV" } }, "media_player.apple_tv_office": { state: "off", attributes: { friendly_name: "Apple TV Office" } } },
  });
  const m = buildModel(hass, {});
  assert.equal(m.areaOf["media_player.office_tv_ma"], "office");
  assert.ok(m.areaById.get("office").tiles.includes("media_player.apple_tv_office"), "another name: the original stays too");
});

test("presence: a car's 'moving' sensor in the garage is no one in the room", async () => {
  const { roomPresence } = await import(LIB + "model.js");
  const hass = fakeHass({
    entities: { "binary_sensor.car_moving": { device_id: "car" }, "device_tracker.car": { device_id: "car" } },
    states: { "binary_sensor.car_moving": { state: "on", attributes: { device_class: "motion" } }, "device_tracker.car": "home" },
  });
  assert.equal(roomPresence(hass, { all: ["binary_sensor.car_moving"] }), null);
});

test("a room with only a thermometer still shows, an empty one doesn't", async () => {
  const { roomHasContent } = await import(LIB + "model.js");
  const hass = house();
  hass.areas.cellar = { area_id: "cellar", name: "Cellar" };
  hass.entities["sensor.cellar_temp"] = { entity_id: "sensor.cellar_temp", area_id: "cellar", platform: "zha" };
  hass.states["sensor.cellar_temp"] = { entity_id: "sensor.cellar_temp", state: "12.5", attributes: { device_class: "temperature", unit_of_measurement: "°C", friendly_name: "Cellar temperature" } };
  const m = buildModel(hass, {});
  assert.equal(roomHasContent(m.areaById.get("cellar")), true, "only a thermometer");
  assert.equal(roomHasContent(m.areaById.get("attic")), false, "nothing at all");
  assert.equal(roomHasContent(m.areaById.get("kitchen")), true);
});

test("a room with only a door contact shows too", async () => {
  const { roomHasContent } = await import(LIB + "model.js");
  const hass = house();
  hass.areas.shed = { area_id: "shed", name: "Shed" };
  hass.entities["binary_sensor.shed_door"] = { entity_id: "binary_sensor.shed_door", area_id: "shed", platform: "zha" };
  hass.states["binary_sensor.shed_door"] = { entity_id: "binary_sensor.shed_door", state: "off", attributes: { device_class: "door", friendly_name: "Shed door" } };
  hass.entities["sensor.shed_battery"] = { entity_id: "sensor.shed_battery", area_id: "garage_x", platform: "zha", entity_category: "diagnostic" };
  const m = buildModel(hass, {});
  assert.equal(roomHasContent(m.areaById.get("shed")), true);
});

test("the room's own name doesn't rule out its thermometer; a winter garden is indoors", () => {
  const hass = house();
  const add = (area, name, id, temp, fname) => {
    hass.areas[area] = { area_id: area, name };
    hass.entities[id] = { entity_id: id, area_id: area, platform: "zha" };
    hass.states[id] = { entity_id: id, state: temp, attributes: { device_class: "temperature", unit_of_measurement: "°C", friendly_name: fname } };
  };
  add("dachboden", "Dachboden", "sensor.dachboden_temperatur", "6.0", "Dachboden Temperatur");
  add("wintergarten", "Wintergarten", "sensor.wintergarten_temperatur", "18.2", "Wintergarten Temperatur");
  add("aussen", "Außen", "sensor.aussen_temperatur", "3.2", "Außen Temperatur");
  add("bad", "Bad", "sensor.bad_fussboden", "24", "Bad Fußboden");
  const m = buildModel(hass, {});
  assert.equal(m.areaById.get("dachboden").temperature, "sensor.dachboden_temperatur");
  assert.equal(m.areaById.get("wintergarten").temperature, "sensor.wintergarten_temperatur");
  assert.equal(m.areaById.get("aussen").temperature, "sensor.aussen_temperatur", "outside keeps its own sensor");
  assert.equal(m.areaById.get("bad").temperature, null, "a floor heating sensor is still no air");
});

// A relay or an energy meter also measures how warm it is itself. In a fuse box that is around 45°,
// which is plausible for an attic in summer, so only the registry tells them apart (#25).
const meterHouse = () => {
  const hass = house();
  const dev = (id, area, name) => (hass.devices[id] = { id, area_id: area, name });
  const ent = (id, device, extra = {}) => {
    hass.entities[id] = { entity_id: id, device_id: device, platform: "shelly" };
    hass.states[id] = { entity_id: id, state: extra.state ?? "45", attributes: { device_class: extra.dc || "temperature", unit_of_measurement: extra.unit || "°C" } };
  };
  hass.areas.cellar = { area_id: "cellar", name: "Cellar" };
  hass.areas.hall = { area_id: "hall", name: "Hall" };
  // Kitchen: a plug that measures power, next to the room's own thermometer.
  dev("d_plug", "kitchen", "Kitchen plug");
  ent("sensor.kitchen_plug_power", "d_plug", { dc: "power", state: "12", unit: "W" });
  ent("sensor.kitchen_plug_temp", "d_plug");
  // Cellar: nothing but the fuse box relay.
  dev("d_fuse", "cellar", "Fuse box relay");
  ent("sensor.fuse_power", "d_fuse", { dc: "power", state: "340", unit: "W" });
  ent("sensor.fuse_temp", "d_fuse");
  // Hall: the same relay, but a thermostat that knows better.
  dev("d_fuse2", "hall", "Hall relay");
  ent("sensor.hall_relay_power", "d_fuse2", { dc: "power", state: "80", unit: "W" });
  ent("sensor.hall_relay_temp", "d_fuse2");
  hass.entities["climate.hall"] = { entity_id: "climate.hall", area_id: "hall", platform: "tado" };
  hass.states["climate.hall"] = { entity_id: "climate.hall", state: "heat", attributes: { current_temperature: 21, temperature: 22 } };
  // Attic: a normal sensor on a device that measures nothing else.
  dev("d_zig", "attic", "Attic sensor");
  ent("sensor.attic_temp", "d_zig");
  ent("sensor.attic_battery", "d_zig", { dc: "battery", state: "80", unit: "%" });
  return hass;
};

test("a relay's own temperature is the room's only as a last resort (#25)", () => {
  const m = buildModel(meterHouse(), {});
  assert.equal(m.areaById.get("kitchen").temperature, "sensor.kitchen_temp", "the room's own sensor wins");
  assert.equal(m.areaById.get("cellar").temperature, "sensor.fuse_temp", "nothing else, so better than no temperature");
  assert.equal(m.areaById.get("hall").temperature, null, "a thermostat in the room knows better");
  assert.equal(m.areaById.get("attic").temperature, "sensor.attic_temp", "a device that measures no power is no meter");
});

test("the temperature picked in Home Assistant's area settings always wins", () => {
  const hass = meterHouse();
  hass.areas.hall.temperature_entity_id = "sensor.hall_relay_temp";
  hass.areas.kitchen.temperature_entity_id = "sensor.kitchen_plug_temp";
  const m = buildModel(hass, {});
  assert.equal(m.areaById.get("hall").temperature, "sensor.hall_relay_temp");
  assert.equal(m.areaById.get("kitchen").temperature, "sensor.kitchen_plug_temp");
});

test("a room card falls back to the thermostat when it has no thermometer of its own", async () => {
  const { roomTempNum } = await import(LIB + "layouts.js");
  const hass = meterHouse();
  const m = buildModel(hass, {});
  assert.equal(roomTempNum(hass, m.areaById.get("kitchen")), 21.5, "its own sensor");
  assert.equal(roomTempNum(hass, m.areaById.get("hall")), 21, "no sensor, so the thermostat");
  assert.equal(roomTempNum(hass, m.areaById.get("bedroom")), null, "neither");
});

test("a light group stays out of the room, but is there to be added by hand (#13)", () => {
  const hass = house();
  hass.entities["light.kitchen_all"] = { entity_id: "light.kitchen_all", area_id: "kitchen", platform: "group" };
  hass.states["light.kitchen_all"] = { entity_id: "light.kitchen_all", state: "on", attributes: { friendly_name: "Kitchen lights", entity_id: ["light.ceiling"] } };
  const m = buildModel(hass, {});
  const kitchen = m.areaById.get("kitchen");
  assert.deepEqual(kitchen.groups, ["light.kitchen_all"]);
  assert.equal(kitchen.tiles.includes("light.kitchen_all"), false, "no tile of its own");
  assert.equal(kitchen.all.includes("light.kitchen_all"), false);
  assert.equal(m.all.includes("light.kitchen_all"), false);
  assert.equal(m.lights.includes("light.kitchen_all"), false, "the Light chip keeps the single lamps");
  assert.equal(m.areaOf["light.kitchen_all"], "kitchen", "it knows its room");
  assert.equal(kitchen.tiles.includes("light.ceiling"), true, "the lamp itself is still there");
});

test("a group without a registry entry waits under Other; an all-off script stays out for good", () => {
  const hass = house();
  // No unique_id, so no registry entry (a YAML group): its list of members makes it one.
  hass.states["cover.all_shades"] = { entity_id: "cover.all_shades", state: "open", attributes: { friendly_name: "All shades", entity_id: ["cover.bedroom_shade"] } };
  hass.entities["script.all_lights_off"] = { entity_id: "script.all_lights_off", area_id: "kitchen", platform: "script" };
  hass.states["script.all_lights_off"] = { entity_id: "script.all_lights_off", state: "off", attributes: { friendly_name: "Turn off all lights" } };
  const m = buildModel(hass, {});
  assert.deepEqual(m.unassigned.groups, ["cover.all_shades"]);
  assert.equal(m.unassigned.tiles.includes("cover.all_shades"), false);
  const kitchen = m.areaById.get("kitchen");
  assert.equal(kitchen.groups.includes("script.all_lights_off"), false, "an all-off script is no group to add");
  assert.equal(kitchen.tiles.includes("script.all_lights_off"), false);
});

test("a room that holds nothing but a group helper shows up with it", async () => {
  const { roomHasContent } = await import(LIB + "model.js");
  const group = (hass, areaId, members) => {
    hass.entities["light.attic_all"] = { entity_id: "light.attic_all", area_id: areaId, platform: "group" };
    hass.states["light.attic_all"] = { entity_id: "light.attic_all", state: "on", attributes: { friendly_name: "Attic lights", entity_id: members } };
    return buildModel(hass, {});
  };
  // Its lamps sit in another room and in none: nothing here stands for the group, so it is the tile.
  const m = group(house(), "attic", ["light.ceiling", "light.loose"]);
  const attic = m.areaById.get("attic");
  assert.deepEqual(attic.tiles, ["light.attic_all"]);
  assert.equal(roomHasContent(attic), true, "the room is worth showing now");
  // Still not among the real lights or devices: the Light chip, All off, Leaving home and the floor
  // buttons keep counting the real lamps, wherever they sit.
  assert.equal(m.lights.includes("light.attic_all"), false);
  assert.equal(m.all.includes("light.attic_all"), false);
  assert.equal(attic.all.includes("light.attic_all"), false);
  // It stays listed as a group, so the add dialog can still offer it once after someone hides it.
  assert.deepEqual(attic.groups, ["light.attic_all"]);

  // A lamp of the group that is hidden in this room counts as not shown, so the group comes along
  // (gionnidepp's case in #33: he helped himself by making those single lamps visible again).
  const withHidden = house();
  withHidden.entities["light.attic_lamp"] = { entity_id: "light.attic_lamp", area_id: "attic", platform: "hue", hidden: true };
  withHidden.states["light.attic_lamp"] = "on";
  const hid = group(withHidden, "attic", ["light.attic_lamp"]);
  assert.deepEqual(hid.areaById.get("attic").tiles, ["light.attic_all"]);
});

test("a group stays out while one of its own lamps is in the same room", async () => {
  const hass = house();
  hass.entities["light.kitchen_all"] = { entity_id: "light.kitchen_all", area_id: "kitchen", platform: "group" };
  hass.states["light.kitchen_all"] = { entity_id: "light.kitchen_all", state: "on", attributes: { friendly_name: "Kitchen lights", entity_id: ["light.ceiling"] } };
  const kitchen = buildModel(hass, {}).areaById.get("kitchen");
  assert.deepEqual(kitchen.groups, ["light.kitchen_all"], "it waits to be added by hand, as since 1.9.0");
  assert.equal(kitchen.tiles.includes("light.kitchen_all"), false);
  assert.equal(kitchen.tiles.includes("light.ceiling"), true);
});

test("a group counts as one device, but not next to its own members", async () => {
  const { dedupeGroups } = await import(LIB + "model.js");
  const hass = house();
  hass.entities["light.kitchen_all"] = { entity_id: "light.kitchen_all", area_id: "kitchen", platform: "group" };
  hass.states["light.kitchen_all"] = { entity_id: "light.kitchen_all", state: "on", attributes: { friendly_name: "Kitchen lights", entity_id: ["light.ceiling", "light.bed_lamp"] } };
  assert.deepEqual(dedupeGroups(hass, ["light.kitchen_all", "light.ceiling"]), ["light.ceiling"], "the lamp counts, the group does not");
  assert.deepEqual(dedupeGroups(hass, ["light.kitchen_all"]), ["light.kitchen_all"], "every member hidden: the group is the one device");
  assert.deepEqual(dedupeGroups(hass, ["light.ceiling", "light.loose"]), ["light.ceiling", "light.loose"], "plain lamps are never dropped");
  assert.deepEqual(dedupeGroups(hass, []), []);
});

test("people in the header: hidden in Home Assistant means hidden here", async () => {
  const { visiblePersons } = await import(LIB + "model.js");
  const hass = fakeHass({
    entities: {
      "person.alex": { platform: "person" },
      "person.tablet": { platform: "person", hidden: true },
    },
    states: { "person.alex": "home", "person.tablet": "not_home", "person.guest": "home", "light.ceiling": "on" },
  });
  // person.guest has no registry entry at all and stays, like a lamp from YAML would.
  assert.deepEqual(visiblePersons(hass), ["person.alex", "person.guest"], "the hidden one is gone, no lamp sneaks in");
});

test("people in the header: sorted, and a hidden one takes no slot", async () => {
  const { visiblePersons } = await import(LIB + "model.js");
  const names = ["a", "b", "c", "d", "e", "f"];
  const hass = fakeHass({
    entities: Object.fromEntries(names.map((n) => ["person." + n, { platform: "person" }])),
    states: Object.fromEntries(names.map((n) => ["person." + n, "home"])),
  });
  assert.deepEqual(visiblePersons(hass), ["person.a", "person.b", "person.c", "person.d", "person.e"], "sorted, five at most");
  hass.entities["person.b"].hidden = true;
  assert.deepEqual(visiblePersons(hass), ["person.a", "person.c", "person.d", "person.e", "person.f"], "the sixth moves up");
});

test("people in the header: nobody there is no people", async () => {
  const { visiblePersons } = await import(LIB + "model.js");
  assert.deepEqual(visiblePersons(fakeHass({ states: { "light.ceiling": "on" } })), []);
});

test("outdoor rooms: a winter garden stays indoors, a garden in winter does not", async () => {
  const { isOutdoorRoom } = await import(LIB + "model.js");
  const room = (name, floor) => isOutdoorRoom({ name, floor: floor ? { name: floor } : undefined });

  assert.equal(room("Garten"), true, "garden");
  assert.equal(room("Terrasse"), true, "terrace");
  assert.equal(room("Carport"), true, "carport");
  assert.equal(room("Wohnzimmer"), false, "living room");

  // Only the word "winter" right in front turns the garden into a room.
  assert.equal(room("Wintergarten"), false, "winter garden");
  assert.equal(room("Winter Garten"), false, "winter garden, written apart");
  assert.equal(room("Winter-Garden"), false, "winter garden, English and hyphenated");
  assert.equal(room("Garten im Winter"), true, "a garden that merely mentions winter");
  assert.equal(room("Wintergarten Terrasse"), true, "its terrace is outdoors all the same");

  // The floor counts as well.
  assert.equal(room("Sitzecke", "Garten"), true, "a corner on the garden floor");
  assert.equal(room("Sitzecke", "Wintergarten"), false, "a corner in the winter garden");
});

test("a room's folder in the favourites picker lists its groups and what was added by hand (#40)", async () => {
  const { favRoomDevices } = await import(LIB + "layouts.js");
  const { Settings } = await import(LIB + "store.js");
  const hass = house();
  hass.entities["light.kitchen_all"] = { entity_id: "light.kitchen_all", area_id: "kitchen", platform: "group" };
  hass.states["light.kitchen_all"] = { entity_id: "light.kitchen_all", state: "on", attributes: { friendly_name: "Kitchen lights", entity_id: ["light.ceiling"] } };
  const model = buildModel(hass, {});
  const settings = new Settings(() => {});
  const ctx = { hass, model, settings };
  const kitchen = model.areaById.get("kitchen");
  // The group's own lamp is in the room, so the group is no tile; the picker still offers it, once.
  const devs = favRoomDevices(ctx, kitchen);
  assert.equal(devs.includes("light.ceiling"), true);
  assert.equal(devs.filter((k) => k === "light.kitchen_all").length, 1, "the group is there, once");
  assert.equal(new Set(devs).size, devs.length, "nothing twice");
  // A device added to the room by hand comes along; the room's separators don't.
  settings.s.containers["room:kitchen"] = { order: [], hidden: [], added: ["light.loose", "light.kitchen_all"], seps: { "sep:1": "" } };
  const more = favRoomDevices(ctx, kitchen);
  assert.equal(more.includes("light.loose"), true, "added by hand");
  assert.equal(more.filter((k) => k === "light.kitchen_all").length, 1, "added by hand and a group: still once");
  assert.equal(more.some((k) => k.startsWith("sep:")), false);
  // Hidden in the room: out of the picker too, the group as well.
  settings.s.containers["room:kitchen"] = { order: [], hidden: ["light.ceiling", "light.kitchen_all"], added: [], seps: {} };
  assert.deepEqual(favRoomDevices(ctx, kitchen).filter((k) => k.startsWith("light.")), []);
});

test("Rooms tab follows the room order on Home until it has its own (A61)", async () => {
  const { byHomeOrder } = await import(LIB + "layouts.js");
  const { Settings } = await import(LIB + "store.js");
  const auto = ["hall", "kitchen", "living", "office", "garden"];
  const home = ["card:today", "room:living", "sep:1", "room:hall", "card:security", "room:kitchen", "room:gone"];
  // Home order taken; rooms without a place on Home go to the end in their own order.
  assert.deepEqual(byHomeOrder(auto, home), ["living", "hall", "kitchen", "office", "garden"]);
  // No Home order: unchanged.
  assert.deepEqual(byHomeOrder(auto, []), auto);
  assert.deepEqual(byHomeOrder(auto, undefined), auto);
  // Through arrange: an own Rooms order beats it.
  const settings = new Settings(() => {});
  settings.s.containers.home = { order: home, hidden: [], added: [], seps: {} };
  const sort = (ids) => byHomeOrder(ids, settings.cont("home").order);
  assert.deepEqual(settings.arrange("rooms", auto, undefined, sort).items, ["living", "hall", "kitchen", "office", "garden"]);
  settings.s.containers.rooms = { order: ["office", "kitchen"], hidden: ["garden"], added: [], seps: {} };
  assert.deepEqual(settings.arrange("rooms", auto, undefined, sort).items, ["office", "kitchen", "hall", "living"]);
});
