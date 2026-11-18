// Modes: the switches and helpers someone uses as modes (guest, party, cleaning) behind one chip on Home.
// Nothing is guessed here: the modes are picked by hand (Settings → Home → Status chips, or Customise
// in the popup) and kept as a panel setting, in the order they were sorted into.
import { h, icon, domainOf, entityName, toggleSwitch } from "./util.js";
import { isOn } from "./model.js";
import { entityIcon, stateText } from "./domains.js";
import { openSheet, addDialog } from "./dialogs.js";
import { sortable } from "./drag.js";
import { btn } from "./popkit.js";
import { t } from "./i18n.js";

/** Only things that simply switch on and off: helpers and switches. */
export const MODE_DOMAINS = ["input_boolean", "switch"];

/** The modes of this panel, in their order; anything else that found its way into the setting is left out. */
export const modeIds = (s) => (s?.modes || []).filter((id) => typeof id === "string" && MODE_DOMAINS.includes(domainOf(id)));

/**
 * The modes that are really there and which of them are on: { ids, on }, or null when none of the picked
 * ones exists any more (then Home shows no chip at all). One that can't be reached stays in the list,
 * but doesn't count as on.
 */
export function modesSummary(hass, ids) {
  const live = (ids || []).filter((id) => hass?.states?.[id]);
  if (!live.length) return null;
  return { ids: live, on: live.filter((id) => isOn(hass.states[id])) };
}

/** What the chip says: all off, the name of the only one that is on, or how many are on. */
export function modesText(hass, sum) {
  if (!sum) return "";
  if (!sum.on.length) return t("all_off");
  return sum.on.length === 1 ? entityName(hass, sum.on[0]) : t("n_on", { n: sum.on.length });
}

/** The modes popup: one line per mode with its state and a switch, and a way to pick them. */
export function openModes(ctx) {
  const sheet = openSheet(ctx, { title: t("modes"), cls: "qsheet" });
  const sub = h("div", { class: "hp-sheet-sub" });
  sheet.el.querySelector(".hp-sheet-titles").append(sub);
  const list = h("div", { class: "hp-qlist" });
  const edit = btn("mdi:pencil-outline", t("customise"));
  // Picking or sorting shows here right away, not only with the next state from Home Assistant.
  edit.addEventListener("click", () => openModesEdit(ctx, () => draw(ctx.hass)));
  sheet.body.append(list, h("div", { class: "hp-sheet-actions" }, edit));

  let rows = [];
  let sig = null;
  const here = (hass) => modeIds(ctx.settings.s).filter((id) => hass.states[id]);
  const build = (hass) => {
    rows = here(hass).map((id) => {
      const ic = icon(entityIcon(hass, hass.states[id]));
      const state = h("small", {});
      const sw = toggleSwitch(isOn(hass.states[id]), () => ctx.hass.callService(domainOf(id), "toggle", { entity_id: id }));
      const el = h("div", { class: "hp-qrow", role: "button", tabindex: "0" },
        h("span", { class: "hp-qrow-ic" }, ic),
        h("div", { class: "hp-qrow-text" }, h("b", {}, entityName(hass, id)), state), sw);
      el.addEventListener("click", (e) => {
        if (e.target.closest(".hp-switch")) return;
        ctx.openDetails(id);
      });
      el.upd = (hs) => {
        const st = hs.states[id];
        const on = isOn(st);
        ic.icon = entityIcon(hs, st);
        state.textContent = stateText(hs, st);
        el.classList.toggle("on", on);
        sw.update(on);
      };
      return el;
    });
    list.replaceChildren(...(rows.length ? rows : [h("div", { class: "hp-qempty" }, t("modes_empty"))]));
  };
  const draw = (hass) => {
    // Something picked or sorted in Customise: build the lines again.
    const next = here(hass).join();
    if (next !== sig) {
      sig = next;
      build(hass);
    }
    rows.forEach((r) => r.upd(hass));
    sub.textContent = modesText(hass, modesSummary(hass, modeIds(ctx.settings.s)));
  };
  draw(ctx.hass);
  sheet.updaters.push(draw);
  return sheet;
}

/** Picking the modes: drag to sort, minus removes one, "Add devices" brings switches and helpers in. */
export function openModesEdit(ctx, onChange = () => {}) {
  const sheet = openSheet(ctx, { title: t("modes_pick"), subtitle: t("modes"), cls: "tall" });
  // The box is "editing" on its own, so the handles show and dragging sorts, popup or not.
  const list = h("div", { class: "hp-add-list editing" });
  const save = (fn) => {
    ctx.settings.update((x) => { x.modes = fn(modeIds(x)); });
    draw();
    onChange();
  };
  function draw() {
    const hass = ctx.hass;
    list.replaceChildren();
    for (const id of modeIds(ctx.settings.s)) {
      const st = hass.states[id];
      const minus = h("button", { class: "hp-round ghost", "aria-label": t("remove") }, icon("mdi:minus"));
      minus.addEventListener("click", () => save((all) => all.filter((x) => x !== id)));
      list.append(h("div", { class: "hp-add-row", dataset: { key: id } },
        h("span", { class: "hp-handle" }, icon("mdi:drag")),
        h("div", { class: "hp-tile-icon" }, icon(entityIcon(hass, st))),
        h("div", { class: "hp-add-text" }, h("div", {}, entityName(hass, id)), h("small", {}, st ? `${id} · ${stateText(hass, st)}` : id)),
        minus));
    }
    if (!list.children.length) list.append(h("div", { class: "hp-empty" }, t("modes_empty")));
  }
  sortable(list, { onDrop: (keys) => save(() => keys), handle: ".hp-handle", axis: "y" });
  const add = btn("mdi:plus", t("add_devices"), "primary");
  add.addEventListener("click", () => addDialog(ctx, {
    container: "_modes",
    autoItems: modeIds(ctx.settings.s),
    domains: MODE_DOMAINS,
    onPick: (id) => save((all) => [...all.filter((x) => x !== id), id]),
  }));
  draw();
  sheet.body.append(h("p", { class: "hp-muted small" }, t("modes_edit_hint")), list, h("div", { class: "hp-sheet-actions" }, add));
  return sheet;
}
