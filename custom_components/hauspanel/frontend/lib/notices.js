// Notices: entities you pick yourself ("Mail is here", "Washing done") that show on Home only while they say so.
import { h, icon, domainOf, bindTapHold, entityName, toggleSwitch, formatNumber } from "./util.js";
import { entityIcon, stateText, HAZARD, hazardInfo } from "./domains.js";
import { candidateEntities, isOutdoorRoom, OUTSIDE } from "./model.js";
import { warningInfo, warningLine, openWarnings } from "./warnings.js";
import { openSheet } from "./dialogs.js";
import { t } from "./i18n.js";

/** Kinds that are simply on or off: shown while on. */
const ON_OFF = new Set(["input_boolean", "switch", "binary_sensor", "light", "fan", "siren", "humidifier", "automation"]);
export const isOnOff = (id) => ON_OFF.has(domainOf(id));

/** The states a notice waits for: "done, finished" or ">0" become a list. */
export const parseWhen = (text) => String(text || "").split(/[,;]/).map((s) => s.trim()).filter(Boolean);

/** Whether one notice shows right now: on for on/off kinds, otherwise one of its states (">0", "<20" compare numbers). */
export function noticeActive(st, n) {
  if (!st || st.state === "unavailable" || st.state === "unknown") return false;
  const when = (n?.when || []).map((s) => String(s).trim()).filter(Boolean);
  if (!when.length) return isOnOff(st.entity_id) && st.state === "on";
  const state = String(st.state).toLowerCase();
  const num = Number(st.state);
  return when.some((w) => {
    const m = /^([<>]=?)\s*(-?\d+(?:[.,]\d+)?)$/.exec(w);
    if (m) {
      if (!Number.isFinite(num) || st.state === "") return false;
      const v = Number(m[2].replace(",", "."));
      return m[1] === ">" ? num > v : m[1] === ">=" ? num >= v : m[1] === "<" ? num < v : num <= v;
    }
    return w.toLowerCase() === state;
  });
}

/** The picked notices that show right now, in their order. */
export const activeNotices = (hass, list) => (list || []).filter((n) => noticeActive(hass.states[n.id], n));

/** How two notices end up in the same group: the text that was typed for them, case and spaces aside. */
export const groupKey = (n) => String(n?.group || "").trim().replace(/\s+/g, " ").toLowerCase();

/**
 * The active notices as they show on Home: `{ id }` for one on its own, `{ group, key, ids }` where two or
 * more of the same group show at the same time, in the place of the first of them.
 * Nothing is guessed here: a notice only joins a group when that group was typed for it in the settings.
 */
export function groupNotices(list, activeIds) {
  const by = new Map((list || []).filter((n) => n?.id).map((n) => [n.id, n]));
  const out = [];
  const groups = new Map();
  for (const id of activeIds || []) {
    const key = groupKey(by.get(id));
    const seen = key ? groups.get(key) : null;
    if (seen) { seen.ids.push(id); continue; }
    const e = key ? { group: String(by.get(id).group).trim(), key, ids: [id] } : { ids: [id] };
    if (key) groups.set(key, e);
    out.push(e);
  }
  // Alone in its group a notice stays a normal pill, exactly as before.
  return out.map((e) => (e.ids.length > 1 ? e : { id: e.ids[0] }));
}

/**
 * The names for a group's line: the beginning all of them share falls away, so
 * "Pollen Birch" and "Pollen Grass" become "Birch" and "Grass". Whole words only, and when one of
 * them would be left with nothing, every name stays as it is.
 */
export function shortNames(names) {
  const list = (names || []).map((s) => String(s ?? ""));
  if (list.length < 2) return list;
  let p = list[0];
  for (const n of list.slice(1)) {
    let i = 0;
    while (i < p.length && i < n.length && p[i].toLowerCase() === n[i].toLowerCase()) i++;
    p = p.slice(0, i);
  }
  const cut = p.replace(/\S+$/, "").length;
  const short = list.map((s) => s.slice(cut).replace(/^[\s·,;:–-]+/, "").trim());
  return short.every(Boolean) ? short : list;
}

/** The room of an entity from Home Assistant's registry: its own area, else its device's. */
const areaIdOf = (hass, id) => {
  const reg = hass.entities?.[id];
  return reg?.area_id || hass.devices?.[reg?.device_id]?.area_id || null;
};

/** A thermostat that is heating right now: hvac_action says so, or without it, heat mode below its target. */
export function isHeating(st) {
  if (!st || st.state === "off" || st.state === "unavailable") return false;
  const a = st.attributes || {};
  if (a.hvac_action) return a.hvac_action === "heating" || a.hvac_action === "preheating";
  return st.state === "heat" && a.current_temperature != null && a.temperature != null && a.current_temperature < a.temperature;
}

/**
 * Rooms where a window is open while the heating runs: [{ area, windows, climates }].
 * Windows are binary sensors of class window or opening; entities hidden in Home Assistant don't count.
 */
export function windowHeatRooms(hass) {
  const rooms = new Map();
  const of = (area) => rooms.get(area) || rooms.set(area, { area, windows: [], climates: [] }).get(area);
  for (const [id, st] of Object.entries(hass.states)) {
    if (hass.entities?.[id]?.hidden) continue;
    const area = areaIdOf(hass, id);
    if (!area) continue;
    if (id.startsWith("binary_sensor.") && st.state === "on" && ["window", "opening"].includes(st.attributes?.device_class)) of(area).windows.push(id);
    else if (id.startsWith("climate.") && isHeating(st)) of(area).climates.push(id);
  }
  return [...rooms.values()].filter((r) => r.windows.length && r.climates.length).sort((a, b) => a.area.localeCompare(b.area));
}

/** Window open, heating on: one pill per room. A tap opens the room's thermostat. */
function windowHeatPill(ctx, room) {
  const name = h("b", {});
  const sub = h("small", {});
  const el = h("div", { class: "hp-onpill notice warn on", role: "button", tabindex: "0", dataset: { key: `wh:${room.area}` } },
    h("span", { class: "hp-onpill-ic" }, icon("mdi:window-open-variant")), h("div", { class: "hp-onpill-text" }, name, sub));
  let climate = room.climates[0];
  bindTapHold(el, { canStart: () => !ctx.editing, tap: () => ctx.openDetails(climate), hold: () => ctx.openDetails(climate) });
  el.update = (hass, r = room) => {
    climate = r.climates[0];
    // The room up front (short enough for the pill), what is wrong below.
    const areaName = hass.areas?.[r.area]?.name || "";
    name.textContent = areaName || t("wh_title");
    sub.textContent = [areaName ? t("wh_title") : null, r.windows.length > 1 ? t("wh_n_windows", { n: r.windows.length }) : null].filter(Boolean).join(" · ");
  };
  el.update(ctx.hass);
  return el;
}

/** Whether Home warns about open windows while heating (on unless switched off in the settings). */
export const windowHeatOn = (ctx) => ctx.settings.s.windowHeat !== false;

/** From here on a room asks for fresh air: CO2 in ppm, humidity in %. */
export const CO2_HIGH = 1400;
export const HUMID_HIGH = 70;

/**
 * Rooms that should be aired: [{ area, co2, co2Id, humidity, humidityId }] with CO2 or humidity at or above the limit.
 * Outdoor rooms and outdoor sensors don't count, nor rooms with a window already open.
 */
export function airRooms(hass) {
  const rooms = new Map();
  const of = (area) => rooms.get(area) || rooms.set(area, { area, co2: null, co2Id: null, humidity: null, humidityId: null, open: false }).get(area);
  for (const [id, st] of Object.entries(hass.states)) {
    if (hass.entities?.[id]?.hidden) continue;
    const area = areaIdOf(hass, id);
    if (!area) continue;
    const dc = st.attributes?.device_class;
    if (id.startsWith("binary_sensor.") && st.state === "on" && ["window", "opening"].includes(dc)) { of(area).open = true; continue; }
    if (!id.startsWith("sensor.") || !["carbon_dioxide", "humidity"].includes(dc)) continue;
    if (OUTSIDE.test(`${st.attributes.friendly_name || ""} ${id}`)) continue;
    const v = Number(st.state);
    if (st.state === "" || !Number.isFinite(v)) continue;
    const r = of(area);
    if (dc === "carbon_dioxide" && (r.co2 == null || v > r.co2)) { r.co2 = v; r.co2Id = id; }
    if (dc === "humidity" && v <= 100 && (r.humidity == null || v > r.humidity)) { r.humidity = v; r.humidityId = id; }
  }
  const outdoor = (area) => {
    const a = hass.areas?.[area];
    return !a || isOutdoorRoom({ name: a.name, floor: hass.floors?.[a.floor_id] });
  };
  return [...rooms.values()]
    .filter((r) => !r.open && !outdoor(r.area) && ((r.co2 ?? 0) >= CO2_HIGH || (r.humidity ?? 0) >= HUMID_HIGH))
    .map(({ open, ...r }) => r)
    .sort((a, b) => a.area.localeCompare(b.area));
}

/** "CO₂ 1,520 ppm" and/or "Humidity 74 %": only the values over the limit. */
export function airText(hass, r) {
  return [
    (r.co2 ?? 0) >= CO2_HIGH ? t("air_co2", { v: formatNumber(hass, r.co2, 0) }) : null,
    (r.humidity ?? 0) >= HUMID_HIGH ? t("air_humid", { v: formatNumber(hass, r.humidity, 0) }) : null,
  ].filter(Boolean).join(" · ");
}

/** Please air the room: one pill per room. A tap opens the sensor. */
function airPill(ctx, room) {
  const name = h("b", {});
  const sub = h("small", {});
  const ic = icon("mdi:weather-windy");
  const el = h("div", { class: "hp-onpill notice air on", role: "button", tabindex: "0", dataset: { key: `air:${room.area}` } },
    h("span", { class: "hp-onpill-ic" }, ic), h("div", { class: "hp-onpill-text" }, name, sub));
  let r = room;
  const target = () => ((r.co2 ?? 0) >= CO2_HIGH ? r.co2Id : r.humidityId);
  bindTapHold(el, { canStart: () => !ctx.editing, tap: () => ctx.openDetails(target()), hold: () => ctx.openDetails(target()) });
  el.update = (hass, next = r) => {
    r = next;
    const areaName = hass.areas?.[r.area]?.name || "";
    name.textContent = areaName || t("air_title");
    sub.textContent = [t("air_title"), airText(hass, r)].join(" · ");
    ic.icon = (r.co2 ?? 0) >= CO2_HIGH ? "mdi:molecule-co2" : "mdi:water-percent";
  };
  el.update(ctx.hass);
  return el;
}

/** Whether Home asks to air rooms (on unless switched off in the settings). */
export const airOn = (ctx) => ctx.settings.s.airHint !== false;

/**
 * Smoke, gas and leak sensors (binary sensors), without the ones hidden in Home Assistant.
 * With `ids` (the panel's security items) only those count, the same detectors the security popup shows,
 * so a pool's or a machine's own "gas" sensor outside the house stays out.
 */
const hazardSensors = (hass, ids = null) => (ids || Object.keys(hass.states)).filter((id) => id.startsWith("binary_sensor.") && hass.states[id]
  && HAZARD.includes(hass.states[id].attributes?.device_class) && !hass.entities?.[id]?.hidden);

/** Detectors that raise the alarm right now. */
export const hazardAlarms = (hass, ids = null) => hazardSensors(hass, ids).filter((id) => hass.states[id].state === "on");

/** A detector's battery is low from here on (in %). */
export const HAZARD_BATT_LOW = 20;

/**
 * Detectors with a weak battery: [{ id, battId, level }], level in % or null for a plain "low" sensor.
 * The battery is any battery sensor of the same device. Devices put aside under Maintenance don't count.
 */
export function hazardBatteries(hass, ignore = [], ids = null) {
  const out = [];
  const seen = new Set();
  for (const id of hazardSensors(hass, ids)) {
    const dev = hass.entities?.[id]?.device_id;
    if (!dev || seen.has(dev) || ignore.includes(dev)) continue;
    seen.add(dev);
    for (const e of Object.values(hass.entities || {})) {
      if (e.device_id !== dev) continue;
      const st = hass.states[e.entity_id];
      if (st?.attributes?.device_class !== "battery") continue;
      if (e.entity_id.startsWith("binary_sensor.") && st.state === "on") { out.push({ id, battId: e.entity_id, level: null }); break; }
      const v = Number(st.state);
      if (e.entity_id.startsWith("sensor.") && st.state !== "" && Number.isFinite(v) && v <= HAZARD_BATT_LOW) { out.push({ id, battId: e.entity_id, level: v }); break; }
    }
  }
  return out;
}

/** Whether Home shows detector alarms and weak detector batteries (on unless switched off). */
export const hazardOn = (ctx) => ctx.settings.s.hazardHint !== false;

/** A detector raising the alarm, in red: the room up front, what it found below. A tap opens it. */
function hazardPill(ctx, id) {
  const name = h("b", {});
  const sub = h("small", {});
  const ic = icon("mdi:alert");
  const el = h("div", { class: "hp-onpill notice alarm on", role: "button", tabindex: "0", dataset: { key: `hz:${id}` } },
    h("span", { class: "hp-onpill-ic" }, ic), h("div", { class: "hp-onpill-text" }, name, sub));
  bindTapHold(el, { canStart: () => !ctx.editing, tap: () => ctx.openDetails(id), hold: () => ctx.openDetails(id) });
  el.update = (hass) => {
    const hz = hazardInfo(hass, [id]);
    const room = hass.areas?.[areaIdOf(hass, id)]?.name;
    ic.icon = hz.alarmIcon;
    name.textContent = room || entityName(hass, id);
    sub.textContent = hz.alarm;
  };
  el.update(ctx.hass);
  return el;
}

/** A detector whose battery runs low: room, kind and level. A tap opens the battery. */
function hazardBattPill(ctx, item) {
  const name = h("b", {});
  const sub = h("small", {});
  const el = h("div", { class: "hp-onpill notice batt on", role: "button", tabindex: "0", dataset: { key: `hzb:${item.id}` } },
    h("span", { class: "hp-onpill-ic" }, icon("mdi:battery-alert-variant-outline")), h("div", { class: "hp-onpill-text" }, name, sub));
  let it = item;
  bindTapHold(el, { canStart: () => !ctx.editing, tap: () => ctx.openDetails(it.battId), hold: () => ctx.openDetails(it.battId) });
  el.update = (hass, next = it) => {
    it = next;
    // The detector by its name, the level and its room below.
    const room = hass.areas?.[areaIdOf(hass, it.id)]?.name;
    name.textContent = entityName(hass, it.id);
    const level = it.level == null ? t("low") : `${formatNumber(hass, it.level, 0)} %`;
    sub.textContent = [t("hz_batt", { v: level }), room].filter(Boolean).join(" · ");
  };
  el.update(ctx.hass);
  return el;
}

/** One notice as a pill: tap opens the details, a weather warning its own text; a helper switch is cleared with its icon. */
function noticePill(ctx, id) {
  const ic = icon("mdi:bell-outline");
  const name = h("b", {});
  const sub = h("small", {});
  const clear = domainOf(id) === "input_boolean";
  const lead = clear ? h("button", { class: "hp-onpill-ic", "aria-label": t("notice_done"), title: t("notice_done") }, ic) : h("span", { class: "hp-onpill-ic" }, ic);
  const el = h("div", { class: "hp-onpill notice on", role: "button", tabindex: "0", dataset: { key: id } }, lead, h("div", { class: "hp-onpill-text" }, name, sub));
  const room = ctx.model.areaById.get(ctx.model.areaOf[id])?.name;
  if (clear) {
    lead.addEventListener("pointerdown", (e) => e.stopPropagation());
    lead.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!ctx.editing) ctx.hass.callService("input_boolean", "turn_off", { entity_id: id });
    });
  }
  // A weather or civil-protection warning says more than its state: the headline below, the full text on a tap.
  let warns = [];
  const open = () => (warns.length ? openWarnings(ctx, id) : ctx.openDetails(id));
  bindTapHold(el, { canStart: () => !ctx.editing, tap: open, hold: open });
  el.update = (hass) => {
    const st = hass.states[id];
    if (!st) return;
    warns = warningInfo(hass, id) || [];
    ic.icon = clear ? "mdi:check" : entityIcon(hass, st);
    name.textContent = entityName(hass, id, room);
    // A warning headline is a sentence, so the pill takes two columns like the other warning pills.
    el.classList.toggle("wide", warns.length > 0);
    if (warns.length) sub.textContent = [room, warningLine(warns)].filter(Boolean).join(" · ");
    else sub.textContent = clear ? room || t("notice_done_hint") : [room, stateText(hass, st)].filter(Boolean).join(" · ");
  };
  el.update(ctx.hass);
  return el;
}

/** What one notice says right now: a warning its headline, anything else its state. */
const noticeState = (hass, id) => {
  const warns = warningInfo(hass, id) || [];
  return warns.length ? warningLine(warns) : stateText(hass, hass.states[id]);
};

/** A tap on a notice: a weather warning shows its own text, anything else its details. */
const openNotice = (ctx, id) => ((warningInfo(ctx.hass, id) || []).length ? openWarnings(ctx, id) : ctx.openDetails(id));

/** The group popup: one line per notice of the group that shows right now, with its state. */
export function openNoticeGroup(ctx, entry) {
  const sheet = openSheet(ctx, { title: entry.group, subtitle: t("notices"), cls: "qsheet" });
  const list = h("div", { class: "hp-qlist" });
  sheet.body.append(list);
  const mine = (hass) => activeNotices(hass, ctx.settings.s.notices).filter((n) => groupKey(n) === entry.key).map((n) => n.id);

  let rows = [];
  const build = (hass, ids) => {
    rows = ids.map((id) => {
      const ic = icon("mdi:bell-outline");
      const name = h("b", {});
      const state = h("small", {});
      // A helper is cleared right here, like the tick on its own pill.
      let done = null;
      if (domainOf(id) === "input_boolean") {
        done = h("button", { class: "hp-round ghost small", "aria-label": t("notice_done"), title: t("notice_done") }, icon("mdi:check"));
        done.addEventListener("click", (e) => { e.stopPropagation(); ctx.hass.callService("input_boolean", "turn_off", { entity_id: id }); });
      }
      const el = h("div", { class: "hp-qrow", role: "button", tabindex: "0" },
        h("span", { class: "hp-qrow-ic" }, ic), h("div", { class: "hp-qrow-text" }, name, state), done);
      el.addEventListener("click", (e) => { if (!e.target.closest("button")) openNotice(ctx, id); });
      el.upd = (hs) => {
        const st = hs.states[id];
        if (!st) return;
        ic.icon = entityIcon(hs, st);
        name.textContent = entityName(hs, id);
        state.textContent = noticeState(hs, id);
      };
      return el;
    });
    list.replaceChildren(...(rows.length ? rows : [h("div", { class: "hp-qempty" }, t("notice_group_none"))]));
  };

  let sig = null;
  const draw = (hass) => {
    const ids = mine(hass);
    const next = ids.join();
    if (next !== sig) {
      sig = next;
      build(hass, ids);
    }
    rows.forEach((r) => r.upd(hass));
  };
  draw(ctx.hass);
  sheet.updaters.push(draw);
  return sheet;
}

/** A group of notices as one pill: the group's name, below it the ones that show right now. */
function groupPill(ctx, entry) {
  const ic = icon("mdi:bell-outline");
  const name = h("b", {});
  const sub = h("small", {});
  const el = h("div", { class: "hp-onpill notice on", role: "button", tabindex: "0", dataset: { key: `ng:${entry.key}` } },
    h("span", { class: "hp-onpill-ic" }, ic), h("div", { class: "hp-onpill-text" }, name, sub));
  let e = entry;
  const open = () => openNoticeGroup(ctx, e);
  bindTapHold(el, { canStart: () => !ctx.editing, tap: open, hold: open });
  el.update = (hass, next = e) => {
    e = next;
    const first = hass.states[e.ids[0]];
    ic.icon = first ? entityIcon(hass, first) : "mdi:bell-outline";
    name.textContent = e.group;
    sub.textContent = shortNames(e.ids.map((id) => entityName(hass, id))).join(", ");
  };
  el.update(ctx.hass);
  return el;
}

/** The notices on Home: hidden while none of them shows. */
export function noticesBlock(ctx) {
  const box = h("div", { class: "hp-onnow" });
  const el = h("section", { class: "hp-onnow-sec hp-notices" }, h("div", { class: "hp-label hp-home-label" }, t("notices")), box);
  let sig = null;
  let pills = [];
  let whPills = [];
  let airPills = [];
  let hzPills = [];
  let hzbPills = [];
  el.update = (hass) => {
    const now = activeNotices(hass, ctx.settings.s.notices).map((n) => n.id);
    // Notices of the same group that show at the same time become one pill.
    const groups = groupNotices(ctx.settings.s.notices, now);
    const wh = windowHeatOn(ctx) ? windowHeatRooms(hass) : [];
    const air = airOn(ctx) ? airRooms(hass) : [];
    const secIds = ctx.securityItems?.() || null;
    const hz = hazardOn(ctx) ? hazardAlarms(hass, secIds) : [];
    const hzb = hazardOn(ctx) ? hazardBatteries(hass, ctx.settings.s.maintIgnore || [], secIds) : [];
    const next = `${hz}|${hzb.map((b) => b.id)}|${wh.map((r) => r.area)}|${air.map((r) => r.area)}|${groups.map((g) => (g.ids ? `${g.key}=${g.ids}` : g.id))}`;
    if (next !== sig) {
      sig = next;
      // An alarm comes first, then a weak battery, then the rest.
      hzPills = hz.map((id) => hazardPill(ctx, id));
      hzbPills = hzb.map((b) => hazardBattPill(ctx, b));
      whPills = wh.map((r) => windowHeatPill(ctx, r));
      airPills = air.map((r) => airPill(ctx, r));
      pills = groups.map((g) => (g.ids ? groupPill(ctx, g) : noticePill(ctx, g.id)));
      box.replaceChildren(...hzPills, ...hzbPills, ...whPills, ...airPills, ...pills);
    }
    hzPills.forEach((p) => p.update(hass));
    hzbPills.forEach((p, i) => p.update(hass, hzb[i]));
    whPills.forEach((p, i) => p.update(hass, wh[i]));
    airPills.forEach((p, i) => p.update(hass, air[i]));
    pills.forEach((p, i) => p.update(hass, groups[i]));
    el.hidden = !now.length && !wh.length && !air.length && !hz.length && !hzb.length;
  };
  el.update(ctx.hass);
  ctx.live.push(el);
  return el;
}

/** Settings: pick the notices, and for sensors and lists the state they show at. */
export function noticesSection(ctx, S, draw, state, { section, row }) {
  const hass = ctx.hass;
  const list = S.s.notices || [];
  const change = (fn) => { S.update((x) => { x.notices = fn([...(x.notices || [])]); }); draw(); };
  const name = (id) => entityName(hass, id) || id;

  const rows = list.filter((n) => hass.states[n.id]).map((n) => {
    const st = hass.states[n.id];
    const set = (when) => change((all) => all.map((x) => (x.id === n.id ? { ...x, when } : x)));
    const remove = h("button", { class: "hp-round ghost danger", "aria-label": t("remove") }, icon("mdi:delete-outline"));
    remove.addEventListener("click", () => change((all) => all.filter((x) => x.id !== n.id)));
    const options = st.attributes.options;
    let control;
    if (isOnOff(n.id)) {
      control = h("span", { class: "hp-muted small" }, t("notice_when_on"));
    } else if (Array.isArray(options) && options.length) {
      control = h("select", { class: "hp-select" }, h("option", { value: "" }, t("notice_pick")),
        ...options.map((o) => h("option", { value: o, selected: (n.when || [])[0] === o }, o)));
      control.addEventListener("change", () => set(control.value ? [control.value] : []));
    } else {
      control = h("input", { class: "hp-input", placeholder: t("notice_when_ph"), value: (n.when || []).join(", ") });
      control.addEventListener("change", () => set(parseWhen(control.value)));
      control.addEventListener("keydown", (e) => { if (e.key === "Enter") control.blur(); });
    }
    // A group of its own makes several notices that show at once one pill, like all the pollen sensors.
    const group = h("input", { class: "hp-input hp-notice-group", placeholder: t("notice_group_ph"), "aria-label": t("notice_group"), title: t("notice_group"), value: n.group || "" });
    const setGroup = (v) => change((all) => all.map((x) => {
      if (x.id !== n.id) return x;
      const { group: old, ...rest } = x;
      return v ? { ...rest, group: v } : rest;
    }));
    group.addEventListener("change", () => { if (group.value.trim() !== (n.group || "")) setGroup(group.value.trim()); });
    group.addEventListener("keydown", (e) => { if (e.key === "Enter") group.blur(); });
    const now = `${n.id} · ${t("notice_now", { state: isOnOff(n.id) ? stateText(hass, st) : st.state })}`;
    const sub = isOnOff(n.id) || (n.when || []).length ? now : `${t("notice_need_when")} ${now}`;
    const r = row(name(n.id), h("div", { class: "hp-notice-ctl" }, h("div", { class: "hp-notice-when" }, control, group), remove), sub);
    r.classList.add("stack");
    return r;
  });

  // Adding: search all entities, helpers included.
  const picked = new Set(list.map((n) => n.id));
  const results = h("div", {});
  const search = h("input", { class: "hp-input", type: "search", placeholder: t("search_entities"), value: state.noticeQuery || "" });
  const drawResults = () => {
    const q = (state.noticeQuery || "").trim().toLowerCase();
    results.replaceChildren();
    if (!q) return;
    const hits = candidateEntities(hass).filter((id) => !picked.has(id) && (id.toLowerCase().includes(q) || name(id).toLowerCase().includes(q)))
      .sort((a, b) => name(a).localeCompare(name(b)));
    for (const id of hits.slice(0, 12)) {
      const add = h("button", { class: "hp-round ghost", "aria-label": t("add") }, icon("mdi:plus"));
      add.addEventListener("click", () => { state.noticeQuery = ""; change((all) => [...all, { id, when: [] }]); });
      results.append(row(name(id), add, `${id} · ${stateText(hass, hass.states[id])}`));
    }
    if (!hits.length) results.append(h("div", { class: "hp-muted small" }, t("none_found")));
  };
  search.addEventListener("input", () => { state.noticeQuery = search.value; drawResults(); });
  drawResults();

  // Built in: open windows while the heating runs (for the whole house, on by default).
  const whOn = S.s.windowHeat !== false;
  const wh = row(t("wh_setting"), toggleSwitch(whOn, () => { S.update((x) => { x.windowHeat = !whOn; }); draw(); }), t("wh_setting_hint"));

  const airIsOn = S.s.airHint !== false;
  const air = row(t("air_setting"), toggleSwitch(airIsOn, () => { S.update((x) => { x.airHint = !airIsOn; }); draw(); }), t("air_setting_hint"));

  const hzIsOn = S.s.hazardHint !== false;
  const hz = row(t("hz_setting"), toggleSwitch(hzIsOn, () => { S.update((x) => { x.hazardHint = !hzIsOn; }); draw(); }), t("hz_setting_hint"));

  return section(t("notices"), h("p", { class: "hp-muted small" }, t("notices_hint")), hz, wh, air,
    ...(rows.length ? rows : [h("div", { class: "hp-muted small" }, t("notices_none"))]), search, results);
}
