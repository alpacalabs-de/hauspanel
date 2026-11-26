// Widgets for the left panel of the Sidebar layout: weather, what's coming up, home status, scenes, room list, cameras.
// Each one can be switched on or off in Settings → Layout.
import { h, icon, formatNumber, formatTime, formatDate, sameDay, addDays, startOfDay, entityName } from "./util.js";
import { liveVideo, snapshotUrl, trackAspect, openCameraFull } from "./camera.js";
import { WEATHER_ICONS } from "./domains.js";
import { openWeather } from "./weather.js";
import { openCalendar } from "./agenda.js";
import { homeSecurity } from "./securityview.js";
import { t } from "./i18n.js";

// scenesBig: one large scene button per row instead of two small ones. cameras: the chosen camera.* ids, in order.
// agendaMax: how many events (0 = as many as fit next to the rest). agendaDays: how far ahead, 1 = today only.
export const SIDE_DEFAULTS = { weather: true, agenda: true, status: true, scenes: true, scenesBig: false, onnow: false, rooms: false, camera: false, cameras: [], agendaMax: 0, agendaDays: 14 };
export const AGENDA_MAX = [0, 3, 5, 8, 12];
export const AGENDA_DAYS = [1, 3, 7, 14];

/** The events the panel lists: not over yet, starting within `days` days from today, at most `max`. */
export function sideEvents(events, now, { max = 4, days = 14 } = {}) {
  const today = startOfDay(now);
  const until = addDays(today, Math.max(1, days || 14));
  return (events || []).filter((e) => (e.allDay ? e.end > today : e.end > now) && e.start < until).slice(0, Math.max(1, max || 4));
}

/** The chosen cameras that exist, in their order. */
export function sideCameras(hass, side) {
  return [...new Set(Array.isArray(side?.cameras) ? side.cameras : [])].filter((id) => typeof id === "string" && id.startsWith("camera.") && hass.states[id]);
}

/** The chosen cameras live, one below the other; a tap shows one full screen. Streams end when the panel is redrawn. */
function camerasWidget(ctx, ids) {
  const el = h("div", { class: "hp-side-cams" });
  for (const id of ids) {
    const st = ctx.hass.states[id];
    const still = h("img", { class: "hp-cam-still", alt: "" });
    const url = snapshotUrl(st);
    if (url) still.src = url;
    const cam = h("div", { class: "hp-side-cam", role: "button", tabindex: "0", dataset: { key: id } }, still,
      h("span", { class: "hp-side-cam-name" }, entityName(ctx.hass, id)),
      // Shows only while frames really arrive (the live picture marks itself "playing").
      h("span", { class: "hp-pr-badge hp-side-cam-live" }, h("i"), t("live")));
    // The frame takes the camera's shape: from the still first, from the live picture once it runs.
    still.addEventListener("load", () => {
      if (!cam.classList.contains("live-sized") && still.naturalWidth && still.naturalHeight) cam.style.setProperty("--ar", (still.naturalWidth / still.naturalHeight).toFixed(4));
    });
    if (st.state !== "unavailable") {
      const video = liveVideo(ctx, id);
      cam.insertBefore(video, cam.lastChild);
      trackAspect(cam, video, { fit: "contain" });
      cam.update = (hass) => video.update(hass);
      ctx.live.push(cam);
    } else cam.classList.add("unavail");
    cam.addEventListener("click", () => !ctx.editing && openCameraFull(ctx, id, ids));
    el.append(cam);
  }
  return el;
}

/** Now, high/low and the next hours; tap opens the full forecast. */
function weatherWidget(ctx) {
  const el = h("div", { class: "hp-side-wx", role: "button", tabindex: "0" });
  el.addEventListener("click", () => !ctx.editing && openWeather(ctx));
  el.sideRefresh = () => {
    const c = ctx.weather.current();
    el.hidden = !c;
    if (!c) return;
    const n = (v) => (v != null ? `${formatNumber(ctx.hass, v, 0)}°` : "–");
    const hours = ctx.weather.hourly.filter((x) => new Date(x.datetime) > new Date()).filter((_, i) => i % 2 === 0).slice(0, 5);
    const sig = JSON.stringify([c.temperature, c.condition, c.high, c.low, hours.map((x) => [x.datetime, x.temperature, x.condition])]);
    if (el.dataset.sig === sig) return;
    el.dataset.sig = sig;
    el.replaceChildren(...[
      h("div", { class: "hp-side-wx-now" },
        icon(WEATHER_ICONS[c.condition] || "mdi:weather-partly-cloudy", "hp-side-wx-icon"),
        h("div", {}, h("b", {}, n(c.temperature)), h("small", {}, c.label)),
        h("div", { class: "hp-side-wx-hl" }, h("span", {}, `↑ ${n(c.high)}`), h("span", {}, `↓ ${n(c.low)}`))),
      hours.length
        ? h("div", { class: "hp-side-wx-hours" }, hours.map((x) =>
          h("div", {}, h("small", {}, formatTime(ctx.hass, new Date(x.datetime)).replace(/:00(?=\D|$)/, "")),
            icon(WEATHER_ICONS[x.condition] || "mdi:weather-cloudy"), h("b", {}, n(x.temperature)))))
        : null].filter(Boolean));
  };
  el.update = el.sideRefresh;
  el.sideRefresh();
  return el;
}

/** The next events (today, tomorrow, the days after) and reminders due today. */
function agendaWidget(ctx, max = 4, days = 14) {
  const el = h("div", { class: "hp-side-agenda", role: "button", tabindex: "0" });
  el.addEventListener("click", (e) => !ctx.editing && openCalendar(ctx));
  el.sideRefresh = () => {
    const now = new Date();
    const today = startOfDay(now);
    const evs = sideEvents(ctx.agenda.events, now, { max, days });
    const todos = [...ctx.agenda.overdue(), ...ctx.agenda.dueToday()].slice(0, 3);
    const dayLabel = (d) => (sameDay(d, now) || d < now ? t("today") : sameDay(d, addDays(today, 1)) ? t("tomorrow") : formatDate(ctx.hass, d, { weekday: "short", day: "numeric", month: "short" }));
    const rows = [];
    let last = "";
    for (const e of evs) {
      const label = dayLabel(e.start);
      if (label !== last) {
        rows.push(h("div", { class: "hp-side-day" }, label));
        last = label;
      }
      rows.push(h("div", { class: "hp-side-ev" },
        h("i", { style: { background: ctx.agenda.color(e.cal) } }),
        h("span", {}, e.summary),
        h("small", {}, e.allDay ? t("all_day") : formatTime(ctx.hass, e.start))));
    }
    if (todos.length) {
      rows.push(h("div", { class: "hp-side-day" }, t("reminders")));
      for (const i of todos) rows.push(h("div", { class: "hp-side-ev todo" }, icon("mdi:checkbox-blank-circle-outline"), h("span", {}, i.summary)));
    }
    el.replaceChildren(h("div", { class: "hp-label" }, icon("mdi:calendar-blank-outline"), t("upcoming")),
      ...(rows.length ? rows : [h("div", { class: "hp-muted small" }, t("no_upcoming"))]));
  };
  el.update = () => {};
  el.sideRefresh();
  return el;
}

/** The parts of the panel, in order, separated by thin lines. */
export function sideWidgets(ctx, { statusBlock, roomNav, selected, scenes, onNow }) {
  const on = { ...SIDE_DEFAULTS, ...(ctx.settings.s.side || {}) };
  // The Rooms tab needs the room list to pick a room.
  const needRooms = selected && selected !== "overview";
  const parts = [];
  if (on.weather) parts.push(weatherWidget(ctx));
  // With the security chips under the home status there is room for three events.
  if (on.agenda && (ctx.agenda.calendars().length || ctx.agenda.todoLists().length)) parts.push(agendaWidget(ctx,
    on.agendaMax > 0 ? on.agendaMax : on.status && on.scenes && ctx.allScenes().length ? 2 : on.status ? 3 : 4, on.agendaDays));
  if (on.status) {
    // Gates, garage, locks and doors (lights and the rest are in the categories on the right).
    const sec = homeSecurity(ctx);
    if (sec) parts.push(h("div", { class: "hp-side-status" }, sec));
  }
  // Scenes, small, under gates and locks (on every page, so they are always at hand).
  if (on.scenes && scenes) {
    const sc = scenes();
    if (sc) parts.push(h("div", { class: `hp-side-scenes ${on.scenesBig ? "big" : ""}` }, sc));
  }
  // What is on right now (lights, sockets, machines), small and two per row, when switched on for this panel.
  if (on.onnow && onNow) parts.push(h("div", { class: "hp-side-onnow" }, onNow()));
  if (on.rooms || needRooms) parts.push(roomNav(ctx, selected, { overview: true }));
  // Cameras last, live; the panel scrolls when they do not fit.
  const cams = on.camera ? sideCameras(ctx.hass, on) : [];
  if (cams.length) parts.push(camerasWidget(ctx, cams));
  for (const p of parts) if (p.sideRefresh) ctx.live.push(p);
  const out = [];
  parts.forEach((p, i) => {
    if (i) out.push(h("div", { class: "hp-side-sep" }));
    out.push(p);
  });
  return out;
}
