// After an update: a note when this screen still runs the old code (reload), or when Home Assistant
// still runs the old version and needs a restart (admins only). Checked at start and every hour.
import { h, icon } from "./util.js";
import { t } from "./i18n.js";

const HOUR = 3600e3;
const dismissed = (v) => { try { return sessionStorage.getItem("hauspanel.update.dismissed") === v; } catch { return false; } };
const dismiss = (v) => { try { sessionStorage.setItem("hauspanel.update.dismissed", v); } catch { /* private mode */ } };

/** What to say, from the versions: "reload", "restart" or nothing. Exported for the tests. */
export function updateState(shown, { running, installed } = {}, isAdmin = false) {
  if (!running) return null;
  if (shown && running !== shown) return { kind: "reload", version: running };
  if (installed && installed !== running && isAdmin) return { kind: "restart", version: installed };
  return null;
}

export function startUpdateCheck(ctx, root) {
  const bar = h("div", { class: "hp-update", hidden: true, role: "status" });
  root.append(bar);
  let armed = false;
  const show = (state) => {
    if (!state || dismissed(`${state.kind}:${state.version}`)) { bar.hidden = true; return; }
    const reload = state.kind === "reload";
    const act = h("button", { class: "hp-update-btn" }, t(reload ? "update_reload_btn" : "update_restart_btn"));
    act.addEventListener("click", () => {
      if (reload) { location.reload(); return; }
      // A restart takes Home Assistant away for a minute: the first tap asks.
      if (!armed) { armed = true; act.textContent = t("scene_confirm"); setTimeout(() => { armed = false; act.textContent = t("update_restart_btn"); }, 4000); return; }
      ctx.hass.callService("homeassistant", "restart");
      bar.hidden = true;
    });
    const close = h("button", { class: "hp-update-close", "aria-label": t("cam_close") }, icon("mdi:close"));
    close.addEventListener("click", () => { dismiss(`${state.kind}:${state.version}`); bar.hidden = true; });
    bar.replaceChildren(icon(reload ? "mdi:refresh" : "mdi:restart"),
      h("span", {}, t(reload ? "update_reload" : "update_restart", { v: state.version })), act, close);
    bar.hidden = false;
  };
  const check = async () => {
    try {
      const v = await ctx.hass.callWS({ type: "hauspanel/version" });
      show(updateState(ctx.version, v, !!ctx.hass.user?.is_admin));
    } catch {
      // An older HausPanel still running in Home Assistant doesn't know the question yet.
    }
  };
  setTimeout(check, 5000);
  return setInterval(check, HOUR);
}
