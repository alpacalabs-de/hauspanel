// Home Assistant's own notifications (persistent_notification) as a notice on Home: how many are
// waiting, and a sheet to read and dismiss them. Off unless someone switches it on: Home Assistant
// also files system messages there, like a failed login with its IP address, and those should not
// stand on a wall tablet unasked.
import { h, icon, formatTime, formatDate } from "./util.js";
import { t } from "./i18n.js";
import { openSheet } from "./dialogs.js";

/** Off by default, see above. */
export const haNotesOn = (ctx) => ctx.settings.s.haNotes === true;

/**
 * Home Assistant sends the whole list once ("current") and after that only what changed, so the
 * panel keeps its own picture and brings it in step with every message.
 */
export function mergeNotes(map, type, notifications) {
  const out = type === "current" ? {} : { ...(map || {}) };
  for (const id of Object.keys(notifications || {})) {
    if (type === "removed") delete out[id];
    else out[id] = notifications[id];
  }
  return out;
}

/** Newest first; one without a time goes last. */
export const sortNotes = (map) =>
  Object.values(map || {}).sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));

/**
 * As plain text: a notification may hold Markdown or HTML, and both would only be in the way here.
 * Tags and emphasis go, links keep their words, line breaks stay.
 */
export function plainText(s) {
  return String(s ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`~]/g, "")
    .replace(/^[ \t]*[#>]+[ \t]*/gm, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** The first line of a notification: its title, else the first line of its message. */
export const noteTitle = (n) => plainText(n?.title) || plainText(n?.message).split("\n")[0] || t("ha_notes");

/** The pill's second line: the newest one's title, with "+n" when more are waiting. */
export function notesLine(list) {
  if (!list?.length) return "";
  const first = noteTitle(list[0]);
  return list.length > 1 ? `${first} +${list.length - 1}` : first;
}

/**
 * One subscription per panel, kept on the panel itself: the notices block is rebuilt whenever Home
 * reflows, and a subscription per block would pile up.
 */
export function haNotes(ctx) {
  if (!ctx._haNotes) {
    const store = { map: {}, list: [], onChange: null };
    ctx._haNotes = store;
    ctx.hass.connection
      .subscribeMessage(
        (m) => {
          store.map = mergeNotes(store.map, m.type, m.notifications);
          store.list = sortNotes(store.map);
          store.onChange?.();
        },
        { type: "persistent_notification/subscribe" },
      )
      .catch(() => {
        // An older Home Assistant without that command: nothing to show.
      });
  }
  return ctx._haNotes;
}

/** The time it came in: today just the clock, older with the date in front. */
export function whenText(hass, iso, now = new Date()) {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return "";
  const time = formatTime(hass, d);
  return d.toDateString() === now.toDateString() ? time : `${formatDate(hass, d, { day: "numeric", month: "short" })} ${time}`;
}

function noteRow(ctx, n) {
  const when = whenText(ctx.hass, n.created_at);
  const done = h("button", { class: "hp-round ghost", "aria-label": t("done") }, icon("mdi:check"));
  done.addEventListener("click", () => {
    ctx.hass.callService("persistent_notification", "dismiss", { notification_id: n.notification_id });
  });
  const text = plainText(n.message);
  return h("div", { class: "hp-qrow" },
    h("div", { class: "hp-qrow-text" },
      h("b", {}, noteTitle(n)),
      h("small", {}, when),
      ...(text ? [h("div", { class: "hp-note-body" }, text)] : [])),
    done);
}

/** The sheet: every notification with its time and text, each one dismissable. */
export function openHaNotes(ctx) {
  const store = haNotes(ctx);
  const sheet = openSheet(ctx, { title: t("ha_notes"), subtitle: t("notices"), cls: "qsheet" });
  const rows = h("div", { class: "hp-qrows" });
  const all = h("button", { class: "hp-chip" }, icon("mdi:check-all"), t("ha_notes_all"));
  all.addEventListener("click", () => ctx.hass.callService("persistent_notification", "dismiss_all", {}));
  const draw = () => {
    const list = store.list;
    rows.replaceChildren(
      ...(list.length ? list.map((n) => noteRow(ctx, n)) : [h("div", { class: "hp-muted small" }, t("ha_notes_none"))]),
    );
    all.hidden = list.length < 2;
  };
  draw();
  sheet.body.append(rows, h("div", { class: "hp-sheet-actions" }, all));
  // Live: dismissing one here, or anywhere else in Home Assistant, redraws the list.
  const before = store.onChange;
  store.onChange = () => { before?.(); draw(); };
  sheet.updaters.push(() => draw());
  return sheet;
}
