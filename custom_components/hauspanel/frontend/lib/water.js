// Water from Home Assistant's energy settings: litres and cost on the energy page, and a small popup
// with today, this week and this month, and what flows right now when there is a flow sensor.
import { h, formatNumber, startOfDay, addDays } from "./util.js";
import { openSheet } from "./dialogs.js";
import { t } from "./i18n.js";
import { stat } from "./popkit.js";

/** Litres in one unit of the meter. Unknown units count as litres. */
const LITRES = { "m³": 1000, m3: 1000, L: 1, l: 1, gal: 3.78541, "ft³": 28.3168, ft3: 28.3168, CCF: 2831.68 };
export const toLitres = (v, unit) => v * (LITRES[unit] ?? 1);

/** Water meters from the energy settings: [{ from, unit, priceEntity, priceNumber }]. */
export function waterSources(hass, prefs) {
  return (prefs?.energy_sources || []).filter((x) => x.type === "water" && x.stat_energy_from).map((s) => ({
    from: s.stat_energy_from,
    unit: hass.states[s.stat_energy_from]?.attributes.unit_of_measurement || "m³",
    priceEntity: s.entity_energy_price || null,
    priceNumber: s.number_energy_price ?? null,
  }));
}

/** Price per unit of the meter, or null. */
export function waterPrice(hass, w) {
  if (w.priceNumber != null) return Number(w.priceNumber);
  const v = Number(hass.states[w.priceEntity]?.state);
  return Number.isFinite(v) ? v : null;
}

/** "184 l" below 1000 litres, "1.3 m³" above. */
export function litresText(hass, l) {
  return l >= 1000 ? `${formatNumber(hass, l / 1000, l >= 10000 ? 0 : 1)} m³` : `${formatNumber(hass, l, 0)} l`;
}

/** A flow sensor for the meter: one on the same device, otherwise the only one in the house. */
export function flowSensor(hass, meterId) {
  const flows = Object.keys(hass.states).filter((id) => id.startsWith("sensor.") && hass.states[id].attributes.device_class === "volume_flow_rate");
  const dev = hass.entities?.[meterId]?.device_id;
  return (dev && flows.find((id) => hass.entities?.[id]?.device_id === dev)) || (flows.length === 1 ? flows[0] : null);
}

/** Litres per minute from a flow sensor, whatever unit it reports. */
export function flowLpm(st) {
  const v = Number(st?.state);
  if (!st || !Number.isFinite(v)) return null;
  const u = st.attributes.unit_of_measurement || "L/min";
  if (u === "m³/h") return (v * 1000) / 60;
  if (u === "L/h") return v / 60;
  if (u === "gal/min") return v * 3.78541;
  if (u === "L/s") return v * 60;
  return v;
}

/** Start of today, of this week (Monday) and of this month on this screen's clock, as the energy page counts. */
export function periodStart(period, now = new Date()) {
  const d = startOfDay(now);
  if (period === "week") return addDays(d, -((d.getDay() + 6) % 7));
  if (period === "month") return new Date(d.getFullYear(), d.getMonth(), 1);
  return d;
}

/** How much the meter counted since the start of the period, in its own unit. */
async function change(hass, id, period) {
  try {
    const r = await hass.callWS({ type: "recorder/statistics_during_period", start_time: periodStart(period).toISOString(), statistic_ids: [id],
      period: period === "day" ? "hour" : "day", types: ["change"] });
    const rows = r?.[id] || [];
    return rows.length ? rows.reduce((a, x) => a + Math.max(0, x.change || 0), 0) : null;
  } catch { return null; }
}

/** The water popup: today, this week and this month in litres and money, and the flow right now. */
export function openWater(ctx, w) {
  const hass = ctx.hass;
  const sheet = openSheet(ctx, { title: t("water"), subtitle: "", cls: "appliance water" });
  const flowId = flowSensor(hass, w.from);
  const sNow = flowId ? stat("mdi:water-pump", t("water_now")) : null;
  // One line per period: name, litres, money.
  const rows = ["day", "week", "month"].map((p) => ({ p, l: h("b", {}, "–"), c: h("span", {}, "") }));
  sheet.body.append(
    ...(sNow ? [h("div", { class: "hp-app-stats" }, sNow)] : []),
    h("div", { class: "hp-water-rows" }, ...rows.map((r) => h("div", { class: "hp-water-row" }, h("span", {}, t(`water_${r.p}`)), r.l, r.c))));
  const upd = (hs) => {
    if (!sNow) return;
    const lpm = flowLpm(hs.states[flowId]);
    sNow.set(lpm == null ? "–" : lpm < 0.05 ? t("water_still") : `${formatNumber(hs, lpm, lpm < 10 ? 1 : 0)} l/min`);
  };
  upd(hass);
  sheet.updaters.push(upd);
  const price = waterPrice(hass, w);
  const cur = hass.config?.currency || "EUR";
  const money = (v) => { try { return new Intl.NumberFormat(hass.locale?.language || hass.language, { style: "currency", currency: cur }).format(v); } catch { return `${v.toFixed(2)} ${cur}`; } };
  for (const r of rows) {
    change(hass, w.from, r.p).then((v) => {
      r.l.textContent = v == null ? "–" : litresText(hass, toLitres(v, w.unit));
      r.c.textContent = v == null || price == null ? "" : money(v * price);
    });
  }
}
