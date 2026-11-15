// Notices: entities you pick yourself ("Mail is here", "Washing done") that show on Home only while they say so.
import { h, icon, domainOf, bindTapHold, entityName, toggleSwitch } from "./util.js";
import { entityIcon, stateText } from "./domains.js";
import { candidateEntities } from "./model.js";
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

/** One notice as a pill: tap opens the details; a helper switch is cleared with its icon. */
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
  bindTapHold(el, { canStart: () => !ctx.editing, tap: () => ctx.openDetails(id), hold: () => ctx.openDetails(id) });
  el.update = (hass) => {
    const st = hass.states[id];
    if (!st) return;
    ic.icon = clear ? "mdi:check" : entityIcon(hass, st);
    name.textContent = entityName(hass, id, room);
    sub.textContent = clear ? room || t("notice_done_hint") : [room, stateText(hass, st)].filter(Boolean).join(" · ");
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
  el.update = (hass) => {
    const now = activeNotices(hass, ctx.settings.s.notices).map((n) => n.id);
    const wh = windowHeatOn(ctx) ? windowHeatRooms(hass) : [];
    const next = `${wh.map((r) => r.area)}|${now}`;
    if (next !== sig) {
      sig = next;
      whPills = wh.map((r) => windowHeatPill(ctx, r));
      pills = now.map((id) => noticePill(ctx, id));
      box.replaceChildren(...whPills, ...pills);
    }
    whPills.forEach((p, i) => p.update(hass, wh[i]));
    pills.forEach((p) => p.update(hass));
    el.hidden = !now.length && !wh.length;
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
    const now = `${n.id} · ${t("notice_now", { state: isOnOff(n.id) ? stateText(hass, st) : st.state })}`;
    const sub = isOnOff(n.id) || (n.when || []).length ? now : `${t("notice_need_when")} ${now}`;
    const r = row(name(n.id), h("div", { class: "hp-notice-ctl" }, control, remove), sub);
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

  return section(t("notices"), h("p", { class: "hp-muted small" }, t("notices_hint")), wh,
    ...(rows.length ? rows : [h("div", { class: "hp-muted small" }, t("notices_none"))]), search, results);
}
