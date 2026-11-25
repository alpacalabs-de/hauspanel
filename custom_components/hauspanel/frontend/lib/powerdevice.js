// Devices with a power meter only (#44): an oven on a metering relay has a power sensor but no switch.
// Set by hand in edit mode (power sensor tile → Device), it shows as a device that is on above a
// threshold, with how long it has been on and what it used today.
import { h, icon, formatNumber } from "./util.js";
import { t } from "./i18n.js";
import { meterSensors, watts, formatWatts, deviceName } from "./usage.js";

export const POWER_ON_DEFAULT = 20; // W
export const POWER_OFF_AFTER = 2 * 60000; // below the threshold this long in one go: off (an oven cycles its heating)
const KEEP = 24 * 3600000; // how far back the history goes

/** A power sensor (W or kW), the only kind that can become a device. */
export const isPowerSensor = (hass, id) => typeof id === "string" && id.startsWith("sensor.") && hass.states[id]?.attributes.device_class === "power";

/** Is this power sensor shown as a device? Its settings ({ on: watts }) or null. */
export const powerDeviceOf = (ctx, id) => (isPowerSensor(ctx.hass, id) && ctx.settings.s.powerDevices?.[id]) || null;

/** The threshold in W: from the setting, else the default. */
export function powerThreshold(conf) {
  const v = Number(conf?.on);
  return Number.isFinite(v) && v > 0 ? v : POWER_ON_DEFAULT;
}

/**
 * On or off from the power readings [{ t, w }] (oldest first), with hysteresis: on as soon as the
 * power is above the threshold, off only once it stayed at or below it for `offAfter` in one go.
 * `since` is when the running stretch began (short dips do not break it); `offAt` when it goes off
 * if the power stays low.
 */
export function powerRun(points, threshold, now = Date.now(), offAfter = POWER_OFF_AFTER) {
  let on = false;
  let since = null;
  let below = null;
  const settle = (at) => {
    if (on && below != null && at - below >= offAfter) {
      on = false;
      since = null;
      below = null;
    }
  };
  for (const p of points) {
    if (p.w == null || !Number.isFinite(p.w)) continue;
    settle(p.t);
    if (p.w > threshold) {
      if (!on) { on = true; since = p.t; }
      below = null;
    } else if (on && below == null) below = p.t;
  }
  settle(now);
  return { on, since, offAt: on && below != null ? below + offAfter : null };
}

// ---- readings: the history once, then every new state (shared by the tile and the popup)

const tracks = new Map();
const factor = (st) => (st?.attributes.unit_of_measurement === "kW" ? 1000 : 1);

function track(hass, id, onLoad) {
  let tr = tracks.get(id);
  if (!tr) {
    tr = { pts: [], loaded: false, waiting: new Set() };
    tracks.set(id, tr);
    const from = Date.now() - KEEP;
    hass.callWS({ type: "history/history_during_period", start_time: new Date(from).toISOString(), entity_ids: [id], minimal_response: true, no_attributes: true })
      .then((r) => {
        const f = factor(hass.states[id]);
        const old = (r?.[id] || []).map((x) => ({ t: Math.max(from, (x.lu ?? x.lc) * 1000), w: Number(x.s) * f })).filter((p) => Number.isFinite(p.w));
        // What came in while loading stays after the history.
        const last = old[old.length - 1]?.t ?? 0;
        tr.pts = [...old, ...tr.pts.filter((p) => p.t > last)];
      })
      .catch(() => {})
      .finally(() => {
        tr.loaded = true;
        for (const fn of tr.waiting) fn();
        tr.waiting.clear();
      });
  }
  if (onLoad && !tr.loaded) tr.waiting.add(onLoad);
  return tr;
}

/** On or off right now, from the history and the current state: { on, since, offAt, w }. */
export function powerStatus(hass, id, threshold, onLoad) {
  const tr = track(hass, id, onLoad);
  const st = hass.states[id];
  const w = watts(hass, id);
  if (w != null) {
    const at = new Date(st.last_updated || st.last_changed).getTime() || Date.now();
    const last = tr.pts[tr.pts.length - 1];
    if (!last || at > last.t) tr.pts.push({ t: at, w });
  }
  const cut = Date.now() - KEEP;
  while (tr.pts.length > 2 && tr.pts[1].t < cut) tr.pts.shift();
  return { ...powerRun(tr.pts, threshold), w };
}

// ---- energy today, from the energy sensor of the same device (none: no number)

const today = new Map();

/** kWh used today, or null (no energy sensor, not loaded yet). Asks again after 5 minutes. */
export function todayKwh(hass, energyId, onLoad) {
  if (!energyId) return null;
  const c = today.get(energyId);
  if (!c || (Date.now() - c.at > 300000 && !c.busy)) {
    const n = { at: Date.now(), v: c?.v ?? null, busy: true };
    today.set(energyId, n);
    hass.callWS({ type: "recorder/statistic_during_period", statistic_id: energyId, calendar: { period: "day" }, types: ["change"], units: { energy: "kWh" } })
      .then((r) => { if (Number.isFinite(r?.change)) n.v = Math.max(0, r.change); })
      .catch(() => {})
      .finally(() => { n.busy = false; onLoad?.(); });
  }
  return today.get(energyId).v;
}

// ---- how it looks

const NAMED = [
  [/oven|backofen|ofen|herd|stove|cooker|kochfeld|hob/i, "mdi:stove"],
  [/fridge|freezer|kühl|kuehl|gefrier/i, "mdi:fridge-outline"],
  [/dish|spül|spuel|geschirr/i, "mdi:dishwasher"],
  [/dryer|trockner/i, "mdi:tumble-dryer"],
  [/wash|wasch/i, "mdi:washing-machine"],
  [/coffee|kaffee|espresso/i, "mdi:coffee-maker-outline"],
  [/microwave|mikrowelle/i, "mdi:microwave"],
  [/kettle|wasserkocher/i, "mdi:kettle"],
  [/\btv\b|television|fernseh/i, "mdi:television"],
  [/pump|pumpe/i, "mdi:pump"],
  [/heater|heizung|heizlüfter|radiator/i, "mdi:radiator"],
];

/** The icon: the power sensor's own (set by the user or the integration), else from the device name, else a plug. */
export function powerDeviceIcon(hass, id) {
  const own = hass.entities?.[id]?.icon || hass.states[id]?.attributes.icon;
  if (own && !/flash|lightning|power-plug/.test(own)) return own;
  const name = deviceName(hass, id);
  return NAMED.find(([re]) => re.test(name))?.[1] || "mdi:power-plug";
}

/** "for 35 min", "for 2 h". */
function forHow(since) {
  const s = Math.max(0, (Date.now() - since) / 1000);
  const d = s < 3600 ? t("pk_dur_min", { n: Math.max(1, Math.round(s / 60)) }) : s < 86400 * 2 ? t("pk_dur_h", { n: Math.round(s / 3600) }) : t("pk_dur_d", { n: Math.round(s / 86400) });
  return t("ov_since", { when: d });
}

/** "On · 2.1 kW · for 35 min" or "Off · today 1.2 kWh" (without an energy sensor just "Off"). */
export function powerDeviceText(hass, status, kwh) {
  if (status.on) return [t("on"), status.w != null ? formatWatts(hass, status.w) : null, status.since ? forHow(status.since) : null].filter(Boolean).join(" · ");
  return kwh != null ? `${t("off")} · ${t("today").toLocaleLowerCase()} ${formatNumber(hass, kwh, kwh < 10 ? 2 : 1)} kWh` : t("off");
}

/** Everything the tile and the popup need at once; `again` runs when something loaded later. */
export function powerDeviceState(ctx, id, again) {
  const hass = ctx.hass;
  const conf = ctx.settings.s.powerDevices?.[id];
  const status = powerStatus(hass, id, powerThreshold(conf), again);
  const kwh = todayKwh(hass, meterSensors(hass, id).energy, again);
  return { status, kwh, text: powerDeviceText(hass, status, kwh) };
}

/** Steps for the threshold: fine at low power, coarse at high. */
const stepAt = (v) => (v < 50 ? 5 : v < 200 ? 10 : v < 1000 ? 50 : 100);

/** The popup row "On from 20 W" with − and +. */
export function thresholdRow(ctx, id, onChange) {
  const val = h("b", {});
  const show = () => { val.textContent = formatWatts(ctx.hass, powerThreshold(ctx.settings.s.powerDevices?.[id])); };
  const change = (up) => {
    const cur = powerThreshold(ctx.settings.s.powerDevices?.[id]);
    const next = Math.min(5000, Math.max(1, up ? cur + stepAt(cur) : cur - stepAt(cur - 1)));
    ctx.settings.setPowerThreshold(id, next);
    show();
    onChange?.();
  };
  const minus = h("button", { class: "hp-round ghost", "aria-label": `${t("power_on_from")} −` }, icon("mdi:minus"));
  const plus = h("button", { class: "hp-round ghost", "aria-label": `${t("power_on_from")} +` }, icon("mdi:plus"));
  minus.addEventListener("click", () => change(false));
  plus.addEventListener("click", () => change(true));
  show();
  return h("div", { class: "hp-power-from" }, icon("mdi:flash-outline"), h("span", {}, t("power_on_from")), minus, val, plus);
}
