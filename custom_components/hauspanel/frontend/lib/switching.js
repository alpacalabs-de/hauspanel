// Switching many lights at once (a floor, a room, the whole home).
// One call for eleven lamps is too much for some integrations ("Device is busy"), and lamps then end up
// in the wrong state. So they go out a few at a time; lamps that didn't follow get a second try on their
// own, one at a time, and only what still hangs is named with "Try again".
import { entityName, isUnavailable } from "./util.js";
import { t } from "./i18n.js";
import { toast } from "./dialogs.js";

export const BATCH = 3; // lamps per call
export const GAP_MS = 300; // pause between calls
export const SLOW_MS = 2000; // a call that hangs doesn't hold up the next ones longer than this
export const CHECK_MS = 5000; // after this, lamps not in the new state count as not reacting
export const AGAIN_MS = 1500; // short look after the second try, before anything is named

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
 * One call. The fifth argument of hass.callService is notifyOnError (HA 2024.7 and newer): false keeps
 * Home Assistant's own error toast away, which lasts 10 s and covers ours with "Try again".
 * A call that hangs doesn't hold up the next ones longer than SLOW_MS.
 */
async function send(ctx, domain, service, group, wait) {
  const call = Promise.resolve(ctx.hass.callService(domain, service, { entity_id: group }, undefined, false)).catch(() => {});
  await Promise.race([call, wait(SLOW_MS)]);
}

/**
 * Turns lights on or off a few at a time. Lamps that didn't follow get a second try on their own, one at
 * a time; only what still hangs after that is named, with "Try again" (which sends one at a time as well).
 * `opts.wait`, `opts.check` and `opts.again` are there for the tests, `opts.one` skips the second round.
 */
export async function switchMany(ctx, domain, service, ids, { wait = sleep, check = CHECK_MS, again = AGAIN_MS, one = false } = {}) {
  if (!ids.length) return [];
  const groups = one ? ids.map((id) => [id]) : chunks(ids);
  for (const [i, group] of groups.entries()) {
    if (i) await wait(GAP_MS);
    await send(ctx, domain, service, group, wait);
  }
  await wait(check);
  let stuck = stuckIds(ctx.hass, ids, service);
  if (stuck.length && !one) {
    for (const [i, id] of stuck.entries()) {
      if (i) await wait(GAP_MS);
      await send(ctx, domain, service, [id], wait);
    }
    await wait(again);
    stuck = stuckIds(ctx.hass, ids, service);
  }
  if (stuck.length) {
    toast(ctx, failedText(ctx.hass, stuck), {
      action: t("sw_retry"),
      ms: 9000,
      onAction: () => switchMany(ctx, domain, service, stuck, { one: true }),
    });
  }
  return stuck;
}

/** Lights on or off; the usual way for the panel's group buttons. */
export const switchLights = (ctx, ids, on) => switchMany(ctx, "light", on ? "turn_on" : "turn_off", ids);
