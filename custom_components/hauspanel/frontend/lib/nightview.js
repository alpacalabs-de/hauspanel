// Night view for wall tablets: at night the tablet becomes a security screen. The chosen cameras live
// and large, the rest small, locks and gates, and the alarm. A tap shows the normal Home for two minutes.
import { h, icon, formatTime, formatDate, domainOf, entityName } from "./util.js";
import { t } from "./i18n.js";
import { liveVideo, snapshotUrl, trackAspect } from "./camera.js";
import { statusItems, cameraList, isAlert, secLabel, secIcon } from "./securityview.js";
import { saverLayout } from "./screensaver.js";
import { stateText } from "./domains.js";

/** How long Home stays after a tap before the night view comes back (seconds without a touch). */
export const NIGHT_PEEK_SEC = 120;
/** At most this many cameras live and large. */
export const NIGHT_MAX_BIG = 4;

/** "HH:MM" as minutes after midnight, or null. */
const toMin = (v) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(v ?? "").trim());
  return m && Number(m[1]) < 24 && Number(m[2]) < 60 ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/**
 * Whether it is night for this screen: by the sun (sun.sun below the horizon, without it 22:00 to 6:00)
 * or between two times of day (also across midnight, like 22:00 to 6:00).
 */
export function nightNow(dev, hass, now = new Date()) {
  if ((dev?.nightWhen || "sun") === "time") {
    const from = toMin(dev.nightFrom ?? "22:00");
    const to = toMin(dev.nightTo ?? "06:00");
    if (from == null || to == null || from === to) return false;
    const m = now.getHours() * 60 + now.getMinutes();
    return from < to ? m >= from && m < to : m >= from || m < to;
  }
  const s = hass?.states?.["sun.sun"]?.state;
  if (s === "below_horizon") return true;
  if (s === "above_horizon") return false;
  const hr = now.getHours();
  return hr >= 22 || hr < 6;
}

/** When the night ends, as a Date: the next sunrise, or the end time. */
export function nightEnds(dev, hass, now = new Date()) {
  if ((dev?.nightWhen || "sun") === "time") {
    const to = toMin(dev.nightTo ?? "06:00");
    if (to == null) return null;
    const d = new Date(now);
    d.setHours(Math.floor(to / 60), to % 60, 0, 0);
    if (d <= now) d.setDate(d.getDate() + 1);
    return d;
  }
  const r = hass?.states?.["sun.sun"]?.attributes?.next_rising;
  return r ? new Date(r) : null;
}

/**
 * How each camera shows: "big" (live), "small" (picture) or "off".
 * Without a choice the first two are big and the rest small.
 */
export function camModes(ids, chosen = {}) {
  const out = {};
  let big = 0;
  ids.forEach((id, i) => {
    let m = chosen[id] || (i < 2 ? "big" : "small");
    if (m === "big" && big >= NIGHT_MAX_BIG) m = "small";
    if (m === "big") big++;
    out[id] = m;
  });
  return out;
}

/** Whether the night view should come up now. */
export function nightDue({ on, night, layout, idleSec, sheets = 0, editing = false, hidden = false }) {
  return !!on && night && saverLayout(layout) && !editing && !sheets && !hidden && idleSec >= NIGHT_PEEK_SEC;
}

const ALARM_MODES = [["armed_home", "mdi:home-outline", "ov_mode_home"], ["armed_away", "mdi:home-export-outline", "ov_mode_away"], ["armed_night", "mdi:weather-night", "ov_mode_night"]];

/** The night view of one panel. tick() every second, activity() on each touch. */
export function nightView(ctx, root) {
  // Counts from the start, so a tablet switched on at night shows the night view after two minutes.
  let idle = 0;
  let el = null;
  let players = [];
  let sizers = []; // stop the --ar measuring of the big cameras
  let lastMin = -1;
  let forced = false; // shown from the settings: stays until a touch, day or night
  const dev = () => ctx.settings.device;
  const on = () => !!dev().night;

  const build = () => {
    const hass = ctx.hass;
    const time = h("div", { class: "hp-nv-time" });
    const sub = h("div", { class: "hp-nv-sub" });
    const status = h("div", { class: "hp-nv-status" });
    const head = h("div", { class: "hp-nv-head" }, time, sub, status);

    const { items } = cameraList(ctx);
    const modes = camModes(items, dev().nightCams || {});
    const big = items.filter((id) => modes[id] === "big");
    const small = items.filter((id) => modes[id] === "small");
    players = [];
    sizers = [];
    // Each big camera sits centred in its own cell and keeps its own shape, so nothing is cut off:
    // the cell is the container, the camera is as large as fits at its measured --ar (16/9 until then).
    const bigBox = big.length ? h("div", { class: `hp-nv-big n${big.length}` }, big.map((id) => {
      const v = liveVideo(ctx, id);
      players.push(v);
      const cam = h("div", { class: "hp-nv-cam" }, v, h("span", { class: "hp-nv-live" }, "LIVE"), h("span", { class: "hp-nv-name" }, entityName(hass, id)));
      sizers.push(trackAspect(cam, v, { fit: "contain" }));
      return h("div", { class: "hp-nv-cell" }, cam);
    })) : null;
    const smallImgs = [];
    const smallBox = small.length ? h("div", { class: "hp-nv-small" }, small.map((id) => {
      const img = h("img", { alt: "", src: snapshotUrl(hass.states[id]) });
      smallImgs.push([id, img]);
      return h("div", { class: "hp-nv-cam small" }, img, h("span", { class: "hp-nv-name" }, entityName(hass, id)));
    })) : null;

    // Locks, gates and garage doors always; doors and windows only while open.
    const s = statusItems(ctx);
    const things = [...s.locks, ...s.gates, ...s.doors];
    const thingBox = h("div", { class: "hp-nv-things" });
    const alarmId = s.alarm[0];
    const alarmBox = alarmId ? h("div", { class: "hp-nv-alarm" }) : null;

    const update = (hs) => {
      const now = new Date();
      time.textContent = formatTime(hs, now);
      const end = nightEnds(dev(), hs, now);
      sub.textContent = [formatDate(hs, now, { weekday: "long", day: "numeric", month: "long" }),
        end ? t((dev().nightWhen || "sun") === "time" ? "nv_until" : "nv_until_sun", { time: formatTime(hs, end) }) : null].filter(Boolean).join(" · ");
      const open = things.filter((id) => isAlert(hs, id));
      const shown = things.filter((id) => domainOf(id) !== "binary_sensor" || open.includes(id));
      status.classList.toggle("bad", open.length > 0);
      const alarmSt = alarmId ? hs.states[alarmId]?.state : null;
      const alarmTxt = alarmSt && alarmSt !== "disarmed" ? t(`ov_mode_${alarmSt.replace("armed_", "")}`) : null;
      status.replaceChildren(icon(open.length ? "mdi:shield-alert-outline" : "mdi:shield-check-outline"),
        h("span", {}, [open.length ? t("n_open", { n: open.length }) : t("sec_all_closed"), alarmTxt].filter(Boolean).join(" · ")));
      thingBox.replaceChildren(...shown.map((id) => {
        const bad = isAlert(hs, id);
        // Room on top, name and state under it, like the security popup.
        const lbl = secLabel(hs, ctx.model, id);
        const st = stateText(hs, hs.states[id]);
        const tile = h("button", { class: `hp-nv-thing ${bad ? "bad" : ""}` }, icon(secIcon(hs, id, bad)),
          h("span", {}, h("b", {}, lbl.room || lbl.name), h("small", {}, lbl.room ? `${lbl.name} · ${st}` : st)));
        tile.addEventListener("click", (e) => { e.stopPropagation(); hide(); ctx.openDetails(id); });
        return tile;
      }));
      if (alarmBox) {
        alarmBox.replaceChildren(...ALARM_MODES.map(([mode, ic, label]) => {
          const b = h("button", { class: `hp-nv-mode ${alarmSt === mode ? "on" : ""}` }, icon(ic), h("span", {}, t(label)));
          // The security popup arms and asks for the code, as everywhere else.
          b.addEventListener("click", (e) => { e.stopPropagation(); hide(); ctx.openSecurityPopup?.(); });
          return b;
        }));
      }
      players.forEach((p) => p.update?.(hs));
      for (const [id, img] of smallImgs) {
        const u = snapshotUrl(hs.states[id]);
        if (u && img.getAttribute("src") !== u) img.src = u;
      }
    };
    const foot = h("div", { class: "hp-nv-foot" }, t("nv_tap"));
    const bottom = h("div", { class: "hp-nv-bottom" }, thingBox, alarmBox);
    const view = h("div", { class: "hp-nv", role: "button", "aria-label": t("nv_title") }, head, bigBox, smallBox, bottom, foot);
    view.update = update;
    update(hass);
    return view;
  };

  const show = (force = false) => {
    forced = force;
    if (el) return;
    el = build();
    // A tap on an empty spot brings Home back for two minutes; tiles and alarm buttons do their own thing.
    el.addEventListener("click", () => hide());
    root.append(el);
    lastMin = -1;
    requestAnimationFrame(() => el?.classList.add("on"));
  };

  const hide = () => {
    idle = 0;
    if (!el) return;
    players.forEach((p) => p.stop?.());
    players = [];
    sizers.forEach((stop) => stop());
    sizers = [];
    const old = el;
    el = null;
    old.remove();
  };

  return {
    get shown() { return !!el; },
    /** Whether the screensaver should stay away now (night view on and set to take its place). */
    blocksSaver() {
      return on() && (dev().nightSaver || "replace") === "replace" && nightNow(dev(), ctx.hass);
    },
    tick() {
      if (el) {
        if (!forced && (!on() || !nightNow(dev(), ctx.hass) || ctx.sheets.size || ctx.editing || !saverLayout(ctx.layout))) return hide();
        const m = new Date().getSeconds() % 10;
        if (m !== lastMin) { lastMin = m; el.update(ctx.hass); }
        return;
      }
      idle++;
      if (nightDue({ on: on(), night: nightNow(dev(), ctx.hass), layout: ctx.layout, idleSec: idle, sheets: ctx.sheets.size, editing: ctx.editing, hidden: document.hidden })) show();
    },
    activity() {
      if (!el) idle = 0;
    },
    /** "Show now" in the settings. */
    tryNow: () => { hide(); show(true); },
    hide,
  };
}
