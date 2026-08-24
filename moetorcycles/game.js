/* ============================================================
   MOEtorcycles — a Robot Unicorn Attack style endless runner
   Base build. Backgrounds are placeholder (real art coming later).
   ============================================================ */

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const W = canvas.width;   // 1280
const H = canvas.height;  // 720

/* ---------- Roster ----------
   One RIDE = one character already on a bike (a fixed combo).
   Each ride supplies single-frame sprites (character-on-bike) per pose.
   `preview` is the image shown on the select screen.
   To add a ride: drop its frame PNGs in assets/ and add an entry here. */
const RIDES = [
  {
    id: "crayons",
    name: "Crayons",
    tagline: "Ride your dreams. Color everything.",
    frames: {
      ride:    "assets/player_crayons_ride.png",     // single cruise frame (+ bob)
      wheelie: "assets/player_crayons_wheelie.png",  // rising / takeoff
      air:     "assets/player_crayons_air.png",      // falling
      land:    "assets/player_crayons_land.png",
      crash:   "assets/player_crayons_crash.png",
    },
    preview: "assets/player_crayons_ride.png",
  },
];

/* ---------- Parallax background layers ----------
   Each layer is scaled to canvas height and tiled horizontally. `speed` is the
   parallax factor vs world scroll (far = slow, near = fast). */
const BG_LAYERS = [
  { url: "assets/bg/bg_sky.png",  speed: 0.06 },
  { url: "assets/bg/bg_far.png",  speed: 0.20 },
  { url: "assets/bg/bg_mid.png",  speed: 0.45 },
  { url: "assets/bg/bg_near.png", speed: 0.80 },
];
// Optional dusk tint to unify the bright day sky with the neon night layers.
// 0 = show the sky art as-is; raise toward 1 to darken into dusk/night.
let SKY_TINT = 0.0;

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
  for (const L of BG_LAYERS) urls.add(L.url);
  assetTotal = urls.size;
  urls.forEach(loadImg);
})();

/* ---------- Game state machine ---------- */
const STATE = { LOADING: "loading", TITLE: "title", SELECT: "select", PLAY: "play", DEAD: "dead" };
let state = STATE.LOADING;

let selRide = 0; // index into RIDES

/* ---------- Tron-style trail options ---------- */
const TRAIL_COLORS = [
  { name: "Pink",   css: "#ff5bd0" },
  { name: "Cyan",   css: "#5bc8ff" },
  { name: "Yellow", css: "#ffe066" },
  { name: "Green",  css: "#7dff9b" },
  { name: "Purple", css: "#c78bff" },
  { name: "White",  css: "#ffffff" },
];
const TRAIL_DESIGNS = [
  { id: "line",    name: "Neon Line" },
  { id: "ribbon",  name: "Ribbon" },
  { id: "rainbow", name: "Rainbow" },  // ignores color, cycles hue
  { id: "dashed",  name: "Dashed" },
  { id: "bubbles", name: "Bubbles" },
  { id: "stars",   name: "Star Trail" },
];
let selTrailColor  = clampIdx(+localStorage.getItem("moetorcycles_trail_color"),  TRAIL_COLORS.length);
let selTrailDesign = clampIdx(+localStorage.getItem("moetorcycles_trail_design"), TRAIL_DESIGNS.length);
function clampIdx(v, n) { return Number.isFinite(v) && v >= 0 && v < n ? v : 0; }
function saveTrail() {
  localStorage.setItem("moetorcycles_trail_color", selTrailColor);
  localStorage.setItem("moetorcycles_trail_design", selTrailDesign);
}
// clickable regions on the select screen, refreshed each frame it's drawn
const uiHits = { swatches: [], chips: [] };

let best = Number(localStorage.getItem("moetorcycles_best") || 0);
let menuCd = 0; // debounce so one tap/press can't skip a whole screen

/* ---------- Input ---------- */
const keys = {};
let jumpQueued = false;
let dashQueued = false;
let anyPressQueued = false;

window.addEventListener("keydown", (e) => {
  if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Space"].includes(e.code)) e.preventDefault();
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
  const x = (e.clientX - r.left) / r.width;
  anyPressQueued = true;
  if (state === STATE.PLAY) {
    if (x > 0.62) dashQueued = true; else jumpQueued = true;
  } else {
    pointerMenu(e, r);
  }
});

function handleMenuKey(code) {
  if (state === STATE.TITLE) {
    if ((code === "Space" || code === "Enter") && menuCd <= 0) { state = STATE.SELECT; menuCd = 0.3; }
  } else if (state === STATE.SELECT) {
    if (code === "ArrowLeft")  { selTrailColor = (selTrailColor - 1 + TRAIL_COLORS.length) % TRAIL_COLORS.length; saveTrail(); }
    else if (code === "ArrowRight") { selTrailColor = (selTrailColor + 1) % TRAIL_COLORS.length; saveTrail(); }
    else if (code === "ArrowUp")   { selTrailDesign = (selTrailDesign - 1 + TRAIL_DESIGNS.length) % TRAIL_DESIGNS.length; saveTrail(); }
    else if (code === "ArrowDown") { selTrailDesign = (selTrailDesign + 1) % TRAIL_DESIGNS.length; saveTrail(); }
    else if (code === "BracketLeft")  selRide = (selRide - 1 + RIDES.length) % RIDES.length;
    else if (code === "BracketRight") selRide = (selRide + 1) % RIDES.length;
    else if ((code === "Space" || code === "Enter") && menuCd <= 0) {
      startGame();
    }
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
    // swatches
    for (const s of uiHits.swatches) {
      if (Math.hypot(mx - s.x, my - s.y) <= s.r) { selTrailColor = s.i; saveTrail(); menuCd = 0.15; return; }
    }
    // design chips
    for (const c of uiHits.chips) {
      if (mx >= c.x && mx <= c.x + c.w && my >= c.y && my <= c.y + c.h) { selTrailDesign = c.i; saveTrail(); menuCd = 0.15; return; }
    }
    // ride chevrons at the far edges
    const fx = mx / W;
    if (RIDES.length > 1 && fx < 0.12) { selRide = (selRide - 1 + RIDES.length) % RIDES.length; menuCd = 0.2; return; }
    if (RIDES.length > 1 && fx > 0.88) { selRide = (selRide + 1) % RIDES.length; menuCd = 0.2; return; }
    // only start when the ride card or the bottom "RIDE!" prompt is tapped,
    // so a near-miss on the pickers doesn't launch a run
    const inCard = my > H * 0.18 && my < H * 0.49 && mx > W * 0.22 && mx < W * 0.78;
    if (inCard || my > H * 0.90) startGame();
  }
  else if (state === STATE.DEAD) startGame();
}

/* ---------- World / player ---------- */
const GROUND_MARGIN = 120;      // default surface distance from bottom
const GRAVITY = 2600;           // px/s^2
const JUMP_V = -1020;           // initial jump velocity
const JUMP_CUT = 0.45;          // release-to-cut multiplier
const MAX_FALL = 1900;
const PLAYER_H = 150;           // drawn height
const PLAYER_X = W * 0.26;      // fixed screen x of player center

let player, world, particles, stars, obstacles, score, speed, distance, animT, screenShake, deathTimer, trail;

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
  score = 0;
  distance = 0;
  speed = 560;
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
    // decide: platform or gap
    const gap = Math.random() < 0.42 ? rand(120, 260) : 0;
    world.nextX += gap;

    const w = rand(260, 620);
    // vary surface height, clamped to a playable band
    let top = lastTop + rand(-120, 120);
    top = clamp(top, H - GROUND_MARGIN - 230, H - GROUND_MARGIN + 60);
    const seg = { x: world.nextX, w, top };
    world.segs.push(seg);
    lastTop = top;

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
  obstacles = obstacles.filter((o) => o.x > distance - 200);
}

function startGame() {
  resetRun();
  state = STATE.PLAY;
  menuCd = 0.25;
  jumpQueued = false;
  dashQueued = false;
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
  speed += dt * 9;                 // gradual ramp
  const dx = speed * (player.dashT > 0 ? 1.9 : 1) * dt;
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
    for (let i = 0; i < 14; i++) spawnSpark(PLAYER_X - 30, player.y + PLAYER_H * 0.6);
  }
  // jump input (double jump)
  if (jumpQueued) {
    if (player.onGround || player.jumps < 2) {
      player.vy = JUMP_V;
      player.jumps++;
      player.onGround = false;
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

  // stars
  for (const s of stars) {
    if (s.got) continue;
    s.spin += dt * 8;
    const sx = s.x - distance;
    if (Math.abs(sx - PLAYER_X) < 55 && Math.abs(s.y - (player.y + PLAYER_H * 0.5)) < 70) {
      s.got = true;
      score += 25;
      for (let i = 0; i < 8; i++) spawnSpark(PLAYER_X, player.y + PLAYER_H * 0.4, "#ffe066");
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
  // sky (opaque) — gradient fallback until the art loads
  if (!drawTiledLayer(BG_LAYERS[0].url, BG_LAYERS[0].speed)) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#2a0a52");
    g.addColorStop(1, "#12042e");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  // optional dusk tint to unify the bright sky with the neon night layers
  if (SKY_TINT > 0) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, `rgba(18,4,48,${0.8 * SKY_TINT})`);
    g.addColorStop(1, `rgba(44,12,74,${0.4 * SKY_TINT})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  // parallax layers, far -> near
  for (let i = 1; i < BG_LAYERS.length; i++) drawTiledLayer(BG_LAYERS[i].url, BG_LAYERS[i].speed);
}

function drawWorld() {
  for (const s of world.segs) {
    const x = s.x - distance;
    if (x > W || x + s.w < 0) continue;
    drawRoad(x, s.top, s.w, s.x);
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

// Fraction of the (shared-crop) sprite height at which the tyres contact ground.
const WHEEL_FRAC = 0.935;
const SPRITE_H = PLAYER_H * 1.36;

function drawPlayer() {
  const f = RIDES[selRide].frames;
  let url, bob = 0;
  if (!player.alive) url = f.crash;
  else if (!player.onGround) url = player.vy < 0 ? f.wheelie : f.air; // rising vs falling
  else if (player.landT > 0) url = f.land;
  else { url = f.ride; bob = Math.sin(t * 9) * 2.5; } // subtle engine-idle bob
  const sprite = img(url);
  if (!sprite || !sprite.width) return;

  const h = SPRITE_H;
  const w = h * (sprite.width / sprite.height);
  const dx = -w / 2, dy = -WHEEL_FRAC * h + bob; // anchor tyres at the pivot

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

  // dash cooldown pip
  ctx.textAlign = "right";
  ctx.fillStyle = player.dashCd <= 0 ? "#5bff9b" : "rgba(255,255,255,0.35)";
  ctx.fillText(player.dashCd <= 0 ? "DASH READY" : "dash…", W - 28, 26);
  ctx.restore();
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
  centerText("CHOOSE YOUR RIDE", H * 0.075, 36, "#fff");

  const ride = RIDES[selRide];
  const cx = W / 2, cy = H * 0.33;
  const w = 700, h = 300;
  const x = cx - w/2, y = cy - h/2;

  // card
  ctx.save();
  ctx.fillStyle = "rgba(255,91,208,0.14)";
  ctx.strokeStyle = "#ff5bd0";
  ctx.lineWidth = 5;
  roundRect(x, y, w, h, 26, true);
  ctx.stroke();
  ctx.restore();

  // live trail preview: a wavy sample behind the bike using the current choice
  const bikeBaseY = cy + h * 0.14;
  const samp = [];
  const nS = 30, headX = cx + 6, tailX = x + 48;
  for (let i = 0; i < nS; i++) {
    const f = i / (nS - 1);
    samp.push({ x: tailX + (headX - tailX) * f, y: bikeBaseY + Math.sin(f * 6 + t * 3) * 10 });
  }
  drawTrail(samp);

  // character-on-bike preview, contain-fit inside the card
  const p = img(ride.preview);
  if (p && p.width) {
    const boxTop = y + 30, boxBot = y + h - 74;
    const boxW = w - 140, boxH = boxBot - boxTop;
    const scale = Math.min(boxW / p.width, boxH / p.height);
    const iw = p.width * scale, ih = p.height * scale;
    const bob = Math.sin(t * 2.5) * 6;
    ctx.drawImage(p, cx - iw/2, boxTop + (boxH - ih)/2 + bob, iw, ih);
  }
  ctx.fillStyle = "#fff";
  centerAt(ride.name, cx, y + h - 44, 30);

  if (RIDES.length > 1) {
    drawChevron(x - 40, cy, -1);
    drawChevron(x + w + 40, cy, 1);
  }

  drawTrailPickers();

  const pulse = 0.6 + 0.4 * Math.sin(t * 4);
  ctx.globalAlpha = pulse;
  centerText("Press SPACE / Tap to RIDE!", H * 0.95, 28, "#7dff9b");
  ctx.globalAlpha = 1;
}

// Trail color swatches + design chips, and records their hit-boxes for clicks.
function drawTrailPickers() {
  uiHits.swatches.length = 0;
  uiHits.chips.length = 0;

  // ---- colors ----
  centerText("TRAIL COLOR", H * 0.60, 18, "rgba(255,255,255,0.8)");
  const sy = H * 0.655, sr = 17, sgap = 62;
  const sStart = W/2 - (TRAIL_COLORS.length - 1) * sgap / 2;
  for (let i = 0; i < TRAIL_COLORS.length; i++) {
    const cxs = sStart + i * sgap;
    const on = i === selTrailColor;
    ctx.save();
    ctx.beginPath(); ctx.arc(cxs, sy, sr + (on ? 5 : 0), 0, Math.PI * 2);
    ctx.fillStyle = TRAIL_COLORS[i].css;
    ctx.shadowColor = TRAIL_COLORS[i].css; ctx.shadowBlur = on ? 18 : 8;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = on ? 4 : 2;
    ctx.strokeStyle = on ? "#fff" : "rgba(255,255,255,0.4)";
    ctx.stroke();
    ctx.restore();
    uiHits.swatches.push({ x: cxs, y: sy, r: sr + 8, i });
  }

  // ---- designs ----
  centerText("TRAIL STYLE", H * 0.735, 18, "rgba(255,255,255,0.8)");
  const chipY = H * 0.775, chipH = 40, pad = 18, gap = 12;
  ctx.font = "bold 18px Trebuchet MS, sans-serif";
  const widths = TRAIL_DESIGNS.map(d => ctx.measureText(d.name).width + pad * 2);
  const totalW = widths.reduce((a, b) => a + b, 0) + gap * (TRAIL_DESIGNS.length - 1);
  let cxp = W/2 - totalW / 2;
  for (let i = 0; i < TRAIL_DESIGNS.length; i++) {
    const cw = widths[i], on = i === selTrailDesign;
    ctx.save();
    ctx.fillStyle = on ? "rgba(125,255,155,0.22)" : "rgba(255,255,255,0.06)";
    ctx.strokeStyle = on ? "#7dff9b" : "rgba(255,255,255,0.25)";
    ctx.lineWidth = on ? 3 : 1.5;
    roundRect(cxp, chipY, cw, chipH, chipH/2, true);
    ctx.stroke();
    ctx.fillStyle = on ? "#eafff0" : "rgba(255,255,255,0.75)";
    ctx.font = "bold 18px Trebuchet MS, sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(TRAIL_DESIGNS[i].name, cxp + cw/2, chipY + chipH/2 + 1);
    ctx.restore();
    uiHits.chips.push({ x: cxp, y: chipY, w: cw, h: chipH, i });
    cxp += cw + gap;
  }

  centerText("←/→ color    ↑/↓ style", H * 0.855, 15, "rgba(255,255,255,0.5)");
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
  centerText("CRASH!", H * 0.32, 74, "#ff5bd0");
  centerText(`Score  ${Math.floor(score)}`, H * 0.48, 44, "#fff");
  centerText(`Best  ${best}`, H * 0.57, 26, "#ffe066");
  const pulse = 0.6 + 0.4 * Math.sin(t * 4);
  ctx.globalAlpha = pulse;
  centerText("Press SPACE / Tap to ride again", H * 0.72, 28, "#7dff9b");
  ctx.globalAlpha = 1;
  centerText("Esc — change rider", H * 0.8, 18, "rgba(255,255,255,0.55)");
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

  if (state === STATE.LOADING && assetsLoaded >= assetTotal) {
    state = STATE.TITLE;
  }

  update(dt);
  render(dt);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
