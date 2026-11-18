// Weather and civil-protection warnings behind a notice (DWD, NINA): their headline, text and the time they apply.
// The state of those sensors is only a warning level or on/off, the warning itself sits in the attributes.
import { h, formatTime, formatDate, entityName } from "./util.js";
import { openSheet } from "./dialogs.js";
import { openMoreInfo } from "./domains.js";
import { moreButton } from "./popkit.js";
import { t } from "./i18n.js";

const DWD = "dwd_weather_warnings";
const NINA = "nina";

/** How many warnings one DWD sensor can list. Its attributes are numbered from 1 without gaps. */
const MAX_DWD = 20;

/** NINA says in words how bad a warning is; as a number it sorts next to DWD's levels. */
const SEVERITY = { extreme: 4, severe: 3, moderate: 2, minor: 1 };

/** From Home Assistant 2026.11 on, NINA keeps the details in sensors of their own; this is what they are called. */
const NINA_KEYS = new Set(["headline", "severity", "start", "expires"]);

/** A value worth showing: a non-empty text that is not one of Home Assistant's placeholders. */
const str = (v) => {
  const s = v == null ? "" : String(v).trim();
  return s && !["unknown", "unavailable", "none", "null"].includes(s.toLowerCase()) ? s : "";
};

const level = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** The slot a NINA entity belongs to: its number at the end ("… Headline 2" → "2"). */
const slotOf = (id) => (/_(\d+)$/.exec(id) || [])[1] || "";

/**
 * The warnings a DWD sensor lists: its attributes carry them numbered (`warning_1_headline` and so on),
 * and `warning_<i>` the whole warning again with the API's own names.
 */
function dwdWarnings(st) {
  const a = st?.attributes || {};
  const out = [];
  for (let i = 1; i <= MAX_DWD; i++) {
    const w = a[`warning_${i}`] || {};
    const headline = str(a[`warning_${i}_headline`] ?? w.headline) || str(a[`warning_${i}_name`] ?? w.event);
    const text = str(a[`warning_${i}_description`] ?? w.description);
    if (!headline && !text) break;
    out.push({
      headline: headline || text,
      text: headline ? text : "",
      instruction: str(a[`warning_${i}_instruction`] ?? w.instruction),
      from: str(a[`warning_${i}_start`] ?? w.start_time),
      to: str(a[`warning_${i}_end`] ?? w.end_time),
      level: level(a[`warning_${i}_level`] ?? w.level),
    });
  }
  return out;
}

/**
 * What the sensors next to a NINA warning say (Home Assistant 2026.11 and newer).
 * They sit on the same device and carry the same slot number, and their translation key says what they are.
 */
function ninaDetails(hass, id) {
  const dev = hass.entities?.[id]?.device_id;
  if (!dev) return {};
  const slot = slotOf(id);
  const out = {};
  for (const e of Object.values(hass.entities || {})) {
    if (e.device_id !== dev || !NINA_KEYS.has(e.translation_key)) continue;
    if (slot && slotOf(e.entity_id) !== slot) continue;
    const v = str(hass.states?.[e.entity_id]?.state);
    if (v) out[e.translation_key] = v;
  }
  return out;
}

/** The warning of one NINA slot, while it is on: one binary sensor carries one warning. */
function ninaWarnings(hass, id) {
  const st = hass.states?.[id];
  if (st?.state !== "on") return [];
  const a = st.attributes || {};
  // Up to Home Assistant 2026.10 everything was in the attributes; after that only the id is.
  const d = str(a.headline) ? {} : ninaDetails(hass, id);
  const headline = str(a.headline) || str(d.headline);
  const text = str(a.description);
  if (!headline && !text) return [];
  return [{
    headline: headline || text,
    text: headline ? text : "",
    instruction: str(a.recommended_actions),
    from: str(a.start) || str(d.start),
    to: str(a.expires) || str(d.expires),
    level: SEVERITY[(str(a.severity) || str(d.severity)).toLowerCase()] || 0,
  }];
}

/**
 * The warnings behind one entity, the worst one first: [{ headline, text, instruction, from, to, level }].
 * `null` for anything that is not a DWD or NINA warning, an empty list while such a sensor warns about nothing.
 */
export function warningInfo(hass, id) {
  const platform = hass?.entities?.[id]?.platform;
  if (platform !== DWD && platform !== NINA) return null;
  const list = platform === DWD ? dwdWarnings(hass.states?.[id]) : ninaWarnings(hass, id);
  return list.map((w, i) => ({ w, i })).sort((a, b) => b.w.level - a.w.level || a.i - b.i).map((x) => x.w);
}

/** What the notice says below its name: the worst warning's headline, and "+n" when more are on. */
export function warningLine(list) {
  if (!list?.length) return "";
  const [first, ...rest] = list;
  return rest.length ? `${first.headline} +${rest.length}` : first.headline;
}

/** When a warning applies, in the screen's own clock: "13:00 – 18:00", with the date when it is not today. */
export function warningWhen(hass, w, now = new Date()) {
  const at = (v) => {
    const d = new Date(Date.parse(v));
    if (Number.isNaN(d.getTime())) return "";
    const time = formatTime(hass, d);
    return d.toDateString() === now.toDateString() ? time : `${formatDate(hass, d, { day: "numeric", month: "short" })} ${time}`;
  };
  const from = at(w.from);
  const to = at(w.to);
  if (from && to) return `${from} – ${to}`;
  if (to) return t("warn_until", { when: to });
  return from;
}

/** One warning as a card: headline, when it applies, the text and what to do. */
function warningCard(hass, w) {
  const when = warningWhen(hass, w);
  return h("div", { class: `hp-warn${w.level >= 3 ? " bad" : ""}` },
    h("b", {}, w.headline),
    when ? h("small", {}, when) : null,
    w.text ? h("p", {}, w.text) : null,
    w.instruction ? h("p", { class: "hp-warn-advice" }, `${t("warn_advice")}: ${w.instruction}`) : null);
}

/** The warning popup: every warning of that sensor with its full text, newest state live. */
export function openWarnings(ctx, id) {
  const sheet = openSheet(ctx, { title: t("warn_title"), subtitle: entityName(ctx.hass, id), cls: "appliance warnings" });
  const list = h("div", { class: "hp-warn-list" });
  sheet.body.append(list, h("div", { class: "hp-sheet-actions hp-app-foot" }, moreButton(ctx, sheet, id, openMoreInfo)));
  let sig = null;
  const upd = (hass) => {
    const warns = warningInfo(hass, id) || [];
    const next = JSON.stringify(warns);
    if (next === sig) return;
    sig = next;
    list.replaceChildren(...(warns.length ? warns.map((w) => warningCard(hass, w)) : [h("div", { class: "hp-qempty" }, t("warn_none"))]));
  };
  upd(ctx.hass);
  sheet.updaters.push(upd);
  return sheet;
}
