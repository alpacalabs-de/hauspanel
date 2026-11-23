// Wallbox popup: power flowing from the wallbox into the car (green when the sun pays for it), this charge in kWh
// and euros, the car's battery and when it will be full, the charger's own charge mode and charge
// limit where it has them, and start/stop charging (two taps).
import { h, icon, formatTime } from "./util.js";
import { openMoreInfo, roundBtn } from "./domains.js";
import { openSheet } from "./dialogs.js";
import { watts, formatWatts } from "./usage.js";
import { carDevices, carName, carSlots } from "./car.js";
import { t } from "./i18n.js";
import { svgEl, num, live, slotsOf, stat, hint, btn, twoTap, fmt } from "./popkit.js";
import { solarRates } from "./energy.js";

const SLOTS = [
  ["online", /^binary_sensor\..*_status$/],
  ["plug", /^binary_sensor\..*_plug$/],
  ["charging", /^binary_sensor\..*_charging_state$/],
  ["power", /^sensor\..*_charging_power$/],
  ["session", /^sensor\..*_session_energy$/],
  ["total", /^sensor\..*_total_energy$/],
  ["current", /^sensor\..*_max_current$/],
  ["target", /^sensor\..*_energy_target$/],
];
// A SolaX HAC over the solax_modbus integration names its sensors differently and has no plug or
// charging binary sensor at all; what the charger is doing comes from its Run Mode sensor instead.
// Its Charger Use Mode select is what decides whether it charges at all (Stop, Fast, ECO, Green).
// Only used for entities of that integration, so these names can't catch anyone else's sensors.
const SOLAX = "solax_modbus";
const SOLAX_SLOTS = [
  ["power", /^sensor\..*_charge_power_total$/],
  ["session", /^sensor\..*_charge_added$/],
  ["total", /^sensor\..*_charge_added_(cumulative|total)$/],
  ["runmode", /^sensor\..*_run_mode$/],
  ["usemode", /^select\..*_charger_use_mode$/],
];
// Run Mode values that say a car is sitting at the charger (the charger knows a lot more of them,
// like Faulted or Unavailable; those say nothing about a car, so they fall through to the sensors).
const PLUGGED_MODES = new Set(["preparing", "finishing", "suspended ev", "suspended evse", "charge paused", "stopping", "occupied"]);
// evcc over the ha-evcc integration gives every charge point its own device and names its entities
// after evcc's own values, so none of the names above fit; session energy happens to be the same.
// It also knows the car's charge level, range, charge limit and remaining time without a car
// integration. Its charge mode select is the only select on a charge point whose name ends in
// "_mode" (the others are always_charge, phases_configured, min/max_current, vehicle_name and
// limit_soc; battery_mode sits on evcc's site device, which is never a wallbox). Same rule as
// above: this list only ever sees entities of that integration, so it can't catch anyone else's.
const EVCC = "evcc_intg";
const EVCC_SLOTS = [
  ["power", /^sensor\..*_charge_power$/],
  ["total", /^sensor\..*_charge_total_import$/],
  ["plug", /^binary_sensor\..*_connected$/],
  ["charging", /^binary_sensor\..*_charging$/],
  ["vsoc", /^sensor\..*_vehicle_soc$/],
  ["vrange", /^sensor\..*_vehicle_range$/],
  ["vlimit", /^number\..*_limit_soc$/],
  ["vleft", /^sensor\..*_charge_remaining_duration$/],
  ["usemode", /^select\..*_mode$/],
];
/** Extra names an integration brings along, tried before the usual ones. */
const EXTRA_SLOTS = { [SOLAX]: SOLAX_SLOTS, [EVCC]: EVCC_SLOTS };
// What makes a charging power sensor, per integration.
const POWER_RE = { [SOLAX]: /^sensor\.(.*)_charge_power_total$/, [EVCC]: /^sensor\.(.*)_charge_power$/ };

/** What a Run Mode sensor says: "charging", "plugged", "ready", or null when we can't tell. */
export function runModeState(state) {
  const v = String(state ?? "").trim().toLowerCase().replace(/[_-]+/g, " ");
  if (v === "charging") return "charging";
  if (v === "available") return "ready";
  return PLUGGED_MODES.has(v) ? "plugged" : null;
}

/**
 * The charge modes a charger offers, the current one marked: [{ value, label, active }].
 * null when there is no such select, it reports nothing, or it offers nothing to pick from.
 */
export function useModes(hass, id) {
  const st = id ? hass.states[id] : null;
  if (!st || ["unavailable", "unknown"].includes(st.state)) return null;
  const list = st.attributes?.options;
  if (!Array.isArray(list) || !list.length) return null;
  // The label follows Home Assistant's own translation of the option when it has one.
  return list.map((value) => ({ value, label: hass.formatEntityState?.({ ...st, state: value }) || String(value), active: value === st.state }));
}

/** Minutes per unit a duration sensor may report in. Anything else we don't read. */
const PER_MIN = { s: 1 / 60, min: 1, h: 60 };
/**
 * How long a charge still has to run, in minutes. null when there is no such sensor, its unit is
 * one we don't know, or the value isn't a sane duration: evcc sends a huge placeholder (Go's
 * maximum, about 9.2e18) when it has no idea, and that would turn into a nonsense time of day.
 */
export function chargeMinutes(hass, id) {
  const v = num(hass, id);
  if (v == null) return null;
  const f = PER_MIN[String(hass.states[id].attributes?.unit_of_measurement || "").trim().toLowerCase()];
  if (!f) return null;
  const m = v * f;
  return m > 0 && m < 24 * 60 ? m : null;
}

/**
 * Where minus (-1) or plus (1) takes a number entity, within its own min, max and step.
 * null when it can't move: at the end of its range, not reachable, or not a number at all.
 * `from` is the value a tap before this one has already picked but not sent yet.
 */
export function limitStep(hass, id, dir, from = null) {
  const st = id ? hass.states[id] : null;
  if (!st || ["unavailable", "unknown"].includes(st.state)) return null;
  const a = st.attributes || {};
  const step = Number(a.step) > 0 ? Number(a.step) : 1;
  const min = Number.isFinite(Number(a.min)) ? Number(a.min) : 0;
  const max = Number.isFinite(Number(a.max)) ? Number(a.max) : 100;
  const base = from ?? Number(st.state);
  if (!Number.isFinite(base) || min > max) return null;
  const want = Math.min(max, Math.max(min, base + dir * step));
  // Stay on the steps the entity offers, counted from its minimum.
  const v = Math.round((min + Math.round((want - min) / step) * step) * 1000) / 1000;
  const next = Math.min(max, Math.max(min, v));
  return next === base ? null : next;
}
// Only the charging switch is looked up here; everything the ring shows comes from the car itself
// (carSlots), so a car whose entity names we don't know — a Volkswagen, say — fills it too.
const CAR = [["sw", /^switch\..*_(laden|charging)$/]];

/** What the ring needs, under the names used here. */
const carRing = (hass, dev) => {
  const c = carSlots(hass, dev);
  return {
    ...slotsOf(hass, dev, CAR),
    battery: c.battery,
    range: c.range,
    erange: c.erange,
    left: c.chargeLeft,
    limit: c.chargeLimit,
    cstate: c.chargeState,
    cpower: c.chargePower,
  };
};

/**
 * Wallboxes: a device with a charging power and a session energy sensor. Integrations without devices (KEBA)
 * are found by name instead; their key is "pfx:<entity prefix>".
 */
export function wallboxes(hass) {
  const out = new Set();
  const cars = new Set(carDevices(hass));
  for (const id of Object.keys(hass.states)) {
    const ent = hass.entities?.[id];
    const mm = /^sensor\.(.*)_charging_power$/.exec(id) || POWER_RE[ent?.platform]?.exec(id);
    if (!mm) continue;
    const dev = ent?.device_id;
    if (dev && cars.has(dev)) continue;
    const key = dev || `pfx:${mm[1]}`;
    const s = wbSlots(hass, key);
    if (s.session || s.total) out.add(key);
  }
  return [...out];
}
/** The wallbox's entities, by device or by name prefix. */
export function wbSlots(hass, key) {
  if (!key.startsWith("pfx:")) {
    const out = {};
    for (const e of Object.values(hass.entities || {})) {
      if (e.device_id !== key) continue;
      const list = EXTRA_SLOTS[e.platform];
      for (const [slot, re] of list ? list.concat(SLOTS) : SLOTS) if (!out[slot] && re.test(e.entity_id)) out[slot] = e.entity_id;
    }
    return out;
  }
  const pre = key.slice(4);
  const out = {};
  for (const id of Object.keys(hass.states)) {
    if (!id.split(".")[1].startsWith(`${pre}_`)) continue;
    for (const [slot, re] of SLOTS) if (!out[slot] && re.test(id)) out[slot] = id;
  }
  return out;
}
export const wallboxOf = (hass, id) => {
  const dev = hass.entities?.[id]?.device_id;
  return wallboxes(hass).find((k) => k === dev || (k.startsWith("pfx:") && id.split(".")[1]?.startsWith(`${k.slice(4)}_`))) || null;
};

/** What to call this wallbox: its device name, the entity prefix for the ones without a device. */
export const wallboxName = (hass, key) => {
  const d = hass.devices?.[key];
  return d?.name_by_user || d?.name || (key.startsWith("pfx:") ? key.slice(4).replace(/_/g, " ").toUpperCase() : t("wb_title"));
};

/** The label on tiles and buttons: just "Wallbox" with one, the device's name with several. */
export const wallboxLabel = (hass, key) => (wallboxes(hass).length > 1 ? wallboxName(hass, key) : t("wb_title"));

const kw = (hass, id) => {
  const v = num(hass, id);
  if (v == null) return null;
  const u = hass.states[id].attributes.unit_of_measurement;
  return u === "W" ? v / 1000 : v;
};

export function wallboxText(hass, dev) {
  const s = wbSlots(hass, dev);
  const p = kw(hass, s.power);
  const rm = runModeState(hass.states[s.runmode]?.state);
  if (hass.states[s.charging]?.state === "on" || rm === "charging" || p > 0.1) return p != null ? `${t("car_charging")} · ${fmt(hass, p, 1)} kW` : t("car_charging");
  if (hass.states[s.plug]?.state === "on" || rm === "plugged") return t("car_plugged");
  if (!live(hass, s.power) && !live(hass, s.session) && !live(hass, s.runmode)) return t("wb_no_data");
  return t("wb_ready");
}

export function openWallbox(ctx, dev) {
  const hass = ctx.hass;
  const s = wbSlots(hass, dev);
  const carDev = carDevices(hass)[0];
  // Without a car integration, evcc's own idea of the car fills the ring and the range.
  const c = carDev ? carRing(hass, carDev) : { battery: s.vsoc, range: s.vrange };
  const prefs = ctx.energyPrefs || {};
  const sunRates = solarRates(prefs);
  const priceId = (prefs.energy_sources || []).find((x) => x.type === "grid")?.entity_energy_price;
  const d = hass.devices?.[dev];
  const area = ctx.model.areaById.get(d?.area_id || hass.devices?.[carDev]?.area_id)?.name;

  // Flow: wallbox → cable → car battery ring
  const svg = svgEl("svg", { viewBox: "0 0 320 130", class: "hp-wb-svg" });
  const cable = svgEl("path", { d: "M78 70 C130 70 150 100 200 100 S 240 70 250 70", class: "cable" });
  const flow = svgEl("path", { d: "M78 70 C130 70 150 100 200 100 S 240 70 250 70", class: "flow" });
  svg.append(cable, flow);
  const box = h("div", { class: "hp-wb-box" }, icon("mdi:ev-station"), h("small", {}, wallboxName(hass, dev)));
  const ringC = 2 * Math.PI * 34;
  const ringSvg = svgEl("svg", { viewBox: "0 0 80 80", class: "hp-wb-ring" });
  ringSvg.append(svgEl("circle", { cx: 40, cy: 40, r: 34, class: "track" }));
  const bar = svgEl("circle", { cx: 40, cy: 40, r: 34, class: "bar", "stroke-dasharray": `0 ${ringC}` });
  ringSvg.append(bar);
  const pct = h("b");
  const carBox = h("div", { class: "hp-wb-car" }, ringSvg, h("div", { class: "mid" }, pct, h("small", {}, carDev ? carName(hass, carDev) : t("car_battery"))));
  const stage = h("div", { class: "hp-wb-stage" }, svg, box, carBox);
  const status = h("span", { class: "hp-app-status" });
  const line = h("div", { class: "hp-wb-line" });

  const sPow = stat("mdi:flash", t("power_now"));
  const sSess = stat("mdi:battery-charging-medium", t("wb_session"));
  const sRange = stat("mdi:map-marker-distance", t("wb_range"));
  const sFull = stat("mdi:clock-check-outline", t("wb_full"));
  const stats = h("div", { class: "hp-app-stats hp-pr-stats" }, sPow, sSess, sRange, sFull);
  const hints = h("div", { class: "hp-app-hints" });

  // The charger's own charge mode (SolaX: Stop, Fast, ECO, Green). Two taps, so nobody starts a
  // fast charge by brushing past a wall tablet.
  const modeLabel = h("div", { class: "hp-group-label" }, t("wb_mode"));
  const modeBox = h("div", { class: "hp-modes hp-pk-chips hp-wb-modes" });
  let modeSig = null;
  const paintModes = (hs) => {
    const list = useModes(hs, s.usemode);
    if (list) {
      const sig = list.map((o) => o.value).join("|");
      if (sig !== modeSig) {
        modeSig = sig;
        modeBox.replaceChildren(...list.map((o) => twoTap(
          h("button", { class: "hp-chip", dataset: { mode: o.value }, title: o.label }, h("span", {}, o.label)),
          () => ctx.hass.callService("select", "select_option", { entity_id: s.usemode, option: o.value }))));
      }
      const on = new Set(list.filter((o) => o.active).map((o) => o.value));
      for (const b of modeBox.children) b.classList.toggle("active", on.has(b.dataset.mode));
    }
    // Not reachable: the modes stay visible but can't be picked.
    for (const b of modeBox.children) b.disabled = !list;
    modeBox.hidden = !modeBox.children.length;
    modeLabel.hidden = modeBox.hidden;
  };

  // The charge limit for the car at this charge point (evcc). One tap per step is enough here:
  // a limit a few per cent off does no harm, and the taps are gathered before anything goes out.
  const limitLabel = h("div", { class: "hp-group-label" }, t("wb_limit"));
  const limitVal = h("b");
  let want = null; // picked here, not confirmed by the charger yet
  let sendTimer = null;
  let letGo = null;
  const paintLimit = (hs) => {
    const st = hs.states[s.vlimit];
    const dead = !st || ["unavailable", "unknown"].includes(st.state);
    const real = num(hs, s.vlimit);
    if (want != null && !sendTimer && real === want) { want = null; clearTimeout(letGo); }
    const v = want ?? real;
    limitVal.textContent = v == null ? "–" : `${fmt(hs, v)} ${st?.attributes?.unit_of_measurement || "%"}`;
    for (const b of [minusB, plusB]) b.disabled = dead;
  };
  const bumpLimit = (dir) => {
    const next = limitStep(ctx.hass, s.vlimit, dir, want);
    if (next == null) return; // at the end of its range, or not reachable
    want = next;
    paintLimit(ctx.hass);
    clearTimeout(sendTimer);
    sendTimer = setTimeout(() => {
      sendTimer = null;
      ctx.hass.callService("number", "set_value", { entity_id: s.vlimit, value: want });
      // Let go of the local value once the charger has answered, after ten seconds at the latest.
      clearTimeout(letGo);
      letGo = setTimeout(() => { want = null; paintLimit(ctx.hass); }, 10000);
    }, 700);
  };
  const minusB = roundBtn("mdi:minus", "−", () => bumpLimit(-1));
  const plusB = roundBtn("mdi:plus", "+", () => bumpLimit(1));
  const limitRow = h("div", { class: "hp-wb-limit" }, minusB, limitVal, plusB);

  const sheet = openSheet(ctx, { title: t("wb_title"), subtitle: area, cls: "appliance wallbox" });
  const chargeB = c.sw ? twoTap(btn("mdi:power", t("wb_start"), "primary"), () => {
    const on = ctx.hass.states[c.sw]?.state === "on";
    ctx.hass.callService("switch", on ? "turn_off" : "turn_on", { entity_id: c.sw });
  }) : null;
  const more = btn("mdi:home-assistant", t("more_short"));
  more.addEventListener("click", () => { sheet.close(); openMoreInfo(ctx.root, s.power || s.session); });
  sheet.body.append(stage, h("div", { class: "hp-wb-head" }, status, line), stats, hints,
    ...(s.usemode ? [modeLabel, modeBox] : []),
    ...(s.vlimit ? [limitLabel, limitRow] : []),
    h("div", { class: "hp-sheet-actions hp-app-foot" }, ...(chargeB ? [chargeB] : []), more));

  const update = (hs) => {
    const p = kw(hs, s.power) ?? kw(hs, c.cpower);
    const rm = runModeState(hs.states[s.runmode]?.state);
    const charging = hs.states[s.charging]?.state === "on" || rm === "charging" || p > 0.1 || /^charging$/i.test(hs.states[c.cstate]?.state || "");
    const plugged = hs.states[s.plug]?.state === "on" || rm === "plugged" || /connect|plug/i.test(hs.states[c.cstate]?.state || "") && !/connect_cable/i.test(hs.states[c.cstate]?.state || "");
    const offline = !live(hs, s.power) && !live(hs, s.session) && !live(hs, s.plug) && !live(hs, s.runmode);
    // Sun that could pay for the charge: all inverters together.
    const sun = sunRates.reduce((a, id) => a + Math.max(0, watts(hs, id) ?? 0), 0) / 1000;
    const green = charging && p > 0 && sun >= p * 0.8;
    stage.classList.toggle("on", charging);
    stage.classList.toggle("green", green);
    const b = num(hs, c.battery);
    bar.setAttribute("stroke-dasharray", `${((b ?? 0) / 100) * ringC} ${ringC}`);
    pct.textContent = b != null ? `${Math.round(b)}%` : "–";
    status.textContent = offline ? t("wb_no_data") : charging ? t("car_charging") : plugged ? t("car_plugged") : t("wb_ready");
    status.dataset.phase = charging ? "run" : offline ? "fail" : "";
    line.textContent = charging ? (green ? t("wb_with_sun") : t("wb_from_grid")) : plugged ? t("wb_waiting") : t("car_not_plugged");
    sPow.set(p != null ? `${fmt(hs, p, 1)} kW` : "–");
    const e = num(hs, s.session);
    const price = Number(hs.states[priceId]?.state);
    sSess.set(e != null ? `${fmt(hs, e, 1)} kWh${Number.isFinite(price) ? ` · ${fmt(hs, e * price, 2)} €` : ""}` : "–");
    const er = num(hs, c.erange);
    sRange.set(er != null ? `${fmt(hs, er)} km` : num(hs, c.range) != null ? `${fmt(hs, num(hs, c.range))} km` : "–");
    sRange.querySelector("small").textContent = er != null ? `${t("wb_range")} · ${t("wb_electric")}` : t("wb_range");
    // A car integration knows best; without one, evcc's own numbers fill in.
    const left = num(hs, c.left) ?? chargeMinutes(hs, s.vleft);
    const lim = num(hs, c.limit) ?? num(hs, s.vlimit);
    sFull.set(charging && left ? formatTime(hs, new Date(Date.now() + left * 60000)) : lim != null ? t("wb_to", { n: lim }) : "–");
    const list = [];
    if (offline) list.push(hint("mdi:lan-disconnect", t("wb_offline_hint"), true));
    hints.replaceChildren(...list);
    hints.hidden = !list.length;
    if (s.usemode) paintModes(hs);
    if (s.vlimit) paintLimit(hs);
    if (chargeB) {
      const on = hs.states[c.sw]?.state === "on";
      chargeB.querySelector("span").textContent = on ? t("wb_stop") : t("wb_start");
      chargeB.classList.toggle("primary", !on);
    }
  };
  update(hass);
  sheet.updaters.push(update);
}
