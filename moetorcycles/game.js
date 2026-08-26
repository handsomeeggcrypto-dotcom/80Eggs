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
];

/* ---------- Maps (selectable independently of the character) ---------- */
const MAPS = [
  { id: "crayons", name: "Neon City",   cost: 0,   bg: bgSet("crayons") },
  { id: "eggs",    name: "Countryside", cost: 100, bg: bgSet("eggs") },
];

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
  assetTotal = urls.size;
  urls.forEach(loadImg);
})();

/* ---------- Game state machine ---------- */
const STATE = { LOADING: "loading", TITLE: "title", SELECT: "select", PLAY: "play", DEAD: "dead" };
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
];
const TRAIL_DESIGNS = [
  { id: "line",    name: "Neon Line",  cost: 0 },
  { id: "ribbon",  name: "Ribbon",     cost: 0 },
  { id: "rainbow", name: "Rainbow",    cost: 50 }, // ignores color, cycles hue
  { id: "dashed",  name: "Dashed",     cost: 40 },
  { id: "bubbles", name: "Bubbles",    cost: 40 },
  { id: "stars",   name: "Star Trail", cost: 60 },
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
const uiHits = { swatches: [], chips: [], maps: [], charUnlock: null };

let best = Number(localStorage.getItem("moetorcycles_best") || 0);
let menuCd = 0; // debounce so one tap/press can't skip a whole screen

/* ---------- Input ---------- */
const keys = {};
let jumpQueued = false;
let dashQueued = false;
let anyPressQueued = false;

window.addEventListener("keydown", (e) => {
  if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Space"].includes(e.code)) e.preventDefault();
  Sound.unlock();
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
  // mute button (bottom-right) intercepts in every state
  const mx = (e.clientX - r.left) / r.width * W;
  const my = (e.clientY - r.top) / r.height * H;
  if (Math.hypot(mx - MUTE_BTN.x, my - MUTE_BTN.y) <= MUTE_BTN.r + 6) { Sound.toggleMute(); return; }
  const x = (e.clientX - r.left) / r.width;
  anyPressQueued = true;
  if (state === STATE.PLAY) {
    if (x > 0.62) dashQueued = true; else jumpQueued = true;
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
    else if ((code === "Space" || code === "Enter") && menuCd <= 0) attemptStart();
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
        if (tryUnlock(m.key, m.cost)) { selMap = m.i; Sound.ui(); }
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
  else if (state === STATE.DEAD) startGame();
}

/* ---------- World / player ----------
   Tuned for long, floaty, graceful arcs (Robot Unicorn Attack feel) rather than
   short punchy hops. Low gravity + soft launch = ~1.5s of hang time and a wide
   ~260px arc; a single jump carries the rider a long, relaxing distance. */
const GROUND_MARGIN = 120;      // default surface distance from bottom
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

let player, world, particles, stars, obstacles, rings, score, speed, distance, animT, screenShake, deathTimer, trail;
let combo, comboTimer, runStars;
const COMBO_WINDOW = 2.6;           // seconds to keep the chain alive
const comboMult = () => Math.min(1 + Math.floor(combo / 5), 8); // x1..x8

function resetRun() {
  player = {
    y: H - GROUND_MARGIN - PLAYER_H,
    vy: 0,
    onGround: true,
    jumps: 0,
    dashT: 0,          // remaining dash time
    dashCd: 0,
    landT: 0,          // landing animation timer
    alive: true,
    tilt: 0,
  };
  world = { segs: [], nextX: 0 };
  particles = [];
  stars = [];
  obstacles = [];
  trail = [];
  rings = [];
  combo = 0; comboTimer = 0; runStars = 0;
  score = 0;
  distance = 0;
  speed = SPEED_START;
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

    // reward the jump: arc a line of gold RINGS over the gap to fly through
    if (gap > 120) {
      const n = randi(3, 5);
      const base = Math.min(prevTop, top);
      const peak = rand(110, 200);
      for (let i = 0; i < n; i++) {
        const tt = (i + 1) / (n + 1);
        const rx = gapStart + tt * gap;
        const ry = base - 60 - Math.sin(tt * Math.PI) * peak;
        rings.push({ x: rx, y: ry, r: 34, got: false, spin: Math.random() * 6 });
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
    // obstacle pillar (dash to smash, or jump over)
    if (gap === 0 && w > 340 && Math.random() < 0.5) {
      const ox = seg.x + rand(w * 0.35, w * 0.7);
      obstacles.push({ x: ox, top: seg.top, h: rand(80, 130), w: 46, dead: false });
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
  if (isUnlocked("char:" + c.id, c.cost) && isUnlocked("map:" + m.id, m.cost)) startGame();
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
  if (state !== STATE.PLAY) {
    if (state === STATE.DEAD) { deathTimer += dt; screenShake *= 0.9; }
    return;
  }

  animT += dt;
  speed = Math.min(speed + dt * SPEED_RAMP, SPEED_MAX); // slow, capped ramp
  const dx = speed * (player.dashT > 0 ? DASH_MULT : 1) * dt;
  distance += dx;
  score += dx * 0.02;

  // timers
  if (player.dashT > 0) player.dashT -= dt;
  if (player.dashCd > 0) player.dashCd -= dt;
  if (player.landT > 0) player.landT -= dt;
  screenShake *= 0.88;

  // dash input
  if (dashQueued && player.dashCd <= 0) {
    player.dashT = 0.42; player.dashCd = 0.9;
    Sound.dash();
    for (let i = 0; i < 14; i++) spawnSpark(PLAYER_X - 30, player.y + PLAYER_H * 0.6);
  }
  // jump input (double jump)
  if (jumpQueued) {
    if (player.onGround || player.jumps < 2) {
      player.vy = JUMP_V;
      player.jumps++;
      player.onGround = false;
      Sound.jump();
      for (let i = 0; i < 8; i++) spawnSpark(PLAYER_X, player.y + PLAYER_H, "#fff");
    }
  }
  // variable jump height: cut when jump released while rising
  const jumpHeld = keys.Space || keys.ArrowUp || keys.KeyW;
  if (!jumpHeld && player.vy < 0) player.vy *= Math.pow(JUMP_CUT, dt * 60);

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
    const sx = s.x - distance;
    if (Math.abs(sx - pcx) < 55 && Math.abs(s.y - pcy) < 70) {
      s.got = true;
      combo++; comboTimer = COMBO_WINDOW;
      score += 25 * comboMult();
      runStars++; addStars(1);
      Sound.star(combo);
      for (let i = 0; i < 8; i++) spawnSpark(PLAYER_X, player.y + PLAYER_H * 0.4, "#ffe066");
    }
  }

  // rings — fly through them (bigger points), build combo faster
  for (const rg of rings) {
    if (rg.got) continue;
    rg.spin += dt * 3;
    const rx = rg.x - distance;
    if (Math.hypot(rx - pcx, rg.y - pcy) < rg.r + 18) {
      rg.got = true;
      combo += 2; comboTimer = COMBO_WINDOW;
      score += 60 * comboMult();
      Sound.star(combo + 6);
      for (let i = 0; i < 14; i++) spawnSpark(rx, rg.y, ["#ffd23f","#fff3b0","#ffe066"][i % 3]);
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
      if (player.dashT > 0) {
        o.dead = true; score += 15; screenShake = 10;
        Sound.smash();
        for (let i = 0; i < 16; i++) spawnSpark(ox, oTop, ["#ff5bd0","#5bc8ff","#ffe066","#7dff9b"][i%4]);
      } else {
        return kill();
      }
    }
  }

  // ambient sparkle trail
  if (Math.random() < 0.6) spawnTrail();

  // particle update
  for (const p of particles) {
    p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt; p.life -= dt;
  }
  particles = particles.filter((p) => p.life > 0);

  jumpQueued = false;
  dashQueued = false;
}

function kill() {
  if (!player.alive) return;
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
  else { drawWorld(); drawTrailInGame(); drawPlayer(); drawParticles(); drawHUD(); if (state === STATE.DEAD) drawDead(); }

  ctx.restore();
  drawMuteButton(); // fixed overlay, unaffected by screen shake
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

// A bold dark road so the bright rider/props pop, with a neon curb and a
// scrolling dashed center line. `worldX` keeps the dashes continuous.
function drawRoad(x, topY, w, worldX) {
  ctx.save();
  // dark outline strip that separates the road from the busy background
  ctx.fillStyle = "rgba(8,3,20,0.55)";
  ctx.fillRect(x - 2, topY - 10, w + 4, 10);

  // road body
  const body = ctx.createLinearGradient(0, topY, 0, H);
  body.addColorStop(0, "#241238");
  body.addColorStop(0.15, "#1a0e2b");
  body.addColorStop(1, "#0c0618");
  ctx.fillStyle = body;
  ctx.fillRect(x, topY, w, H - topY);

  // neon curb band along the driving surface
  const curb = ctx.createLinearGradient(x, 0, x + w, 0);
  curb.addColorStop(0.0, "#ff5bd0");
  curb.addColorStop(0.5, "#c78bff");
  curb.addColorStop(1.0, "#5bc8ff");
  ctx.fillStyle = curb;
  ctx.fillRect(x, topY, w, 9);
  // white highlight line on top of the curb
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.fillRect(x, topY, w, 3);

  // scrolling dashed center line
  const dashY = topY + 34, dashW = 46, gap = 42, period = dashW + gap;
  ctx.fillStyle = "rgba(255,224,102,0.85)";
  let start = worldX - ((worldX % period) + period) % period; // align to world grid
  for (let dx = start; dx < worldX + w + period; dx += period) {
    const sx = dx - worldX + x;
    const clipL = Math.max(sx, x), clipR = Math.min(sx + dashW, x + w);
    if (clipR > clipL) ctx.fillRect(clipL, dashY, clipR - clipL, 5);
  }
  ctx.restore();
}

// RUA-style gold ring you fly through (drawn as a shimmering torus)
function drawRing(x, y, r, rot) {
  ctx.save();
  ctx.translate(x, y);
  const wob = 0.72 + 0.28 * Math.abs(Math.sin(rot)); // fake 3-D spin (squash x)
  ctx.scale(wob, 1);
  ctx.lineJoin = "round"; ctx.lineCap = "round";
  ctx.shadowColor = "#ffd23f"; ctx.shadowBlur = 22;
  // outer dark rim
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.lineWidth = 12; ctx.strokeStyle = "#8a5a00"; ctx.stroke();
  // gold band
  ctx.lineWidth = 8; ctx.strokeStyle = "#ffcf33"; ctx.stroke();
  // bright highlight
  ctx.shadowBlur = 0;
  ctx.lineWidth = 3; ctx.strokeStyle = "rgba(255,255,255,0.85)"; ctx.stroke();
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
function drawObstacle(x, o) {
  const oTop = o.top - o.h;
  ctx.save();
  // pulsing warning glow
  const pulse = 0.5 + 0.5 * Math.sin(t * 8);
  ctx.shadowColor = `rgba(255,60,90,${0.6 + 0.4 * pulse})`;
  ctx.shadowBlur = 22;

  // body with thick black outline
  ctx.fillStyle = "#12030a";
  roundRect(x - 3, oTop - 3, o.w + 6, o.h + 6, 8, true);
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#fff";
  roundRect(x - 3, oTop - 3, o.w + 6, o.h + 6, 8, true); // white halo ring
  ctx.fillStyle = "#160208";
  roundRect(x, oTop, o.w, o.h, 6, true);

  // diagonal hazard stripes clipped to the body
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

  // pointed crayon tip
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

  if (player.dashT > 0) {
    ctx.shadowColor = "#5bc8ff"; ctx.shadowBlur = 40;
    ctx.globalAlpha = 0.6;
    ctx.drawImage(sprite, dx - 30, dy, w, h);
    ctx.globalAlpha = 1;
  }
  ctx.drawImage(sprite, dx, dy, w, h);
  ctx.restore();
}

function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = clamp(p.life * 2, 0, 1);
    ctx.fillStyle = p.color;
    if (p.kind === "trail") {
      ctx.fillRect(p.x, p.y, p.r * 2, p.r);
    } else {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
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

  // dash cooldown pip
  ctx.textAlign = "right";
  ctx.fillStyle = player.dashCd <= 0 ? "#5bff9b" : "rgba(255,255,255,0.35)";
  ctx.fillText(player.dashCd <= 0 ? "DASH READY" : "dash…", W - 28, 26);
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

  drawCharacterCard();
  drawMapRow();
  drawTrailPickers();

  const char = RIDES[selRide], map = MAPS[selMap];
  const ready = isUnlocked("char:" + char.id, char.cost) && isUnlocked("map:" + map.id, map.cost);
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
    const locked = !isUnlocked("map:" + m.id, m.cost);
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
    ctx.fillText(locked ? `${m.name}  🔒${m.cost}` : m.name, x + cardW / 2, y + cardH - 10);
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
  centerText("Press SPACE / Tap to ride again", H * 0.73, 28, "#7dff9b");
  ctx.globalAlpha = 1;
  centerText("Esc — change character / map / unlocks", H * 0.81, 18, "rgba(255,255,255,0.55)");
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
