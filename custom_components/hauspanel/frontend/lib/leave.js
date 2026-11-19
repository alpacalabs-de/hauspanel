// "Leaving home": what is still open, on or playing, and one button that switches it all off and locks.
// Before that, Home Assistant takes a snapshot (scene.create), so "Undo" puts lights and music back.
import { h, icon, domainOf } from "./util.js";
import { isOn, countedLights } from "./model.js";
import { openSheet } from "./dialogs.js";
import { runningAppliances } from "./usage.js";
import { t } from "./i18n.js";
import { btn, clock } from "./popkit.js";
import { carDevices } from "./car.js";
import { weatherWarningRow } from "./weather.js";
import { switchLights } from "./switching.js";
import { isHeating } from "./notices.js";

const UNDO_SCENE = "hauspanel_leave_undo";
const UNDO_HOURS = 12;
const OPENINGS = ["door", "window", "garage_door", "opening"];

/** The snapshot lives in Home Assistant (until it restarts), so every screen can undo. */
const undoInfo = (hass) => {
  const st = hass.states[`scene.${UNDO_SCENE}`];
  const at = st && Date.parse(st.last_changed);
  return st && Date.now() - at < UNDO_HOURS * 3600e3 ? { at } : null;
};

/** Devices left alone when going out, picked by hand in the window (a motion light outside, say). */
export const leftAlone = (ctx) => new Set(ctx?.settings?.s?.leaveSkip || []);

/** Everything worth a look before leaving. Cars, robot settings and devices left alone are left out. */
export function leaveItems(ctx, hass) {
  const m = ctx.model;
  const skip = leftAlone(ctx);
  const keep = (id) => !skip.has(id);
  const inHouse = (id) => !!m.areaOf[id] && m.areaOf[id] !== "_other";
  // A car's doors and bonnet are not the house's.
  const cars = new Set(carDevices(hass));
  const notCar = (id) => !cars.has(hass.entities?.[id]?.device_id) && !/(^|\.|_)(car|auto)_/i.test(id);
  const all = Object.keys(hass.states);
  const lights = countedLights(ctx.settings?.s, m.lights).filter((id) => keep(id) && inHouse(id) && isOn(hass.states[id]));
  const media = all.filter((id) => keep(id) && domainOf(id) === "media_player" && hass.states[id].state === "playing" && !hass.entities?.[id]?.hidden);
  const open = all.filter((id) => keep(id) && domainOf(id) === "binary_sensor" && OPENINGS.includes(hass.states[id].attributes.device_class)
    && hass.states[id].state === "on" && notCar(id) && inHouse(id) && !hass.entities?.[id]?.hidden);
  const locks = all.filter((id) => keep(id) && domainOf(id) === "lock" && hass.states[id].state === "unlocked" && notCar(id) && !/bediensperre|child|kindersicherung/i.test(id));
  const covers = all.filter((id) => keep(id) && domainOf(id) === "cover" && ["garage", "gate"].includes(hass.states[id].attributes.device_class) && hass.states[id].state === "open");
  const apps = runningAppliances(hass);
  const heat = all.filter((id) => keep(id) && domainOf(id) === "climate" && inHouse(id) && !hass.entities?.[id]?.hidden && isHeating(hass.states[id]));
  // Only what is still there: an entity that has vanished should not keep a line in the window.
  const skipped = [...skip].filter((id) => hass.states[id]);
  return { lights, media, open, locks, covers, heat, apps, skipped, count: lights.length + media.length + open.length + locks.length + covers.length + heat.length };
}

/** How a thermostat is set back when nobody is home: its away or eco preset if it has one, otherwise off. */
export function heatSetback(st) {
  const presets = (st?.attributes?.preset_modes || []).map((p) => String(p));
  const preset = presets.find((p) => p.toLowerCase() === "away") || presets.find((p) => p.toLowerCase() === "eco");
  return preset ? { service: "set_preset_mode", data: { preset_mode: preset } } : { service: "turn_off", data: {} };
}

export function openLeave(ctx) {
  const hass = ctx.hass;
  const name = (id) => ctx.hass.states[id]?.attributes.friendly_name || id;
  const room = (id) => ctx.model.areaById.get(ctx.model.areaOf[id])?.name || "";
  const picks = { lights: true, media: true, locks: true, covers: false, heat: false };
  const body = h("div", { class: "hp-leave" });
  const sheet = openSheet(ctx, { title: t("leave_title"), cls: "appliance leave" });
  const go = btn("mdi:home-export-outline", t("leave_go"), "primary");
  const undo = btn("mdi:undo-variant", t("leave_undo"));
  const foot = h("div", { class: "hp-sheet-actions hp-app-foot" }, undo, go);
  const note = h("div", { class: "hp-leave-note" });
  const hint = h("div", { class: "hp-leave-hint" }, t("leave_skip_hint"));
  // Windows open and rain, a storm or frost coming: say so first.
  const wx = weatherWarningRow(ctx);
  sheet.body.append(wx, body, hint, note, foot);

  const label = (id) => `${name(id)}${room(id) && !name(id).includes(room(id)) ? " · " + room(id) : ""}`;

  const group = (key, ic, title, ids, { action = true, sub, tap = false, max = 12 } = {}) => {
    if (!ids.length) return null;
    const chk = action ? h("button", { class: `hp-leave-chk ${picks[key] ? "on" : ""}`, "aria-label": title }, icon(picks[key] ? "mdi:checkbox-marked-circle" : "mdi:checkbox-blank-circle-outline")) : null;
    chk?.addEventListener("click", () => { picks[key] = !picks[key]; draw(ctx.hass); });
    const item = (id) => {
      if (typeof id !== "string") return h("span", { class: "it" }, id);
      if (!tap) return h("span", { class: "it" }, label(id));
      // A tap moves the device to "Left alone" and back.
      const el = h("span", { class: "it tap", role: "button", tabindex: "0", title: t("leave_skip_hint") }, label(id));
      el.addEventListener("click", () => { ctx.settings.toggleLeaveSkip(id); draw(ctx.hass); });
      return el;
    };
    return h("div", { class: `hp-leave-group ${key} ${action && !picks[key] ? "skip" : ""}` },
      h("div", { class: "head" }, h("span", { class: "ic" }, icon(ic)), h("div", { class: "txt" }, h("b", {}, title), h("small", {}, sub || "")), chk),
      h("div", { class: "items" }, ...ids.slice(0, max).map(item),
        ids.length > max ? h("span", { class: "it more" }, `+${ids.length - max}`) : null));
  };

  const draw = (hs) => {
    wx.update();
    const it = leaveItems(ctx, hs);
    const groups = [
      group("open", "mdi:window-open-variant", t("leave_open", { n: it.open.length }), it.open, { action: false, sub: t("leave_open_sub") }),
      group("locks", "mdi:lock-open-variant-outline", t("leave_locks", { n: it.locks.length }), it.locks, { sub: t("leave_locks_sub"), tap: true }),
      group("covers", "mdi:garage-open-variant", t("leave_covers", { n: it.covers.length }), it.covers, { sub: t("leave_covers_sub"), tap: true }),
      group("heat", "mdi:radiator", t("leave_heat", { n: it.heat.length }), it.heat, { sub: t("leave_heat_sub"), tap: true }),
      group("lights", "mdi:lightbulb-on-outline", t("leave_lights", { n: it.lights.length }), it.lights, { sub: t("leave_lights_sub"), tap: true }),
      group("media", "mdi:music", t("leave_media", { n: it.media.length }), it.media, { sub: t("leave_media_sub"), tap: true }),
      group("apps", "mdi:washing-machine", t("leave_apps", { n: it.apps.length }), it.apps.map((a) => `${a.name} · ${a.text}`), { action: false, sub: t("leave_apps_sub") }),
    ].filter(Boolean);
    // Devices left alone sit at the bottom, after the all-clear if there is nothing else to do.
    const left = group("skipped", "mdi:hand-back-right-outline", t("leave_skip"), it.skipped, { action: false, tap: true, max: 40 });
    const shown = [...(groups.length ? groups : [h("div", { class: "hp-leave-ok" }, icon("mdi:check-decagram"), h("b", {}, t("leave_all_good")))]), left].filter(Boolean);
    body.replaceChildren(...shown);
    hint.hidden = !shown.some((g) => g.querySelector?.(".it.tap"));
    const todo = (picks.lights && it.lights.length) || (picks.media && it.media.length) || (picks.locks && it.locks.length) || (picks.covers && it.covers.length) || (picks.heat && it.heat.length);
    go.disabled = !todo;
    const u = undoInfo(hs);
    undo.hidden = !u;
    note.textContent = u ? t("leave_undo_note", { time: clock(hs, new Date(u.at)) }) : "";
    note.hidden = !u;
  };

  go.addEventListener("click", async () => {
    const it = leaveItems(ctx, ctx.hass);
    const lights = picks.lights ? it.lights : [];
    const media = picks.media ? it.media : [];
    const heat = picks.heat ? it.heat : [];
    const snap = [...lights, ...media, ...heat];
    go.disabled = true;
    try {
      if (snap.length) await ctx.hass.callService("scene", "create", { scene_id: UNDO_SCENE, snapshot_entities: snap });
      if (lights.length) switchLights(ctx, lights, false);
      if (media.length) ctx.hass.callService("media_player", "media_pause", { entity_id: media });
      if (picks.locks && it.locks.length) ctx.hass.callService("lock", "lock", { entity_id: it.locks });
      if (picks.covers && it.covers.length) ctx.hass.callService("cover", "close_cover", { entity_id: it.covers });
      for (const id of heat) {
        const sb = heatSetback(ctx.hass.states[id]);
        ctx.hass.callService("climate", sb.service, { entity_id: id, ...sb.data });
      }
      ctx.toast?.(t("leave_done"));
    } catch (e) {
      ctx.toast?.(t("leave_failed"));
    }
    setTimeout(() => draw(ctx.hass), 800);
  });
  undo.addEventListener("click", async () => {
    try {
      await ctx.hass.callService("scene", "turn_on", { entity_id: `scene.${UNDO_SCENE}` });
      setTimeout(() => ctx.hass.callService("scene", "delete", { entity_id: `scene.${UNDO_SCENE}` }).catch(() => {}), 1500);
      ctx.toast?.(t("leave_undone"));
    } catch {
      ctx.toast?.(t("leave_undo_failed"));
    }
    setTimeout(() => draw(ctx.hass), 800);
  });

  draw(hass);
  sheet.updaters.push(draw);
}
