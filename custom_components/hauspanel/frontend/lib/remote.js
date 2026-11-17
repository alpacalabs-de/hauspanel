// Remote control for a media player: the arrows of the remote that belongs to it, next to the player.
// Every integration names its buttons differently, so each one gets its own list. Only the few keys
// a remote really needs are here: arrows, OK, back, home, menu. Everything else stays in the player.
import { h, icon, supports, slider } from "./util.js";
import { MEDIA, roundBtn } from "./domains.js";
import { t } from "./i18n.js";

/**
 * The button names per integration: up, down, left, right, OK, back, home, menu.
 * Taken from each integration's own documentation; `webostv` is the odd one out, see remoteFor().
 */
export const PLATFORM_KEYS = {
  apple_tv: { up: "up", down: "down", left: "left", right: "right", ok: "select", back: "menu", home: "home", menu: "top_menu" },
  androidtv_remote: { up: "DPAD_UP", down: "DPAD_DOWN", left: "DPAD_LEFT", right: "DPAD_RIGHT", ok: "DPAD_CENTER", back: "BACK", home: "HOME", menu: "MENU" },
  roku: { up: "up", down: "down", left: "left", right: "right", ok: "select", back: "back", home: "home", menu: "info" },
  samsungtv: { up: "KEY_UP", down: "KEY_DOWN", left: "KEY_LEFT", right: "KEY_RIGHT", ok: "KEY_ENTER", back: "KEY_RETURN", home: "KEY_HOME", menu: "KEY_MENU" },
  braviatv: { up: "Up", down: "Down", left: "Left", right: "Right", ok: "Confirm", back: "Return", home: "Home", menu: "ActionMenu" },
  philips_js: { up: "CursorUp", down: "CursorDown", left: "CursorLeft", right: "CursorRight", ok: "Confirm", back: "Back", home: "Home", menu: "Options" },
  webostv: { up: "UP", down: "DOWN", left: "LEFT", right: "RIGHT", ok: "ENTER", back: "BACK", home: "HOME", menu: "MENU" },
};

/** A held arrow repeats about this often. */
export const REPEAT_MS = 300;

/** The order the buttons are drawn in, with their icon and text. */
const PAD = [["up", "mdi:chevron-up", "rc_up"], ["left", "mdi:chevron-left", "rc_left"], ["right", "mdi:chevron-right", "rc_right"], ["down", "mdi:chevron-down", "rc_down"]];
const NAV = [["back", "mdi:arrow-u-left-top", "back"], ["home", "mdi:home-outline", "rc_home"], ["menu", "mdi:menu", "menu"]];

/**
 * The remote that belongs to a media player, or null when there is none (then the popup shows
 * the player alone, as before).
 *
 * - A `remote.*` entity on the same device, from an integration we know: its own send_command.
 * - An LG TV (`webostv`) has no remote entity; there the player itself takes `webostv.button`.
 *
 * An entity that is in the registry but has no state is skipped: it is disabled or gone, and
 * sending to it would do nothing.
 */
export function remoteFor(hass, mediaPlayerId) {
  const reg = hass?.entities?.[mediaPlayerId];
  if (!reg) return null;
  if (reg.device_id) {
    for (const [id, e] of Object.entries(hass.entities)) {
      if (!id.startsWith("remote.") || e.device_id !== reg.device_id) continue;
      const keys = PLATFORM_KEYS[e.platform];
      if (!keys || !hass.states?.[id]) continue;
      return { type: "remote", entity: id, platform: e.platform, keys };
    }
  }
  // LG: no remote entity of its own, the service sits on the player.
  if (reg.platform === "webostv") return { type: "webostv", entity: mediaPlayerId, platform: "webostv", keys: PLATFORM_KEYS.webostv };
  return null;
}

/** Sends one button. Returns what the service call returns, or null for a button this platform has not got. */
export function sendKey(hass, rc, key) {
  const cmd = rc?.keys?.[key];
  if (!cmd) return null;
  return rc.type === "webostv"
    ? hass.callService("webostv", "button", { entity_id: rc.entity, button: cmd })
    : hass.callService("remote", "send_command", { entity_id: rc.entity, command: cmd });
}

/**
 * The remote itself. `narrow` stacks it for the phone and puts play/pause next to back, home and menu.
 * Volume, source and playback go through the media player, like in the player view; what the player
 * cannot do is hidden.
 */
export function remoteView(ctx, entityId, rc, { narrow = false } = {}) {
  const call = (svc, data = {}) => ctx.hass.callService("media_player", svc, { entity_id: entityId, ...data });
  const press = (key) => sendKey(ctx.hass, rc, key);

  // An arrow repeats while it is held; a tap sends exactly one.
  const arrow = (key, ic, label) => {
    const b = h("button", { class: "hp-round", "aria-label": t(label), title: t(label) }, icon(ic));
    let timer = null;
    const stop = () => { clearInterval(timer); timer = null; };
    b.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      e.preventDefault();
      stop();
      press(key);
      timer = setInterval(() => (b.isConnected ? press(key) : stop()), REPEAT_MS);
    });
    for (const ev of ["pointerup", "pointercancel", "pointerleave"]) b.addEventListener(ev, stop);
    return b;
  };

  const pad = h("div", { class: "hp-rc-pad" },
    ...PAD.map(([key, ic, label]) => {
      const b = arrow(key, ic, label);
      b.classList.add(`hp-rc-${key}`);
      return b;
    }),
    roundBtn("mdi:circle-medium", t("rc_ok"), () => press("ok"), "main hp-rc-ok"));

  const nav = h("div", { class: "hp-rc-nav" },
    ...NAV.map(([key, ic, label]) => roundBtn(ic, t(label), () => press(key), "ghost")));

  const mute = roundBtn("mdi:volume-high", t("mute"), () => call("volume_mute", { is_volume_muted: !ctx.hass.states[entityId]?.attributes.is_volume_muted }), "ghost");
  const down = roundBtn("mdi:minus", t("volume"), () => call("volume_down"), "ghost");
  const up = roundBtn("mdi:plus", t("volume"), () => call("volume_up"), "ghost");
  const vol = slider({ value: 0, cls: "volume", label: t("volume"), onChange: (v) => call("volume_set", { volume_level: v / 100 }) });
  const volBox = h("div", { class: "hp-rc-vol" }, mute, down, vol, up);

  const chips = h("div", { class: "hp-rc-chips" });
  const srcBox = h("div", { class: "hp-rc-sources" }, h("span", { class: "hp-label" }, t("rc_source")), chips);

  const play = roundBtn("mdi:play", t("play_pause"), () => call("media_play_pause"), "main big");
  const prev = roundBtn("mdi:skip-previous", t("previous"), () => call("media_previous_track"));
  const next = roundBtn("mdi:skip-next", t("next"), () => call("media_next_track"));
  const playBox = h("div", { class: "hp-rc-play" }, prev, play, next);

  // On the phone everything is under each other and play/pause joins back, home and menu.
  if (narrow) nav.append(playBox);
  const el = h("div", { class: `hp-rc ${narrow ? "narrow" : ""}` },
    h("div", { class: "hp-rc-side left" }, pad, nav),
    h("div", { class: "hp-rc-side right" }, volBox, srcBox, narrow ? null : playBox));

  let lastList = null;
  el.update = (hass) => {
    const st = hass.states[entityId];
    if (!st) return;
    const a = st.attributes;
    play.querySelector("ha-icon").icon = st.state === "playing" ? "mdi:pause" : "mdi:play";
    prev.hidden = !supports(st, MEDIA.PREVIOUS);
    next.hidden = !supports(st, MEDIA.NEXT);
    playBox.hidden = !supports(st, MEDIA.PAUSE) && !supports(st, MEDIA.PLAY);
    mute.hidden = !supports(st, MEDIA.VOLUME_MUTE);
    mute.querySelector("ha-icon").icon = a.is_volume_muted ? "mdi:volume-off" : "mdi:volume-high";
    const step = supports(st, MEDIA.VOLUME_STEP);
    down.hidden = !step;
    up.hidden = !step;
    vol.hidden = !supports(st, MEDIA.VOLUME_SET);
    if (!vol.hidden) vol.update(Math.round((a.volume_level ?? 0) * 100));
    volBox.hidden = mute.hidden && vol.hidden && !step;
    const list = supports(st, MEDIA.SELECT_SOURCE) ? a.source_list || [] : [];
    srcBox.hidden = !list.length;
    if (lastList !== list.join("|")) {
      lastList = list.join("|");
      chips.replaceChildren(...list.map((s) => {
        const b = h("button", { class: "hp-chip", dataset: { src: s } }, s);
        b.addEventListener("click", (e) => { e.stopPropagation(); call("select_source", { source: s }); });
        return b;
      }));
    }
    for (const b of chips.children) b.classList.toggle("active", b.dataset.src === a.source);
  };
  el.update(ctx.hass);
  return el;
}
