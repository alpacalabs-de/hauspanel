// Fit the main grid of Home and of a room on one screen (wall tablets): pick columns and card height so nothing scrolls.
// Only ever shrinks: when everything fits at the normal size, nothing changes.

const MIN_W = 100; // narrowest card
const MIN_H = 80; // lowest card
const NARROW = 700; // phones and small windows keep scrolling

const spanOf = (...vals) => {
  for (const v of vals) {
    const m = /span\s+(\d+)/.exec(v || "");
    if (m) return Number(m[1]);
  }
  return 1;
};

/** Rows needed for these items with c columns (grid-auto-flow: dense). */
function rowsFor(items, c) {
  const rows = [];
  const free = (r, col, w, hgt) => {
    for (let y = r; y < r + hgt; y++) for (let x = col; x < col + w; x++) if (rows[y]?.[x]) return false;
    return true;
  };
  for (const it of items) {
    const w = it.full ? c : Math.min(it.w, c);
    let placed = false;
    for (let r = 0; !placed; r++) {
      for (let col = 0; col + w <= c; col++) {
        if (!free(r, col, w, it.h)) continue;
        for (let y = r; y < r + it.h; y++) {
          rows[y] = rows[y] || [];
          for (let x = col; x < col + w; x++) rows[y][x] = true;
        }
        placed = true;
        break;
      }
    }
  }
  return rows.length;
}

/** Height left for el inside the scroller, after what sits above and below it. */
function spaceFor(scroller, el) {
  const sTop = scroller.getBoundingClientRect().top - scroller.scrollTop;
  const top = el.getBoundingClientRect().top - sTop;
  let padBottom = 0;
  for (let node = el.parentElement; node; node = node.parentElement) {
    padBottom += parseFloat(getComputedStyle(node).paddingBottom) || 0;
    if (node === scroller) break;
  }
  // What follows the element (edit tools, more sections), not the empty space below it.
  const bottom = el.getBoundingClientRect().bottom;
  let last = bottom;
  for (let node = el; node && node !== scroller; node = node.parentElement) {
    for (let sib = node.nextElementSibling; sib; sib = sib.nextElementSibling) {
      const r = sib.getBoundingClientRect();
      if (r.height) last = Math.max(last, r.bottom);
    }
  }
  return scroller.clientHeight - top - padBottom - (last - bottom);
}

/**
 * Height for el down to the bar at the bottom, for a page that does not scroll. In the Sidebar layout the main
 * side keeps a lot of room below for scrolling past the bar; `hp-fitted` drops it (taken off again by the caller
 * when the page has to scroll after all).
 */
function spaceToDock(scroller, el) {
  scroller.classList.toggle("hp-fitted", scroller.classList.contains("hp-side-main"));
  const H = spaceFor(scroller, el);
  const dock = scroller.getRootNode().querySelector?.(".hp-dock");
  const dockTop = dock?.getClientRects().length ? dock.getBoundingClientRect().top : Infinity;
  return Math.min(H, dockTop - 12 - el.getBoundingClientRect().top);
}

/** Camera wall: the number of columns that shows every camera (16:9) as big as possible, without scrolling. */
function fitCamWall(scroller, wall) {
  wall.style.removeProperty("grid-template-columns");
  wall.style.removeProperty("max-width");
  if (window.innerWidth < NARROW) return;
  const n = wall.children.length;
  const gap = parseFloat(getComputedStyle(wall).rowGap) || 12;
  const W = wall.parentElement.clientWidth;
  const H = spaceFor(scroller, wall);
  if (H < 120) return;
  let best = { c: 1, w: 0 };
  for (let c = 1; c <= Math.min(n, 6); c++) {
    const rows = Math.ceil(n / c);
    const byWidth = (W - gap * (c - 1)) / c;
    const byHeight = ((H - gap * (rows - 1)) / rows) * 16 / 9;
    const w = Math.min(byWidth, byHeight);
    if (w > best.w + 1) best = { c, w };
  }
  wall.style.gridTemplateColumns = `repeat(${best.c}, minmax(0, 1fr))`;
  // Limited by height: narrower and centred, so the cards keep their shape.
  const width = best.c * best.w + gap * (best.c - 1);
  if (width < W - 2) wall.style.maxWidth = `${Math.floor(width)}px`;
}

/** Energy page on a tablet: exactly the height that is left, chart and list share it. */
function fitEnergy(scroller, el) {
  el.classList.remove("fit");
  el.style.removeProperty("height");
  if (window.innerWidth < NARROW || window.innerHeight < 560) return;
  const H = spaceToDock(scroller, el);
  if (H < 360) return scroller.classList.remove("hp-fitted");
  el.classList.add("fit");
  el.style.height = `${Math.floor(H)}px`;
}

// Rooms tab, "Fit to screen": compact room rows, as many columns and as tall as the screen allows.
const ROOM_H = 58; // a compact row at scale 1
const ROOM_W = 230; // ... and the width it looks right at
const ROOM_MIN_H = 40; // lowest row; below that the list scrolls
const ROOM_MAX_H = 110;
const ROOM_MIN_W = 150;

/**
 * Columns, row height and scale for `counts` rooms per floor in a W×H box. `headH` is the height of all floor
 * headings together, `heads` how many there are (each is a grid row of its own). `scroll`: even the smallest
 * rows do not fit.
 */
export function planRoomsFit(counts, W, H, { heads = 0, headH = 0, gap = 8 } = {}) {
  const n = counts.reduce((a, b) => a + b, 0);
  if (!n || W <= 0 || H <= 0) return null;
  const maxC = Math.max(1, Math.min(n, Math.floor((W + gap) / (ROOM_MIN_W + gap))));
  let best = null;
  for (let c = 1; c <= maxC; c++) {
    const rows = counts.reduce((a, k) => a + Math.ceil(k / c), 0);
    const w = (W - gap * (c - 1)) / c;
    const rh = (H - headH - gap * (rows + heads - 1)) / rows;
    const score = Math.min(rh, w * (ROOM_H / ROOM_W)); // as big as possible, without flat or skinny rows
    if (!best || score > best.score + 0.5) best = { c, w, rh, score };
  }
  const scroll = best.rh < ROOM_MIN_H;
  const rh = Math.max(ROOM_MIN_H, Math.min(ROOM_MAX_H, best.rh));
  const scale = Math.max(0.7, Math.min(1.35, rh / ROOM_H, best.w / ROOM_W));
  return { cols: best.c, rowH: Math.floor(rh), scale: Math.round(scale * 100) / 100, scroll };
}

function fitRooms(scroller, box) {
  for (const p of ["grid-template-columns", "--hp-fr-h", "--hp-fr-s"]) box.style.removeProperty(p);
  box.classList.remove("sized");
  if (window.innerWidth < NARROW) return; // a small window: compact rows that scroll
  const heads = [...box.children].filter((el) => el.classList.contains("hp-rooms-floor"));
  const counts = [];
  for (const el of box.children) {
    if (el.classList.contains("hp-rooms-floor")) counts.push(0);
    else if (counts.length) counts[counts.length - 1]++;
    else counts.push(1);
  }
  const headH = heads.reduce((a, el) => a + el.getBoundingClientRect().height + (parseFloat(getComputedStyle(el).marginTop) || 0), 0);
  const gap = parseFloat(getComputedStyle(box).rowGap) || 8;
  const H = spaceToDock(scroller, box) - 2;
  const plan = planRoomsFit(counts.filter(Boolean), box.clientWidth, H, { heads: heads.length, headH, gap });
  if (!plan || plan.scroll) scroller.classList.remove("hp-fitted");
  if (!plan) return;
  box.style.gridTemplateColumns = `repeat(${plan.cols}, minmax(0, 1fr))`;
  box.style.setProperty("--hp-fr-h", `${plan.rowH}px`);
  box.style.setProperty("--hp-fr-s", String(plan.scale));
  box.classList.add("sized");
}

// Tile size per device: "auto" fills the screen (fewer tiles, bigger tiles, no scrolling); s/m/l is a fixed size.
// [width, height] factors: Small fits one more column than Medium but stays almost as tall, so it does not look squeezed.
// Compact: one column more than Medium on a wall tablet (4 instead of 3 next to the panel), still easy to read.
const SCALE = { s: [0.82, 0.93], c: [0.93, 0.88], m: [1, 1], l: [1.25, 1.25] };
const MAX_H = 240; // auto: tallest card
const MAX_W = 340; // auto: widest card

// Tile height per device on top of the size: lower cards fit one more row.
export const HEIGHTS = { normal: 1, low: 0.92, lower: 0.85 };

export function fitToScreen(main, { editing = false, size = "auto", height = "normal" } = {}) {
  const scroller = main.querySelector(".hp-side-main") || main.querySelector(".hp-layout");
  // The room list on the left reaches down to the bottom of the screen.
  if (scroller) scroller.style.setProperty("--hp-avail", `${scroller.clientHeight}px`);
  scroller?.classList.remove("hp-fitted");
  const wall = scroller?.querySelector(".hp-camwall:not(.edit)");
  if (wall) return fitCamWall(scroller, wall);
  const rooms = scroller?.querySelector(".hp-rooms-all.fit");
  if (rooms) return fitRooms(scroller, rooms);
  const energy = scroller?.querySelector(".hp-energy");
  if (energy) return fitEnergy(scroller, energy);
  const grid = scroller?.querySelector(".hp-overview, .hp-room-view .hp-items.grid");
  if (!grid) return;
  for (const p of ["grid-template-columns", "--hp-tile-h", "--hp-tile-min"]) grid.style.removeProperty(p);
  grid.classList.remove("hp-fit", "tight", "tighter", "roomy");
  if (window.innerWidth < NARROW) return; // phones keep scrolling (the sidebar layout is narrower, but still a tablet)

  const auto = !SCALE[size];
  let cs = getComputedStyle(grid);
  if (!auto) {
    const [kw, k] = SCALE[size];
    const kh = k * (HEIGHTS[height] || 1);
    const tileH = Math.round(parseFloat(cs.getPropertyValue("--hp-tile-h")) * kh);
    grid.style.setProperty("--hp-tile-min", `${Math.round(parseFloat(cs.getPropertyValue("--hp-tile-min")) * kw)}px`);
    grid.style.setProperty("--hp-tile-h", `${tileH}px`);
    grid.classList.toggle("roomy", kh > 1);
    // Low cards get the tighter padding and smaller icons, so nothing is cut off.
    if (kh < 1) grid.classList.add("hp-fit");
    grid.classList.toggle("tight", tileH < 112);
    grid.classList.toggle("tighter", tileH < 96);
    cs = getComputedStyle(grid);
  }
  // A fixed size is kept as chosen, even if that means scrolling; only "fill screen" fits everything.
  if (editing || !auto) return;

  const gap = parseFloat(cs.rowGap) || 12;
  const baseH = parseFloat(cs.getPropertyValue("--hp-tile-h")) || 112;
  const baseMin = parseFloat(cs.getPropertyValue("--hp-tile-min")) || 150;
  const W = grid.clientWidth;
  const H = spaceFor(scroller, grid);
  if (H < MIN_H) return;

  const items = [...grid.children]
    .filter((el) => getComputedStyle(el).display !== "none")
    .map((el) => {
      const s = getComputedStyle(el);
      return { w: spanOf(s.gridColumnStart, s.gridColumnEnd, el.style.gridColumn), h: spanOf(s.gridRowStart, s.gridRowEnd), full: el.classList.contains("hp-sep") };
    });
  if (!items.length) return;

  const maxH = auto ? MAX_H : baseH;
  const cFrom = Math.max(1, Math.floor((W + gap) / ((auto ? MAX_W : baseMin) + gap)));
  const cTo = Math.max(cFrom, Math.floor((W + gap) / (MIN_W + gap)));
  let best = null;
  for (let c = cFrom; c <= cTo; c++) {
    const w = (W - gap * (c - 1)) / c;
    const rows = rowsFor(items, c);
    const h = Math.min(maxH, (H - gap * (rows - 1)) / rows);
    if (h < MIN_H) continue;
    const score = Math.min(w * 0.85, h); // balanced cards beat flat or skinny ones
    if (!best || score > best.score) best = { c, w, h, score };
  }
  // Too much for one screen: as small as sensible, then it scrolls a little.
  if (!best) best = { c: cTo, w: (W - gap * (cTo - 1)) / cTo, h: MIN_H };

  grid.style.gridTemplateColumns = `repeat(${best.c}, minmax(0, 1fr))`;
  grid.style.setProperty("--hp-tile-h", `${Math.floor(best.h)}px`);
  grid.classList.add("hp-fit");
  grid.classList.toggle("tight", best.h < 112 || best.w < 150);
  grid.classList.toggle("tighter", best.h < 96 || best.w < 128);
  grid.classList.toggle("roomy", best.h >= 150 && best.w >= 190);
}
