// Timers: "off in 30 minutes" for lights, switches and fans. Home Assistant runs them (see timers.py),
// so they fire with the tablet off; the panel shows and sets them.
import { h, icon, formatTime, domainOf } from "./util.js";
import { t } from "./i18n.js";

export const TIMER_DOMAINS = ["light", "switch", "fan", "input_boolean", "cover"];
export const TIMER_MINUTES = [15, 30, 60, 120];
// Airing rarely takes an hour, so a window starts shorter and stops at one.
export const WINDOW_MINUTES = [10, 15, 30, 60];
const CLOSE_FEATURE = 2; // CoverEntityFeature.CLOSE

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

/** In the device popup: "Off in 15 / 30 / 60 min / 2 h" while it is on, or the running timer with Cancel. */
export function timerBlock(ctx, entityId) {
  const el = h("div", { class: "hp-timer" });
  const window = domainOf(entityId) === "cover";
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
    if (at) {
      const cancel = h("button", { class: "hp-chip" }, icon("mdi:close"), t("timer_cancel"));
      cancel.addEventListener("click", () => ctx.timers.cancel(entityId).catch(() => ctx.toast(t("timer_failed"))));
      btns.append(cancel);
    } else {
      for (const n of (window ? WINDOW_MINUTES : TIMER_MINUTES)) {
        const b = h("button", { class: "hp-chip" }, leftText(n));
        b.addEventListener("click", () => ctx.timers.set(entityId, n).catch(() => ctx.toast(t("timer_failed"))));
        btns.append(b);
      }
    }
    el.replaceChildren(label, btns);
    return el;
  };
  el.update = (hass) => draw(hass);
  draw(ctx.hass);
  return el;
}

export const canHaveTimer = (entityId, hass) =>
  TIMER_DOMAINS.includes(domainOf(entityId)) && (domainOf(entityId) !== "cover" || isWindowCover(hass, entityId));
