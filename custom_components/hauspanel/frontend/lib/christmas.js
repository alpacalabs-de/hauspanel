// Christmas: fairy lights, plugs and blowers in one popup, sorted into outside, inside and the rest.
// The devices come from a Home Assistant label, from their names, or are added by hand (Settings → Home).
// The Home chip shows from the first Advent to 7 January (changeable), and outside that only while one of them is on.
import { h, icon, domainOf, toggleSwitch, entityName, formatTime, formatNumber, formatDate, isUnavailable } from "./util.js";
import { isOn, isOutdoorRoom, OUTSIDE } from "./model.js";
import { openSheet, addDialog } from "./dialogs.js";
import { t } from "./i18n.js";
import { ring, stat, btn } from "./popkit.js";
import { switchMany } from "./switching.js";
import { guarded } from "./editlock.js";

/** Only things that switch: lights and switches (plugs, relays). */
export const XMAS_DOMAINS = ["light", "switch"];
/** Names that give a device away as Christmas decoration. Generic words only, nothing from a real house. */
export const XMAS_NAME = /weihnacht|christmas|x-?mas|advent|lichterkette|fairy[ _-]?lights?|string[ _-]?lights?|christbaum|tannenbaum|schneemann|snowman|rentier|reindeer|aufblasbar|inflatable/i;
/** Label ids (slugs of the label names) that mark Christmas things. */
export const XMAS_LABEL = /weihnacht|christmas|xmas/i;
export const SECTIONS = ["out", "in", "other"];

/**
 * The house setting: { on, add: [ids], hide: [ids], area: { id: "out"|"in"|"other" } }.
 * `on` is the general switch: true on, false off, missing = not decided yet (off, the welcome window asks).
 */
export const xmasPrefs = (s) => ({ add: [], hide: [], area: {}, ...(s?.xmas || {}) });
export const xmasEnabled = (s) => xmasPrefs(s).on === true;

/** Whether an entity is Christmas decoration by its label or its name. */
export function isXmasEntity(hass, id) {
  if (!XMAS_DOMAINS.includes(domainOf(id))) return false;
  const reg = hass.entities?.[id];
  if (reg?.hidden || reg?.entity_category) return false;
  if ((reg?.labels || []).some((l) => XMAS_LABEL.test(l))) return true;
  return XMAS_NAME.test(`${hass.states[id]?.attributes.friendly_name || ""} ${id}`);
}

/** Every Christmas device of the house, sorted by name: found by label or name, plus added, minus removed by hand. */
export function xmasDevices(hass, prefs) {
  const hide = new Set(prefs.hide || []);
  const found = Object.keys(hass.states).filter((id) => isXmasEntity(hass, id));
  const ids = [...new Set([...found, ...(prefs.add || []).filter((id) => hass.states[id])])].filter((id) => !hide.has(id));
  return ids.sort((a, b) => entityName(hass, a).localeCompare(entityName(hass, b)));
}

/**
 * Outside, inside or other: by hand first, then the room (garden, terrace, balcony, driveway … count as outside,
 * like everywhere in HausPanel), without a room a name with "outside"/"außen", otherwise "other".
 */
export function xmasSection(hass, model, prefs, id) {
  const own = prefs.area?.[id];
  if (SECTIONS.includes(own)) return own;
  const a = model?.areaById?.get(model.areaOf?.[id]);
  // A floor called "Outside" or "Außen" counts too.
  if (a && a.id !== "_other") return isOutdoorRoom(a) || OUTSIDE.test(a.floor?.name || "") ? "out" : "in";
  return OUTSIDE.test(`${hass.states[id]?.attributes.friendly_name || ""} ${id}`) ? "out" : "other";
}

/** The first Advent of a year: the fourth Sunday before Christmas Day. */
export function firstAdvent(year) {
  const xmas = new Date(year, 11, 25);
  const back = xmas.getDay() === 0 ? 7 : xmas.getDay();
  return new Date(year, 11, 25 - back - 21);
}

const day = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** "MM-DD" as [month 0–11, day], or null. */
const md = (v) => {
  const m = /^(\d{1,2})-(\d{1,2})$/.exec(String(v ?? ""));
  return m && Number(m[1]) >= 1 && Number(m[1]) <= 12 && Number(m[2]) >= 1 && Number(m[2]) <= 31 ? [Number(m[1]) - 1, Number(m[2])] : null;
};
export const XMAS_TO = "01-07";

/** The start of Christmas time in a year: the first Advent, or a date set in the settings ("MM-DD"). */
export function seasonStart(year, prefs = {}) {
  const f = md(prefs.from);
  return f ? new Date(year, f[0], f[1]) : firstAdvent(year);
}

/** The last day of Christmas time that belongs to a start in `year`: 7 January after it, or a set date. */
export function seasonEnd(year, prefs = {}) {
  const start = seasonStart(year, prefs);
  const e = md(prefs.to) || md(XMAS_TO);
  const end = new Date(year, e[0], e[1]);
  return end < start ? new Date(year + 1, e[0], e[1]) : end;
}

/** Christmas time: from the first Advent (or a set start) to 7 January (or a set end), both days included. */
export function xmasSeason(now = new Date(), prefs = {}) {
  const d = day(now);
  const y = d.getFullYear();
  return [y - 1, y].some((sy) => d >= seasonStart(sy, prefs) && d <= seasonEnd(sy, prefs));
}

/** The next Advent Sunday from today (today included) as { n, date }, or null after the fourth. */
export function nextAdvent(now = new Date()) {
  const first = firstAdvent(now.getFullYear());
  const d = day(now);
  for (let n = 1; n <= 4; n++) {
    const s = new Date(first.getFullYear(), first.getMonth(), first.getDate() + (n - 1) * 7);
    if (s >= d) return { n, date: s };
  }
  return null;
}

/** The line under the count: days until Christmas Eve, or a greeting in the days around it. */
export function xmasCountdown(now = new Date()) {
  const d = day(now);
  const m = d.getMonth();
  const dd = d.getDate();
  if (m === 11 && dd >= 24 && dd <= 26) return t("xm_merry");
  if (m === 11 && dd > 26) return t("xm_new_year_soon");
  if (m === 0 && dd <= 6) return t("xm_new_year");
  const eve = new Date(d.getFullYear(), 11, 24);
  const n = Math.round((eve - d) / 86400e3);
  return n === 1 ? t("xm_tomorrow") : t("xm_days", { n });
}

/** A power sensor on the same device, if there is one. */
export function powerOf(hass, id) {
  const dev = hass.entities?.[id]?.device_id;
  if (!dev) return null;
  for (const e of Object.values(hass.entities || {})) {
    if (e.device_id !== dev || !e.entity_id.startsWith("sensor.")) continue;
    const st = hass.states[e.entity_id];
    if (st?.attributes.device_class === "power") return e.entity_id;
  }
  return null;
}

/** Watts of a power sensor (kW counts too), or null. */
export function watts(st) {
  const v = Number(st?.state);
  if (!st || !Number.isFinite(v)) return null;
  return st.attributes.unit_of_measurement === "kW" ? v * 1000 : v;
}

/**
 * Whether the Home chip shows: switched on, and then in Christmas time (even without devices yet, the popup
 * says how to add them), otherwise only while one of them is on.
 */
export function xmasChipShown(hass, ids, now = new Date(), prefs = {}) {
  return xmasSeason(now, prefs) || ids.some((id) => isOn(hass.states[id]));
}

/** When the welcome window may come: from 1 November to 7 January, so nobody gets a Christmas window in July. */
export function xmasIntroDue(now = new Date()) {
  const m = now.getMonth();
  return m === 10 || m === 11 || (m === 0 && now.getDate() <= 7);
}

const ICONS = [[/baum|tree/i, "mdi:pine-tree"], [/schneemann|snowman/i, "mdi:snowman"], [/stern|star/i, "mdi:star-outline"],
  [/aufblas|inflatable|gebl(ä|ae)se|blower/i, "mdi:balloon"], [/fenster|window/i, "mdi:window-closed-variant"], [/rentier|reindeer/i, "mdi:deer"]];
function xmasIcon(hass, id) {
  const st = hass.states[id];
  if (st?.attributes.icon) return st.attributes.icon;
  const name = `${st?.attributes.friendly_name || ""} ${id}`;
  return ICONS.find(([re]) => re.test(name))?.[1] || (domainOf(id) === "light" ? "mdi:string-lights" : "mdi:power-socket-de");
}

/** Switches a mixed list of lights and switches a few at a time, each domain with its own service. */
function switchAll(ctx, ids, on) {
  for (const d of XMAS_DOMAINS) {
    const list = ids.filter((id) => domainOf(id) === d && !isUnavailable(ctx.hass.states[id]));
    if (list.length) switchMany(ctx, d, on ? "turn_on" : "turn_off", list);
  }
}

const SVGNS = "http://www.w3.org/2000/svg";
const svg = (tag, attrs = {}) => {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
};
const BULBS = [[44, 40], [56, 36], [40, 54], [52, 52], [63, 57], [34, 70], [46, 68], [58, 71], [68, 73], [50, 44]];
const BULB_COLORS = ["#ff6f6f", "#ffd36e", "#7fc8f8", "#8fe0a6", "#ff9ad5"];

/** The little tree in the ring: the more is on, the more bulbs glow. */
function tree() {
  const s = svg("svg", { viewBox: "0 0 100 100", class: "hp-xm-tree" });
  s.append(svg("rect", { x: 46, y: 78, width: 8, height: 10, rx: 2, fill: "#6b4a3a" }),
    svg("path", { d: "M50 18 L70 46 H61 L76 64 H65 L82 80 H18 L35 64 H24 L39 46 H30 Z", fill: "#2f7a4f" }),
    svg("path", { d: "M50 18 L70 46 H61 L76 64 H65 L82 80 H50 Z", fill: "#276843" }),
    svg("path", { class: "star", d: "M50 9 l2.6 5.4 5.9.8-4.3 4.1 1 5.8L50 22.4l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z" }));
  const bulbs = BULBS.map(([cx, cy], i) => {
    const b = svg("circle", { cx, cy, r: 2.6, class: "bulb" });
    b.style.setProperty("--b", BULB_COLORS[i % BULB_COLORS.length]);
    b.style.animationDelay = `${-i * 0.37}s`;
    s.append(b);
    return b;
  });
  const drum = h("div", { class: "hp-xm-drum" }, s, ...Array.from({ length: 10 }, (_, i) => h("i", { class: "flake", style: `--x:${(i * 37) % 100}%;--d:${5 + (i * 7) % 5}s;--w:${-(i * 1.3)}s` })));
  drum.set = (share) => {
    drum.classList.toggle("on", share > 0);
    const lit = Math.round(share * bulbs.length);
    bulbs.forEach((b, i) => b.classList.toggle("lit", i < lit));
  };
  return drum;
}

/** The Christmas popup: tree in the ring, countdown, numbers, three modes and the devices by section. */
export function openChristmas(ctx) {
  const prefs = () => xmasPrefs(ctx.settings.s);
  const ids = () => xmasDevices(ctx.hass, prefs());
  const sheet = openSheet(ctx, { title: t("xm_title"), subtitle: t("xm_sub"), cls: "appliance xmas" });

  const rg = ring("hp-app-ring hp-ov-ring");
  const drum = tree();
  const status = h("span", { class: "hp-app-status" });
  const title = h("div", { class: "hp-ov-h1" });
  const sub = h("div", { class: "hp-app-eta hp-ov-h2" });
  const extra = h("div", { class: "hp-ov-hx hp-xm-na" });
  const heroEl = h("div", { class: "hp-pr-hero hp-ov-hero hp-xm-hero" }, h("div", { class: "hp-pr-dial hp-xm-dial" }, rg.svg, drum),
    h("div", { class: "hp-app-info" }, status, title, sub, extra));

  const sAdvent = stat("mdi:candle", "");
  const sSun = stat("mdi:weather-sunset-down", t("ov_sunset"));
  const sPower = stat("mdi:flash-outline", t("xm_power_now"));
  const stats = h("div", { class: "hp-app-stats hp-xm-stats" }, sAdvent, sSun, sPower);

  const MODES = [["all", "mdi:creation-outline", "xm_all_on"], ["out", "mdi:pine-tree", "xm_only_out"], ["off", "mdi:weather-night", "xm_all_off"]];
  const modeBtns = MODES.map(([m, ic, label]) => {
    const b = h("button", { class: "hp-ov-mode", dataset: { m } }, icon(ic), h("span", {}, t(label)));
    b.addEventListener("click", () => {
      const all = ids();
      if (m === "all") switchAll(ctx, all, true);
      else if (m === "off") switchAll(ctx, all, false);
      else {
        const out = all.filter((id) => xmasSection(ctx.hass, ctx.model, prefs(), id) === "out");
        switchAll(ctx, out, true);
        switchAll(ctx, all.filter((id) => !out.includes(id)), false);
      }
    });
    return b;
  });
  const modes = h("div", { class: "hp-ov-modes hp-xm-modes" }, ...modeBtns);

  const list = h("div", { class: "hp-xm-list" });
  const edit = btn("mdi:pencil-outline", t("xm_edit"));
  edit.addEventListener("click", () => openXmasEdit(ctx, () => build()));
  const foot = h("div", { class: "hp-sheet-actions hp-app-foot" }, edit);
  const left = h("div", { class: "hp-xm-left" }, heroEl, stats, modes);
  const right = h("div", { class: "hp-xm-right" }, list, foot);
  sheet.body.append(h("div", { class: "hp-xm-grid" }, left, right));

  let rows = [];
  let heads = [];
  let shownIds = [];
  const build = () => {
    const all = ids();
    shownIds = all;
    const hs = ctx.hass;
    list.replaceChildren();
    rows = [];
    heads = [];
    if (!all.length) list.append(h("div", { class: "hp-empty hp-xm-empty" }, t("xm_none")));
    for (const sec of SECTIONS) {
      const secIds = all.filter((id) => xmasSection(hs, ctx.model, prefs(), id) === sec);
      if (!secIds.length) continue;
      const count = h("span");
      const head = h("div", { class: "hp-ov-label hp-xm-label" }, h("span", {}, t(`xm_sec_${sec}`)), count);
      head.upd = (s) => {
        const ok = secIds.filter((id) => !isUnavailable(s.states[id]));
        count.textContent = ok.length ? t("ov_n_of_m", { n: ok.filter((id) => isOn(s.states[id])).length, m: ok.length }) : "";
      };
      heads.push(head);
      const box = h("div", { class: "hp-ov-list-rows hp-xm-rows" });
      for (const id of secIds) {
        const icEl = icon(xmasIcon(hs, id));
        const name = h("b", {}, entityName(hs, id));
        const subEl = h("small");
        const sw = toggleSwitch(false, () => ctx.hass.callService(domainOf(id), "toggle", { entity_id: id }));
        const na = icon("mdi:wifi-off");
        const right = h("div", { class: "hp-ov-right" }, sw, na);
        const el = h("div", { class: "hp-ov-row hp-xm-row", role: "button", tabindex: "0" }, h("span", { class: "hp-ov-ic" }, icEl), h("div", { class: "hp-ov-txt" }, name, subEl), right);
        el.addEventListener("click", () => ctx.openDetails(id));
        const pw = powerOf(hs, id);
        el.upd = (s) => {
          const st = s.states[id];
          const gone = !st || isUnavailable(st);
          const on = !gone && isOn(st);
          const w = pw ? watts(s.states[pw]) : null;
          el.classList.toggle("lit", on);
          el.classList.toggle("na", gone);
          sw.hidden = gone;
          na.hidden = !gone;
          sw.update(on);
          subEl.textContent = gone ? t("xm_unreachable") : [on ? t("on") : t("off"), on && w != null && w >= 0.5 ? `${formatNumber(s, w, 0)} W` : null].filter(Boolean).join(" · ");
          el.style.order = gone ? 1 : 0;
          el.w = on ? w : null;
        };
        rows.push(el);
        box.append(el);
      }
      list.append(head, box);
    }
    draw(ctx.hass);
  };

  const draw = (hs) => {
    const ok = shownIds.filter((id) => !isUnavailable(hs.states[id]));
    const on = ok.filter((id) => isOn(hs.states[id]));
    const gone = shownIds.length - ok.length;
    rows.forEach((r) => r.upd(hs));
    heads.forEach((x) => x.upd(hs));
    const share = ok.length ? on.length / ok.length : 0;
    rg.set(share * 100);
    drum.set(share);
    heroEl.classList.toggle("dark", !on.length);
    status.textContent = on.length ? t("xm_glowing") : t("all_off");
    status.dataset.phase = on.length ? "run" : "";
    title.textContent = t("ov_n_of_m", { n: on.length, m: ok.length });
    sub.textContent = xmasCountdown();
    extra.textContent = gone ? t("xm_n_unreachable", { n: gone }) : "";
    // Numbers: next Advent Sunday, sunset, and what the plugs that can measure draw right now.
    const adv = nextAdvent();
    sAdvent.hidden = !adv;
    if (adv) {
      sAdvent.set(formatDate(hs, adv.date, { day: "numeric", month: "numeric" }));
      sAdvent.querySelector("small").textContent = t("xm_advent", { n: adv.n });
    }
    const set = hs.states["sun.sun"]?.attributes.next_setting;
    sSun.hidden = !set;
    if (set) sSun.set(formatTime(hs, new Date(set)));
    const ws = rows.map((r) => r.w).filter((w) => w != null);
    sPower.hidden = !ws.length;
    if (ws.length) {
      const w = ws.reduce((a, b) => a + b, 0);
      sPower.set(w >= 1000 ? `${formatNumber(hs, w / 1000, 1)} kW` : `${formatNumber(hs, w, 0)} W`);
    }
    const outIds = ok.filter((id) => xmasSection(hs, ctx.model, prefs(), id) === "out");
    const isAll = ok.length > 0 && on.length === ok.length;
    const isOut = outIds.length > 0 && outIds.length < ok.length && on.length === outIds.length && outIds.every((id) => on.includes(id));
    for (const b of modeBtns) b.classList.toggle("active", b.dataset.m === "all" ? isAll : b.dataset.m === "off" ? ok.length > 0 && !on.length : isOut);
    modeBtns[1].hidden = !outIds.length || outIds.length === ok.length;
  };
  build();
  sheet.updaters.push(draw);
  return sheet;
}

/** Editing the list: each device with its section and a minus, removed ones with a plus, and "Add devices". */
export function openXmasEdit(ctx, onChange = () => {}) {
  const sheet = openSheet(ctx, { title: t("xm_edit_title"), subtitle: t("xm_title"), cls: "tall hp-xm-edit" });
  const list = h("div", { class: "hp-add-list" });
  const save = (fn) => {
    ctx.settings.update((x) => { const p = xmasPrefs(x); fn(p); x.xmas = p; });
    draw();
    onChange();
  };
  const draw = () => {
    const hs = ctx.hass;
    const p = xmasPrefs(ctx.settings.s);
    const ids = xmasDevices(hs, p);
    list.replaceChildren(h("p", { class: "hp-muted small" }, t("xm_edit_hint")));
    for (const id of ids) {
      const cur = xmasSection(hs, ctx.model, p, id);
      const seg = h("div", { class: "hp-seg hp-xm-seg" }, ...SECTIONS.map((sec) => {
        const b = h("button", { class: cur === sec ? "active" : "" }, t(`xm_sec_${sec}`));
        b.addEventListener("click", () => save((q) => { q.area = { ...q.area, [id]: sec }; }));
        return b;
      }));
      const minus = h("button", { class: "hp-round ghost", "aria-label": t("hide") }, icon("mdi:minus"));
      minus.addEventListener("click", () => save((q) => { q.add = q.add.filter((x) => x !== id); q.hide = [...new Set([...q.hide, id])]; }));
      list.append(h("div", { class: "hp-add-row hp-xm-edit-row" }, h("div", { class: "hp-tile-icon" }, icon(xmasIcon(hs, id))),
        h("div", { class: "hp-add-text" }, h("div", {}, entityName(hs, id)), h("small", {}, id)), minus, seg));
    }
    const hidden = p.hide.filter((id) => hs.states[id]);
    if (hidden.length) {
      list.append(h("div", { class: "hp-add-group" }, t("hidden_items")));
      for (const id of hidden) {
        const plus = h("button", { class: "hp-round ghost", "aria-label": t("show") }, icon("mdi:plus"));
        plus.addEventListener("click", () => save((q) => { q.hide = q.hide.filter((x) => x !== id); }));
        list.append(h("div", { class: "hp-add-row hp-xm-gone" }, h("div", { class: "hp-tile-icon" }, icon(xmasIcon(hs, id))),
          h("div", { class: "hp-add-text" }, h("div", {}, entityName(hs, id)), h("small", {}, id)), plus));
      }
    }
  };
  const add = btn("mdi:plus", t("add_devices"), "primary");
  add.addEventListener("click", () => addDialog(ctx, {
    container: "_xmas",
    autoItems: xmasDevices(ctx.hass, xmasPrefs(ctx.settings.s)),
    domains: XMAS_DOMAINS,
    onPick: (id) => save((q) => { q.add = [...new Set([...q.add, id])]; q.hide = q.hide.filter((x) => x !== id); }),
  }));
  draw();
  sheet.body.append(list, h("div", { class: "hp-sheet-actions" }, add));
}

/** Kept per Home Assistant user and per panel: the switch belongs to a panel, so each panel asks once. */
const introKey = (ctx) => `hauspanel_xmas_intro_${ctx.settings?.panel || "hauspanel"}`;

/**
 * The first time someone opens HausPanel in the Christmas weeks after the update: a window that shows and explains
 * it. Once per Home Assistant user and panel (kept with the user, like the welcome); after the first welcome, never with it.
 */
export async function maybeXmasIntro(ctx, now = new Date()) {
  if (!xmasIntroDue(now)) return;
  try {
    const [wel, own] = await Promise.all(["hauspanel_welcome", introKey(ctx)].map((key) => ctx.hass.callWS({ type: "frontend/get_user_data", key })));
    if (!wel?.value || own?.value) return;
  } catch {
    return;
  }
  if (ctx.sheets?.size) return;
  openXmasIntro(ctx);
}

/** The Christmas welcome: the tree, what it does, what was found here, and switching it on. */
export function openXmasIntro(ctx) {
  const hass = ctx.hass;
  const seen = () => hass.callWS({ type: "frontend/set_user_data", key: introKey(ctx), value: { seen: Date.now() } }).catch(() => {});
  const sheet = openSheet(ctx, { title: t("xm_intro_title"), subtitle: t("xm_intro_sub"), cls: "appliance xmas-intro", onClose: seen });
  const prefs = xmasPrefs(ctx.settings.s);
  const ids = xmasDevices(hass, prefs);
  const per = SECTIONS.map((sec) => [sec, ids.filter((id) => xmasSection(hass, ctx.model, prefs, id) === sec).length]).filter(([, n]) => n);

  const rg = ring("hp-app-ring hp-ov-ring");
  rg.set(100);
  const drum = tree();
  drum.set(1);
  const hero = h("div", { class: "hp-pr-hero hp-ov-hero hp-xm-hero hp-xm-intro-hero" }, h("div", { class: "hp-pr-dial hp-xm-dial" }, rg.svg, drum),
    h("div", { class: "hp-app-info" }, h("div", { class: "hp-ov-h1" }, t("xm_intro_head")), h("div", { class: "hp-app-eta hp-ov-h2" }, t("xm_intro_text"))));

  const step = (n, ic, title, text, ...extra) => h("div", { class: "hp-wel-step" },
    h("span", { class: "hp-wel-n" }, String(n)),
    h("div", { class: "hp-wel-body" }, h("b", {}, icon(ic), title), h("p", {}, text), ...extra));
  const facts = h("div", { class: "hp-wel-facts" }, ids.length
    ? [h("span", { class: "hp-wel-fact ok" }, icon("mdi:check"), t("xm_intro_found", { n: ids.length })),
      ...per.map(([sec, n]) => h("span", { class: "hp-wel-fact" }, `${t(`xm_sec_${sec}`)} ${n}`))]
    : [h("span", { class: "hp-wel-fact warn" }, icon("mdi:help-circle-outline"), t("xm_intro_none"))]);

  const on = xmasEnabled(ctx.settings.s);
  const yes = btn(on ? "mdi:pine-tree" : "mdi:check", t(on ? "xm_open" : "xm_intro_on"), "primary");
  const no = btn("mdi:close", t(on ? "xm_intro_ok" : "xm_intro_off"));
  const decide = (v) => ctx.settings.update((x) => { x.xmas = { ...xmasPrefs(x), on: v }; });
  yes.addEventListener("click", () => {
    if (on) { sheet.close(); openChristmas(ctx); return; }
    guarded(ctx, () => { decide(true); sheet.close(); ctx.rerender?.(); openChristmas(ctx); });
  });
  no.addEventListener("click", () => {
    if (on) { sheet.close(); return; }
    guarded(ctx, () => { decide(false); sheet.close(); });
  });

  sheet.body.append(hero,
    step(1, "mdi:string-lights", t("xm_intro_what"), t("xm_intro_what_text")),
    step(2, "mdi:tag-outline", t("xm_intro_which"), t("xm_intro_which_text"), facts),
    step(3, "mdi:calendar-star", t("xm_intro_when"), t("xm_intro_when_text")),
    h("div", { class: "hp-sheet-actions hp-app-foot" }, no, yes));
}
