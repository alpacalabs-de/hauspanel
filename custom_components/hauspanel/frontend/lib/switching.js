// Switching many lights at once (a floor, a room, the whole home).
// One call for eleven lamps is too much for some integrations ("Device is busy"), and lamps then end up
// in the wrong state. So they go out a few at a time, and lamps that didn't follow are named with "Try again".
import { entityName, isUnavailable } from "./util.js";
import { t } from "./i18n.js";
import { toast } from "./dialogs.js";

export const BATCH = 3; // lamps per call
export const GAP_MS = 300; // pause between calls
export const SLOW_MS = 2000; // a call that hangs doesn't hold up the next ones longer than this
export const CHECK_MS = 5000; // after this, lamps not in the new state count as not reacting

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** [a,b,c,d,e] in groups of n: [[a,b,c],[d,e]]. */
export function chunks(ids, n = BATCH) {
  const out = [];
  for (let i = 0; i < ids.length; i += n) out.push(ids.slice(i, i + n));
  return out;
}

/** The lamps that are not (yet) in the state the service asked for. Unavailable ones are left out: the tile already says so. */
export function stuckIds(hass, ids, service) {
  const want = service === "turn_on";
  return ids.filter((id) => {
    const st = hass.states[id];
    if (!st || isUnavailable(st)) return false;
    return (st.state === "on") !== want;
  });
}

/** "Floor lamp did not react" or "Floor lamp, Hall and 2 more did not react". */
export function failedText(hass, ids) {
  const names = ids.map((id) => entityName(hass, id));
  if (names.length === 1) return t("sw_failed_one", { name: names[0] });
  const shown = names.slice(0, 2).join(", ");
  return names.length > 2 ? t("sw_failed_more", { names: shown, n: names.length - 2 }) : t("sw_failed", { names: shown });
}

/**
 * Turns lights on or off a few at a time, then names those that didn't follow, with "Try again".
 * `opts.wait` and `opts.check` are there for the tests.
 */
export async function switchMany(ctx, domain, service, ids, { wait = sleep, check = CHECK_MS } = {}) {
  if (!ids.length) return [];
  const groups = chunks(ids);
  for (const [i, group] of groups.entries()) {
    if (i) await wait(GAP_MS);
    const call = Promise.resolve(ctx.hass.callService(domain, service, { entity_id: group })).catch(() => {});
    await Promise.race([call, wait(SLOW_MS)]);
  }
  await wait(check);
  const stuck = stuckIds(ctx.hass, ids, service);
  if (stuck.length) {
    toast(ctx, failedText(ctx.hass, stuck), {
      action: t("sw_retry"),
      ms: 9000,
      onAction: () => switchMany(ctx, domain, service, stuck),
    });
  }
  return stuck;
}

/** Lights on or off; the usual way for the panel's group buttons. */
export const switchLights = (ctx, ids, on) => switchMany(ctx, "light", on ? "turn_on" : "turn_off", ids);
