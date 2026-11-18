// Weather and civil-protection warnings behind a notice: what DWD and NINA put in their attributes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LIB, fakeHass } from "./fake.mjs";

const { warningInfo, warningLine, warningWhen } = await import(LIB + "warnings.js");

/** One DWD warning as the integration writes it into the sensor's attributes. */
const dwd = (i, w) => ({
  [`warning_${i}_name`]: w.name,
  [`warning_${i}_type`]: 22,
  [`warning_${i}_level`]: w.level,
  [`warning_${i}_headline`]: w.headline,
  [`warning_${i}_description`]: w.description,
  [`warning_${i}_instruction`]: w.instruction ?? null,
  [`warning_${i}_start`]: w.start ?? null,
  [`warning_${i}_end`]: w.end ?? null,
  [`warning_${i}_color`]: "#ffeb3b",
});

test("DWD: two warnings, the worst first, the rest counted", () => {
  const hass = fakeHass({
    states: {
      "sensor.current_warning_level": {
        state: "3",
        attributes: {
          region_name: "Stadt Köln", region_id: 105315000, warning_count: 2,
          ...dwd(1, {
            name: "FROST", level: 1, headline: "Amtliche WARNUNG vor FROST",
            description: "Es tritt leichter Frost auf.", instruction: "Vorsicht auf Brücken.",
            start: "2026-11-18T22:00:00+00:00", end: "2026-11-19T06:00:00+00:00",
          }),
          ...dwd(2, {
            name: "STURMBÖEN", level: 3, headline: "Amtliche UNWETTERWARNUNG vor STURMBÖEN",
            description: "Es treten Sturmböen mit Geschwindigkeiten um 85 km/h auf.",
            instruction: "Vorsicht vor herabfallenden Gegenständen.",
            start: "2026-11-18T12:00:00+00:00", end: "2026-11-18T18:00:00+00:00",
          }),
        },
      },
    },
    entities: { "sensor.current_warning_level": { platform: "dwd_weather_warnings" } },
  });
  const list = warningInfo(hass, "sensor.current_warning_level");
  assert.equal(list.length, 2);
  assert.deepEqual(list.map((w) => w.level), [3, 1]);
  assert.equal(list[0].headline, "Amtliche UNWETTERWARNUNG vor STURMBÖEN");
  assert.equal(list[0].instruction, "Vorsicht vor herabfallenden Gegenständen.");
  assert.match(list[0].text, /85 km\/h/);
  assert.equal(warningLine(list), "Amtliche UNWETTERWARNUNG vor STURMBÖEN +1");
  assert.equal(warningLine([list[1]]), "Amtliche WARNUNG vor FROST");
});

test("DWD: the whole warning in warning_1 is read too, and no warning gives an empty list", () => {
  const hass = fakeHass({
    states: {
      "sensor.advance_warning_level": {
        state: "2",
        attributes: {
          warning_count: 1,
          // Only the dictionary form, with the API's own names.
          warning_1: { event: "GLATTEIS", level: 2, headline: "Amtliche WARNUNG vor GLATTEIS", description: "Glatteisbildung.", instruction: null, start_time: null, end_time: "2026-11-19T09:00:00+00:00" },
        },
      },
      "sensor.quiet": { state: "0", attributes: { warning_count: 0 } },
    },
    entities: {
      "sensor.advance_warning_level": { platform: "dwd_weather_warnings" },
      "sensor.quiet": { platform: "dwd_weather_warnings" },
    },
  });
  assert.deepEqual(warningInfo(hass, "sensor.advance_warning_level"), [
    { headline: "Amtliche WARNUNG vor GLATTEIS", text: "Glatteisbildung.", instruction: "", from: "", to: "2026-11-19T09:00:00+00:00", level: 2 },
  ]);
  assert.deepEqual(warningInfo(hass, "sensor.quiet"), []);
  assert.equal(warningLine([]), "");
});

test("NINA: a warning that is on brings its text, one that is off brings nothing", () => {
  const attrs = {
    headline: "Warnung vor Starkregen", description: "Es wird ergiebiger Dauerregen erwartet.",
    sender: "Deutscher Wetterdienst", severity: "Severe", recommended_actions: "Meiden Sie Keller und Tiefgaragen.",
    affected_areas: "Stadt Köln", web: "https://www.wettergefahren.de", id: "dwd.TEST",
    sent: "2026-11-18T06:00:00+00:00", start: "2026-11-18T08:00:00+00:00", expires: "2026-11-18T20:00:00+00:00",
  };
  const hass = fakeHass({
    states: {
      "binary_sensor.koln_warning_1": { state: "on", attributes: attrs },
      "binary_sensor.koln_warning_2": { state: "off", attributes: {} },
    },
    entities: {
      "binary_sensor.koln_warning_1": { platform: "nina", translation_key: "warning" },
      "binary_sensor.koln_warning_2": { platform: "nina", translation_key: "warning" },
    },
  });
  assert.deepEqual(warningInfo(hass, "binary_sensor.koln_warning_1"), [
    {
      headline: "Warnung vor Starkregen", text: "Es wird ergiebiger Dauerregen erwartet.",
      instruction: "Meiden Sie Keller und Tiefgaragen.", from: "2026-11-18T08:00:00+00:00",
      to: "2026-11-18T20:00:00+00:00", level: 3,
    },
  ]);
  assert.deepEqual(warningInfo(hass, "binary_sensor.koln_warning_2"), []);
});

test("NINA from 2026.11 on: the details come from the sensors of the same slot", () => {
  const hass = fakeHass({
    states: {
      // Since 2026.11 the binary sensor only carries the id; headline and times are sensors of their own.
      "binary_sensor.koln_warning_1": { state: "on", attributes: { id: "dwd.TEST" } },
      "sensor.koln_headline_1": "Warnung vor Orkanböen",
      "sensor.koln_severity_1": "extreme",
      "sensor.koln_start_1": "2026-11-18T14:00:00+00:00",
      "sensor.koln_expires_1": "2026-11-18T23:00:00+00:00",
      // Another slot on the same device must not leak into this one.
      "binary_sensor.koln_warning_2": { state: "on", attributes: { id: "dwd.OTHER" } },
      "sensor.koln_headline_2": "Warnung vor Glatteis",
      "sensor.koln_severity_2": "minor",
      "sensor.koln_start_2": "unavailable",
      "sensor.koln_expires_2": "unknown",
    },
    devices: { koln: { area_id: null } },
    entities: {
      "binary_sensor.koln_warning_1": { platform: "nina", translation_key: "warning", device_id: "koln" },
      "binary_sensor.koln_warning_2": { platform: "nina", translation_key: "warning", device_id: "koln" },
      "sensor.koln_headline_1": { platform: "nina", translation_key: "headline", device_id: "koln" },
      "sensor.koln_severity_1": { platform: "nina", translation_key: "severity", device_id: "koln" },
      "sensor.koln_start_1": { platform: "nina", translation_key: "start", device_id: "koln" },
      "sensor.koln_expires_1": { platform: "nina", translation_key: "expires", device_id: "koln" },
      "sensor.koln_headline_2": { platform: "nina", translation_key: "headline", device_id: "koln" },
      "sensor.koln_severity_2": { platform: "nina", translation_key: "severity", device_id: "koln" },
      "sensor.koln_start_2": { platform: "nina", translation_key: "start", device_id: "koln" },
      "sensor.koln_expires_2": { platform: "nina", translation_key: "expires", device_id: "koln" },
    },
  });
  assert.deepEqual(warningInfo(hass, "binary_sensor.koln_warning_1"), [
    {
      headline: "Warnung vor Orkanböen", text: "", instruction: "",
      from: "2026-11-18T14:00:00+00:00", to: "2026-11-18T23:00:00+00:00", level: 4,
    },
  ]);
  // The second slot has no times to show, so they stay empty instead of taking the first slot's.
  const second = warningInfo(hass, "binary_sensor.koln_warning_2");
  assert.deepEqual([second[0].headline, second[0].from, second[0].to, second[0].level], ["Warnung vor Glatteis", "", "", 1]);
});

test("anything that is not DWD or NINA gives null", () => {
  const hass = fakeHass({
    states: { "sensor.pollen": "2", "binary_sensor.plain": "on" },
    entities: { "sensor.pollen": { platform: "dwd_pollenflug" } },
  });
  assert.equal(warningInfo(hass, "sensor.pollen"), null);
  // No registry entry at all: the platform is unknown, so nothing is read from the attributes.
  assert.equal(warningInfo(hass, "binary_sensor.plain"), null);
  assert.equal(warningInfo(hass, "sensor.gone"), null);
});

test("when a warning applies: a range, or just the end, with the date when it is not today", () => {
  const hass = fakeHass({});
  const now = new Date(2026, 10, 18, 9, 0);
  const sameDay = (h) => new Date(2026, 10, 18, h, 0).toISOString();
  assert.equal(warningWhen(hass, { from: sameDay(12), to: sameDay(18) }, now), "12:00 – 18:00");
  assert.equal(warningWhen(hass, { from: "", to: sameDay(18) }, now), "until 18:00");
  assert.equal(warningWhen(hass, { from: sameDay(12), to: "" }, now), "12:00");
  assert.equal(warningWhen(hass, { from: "", to: "" }, now), "");
  // Tomorrow morning, so the date belongs in it.
  assert.match(warningWhen(hass, { from: "", to: new Date(2026, 10, 19, 6, 0).toISOString() }, now), /^until .*19.*06:00$/);
});
