// Car popup: the car's picture, battery ring and fuel gauge with range, charging, doors and windows,
// where it is, mileage and service, last trip, and pre-heating.
import { h, icon } from "./util.js";
import { openMoreInfo } from "./domains.js";
import { openSheet } from "./dialogs.js";
import { t } from "./i18n.js";
import { num, live, slotsOf, ring, stat, hint, btn, twoTap, ago, clock, fmt, chargeLeftMin } from "./popkit.js";
import { wallboxes, openWallbox } from "./wallbox.js";

const SLOTS = [
  ["battery", /^sensor\..*_(batteriestand|battery_level|battery_percentage)$/],
  ["fuel", /^sensor\..*_(fullstand_tank|fuel_level)$/],
  ["range", /^sensor\.(?!.*(elektrische|fossile|electric|combustion|fuel)_(reichweite|range)$).*_(reichweite|range)$/],
  ["erange", /^sensor\..*_(elektrische_reichweite|electric_range)$/],
  ["frange", /^sensor\..*_(fossile_reichweite|combustion_range|fuel_range)$/],
  ["chargeState", /^sensor\..*_(ladestatus|charging_state)$/],
  ["chargePower", /^sensor\..*_(ladeleistung|charging_power)$/],
  ["chargeLeft", /^sensor\..*_(verbleibende_ladezeit|remaining_charging_time)$/],
  ["chargeLimit", /^sensor\..*_(ladegrenze_in_prozent|target_battery_percentage)$/],
  ["cable", /^binary_sensor\..*_(ladekabel|charger_connected)$/],
  ["mileage", /^sensor\..*_(kilometerstand|mileage|odometer)$/],
  ["inspDays", /^sensor\..*_(nachste_inspektion|service_inspection)$/],
  ["inspKm", /^sensor\..*_(nachste_inspektion_2|service_inspection_distance)$/],
  ["oilDays", /^sensor\..*_(ol_service|oil_service)$/],
  ["outside", /^sensor\..*_(aussentemperatur|outside_temperature)$/],
  ["updated", /^sensor\..*_(letzte_aktualisierung|last_updated)$/],
  ["tripKm", /^sensor\..*_(last_trip_mileage)$/],
  ["tripMin", /^sensor\..*_(last_trip_travel_time)$/],
  ["tripFuel", /^sensor\..*_(last_trip_average_fuel_consumption)$/],
  ["tracker", /^device_tracker\./],
  ["lock", /^lock\./],
  ["climate", /^climate\./],
  ["windowHeat", /^switch\..*_(scheiben_beheizen|window_heating)$/],
  ["image", /^image\./],
  ["doors", /^binary_sensor\..*_(turen_offen|doors)$/],
  ["windows", /^binary_sensor\..*_(fenster|windows)$/],
  ["trunk", /^binary_sensor\..*_(kofferraum|trunk)$/],
  ["bonnet", /^binary_sensor\..*_(motorhaube|bonnet|hood)$/],
];

// A Volkswagen read out by the volkswagen_connect integration has no device tracker, no lock and no
// climate entity, and its entity ids follow the language Home Assistant ran in when it was set up.
// So its slots go by translation_key, which never changes (the lesson from #6). Checked against the
// source of rafaelhutter/ha-volkswagen-connect 0.5.40: there the primary engine's range carries the
// petrol icon and the secondary one the EV icon, which is the only place that says which is which.
const VW = "volkswagen_connect";
const VW_SLOTS = [
  ["battery", "sensor", ["soc", "state_of_charge", "battery_level_hv_value", "battery_state_report_soc"]],
  ["fuel", "sensor", ["fuel_level_current_level"]],
  ["range", "sensor", ["cruising_range_combined", "primary_range"]],
  ["erange", "sensor", ["electric_range", "cruising_range_secondary_engine"]],
  ["frange", "sensor", ["cruising_range_primary_engine"]],
  ["chargeState", "sensor", ["charging_state", "charging_state_report_current_charge_state"]],
  ["chargePower", "sensor", ["charge_power", "battery_state_report_charge_power"]],
  ["chargeLeft", "sensor", ["charge_time_remaining", "battery_state_report_remaining_charging_time_complete"]],
  ["chargeLimit", "sensor", ["target_soc", "settings_target_soc"]],
  ["cable", "binary_sensor", ["plug_connection"]],
  ["mileage", "sensor", ["odometer", "mileage", "mileage_value"]],
  ["inspDays", "sensor", ["inspection_due_days"]],
  ["inspKm", "sensor", ["inspection_due_km"]],
  ["oilDays", "sensor", ["oil_service_due_days"]],
  ["outside", "sensor", ["outside_temperature", "outdoor_temperature"]],
  ["updated", "sensor", ["last_report", "car_captured_time"]],
  ["image", "image", ["image", "image_view_front_left", "image_view_side_left"]],
];
// A Stellantis car (Opel, Peugeot, Citroën, Fiat, Jeep …) from andreadegiovine/homeassistant-stellantis-vehicles:
// a tracker, but entity ids in the setup language ("…_batterie"). Checked against its source (const.py,
// number.py, device_tracker.py): the domain is stellantis_vehicles, "autonomy" is the electric range,
// "battery_charging_end" a timestamp, "battery_charging_rate" km of range per hour (so no kW, left out),
// "battery_charging_limit" a number (a binary_sensor shares the key), and "doors" a lock contact
// (on = unlocked), not an open door.
const STELLANTIS = "stellantis_vehicles";
const STELLANTIS_SLOTS = [
  ["battery", "sensor", ["battery"]],
  ["fuel", "sensor", ["fuel"]],
  ["erange", "sensor", ["autonomy"]],
  ["frange", "sensor", ["fuel_autonomy"]],
  ["charging", "binary_sensor", ["battery_charging"]],
  ["cable", "binary_sensor", ["battery_plugged"]],
  ["chargeLeft", "sensor", ["battery_charging_end"]],
  ["chargeLimit", "number", ["battery_charging_limit"]],
  ["mileage", "sensor", ["mileage"]],
  ["inspDays", "sensor", ["days_before_maintenance"]],
  ["inspKm", "sensor", ["mileage_before_maintenance"]],
  ["outside", "sensor", ["temperature"]],
  ["trunk", "binary_sensor", ["door_trunk"]],
  ["tracker", "device_tracker", ["vehicle"]],
];
/** Integrations whose cars are read by translation_key, which never changes with the language. */
const KNOWN = { [VW]: VW_SLOTS, [STELLANTIS]: STELLANTIS_SLOTS };

/**
 * Minutes until the battery is full, or null (see chargeLeftMin). Volkswagen sends 65535 when it does
 * not know, other integrations send "invalid" or a negative number; none of those is a time to show.
 */
export function chargeMinutes(state) {
  return chargeLeftMin({ states: { x: { state: String(state), attributes: {} } } }, "x");
}

/** The known integration a car device comes from (see KNOWN), or null. */
export function carPlatform(hass, dev) {
  for (const e of Object.values(hass.entities || {})) if (e.device_id === dev && KNOWN[e.platform]) return e.platform;
  return null;
}
/** Does this device come from an integration we read by translation_key? */
export const isKnownCar = (hass, dev) => !!carPlatform(hass, dev);
/** Does this device come from volkswagen_connect? */
export const isVwCar = (hass, dev) => carPlatform(hass, dev) === VW;

function keySlots(hass, dev, slots) {
  const out = {};
  for (const e of Object.values(hass.entities || {})) {
    if (e.device_id !== dev || !e.translation_key || e.disabled_by) continue;
    const domain = e.entity_id.split(".")[0];
    for (const [slot, dom, keys] of slots) {
      if (!out[slot] && domain === dom && keys.includes(e.translation_key)) out[slot] = e.entity_id;
    }
  }
  return out;
}

/** The car's slots: by translation key for a known integration, by entity name for everyone else. */
export function carSlots(hass, dev) {
  const base = slotsOf(hass, dev, SLOTS);
  const platform = carPlatform(hass, dev);
  if (!platform) return base;
  const out = keySlots(hass, dev, KNOWN[platform]);
  // Only one kind of range (an electric car): that is the range.
  if (platform === STELLANTIS && !out.range) {
    if (out.erange && !out.frange) out.range = out.erange;
    else if (out.frange && !out.erange) out.range = out.frange;
  }
  for (const [k, v] of Object.entries(base)) if (!out[k]) out[k] = v;
  return out;
}

/** Is the car charging: its charging state says so, or its "charging" contact is on. */
export const carCharging = (hass, s) => /^charging$|^laden$/i.test(hass.states[s.chargeState]?.state || "") || hass.states[s.charging]?.state === "on";

/**
 * What stands open and what is unlocked, from the car's own contacts: a Volkswagen has no single
 * "doors" sensor but one per door, window, tailgate and bonnet, and its locks are binary sensors
 * (device class lock, so "on" means unlocked); Stellantis the same, with "doors" as its lock. Diagnostic
 * copies are left out, otherwise the same door would be counted twice. A tailgate or bonnet is named so.
 */
const TRUNK = /trunk|tailgate|kofferraum|heckklappe/i;
const BONNET = /bonnet|hood|motorhaube/i;
export function carOpenings(hass, dev) {
  const open = new Set();
  let locks = 0;
  let unlocked = 0;
  for (const e of Object.values(hass.entities || {})) {
    if (e.device_id !== dev || e.entity_category || !e.entity_id.startsWith("binary_sensor.")) continue;
    const st = hass.states[e.entity_id];
    const dc = st?.attributes?.device_class;
    if (dc === "lock") {
      locks += 1;
      if (st.state === "on") unlocked += 1;
    } else if (st?.state === "on") {
      const what = `${e.translation_key || ""} ${e.entity_id}`;
      if (dc === "door") open.add(TRUNK.test(what) ? "car_trunk" : BONNET.test(what) ? "car_bonnet" : "car_door");
      else if (dc === "window") open.add("car_window");
    }
  }
  return { open: [...open], locks, unlocked };
}

/** Cars: a device with a range sensor and a location, or one from a known integration (Volkswagen, Stellantis). */
export function carDevices(hass) {
  const out = [];
  const seen = new Set();
  for (const e of Object.values(hass.entities || {})) {
    if (!e.device_id || seen.has(e.device_id)) continue;
    const known = !!KNOWN[e.platform];
    if (!known && !/^sensor\..*_(reichweite|range)$/.test(e.entity_id)) continue;
    seen.add(e.device_id);
    const s = carSlots(hass, e.device_id);
    // Without a tracker there is no place on the map, but it is still a car.
    if (known ? (s.battery || s.fuel) && (s.range || s.erange || s.frange) : s.tracker && (s.battery || s.fuel)) {
      out.push(e.device_id);
    }
  }
  return out;
}
export const carOf = (hass, entityId) => {
  const dev = hass.entities?.[entityId]?.device_id;
  return dev && carDevices(hass).includes(dev) ? dev : null;
};
export function carName(hass, dev) {
  const d = hass.devices?.[dev];
  return d?.name_by_user || d?.name || "";
}
/** Short line for a tile: "82 % · 294 km" or "Lädt · 82 %". */
export function carText(hass, dev) {
  const s = carSlots(hass, dev);
  const b = num(hass, s.battery);
  const r = num(hass, s.range) ?? num(hass, s.erange) ?? num(hass, s.frange);
  const charging = carCharging(hass, s);
  return [charging ? t("car_charging") : null, b != null ? `${Math.round(b)} %` : null, r != null ? `${Math.round(r)} km` : null].filter(Boolean).join(" · ");
}

export function openCar(ctx, dev) {
  const hass = ctx.hass;
  const s = carSlots(hass, dev);
  const known = isKnownCar(hass, dev);
  const name = carName(hass, dev);
  const area = ctx.model.areaById.get(hass.devices?.[dev]?.area_id)?.name;

  const pic = h("img", { class: "hp-car-pic", alt: "" });
  const picBox = h("div", { class: "hp-car-stage" }, h("i", { class: "hp-car-floor" }), pic, h("span", { class: "hp-car-where" }));
  const rg = ring("hp-app-ring hp-car-ring");
  const bBig = h("b");
  const battDial = h("div", { class: "hp-car-dial" }, rg.svg, h("div", { class: "hp-app-center" }, h("span", { class: "hp-car-bolt" }, icon("mdi:lightning-bolt")), bBig, h("small", {}, t("car_battery"))));
  const fuelFill = h("i");
  const fuelVal = h("b");
  const fuel = h("div", { class: "hp-car-fuel" }, h("div", { class: "head" }, h("span", {}, icon("mdi:gas-station"), t("car_fuel")), fuelVal), h("div", { class: "bar" }, fuelFill));
  const range = h("div", { class: "hp-car-range" });
  const charge = h("div", { class: "hp-car-charge" });
  const hero = h("div", { class: "hp-car-hero" }, battDial, h("div", { class: "hp-car-side" }, range, s.fuel ? fuel : "", charge));

  const sLock = stat("mdi:car-key", t("car_locked"));
  const sOpen = stat("mdi:car-door", t("car_doors"));
  const sKm = stat("mdi:counter", t("car_mileage"));
  const sService = stat("mdi:wrench-clock", t("car_service"));
  const stats = h("div", { class: "hp-app-stats hp-pr-stats" }, sLock, sOpen, sKm, sService);
  const trip = h("div", { class: "hp-car-trip" });
  const hints = h("div", { class: "hp-app-hints" });

  const sheet = openSheet(ctx, { title: name, subtitle: area, cls: "appliance car" });
  const clim = s.climate ? btn("mdi:fan", t("car_climate")) : null;
  clim?.addEventListener("click", () => {
    const on = ctx.hass.states[s.climate]?.state !== "off";
    ctx.hass.callService("climate", "set_hvac_mode", { entity_id: s.climate, hvac_mode: on ? "off" : (ctx.hass.states[s.climate].attributes.hvac_modes || []).find((m) => m !== "off") || "heat_cool" });
  });
  const heat = s.windowHeat ? btn("mdi:car-defrost-front", t("car_defrost")) : null;
  heat?.addEventListener("click", () => ctx.hass.callService("switch", "toggle", { entity_id: s.windowHeat }));
  // Only locking from here; unlocking needs the car's app and PIN.
  const lockB = s.lock ? twoTap(btn("mdi:lock-outline", t("car_lock_now")), () => ctx.hass.callService("lock", "lock", { entity_id: s.lock })) : null;
  const more = btn("mdi:home-assistant", t("more_short"));
  more.addEventListener("click", () => { sheet.close(); openMoreInfo(ctx.root, s.range || s.battery); });
  // With a wallbox at home, the charging popup is one tap away (instead of "More").
  const wb = wallboxes(hass)[0];
  const wbB = wb ? btn("mdi:ev-station", t("wb_title")) : null;
  wbB?.addEventListener("click", () => openWallbox(ctx, wb));
  const foot = h("div", { class: "hp-sheet-actions hp-app-foot hp-pr-foot" }, ...[clim, heat, lockB, wbB || more].filter(Boolean));
  sheet.body.append(picBox, hero, stats, trip, hints, foot);

  const update = (hs) => {
    // No picture of its own (Stellantis): the one the tracker carries.
    const img = hs.states[s.image]?.attributes.entity_picture || hs.states[s.tracker]?.attributes.entity_picture;
    if (img && pic.dataset.src !== img) { pic.dataset.src = img; pic.src = img; }
    picBox.classList.toggle("no-pic", !img);
    const tr = hs.states[s.tracker];
    const where = tr ? (tr.state === "home" ? t("car_home") : tr.state === "not_home" ? t("car_away") : hs.formatEntityState?.(tr) || tr.state) : "";
    picBox.querySelector(".hp-car-where").replaceChildren(icon(tr?.state === "home" ? "mdi:home-outline" : "mdi:map-marker-outline"), h("span", {}, where));
    const b = num(hs, s.battery);
    rg.set(b ?? 0);
    bBig.textContent = b != null ? `${Math.round(b)}%` : "–";
    const charging = carCharging(hs, s);
    hero.classList.toggle("charging", charging);
    hero.dataset.tone = b != null && b < 20 ? "low" : "";
    const f = num(hs, s.fuel);
    fuelFill.style.width = `${f ?? 0}%`;
    fuelVal.textContent = f != null ? `${Math.round(f)} %` : "–";
    fuel.dataset.tone = f != null && f < 15 ? "low" : "";
    const r = num(hs, s.range);
    const er = num(hs, s.erange);
    const fr = num(hs, s.frange);
    range.replaceChildren(
      h("div", { class: "total" }, h("b", {}, r != null ? fmt(hs, r) : "–"), h("small", {}, "km")),
      h("div", { class: "split" }, ...(er != null ? [h("span", { class: "e" }, icon("mdi:lightning-bolt"), `${fmt(hs, er)} km`)] : []), ...(fr != null ? [h("span", { class: "f" }, icon("mdi:gas-station"), `${fmt(hs, fr)} km`)] : [])));
    const lim = num(hs, s.chargeLimit);
    const left = chargeLeftMin(hs, s.chargeLeft);
    const pw = num(hs, s.chargePower);
    const cable = hs.states[s.cable]?.state === "on";
    let ctext = "";
    if (charging) ctext = [t("car_charging"), pw ? `${fmt(hs, pw, 1)} kW` : null, left ? t("car_until", { time: clock(hs, new Date(Date.now() + left * 60000)) }) : lim ? t("car_to", { n: lim }) : null].filter(Boolean).join(" · ");
    else if (cable) ctext = t("car_plugged");
    else if (s.chargeState) ctext = t("car_not_plugged");
    charge.replaceChildren(...(ctext ? [icon(charging ? "mdi:ev-station" : cable ? "mdi:power-plug" : "mdi:power-plug-off-outline"), h("span", {}, ctext)] : []));
    charge.classList.toggle("on", charging);
    // Without a lock entity (Volkswagen, Stellantis) the locks are contacts, and "all locked" means none is open.
    const con = s.lock ? null : carOpenings(hs, dev);
    const hasLock = con ? con.locks > 0 : !!s.lock;
    const locked = con ? con.unlocked === 0 : hs.states[s.lock]?.state === "locked";
    sLock.set(hasLock ? (locked ? t("car_yes") : t("car_no")) : "–");
    sLock.classList.toggle("warn", hasLock && !locked);
    // A known integration's contacts tell what they are; otherwise the named slots, never a lock contact.
    const opens = known && con
      ? con.open.map((k) => t(k))
      : [["doors", "car_door"], ["windows", "car_window"], ["trunk", "car_trunk"], ["bonnet", "car_bonnet"]]
        .filter(([k]) => hs.states[s[k]]?.state === "on" && hs.states[s[k]].attributes?.device_class !== "lock").map(([, l]) => t(l));
    sOpen.set(opens.length ? opens.join(", ") : t("car_all_closed"));
    sOpen.classList.toggle("warn", opens.length > 0);
    const km = num(hs, s.mileage);
    sKm.set(km != null ? `${fmt(hs, km)} km` : "–");
    const days = num(hs, s.inspDays);
    const skm = num(hs, s.inspKm);
    sService.set(days != null ? t("car_in_days", { n: fmt(hs, days) }) : skm != null ? `${fmt(hs, skm)} km` : "–");
    sService.querySelector("small").textContent = days != null && skm != null ? `${t("car_service")} · ${fmt(hs, skm)} km` : t("car_service");
    const tk = num(hs, s.tripKm);
    trip.replaceChildren(...(tk != null ? [h("div", { class: "hp-label" }, t("car_last_trip")),
      h("div", { class: "row" }, h("span", {}, icon("mdi:map-marker-distance"), `${fmt(hs, tk)} km`), h("span", {}, icon("mdi:timer-outline"), `${fmt(hs, num(hs, s.tripMin))} min`),
        ...(num(hs, s.tripFuel) != null ? [h("span", {}, icon("mdi:gas-station-outline"), `${fmt(hs, num(hs, s.tripFuel), 1)} l/100`)] : []))] : []));
    const list = [];
    if (opens.length) list.push(hint("mdi:car-door", t("car_open_hint", { what: opens.join(", ") }), true));
    if (hasLock && !locked) list.push(hint("mdi:lock-open-variant-outline", t("car_unlocked_hint")));
    if (days != null && days < 30) list.push(hint("mdi:wrench-outline", t("car_service_soon", { n: fmt(hs, days) })));
    const upd = hs.states[s.updated]?.state;
    if (upd && live(hs, s.updated)) list.push(h("div", { class: "hp-car-updated" }, icon("mdi:update"), t("car_updated", { when: ago(hs, upd) }), num(hs, s.outside) != null ? ` · ${fmt(hs, num(hs, s.outside), 0)}° ${t("car_outside")}` : ""));
    hints.replaceChildren(...list);
    if (clim) {
      const on = hs.states[s.climate]?.state && hs.states[s.climate].state !== "off";
      clim.classList.toggle("lit", !!on);
      clim.querySelector("span").textContent = on ? t("car_climate_off") : t("car_climate");
    }
    heat?.classList.toggle("lit", hs.states[s.windowHeat]?.state === "on");
    if (lockB) lockB.hidden = locked || !live(hs, s.lock);
    // Three buttons side by side on one line; two or four as a 2×2 grid.
    const shown = [...foot.children].filter((b) => !b.hidden).length;
    foot.style.gridTemplateColumns = shown === 3 ? "repeat(3, minmax(0, 1fr))" : "";
  };
  update(hass);
  sheet.updaters.push(update);
}
