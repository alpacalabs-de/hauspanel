// Screensaver for wall tablets: after a while without a touch, a calm screen with the time, the weather
// and what is left of today. A tap (or the doorbell) brings HausPanel back. Dimmed at night.
import { h, icon, formatTime, formatDate, formatNumber } from "./util.js";
import { WEATHER_ICONS } from "./domains.js";
import { t } from "./i18n.js";

/** Minutes to choose from in Settings → This screen (0 = off). */
export const SAVER_MINUTES = [0, 2, 5, 15, 30];

/** Night: sun.sun below the horizon, or without it 22:00 to 6:00. */
export function isNight(hass, now = new Date()) {
  const s = hass?.states?.["sun.sun"]?.state;
  if (s === "below_horizon") return true;
  if (s === "above_horizon") return false;
  const hr = now.getHours();
  return hr >= 22 || hr < 6;
}

/** Layouts that get a screensaver: the wall layouts, not the phone and not the security screen (it has its own). */
export const saverLayout = (layout) => !["phone", "security"].includes(layout);

/** Whether the screensaver should come up now. */
export function saverDue({ minutes, idleSec, layout, sheets = 0, editing = false, hidden = false }) {
  return minutes > 0 && saverLayout(layout) && !editing && !sheets && !hidden && idleSec >= minutes * 60;
}

/** What is left of today, at most `max`: all-day events first, then by start. */
export function saverEvents(events, now = new Date(), max = 3) {
  return (events || [])
    .filter((e) => e.allDay || e.end > now)
    .sort((a, b) => (b.allDay - a.allDay) || (a.start - b.start))
    .slice(0, max);
}

/**
 * The screensaver of one panel. Call tick() every second and activity() on each touch.
 * The panel element is its ctx (hass, settings.device, layout, sheets, editing, weather, agenda).
 */
export function screensaver(ctx, root) {
  let idle = 0;
  let el = null;
  let lastMin = -1;
  let forced = false; // shown from the settings: stays until a touch, even with the settings open
  const time = h("div", { class: "hp-saver-time" });
  const date = h("div", { class: "hp-saver-date" });
  const weather = h("div", { class: "hp-saver-weather" });
  const events = h("div", { class: "hp-saver-events" });
  const box = h("div", { class: "hp-saver-box" }, time, date, weather, events);

  const minutes = () => Number(ctx.settings.device.saver) || 0;

  const fill = () => {
    const hass = ctx.hass;
    const now = new Date();
    time.textContent = formatTime(hass, now);
    date.textContent = formatDate(hass, now, { weekday: "long", month: "long", day: "numeric" });

    const c = ctx.weather?.current();
    weather.hidden = !c;
    if (c) {
      // High and low only when they say something (late in the day the forecast often has both the same).
      const hi = c.high != null ? formatNumber(hass, c.high, 0) : null;
      const lo = c.low != null ? formatNumber(hass, c.low, 0) : null;
      const hiLo = hi != null && lo != null && hi !== lo ? `${hi}° / ${lo}°` : "";
      weather.replaceChildren(icon(WEATHER_ICONS[c.condition] || "mdi:weather-partly-cloudy"),
        h("b", {}, c.temperature != null ? `${formatNumber(hass, c.temperature, 0)}°` : ""),
        h("span", {}, [c.label, hiLo].filter(Boolean).join(" · ")));
    }

    const list = saverEvents(ctx.agenda?.todayEvents(), now);
    events.hidden = !list.length;
    events.replaceChildren(...list.map((e) => h("div", { class: "hp-saver-ev" },
      h("span", {}, e.allDay ? t("all_day") : formatTime(hass, e.start)), h("b", {}, e.summary))));

    // Moves a little every minute so nothing burns into the screen.
    box.style.transform = `translate(${Math.round((Math.random() - 0.5) * 24)}vw, ${Math.round((Math.random() - 0.5) * 20)}vh)`;
    el?.classList.toggle("night", ctx.settings.device.saverDim !== false && isNight(hass, now));
  };

  const show = (force = false) => {
    forced = force;
    if (el) return;
    el = h("div", { class: "hp-saver", role: "button", "aria-label": t("saver_wake") }, box);
    // The tap that wakes the screen only wakes it: it doesn't reach the tile underneath.
    const wake = (e) => { e.preventDefault(); e.stopPropagation(); hide(); };
    el.addEventListener("pointerdown", wake);
    el.addEventListener("click", (e) => e.stopPropagation());
    lastMin = -1;
    fill();
    root.append(el);
    requestAnimationFrame(() => el?.classList.add("on"));
  };

  const hide = () => {
    idle = 0;
    if (!el) return;
    const old = el;
    el = null;
    old.remove();
  };

  return {
    get shown() { return !!el; },
    /** Every second from the panel's clock. */
    tick() {
      if (el) {
        // A popup opening on its own (the doorbell) wakes the screen.
        if (!forced && (ctx.sheets.size || !saverLayout(ctx.layout) || !minutes() || ctx._night?.blocksSaver())) return hide();
        const m = new Date().getMinutes();
        if (m !== lastMin) { lastMin = m; fill(); }
        return;
      }
      idle++;
      // At night the night view can take the screensaver's place (Settings → This screen).
      if (ctx._night?.blocksSaver()) return;
      if (saverDue({ minutes: minutes(), idleSec: idle, layout: ctx.layout, sheets: ctx.sheets.size, editing: ctx.editing, hidden: document.hidden })) show();
    },
    /** A touch, a key or the mouse wheel anywhere in the panel. */
    activity() {
      if (!el) idle = 0;
    },
    /** "Show now" in the settings. */
    tryNow: () => show(true),
    hide,
  };
}
