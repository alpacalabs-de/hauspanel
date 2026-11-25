// Timers: "off in 30 minutes" for lights, switches and fans. Home Assistant runs them (see timers.py),
// so they fire with the tablet off; the panel shows and sets them.
import { h, icon, formatTime, domainOf } from "./util.js";
import { t } from "./i18n.js";

export const TIMER_DOMAINS = ["light", "switch", "fan", "input_boolean", "cover"];
export const TIMER_MINUTES = [15, 30, 60, 120];
// Airing rarely takes an hour, so a window starts shorter and stops at one.
export const WINDOW_MINUTES = [10, 15, 30, 60];
const CLOSE_FEATURE = 2; // CoverEntityFeature.CLOSE
// "Other time": quarter-hour steps up to the 12 hours Home Assistant takes (MAX_MINUTES in timers.py).
export const CUSTOM_STEP = 15;
export const CUSTOM_MAX = 12 * 60;

/** Where "Other time" starts: the longest of the fixed times. */
export const customStart = (window) => (window ? WINDOW_MINUTES : TIMER_MINUTES).at(-1);

/** One step shorter (dir -1) or longer (+1), on the quarter hour, between 15 minutes and 12 hours. */
export function customStep(minutes, dir) {
  const q = dir > 0 ? Math.floor(minutes / CUSTOM_STEP) + 1 : Math.ceil(minutes / CUSTOM_STEP) - 1;
  return Math.min(CUSTOM_MAX, Math.max(CUSTOM_STEP, q * CUSTOM_STEP));
}

/**
 * Only a motorized window may close on a timer. A garage door, a gate, a plain door or a shade
 * never gets one: closing those on a timer is nothing to do by accident.
 */
export function isWindowCover(hass, entityId) {
  if (domainOf(entityId) !== "cover") return false;
  const a = hass?.states?.[entityId]?.attributes || {};
  return a.device_class === "window" && !!(Number(a.supported_features) & CLOSE_FEATURE);
}

/** A window is "open" for the timer as long as it is not closed. */
const isOpen = (st) => !!st && !["closed", "unavailable", "unknown"].includes(st.state);

/** Minutes left, rounded up (a timer with 10 seconds left still says 1 min). */
export function minutesLeft(at, now = Date.now()) {
  return Math.max(1, Math.ceil((new Date(at).getTime() - now) / 60000));
}

/** "12 min" or "1 h 20 min". */
export function leftText(n) {
  if (n < 60) return t("timer_min", { n });
  const hr = Math.floor(n / 60);
  const m = n % 60;
  return m ? t("timer_h_min", { h: hr, m }) : t("timer_h", { h: hr });
}

/** The panel's view of the running timers, kept up to date by Home Assistant. */
export class TimerClient {
  constructor(ctx, onChange) {
    this.ctx = ctx;
    this.onChange = onChange;
    this.map = {};
    this._tick = null;
  }

  async start() {
    try {
      this._unsub = await this.ctx.hass.connection.subscribeMessage((m) => {
        this.map = m.timers || {};
        this._ticking();
        this.onChange();
      }, { type: "hauspanel/timer/subscribe" });
    } catch {
      // Home Assistant still runs an older HausPanel without timers: nothing to show.
      this.map = {};
    }
  }

  /** While a timer runs, the minutes left are redrawn twice a minute. */
  _ticking() {
    const any = Object.keys(this.map).length > 0;
    if (any && !this._tick) this._tick = setInterval(() => this.onChange(), 30000);
    if (!any && this._tick) { clearInterval(this._tick); this._tick = null; }
  }

  at(entityId) {
    return this.map[entityId] || null;
  }

  set(entityId, minutes) {
    return this.ctx.hass.callWS({ type: "hauspanel/timer/set", entity_id: entityId, minutes });
  }

  cancel(entityId) {
    return this.ctx.hass.callWS({ type: "hauspanel/timer/cancel", entity_id: entityId });
  }
}

/** The tile's state text with the timer added: "On · off in 12 min", "Open · closes in 12 min". */
export function withTimer(ctx, entityId, text) {
  const at = ctx.timers?.at(entityId);
  if (!at) return text;
  const key = domainOf(entityId) === "cover" ? "timer_close_in" : "timer_off_in";
  return `${text} · ${t(key, { left: leftText(minutesLeft(at)) })}`;
}

/** For a group (the room popup's Light tile): "off in 12 min" for the timer that goes off first, or "". */
export function groupTimerText(ctx, ids) {
  const ats = ids.map((id) => ctx.timers?.at(id)).filter(Boolean).map((at) => new Date(at).getTime());
  return ats.length ? t("timer_off_in", { left: leftText(minutesLeft(Math.min(...ats))) }) : "";
}

/** In the device popup: "Off in 15 / 30 / 60 min / 2 h" or "Other time" while it is on, or the running timer with Cancel. */
export function timerBlock(ctx, entityId) {
  const el = h("div", { class: "hp-timer" });
  const window = domainOf(entityId) === "cover";
  let custom = null; // minutes while the "Other time" row is open
  const set = (n) => ctx.timers.set(entityId, n).catch(() => ctx.toast(t("timer_failed")));
  const draw = (hass) => {
    const st = hass.states[entityId];
    const at = ctx.timers?.at(entityId);
    const on = window ? isOpen(st) : st && !["off", "unavailable", "unknown"].includes(st.state);
    el.hidden = !at && !on;
    if (el.hidden) return el.replaceChildren();
    const running = window ? "timer_close_running" : "timer_running";
    const label = h("div", { class: "hp-timer-label" }, icon("mdi:timer-outline"),
      h("span", {}, at ? t(running, { time: formatTime(hass, new Date(at)), left: leftText(minutesLeft(at)) }) : t(window ? "timer_close_label" : "timer_label")));
    const btns = h("div", { class: "hp-timer-btns" });
    let row = null;
    if (at) {
      custom = null;
      const cancel = h("button", { class: "hp-chip" }, icon("mdi:close"), t("timer_cancel"));
      cancel.addEventListener("click", () => ctx.timers.cancel(entityId).catch(() => ctx.toast(t("timer_failed"))));
      btns.append(cancel);
    } else {
      for (const n of (window ? WINDOW_MINUTES : TIMER_MINUTES)) {
        const b = h("button", { class: "hp-chip" }, leftText(n));
        b.addEventListener("click", () => set(n));
        btns.append(b);
      }
      const other = h("button", { class: `hp-chip ${custom ? "active" : ""}`, "aria-expanded": String(!!custom) }, t("timer_custom"));
      other.addEventListener("click", () => { custom = custom ? null : customStart(window); draw(ctx.hass); });
      btns.append(other);
      if (custom) {
        const step = (dir) => () => { custom = customStep(custom, dir); draw(ctx.hass); };
        const less = h("button", { class: "hp-round small", "aria-label": t("timer_less"), disabled: custom <= CUSTOM_STEP }, icon("mdi:minus"));
        const more = h("button", { class: "hp-round small", "aria-label": t("timer_more"), disabled: custom >= CUSTOM_MAX }, icon("mdi:plus"));
        less.addEventListener("click", step(-1));
        more.addEventListener("click", step(1));
        const go = h("button", { class: "hp-chip active" }, t("timer_set"));
        go.addEventListener("click", () => { const n = custom; custom = null; set(n); draw(ctx.hass); });
        row = h("div", { class: "hp-timer-custom" }, less, h("b", { class: "hp-timer-value", "aria-live": "polite" }, leftText(custom)), more, go);
      }
    }
    el.replaceChildren(label, btns, ...(row ? [row] : []));
    return el;
  };
  el.update = (hass) => draw(hass);
  draw(ctx.hass);
  return el;
}

export const canHaveTimer = (entityId, hass) =>
  TIMER_DOMAINS.includes(domainOf(entityId)) && (domainOf(entityId) !== "cover" || isWindowCover(hass, entityId));
