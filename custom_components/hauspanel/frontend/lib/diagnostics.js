// "Info for a bug report": versions, panel, layout, language and device in a few lines to paste into an issue.
import { h, icon } from "./util.js";
import { openSheet } from "./dialogs.js";
import { t, currentLang } from "./i18n.js";

export const ISSUE_URL = "https://github.com/alpacalabs-de/hauspanel/issues/new?template=bug_report.yml";

const PANEL_NAMES = { hauspanel: "HausPanel", iphonepanel: "MobilePanel", securitypanel: "SecurityPanel" };

/** A short, readable name for the browser and device, without anything personal. */
export function deviceText(ua = "", touch = false) {
  const app = /Home ?Assistant\//i.test(ua) ? "Home Assistant app" : /Fully/i.test(ua) ? "Fully Kiosk" : null;
  // iPads have said "Macintosh" since iPadOS 13; touch tells them apart from a Mac.
  const os = /iPad/.test(ua) || (/Macintosh/.test(ua) && touch) ? "iPad"
    : /iPhone/.test(ua) ? "iPhone"
    : /Android/.test(ua) ? (/Mobile/.test(ua) ? "Android phone" : "Android tablet")
    : /Windows/.test(ua) ? "Windows"
    : /Mac OS X|Macintosh/.test(ua) ? "Mac"
    : /Linux/.test(ua) ? "Linux" : "unknown device";
  // Edge and Samsung Internet also say "Chrome", Chrome also says "Safari": the most specific name wins.
  const names = [["Edg", "Edge"], ["SamsungBrowser", "Samsung Internet"], ["Firefox", "Firefox"], ["Chrome", "Chrome"], ["Version", "Safari"]];
  const hit = names.map(([k, name]) => [name, new RegExp(`${k}/(\\d+)`).exec(ua)]).find(([, m]) => m);
  const browser = hit ? `${hit[0]} ${hit[1][1]}` : "";
  return [os, app, browser].filter(Boolean).join(", ");
}

/** The lines for the issue. `info` comes from diagnosticsInfo(); kept apart so it can be tested. */
export function diagnosticsText(info) {
  const v = info.versions || {};
  const ver = [info.screen && `on this screen ${info.screen}`, v.running && `Home Assistant runs ${v.running}`, v.installed && v.installed !== v.running && `installed ${v.installed} (restart needed)`]
    .filter(Boolean).join(", ");
  return [
    `HausPanel: ${ver || "unknown"}`,
    `Home Assistant: ${info.ha || "unknown"}`,
    `Panel: ${info.panel}, layout ${info.layout}${info.tileSize ? `, tile size ${info.tileSize}` : ""}${info.lite ? ", lite" : ""}`,
    `Settings: ${info.personal ? "own (personal)" : "shared"}`,
    `Language: ${info.language}`,
    `Device: ${info.device}, ${info.size}`,
    `Rooms: ${info.rooms}, entities without a room: ${info.unassigned}`,
  ].join("\n");
}

/** Collects what diagnosticsText() needs from the panel. */
export async function diagnosticsInfo(ctx) {
  let versions = {};
  try { versions = await ctx.hass.callWS({ type: "hauspanel/version" }); } catch { /* an old Home Assistant side doesn't know it */ }
  const dev = ctx.settings.device;
  const fixedSize = ["grid", "sidebar"].includes(ctx.layout) && (dev.tileSize || "auto") !== "auto";
  return {
    screen: String(ctx.version || "").split("-")[0],
    versions,
    ha: ctx.hass.config?.version,
    panel: `${PANEL_NAMES[ctx._panelId] || ctx._panelId || "HausPanel"}`,
    layout: ctx.layout,
    tileSize: fixedSize ? dev.tileSize : "",
    lite: !!ctx.lite,
    personal: !!ctx.settings.personal,
    language: `${ctx.hass.language || "?"} (panel: ${currentLang()})`,
    device: deviceText(navigator.userAgent, navigator.maxTouchPoints > 1),
    size: `${window.innerWidth}×${window.innerHeight}${window.devicePixelRatio > 1 ? ` @${Math.round(window.devicePixelRatio * 10) / 10}x` : ""}`,
    rooms: ctx.model?.areas?.length ?? 0,
    unassigned: ctx.model?.unassigned?.all?.length ?? 0,
  };
}

/** Copies text; the Clipboard API needs https, so there is a fallback for Home Assistant on plain http. */
async function copy(text, field) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch { /* falls through */ }
  try {
    field.focus();
    field.select();
    return document.execCommand("copy");
  } catch {
    return false;
  }
}

/** The window behind "Info for a bug report": the text to read, copy and paste into the issue. */
export async function openDiagnostics(ctx) {
  const text = diagnosticsText(await diagnosticsInfo(ctx));
  const sheet = openSheet(ctx, { title: t("diag_title"), subtitle: t("diag_sub"), cls: "hp-diag" });
  const field = h("textarea", { class: "hp-input hp-diag-text", readonly: true, rows: 8, spellcheck: false }, text);
  const status = h("small", { class: "hp-muted" });
  const copyBtn = h("button", { class: "hp-chip" }, icon("mdi:content-copy"), t("diag_copy"));
  copyBtn.addEventListener("click", async () => {
    const ok = await copy(text, field);
    status.textContent = ok ? t("diag_copied") : t("diag_copy_failed");
  });
  const issue = h("a", { class: "hp-chip", href: ISSUE_URL, target: "_blank", rel: "noopener" }, icon("mdi:github"), t("diag_issue"));
  sheet.body.append(field, h("div", { class: "hp-diag-btns" }, copyBtn, issue), status);
  return sheet;
}
