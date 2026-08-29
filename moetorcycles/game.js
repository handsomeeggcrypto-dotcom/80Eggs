/* ============================================================
   MOEtorcycles — a Robot Unicorn Attack style endless runner
   Base build. Backgrounds are placeholder (real art coming later).
   ============================================================ */

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const W = canvas.width;   // 1280
const H = canvas.height;  // 720

/* ---------- Backgrounds ----------
   Each ride has its own parallax map (sky + far + mid + near), scaled to canvas
   height and tiled horizontally. Speeds: far = slow, near = fast. */
const BG_SPEEDS = [0.06, 0.20, 0.45, 0.80];
function bgSet(prefix) {
  return ["sky", "far", "mid", "near"].map((layer, i) => ({
    url: `assets/bg/${prefix}_${layer}.png`,
    speed: BG_SPEEDS[i],
  }));
}
// Optional dusk tint to unify a bright sky with the neon night layers (0 = off).
let SKY_TINT = 0.0;
const DUSTOFF = "assets/dustoff.png"; // MOE Zedong Dustoff rescue helicopter

/* ---------- Characters ----------
   A character = one rider-on-bike (single frames per pose). Maps are chosen
   separately (see MAPS) so any unlocked character can ride any unlocked map.
   `cost` = stars to unlock (0 = free). `RIDES`/`selRide` name kept internally. */
const RIDES = [
  {
    id: "crayons",
    name: "Crayons",
    tagline: "Ride your dreams. Color everything.",
    cost: 0,
    scale: 1.36,      // drawn height = PLAYER_H * scale
    wheelFrac: 0.935, // fraction of sprite height where the tyres touch ground
    frames: {
      ride:    "assets/player_crayons_ride.png",
      wheelie: "assets/player_crayons_wheelie.png",
      air:     "assets/player_crayons_air.png",
      land:    "assets/player_crayons_land.png",
      crash:   "assets/player_crayons_crash.png",
    },
    preview: "assets/player_crayons_ride.png",
  },
  {
    id: "eggs",
    name: "Eggs",
    tagline: "Egg power. Bear it all.",
    cost: 150,
    scale: 1.58,
    wheelFrac: 0.988,
    frames: {
      ride:    "assets/player_eggs_ride.png",
      wheelie: "assets/player_eggs_wheelie.png",
      air:     "assets/player_eggs_air.png",
      land:    "assets/player_eggs_land.png",
      crash:   "assets/player_eggs_crash.png",
    },
    preview: "assets/player_eggs_ride.png",
  },
  {
    id: "bradley",
    name: "Bradley",
    tagline: "Next-gen hyperbike. 中国心.",
    cost: 250,
    scale: 1.62,
    wheelFrac: 0.986,
    frames: {
      ride:    "assets/player_bradley_ride.png",
      wheelie: "assets/player_bradley_wheelie.png",
      air:     "assets/player_bradley_air.png",
      land:    "assets/player_bradley_land.png",
      crash:   "assets/player_bradley_crash.png",
    },
    preview: "assets/player_bradley_ride.png",
  },
  {
    id: "abba",
    name: "ABBA",
    tagline: "Clouds, bunnies, and crystal dreams.",
    cost: 300,
    scale: 1.5,
    wheelFrac: 0.989,
    frames: {
      ride:    "assets/player_abba_ride.png",
      wheelie: "assets/player_abba_wheelie.png",
      air:     "assets/player_abba_air.png",
      land:    "assets/player_abba_land.png",
      crash:   "assets/player_abba_crash.png",
    },
    preview: "assets/player_abba_ride.png",
  },
  {
    id: "designer",
    name: "Designer",
    tagline: "Dream fuel. Itasha dreams.",
    cost: 300,
    scale: 1.5,
    wheelFrac: 0.987,
    frames: {
      ride:    "assets/player_designer_ride.png",
      wheelie: "assets/player_designer_wheelie.png",
      air:     "assets/player_designer_air.png",
      land:    "assets/player_designer_land.png",
      crash:   "assets/player_designer_crash.png",
    },
    preview: "assets/player_designer_ride.png",
  },
];

/* ---------- Maps (selectable independently of the character) ----------
   `road`: "neon" | "dirt" | "china" | "crystal" | "tokyo" (see drawRoad). */
const MAPS = [
  { id: "crayons", name: "Neon City",    cost: 0,   bg: bgSet("crayons"), road: "neon",    hazard: "crayon" },
  { id: "eggs",    name: "Countryside",  cost: 100, bg: bgSet("eggs"),    road: "dirt",    hazard: "hay" },
  { id: "china",   name: "China City",   cost: 200, bg: bgSet("china"),   road: "china",   hazard: "lantern" },
  { id: "crystal", name: "Crystal City", cost: 250, bg: bgSet("crystal"), road: "crystal", hazard: "crystal" },
  // Tokyo art has only sky/mid/near (no far layer)
  { id: "tokyo",   name: "Tokyo Night",  cost: 250, road: "tokyo", hazard: "barricade", bg: [
      { url: "assets/bg/tokyo_sky.png",  speed: 0.06 },
      { url: "assets/bg/tokyo_mid.png",  speed: 0.42 },
      { url: "assets/bg/tokyo_near.png", speed: 0.80 },
  ]},
  // Secret meme level: unlocks once you own 4 characters (no star cost).
  { id: "moemoe",  name: "MoeMoe Land",  cost: 0, bg: bgSet("moemoe"), road: "moemoe", hazard: "emoji",
    req: () => unlockedCharCount() >= 4, reqText: "🔒 4 CHARS" },
];

// Per-map hazard footprints (all ground-mounted; jump over or dash/boost to smash).
// Collision is the same rect model for all; only the art + size band differ.
const HAZARDS = {
  crayon:    { w: 46,  hMin: 80,  hMax: 130 },
  hay:       { w: 78,  hMin: 66,  hMax: 92  },
  lantern:   { w: 42,  hMin: 92,  hMax: 140 },
  crystal:   { w: 58,  hMin: 78,  hMax: 128 },
  barricade: { w: 84,  hMin: 60,  hMax: 84  },
  emoji:     { w: 58,  hMin: 58,  hMax: 96  },
};

/* ---------- Asset loading (by URL, cached) ---------- */
const imgCache = {};
let assetsLoaded = 0;
let assetTotal = 0;

function loadImg(url) {
  if (imgCache[url]) return imgCache[url];
  const img = new Image();
  img.onload = () => { assetsLoaded++; };
  img.onerror = () => { assetsLoaded++; console.warn("missing asset", url); };
  img.src = url;
  imgCache[url] = img;
  return img;
}
function img(url) { return imgCache[url] || loadImg(url); }

// preload every unique image referenced by the roster
(function preload() {
  const urls = new Set();
  for (const r of RIDES) {
    urls.add(r.preview);
    for (const k in r.frames) urls.add(r.frames[k]);
  }
  for (const m of MAPS) for (const L of m.bg) urls.add(L.url);
  urls.add(DUSTOFF);
  assetTotal = urls.size;
  urls.forEach(loadImg);
})();

/* ---------- Game state machine ---------- */
const STATE = { LOADING: "loading", TITLE: "title", SELECT: "select", UPGRADES: "upgrades", PLAY: "play", RESCUE: "rescue", DEAD: "dead" };
let state = STATE.LOADING;

let selRide = 0; // index into RIDES (character)
let selMap = 0;  // index into MAPS

/* ---------- Tron-style trail options (cost = stars to unlock) ---------- */
const TRAIL_COLORS = [
  { name: "Pink",   css: "#ff5bd0", cost: 0 },
  { name: "Cyan",   css: "#5bc8ff", cost: 0 },
  { name: "Yellow", css: "#ffe066", cost: 0 },
  { name: "Green",  css: "#7dff9b", cost: 30 },
  { name: "Purple", css: "#c78bff", cost: 30 },
  { name: "White",  css: "#ffffff", cost: 30 },
  { name: "China Red", css: "#ee1c25", cost: 40 }, // Chinese-flag red
  { name: "Black",  css: "#0d0d0d", cost: 40 },
];
const TRAIL_DESIGNS = [
  { id: "line",    name: "Neon Line",  cost: 0 },
  { id: "ribbon",  name: "Ribbon",     cost: 0 },
  { id: "rainbow", name: "Rainbow",    cost: 50 }, // ignores color, cycles hue
  { id: "dashed",  name: "Dashed",     cost: 40 },
  { id: "bubbles", name: "Bubbles",    cost: 40 },
  { id: "stars",   name: "Star Trail", cost: 60 },
  { id: "curtain", name: "Curtain",    cost: 70 }, // full bike-height banner
  { id: "air",     name: "Air Streams", cost: 50 }, // thin wind streaks
  { id: "soapbubbles", name: "Soap Bubbles", cost: 60 }, // hollow, glassy bubbles
];

/* ---------- Currency + unlocks ----------
   Collect stars (banked across runs) to unlock characters, maps, and trails.
   Free items (cost 0) are always unlocked. Unlocked ids are stored as
   "<kind>:<id>" e.g. "char:eggs", "map:eggs", "tc:3", "ts:2". */
let bank = Number(localStorage.getItem("moetorcycles_bank") || 0);
let unlocks = new Set();
try { unlocks = new Set(JSON.parse(localStorage.getItem("moetorcycles_unlocks") || "[]")); } catch (e) {}
let unlockFlash = 0;      // >0 = brief red "can't afford" flash
let unlockPulse = 0;      // >0 = brief green "unlocked!" pulse

function saveBank()    { localStorage.setItem("moetorcycles_bank", bank); }
function saveUnlocks() { localStorage.setItem("moetorcycles_unlocks", JSON.stringify([...unlocks])); }
function addStars(n)   { bank += n; saveBank(); }
function isUnlocked(key, cost) { return !cost || unlocks.has(key); }
function tryUnlock(key, cost) {
  if (!cost || unlocks.has(key)) return true;
  if (bank >= cost) {
    bank -= cost; unlocks.add(key); saveBank(); saveUnlocks();
    unlockPulse = 0.6; Sound.ui();
    return true;
  }
  unlockFlash = 0.5; // not enough stars
  return false;
}
// how many playable characters the player has unlocked (free ones included)
function unlockedCharCount() {
  return RIDES.reduce((n, r) => n + (isUnlocked("char:" + r.id, r.cost) ? 1 : 0), 0);
}
// A map is available if its condition (req, e.g. "own 4 characters") is met and
// it's free or purchased. `req` maps ignore stars — they unlock on the condition.
function mapUnlocked(m) {
  if (m.req && !m.req()) return false;
  return isUnlocked("map:" + m.id, m.cost);
}

/* ---------- Upgrade tree ----------
   Permanent, bought with banked stars. Each branch is a chain: a node needs the
   one above it. Effects are baked into `up` at the start of each run. */
const UPGRADES = [
  { id: "jump", name: "Jump", icon: "🦘", nodes: [
    { id: "jump_triple", name: "Triple Jump", desc: "A 3rd mid-air jump", cost: 140 },
    { id: "jump_quad",   name: "Quad Jump",   desc: "A 4th mid-air jump", cost: 300 },
  ]},
  { id: "dash", name: "Dash", icon: "💨", nodes: [
    { id: "dash_long",     name: "Long Dash",   desc: "Dash lasts 60% longer", cost: 130 },
    { id: "dash_recharge", name: "Quick Charge", desc: "Dash recharges faster", cost: 170 },
    { id: "dash_double",   name: "Double Dash",  desc: "Hold two dash charges", cost: 300 },
  ]},
  { id: "speed", name: "Speed", icon: "⚡", nodes: [
    { id: "speed_base", name: "Cruiser",   desc: "Higher starting speed", cost: 110 },
    { id: "speed_cap",  name: "Overdrive", desc: "Higher top speed",      cost: 240 },
  ]},
  { id: "stars", name: "Stars", icon: "⭐", nodes: [
    { id: "star_magnet", name: "Star Magnet", desc: "Pull in nearby stars", cost: 160 },
    { id: "star_value",  name: "Double Value", desc: "Stars worth 2×",      cost: 260 },
  ]},
  { id: "rescue", name: "Rescue", icon: "🚁", nodes: [
    { id: "shield_1", name: "Dustoff",  desc: "Survive 1 crash — airlift out", cost: 350 },
    { id: "shield_2", name: "Reinforced", desc: "Survive 2 crashes per run",   cost: 600 },
  ]},
];
let upgrades = new Set();
try { upgrades = new Set(JSON.parse(localStorage.getItem("moetorcycles_upgrades") || "[]")); } catch (e) {}
function saveUpgrades() { localStorage.setItem("moetorcycles_upgrades", JSON.stringify([...upgrades])); }
function hasUp(id) { return upgrades.has(id); }
function buyUp(node, available) {
  if (upgrades.has(node.id)) return;
  if (!available) { unlockFlash = 0.5; return; }
  if (bank >= node.cost) {
    bank -= node.cost; upgrades.add(node.id); saveBank(); saveUpgrades();
    unlockPulse = 0.6; Sound.ui();
  } else unlockFlash = 0.5;
}
// effective per-run values baked from owned upgrades (recomputed at startGame)
let up = {};
function computeUpgrades() {
  up = {
    maxJumps:  2 + (hasUp("jump_triple") ? 1 : 0) + (hasUp("jump_quad") ? 1 : 0),
    dashTime:  0.42 * (hasUp("dash_long") ? 1.6 : 1),
    dashCd:    0.9  * (hasUp("dash_recharge") ? 0.55 : 1),
    dashMax:   hasUp("dash_double") ? 2 : 1,
    speedStart: SPEED_START + (hasUp("speed_base") ? 90 : 0),
    speedMax:   SPEED_MAX + (hasUp("speed_cap") ? 220 : 0),
    magnet:    hasUp("star_magnet"),
    starValue: hasUp("star_value") ? 2 : 1,
    shields:   (hasUp("shield_1") ? 1 : 0) + (hasUp("shield_2") ? 1 : 0),
  };
}

function clampIdx(v, n) { return Number.isFinite(v) && v >= 0 && v < n ? v : 0; }
let selTrailColor  = clampIdx(+localStorage.getItem("moetorcycles_trail_color"),  TRAIL_COLORS.length);
let selTrailDesign = clampIdx(+localStorage.getItem("moetorcycles_trail_design"), TRAIL_DESIGNS.length);
// a previously-saved trail choice may now be behind a paywall — fall back to free
if (!isUnlocked("tc:" + selTrailColor, TRAIL_COLORS[selTrailColor].cost)) selTrailColor = 0;
if (!isUnlocked("ts:" + selTrailDesign, TRAIL_DESIGNS[selTrailDesign].cost)) selTrailDesign = 0;
function saveTrail() {
  localStorage.setItem("moetorcycles_trail_color", selTrailColor);
  localStorage.setItem("moetorcycles_trail_design", selTrailDesign);
}
// clickable regions on the select screen, refreshed each frame it's drawn
const uiHits = { swatches: [], chips: [], maps: [], charUnlock: null, upnodes: [], upBack: null, toUpgrades: null, deadBack: null };

let best = Number(localStorage.getItem("moetorcycles_best") || 0);
let menuCd = 0; // debounce so one tap/press can't skip a whole screen

/* ---------- Input ---------- */
const keys = {};
let jumpQueued = false;
let dashQueued = false;
let anyPressQueued = false;

let isTouch = ("ontouchstart" in window) || navigator.maxTouchPoints > 0;

// touch jump "hold": a finger on the jump pad counts as holding jump so the
// variable-height cut doesn't chop mobile jumps into tiny hops.
let touchJumpHeld = false;
let jumpPointerId = null;
function releaseJumpPointer(e) {
  if (e.pointerId === jumpPointerId) { touchJumpHeld = false; jumpPointerId = null; }
}
window.addEventListener("pointerup", releaseJumpPointer);
window.addEventListener("pointercancel", releaseJumpPointer);

// Enter fullscreen on the first gesture (best-effort; iPhone Safari has no
// Fullscreen API, so there it only fills the viewport / home-screen web app).
let fsTried = false;
function enterFullscreen() {
  if (fsTried) return;
  fsTried = true;
  const el = document.documentElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen || el.webkitRequestFullScreen;
  if (req) { try { const p = req.call(el); if (p && p.catch) p.catch(() => {}); } catch (e) {} }
  if (screen.orientation && screen.orientation.lock) {
    try { screen.orientation.lock("landscape").catch(() => {}); } catch (e) {}
  }
}

// Kill iOS double-tap-to-zoom and pinch-zoom.
document.addEventListener("gesturestart", (e) => e.preventDefault(), { passive: false });
document.addEventListener("gesturechange", (e) => e.preventDefault(), { passive: false });
let lastTouchEnd = 0;
document.addEventListener("touchend", (e) => {
  const now = Date.now();
  if (now - lastTouchEnd < 350) e.preventDefault(); // second tap of a double-tap
  lastTouchEnd = now;
}, { passive: false });
document.addEventListener("touchmove", (e) => { if (e.scale && e.scale !== 1) e.preventDefault(); }, { passive: false });

window.addEventListener("keydown", (e) => {
  if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Space"].includes(e.code)) e.preventDefault();
  Sound.unlock();
  enterFullscreen();
  if (e.code === "KeyM") { Sound.toggleMute(); return; }
  if (keys[e.code]) return; // ignore auto-repeat
  keys[e.code] = true;
  if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") jumpQueued = true;
  if (e.code === "ShiftLeft" || e.code === "ShiftRight" || e.code === "KeyX") dashQueued = true;
  anyPressQueued = true;
  handleMenuKey(e.code);
});
window.addEventListener("keyup", (e) => { keys[e.code] = false; });

// Pointer / touch: left half = jump, right half = dash (during play)
canvas.addEventListener("pointerdown", (e) => {
  const r = canvas.getBoundingClientRect();
  Sound.unlock();
  enterFullscreen();
  // mute button (bottom-right) intercepts in every state
  const mx = (e.clientX - r.left) / r.width * W;
  const my = (e.clientY - r.top) / r.height * H;
  if (Math.hypot(mx - MUTE_BTN.x, my - MUTE_BTN.y) <= MUTE_BTN.r + 6) { Sound.toggleMute(); return; }
  const x = (e.clientX - r.left) / r.width;
  anyPressQueued = true;
  if (state === STATE.PLAY) {
    if (x >= 0.5) { dashQueued = true; }               // right = dash
    else { jumpQueued = true; touchJumpHeld = true; jumpPointerId = e.pointerId; } // left = jump (held)
  } else {
    pointerMenu(e, r);
  }
});
const MUTE_BTN = { x: W - 46, y: H - 42, r: 20 };

function handleMenuKey(code) {
  if (state === STATE.TITLE) {
    if ((code === "Space" || code === "Enter") && menuCd <= 0) { state = STATE.SELECT; menuCd = 0.3; }
  } else if (state === STATE.SELECT) {
    // Left/Right = character, Up/Down = trail style, C = color, [ ] = map, U = unlock
    if (code === "ArrowLeft")  { selRide = (selRide - 1 + RIDES.length) % RIDES.length; Sound.ui(); }
    else if (code === "ArrowRight") { selRide = (selRide + 1) % RIDES.length; Sound.ui(); }
    else if (code === "ArrowUp")   cycleTrailStyle(-1);
    else if (code === "ArrowDown") cycleTrailStyle(1);
    else if (code === "KeyC")      cycleTrailColor(1);
    else if (code === "BracketLeft")  { selMap = (selMap - 1 + MAPS.length) % MAPS.length; Sound.ui(); }
    else if (code === "BracketRight") { selMap = (selMap + 1) % MAPS.length; Sound.ui(); }
    else if (code === "KeyU") {
      const c = RIDES[selRide], m = MAPS[selMap];
      if (!isUnlocked("char:" + c.id, c.cost)) tryUnlock("char:" + c.id, c.cost);
      else if (!isUnlocked("map:" + m.id, m.cost)) tryUnlock("map:" + m.id, m.cost);
    }
    else if (code === "KeyT") { state = STATE.UPGRADES; menuCd = 0.2; Sound.ui(); }
    else if ((code === "Space" || code === "Enter") && menuCd <= 0) attemptStart();
  } else if (state === STATE.UPGRADES) {
    if (code === "Escape" || code === "KeyT") { state = STATE.SELECT; menuCd = 0.2; }
  } else if (state === STATE.DEAD) {
    if ((code === "Space" || code === "Enter") && menuCd <= 0) startGame();
    if (code === "Escape") { state = STATE.SELECT; menuCd = 0.3; }
  }
}

function pointerMenu(e, r) {
  if (menuCd > 0) return;
  if (state === STATE.TITLE) { state = STATE.SELECT; menuCd = 0.3; }
  else if (state === STATE.SELECT) {
    const mx = (e.clientX - r.left) / r.width * W;
    const my = (e.clientY - r.top) / r.height * H;
    const inRect = (b) => mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h;

    // UPGRADES button
    if (uiHits.toUpgrades && inRect(uiHits.toUpgrades)) { state = STATE.UPGRADES; menuCd = 0.2; Sound.ui(); return; }
    // character unlock button
    if (uiHits.charUnlock && inRect(uiHits.charUnlock)) {
      tryUnlock(uiHits.charUnlock.key, uiHits.charUnlock.cost); menuCd = 0.15; return;
    }
    // trail color swatches (tap locked = unlock, then select)
    for (const s of uiHits.swatches) {
      if (Math.hypot(mx - s.x, my - s.y) <= s.r) {
        if (tryUnlock(s.key, s.cost)) { selTrailColor = s.i; saveTrail(); }
        menuCd = 0.15; return;
      }
    }
    // trail style chips
    for (const c of uiHits.chips) {
      if (inRect(c)) {
        if (tryUnlock(c.key, c.cost)) { selTrailDesign = c.i; saveTrail(); }
        menuCd = 0.15; return;
      }
    }
    // map cards
    for (const m of uiHits.maps) {
      if (inRect(m)) {
        const mm = MAPS[m.i];
        if (mapUnlocked(mm)) { selMap = m.i; Sound.ui(); }         // available -> select
        else if (mm.req) { unlockFlash = 0.5; Sound.ui(); }        // condition-locked -> can't buy
        else if (tryUnlock(m.key, m.cost)) { selMap = m.i; Sound.ui(); } // star-locked -> buy
        menuCd = 0.15; return;
      }
    }
    // character chevrons: left/right of the card (within its vertical band)
    const cardMidY = H * 0.28;
    if (RIDES.length > 1 && Math.abs(my - cardMidY) < 130) {
      if (mx < W / 2 - 288) { selRide = (selRide - 1 + RIDES.length) % RIDES.length; Sound.ui(); menuCd = 0.2; return; }
      if (mx > W / 2 + 288) { selRide = (selRide + 1) % RIDES.length; Sound.ui(); menuCd = 0.2; return; }
    }
    // start only from the bottom prompt band
    if (my > H * 0.90) attemptStart();
  }
  else if (state === STATE.UPGRADES) {
    const mx = (e.clientX - r.left) / r.width * W;
    const my = (e.clientY - r.top) / r.height * H;
    const inRect = (b) => b && mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h;
    if (inRect(uiHits.upBack)) { state = STATE.SELECT; menuCd = 0.2; Sound.ui(); return; }
    for (const n of uiHits.upnodes) {
      if (inRect(n)) { buyUp(n.node, n.available); menuCd = 0.15; return; }
    }
  }
  else if (state === STATE.DEAD) {
    const mx = (e.clientX - r.left) / r.width * W;
    const my = (e.clientY - r.top) / r.height * H;
    const b = uiHits.deadBack;
    if (b && mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) {
      state = STATE.SELECT; menuCd = 0.3; Sound.ui(); return;   // back to character/map select
    }
    startGame(); // tap elsewhere = ride again
  }
}

/* ---------- World / player ----------
   Tuned for long, floaty, graceful arcs (Robot Unicorn Attack feel) rather than
   short punchy hops. Low gravity + soft launch = ~1.5s of hang time and a wide
   ~260px arc; a single jump carries the rider a long, relaxing distance. */
const GROUND_MARGIN = 120;      // default surface distance from bottom
const PLATFORM_H = 132;          // max road thickness before it floats as a platform
const GRAVITY = 1000;           // px/s^2 (was 2600 — much floatier)
const JUMP_V = -720;            // initial jump velocity (softer launch)
const JUMP_CUT = 0.55;          // release-to-cut multiplier (gentle tap-hops)
const MAX_FALL = 1150;          // gentle terminal descent
const PLAYER_H = 150;           // drawn height
const PLAYER_X = W * 0.26;      // fixed screen x of player center

// Forward pace — calm, with a slow ramp and a modest cap so it stays relaxing.
const SPEED_START = 480;
const SPEED_RAMP = 5;           // px/s added per second
const SPEED_MAX = 800;
const DASH_MULT = 1.6;          // dash speed multiplier (was 1.9)
// Flying through a giant ring = a soaring forward boost.
const BOOST_MULT = 2.0;         // forward speed surge while boosting
const BOOST_TIME = 0.85;        // seconds the surge lasts
const BOOST_LIFT = 320;         // upward impulse on entry (soar forward)

let player, world, particles, stars, obstacles, rings, score, speed, distance, animT, screenShake, deathTimer, trail;
let popups;                          // floating score/near-miss text
let combo, comboTimer, runStars;
const COMBO_WINDOW = 2.6;           // seconds to keep the chain alive
const NEAR_MISS_DIST = 52;          // clearing a hazard by <this many px = near miss
const comboMult = () => Math.min(1 + Math.floor(combo / 5), 8); // x1..x8

function resetRun() {
  computeUpgrades(); // bake owned upgrades into `up` for this run
  player = {
    y: H - GROUND_MARGIN - PLAYER_H,
    vy: 0,
    onGround: true,
    jumps: 0,
    dashT: 0,            // remaining dash time
    dashCd: 0,           // recharge timer
    dashStock: up.dashMax, // available dash charges
    boostT: 0,           // remaining ring-boost time
    landT: 0,            // landing animation timer
    jumpGrace: 0,        // min-rise window so quick taps still glide
    alive: true,
    tilt: 0,
    shieldsLeft: up.shields, // dustoff rescues remaining
    invT: 0,             // brief invincibility after a rescue
  };
  world = { segs: [], nextX: 0 };
  particles = [];
  stars = [];
  obstacles = [];
  trail = [];
  rings = [];
  popups = [];
  combo = 0; comboTimer = 0; runStars = 0;
  score = 0;
  distance = 0;
  speed = up.speedStart;
  animT = 0;
  screenShake = 0;
  deathTimer = 0;

  // seed flat starting ground so the player never spawns over a gap
  let x = -100;
  const startTop = H - GROUND_MARGIN;
  world.segs.push({ x, w: W + 400, top: startTop });
  world.nextX = x + W + 400;
  lastTop = startTop;
  generateAhead();
}

let lastTop;
function generateAhead() {
  while (world.nextX < distance + W * 2.2) {
    // decide: platform or gap. Gaps are wide (the floaty jump carries ~690px)
    // so clearing them feels like a long, deliberate arc, but stays forgiving.
    const prevTop = lastTop;
    const gap = Math.random() < 0.40 ? rand(200, 460) : 0;
    const gapStart = world.nextX;
    world.nextX += gap;

    const w = rand(260, 620);
    // vary surface height, clamped to a playable band
    let top = lastTop + rand(-120, 120);
    top = clamp(top, H - GROUND_MARGIN - 230, H - GROUND_MARGIN + 60);
    const seg = { x: world.nextX, w, top };
    world.segs.push(seg);
    lastTop = top;

    // reward the jump: 1–2 GIANT gold rings over the gap — fly through for a boost
    if (gap > 120) {
      const n = gap > 340 ? 2 : 1;
      const base = Math.min(prevTop, top);
      const peak = rand(120, 210);
      for (let i = 0; i < n; i++) {
        const tt = (i + 1) / (n + 1);
        const rx = gapStart + tt * gap;
        const ry = base - 80 - Math.sin(tt * Math.PI) * peak;
        rings.push({ x: rx, y: ry, r: 58, got: false, spin: Math.random() * 6 });
      }
    }

    // sprinkle collectible stars in an arc over this segment
    if (Math.random() < 0.8) {
      const n = randi(3, 6);
      const arcH = rand(40, 150);
      for (let i = 0; i < n; i++) {
        const t = (i + 1) / (n + 1);
        const sx = seg.x + t * w;
        const sy = seg.top - 60 - Math.sin(t * Math.PI) * arcH;
        stars.push({ x: sx, y: sy, got: false, spin: Math.random() * 6 });
      }
    }
    // hazard (jump over, or dash/boost to smash) — themed per map
    if (gap === 0 && w > 340 && Math.random() < 0.5) {
      const ox = seg.x + rand(w * 0.35, w * 0.7);
      const hz = HAZARDS[MAPS[selMap].hazard] || HAZARDS.crayon;
      obstacles.push({
        x: ox, top: seg.top, h: rand(hz.hMin, hz.hMax), w: hz.w,
        kind: MAPS[selMap].hazard, dead: false, minClear: Infinity, scored: false,
      });
    }

    world.nextX = seg.x + w;
  }
  // drop old segments/entities behind us
  world.segs = world.segs.filter((s) => s.x + s.w > distance - 200);
  stars = stars.filter((s) => s.x > distance - 200);
  rings = rings.filter((r) => r.x > distance - 200);
  obstacles = obstacles.filter((o) => o.x > distance - 200);
}

function startGame() {
  resetRun();
  state = STATE.PLAY;
  menuCd = 0.25;
  Sound.ui();
  jumpQueued = false;
  dashQueued = false;
}

// only ride when both the character and the map are unlocked
function attemptStart() {
  const c = RIDES[selRide], m = MAPS[selMap];
  if (isUnlocked("char:" + c.id, c.cost) && mapUnlocked(m)) startGame();
  else unlockFlash = 0.5;
}
// cycle to the next UNLOCKED trail color / style (skips locked ones)
function cycleTrailColor(dir) {
  for (let k = 0, i = selTrailColor; k < TRAIL_COLORS.length; k++) {
    i = (i + dir + TRAIL_COLORS.length) % TRAIL_COLORS.length;
    if (isUnlocked("tc:" + i, TRAIL_COLORS[i].cost)) { selTrailColor = i; saveTrail(); return; }
  }
}
function cycleTrailStyle(dir) {
  for (let k = 0, i = selTrailDesign; k < TRAIL_DESIGNS.length; k++) {
    i = (i + dir + TRAIL_DESIGNS.length) % TRAIL_DESIGNS.length;
    if (isUnlocked("ts:" + i, TRAIL_DESIGNS[i].cost)) { selTrailDesign = i; saveTrail(); return; }
  }
}

/* ---------- Helpers ---------- */
function rand(a, b) { return a + Math.random() * (b - a); }
function randi(a, b) { return Math.floor(rand(a, b + 1)); }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

// surface height at a given world x, or null if over a gap
function surfaceAt(wx) {
  for (const s of world.segs) {
    if (wx >= s.x && wx <= s.x + s.w) return s.top;
  }
  return null;
}

/* ---------- Update ---------- */
function update(dt) {
  if (state === STATE.RESCUE) { updateRescue(dt); return; }
  if (state !== STATE.PLAY) {
    if (state === STATE.DEAD) { deathTimer += dt; screenShake *= 0.9; }
    return;
  }

  animT += dt;
  speed = Math.min(speed + dt * SPEED_RAMP, up.speedMax); // slow, capped ramp
  const spdMult = Math.max(player.dashT > 0 ? DASH_MULT : 1, player.boostT > 0 ? BOOST_MULT : 1);
  const dx = speed * spdMult * dt;
  distance += dx;
  score += dx * 0.02;

  // timers
  if (player.dashT > 0) player.dashT -= dt;
  if (player.boostT > 0) player.boostT -= dt;
  if (player.landT > 0) player.landT -= dt;
  if (player.invT > 0) player.invT -= dt;
  if (player.jumpGrace > 0) player.jumpGrace -= dt;
  screenShake *= 0.88;
  // dash charges recharge over time (up to the max from upgrades)
  if (player.dashStock < up.dashMax) {
    player.dashCd -= dt;
    if (player.dashCd <= 0) { player.dashStock++; player.dashCd = up.dashCd; }
  }

  // dash input (spends a charge)
  if (dashQueued && player.dashStock > 0 && player.dashT <= 0) {
    player.dashStock--; player.dashT = up.dashTime;
    if (player.dashCd <= 0) player.dashCd = up.dashCd; // start recharge if idle
    Sound.dash();
    for (let i = 0; i < 14; i++) spawnSpark(PLAYER_X - 30, player.y + PLAYER_H * 0.6);
  }
  // jump input (up to maxJumps from upgrades)
  if (jumpQueued) {
    if (player.onGround || player.jumps < up.maxJumps) {
      player.vy = JUMP_V;
      player.jumps++;
      player.onGround = false;
      player.jumpGrace = 0.16; // guaranteed rise so even a quick tap glides
      Sound.jump();
      for (let i = 0; i < 8; i++) spawnSpark(PLAYER_X, player.y + PLAYER_H, "#fff");
    }
  }
  // variable jump height: cut when jump is released while rising (after a short
  // grace, and only if it isn't being held — keyboard OR the touch jump pad)
  const jumpHeld = keys.Space || keys.ArrowUp || keys.KeyW || touchJumpHeld;
  if (!jumpHeld && player.jumpGrace <= 0 && player.vy < 0) player.vy *= Math.pow(JUMP_CUT, dt * 60);

  // physics
  player.vy = Math.min(player.vy + GRAVITY * dt, MAX_FALL);
  player.y += player.vy * dt;

  // ground collision (feet at player.y + PLAYER_H)
  const feetX = distance + PLAYER_X;
  const surf = surfaceAt(feetX);
  const feetY = player.y + PLAYER_H;
  if (surf !== null && player.vy >= 0 && feetY >= surf && feetY - player.vy * dt <= surf + 40) {
    player.y = surf - PLAYER_H;
    if (!player.onGround && player.vy > 400) {
      player.landT = 0.18;
      Sound.land();
      for (let i = 0; i < 6; i++) spawnSpark(PLAYER_X - 10, surf, "#ffd23f");
    }
    player.vy = 0;
    player.onGround = true;
    player.jumps = 0;
  } else {
    player.onGround = false;
  }

  // tilt with vertical velocity for feel
  player.tilt = clamp(player.vy / 3000, -0.28, 0.42);

  // record trail point at the rear wheel (stored in world-x so it scrolls)
  trail.push({ wx: distance + PLAYER_X - 108, y: player.y + PLAYER_H * 0.90, dash: player.dashT > 0 });
  if (trail.length > 120) trail.shift();
  while (trail.length && trail[0].wx - distance < -60) trail.shift();

  // fall into gap -> death
  if (player.y > H + 40) return kill();

  // world streaming
  generateAhead();

  // combo decays if you stop collecting
  if (combo > 0) { comboTimer -= dt; if (comboTimer <= 0) combo = 0; }

  const pcx = PLAYER_X, pcy = player.y + PLAYER_H * 0.5;

  // stars — currency (banked) + score, build combo
  for (const s of stars) {
    if (s.got) continue;
    s.spin += dt * 8;
    // Star Magnet upgrade: pull nearby stars toward the rider
    if (up.magnet) {
      const wdx = (distance + pcx) - s.x, wdy = pcy - s.y;
      if (wdx * wdx + wdy * wdy < 210 * 210) { s.x += wdx * 7 * dt; s.y += wdy * 7 * dt; }
    }
    const sx = s.x - distance;
    if (Math.abs(sx - pcx) < 55 && Math.abs(s.y - pcy) < 70) {
      s.got = true;
      combo++; comboTimer = COMBO_WINDOW;
      score += 25 * comboMult();
      runStars += up.starValue; addStars(up.starValue);
      Sound.star(combo);
      for (let i = 0; i < 8; i++) spawnSpark(PLAYER_X, player.y + PLAYER_H * 0.4, "#ffe066");
    }
  }

  // rings — fly through a giant ring for a soaring forward BOOST
  for (const rg of rings) {
    if (rg.got) continue;
    rg.spin += dt * 3;
    const rx = rg.x - distance;
    if (Math.hypot(rx - pcx, rg.y - pcy) < rg.r * 0.72) {
      rg.got = true;
      combo += 2; comboTimer = COMBO_WINDOW;
      score += 60 * comboMult();
      // forward surge + upward lift so you soar out of the ring
      player.boostT = BOOST_TIME;
      player.vy = Math.min(player.vy, -BOOST_LIFT);
      player.onGround = false; player.jumps = Math.min(player.jumps, 1);
      screenShake = 6;
      Sound.boost();
      for (let i = 0; i < 22; i++) spawnSpark(rx, rg.y, ["#ffd23f","#fff3b0","#ffe066","#fff"][i % 4]);
    }
  }

  // obstacles
  const pLeft = PLAYER_X - 55, pRight = PLAYER_X + 55;
  const pTop = player.y + 30, pBot = player.y + PLAYER_H;
  for (const o of obstacles) {
    if (o.dead) continue;
    const ox = o.x - distance;
    const oTop = o.top - o.h;
    const overlapX = ox + o.w > pLeft && ox < pRight;
    const overlapY = pBot > oTop && pTop < o.top;
    if (overlapX && overlapY) {
      if (player.dashT > 0 || player.boostT > 0) {  // dashing or ring-boosting smashes through
        o.dead = true; score += 15; screenShake = 10;
        Sound.smash();
        for (let i = 0; i < 16; i++) spawnSpark(ox, oTop, ["#ff5bd0","#5bc8ff","#ffe066","#7dff9b"][i%4]);
        continue;
      } else if (player.invT <= 0) {
        return kill();
      }
    }
    // near-miss: while airborne over the hazard, remember the tightest clearance
    if (overlapX && pBot <= oTop) o.minClear = Math.min(o.minClear, oTop - pBot);
    // award it once the hazard has slipped fully behind the rider
    if (!o.scored && ox + o.w < pLeft) {
      o.scored = true;
      if (o.minClear < NEAR_MISS_DIST) {
        combo++; comboTimer = COMBO_WINDOW;
        const bonus = 40 * comboMult();
        score += bonus;
        Sound.star(combo);
        spawnPopup(PLAYER_X, player.y + PLAYER_H * 0.25, "NEAR MISS +" + bonus, "#7dff9b");
        for (let i = 0; i < 10; i++) spawnSpark(PLAYER_X, player.y + PLAYER_H * 0.5, "#7dff9b");
      }
    }
  }

  // ambient sparkle trail
  if (Math.random() < 0.6) spawnTrail();
  // boost speed lines streaking back
  if (player.boostT > 0) for (let i = 0; i < 2; i++) spawnSpeedLine();

  // particle update
  for (const p of particles) {
    p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt; p.life -= dt;
  }
  particles = particles.filter((p) => p.life > 0);

  // floating popups rise, drift back, and fade
  for (const p of popups) { p.x -= 150 * dt; p.y += p.vy * dt; p.life -= dt * 1.3; }
  popups = popups.filter((p) => p.life > 0);

  jumpQueued = false;
  dashQueued = false;
}

let rescue = null;

function kill() {
  if (!player.alive || state === STATE.RESCUE) return;
  if (player.shieldsLeft > 0) { startRescue(); return; } // airlifted out
  player.alive = false;
  state = STATE.DEAD;
  deathTimer = 0;
  menuCd = 0.6; // block instant restart from the killing tap
  screenShake = 18;
  Sound.crash();
  score = Math.floor(score);
  if (score > best) { best = score; localStorage.setItem("moetorcycles_best", best); }
  for (let i = 0; i < 40; i++) {
    spawnSpark(PLAYER_X, player.y + PLAYER_H * 0.5,
      ["#ff5bd0","#5bc8ff","#ffe066","#7dff9b","#c78bff"][i % 5]);
  }
}

/* ---------- MOE Zedong Dustoff — shield rescue ---------- */
const HELI_W = 380;                 // drawn helicopter width
const HELI_HOVER_Y = 150;           // helicopter centre-y while carrying
function heliH() { const im = img(DUSTOFF); return HELI_W * (im.width ? im.height / im.width : 0.61); }

function startRescue() {
  player.shieldsLeft--;
  player.vy = 0; player.dashT = 0; player.boostT = 0; player.onGround = false;
  screenShake = 4; // gentle nudge only
  Sound.crash();
  rescue = {
    phase: "descend", t: 0,
    heliX: PLAYER_X - 23,                       // hook sits over the bike
    heliY: -heliH(),                            // starts above the screen
    bikeY: clamp(player.y, 80, H - 300),
    groundSurf: 0,
  };
  player.y = rescue.bikeY;
  state = STATE.RESCUE;
}

function updateRescue(dt) {
  const R = rescue;
  R.t += dt;
  screenShake *= 0.8; // settle the impact nudge fast, then hold steady
  const ease = (v, tgt, k) => v + (tgt - v) * Math.min(1, k * dt);
  const hangY = HELI_HOVER_Y + heliH() * 0.5 + 30; // bike centre while hanging

  if (R.phase === "descend") {
    R.heliY = ease(R.heliY, HELI_HOVER_Y, 5);
    if (R.heliY > HELI_HOVER_Y - 6) { R.heliY = HELI_HOVER_Y; R.phase = "lift"; R.t = 0; }
  } else if (R.phase === "lift") {
    player.y = ease(player.y, hangY, 6);
    spawnWindTrail();
    if (R.t > 0.7) { R.phase = "carry"; R.t = 0; }
  } else if (R.phase === "carry") {
    distance += 360 * dt;                       // scroll forward under the bike
    generateAhead();
    player.y = ease(player.y, hangY, 6);
    spawnWindTrail();
    const surf = surfaceAt(distance + PLAYER_X);
    if (R.t > 0.6 && surf !== null) { R.phase = "lower"; R.t = 0; R.groundSurf = surf; }
  } else if (R.phase === "lower") {
    const targetY = R.groundSurf - PLAYER_H;
    R.heliY = ease(R.heliY, R.groundSurf - PLAYER_H - heliH() * 0.5 - 30, 4);
    player.y = ease(player.y, targetY, 5);
    spawnWindTrail();
    if (player.y > targetY - 3) {
      player.y = targetY; player.onGround = true; player.jumps = 0;
      R.phase = "away"; R.t = 0;
    }
  } else if (R.phase === "away") {
    R.heliX += 620 * dt; R.heliY -= 260 * dt;   // fly up and off to the right
    spawnWindTrail();
    if (R.t > 0.55) endRescue();
  }
  // ambient particle update so sparks/wind keep moving during the rescue
  for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt; p.life -= dt; }
  particles = particles.filter((p) => p.life > 0);
}

function endRescue() {
  rescue = null;
  player.alive = true; player.vy = 0; player.onGround = true;
  player.invT = 1.4; // brief grace period
  state = STATE.PLAY;
}

function spawnWindTrail() {
  if (!rescue) return;
  const hx = rescue.heliX - HELI_W * 0.42, hy = rescue.heliY - heliH() * 0.1;
  particles.push({
    x: hx, y: hy + rand(-30, 40),
    vx: -rand(500, 900), vy: rand(20, 90), g: 0, life: rand(0.2, 0.4),
    r: rand(10, 24), color: "rgba(230,245,255,0.6)", kind: "streak",
  });
}

function spawnSpark(x, y, color = "#fff") {
  particles.push({
    x, y, vx: rand(-260, 60), vy: rand(-320, 120), g: 900,
    life: rand(0.3, 0.8), r: rand(2, 6), color, kind: "spark",
  });
}
function spawnTrail() {
  particles.push({
    x: PLAYER_X - rand(20, 90), y: player.y + PLAYER_H - rand(6, 40),
    vx: -speed * 0.5, vy: rand(-30, 30), g: 0, life: rand(0.25, 0.5),
    r: rand(2, 5),
    color: ["#ff5bd0","#5bc8ff","#ffe066","#7dff9b","#c78bff"][randi(0,4)],
    kind: "trail",
  });
}
// floating score / near-miss text that rises and fades (screen-space x, world y)
function spawnPopup(x, y, text, color = "#fff") {
  popups.push({ x, y, text, color, life: 1.0, vy: -46 });
}
// white streaks flying backward during a ring boost
function spawnSpeedLine() {
  particles.push({
    x: PLAYER_X + rand(-40, 140), y: player.y + rand(0, PLAYER_H),
    vx: -rand(900, 1500), vy: 0, g: 0, life: rand(0.18, 0.34),
    r: rand(10, 26), color: "rgba(255,255,255,0.7)", kind: "streak",
  });
}

/* ============================================================
   RENDERING
   ============================================================ */
let t = 0;
function render(dt) {
  t += dt;
  ctx.save();
  // screen shake
  if (screenShake > 0.5) {
    ctx.translate(rand(-screenShake, screenShake), rand(-screenShake, screenShake));
  }
  drawScene();

  if (state === STATE.LOADING) drawLoading();
  else if (state === STATE.TITLE) drawTitle();
  else if (state === STATE.SELECT) drawSelect();
  else if (state === STATE.UPGRADES) drawUpgradeTree();
  else if (state === STATE.RESCUE) drawRescue();
  else { drawWorld(); drawTrailInGame(); drawPlayer(); drawParticles(); drawPopups(); drawHUD(); if (state === STATE.DEAD) drawDead(); }

  ctx.restore();
  if (isTouch && (state === STATE.PLAY || state === STATE.RESCUE)) drawTouchPads();
  drawMuteButton(); // fixed overlay, unaffected by screen shake
}

// Translucent left/right control pads on touch devices (left = jump, right = dash).
function drawTouchPads() {
  ctx.save();
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  // faint tint over each half + centre divider
  ctx.fillStyle = "rgba(120,200,255,0.06)";
  ctx.fillRect(0, 0, W / 2, H);
  ctx.fillStyle = "rgba(255,170,110,0.06)";
  ctx.fillRect(W / 2, 0, W / 2, H);
  ctx.strokeStyle = "rgba(255,255,255,0.12)"; ctx.lineWidth = 2;
  ctx.setLineDash([10, 12]);
  ctx.beginPath(); ctx.moveTo(W / 2, 30); ctx.lineTo(W / 2, H - 30); ctx.stroke();
  ctx.setLineDash([]);

  const pad = (cx, cy, glyph, label, col) => {
    ctx.beginPath(); ctx.arc(cx, cy, 52, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(20,10,40,0.32)"; ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = col; ctx.font = "40px system-ui, sans-serif";
    ctx.fillText(glyph, cx, cy - 4);
    ctx.font = "bold 17px Trebuchet MS, sans-serif";
    ctx.fillStyle = "#fff";
    ctx.fillText(label, cx, cy + 34);
  };
  pad(W * 0.11, H * 0.80, "⤒", "JUMP", "rgba(150,215,255,0.95)");
  pad(W * 0.89, H * 0.80, "»", "DASH", "rgba(255,195,140,0.98)");
  ctx.restore();
}

function drawMuteButton() {
  const b = MUTE_BTN;
  ctx.save();
  ctx.beginPath();
  ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(20,4,40,0.5)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.3)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.font = "18px system-ui, sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(Sound.muted ? "🔇" : "🔊", b.x, b.y + 1);
  ctx.restore();
}

/* ---- parallax background scene (sky + far + mid + near) ---- */
function bgScroll() { return state === STATE.PLAY ? distance : t * 140; }

function drawTiledLayer(url, speed) {
  const im = img(url);
  if (!im || !im.width) return false;
  const s = H / im.height;      // scale each layer to canvas height
  const tw = im.width * s;
  let off = ((bgScroll() * speed) % tw + tw) % tw;
  for (let x = -off; x < W; x += tw) ctx.drawImage(im, x, 0, tw, H);
  return true;
}

function drawScene() {
  const layers = MAPS[selMap].bg; // selected map
  // sky (opaque) — gradient fallback until the art loads
  if (!drawTiledLayer(layers[0].url, layers[0].speed)) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#2a0a52");
    g.addColorStop(1, "#12042e");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  // optional dusk tint to unify a bright sky with neon night layers
  if (SKY_TINT > 0) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, `rgba(18,4,48,${0.8 * SKY_TINT})`);
    g.addColorStop(1, `rgba(44,12,74,${0.4 * SKY_TINT})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  // parallax layers, far -> near
  for (let i = 1; i < layers.length; i++) drawTiledLayer(layers[i].url, layers[i].speed);
}

function drawWorld() {
  for (const s of world.segs) {
    const x = s.x - distance;
    if (x > W || x + s.w < 0) continue;
    drawRoad(x, s.top, s.w, s.x);
  }
  for (const rg of rings) {
    if (rg.got) continue;
    const x = rg.x - distance;
    if (x < -60 || x > W + 60) continue;
    drawRing(x, rg.y, rg.r, rg.spin);
  }
  for (const s of stars) {
    if (s.got) continue;
    const x = s.x - distance;
    if (x < -40 || x > W + 40) continue;
    drawStar(x, s.y, 17, s.spin);
  }
  for (const o of obstacles) {
    if (o.dead) continue;
    const x = o.x - distance;
    if (x < -60 || x > W + 60) continue;
    drawObstacle(x, o);
  }
}

// How far down a road segment should be painted. Short/low roads fill to the
// bottom of the screen (grounded); tall roads stop at a slab of PLATFORM_H so
// you can still see the city behind them — it's a game, roads can float.
function roadBottom(topY) {
  const b = topY + PLATFORM_H;
  return b >= H - 80 ? H : b;   // near the floor: fill solid; else float as a slab
}

// Shaded underside + soft drop shadow so a floating road reads as a platform,
// not a hard-edged rectangle. No-op when the segment reaches the ground.
function drawPlatformUnderside(x, topY, w, botY) {
  if (botY >= H) return;
  ctx.fillStyle = "rgba(0,0,0,0.45)"; ctx.fillRect(x, botY - 5, w, 5);
  ctx.fillStyle = "rgba(0,0,0,0.8)";  ctx.fillRect(x, botY, w, 4);
  const sh = ctx.createLinearGradient(0, botY, 0, botY + 30);
  sh.addColorStop(0, "rgba(0,0,0,0.35)");
  sh.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = sh; ctx.fillRect(x, botY + 4, w, 30);
}

// Road styling is per-map (see MAPS[].road).
function drawRoad(x, topY, w, worldX) {
  const style = MAPS[selMap].road;
  if (style === "dirt") drawRoadDirt(x, topY, w, worldX);
  else if (style === "china") drawRoadChina(x, topY, w, worldX);
  else if (style === "crystal") drawRoadCrystal(x, topY, w, worldX);
  else if (style === "tokyo") drawRoadTokyo(x, topY, w, worldX);
  else if (style === "moemoe") drawRoadMoe(x, topY, w, worldX);
  else drawRoadNeon(x, topY, w, worldX);
}

// Tokyo Night: wet black asphalt with neon reflections and white lane dashes.
function drawRoadTokyo(x, topY, w, worldX) {
  const botY = roadBottom(topY);
  ctx.save();
  ctx.fillStyle = "rgba(255,90,200,0.30)"; // neon curb glow line
  ctx.fillRect(x - 2, topY - 8, w + 4, 8);

  const body = ctx.createLinearGradient(0, topY, 0, botY);
  body.addColorStop(0, "#161320");
  body.addColorStop(0.12, "#0e0b16");
  body.addColorStop(1, "#05040a");
  ctx.fillStyle = body;
  ctx.fillRect(x, topY, w, botY - topY);

  // wet neon reflections: soft vertical smears of colour scrolling past
  ctx.save();
  ctx.beginPath(); ctx.rect(x, topY, w, botY - topY); ctx.clip();
  const cols = ["rgba(255,60,180,0.10)", "rgba(90,200,255,0.09)", "rgba(200,120,255,0.09)"];
  const per = 150;
  const start = worldX - ((worldX % per) + per) % per;
  for (let d = start; d < worldX + w + per; d += per) {
    const sx = d - worldX + x;
    const g = ctx.createLinearGradient(sx, topY, sx, botY);
    const c = cols[Math.floor(Math.abs(d / per)) % cols.length];
    g.addColorStop(0, c); g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(sx - 16, topY + 6, 32, botY - topY);
  }
  ctx.restore();

  // magenta curb + white top line
  ctx.fillStyle = "#ff3cae"; ctx.fillRect(x, topY, w, 7);
  ctx.fillStyle = "rgba(255,255,255,0.9)"; ctx.fillRect(x, topY, w, 2);

  // scrolling white lane dashes
  const dashY = topY + 34, dashW = 46, gap = 44, period = dashW + gap;
  ctx.fillStyle = "rgba(240,240,255,0.8)";
  const s2 = worldX - ((worldX % period) + period) % period;
  for (let d = s2; d < worldX + w + period; d += period) {
    const sx = d - worldX + x;
    const clipL = Math.max(sx, x), clipR = Math.min(sx + dashW, x + w);
    if (clipR > clipL) ctx.fillRect(clipL, dashY, clipR - clipL, 5);
  }
  drawPlatformUnderside(x, topY, w, botY);
  ctx.restore();
}

// Crystal City: a glassy, faceted road — cool blue-purple body with scrolling
// crystal facets, a prismatic curb, and scrolling gem diamonds down the middle.
function drawRoadCrystal(x, topY, w, worldX) {
  const botY = roadBottom(topY);
  ctx.save();
  ctx.fillStyle = "rgba(180,230,255,0.35)";
  ctx.fillRect(x - 2, topY - 9, w + 4, 9);

  const body = ctx.createLinearGradient(0, topY, 0, botY);
  body.addColorStop(0, "#5566b8");
  body.addColorStop(0.14, "#3b3f86");
  body.addColorStop(1, "#161436");
  ctx.fillStyle = body;
  ctx.fillRect(x, topY, w, botY - topY);

  // faceted diagonal shards (clipped to the road, scrolling with worldX)
  ctx.save();
  ctx.beginPath(); ctx.rect(x, topY, w, botY - topY); ctx.clip();
  const step = 64, depth = (botY - topY) * 0.6;
  const off = ((worldX * 0.6) % step + step) % step;
  ctx.lineWidth = 20;
  for (let sx = x - off - step; sx < x + w + depth; sx += step) {
    ctx.strokeStyle = "rgba(200,240,255,0.10)";
    ctx.beginPath(); ctx.moveTo(sx, topY); ctx.lineTo(sx - depth, botY); ctx.stroke();
    ctx.strokeStyle = "rgba(150,110,220,0.10)";
    ctx.beginPath(); ctx.moveTo(sx + 32, topY); ctx.lineTo(sx + 32 - depth, botY); ctx.stroke();
  }
  ctx.restore();

  // prismatic curb
  const curb = ctx.createLinearGradient(x, 0, x + w, 0);
  curb.addColorStop(0.0, "#7dffff");
  curb.addColorStop(0.4, "#c78bff");
  curb.addColorStop(0.7, "#ff9ee0");
  curb.addColorStop(1.0, "#7dd8ff");
  ctx.fillStyle = curb;
  ctx.fillRect(x, topY, w, 9);
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.fillRect(x, topY, w, 3);

  // scrolling crystal diamonds down the centre
  const dY = topY + 36, per = 116;
  const start = worldX - ((worldX % per) + per) % per;
  for (let d = start; d < worldX + w + per; d += per) {
    const cx = d - worldX + x;
    if (cx < x + 8 || cx > x + w - 8) continue;
    ctx.save();
    ctx.translate(cx, dY); ctx.rotate(Math.PI / 4);
    ctx.shadowColor = "#9fefff"; ctx.shadowBlur = 10;
    ctx.fillStyle = "rgba(190,240,255,0.85)";
    ctx.fillRect(-6, -6, 12, 12);
    ctx.restore();
  }
  drawPlatformUnderside(x, topY, w, botY);
  ctx.restore();
}

// China City: dark asphalt with a red+gold curb and gold dashes.
function drawRoadChina(x, topY, w, worldX) {
  const botY = roadBottom(topY);
  ctx.save();
  ctx.fillStyle = "rgba(10,4,6,0.6)";
  ctx.fillRect(x - 2, topY - 10, w + 4, 10);

  const body = ctx.createLinearGradient(0, topY, 0, botY);
  body.addColorStop(0, "#2a1418");
  body.addColorStop(0.15, "#1c0d10");
  body.addColorStop(1, "#0b0506");
  ctx.fillStyle = body;
  ctx.fillRect(x, topY, w, botY - topY);

  // red curb with a gold top line
  ctx.fillStyle = "#ee1c25";
  ctx.fillRect(x, topY, w, 9);
  ctx.fillStyle = "#ffcf33";
  ctx.fillRect(x, topY, w, 3);

  // scrolling gold dashes
  const dashY = topY + 34, dashW = 46, gap = 42, period = dashW + gap;
  ctx.fillStyle = "rgba(255,207,51,0.9)";
  const start = worldX - ((worldX % period) + period) % period;
  for (let d = start; d < worldX + w + period; d += period) {
    const sx = d - worldX + x;
    const clipL = Math.max(sx, x), clipR = Math.min(sx + dashW, x + w);
    if (clipR > clipL) ctx.fillRect(clipL, dashY, clipR - clipL, 5);
  }
  drawPlatformUnderside(x, topY, w, botY);
  ctx.restore();
}

// Neon City: dark asphalt, neon curb, scrolling dashed center line.
function drawRoadNeon(x, topY, w, worldX) {
  const botY = roadBottom(topY);
  ctx.save();
  ctx.fillStyle = "rgba(8,3,20,0.55)";
  ctx.fillRect(x - 2, topY - 10, w + 4, 10);

  const body = ctx.createLinearGradient(0, topY, 0, botY);
  body.addColorStop(0, "#241238");
  body.addColorStop(0.15, "#1a0e2b");
  body.addColorStop(1, "#0c0618");
  ctx.fillStyle = body;
  ctx.fillRect(x, topY, w, botY - topY);

  const curb = ctx.createLinearGradient(x, 0, x + w, 0);
  curb.addColorStop(0.0, "#ff5bd0");
  curb.addColorStop(0.5, "#c78bff");
  curb.addColorStop(1.0, "#5bc8ff");
  ctx.fillStyle = curb;
  ctx.fillRect(x, topY, w, 9);
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.fillRect(x, topY, w, 3);

  const dashY = topY + 34, dashW = 46, gap = 42, period = dashW + gap;
  ctx.fillStyle = "rgba(255,224,102,0.85)";
  const start = worldX - ((worldX % period) + period) % period;
  for (let d = start; d < worldX + w + period; d += period) {
    const sx = d - worldX + x;
    const clipL = Math.max(sx, x), clipR = Math.min(sx + dashW, x + w);
    if (clipR > clipL) ctx.fillRect(clipL, dashY, clipR - clipL, 5);
  }
  drawPlatformUnderside(x, topY, w, botY);
  ctx.restore();
}

// MoeMoe Land: glossy gold road with a black body, blue+gold curb, black dashes
// and little scrolling sparkles — to match the weird blue/gold/black meme scene.
function drawRoadMoe(x, topY, w, worldX) {
  const botY = roadBottom(topY);
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(x - 2, topY - 10, w + 4, 10);

  const body = ctx.createLinearGradient(0, topY, 0, botY);
  body.addColorStop(0, "#3a2f08");
  body.addColorStop(0.12, "#1a1503");
  body.addColorStop(1, "#050400");
  ctx.fillStyle = body;
  ctx.fillRect(x, topY, w, botY - topY);

  // glossy gold surface strip
  const gloss = ctx.createLinearGradient(0, topY, 0, topY + 18);
  gloss.addColorStop(0, "#ffe14d");
  gloss.addColorStop(1, "rgba(255,200,40,0)");
  ctx.fillStyle = gloss;
  ctx.fillRect(x, topY + 3, w, 18);

  // blue curb with a bright gold top line (the scene's blue + gold)
  ctx.fillStyle = "#2a6bff";
  ctx.fillRect(x, topY, w, 9);
  ctx.fillStyle = "#ffd23f";
  ctx.fillRect(x, topY, w, 3);

  // scrolling black centre dashes
  const dashY = topY + 34, dashW = 46, gap = 42, period = dashW + gap;
  ctx.fillStyle = "rgba(0,0,0,0.85)";
  const start = worldX - ((worldX % period) + period) % period;
  for (let d = start; d < worldX + w + period; d += period) {
    const sx = d - worldX + x;
    const clipL = Math.max(sx, x), clipR = Math.min(sx + dashW, x + w);
    if (clipR > clipL) ctx.fillRect(clipL, dashY, clipR - clipL, 5);
  }

  // little scrolling gold sparkles on the tar
  ctx.save();
  ctx.beginPath(); ctx.rect(x, topY, w, botY - topY); ctx.clip();
  const cell = 70;
  const c0 = Math.floor(worldX / cell), c1 = Math.ceil((worldX + w) / cell);
  for (let c = c0; c <= c1; c++) {
    const h1 = Math.sin(c * 91.7) * 4137.1; const r1 = h1 - Math.floor(h1);
    const h2 = Math.sin(c * 33.3) * 7219.7; const r2 = h2 - Math.floor(h2);
    const px = c * cell + r1 * cell - worldX + x;
    const py = topY + 22 + r2 * Math.min(48, botY - topY - 22);
    ctx.fillStyle = "rgba(255,220,80,0.7)";
    ctx.beginPath(); ctx.arc(px, py, 1.6 + r1 * 1.6, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();

  drawPlatformUnderside(x, topY, w, botY);
  ctx.restore();
}

// Countryside: packed dirt / gravel — earthy body, grassy fringe, scattered
// pebbles + wheel ruts (all positioned by world-x so they scroll, no flicker).
function drawRoadDirt(x, topY, w, worldX) {
  const botY = roadBottom(topY);
  ctx.save();
  // grassy fringe just above the surface
  ctx.fillStyle = "#5c7d33";
  ctx.fillRect(x - 2, topY - 8, w + 4, 8);
  ctx.fillStyle = "rgba(30,45,16,0.5)";
  ctx.fillRect(x - 2, topY - 2, w + 4, 3);

  // dirt body
  const body = ctx.createLinearGradient(0, topY, 0, botY);
  body.addColorStop(0, "#a5793f");
  body.addColorStop(0.12, "#8a6234");
  body.addColorStop(0.5, "#6a4a26");
  body.addColorStop(1, "#4a331b");
  ctx.fillStyle = body;
  ctx.fillRect(x, topY, w, botY - topY);

  // lighter packed-dirt strip at the surface
  ctx.fillStyle = "rgba(214,178,120,0.55)";
  ctx.fillRect(x, topY, w, 6);

  // two darker wheel ruts
  ctx.fillStyle = "rgba(60,40,20,0.35)";
  ctx.fillRect(x, topY + 26, w, 4);
  ctx.fillRect(x, topY + 52, w, 4);

  // gravel pebbles, deterministic per world cell so they scroll steadily
  const cell = 26;
  const c0 = Math.floor(worldX / cell), c1 = Math.ceil((worldX + w) / cell);
  for (let c = c0; c <= c1; c++) {
    const h1 = Math.sin(c * 12.9898) * 43758.5453; const rnd = h1 - Math.floor(h1);
    const h2 = Math.sin(c * 78.233) * 12543.187;   const rnd2 = h2 - Math.floor(h2);
    const px = c * cell + rnd * cell - worldX + x;
    if (px < x || px > x + w) continue;
    const py = topY + 12 + rnd2 * (Math.min(70, botY - topY - 12));
    const pr = 1.4 + rnd * 2.6;
    ctx.fillStyle = rnd2 > 0.5 ? "rgba(225,205,170,0.6)" : "rgba(70,50,28,0.55)";
    ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2); ctx.fill();
  }
  drawPlatformUnderside(x, topY, w, botY);
  ctx.restore();
}

// Giant RUA-style boost ring you fly through (shimmering, pulsing gold torus)
function drawRing(x, y, r, rot) {
  ctx.save();
  ctx.translate(x, y);
  const pulse = 1 + 0.04 * Math.sin(t * 6 + rot);
  ctx.scale((0.7 + 0.3 * Math.abs(Math.sin(rot))) * pulse, pulse); // fake 3-D spin
  ctx.lineJoin = "round"; ctx.lineCap = "round";
  // soft aura
  ctx.shadowColor = "#ffd23f"; ctx.shadowBlur = 34;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.lineWidth = 20; ctx.strokeStyle = "#a86a00"; ctx.stroke(); // dark rim
  ctx.lineWidth = 13; ctx.strokeStyle = "#ffcf33"; ctx.stroke(); // gold band
  ctx.shadowBlur = 0;
  ctx.lineWidth = 5;  ctx.strokeStyle = "#fff2ad"; ctx.stroke(); // inner glow
  // rotating highlight glint
  ctx.beginPath();
  ctx.arc(0, 0, r, rot, rot + 0.9);
  ctx.lineWidth = 6; ctx.strokeStyle = "rgba(255,255,255,0.95)"; ctx.stroke();
  ctx.restore();
}

function drawStar(x, y, r, rot) {
  ctx.save();
  ctx.translate(x, y);
  // glow halo so it reads against light clouds
  ctx.shadowColor = "#ffd23f"; ctx.shadowBlur = 18;
  ctx.rotate(rot);
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    const a2 = a + Math.PI / 5;
    ctx.lineTo(Math.cos(a2) * r * 0.45, Math.sin(a2) * r * 0.45);
  }
  ctx.closePath();
  ctx.fillStyle = "#ffe066";
  ctx.fill();
  ctx.shadowBlur = 0;
  // dark outline for contrast
  ctx.lineWidth = 3; ctx.lineJoin = "round";
  ctx.strokeStyle = "#5a3d00";
  ctx.stroke();
  // inner sparkle
  ctx.beginPath();
  ctx.arc(-r * 0.15, -r * 0.15, r * 0.22, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.fill();
  ctx.restore();
}

// A hazard that stays legible on any background: white halo + black outline +
// hazard stripes, topped with a crayon tip. Dash smashes it; otherwise it kills.
// Hazards are themed per map but share one collision box. Each draw fills the
// footprint [x..x+o.w] x [o.top-o.h .. o.top] and keeps a dark outline / halo so
// it stays legible on any background.
function drawObstacle(x, o) {
  switch (o.kind) {
    case "hay":       return drawHazardHay(x, o);
    case "lantern":   return drawHazardLantern(x, o);
    case "crystal":   return drawHazardCrystal(x, o);
    case "barricade": return drawHazardBarricade(x, o);
    case "emoji":     return drawHazardEmoji(x, o);
    default:          return drawHazardCrayon(x, o);
  }
}

// MoeMoe Land: a stack of kawaii heart-eyes emoji faces (the scene's mascots).
function drawHazardEmoji(x, o) {
  const oTop = o.top - o.h, cx = x + o.w / 2;
  const n = Math.max(1, Math.round(o.h / 70));
  const fh = o.h / n;
  // pulsing red danger aura so the hazard reads apart from the emoji-filled scene
  const pulse = 0.5 + 0.5 * Math.sin(t * 8);
  for (let i = 0; i < n; i++) {
    const cy = oTop + i * fh + fh * 0.5;
    const R = Math.min(o.w, fh) * 0.46;
    ctx.save();
    ctx.shadowColor = `rgba(255,40,70,${0.75 + 0.25 * pulse})`; ctx.shadowBlur = 24;
    ctx.fillStyle = "#ff2a46"; // red danger ring behind the face
    ctx.beginPath(); ctx.arc(cx, cy, R + 9 + 2 * pulse, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#fff"; // white halo for legibility
    ctx.beginPath(); ctx.arc(cx, cy, R + 3, 0, Math.PI * 2); ctx.fill();
    const g = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.35, R * 0.2, cx, cy, R);
    g.addColorStop(0, "#ffe680"); g.addColorStop(1, "#f5b60c");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = "#5a3d00";
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
    // big shiny black eyes
    for (const s of [-1, 1]) {
      const ex = cx + s * R * 0.4, ey = cy - R * 0.08;
      ctx.fillStyle = "#150c00";
      ctx.beginPath(); ctx.ellipse(ex, ey, R * 0.26, R * 0.36, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(ex - R * 0.09, ey - R * 0.12, R * 0.1, 0, Math.PI * 2); ctx.fill();
      // pink blush
      ctx.fillStyle = "rgba(255,120,150,0.7)";
      ctx.beginPath(); ctx.ellipse(ex, cy + R * 0.34, R * 0.16, R * 0.1, 0, 0, Math.PI * 2); ctx.fill();
    }
    // little smile
    ctx.lineWidth = 2.5; ctx.strokeStyle = "#5a3d00"; ctx.lineCap = "round";
    ctx.beginPath(); ctx.arc(cx, cy + R * 0.18, R * 0.28, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke();
    ctx.restore();
  }
}

// Neon City: a hazard-striped crayon pillar with a pointed tip.
function drawHazardCrayon(x, o) {
  const oTop = o.top - o.h;
  ctx.save();
  const pulse = 0.5 + 0.5 * Math.sin(t * 8);
  ctx.shadowColor = `rgba(255,60,90,${0.6 + 0.4 * pulse})`;
  ctx.shadowBlur = 22;
  ctx.fillStyle = "#12030a";
  roundRect(x - 3, oTop - 3, o.w + 6, o.h + 6, 8, true);
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#fff";
  roundRect(x - 3, oTop - 3, o.w + 6, o.h + 6, 8, true); // white halo ring
  ctx.fillStyle = "#160208";
  roundRect(x, oTop, o.w, o.h, 6, true);
  ctx.save();
  ctx.beginPath();
  roundRect(x + 3, oTop + 3, o.w - 6, o.h - 6, 4, false);
  ctx.clip();
  const sw = 14;
  for (let i = -o.h; i < o.w + o.h; i += sw * 2) {
    ctx.fillStyle = "#ffd23f";
    ctx.beginPath();
    ctx.moveTo(x + i, oTop);
    ctx.lineTo(x + i + sw, oTop);
    ctx.lineTo(x + i + sw - o.h, oTop + o.h);
    ctx.lineTo(x + i - o.h, oTop + o.h);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  ctx.fillStyle = "#ff4d6d";
  ctx.beginPath();
  ctx.moveTo(x - 3, oTop);
  ctx.lineTo(x + o.w / 2, oTop - 20);
  ctx.lineTo(x + o.w + 3, oTop);
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = 2.5; ctx.strokeStyle = "#12030a"; ctx.stroke();
  ctx.restore();
}

// Countryside: a round straw hay bale with binding straps.
function drawHazardHay(x, o) {
  const oTop = o.top - o.h, cx = x + o.w / 2, cy = o.top - o.h / 2;
  const r = Math.min(o.w, o.h) / 2;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.45)"; ctx.shadowBlur = 12;
  ctx.fillStyle = "#3a2a12"; roundRect(x - 3, oTop - 3, o.w + 6, o.h + 6, r + 3, true);
  ctx.shadowBlur = 0;
  ctx.fillStyle = "rgba(255,255,255,0.9)"; roundRect(x - 3, oTop - 3, o.w + 6, o.h + 6, r + 3, true);
  const g = ctx.createLinearGradient(0, oTop, 0, o.top);
  g.addColorStop(0, "#f2ce62"); g.addColorStop(1, "#b9832e");
  ctx.fillStyle = g; roundRect(x, oTop, o.w, o.h, r, true);
  ctx.save();
  ctx.beginPath(); roundRect(x, oTop, o.w, o.h, r, false); ctx.clip();
  // spiral roll rings + straw texture
  ctx.strokeStyle = "rgba(120,80,20,0.45)"; ctx.lineWidth = 2;
  for (let rr = 8; rr < o.w; rr += 12) { ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.stroke(); }
  ctx.strokeStyle = "rgba(90,60,15,0.22)"; ctx.lineWidth = 1;
  for (let yy = oTop + 6; yy < o.top; yy += 7) { ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + o.w, yy); ctx.stroke(); }
  ctx.restore();
  ctx.fillStyle = "rgba(60,40,12,0.55)";
  ctx.fillRect(x + o.w * 0.32 - 2, oTop, 5, o.h);
  ctx.fillRect(x + o.w * 0.68 - 2, oTop, 5, o.h);
  ctx.restore();
}

// China City: a post stacked with glowing red paper lanterns.
function drawHazardLantern(x, o) {
  const oTop = o.top - o.h, cx = x + o.w / 2;
  ctx.save();
  ctx.fillStyle = "#241012"; ctx.fillRect(cx - 4, oTop, 8, o.h); // post
  const n = Math.max(2, Math.round(o.h / 48));
  const lh = o.h / n;
  for (let i = 0; i < n; i++) {
    const ly = oTop + i * lh + lh * 0.5;
    const lw = o.w * 0.98, lhh = lh * 0.72;
    ctx.shadowColor = "rgba(255,60,60,0.8)"; ctx.shadowBlur = 15;
    ctx.fillStyle = "#ffcf33"; // gold caps
    ctx.fillRect(cx - lw * 0.26, ly - lhh * 0.5 - 4, lw * 0.52, 4);
    ctx.fillRect(cx - lw * 0.26, ly + lhh * 0.5, lw * 0.52, 4);
    const g = ctx.createLinearGradient(cx - lw / 2, 0, cx + lw / 2, 0);
    g.addColorStop(0, "#a5111a"); g.addColorStop(0.5, "#ee1c25"); g.addColorStop(1, "#a5111a");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(cx, ly, lw / 2, lhh / 2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 2.5; ctx.strokeStyle = "#5a0708"; ctx.stroke();
    ctx.strokeStyle = "rgba(255,207,51,0.7)"; ctx.lineWidth = 1.5;
    for (const fx of [-0.26, 0, 0.26]) {
      ctx.beginPath(); ctx.moveTo(cx + lw * fx, ly - lhh * 0.42); ctx.lineTo(cx + lw * fx, ly + lhh * 0.42); ctx.stroke();
    }
  }
  ctx.strokeStyle = "#ffcf33"; ctx.lineWidth = 3; // bottom tassel
  ctx.beginPath(); ctx.moveTo(cx, o.top - 2); ctx.lineTo(cx, o.top + 9); ctx.stroke();
  ctx.restore();
}

// Crystal City: a faceted cluster of glowing crystal spikes.
function drawHazardCrystal(x, o) {
  const oTop = o.top - o.h, cx = x + o.w / 2;
  ctx.save();
  const shard = (bx, bw, ty, c1, c2) => {
    const g = ctx.createLinearGradient(bx, ty, bx, o.top);
    g.addColorStop(0, c1); g.addColorStop(1, c2);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(bx, ty);                 // pointed tip
    ctx.lineTo(bx + bw / 2, o.top - 10);
    ctx.lineTo(bx + bw * 0.3, o.top);
    ctx.lineTo(bx - bw * 0.3, o.top);
    ctx.lineTo(bx - bw / 2, o.top - 10);
    ctx.closePath(); ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = "#1a1440"; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bx, ty); ctx.lineTo(bx, o.top - 6);
    ctx.lineWidth = 1.5; ctx.strokeStyle = "rgba(255,255,255,0.6)"; ctx.stroke();
  };
  ctx.shadowColor = "rgba(150,230,255,0.8)"; ctx.shadowBlur = 18;
  shard(cx - o.w * 0.28, o.w * 0.42, oTop + o.h * 0.34, "#8fd8ff", "#4a76c8");
  shard(cx + o.w * 0.30, o.w * 0.44, oTop + o.h * 0.22, "#c79bff", "#6a3fb0");
  ctx.shadowBlur = 24;
  shard(cx, o.w * 0.52, oTop, "#d6f7ff", "#5b8de0"); // tallest central spike
  ctx.restore();
}

// Tokyo Night: a striped neon construction barricade with a blinking light.
function drawHazardBarricade(x, o) {
  const oTop = o.top - o.h, cx = x + o.w / 2;
  ctx.save();
  ctx.shadowColor = "rgba(255,190,40,0.55)"; ctx.shadowBlur = 16;
  ctx.fillStyle = "#111"; roundRect(x - 3, oTop - 3, o.w + 6, o.h + 6, 6, true);
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#fff"; roundRect(x - 3, oTop - 3, o.w + 6, o.h + 6, 6, true);
  ctx.fillStyle = "#141418"; roundRect(x, oTop, o.w, o.h, 5, true);
  ctx.save();
  ctx.beginPath(); roundRect(x + 3, oTop + 3, o.w - 6, o.h - 6, 3, false); ctx.clip();
  const sw = 14;
  for (let i = -o.h; i < o.w + o.h; i += sw * 2) {
    ctx.fillStyle = "#ffbe28";
    ctx.beginPath();
    ctx.moveTo(x + i, oTop);
    ctx.lineTo(x + i + sw, oTop);
    ctx.lineTo(x + i + sw - o.h, oTop + o.h);
    ctx.lineTo(x + i - o.h, oTop + o.h);
    ctx.closePath();
    ctx.fill();
  }
  // cyan reflective band
  ctx.fillStyle = "rgba(90,200,255,0.4)"; ctx.fillRect(x, oTop + o.h * 0.42, o.w, o.h * 0.16);
  ctx.restore();
  const blink = 0.5 + 0.5 * Math.sin(t * 10); // blinking hazard light
  ctx.shadowColor = `rgba(255,60,120,${0.4 + 0.6 * blink})`; ctx.shadowBlur = 18;
  ctx.fillStyle = `rgba(255,${Math.round(50 + 120 * blink)},170,1)`;
  ctx.beginPath(); ctx.arc(cx, oTop - 6, 5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/* ---------- Tron trail rendering ---------- */
function trailColorAt(i, len, colCss) {
  if (TRAIL_DESIGNS[selTrailDesign].id === "rainbow")
    return `hsl(${(i / len * 300 + t * 140) % 360} 100% 62%)`;
  return colCss;
}

// pts: array of {x, y} in SCREEN space, oldest first, newest (at bike) last.
function drawTrail(pts) {
  if (!pts || pts.length < 2) return;
  const design = TRAIL_DESIGNS[selTrailDesign].id;
  const colCss = TRAIL_COLORS[selTrailColor].css;
  const len = pts.length;
  ctx.save();
  ctx.lineCap = "round"; ctx.lineJoin = "round";

  // near-constant thickness; fade/thin only over the oldest ~25% (the tail)
  const taper = (f) => Math.min(1, f * 4);

  // Soap Bubbles: hollow, translucent glassy bubbles that drift and pop, with a
  // bright rim, a shine highlight, and a hint of iridescent film.
  if (design === "soapbubbles") {
    for (let i = 0; i < len; i += 3) {
      const f = i / len, tp = taper(f);
      const hx = Math.sin(i * 12.9898) * 43758.5453; const r1 = hx - Math.floor(hx);
      const rad = (8 + r1 * 15) * (0.6 + 0.4 * tp);
      const bx = pts[i].x + Math.cos(t * 1.5 + i * 0.7) * 4;
      const by = pts[i].y - 8 + Math.sin(t * 2 + i) * 7;   // gentle bob/rise
      // translucent glass fill (see-through)
      ctx.globalAlpha = 0.14 + 0.08 * tp;
      ctx.fillStyle = colCss;
      ctx.beginPath(); ctx.arc(bx, by, rad, 0, Math.PI * 2); ctx.fill();
      // dark outer rim so the bubble reads on bright backgrounds
      ctx.globalAlpha = 0.4 + 0.35 * tp;
      ctx.lineWidth = 3.5; ctx.strokeStyle = "rgba(20,20,40,0.6)";
      ctx.beginPath(); ctx.arc(bx, by, rad, 0, Math.PI * 2); ctx.stroke();
      // bright glassy rim
      ctx.globalAlpha = 0.55 + 0.35 * tp;
      ctx.lineWidth = 2; ctx.strokeStyle = colCss;
      ctx.beginPath(); ctx.arc(bx, by, rad, 0, Math.PI * 2); ctx.stroke();
      // iridescent film arc (lower-right)
      ctx.globalAlpha = 0.5 * tp;
      ctx.strokeStyle = `hsl(${(i * 40 + t * 120) % 360} 95% 72%)`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(bx, by, rad - 1.5, 0.4, 1.9); ctx.stroke();
      // white shine highlight (upper-left)
      ctx.globalAlpha = 0.7 + 0.3 * tp;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath(); ctx.arc(bx - rad * 0.32, by - rad * 0.34, Math.max(1.5, rad * 0.24), 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    return;
  }

  // Curtain: a full bike-height banner billowing OFF the bike — full height at
  // the bike end, tapering + fluttering like fabric toward the free tail.
  if (design === "curtain") {
    const TALL = PLAYER_H * 1.42;
    // per-point geometry: height (tall at head/bike, short at tail) + flutter
    const topY = (i) => {
      const f = i / (len - 1);                 // 0 tail … 1 head (at the bike)
      const hgt = TALL * (0.28 + 0.72 * f);    // billows out to full height at the bike
      const flutter = Math.sin(pts[i].x * 0.03 + t * 6) * 20 * (1 - f) +
                      Math.sin(pts[i].x * 0.011 - t * 3) * 10 * (1 - f * 0.6);
      return pts[i].y - hgt + flutter;
    };
    ctx.shadowColor = colCss; ctx.shadowBlur = 16;
    for (let i = 1; i < len; i++) {
      const tp = taper(i / len);
      ctx.globalAlpha = tp * 0.52;
      ctx.fillStyle = trailColorAt(i, len, colCss);
      ctx.beginPath();
      ctx.moveTo(pts[i - 1].x, topY(i - 1));
      ctx.lineTo(pts[i].x, topY(i));
      ctx.lineTo(pts[i].x, pts[i].y);
      ctx.lineTo(pts[i - 1].x, pts[i - 1].y);
      ctx.closePath(); ctx.fill();
    }
    // a brighter inner sweep (half height) for depth, and edges
    ctx.shadowBlur = 0;
    for (let i = 1; i < len; i++) {
      const tp = taper(i / len);
      // bright bottom edge = the wheel path (anchors it to the bike)
      ctx.globalAlpha = tp * 0.95;
      ctx.strokeStyle = trailColorAt(i, len, colCss); ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(pts[i - 1].x, pts[i - 1].y); ctx.lineTo(pts[i].x, pts[i].y); ctx.stroke();
      // wavy top edge highlight
      ctx.globalAlpha = tp * 0.55;
      ctx.strokeStyle = "rgba(255,255,255,0.65)"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(pts[i - 1].x, topY(i - 1)); ctx.lineTo(pts[i].x, topY(i)); ctx.stroke();
    }
    ctx.restore();
    return;
  }

  // Air Streams: a few thin wavy wind streaks trailing behind the bike.
  if (design === "air") {
    const lanes = [-16, -6, 4, 14, 24];
    ctx.lineCap = "round";
    for (let L = 0; L < lanes.length; L++) {
      const phase = L * 1.7, amp = 5 + L;
      ctx.beginPath();
      for (let i = 0; i < len; i++) {
        const wy = pts[i].y + lanes[L] + Math.sin(pts[i].x * 0.045 + phase + t * 8) * amp;
        if (i === 0) ctx.moveTo(pts[i].x, wy); else ctx.lineTo(pts[i].x, wy);
      }
      ctx.strokeStyle = trailColorAt(len - 1, len, colCss);
      ctx.globalAlpha = 0.28 + 0.12 * (L % 2);
      ctx.shadowColor = colCss; ctx.shadowBlur = 6;
      ctx.lineWidth = 2.2;
      ctx.stroke();
    }
    ctx.restore();
    return;
  }

  if (design === "bubbles" || design === "stars") {
    const step = design === "bubbles" ? 3 : 4;
    for (let i = 0; i < len; i += step) {
      const p = pts[i], f = i / len, tp = taper(f);
      const col = trailColorAt(i, len, colCss);
      ctx.globalAlpha = 0.2 + tp * 0.8;
      ctx.shadowColor = col; ctx.shadowBlur = 12;
      if (design === "bubbles") {
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(p.x, p.y, 4 + tp * 8, 0, Math.PI * 2); ctx.fill();
      } else {
        sparkle(p.x, p.y, 5 + tp * 8, t * 3 + i, col);
      }
    }
    ctx.restore();
    return;
  }

  // path designs: line / ribbon / rainbow / dashed (glow pass)
  for (let i = 1; i < len; i++) {
    if (design === "dashed" && (i % 7) < 3) continue;
    const f = i / len, tp = taper(f);
    const col = trailColorAt(i, len, colCss);
    ctx.strokeStyle = col;
    ctx.shadowColor = col; ctx.shadowBlur = 16;
    ctx.globalAlpha = tp * (design === "ribbon" ? 0.7 : 0.95);
    ctx.lineWidth = (design === "ribbon" ? 24 : 10) * (0.3 + 0.7 * tp);
    ctx.beginPath();
    ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
    ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
  }
  // bright white core for the crisp Tron look
  if (design === "line" || design === "rainbow" || design === "dashed") {
    ctx.shadowBlur = 0;
    for (let i = 1; i < len; i++) {
      if (design === "dashed" && (i % 7) < 3) continue;
      const tp = taper(i / len);
      ctx.globalAlpha = tp * 0.85;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = Math.max(1, 10 * (0.3 + 0.7 * tp) * 0.34);
      ctx.beginPath();
      ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
      ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function sparkle(x, y, r, rot, color) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(rot);
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    const a2 = a + Math.PI / 4;
    ctx.lineTo(Math.cos(a2) * r * 0.4, Math.sin(a2) * r * 0.4);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

function drawTrailInGame() {
  if (!trail || trail.length < 2) return;
  const pts = trail.map((p) => ({ x: p.wx - distance, y: p.y }));
  drawTrail(pts);
}

function drawPlayer() {
  const ride = RIDES[selRide];
  const f = ride.frames;
  let url, bob = 0;
  if (!player.alive) url = f.crash;
  else if (!player.onGround) url = player.vy < 0 ? f.wheelie : f.air; // rising vs falling
  else if (player.landT > 0) url = f.land;
  else { url = f.ride; bob = Math.sin(t * 9) * 2.5; } // subtle engine-idle bob
  const sprite = img(url);
  if (!sprite || !sprite.width) return;

  const h = PLAYER_H * (ride.scale || 1.36);
  const wheelFrac = ride.wheelFrac || 0.935;
  const w = h * (sprite.width / sprite.height);
  const dx = -w / 2, dy = -wheelFrac * h + bob; // anchor tyres at the pivot

  ctx.save();
  ctx.translate(PLAYER_X, player.y + PLAYER_H); // pivot on the road contact line
  ctx.rotate(player.tilt * 0.18);               // subtle; poses already convey motion

  if (player.dashT > 0 || player.boostT > 0) {
    const boosting = player.boostT > 0;
    ctx.shadowColor = boosting ? "#ffd23f" : "#5bc8ff";
    ctx.shadowBlur = boosting ? 55 : 40;
    ctx.globalAlpha = 0.6;
    ctx.drawImage(sprite, dx - (boosting ? 44 : 30), dy, w, h);
    ctx.globalAlpha = 1;
  }
  ctx.drawImage(sprite, dx, dy, w, h);
  ctx.restore();
}

function drawRescue() {
  drawScene();
  drawWorld();
  drawParticles();               // wind streaks + crash sparks

  const heli = img(DUSTOFF);
  const hw = HELI_W, hh = heliH();
  const hx = rescue.heliX, hy = rescue.heliY;
  const bobX = Math.sin(t * 5) * 2;
  // hook point in the sprite ≈ (0.56w, 0.98h) from top-left
  const hookX = hx + (0.56 - 0.5) * hw + bobX;
  const hookY = hy + (0.98 - 0.5) * hh;

  if (heli && heli.width) ctx.drawImage(heli, hx - hw / 2 + bobX, hy - hh / 2, hw, hh);
  if (rescue.phase !== "away") {  // cable from hook to the hanging bike
    ctx.save();
    ctx.strokeStyle = "#242424"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(hookX, hookY); ctx.lineTo(PLAYER_X - 4, player.y + 16); ctx.stroke();
    ctx.restore();
  }
  drawPlayer();                   // the bike, drawn wherever player.y is
  drawHUD();

  const pulse = 0.6 + 0.4 * Math.sin(t * 6);
  ctx.globalAlpha = pulse;
  centerText("🚁 MOE ZEDONG DUSTOFF", H * 0.14, 30, "#ffe066");
  ctx.globalAlpha = 1;
}

function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = clamp(p.life * 2, 0, 1);
    ctx.fillStyle = p.color;
    if (p.kind === "streak") {
      ctx.fillRect(p.x, p.y, p.r * 3, 2);
    } else if (p.kind === "trail") {
      ctx.fillRect(p.x, p.y, p.r * 2, p.r);
    } else {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

function drawPopups() {
  ctx.save();
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = "900 24px Trebuchet MS, sans-serif";
  ctx.lineWidth = 4; ctx.strokeStyle = "rgba(0,0,0,0.85)"; ctx.lineJoin = "round";
  for (const p of popups) {
    ctx.globalAlpha = clamp(p.life * 1.4, 0, 1);
    const pop = 1 + Math.max(0, (p.life - 0.7)) * 1.2; // quick pop-in on spawn
    ctx.save();
    ctx.translate(p.x, p.y); ctx.scale(pop, pop);
    ctx.strokeText(p.text, 0, 0);
    ctx.fillStyle = p.color; ctx.fillText(p.text, 0, 0);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

/* ---- HUD ---- */
function drawHUD() {
  ctx.save();
  ctx.font = "bold 34px Trebuchet MS, sans-serif";
  ctx.textBaseline = "top";
  ctx.fillStyle = "#fff";
  ctx.shadowColor = "#ff5bd0"; ctx.shadowBlur = 12;
  ctx.fillText(`${Math.floor(score)}`, 28, 22);
  ctx.font = "bold 18px Trebuchet MS, sans-serif";
  ctx.shadowBlur = 0;
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.fillText(`BEST ${best}`, 30, 62);
  // stars collected this run (banked)
  ctx.fillStyle = "#ffe066";
  ctx.fillText(`🌟 ${runStars}`, 30, 86);
  // shields (dustoff rescues) remaining
  if (player.shieldsLeft > 0) {
    ctx.fillStyle = "#5bc8ff";
    ctx.fillText(`🛡 ${player.shieldsLeft}`, 30, 110);
  }

  // dash charges
  ctx.textAlign = "right";
  const ready = player.dashStock > 0;
  ctx.fillStyle = ready ? "#5bff9b" : "rgba(255,255,255,0.35)";
  const label = up.dashMax > 1 ? `DASH ${player.dashStock}/${up.dashMax}` : (ready ? "DASH READY" : "dash…");
  ctx.fillText(label, W - 28, 26);
  ctx.restore();

  // combo multiplier (center-top) with a draining timer bar
  if (combo > 0 && comboMult() > 1) {
    ctx.save();
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    const m = comboMult();
    const pop = 1 + 0.12 * Math.max(0, comboTimer / COMBO_WINDOW - 0.7);
    ctx.font = `bold ${Math.round(46 * pop)}px Trebuchet MS, sans-serif`;
    ctx.fillStyle = "#ffe066";
    ctx.shadowColor = "#ff8a00"; ctx.shadowBlur = 16;
    ctx.fillText(`×${m}`, W / 2, 20);
    ctx.font = "bold 15px Trebuchet MS, sans-serif";
    ctx.shadowBlur = 0; ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.fillText(`COMBO ${combo}`, W / 2, 66);
    // timer bar
    const bw = 120, frac = clamp(comboTimer / COMBO_WINDOW, 0, 1);
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.fillRect(W / 2 - bw / 2, 88, bw, 5);
    ctx.fillStyle = "#ffe066";
    ctx.fillRect(W / 2 - bw / 2, 88, bw * frac, 5);
    ctx.restore();
  }
}

/* ---- Screens ---- */
function drawLoading() {
  centerText("Loading the crayons…", H / 2, 40, "#fff");
  const p = assetsLoaded / assetTotal;
  ctx.fillStyle = "rgba(255,255,255,0.2)";
  ctx.fillRect(W/2 - 160, H/2 + 40, 320, 14);
  ctx.fillStyle = "#ff5bd0";
  ctx.fillRect(W/2 - 160, H/2 + 40, 320 * p, 14);
}

function logo(y) {
  const cols = ["#ff5bd0","#ff9e3f","#ffe066","#7dff9b","#5bc8ff","#c78bff"];
  const text = "MOEtorcycles";
  ctx.save();
  ctx.font = "bold 92px 'Comic Sans MS', 'Trebuchet MS', sans-serif";
  ctx.textAlign = "left"; ctx.textBaseline = "middle";
  const total = ctx.measureText(text).width;
  let x = W/2 - total/2;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    ctx.save();
    const bob = Math.sin(t * 3 + i * 0.5) * 6;
    ctx.fillStyle = cols[i % cols.length];
    ctx.shadowColor = "rgba(0,0,0,0.4)"; ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 3; ctx.shadowOffsetY = 4;
    ctx.fillText(ch, x, y + bob);
    ctx.restore();
    x += ctx.measureText(ch).width;
  }
  ctx.restore();
}

function drawTitle() {
  menuScrim();
  logo(H * 0.34);
  centerText("Ride your dreams. Color everything.", H * 0.48, 26, "rgba(255,255,255,0.85)");
  const pulse = 0.6 + 0.4 * Math.sin(t * 4);
  ctx.globalAlpha = pulse;
  centerText("Press SPACE / Tap to start", H * 0.66, 30, "#ffe066");
  ctx.globalAlpha = 1;
  centerText("↑/Space jump (x2)   •   Shift/X dash", H * 0.75, 20, "rgba(255,255,255,0.6)");
}

function drawSelect() {
  menuScrim();
  centerText("CHOOSE YOUR RIDE", H * 0.055, 32, "#fff");
  drawBankPill();

  uiHits.swatches.length = 0;
  uiHits.chips.length = 0;
  uiHits.maps.length = 0;
  uiHits.charUnlock = null;

  // UPGRADES button (top-left)
  const ub = { x: 24, y: 20, w: 172, h: 40 };
  ctx.save();
  ctx.fillStyle = "rgba(125,200,255,0.16)"; ctx.strokeStyle = "#5bc8ff"; ctx.lineWidth = 2.5;
  roundRect(ub.x, ub.y, ub.w, ub.h, 20, true); ctx.stroke();
  ctx.fillStyle = "#dff2ff"; ctx.font = "bold 18px Trebuchet MS, sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("⬆ UPGRADES", ub.x + ub.w / 2, ub.y + ub.h / 2 + 1);
  ctx.restore();
  uiHits.toUpgrades = ub;

  drawCharacterCard();
  drawMapRow();
  drawTrailPickers();

  const char = RIDES[selRide], map = MAPS[selMap];
  const ready = isUnlocked("char:" + char.id, char.cost) && mapUnlocked(map);
  const pulse = 0.6 + 0.4 * Math.sin(t * 4);
  ctx.globalAlpha = ready ? pulse : 0.9;
  centerText(ready ? "Press SPACE / Tap to RIDE!" : "🔒  Unlock this character & map to ride",
    H * 0.945, ready ? 26 : 21, ready ? "#7dff9b" : "rgba(255,255,255,0.7)");
  ctx.globalAlpha = 1;
}

function drawBankPill() {
  ctx.save();
  ctx.textAlign = "right"; ctx.textBaseline = "top";
  ctx.font = "bold 24px Trebuchet MS, sans-serif";
  let col = "#ffe066";
  if (unlockFlash > 0) col = Math.sin(t * 40) > 0 ? "#ff5b6e" : "#ffd7dc";
  else if (unlockPulse > 0) col = "#7dff9b";
  ctx.fillStyle = col; ctx.shadowColor = "rgba(0,0,0,0.6)"; ctx.shadowBlur = 6;
  ctx.fillText(`🌟 ${bank}`, W - 26, 20);
  ctx.font = "bold 12px Trebuchet MS, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.fillText("collect stars to unlock", W - 26, 48);
  ctx.restore();
}

/* ---------- Upgrade tree screen ---------- */
function drawUpgradeTree() {
  menuScrim();
  centerText("UPGRADES", H * 0.07, 34, "#fff");
  centerText("spend banked stars on permanent boosts", H * 0.125, 15, "rgba(255,255,255,0.55)");
  drawBankPill();
  uiHits.upnodes.length = 0;

  const N = UPGRADES.length;
  const nodeW = N > 4 ? 206 : 220, nodeH = 104, spacing = 150, top = 214;
  const colGap = Math.min(300, (W - nodeW - 40) / (N - 1));
  for (let c = 0; c < N; c++) {
    const cat = UPGRADES[c];
    const cxs = W / 2 + (c - (N - 1) / 2) * colGap;
    ctx.save();
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = "30px system-ui, sans-serif"; ctx.fillText(cat.icon, cxs, 118);
    ctx.font = "bold 20px Trebuchet MS, sans-serif"; ctx.fillStyle = "#fff";
    ctx.fillText(cat.name.toUpperCase(), cxs, 148);
    ctx.restore();

    for (let n = 0; n < cat.nodes.length; n++) {
      const node = cat.nodes[n];
      const y = top + n * spacing;
      const owned = upgrades.has(node.id);
      const available = (n === 0 || upgrades.has(cat.nodes[n - 1].id)) && !owned;

      if (n > 0) { // connector to the node above
        ctx.strokeStyle = owned ? "#7dff9b" : "rgba(255,255,255,0.22)";
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(cxs, y - spacing + nodeH / 2); ctx.lineTo(cxs, y - nodeH / 2); ctx.stroke();
      }

      const nx = cxs - nodeW / 2, ny = y - nodeH / 2;
      ctx.save();
      let border, fill;
      if (owned) { border = "#7dff9b"; fill = "rgba(125,255,155,0.18)"; }
      else if (available) { border = "#ffe066"; fill = "rgba(255,224,102,0.12)"; }
      else { border = "rgba(255,255,255,0.2)"; fill = "rgba(255,255,255,0.05)"; }
      ctx.fillStyle = fill; ctx.strokeStyle = border; ctx.lineWidth = available ? 3 : 2;
      if (available) { ctx.shadowColor = "#ffe066"; ctx.shadowBlur = 10 + 6 * Math.sin(t * 4); }
      roundRect(nx, ny, nodeW, nodeH, 14, true); ctx.shadowBlur = 0; ctx.stroke();

      ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
      ctx.fillStyle = owned ? "#eafff0" : available ? "#fff" : "rgba(255,255,255,0.5)";
      ctx.font = "bold 18px Trebuchet MS, sans-serif";
      ctx.fillText(node.name, cxs, ny + 30);
      ctx.font = "13px Trebuchet MS, sans-serif";
      ctx.fillStyle = owned ? "rgba(255,255,255,0.7)" : available ? "rgba(255,255,255,0.78)" : "rgba(255,255,255,0.4)";
      ctx.fillText(node.desc, cxs, ny + 52);
      ctx.font = "bold 15px Trebuchet MS, sans-serif";
      if (owned) { ctx.fillStyle = "#7dff9b"; ctx.fillText("✓ OWNED", cxs, ny + 82); }
      else if (available) { ctx.fillStyle = bank >= node.cost ? "#ffe066" : "#ff8a94"; ctx.fillText(`${node.cost} 🌟`, cxs, ny + 84); }
      else { ctx.fillStyle = "rgba(255,255,255,0.4)"; ctx.fillText(`🔒 ${node.cost} 🌟`, cxs, ny + 84); }
      ctx.restore();

      uiHits.upnodes.push({ x: nx, y: ny, w: nodeW, h: nodeH, node, available });
    }
  }

  const bw = 200, bh = 44, back = { x: W / 2 - bw / 2, y: H * 0.9, w: bw, h: bh };
  ctx.save();
  ctx.fillStyle = "rgba(255,91,208,0.16)"; ctx.strokeStyle = "#ff5bd0"; ctx.lineWidth = 2.5;
  roundRect(back.x, back.y, back.w, back.h, 22, true); ctx.stroke();
  ctx.fillStyle = "#fff"; ctx.font = "bold 20px Trebuchet MS, sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("← BACK", W / 2, back.y + bh / 2 + 1);
  ctx.restore();
  uiHits.upBack = back;
}

function drawCharacterCard() {
  const char = RIDES[selRide];
  const cx = W / 2, cy = H * 0.28, w = 560, h = 226;
  const x = cx - w / 2, y = cy - h / 2;
  const locked = !isUnlocked("char:" + char.id, char.cost);

  ctx.save();
  ctx.fillStyle = "rgba(255,91,208,0.14)";
  ctx.strokeStyle = locked ? "rgba(255,255,255,0.35)" : "#ff5bd0";
  ctx.lineWidth = 5;
  roundRect(x, y, w, h, 24, true);
  ctx.stroke();
  ctx.restore();

  // trail preview behind the bike (unlocked only)
  if (!locked) {
    const baseY = cy + h * 0.12, samp = [], nS = 26, headX = cx + 6, tailX = x + 44;
    for (let i = 0; i < nS; i++) {
      const f = i / (nS - 1);
      samp.push({ x: tailX + (headX - tailX) * f, y: baseY + Math.sin(f * 6 + t * 3) * 9 });
    }
    drawTrail(samp);
  }

  const p = img(char.preview);
  if (p && p.width) {
    const boxTop = y + 24, boxBot = y + h - 50, boxW = w - 150, boxH = boxBot - boxTop;
    const s = Math.min(boxW / p.width, boxH / p.height), iw = p.width * s, ih = p.height * s;
    const bob = Math.sin(t * 2.5) * 5;
    ctx.save();
    if (locked) ctx.globalAlpha = 0.3;
    ctx.drawImage(p, cx - iw / 2, boxTop + (boxH - ih) / 2 + bob, iw, ih);
    ctx.restore();
  }
  if (!locked) { ctx.fillStyle = "#fff"; centerAt(char.name, cx, y + h - 30, 26); }

  if (RIDES.length > 1) { drawChevron(x - 38, cy, -1); drawChevron(x + w + 38, cy, 1); }

  if (locked) {
    centerText("🔒", cy - 34, 46, "rgba(255,255,255,0.9)");
    const afford = bank >= char.cost;
    const bw = 240, bh = 44, bx = cx - bw / 2, by = cy + 12;
    ctx.save();
    ctx.fillStyle = afford ? "rgba(125,255,155,0.22)" : "rgba(255,90,110,0.16)";
    ctx.strokeStyle = afford ? "#7dff9b" : "#ff5b6e";
    ctx.lineWidth = 2.5;
    roundRect(bx, by, bw, bh, bh / 2, true); ctx.stroke();
    ctx.fillStyle = afford ? "#eafff0" : "#ffd7dc";
    ctx.font = "bold 19px Trebuchet MS, sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(`UNLOCK   ${char.cost} 🌟`, cx, by + bh / 2 + 1);
    ctx.restore();
    uiHits.charUnlock = { x: bx, y: by, w: bw, h: bh, key: "char:" + char.id, cost: char.cost };
  }
}

function drawMapRow() {
  centerText("MAP", H * 0.475, 16, "rgba(255,255,255,0.8)");
  const cardW = 152, cardH = 62, gap = 20, y = H * 0.495;
  const total = MAPS.length * cardW + (MAPS.length - 1) * gap;
  const x0 = W / 2 - total / 2;
  for (let i = 0; i < MAPS.length; i++) {
    const m = MAPS[i], x = x0 + i * (cardW + gap);
    const locked = !mapUnlocked(m);
    const on = i === selMap;

    ctx.save();
    roundRect(x, y, cardW, cardH, 10, false); ctx.clip();
    const thumb = img(m.bg[0].url); // sky = full opaque scene
    if (thumb && thumb.width) {
      const s = Math.max(cardW / thumb.width, cardH / thumb.height);
      const iw = thumb.width * s, ih = thumb.height * s;
      ctx.globalAlpha = locked ? 0.4 : 1;
      ctx.drawImage(thumb, x + (cardW - iw) / 2, y + (cardH - ih) / 2, iw, ih);
    } else {
      ctx.fillStyle = "#223"; ctx.fillRect(x, y, cardW, cardH);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(10,4,30,0.6)"; ctx.fillRect(x, y + cardH - 20, cardW, 20);
    ctx.fillStyle = on ? "#ffe066" : "#fff";
    ctx.font = "bold 13px Trebuchet MS, sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const lockLabel = m.req ? `${m.name}  ${m.reqText}` : `${m.name}  🔒${m.cost}`;
    ctx.fillText(locked ? lockLabel : m.name, x + cardW / 2, y + cardH - 10);
    ctx.restore();

    ctx.lineWidth = on ? 4 : 2;
    ctx.strokeStyle = on ? "#ffe066" : "rgba(255,255,255,0.35)";
    roundRect(x, y, cardW, cardH, 10, false); ctx.stroke();

    uiHits.maps.push({ x, y, w: cardW, h: cardH, i, locked, key: "map:" + m.id, cost: m.cost });
  }
}

// Trail color swatches + style chips (with lock badges), records hit-boxes.
function drawTrailPickers() {
  // ---- colors ----
  centerText("TRAIL COLOR", H * 0.61, 16, "rgba(255,255,255,0.8)");
  const sy = H * 0.65, sr = 16, sgap = 62;
  const sStart = W / 2 - (TRAIL_COLORS.length - 1) * sgap / 2;
  for (let i = 0; i < TRAIL_COLORS.length; i++) {
    const cxs = sStart + i * sgap;
    const on = i === selTrailColor;
    const locked = !isUnlocked("tc:" + i, TRAIL_COLORS[i].cost);
    ctx.save();
    ctx.beginPath(); ctx.arc(cxs, sy, sr + (on ? 5 : 0), 0, Math.PI * 2);
    ctx.fillStyle = TRAIL_COLORS[i].css;
    ctx.globalAlpha = locked ? 0.4 : 1;
    ctx.shadowColor = TRAIL_COLORS[i].css; ctx.shadowBlur = on ? 18 : 8;
    ctx.fill();
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    ctx.lineWidth = on ? 4 : 2;
    ctx.strokeStyle = on ? "#fff" : "rgba(255,255,255,0.4)";
    ctx.stroke();
    if (locked) { ctx.font = "13px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("🔒", cxs, sy); }
    ctx.restore();
    uiHits.swatches.push({ x: cxs, y: sy, r: sr + 8, i, locked, key: "tc:" + i, cost: TRAIL_COLORS[i].cost });
  }

  // ---- styles ----
  centerText("TRAIL STYLE", H * 0.71, 16, "rgba(255,255,255,0.8)");
  const chipY = H * 0.745, chipH = 38, pad = 16, gap = 11;
  ctx.font = "bold 17px Trebuchet MS, sans-serif";
  const widths = TRAIL_DESIGNS.map(d => ctx.measureText(d.name).width + pad * 2 + (isUnlocked("ts:" + TRAIL_DESIGNS.indexOf(d), d.cost) ? 0 : 22));
  const totalW = widths.reduce((a, b) => a + b, 0) + gap * (TRAIL_DESIGNS.length - 1);
  let cxp = W / 2 - totalW / 2;
  for (let i = 0; i < TRAIL_DESIGNS.length; i++) {
    const cw = widths[i], on = i === selTrailDesign;
    const locked = !isUnlocked("ts:" + i, TRAIL_DESIGNS[i].cost);
    ctx.save();
    ctx.fillStyle = on ? "rgba(125,255,155,0.22)" : "rgba(255,255,255,0.06)";
    ctx.strokeStyle = on ? "#7dff9b" : "rgba(255,255,255,0.25)";
    ctx.lineWidth = on ? 3 : 1.5;
    roundRect(cxp, chipY, cw, chipH, chipH / 2, true); ctx.stroke();
    ctx.fillStyle = locked ? "rgba(255,255,255,0.55)" : (on ? "#eafff0" : "rgba(255,255,255,0.8)");
    ctx.font = "bold 17px Trebuchet MS, sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const label = locked ? `${TRAIL_DESIGNS[i].name} 🔒${TRAIL_DESIGNS[i].cost}` : TRAIL_DESIGNS[i].name;
    ctx.fillText(label, cxp + cw / 2, chipY + chipH / 2 + 1);
    ctx.restore();
    uiHits.chips.push({ x: cxp, y: chipY, w: cw, h: chipH, i, locked, key: "ts:" + i, cost: TRAIL_DESIGNS[i].cost });
    cxp += cw + gap;
  }

  const hint = "←/→ character   ↑/↓ style   C = color   ·  tap locked items to unlock";
  centerText(hint, H * 0.83, 14, "rgba(255,255,255,0.5)");
}

function drawChevron(cx, cy, dir) {
  ctx.save();
  ctx.strokeStyle = "#ff5bd0";
  ctx.lineWidth = 8;
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  const s = 18, bob = Math.sin(t * 4) * 3 * dir;
  ctx.beginPath();
  ctx.moveTo(cx + s * dir + bob, cy - s);
  ctx.lineTo(cx - s * dir + bob, cy);
  ctx.lineTo(cx + s * dir + bob, cy + s);
  ctx.stroke();
  ctx.restore();
}

function drawDead() {
  ctx.fillStyle = "rgba(20,0,40,0.55)";
  ctx.fillRect(0, 0, W, H);
  centerText("CRASH!", H * 0.30, 74, "#ff5bd0");
  centerText(`Score  ${Math.floor(score)}`, H * 0.45, 44, "#fff");
  centerText(`Best  ${best}`, H * 0.535, 24, "#ffe066");
  centerText(`🌟 ${runStars} collected   ·   bank ${bank}`, H * 0.60, 22, "#ffe066");
  const pulse = 0.6 + 0.4 * Math.sin(t * 4);
  ctx.globalAlpha = pulse;
  centerText("Press SPACE / Tap to ride again", H * 0.70, 28, "#7dff9b");
  ctx.globalAlpha = 1;

  // tappable back button (mobile has no Esc)
  const bw = 320, bh = 50, back = { x: W / 2 - bw / 2, y: H * 0.80, w: bw, h: bh };
  ctx.save();
  ctx.fillStyle = "rgba(255,91,208,0.18)"; ctx.strokeStyle = "#ff5bd0"; ctx.lineWidth = 2.5;
  roundRect(back.x, back.y, back.w, back.h, 25, true); ctx.stroke();
  ctx.fillStyle = "#fff"; ctx.font = "bold 20px Trebuchet MS, sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("‹ CHANGE CHARACTER / MAP", W / 2, back.y + bh / 2 + 1);
  ctx.restore();
  uiHits.deadBack = back;
}

/* ---- text helpers ---- */
function centerText(str, y, size, color) {
  ctx.save();
  ctx.font = `bold ${size}px Trebuchet MS, sans-serif`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0,0,0,0.85)"; ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = color;
  ctx.fillText(str, W/2, y);
  ctx.restore();
}

// soft dark scrim so menu text stays readable over the busy scene
function menuScrim() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "rgba(10,2,30,0.30)");
  g.addColorStop(0.5, "rgba(10,2,30,0.45)");
  g.addColorStop(1, "rgba(10,2,30,0.30)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}
function centerAt(str, x, y, size) {
  ctx.save();
  ctx.font = `bold ${size}px Trebuchet MS, sans-serif`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(str, x, y);
  ctx.restore();
}
function roundRect(x, y, w, h, r, fill) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  if (fill) ctx.fill();
}

/* ---------- Main loop ---------- */
let last = performance.now();
function loop(now) {
  let dt = (now - last) / 1000;
  last = now;
  dt = Math.min(dt, 0.05); // clamp big frame gaps
  if (menuCd > 0) menuCd -= dt;
  if (unlockFlash > 0) unlockFlash -= dt;
  if (unlockPulse > 0) unlockPulse -= dt;

  if (state === STATE.LOADING && assetsLoaded >= assetTotal) {
    state = STATE.TITLE;
  }

  update(dt);
  render(dt);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
