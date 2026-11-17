// Meter readings on the energy page: what the grid, gas and water meters count right now.
// The meters are the ones picked in Home Assistant's own energy settings; nothing here is changed.
import { h, formatTime } from "./util.js";
import { openSheet } from "./dialogs.js";
import { t } from "./i18n.js";

const KINDS = { import: "grid_import", export: "grid_export", gas: "gas", water: "water" };

/**
 * The meters of the energy settings with the reading they show right now:
 * [{ id, kind: "import" | "export" | "gas" | "water", name, value, unit }], in the order of the settings.
 * Only entities that really exist and report a number: statistics without an entity (tibber:…) and
 * unknown/unavailable fall out, and every id counts once even when two sources name it.
 */
export function meterReadings(hass, prefs) {
  const out = [];
  const seen = new Set();
  const add = (kind, id, name) => {
    if (!id || seen.has(id)) return;
    const st = hass?.states?.[id];
    const v = Number(st?.state);
    if (!st || !Number.isFinite(v)) return;
    seen.add(id);
    out.push({ id, kind, name: name || st.attributes?.friendly_name || id, value: v, unit: st.attributes?.unit_of_measurement || "" });
  };
  for (const s of prefs?.energy_sources || []) {
    if (s.type === "grid") {
      // Both formats Home Assistant has used: flow_from/flow_to, and the meters right on the source.
      const from = s.flow_from?.length ? s.flow_from : [s];
      const to = s.flow_to?.length ? s.flow_to : [s];
      // Several meters in one source need their own names to be told apart.
      for (const f of from) add("import", f.stat_energy_from, from.length > 1 ? null : s.name);
      for (const f of to) add("export", f.stat_energy_to, to.length > 1 ? null : s.name);
    } else if (s.type === "gas" || s.type === "water") {
      add(s.type, s.stat_energy_from, s.name);
    }
  }
  return out;
}

/** The reading as Home Assistant would show it (locale and decimals from HA). */
export function readingText(hass, r) {
  const st = hass?.states?.[r.id];
  if (!st) return "–";
  return hass.formatEntityState?.(st) || [st.state, r.unit].filter(Boolean).join(" ");
}

/** What a line is called: the kind of meter, plus its own name when there are several of that kind. */
export function readingLabel(readings, r) {
  const label = t(KINDS[r.kind]);
  const several = readings.filter((x) => x.kind === r.kind).length > 1;
  return several && r.name && r.name !== label ? `${label} · ${r.name}` : label;
}

/** The meter-readings popup: one line per meter with its reading and the time of the last value. */
export function openMeters(ctx, readings) {
  const sheet = openSheet(ctx, { title: t("meter_readings"), subtitle: "", cls: "appliance meters" });
  const rows = readings.map((r) => {
    const val = h("b", {}, "–");
    const when = h("span", {}, "");
    return { r, val, when, el: h("div", { class: "hp-water-row" }, h("span", {}, readingLabel(readings, r)), val, when) };
  });
  sheet.body.append(h("div", { class: "hp-water-rows" }, ...rows.map((x) => x.el)));
  const upd = (hs) => {
    for (const x of rows) {
      const st = hs?.states?.[x.r.id];
      const txt = readingText(hs, x.r);
      if (x.val.textContent !== txt) x.val.textContent = txt;
      const time = st?.last_changed ? formatTime(hs, new Date(st.last_changed)) : "";
      if (x.when.textContent !== time) x.when.textContent = time;
    }
  };
  upd(ctx.hass);
  sheet.updaters.push(upd);
  return sheet;
}
