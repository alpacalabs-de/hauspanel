// The house battery from Home Assistant's energy settings: how full it is right now.
// Home Assistant knows the charge level as stat_soc (and the usable capacity as capacity or
// entity_capacity) since 2026.10; on older versions the sensor sitting on the same device does it.
import { formatNumber } from "./util.js";
import { t } from "./i18n.js";

/** A stable key for the pickers: the battery's own meter, else its place in the list. */
export const batteryKey = (s, i) => s?.stat_energy_from || s?.stat_energy_to || s?.stat_soc || `battery_${i}`;

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Every battery source of the energy settings, in their order:
 * [{ key, from, to, rate, soc, capacity, entityCapacity, name }].
 */
export const batterySources = (prefs) => (prefs?.energy_sources || [])
  .filter((x) => x.type === "battery")
  .map((s, i) => ({
    key: batteryKey(s, i),
    from: s.stat_energy_from || null,
    to: s.stat_energy_to || null,
    rate: s.stat_rate || null,
    soc: s.stat_soc || null,
    capacity: num(s.capacity) > 0 ? num(s.capacity) : null,
    entityCapacity: s.entity_capacity || null,
    name: s.name || null,
  }));

/**
 * What one battery is called: its own name from the energy settings, and with several of them
 * the name of its energy sensor, so two batteries are not both called "Battery".
 */
export const batteryName = (hass, s, several) => s.name
  || (several && [s.from, s.to, s.soc, s.rate].map((id) => hass?.states?.[id]?.attributes?.friendly_name).find(Boolean))
  || t("battery");

/** Every sensor that reports a charge level in percent, for the picker. */
export const socSensors = (hass) => Object.keys(hass?.states || {})
  .filter((id) => id.startsWith("sensor.") && hass.states[id].attributes.device_class === "battery"
    && String(hass.states[id].attributes.unit_of_measurement || "").includes("%"))
  .sort((a, b) => (hass.states[a].attributes.friendly_name || a).localeCompare(hass.states[b].attributes.friendly_name || b));

/** The charge-level sensor sitting on the same device as the battery's own sensors (older Home Assistant). */
export function deviceSoc(hass, s) {
  const reg = hass?.entities || {};
  const dev = [s.from, s.to, s.rate].map((id) => reg[id]?.device_id).find(Boolean);
  if (!dev) return null;
  return socSensors(hass).find((id) => reg[id]?.device_id === dev) || null;
}

/** Which sensor shows this battery's charge level: the one picked by hand, then Home Assistant's, then the device's. */
export function socSensor(hass, s, picks) {
  const own = picks?.batteryBy?.[s.key]?.soc;
  if (own) return own;
  if (s.soc && hass?.states?.[s.soc]) return s.soc;
  return deviceSoc(hass, s);
}

/** How much the battery holds in kWh, from the energy settings or the sensor named there. */
export function capacityOf(hass, s) {
  if (s.capacity) return s.capacity;
  const v = num(hass?.states?.[s.entityCapacity]?.state);
  return v > 0 ? v : null;
}

/**
 * The charge level of the house battery right now: null when no battery says anything,
 * otherwise { pct, parts: [{ key, id, name, pct, capacity }] }.
 * Several batteries count by their capacity; without a capacity they count the same.
 */
export function batterySoc(hass, prefs, picks) {
  const all = batterySources(prefs);
  const parts = all.map((s) => {
    const id = socSensor(hass, s, picks);
    const v = num(hass?.states?.[id]?.state);
    if (!id || v == null) return null;
    return { key: s.key, id, name: batteryName(hass, s, all.length > 1), pct: Math.max(0, Math.min(100, v)), capacity: capacityOf(hass, s) };
  }).filter(Boolean);
  if (!parts.length) return null;
  const caps = parts.map((p) => p.capacity || 0);
  const total = caps.reduce((a, b) => a + b, 0);
  // Only weigh them when every battery knows how big it is, otherwise it is just the average.
  const weigh = total > 0 && parts.every((p) => p.capacity);
  const pct = weigh
    ? parts.reduce((a, p) => a + p.pct * p.capacity, 0) / total
    : parts.reduce((a, p) => a + p.pct, 0) / parts.length;
  return { pct, parts };
}

/** The charge level as text, in the numbers of the screen's own language. */
export const socText = (hass, pct) => `${formatNumber(hass, pct, pct < 10 ? 1 : 0)} %`;
