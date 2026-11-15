// Locking Edit and the settings, for family and kitchen tablets: either only Home Assistant admins may change things,
// or anyone who knows a PIN. It guards against changes by accident (children, guests), not against attackers:
// the PIN's hash sits in the shared settings, and Home Assistant's own user rights stay what counts.
import { t } from "./i18n.js";
import { codePad } from "./overviews.js";

export const LOCK_MODES = ["off", "admins", "pin"];
/** After the PIN, Edit and the settings stay open this long on this screen. */
export const UNLOCK_MS = 10 * 60000;

/** A short hash of the PIN (cyrb53). Works without https, where crypto.subtle is missing. */
export function pinHash(pin) {
  const str = `hauspanel:${pin}`;
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** The lock in force: "pin" only with a PIN set. */
export function lockMode(s) {
  const m = s?.editLock;
  if (m === "pin") return s.editPin ? "pin" : "off";
  return m === "admins" ? "admins" : "off";
}

/** Whether this person on this screen may change things right now, without asking. */
export function mayChange({ s, isAdmin, unlockedUntil = 0, now = Date.now() }) {
  const mode = lockMode(s);
  if (mode === "admins") return !!isAdmin;
  if (mode === "pin") return unlockedUntil > now;
  return true;
}

/** Whether Edit and the gear show at all: with "admins only", not for everybody else. */
export const showChangeButtons = (ctx) => lockMode(ctx.settings.s) !== "admins" || !!ctx.hass?.user?.is_admin;

/** Runs `fn` (enter Edit, open the settings) when allowed, after the PIN when one is set. */
export function guarded(ctx, fn) {
  const s = ctx.settings.s;
  if (mayChange({ s, isAdmin: ctx.hass?.user?.is_admin, unlockedUntil: ctx._unlockedUntil })) return fn();
  if (lockMode(s) !== "pin") return ctx.toast(t("lock_admins_only"));
  codePad(ctx, {
    title: t("lock_enter"),
    subtitle: "",
    onCode: (code, sheet) => {
      if (pinHash(code) !== ctx.settings.s.editPin) return ctx.toast(t("lock_wrong"));
      ctx._unlockedUntil = Date.now() + UNLOCK_MS;
      sheet.close();
      fn();
    },
  });
}

/** Asks for a new PIN twice, then hands its hash on. */
export function choosePin(ctx, onHash) {
  codePad(ctx, {
    title: t("lock_new_pin"),
    subtitle: "",
    onCode: (first, sheet) => {
      sheet.close();
      codePad(ctx, {
        title: t("lock_repeat_pin"),
        subtitle: "",
        onCode: (second, sheet2) => {
          sheet2.close();
          if (first !== second) return ctx.toast(t("lock_mismatch"));
          ctx._unlockedUntil = Date.now() + UNLOCK_MS;
          onHash(pinHash(first));
        },
      });
    },
  });
}
