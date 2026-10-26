/* ============================================================
   MECH BREAK — game.js
   ============================================================
   EDIT GUIDE (search these labels):
   [TIMING]    — cloud interval, mini-game duration
   [SCORING]   — points per ring, combo rules
   [MORALE]    — morale gain/loss values
   [CHARACTER] — drawCharacter(), drawHeartHead(), drawEye()
   [BACKGROUND]— drawBackground(), drawMech(), drawWindow()
   [TABLE]     — drawTable(), drawMug(), drawTablet(), etc.
   [CLOUD]     — Cloud class, cloud speed/inertia
   [RINGS]     — Ring class, ring layout, ring speed
   ============================================================ */

'use strict';

// ── Canvas setup ───────────────────────────────────────────
const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');

// Logical resolution — everything is drawn in these units then scaled
const LW = 1280;
const LH = 720;

// ── Pilot sprite images ────────────────────────────────────
// [CHARACTER] Swap image files here if you regenerate sprites
const pilotSprites = { idle: null, blow: null };
let spritesReady   = false;

function removeWhiteBg(img) {
  // Flood-fill from all edges to erase white background while preserving
  // interior white pixels (eye highlights, etc.)
  const oc  = document.createElement('canvas');
  oc.width  = img.naturalWidth;
  oc.height = img.naturalHeight;
  const ox  = oc.getContext('2d');
  ox.drawImage(img, 0, 0);
  const id   = ox.getImageData(0, 0, oc.width, oc.height);
  const data = id.data;
  const W = oc.width, H = oc.height;
  const visited = new Uint8Array(W * H);

  const isLight = i => data[i] > 210 && data[i+1] > 210 && data[i+2] > 210;

  // Seed queue with all edge pixels
  const queue = [];
  for (let x = 0; x < W; x++) { queue.push(x, 0); queue.push(x, H - 1); }
  for (let y = 1; y < H - 1; y++) { queue.push(0, y); queue.push(W - 1, y); }

  let qi = 0;
  while (qi < queue.length) {
    const x = queue[qi++], y = queue[qi++];
    if (x < 0 || x >= W || y < 0 || y >= H) continue;
    const cell = y * W + x;
    if (visited[cell]) continue;
    visited[cell] = 1;
    const pi = cell * 4;
    if (!isLight(pi)) continue;
    data[pi + 3] = 0; // erase
    queue.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
  }

  ox.putImageData(id, 0, 0);
  return oc;
}

// Background image
let bgImage = null;
const bgImg = new Image();
bgImg.onload = () => { bgImage = bgImg; };
bgImg.src = 'breakroom.png';

function loadSprites() {
  let loaded = 0;
  const check = () => { if (++loaded === 2) spritesReady = true; };
  ['idle', 'blow'].forEach(key => {
    const img = new Image();
    img.onload = () => { pilotSprites[key] = removeWhiteBg(img); check(); };
    img.onerror = () => { console.warn(`pilot-${key}.jpeg not found`); check(); };
    img.src = `pilot-${key}.jpeg`;
  });
}
loadSprites();

function resizeCanvas() {
  canvas.width  = canvas.clientWidth  * (window.devicePixelRatio || 1);
  canvas.height = canvas.clientHeight * (window.devicePixelRatio || 1);
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Helpers: convert logical → canvas pixels
const sx = x  => (x  / LW) * canvas.width;
const sy = y  => (y  / LH) * canvas.height;
const sc = v  => (v  / LW) * canvas.width;   // uniform scale (use width as reference)

// ── [TIMING] ───────────────────────────────────────────────
const CLOUD_MIN      = 4000;   // ms before next cloud (minimum)
const CLOUD_MAX      = 7000;   // ms before next cloud (maximum)
const MG_DURATION    = 20000;  // ms for one mini-game round

// ── [SCORING] ──────────────────────────────────────────────
const SCORE_PER_RING = 500;    // base points per ring hit
const COMBO_MAX      = 20;     // max combo multiplier

// ── [MORALE] ───────────────────────────────────────────────
const MORALE_RING_HIT  =  4;   // morale % gained per ring hit
const MORALE_RING_MISS = -8;   // morale % lost per missed ring
const MORALE_IDLE_RATE =  0.4; // morale % drained per second while idle

// ── [RINGS] ────────────────────────────────────────────────
const RING_COUNT      = 8;     // rings per mini-game
const RING_RADIUS     = 48;    // logical units — hit detection radius
const RING_DRIFT_SPEED = 0.6;  // logical units/frame rings drift left (visual only)

// ── Game states ────────────────────────────────────────────
const S = { START:'start', IDLE:'idle', MINIGAME:'minigame', SUMMARY:'summary' };
let state = S.START;

// ── Game variables ─────────────────────────────────────────
let score       = 0;
let combo       = 1;
let maxCombo    = 1;
let morale      = 100;
let ringsHit    = 0;
let sessions    = 0;
let cloudTimer  = 0;
let nextCloudIn = 0;
let mgTimer     = 0;
let lastTs      = 0;

// [SMOKE] Room smoke buildup — increases each session
// smokeLevel 0→1: room fills with smoke over MAX_SMOKE_SESSIONS sessions
let smokeLevel        = 0;
const MAX_SMOKE_SESSIONS = 3;  // sessions until room is fully smoked out
let roomSmokeParticles = [];   // persistent drifting smoke blobs

// ── Input ──────────────────────────────────────────────────
let mouseX = canvas.width  / 2;
let mouseY = canvas.height / 2;

// ── Scene objects ──────────────────────────────────────────
let cloud        = null;
let rings        = [];
let popups       = [];       // score popup floaters
let rainDrops    = [];
let puffParticles = [];
let blinkLights  = [];
let charBlink    = 0;        // eye blink timer

// ══════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════
function initScene() {
  // Rain drops for the window
  rainDrops = Array.from({ length: 90 }, () => ({
    x:      Math.random() * LW,
    y:      Math.random() * LH,
    speed:  3 + Math.random() * 5,
    len:    12 + Math.random() * 18,
    alpha:  0.06 + Math.random() * 0.18,
  }));

  // Small blinking status lights scattered on left wall
  blinkLights = Array.from({ length: 14 }, () => ({
    x:     30  + Math.random() * 160,
    y:     200 + Math.random() * 370,
    color: Math.random() > 0.5 ? '#ff2d9b' : '#9b2dca',
    rate:  0.6 + Math.random() * 2.5,
    phase: Math.random() * Math.PI * 2,
    r:     1.5 + Math.random() * 2.5,
  }));

  scheduleCloud();
}

function resetGame() {
  score = 0; combo = 1; maxCombo = 1;
  morale = 100; ringsHit = 0; sessions = 0;
  smokeLevel = 0; roomSmokeParticles = [];
  cloud = null; rings = []; popups = []; puffParticles = [];
  state = S.IDLE;
  initScene();
}

// [SMOKE] Called after each session ends — adds a layer of persistent room smoke
function addRoomSmoke() {
  smokeLevel = Math.min(1, sessions / MAX_SMOKE_SESSIONS);

  // Spawn a wave of large drifting smoke blobs spread across the room
  // More blobs and denser each session
  const count = 8 + sessions * 6;
  for (let i = 0; i < count; i++) {
    roomSmokeParticles.push({
      x:     100 + Math.random() * 1080,   // logical coords
      y:     80  + Math.random() * 580,
      r:     60  + Math.random() * 120,    // large soft blobs
      vx:    (Math.random() - 0.5) * 6,
      vy:    (Math.random() - 0.5) * 3,
      alpha: 0.04 + Math.random() * 0.06, // each blob is subtle; they stack
    });
  }
}

// [SMOKE] Update drifting smoke blobs each frame
function updateRoomSmoke(dt) {
  roomSmokeParticles.forEach(p => {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    // Wrap around the room
    if (p.x < -p.r)       p.x = LW + p.r;
    if (p.x > LW + p.r)   p.x = -p.r;
    if (p.y < -p.r)       p.y = LH + p.r;
    if (p.y > LH + p.r)   p.y = -p.r;
  });
}

// [SMOKE] Draw all persistent smoke blobs over the background
function drawRoomSmoke() {
  if (roomSmokeParticles.length === 0) return;

  roomSmokeParticles.forEach(p => {
    const cx = sx(p.x), cy = sy(p.y), cr = sc(p.r);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, cr);
    g.addColorStop(0,   `rgba(220, 215, 210, ${p.alpha})`);
    g.addColorStop(0.6, `rgba(200, 195, 190, ${p.alpha * 0.5})`);
    g.addColorStop(1,   'rgba(190, 185, 180, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, cr, 0, Math.PI * 2);
    ctx.fill();
  });

  // Ground-level fog pool — rolls in at the bottom as smoke accumulates
  if (smokeLevel > 0.15) {
    const fogHeight = canvas.height * (0.25 + smokeLevel * 0.45);
    const fog = ctx.createLinearGradient(0, canvas.height - fogHeight, 0, canvas.height);
    fog.addColorStop(0,   'rgba(205, 200, 195, 0)');
    fog.addColorStop(0.4, `rgba(205, 200, 195, ${smokeLevel * 0.5})`);
    fog.addColorStop(1,   `rgba(205, 200, 195, ${smokeLevel * 0.85})`);
    ctx.fillStyle = fog;
    ctx.fillRect(0, canvas.height - fogHeight, canvas.width, fogHeight);
  }

  // Full-screen haze — thickens as smokeLevel rises
  if (smokeLevel > 0) {
    // [SMOKE] Edit rgba to change overall haze color/intensity
    ctx.fillStyle = `rgba(210, 205, 200, ${smokeLevel * 0.5})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}

// ══════════════════════════════════════════════════════════
// CLOUD SCHEDULING
// ══════════════════════════════════════════════════════════
function scheduleCloud() {
  nextCloudIn = CLOUD_MIN + Math.random() * (CLOUD_MAX - CLOUD_MIN);
  cloudTimer  = 0;
}

// ══════════════════════════════════════════════════════════
// [CLOUD] Cloud class
// ══════════════════════════════════════════════════════════
class Cloud {
  constructor() {
    // Spawns near character's face (right side of scene)
    this.x    = 870;
    this.y    = 305;
    this.vx   = 0;
    this.vy   = 0;
    this.age  = 0;
    this.pulse = 0;
    this.mode = 'idle';   // 'idle' | 'minigame'

    // [CLOUD] ~35% chance of being a smoke ring instead of a puff cloud
    this.isRing  = Math.random() < 0.35;
    this.ringR   = 55 + Math.random() * 30;  // ring radius (logical units)
    this.ringRot = 0;

    // Randomise the puff arrangement for visual variety
    // [CLOUD] Increase r values to make puffs bigger
    this.puffs = Array.from({ length: 8 }, () => ({
      ox: (Math.random() - 0.5) * 90,
      oy: (Math.random() - 0.5) * 50,
      r:  45 + Math.random() * 55,
    }));
  }

  update(dt) {
    this.age    += dt;
    this.pulse  += dt * 3.5;
    this.ringRot += dt * 1.2; // rings slowly rotate

    if (this.mode === 'idle') {
      // Slow leftward drift + gentle bob
      this.x -= dt * 18;
      this.y += Math.sin(this.age * 1.8) * dt * 8;
    } else {
      // [CLOUD] — adjust 8 (responsiveness) and 0.82 (inertia) to change feel
      const lmx = (mouseX / canvas.width)  * LW;
      const lmy = (mouseY / canvas.height) * LH;
      this.vx += (lmx - this.x) * dt * 8;
      this.vy += (lmy - this.y) * dt * 8;
      this.vx *= 0.82;
      this.vy *= 0.82;
      this.x  += this.vx * dt;
      this.y  += this.vy * dt;
    }
  }

  draw() {
    const cx = sx(this.x);
    const cy = sy(this.y);

    ctx.save();

    // Glow when waiting to be clicked
    if (this.mode === 'idle') {
      const p = 0.5 + 0.5 * Math.sin(this.pulse);
      ctx.shadowBlur  = 18 + p * 22;
      ctx.shadowColor = '#9b2dca';
    }

    if (this.isRing) {
      // [CLOUD] Smoke ring — drawn as a glowing torus
      const outerR = sc(this.ringR);
      const innerR = sc(this.ringR * 0.45);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(this.ringRot);
      // Radial gradient creates the donut — transparent centre & edges, solid ring band
      const g = ctx.createRadialGradient(0, 0, innerR, 0, 0, outerR);
      g.addColorStop(0,    'rgba(215, 210, 235, 0)');
      g.addColorStop(0.35, 'rgba(215, 210, 235, 0.85)');
      g.addColorStop(0.65, 'rgba(195, 188, 220, 0.85)');
      g.addColorStop(1,    'rgba(180, 172, 210, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, outerR, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else {
      // [CLOUD] Regular puff cloud
      this.puffs.forEach(pf => {
        const px = cx + pf.ox * (canvas.width / LW);
        const py = cy + pf.oy * (canvas.height / LH);
        const pr = pf.r * (canvas.width / LW);
        const g  = ctx.createRadialGradient(px, py, 0, px, py, pr);
        g.addColorStop(0,   'rgba(215, 205, 240, 0.88)');
        g.addColorStop(0.5, 'rgba(185, 172, 220, 0.55)');
        g.addColorStop(1,   'rgba(150, 138, 200, 0.00)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(px, py, pr, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    ctx.restore();

    // "[ CLICK ]" prompt
    if (this.mode === 'idle') {
      const p = 0.5 + 0.5 * Math.sin(this.pulse * 0.7);
      ctx.save();
      ctx.globalAlpha  = 0.55 + p * 0.45;
      ctx.fillStyle    = '#ffffff';
      ctx.font         = `${sc(12)}px 'Share Tech Mono', monospace`;
      ctx.textAlign    = 'center';
      ctx.shadowBlur   = 8;
      ctx.shadowColor  = '#9b2dca';
      ctx.fillText('[ CLICK ]', cx, cy - sc(58));
      ctx.restore();
    }
  }

  hitTest(px, py) {
    return Math.hypot(px - sx(this.x), py - sy(this.y)) < sc(65);
  }
}

// ══════════════════════════════════════════════════════════
// [RINGS] Ring class
// ══════════════════════════════════════════════════════════
class Ring {
  constructor(x, y, delay) {
    this.x      = x;
    this.y      = y;
    this.delay  = delay;   // seconds before this ring activates
    this.age    = 0;
    this.active = false;
    this.hit    = false;
    this.missed = false;
    this.hitAge = 0;
    this.glow   = Math.random() * Math.PI * 2;
  }

  update(dt) {
    this.age += dt;
    if (this.age >= this.delay) {
      this.active = true;
      this.x -= RING_DRIFT_SPEED; // gentle leftward drift
      this.glow += dt * 5;
    }
    if (this.hit) this.hitAge += dt;
  }

  draw() {
    if (!this.active) return;

    const cx = sx(this.x);
    const cy = sy(this.y);
    const r  = sc(RING_RADIUS);
    const g  = 0.55 + 0.45 * Math.sin(this.glow);

    ctx.save();

    if (this.hit) {
      // Burst expand + fade on hit
      const fade = Math.max(0, 1 - this.hitAge * 2.5);
      ctx.globalAlpha  = fade;
      ctx.strokeStyle  = '#ffffff';
      ctx.lineWidth    = sc(5);
      ctx.shadowBlur   = sc(30);
      ctx.shadowColor  = '#ff2d9b';
      ctx.beginPath();
      ctx.arc(cx, cy, r * (1 + this.hitAge * 0.8), 0, Math.PI * 2);
      ctx.stroke();

    } else if (this.missed) {
      ctx.globalAlpha = 0.25;
      ctx.strokeStyle = '#ff5555';
      ctx.lineWidth   = sc(2);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();

    } else {
      // Outer purple glow ring
      ctx.globalAlpha  = 0.35 + g * 0.3;
      ctx.strokeStyle  = '#7a1aaa';
      ctx.lineWidth    = sc(9);
      ctx.shadowBlur   = sc(18) * g;
      ctx.shadowColor  = '#9b2dca';
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();

      // Bright inner ring
      ctx.globalAlpha  = 0.85 + g * 0.15;
      ctx.strokeStyle  = '#cc55ff';
      ctx.lineWidth    = sc(3);
      ctx.shadowBlur   = sc(22) * g;
      ctx.shadowColor  = '#dd88ff';
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();

      // Inner highlight arc
      ctx.globalAlpha  = 0.3;
      ctx.strokeStyle  = '#ffffff';
      ctx.lineWidth    = sc(1.2);
      ctx.shadowBlur   = 0;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.82, -Math.PI * 0.7, Math.PI * 0.1);
      ctx.stroke();
    }

    ctx.restore();
  }

  // Returns true if cloud is inside this ring
  checkHit(cloudX, cloudY) {
    if (!this.active || this.hit || this.missed) return false;
    return Math.hypot(sx(cloudX) - sx(this.x), sy(cloudY) - sy(this.y)) < sc(RING_RADIUS * 0.75);
  }

  // Mark missed if cloud has drifted well past it
  checkMiss(cloudX) {
    if (!this.active || this.hit || this.missed) return false;
    if (cloudX < this.x - RING_RADIUS * 2.5) { this.missed = true; return true; }
    return false;
  }
}

// ══════════════════════════════════════════════════════════
// RING SPAWNING — continuous rings across the full screen
// ══════════════════════════════════════════════════════════
let ringSpawnTimer = 0;
const RING_SPAWN_INTERVAL = 1.2; // [RINGS] seconds between new ring spawns

function spawnRings() {
  rings = [];
  ringSpawnTimer = 0;
  // Spawn a few immediately so it doesn't feel empty at start
  for (let i = 0; i < 4; i++) spawnOneRing();
}

function spawnOneRing() {
  // [RINGS] Full screen coverage — adjust margins if needed
  const x = 80  + Math.random() * (LW - 160);
  const y = 60  + Math.random() * (LH - 160);
  rings.push(new Ring(x, y, 0));
}

// ══════════════════════════════════════════════════════════
// PUFF PARTICLES (character blowing cloud animation)
// ══════════════════════════════════════════════════════════
function spawnPuff() {
  for (let i = 0; i < 10; i++) {
    puffParticles.push({
      x:    sx(890),
      y:    sy(310),
      vx:   -(30 + Math.random() * 90) * (canvas.width / LW),
      vy:   (Math.random() - 0.65) * 40 * (canvas.height / LH),
      r:    sc(12 + Math.random() * 18),
      life: 0,
      max:  2.5 + Math.random() * 1.5,
    });
  }
}

function updatePuffs(dt) {
  puffParticles = puffParticles.filter(p => p.life < p.max);
  puffParticles.forEach(p => {
    p.life += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.96;
    p.r  *= 1.008;
  });
}

function drawPuffs() {
  puffParticles.forEach(p => {
    const a = (1 - p.life / p.max) * 0.65;
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
    g.addColorStop(0, `rgba(210,200,235,${a})`);
    g.addColorStop(1, `rgba(170,160,210,0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  });
}

// ══════════════════════════════════════════════════════════
// SCORE POPUPS
// ══════════════════════════════════════════════════════════
function spawnPopup(lx, ly, text, color) {
  popups.push({ lx, ly, text, color, life: 0, max: 1.4, vy: -55 });
}

function updatePopups(dt) {
  popups = popups.filter(p => p.life < p.max);
  popups.forEach(p => { p.life += dt; p.ly += p.vy * dt; p.vy *= 0.94; });
}

function drawPopups() {
  popups.forEach(p => {
    const a = 1 - p.life / p.max;
    ctx.save();
    ctx.globalAlpha  = a;
    ctx.fillStyle    = p.color;
    ctx.shadowBlur   = sc(12);
    ctx.shadowColor  = p.color;
    ctx.font         = `bold ${sc(19)}px 'Orbitron', sans-serif`;
    ctx.textAlign    = 'center';
    ctx.fillText(p.text, sx(p.lx), sy(p.ly));
    ctx.restore();
  });
}

// ══════════════════════════════════════════════════════════
// [BACKGROUND] — draws the breakroom.png image full-screen
// ══════════════════════════════════════════════════════════
function drawBackground() {
  const W = canvas.width, H = canvas.height;
  if (bgImage) {
    ctx.drawImage(bgImage, 0, 0, W, H);
  } else {
    // Fallback while image loads
    ctx.fillStyle = '#0a0612';
    ctx.fillRect(0, 0, W, H);
  }
}

function drawBackground_UNUSED(t) {
  const W = canvas.width, H = canvas.height;

  // Main hangar walls — dark charcoal-purple
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#090512');
  bg.addColorStop(1, '#060310');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Left wall panel
  ctx.fillStyle = '#0b0817';
  ctx.fillRect(0, 0, sx(215), H);

  // Right wall panel
  ctx.fillStyle = '#0b0817';
  ctx.fillRect(sx(1025), 0, W - sx(1025), H);

  // Horizontal panel seams on left wall
  ctx.strokeStyle = '#14102088';
  ctx.lineWidth   = 1;
  for (let i = 1; i < 8; i++) {
    ctx.beginPath();
    ctx.moveTo(0, H * i / 8);
    ctx.lineTo(sx(215), H * i / 8);
    ctx.stroke();
  }

  drawWindow(t);
  drawNeonSigns(t);
  drawBlinkLights(t);
  drawVendingMachine(t);
  drawLockers();
}

function drawWindow(t) {
  // The large bay window in the center-back
  const wx = sx(215), wy = sy(50);
  const ww = sx(810), wh = sy(575);

  // Night sky outside — deep violet
  const sky = ctx.createLinearGradient(wx, wy, wx, wy + wh);
  sky.addColorStop(0, '#070514');
  sky.addColorStop(0.5, '#0c0820');
  sky.addColorStop(1, '#160d30');
  ctx.fillStyle = sky;
  ctx.fillRect(wx, wy, ww, wh);

  // Atmospheric ground glow (purple neon from factory floor below)
  const glow = ctx.createRadialGradient(wx + ww * 0.5, wy + wh, 10, wx + ww * 0.5, wy + wh, ww * 0.7);
  glow.addColorStop(0, '#280a4422');
  glow.addColorStop(1, 'transparent');
  ctx.fillStyle = glow;
  ctx.fillRect(wx, wy, ww, wh);

  // [BACKGROUND] — drawMech: adjust x, y, size
  drawMech(wx + ww * 0.44, wy + wh * 0.04, wh * 0.88, t);

  // Factory floor structures in background
  drawBackgroundStructures(wx, wy, ww, wh);

  drawRain(wx, wy, ww, wh);

  // Ground mist at window bottom
  const mist = ctx.createLinearGradient(0, wy + wh * 0.72, 0, wy + wh);
  mist.addColorStop(0, 'transparent');
  mist.addColorStop(1, '#160d3060');
  ctx.fillStyle = mist;
  ctx.fillRect(wx, wy + wh * 0.72, ww, wh * 0.28);

  // Window frame
  ctx.strokeStyle = '#1e1430';
  ctx.lineWidth   = sc(6);
  ctx.strokeRect(wx, wy, ww, wh);

  // Inner frame glow
  ctx.save();
  ctx.shadowBlur  = sc(12);
  ctx.shadowColor = '#9b2dca44';
  ctx.strokeStyle = '#2e1a48';
  ctx.lineWidth   = sc(2.5);
  ctx.strokeRect(wx + sc(3), wy + sc(3), ww - sc(6), wh - sc(6));
  ctx.restore();

  // BAY_07 label
  ctx.save();
  ctx.fillStyle   = '#3a2a5888';
  ctx.font        = `bold ${sc(18)}px 'Share Tech Mono', monospace`;
  ctx.textAlign   = 'center';
  ctx.fillText('BAY_07', wx + ww * 0.44, wy + wh * 0.58);
  ctx.font        = `${sc(11)}px 'Share Tech Mono', monospace`;
  ctx.fillText('整備区域', wx + ww * 0.44, wy + wh * 0.63);
  ctx.restore();
}

// [BACKGROUND] Giant mech silhouette — edit colors/shape here
function drawMech(cx, top, h, t) {
  const s   = h / 550;
  const bob = Math.sin(t * 0.25) * s * 3; // breathing bob

  ctx.save();
  ctx.translate(cx, top + bob);

  const dark  = '#1e1238';
  const mid   = '#2a1850';
  const hi    = '#3c2468';
  const acnt  = '#9b2dca';

  // Helper
  const rect = (x, y, w, h, color) => { ctx.fillStyle = color; ctx.fillRect(x * s, y * s, w * s, h * s); };

  // Legs
  rect(-75, 400, 60, 160, dark);  // left leg
  rect(-80, 540, 80, 50,  dark);  // left foot
  rect( 15, 400, 60, 160, dark);  // right leg
  rect(  5, 540, 75, 50,  dark);  // right foot

  // Hips
  rect(-90, 370, 180, 45, mid);

  // Torso
  rect(-100, 190, 200, 185, dark);

  // Torso detail panels
  rect(-68, 210, 46, 90, mid);
  rect( 22, 210, 46, 90, mid);

  // Chest reactor glow
  ctx.save();
  ctx.shadowBlur  = s * 25;
  ctx.shadowColor = '#0077ff';
  ctx.fillStyle   = '#0055ee44';
  ctx.fillRect(-s*22, s*218, s*44, s*44);
  ctx.fillStyle   = '#2299ffaa';
  ctx.fillRect(-s*14, s*226, s*28, s*28);
  ctx.restore();

  // Shoulders
  rect(-165, 168, 78, 105, hi);
  rect(  87, 168, 78, 105, hi);

  // Arms
  rect(-155, 268, 50, 115, dark);
  rect(  95, 268, 50, 115, dark);

  // Forearms
  rect(-148, 380, 40, 100, mid);
  rect(  95, 380, 40, 100, mid);

  // Neck
  rect(-28, 138, 56, 56, mid);

  // Head
  rect(-58, 65, 116, 78, hi);

  // Visor
  ctx.save();
  ctx.shadowBlur  = s * 12;
  ctx.shadowColor = '#0044ff';
  ctx.fillStyle   = '#0033cc55';
  ctx.fillRect(-s*48, s*80, s*96, s*34);
  ctx.restore();

  // Eyes
  ctx.save();
  ctx.shadowBlur  = s * 10;
  ctx.shadowColor = '#00aaff';
  ctx.fillStyle   = '#00aaff';
  ctx.fillRect(-s*34, s*86, s*18, s*14);
  ctx.fillRect( s*16, s*86, s*18, s*14);
  ctx.restore();

  // Shoulder nubs
  rect(-190, 158, 30, 30, acnt + '66');
  rect( 160, 158, 30, 30, acnt + '66');

  ctx.restore();
}

function drawBackgroundStructures(wx, wy, ww, wh) {
  // Scaffolding, gantries, warning lines
  ctx.strokeStyle = '#15102288';
  ctx.lineWidth   = sc(2);

  // Horizontal gantry beams
  ctx.beginPath();
  ctx.moveTo(wx, wy + wh * 0.75);
  ctx.lineTo(wx + ww, wy + wh * 0.75);
  ctx.stroke();

  // Warning stripes at bottom
  const stripeY = wy + wh * 0.80;
  ctx.strokeStyle = '#2a1a0822';
  ctx.lineWidth   = sc(4);
  for (let i = 0; i < 20; i++) {
    ctx.beginPath();
    ctx.moveTo(wx + i * ww / 20, stripeY);
    ctx.lineTo(wx + i * ww / 20 + 20, stripeY + 30);
    ctx.stroke();
  }
}

function drawRain(wx, wy, ww, wh) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(wx, wy, ww, wh);
  ctx.clip();

  rainDrops.forEach(d => {
    // Advance drop (uses logical units relative to LW/LH)
    d.y += d.speed;
    if (d.y > LH + d.len) { d.y = -d.len; d.x = Math.random() * LW; }

    ctx.strokeStyle = `rgba(140,130,195,${d.alpha})`;
    ctx.lineWidth   = 0.5;
    ctx.beginPath();
    ctx.moveTo(sx(d.x), sy(d.y));
    ctx.lineTo(sx(d.x) - 2, sy(d.y + d.len));
    ctx.stroke();
  });

  ctx.restore();
}

function drawNeonSigns(t) {
  // [BACKGROUND] Edit sign text/colors/positions here
  neonSign(sx(18), sy(155), sx(178), sy(165), "#MECHS\nDON'T FIX\nTHEMSELVES", '#ff2d9b', t, 0);
  neonSign(sx(18), sy(338), sx(135), sy(82),  'WAH!',                           '#9b2dca', t, 1.3);
  neonSign(sx(1030), sy(115), sx(235), sy(215),
    'BREAK TIME\n☕  10 MIN\nREST. RELOAD.\nRETURN STRONGER.', '#ff2d9b', t, 0.7);
}

function neonSign(x, y, w, h, text, color, t, phaseOff) {
  const flicker = 0.88 + 0.12 * Math.sin(t * 9.3 + phaseOff);
  ctx.save();
  ctx.globalAlpha = flicker;

  ctx.fillStyle   = '#06040e';
  ctx.fillRect(x, y, w, h);

  ctx.strokeStyle = color + '66';
  ctx.lineWidth   = sc(1.5);
  ctx.strokeRect(x, y, w, h);

  // Inner neon frame glow
  ctx.shadowBlur  = sc(8) * flicker;
  ctx.shadowColor = color;
  ctx.strokeStyle = color;
  ctx.lineWidth   = sc(1);
  ctx.strokeRect(x + sc(4), y + sc(4), w - sc(8), h - sc(8));

  // Text
  ctx.shadowBlur  = sc(6) * flicker;
  ctx.fillStyle   = color;
  ctx.font        = `bold ${sc(10.5)}px 'Share Tech Mono', monospace`;
  ctx.textAlign   = 'center';
  const lines   = text.split('\n');
  const lineH   = sc(16);
  const startY  = y + h / 2 - (lines.length - 1) * lineH / 2;
  lines.forEach((line, i) => ctx.fillText(line, x + w / 2, startY + i * lineH));

  ctx.restore();
}

function drawBlinkLights(t) {
  blinkLights.forEach(l => {
    const on = 0.5 + 0.5 * Math.sin(t * l.rate * Math.PI * 2 + l.phase);
    ctx.save();
    ctx.globalAlpha  = on * 0.9;
    ctx.shadowBlur   = sc(10) * on;
    ctx.shadowColor  = l.color;
    ctx.fillStyle    = l.color;
    ctx.beginPath();
    ctx.arc(sx(l.x), sy(l.y), sc(l.r), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

function drawVendingMachine(t) {
  // Left side drink/vending unit
  const vx = sx(14), vy = sy(425);
  const vw = sx(182), vh = sy(290);

  ctx.fillStyle   = '#0a0714';
  ctx.fillRect(vx, vy, vw, vh);
  ctx.strokeStyle = '#1a122888';
  ctx.lineWidth   = sc(2);
  ctx.strokeRect(vx, vy, vw, vh);

  // Screen on machine
  ctx.fillStyle = '#060e1a';
  ctx.fillRect(vx + sc(10), vy + sc(10), vw - sc(20), sy(78));

  ctx.fillStyle  = '#2a4455';
  ctx.font       = `${sc(8.5)}px 'Share Tech Mono', monospace`;
  ctx.textAlign  = 'center';
  ctx.fillText('WORK SLEEP', vx + vw / 2, vy + sy(42));
  ctx.fillStyle  = '#1e3344';
  ctx.fillText('SLEEP REPEAT', vx + vw / 2, vy + sy(56));

  // Stocked cans/bottles
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) {
      ctx.fillStyle = row % 2 === 0 ? '#12304a' : '#1e1234';
      ctx.fillRect(
        vx + sc(10 + col * 40),
        vy + sy(100 + row * 48),
        sc(32), sy(40)
      );
    }
  }
}

function drawLockers() {
  // Right wall lockers
  for (let i = 0; i < 3; i++) {
    const lx = sx(1030);
    const ly = sy(275 + i * 135);
    const lw = sx(58);
    const lh = sy(125);
    ctx.fillStyle   = '#100d1a';
    ctx.fillRect(lx, ly, lw, lh);
    ctx.strokeStyle = '#1c1530';
    ctx.lineWidth   = 1;
    ctx.strokeRect(lx, ly, lw, lh);
    // Handle
    ctx.fillStyle = '#28203a';
    ctx.fillRect(lx + lw * 0.38, ly + lh * 0.44, lw * 0.24, lh * 0.1);
  }
}

// ══════════════════════════════════════════════════════════
// [TABLE] Foreground table and props
// ══════════════════════════════════════════════════════════
function drawTable(t) {
  const tt = sy(582); // table top Y

  // Table surface
  const tg = ctx.createLinearGradient(0, tt, 0, canvas.height);
  tg.addColorStop(0, '#171024');
  tg.addColorStop(0.4, '#100c1c');
  tg.addColorStop(1, '#07050e');
  ctx.fillStyle = tg;
  ctx.fillRect(sx(95), tt, sx(910), canvas.height - tt);

  // Table edge
  ctx.strokeStyle = '#261848';
  ctx.lineWidth   = sc(2.5);
  ctx.beginPath();
  ctx.moveTo(sx(95), tt);
  ctx.lineTo(sx(1005), tt);
  ctx.stroke();

  // Thin specular line
  ctx.strokeStyle = '#ffffff0a';
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(sx(95), tt + sc(3));
  ctx.lineTo(sx(1005), tt + sc(3));
  ctx.stroke();

  // Draw props
  drawGauntlet(sx(55), tt);
  drawMug(sx(315), tt, t);
  drawAshtray(sx(548), tt);
  drawTablet(sx(655), tt, t);
  drawVapeMod(sx(955), tt, t);
}

function drawGauntlet(x, tableTop) {
  // Armored mech gauntlet laying on left edge
  ctx.save();
  ctx.translate(x, tableTop - sy(15));
  ctx.rotate(-0.12);

  const s = sc(1);
  const dark = '#100c20', mid = '#1a1535', hi = '#242048';

  // Forearm plate
  ctx.fillStyle = dark;
  ctx.fillRect(-s*38, -s*15, s*72, s*88);

  ctx.fillStyle = mid;
  ctx.fillRect(-s*34, -s*10, s*64, s*28);
  ctx.fillRect(-s*34,  s*25, s*64, s*22);

  // Knuckles
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = hi;
    ctx.beginPath();
    ctx.arc(-s*24 + i*s*16, s*65, s*9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.arc(-s*24 + i*s*16, s*65, s*5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawMug(x, tableTop, t) {
  const y = tableTop - sy(18);
  const s = sc(1);
  const steam = (t * 1.8) % 1;

  // Body
  ctx.fillStyle = '#cbc6d4';
  ctx.beginPath();
  ctx.roundRect(x - s*26, y, s*52, s*62, s*4);
  ctx.fill();

  // GM text
  ctx.fillStyle   = '#1e1a2c';
  ctx.font        = `bold ${s*18}px 'Orbitron', sans-serif`;
  ctx.textAlign   = 'center';
  ctx.fillText('GM', x, y + s*40);

  // Handle
  ctx.strokeStyle = '#cbc6d4';
  ctx.lineWidth   = s*5;
  ctx.beginPath();
  ctx.arc(x + s*32, y + s*26, s*19, -Math.PI * 0.5, Math.PI * 0.5);
  ctx.stroke();

  // Steam wisps
  for (let i = 0; i < 3; i++) {
    const off = (steam + i * 0.33) % 1;
    ctx.save();
    ctx.globalAlpha  = (1 - off) * 0.55;
    ctx.strokeStyle  = 'rgba(215,210,235,0.8)';
    ctx.lineWidth    = s * 1.5;
    const bx = x - s*8 + i*s*9;
    ctx.beginPath();
    ctx.moveTo(bx, y - s*4 - off*s*28);
    ctx.bezierCurveTo(bx+s*7, y-s*10-off*s*28, bx-s*7, y-s*18-off*s*28, bx, y-s*26-off*s*28);
    ctx.stroke();
    ctx.restore();
  }
}

function drawAshtray(x, tableTop) {
  const y = tableTop + sy(2);
  const s = sc(1);

  ctx.fillStyle = '#181220';
  ctx.beginPath();
  ctx.ellipse(x, y + s*10, s*36, s*13, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#221a30';
  ctx.beginPath();
  ctx.ellipse(x, y + s*8, s*28, s*9, 0, 0, Math.PI * 2);
  ctx.fill();

  // Ash
  ctx.fillStyle = '#3a3540';
  ctx.beginPath();
  ctx.ellipse(x, y + s*8, s*16, s*4, 0, 0, Math.PI * 2);
  ctx.fill();

  // Cigarette butt
  ctx.strokeStyle = '#c8a878';
  ctx.lineWidth   = s*3;
  ctx.lineCap     = 'round';
  ctx.beginPath();
  ctx.moveTo(x - s*8, y + s*6);
  ctx.lineTo(x + s*10, y + s*10);
  ctx.stroke();
}

function drawTablet(x, tableTop, t) {
  const y = tableTop - sy(12);
  const s = sc(1);
  const pulse = 0.7 + 0.3 * Math.sin(t * 1.5);

  // Body
  ctx.fillStyle = '#14101e';
  ctx.beginPath();
  ctx.roundRect(x - s*85, y, s*168, s*105, s*7);
  ctx.fill();

  // Screen
  ctx.fillStyle = '#070e1a';
  ctx.beginPath();
  ctx.roundRect(x - s*76, y + s*9, s*150, s*84, s*3);
  ctx.fill();

  // Header bar
  ctx.fillStyle = `rgba(155,45,202,${0.55 * pulse})`;
  ctx.fillRect(x - s*72, y + s*12, s*142, s*20);

  ctx.save();
  ctx.fillStyle   = '#cc55ff';
  ctx.shadowBlur  = s*6;
  ctx.shadowColor = '#9b2dca';
  ctx.font        = `bold ${s*11}px 'Share Tech Mono', monospace`;
  ctx.textAlign   = 'center';
  ctx.fillText('moemoe', x, y + s*27);
  ctx.restore();

  ctx.fillStyle = '#3a2a5a';
  ctx.font      = `${s*8}px 'Share Tech Mono', monospace`;
  ctx.textAlign = 'center';
  ctx.fillText('PILOT TERMINAL', x, y + s*42);

  ctx.fillStyle = '#2e2248';
  ctx.font      = `${s*7.5}px 'Share Tech Mono', monospace`;
  ctx.textAlign = 'left';
  ctx.fillText('• stay hydrated', x - s*60, y + s*58);
  ctx.fillText('• stay positive', x - s*60, y + s*70);
  ctx.fillText('• mech needs you', x - s*60, y + s*82);
}

function drawVapeMod(x, tableTop, t) {
  const y = tableTop - sy(45);
  const s = sc(1);
  const led = 0.6 + 0.4 * Math.sin(t * 2.8);

  // Device body
  ctx.fillStyle = '#161222';
  ctx.beginPath();
  ctx.roundRect(x - s*11, y, s*22, s*82, s*4);
  ctx.fill();

  // LED strip
  ctx.save();
  ctx.shadowBlur  = s*12;
  ctx.shadowColor = '#9b2dca';
  ctx.fillStyle   = `rgba(155,45,202,${led})`;
  ctx.fillRect(x - s*3, y + s*12, s*6, s*52);
  ctx.restore();

  // Button
  ctx.fillStyle   = '#221840';
  ctx.strokeStyle = '#3a2a55';
  ctx.lineWidth   = s;
  ctx.beginPath();
  ctx.roundRect(x - s*9, y + s*32, s*18, s*16, s*3);
  ctx.fill();
  ctx.stroke();
}

// ══════════════════════════════════════════════════════════
// [CHARACTER] Main character drawing
// Draws the pilot sprite image when loaded; falls back to
// the canvas-drawn version if images aren't available.
// ══════════════════════════════════════════════════════════
function drawCharacter(t) {
  if (spritesReady) {
    drawCharacterSprite(t);
    return;
  }
  drawCharacterCanvas(t);
}

function drawCharacterSprite(t) {
  // [CHARACTER] Adjust these to reposition / resize the sprite
  const spriteW  = sx(370);   // display width  — increase to make him bigger
  const spriteH  = sy(700);   // display height
  const spriteX  = sx(880);   // left edge X position
  const spriteY  = sy(15);    // top edge Y position
  const bob      = Math.sin(t * 1.15) * sc(2); // subtle breathing

  // Use blow sprite when cloud is active, idle otherwise
  const key = (state === S.MINIGAME || (cloud && cloud.mode === 'idle')) ? 'blow' : 'idle';
  const sprite = pilotSprites[key] || pilotSprites.idle;
  if (!sprite) return;

  ctx.save();
  ctx.translate(0, bob);
  ctx.drawImage(sprite, spriteX, spriteY, spriteW, spriteH);
  ctx.restore();
}

function drawCharacterCanvas(t) {
  // [CHARACTER] Body position — adjust sx/sy values to move him
  const bx  = sx(935);
  const by  = sy(318);
  const s   = sc(1);
  const bob = Math.sin(t * 1.15) * s * 2.5; // breathing animation

  ctx.save();
  ctx.translate(bx, by);

  // ── Red pilot suit body ──
  const bodyGrad = ctx.createLinearGradient(-s*85, 0, s*85, 0);
  bodyGrad.addColorStop(0,   '#3d0606');
  bodyGrad.addColorStop(0.3, '#8c1818');
  bodyGrad.addColorStop(0.65,'#7a1414');
  bodyGrad.addColorStop(1,   '#350505');

  // Torso
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.roundRect(-s*82, s*8 + bob, s*164, s*225, s*7);
  ctx.fill();

  // Suit wear marks (subtle dark streaks)
  ctx.globalAlpha = 0.3;
  ctx.strokeStyle = '#2a0404';
  ctx.lineWidth   = s * 1.5;
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.moveTo(-s*65 + i * s*28, s*15 + bob);
    ctx.lineTo(-s*60 + i * s*28, s*85 + bob);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Collar
  ctx.fillStyle = '#280404';
  ctx.beginPath();
  ctx.roundRect(-s*32, s*6 + bob, s*64, s*32, s*5);
  ctx.fill();

  // Shoulders
  const shGrad = ctx.createLinearGradient(0, 0, 0, s*70);
  shGrad.addColorStop(0, '#7a1414');
  shGrad.addColorStop(1, '#380606');
  ctx.fillStyle = shGrad;

  ctx.beginPath();
  ctx.roundRect(-s*118, s*8 + bob, s*44, s*84, s*7);
  ctx.fill();

  ctx.beginPath();
  ctx.roundRect(s*74, s*8 + bob, s*44, s*84, s*7);
  ctx.fill();

  // Arms
  ctx.fillStyle = '#621010';
  ctx.beginPath();
  ctx.roundRect(-s*122, s*86 + bob, s*40, s*145, s*7);
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(s*82, s*86 + bob, s*40, s*125, s*7);
  ctx.fill();

  // ── Black harness straps ──
  ctx.strokeStyle = '#080606';
  ctx.lineWidth   = s*7;
  ctx.lineCap     = 'round';

  // Diagonal X straps
  ctx.beginPath(); ctx.moveTo(-s*62, s*12 + bob); ctx.lineTo(s*22, s*105 + bob); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(s*62,  s*12 + bob); ctx.lineTo(-s*22, s*105 + bob); ctx.stroke();
  // Vertical center
  ctx.beginPath(); ctx.moveTo(0, s*12 + bob); ctx.lineTo(0, s*185 + bob); ctx.stroke();

  // Strap buckles
  ctx.fillStyle   = '#2c2438';
  ctx.strokeStyle = '#4a3c58';
  ctx.lineWidth   = s*1.5;

  // Chest buckle
  ctx.beginPath(); ctx.roundRect(-s*16, s*88 + bob, s*32, s*18, s*3); ctx.fill(); ctx.stroke();
  // Shoulder buckle
  ctx.beginPath(); ctx.roundRect(-s*16, s*38 + bob, s*32, s*16, s*3); ctx.fill(); ctx.stroke();

  // ── Chest badge / patch ──
  ctx.fillStyle = '#0e0818';
  ctx.beginPath(); ctx.arc(-s*52, s*58 + bob, s*17, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#2e2045'; ctx.lineWidth = s*2;
  ctx.stroke();
  ctx.fillStyle   = 'rgba(155,45,202,0.4)';
  ctx.beginPath(); ctx.arc(-s*52, s*58 + bob, s*11, 0, Math.PI * 2); ctx.fill();

  // ── Legs (partially hidden by table) ──
  ctx.fillStyle = '#501010';
  ctx.beginPath(); ctx.roundRect(-s*78, s*225 + bob, s*62, s*85, s*5); ctx.fill();
  ctx.beginPath(); ctx.roundRect(s*16,  s*225 + bob, s*62, s*85, s*5); ctx.fill();

  // ── Heart head ──
  ctx.translate(s*5, bob);
  drawHeartHead(0, -s*65, s, t);

  ctx.restore();
}

// [CHARACTER] Yellow heart head — shape, colors, eyes, smile
function drawHeartHead(x, y, s, t) {
  ctx.save();
  ctx.translate(x, y);

  const hs = s * 100; // heart size scalar — increase to make head bigger

  // ── Heart shape ──
  function heartPath(cx, cy, sz) {
    const w = sz * 0.54;
    ctx.beginPath();
    ctx.moveTo(cx, cy + sz * 0.28);
    // bottom point up-left
    ctx.bezierCurveTo(cx - w * 0.9, cy + sz * 0.02, cx - w, cy - sz * 0.28, cx - w, cy - sz * 0.12);
    // left bump
    ctx.bezierCurveTo(cx - w, cy - sz * 0.72, cx, cy - sz * 0.85, cx, cy - sz * 0.56);
    // right bump
    ctx.bezierCurveTo(cx, cy - sz * 0.85, cx + w, cy - sz * 0.72, cx + w, cy - sz * 0.12);
    // bottom point up-right
    ctx.bezierCurveTo(cx + w, cy - sz * 0.28, cx + w * 0.9, cy + sz * 0.02, cx, cy + sz * 0.28);
    ctx.closePath();
  }

  // Outer glow
  ctx.shadowBlur  = sc(22);
  ctx.shadowColor = '#ffcc0088';

  // Fill gradient — bright yellow centre, warm orange edges
  const yg = ctx.createRadialGradient(hs*0.05, -hs*0.28, hs*0.08, hs*0.05, -hs*0.08, hs*0.96);
  yg.addColorStop(0,   '#ffe53a');
  yg.addColorStop(0.35,'#f5c200');
  yg.addColorStop(0.72,'#d4a000');
  yg.addColorStop(1,   '#b87a00');
  heartPath(0, 0, hs);
  ctx.fillStyle = yg;
  ctx.fill();
  ctx.shadowBlur = 0;

  // Gloss highlight — top-left sheen
  ctx.save();
  heartPath(0, 0, hs);
  ctx.clip();
  const gl = ctx.createRadialGradient(-hs*0.18, -hs*0.5, 0, -hs*0.18, -hs*0.5, hs*0.52);
  gl.addColorStop(0,   'rgba(255,255,255,0.55)');
  gl.addColorStop(0.38,'rgba(255,250,210,0.18)');
  gl.addColorStop(1,   'transparent');
  ctx.fillStyle = gl;
  ctx.fillRect(-hs, -hs * 1.1, hs * 2, hs * 1.4);
  ctx.restore();

  // Outline
  heartPath(0, 0, hs);
  ctx.strokeStyle = '#c8880066';
  ctx.lineWidth   = s * 2.5;
  ctx.stroke();

  // ── Eyes (blink handled via charBlink timer) ──
  // [CHARACTER] Eye positions — adjust multipliers to move eyes
  const eyeY = -hs * 0.32;
  const eyeR =  hs * 0.23;

  if (charBlink > 0.92) {
    // Blink — flat line
    ctx.strokeStyle = '#0a0606';
    ctx.lineWidth   = s * 4;
    ctx.lineCap     = 'round';
    ctx.beginPath(); ctx.moveTo(-hs*0.28 - eyeR*0.6, eyeY); ctx.lineTo(-hs*0.28 + eyeR*0.6, eyeY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo( hs*0.28 - eyeR*0.6, eyeY); ctx.lineTo( hs*0.28 + eyeR*0.6, eyeY); ctx.stroke();
  } else {
    drawEye(-hs * 0.28, eyeY, eyeR, s);
    drawEye( hs * 0.28, eyeY, eyeR, s);
  }

  // ── Smirk smile (comma shape — lower right of face) ──
  // [CHARACTER] Edit bezier points to change smile shape
  ctx.strokeStyle = '#180800';
  ctx.lineWidth   = s * 3.5;
  ctx.lineCap     = 'round';
  ctx.beginPath();
  ctx.moveTo(hs * 0.07, hs * 0.04);
  ctx.bezierCurveTo(hs*0.16, hs*0.10, hs*0.20, hs*0.18, hs*0.11, hs*0.21);
  ctx.stroke();

  ctx.restore();
}

// [CHARACTER] Eye — large cartoon glossy black eye
function drawEye(x, y, r, s) {
  // Black base
  const ig = ctx.createRadialGradient(x, y, 0, x, y, r);
  ig.addColorStop(0, '#180e10');
  ig.addColorStop(0.65, '#070406');
  ig.addColorStop(1,   '#000000');
  ctx.fillStyle = ig;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();

  // Large white specular — top right (gives that big glossy look)
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  ctx.beginPath();
  ctx.arc(x + r*0.22, y - r*0.24, r*0.44, 0, Math.PI * 2);
  ctx.fill();

  // Small secondary highlight — bottom left
  ctx.fillStyle = 'rgba(255,255,255,0.42)';
  ctx.beginPath();
  ctx.arc(x - r*0.22, y + r*0.12, r*0.17, 0, Math.PI * 2);
  ctx.fill();
}

// ══════════════════════════════════════════════════════════
// MINIGAME TIMER BAR (bottom of screen)
// ══════════════════════════════════════════════════════════
function drawMGTimerBar(progress) {
  const bx = sx(215), by = sy(700);
  const bw = sx(850), bh = sy(12);
  const color = progress > 0.35 ? '#9b2dca' : '#ff2d9b';

  ctx.fillStyle = '#09070f';
  ctx.fillRect(bx, by, bw, bh);

  ctx.save();
  ctx.shadowBlur  = sc(7);
  ctx.shadowColor = color;
  ctx.fillStyle   = color;
  ctx.fillRect(bx, by, bw * Math.max(0, progress), bh);
  ctx.restore();

  ctx.strokeStyle = '#1e144888';
  ctx.lineWidth   = 1;
  ctx.strokeRect(bx, by, bw, bh);
}

// ══════════════════════════════════════════════════════════
// HUD UPDATE
// ══════════════════════════════════════════════════════════
function updateHUD() {
  document.getElementById('score-display').textContent = score.toLocaleString();
  document.getElementById('combo-display').textContent = `x${combo}`;

  const m = Math.max(0, Math.min(100, morale));
  document.getElementById('morale-bar').style.width = m + '%';
  document.getElementById('morale-pct').textContent  = Math.round(m) + '%';

  if (morale < 30) {
    document.getElementById('morale-bar').style.background = 'linear-gradient(90deg,#8b0000,#cc2200)';
  } else {
    document.getElementById('morale-bar').style.background = 'linear-gradient(90deg,#9b2dca,#ff2d9b)';
  }

  if (state === S.IDLE) {
    const secs = Math.max(0, (nextCloudIn - cloudTimer) / 1000);
    const m2   = Math.floor(secs / 60).toString().padStart(2,'0');
    const s2   = Math.floor(secs % 60).toString().padStart(2,'0');
    document.getElementById('cloud-timer').textContent = `${m2}:${s2}`;
  } else {
    document.getElementById('cloud-timer').textContent = '--:--';
  }
}

// ══════════════════════════════════════════════════════════
// MINI-GAME START / END
// ══════════════════════════════════════════════════════════
function startMinigame() {
  if (!cloud) return;
  cloud.mode = 'minigame';
  state = S.MINIGAME;
  mgTimer = 0;
  sessions++;
  spawnRings();

  const hint = document.getElementById('mg-hint');
  hint.classList.remove('hidden');
  // Re-trigger animation by replacing node
  const clone = hint.cloneNode(true);
  hint.parentNode.replaceChild(clone, hint);
  setTimeout(() => clone.classList.add('hidden'), 3500);
}

function endMinigame() {
  cloud = null;
  rings = [];
  state = S.IDLE;
  addRoomSmoke();   // each session makes the room smokier
  scheduleCloud();

  // Too smoky — room is unlivable
  if (smokeLevel >= 1) {
    setTimeout(showSummary, 1200); // brief pause so player sees the full haze
  }
}

// ══════════════════════════════════════════════════════════
// SUMMARY SCREEN
// ══════════════════════════════════════════════════════════
const endMessages = [
  "Back to Bay 07. The mech misses you.",
  "Morale depleted. Rest harder next time.",
  "Good session. Even better pilot.",
  "The rings won't guide themselves.",
  "Cloud dispersed. So did your morale.",
];

const smokyEndMessages = [
  "You hotboxed the break room. Impressive.",
  "Can't see your own hands. Break's over.",
  "Visibility: zero. Bay 07 is calling.",
  "The smoke alarm would be proud.",
];

function showSummary() {
  state = S.SUMMARY;
  document.getElementById('s-score').textContent    = score.toLocaleString();
  document.getElementById('s-combo').textContent    = `x${maxCombo}`;
  document.getElementById('s-rings').textContent    = ringsHit;
  document.getElementById('s-sessions').textContent = sessions;
  document.getElementById('s-morale').textContent   = Math.round(Math.max(0, morale)) + '%';
  const pool = smokeLevel >= 1 ? smokyEndMessages : endMessages;
  document.getElementById('summary-msg').textContent = pool[Math.floor(Math.random() * pool.length)];
  document.getElementById('summary-screen').classList.remove('hidden');
}

// ══════════════════════════════════════════════════════════
// MAIN GAME LOOP
// ══════════════════════════════════════════════════════════
function loop(ts) {
  const dt = Math.min((ts - lastTs) / 1000, 0.05); // cap delta to avoid spiral on tab-out
  lastTs = ts;
  const t = ts / 1000;

  // Blink timer
  charBlink = (t * 0.5) % 1; // blink roughly every 2 seconds at 0.92+ threshold

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // ── Draw scene layers ──
  drawBackground();
  updateRoomSmoke(dt);
  drawRoomSmoke();
  drawPuffs();

  if (state === S.IDLE) {
    cloudTimer += dt * 1000;
    morale = Math.max(0, morale - MORALE_IDLE_RATE * dt);

    if (cloud) {
      cloud.update(dt);
      cloud.draw();
    }

    if (cloudTimer >= nextCloudIn && !cloud) {
      cloud = new Cloud();
      spawnPuff();
    }

  } else if (state === S.MINIGAME) {
    mgTimer += dt * 1000;
    const progress = 1 - mgTimer / MG_DURATION;

    // Continuously spawn new rings throughout the mini-game
    ringSpawnTimer += dt;
    if (ringSpawnTimer >= RING_SPAWN_INTERVAL) {
      ringSpawnTimer = 0;
      spawnOneRing();
    }
    // Remove rings that have been hit/missed for a while to keep list tidy
    rings = rings.filter(r => !(r.hit && r.hitAge > 0.5) && !(r.missed && r.age > r.delay + 4));

    if (cloud) {
      cloud.update(dt);
      cloud.draw();
    }

    rings.forEach(ring => {
      ring.update(dt);
      ring.draw();

      if (cloud && ring.checkHit(cloud.x, cloud.y)) {
        ring.hit = true;
        const pts = SCORE_PER_RING * combo;
        score += pts;
        combo  = Math.min(combo + 1, COMBO_MAX);
        maxCombo = Math.max(maxCombo, combo);
        ringsHit++;
        morale = Math.min(100, morale + MORALE_RING_HIT);
        spawnPopup(cloud.x, cloud.y - 50, `+${pts.toLocaleString()}`, '#ff2d9b');
      }

      if (cloud && ring.checkMiss(cloud.x)) {
        combo  = 1;
        morale = Math.max(0, morale + MORALE_RING_MISS);
        spawnPopup(ring.x, ring.y - 40, 'MISS', '#ff4444');
      }
    });

    drawMGTimerBar(Math.max(0, progress));

    if (mgTimer >= MG_DURATION) endMinigame();
  }

  drawCharacter(t);
  updatePuffs(dt);
  updatePopups(dt);
  drawPopups();

  if (state !== S.START && state !== S.SUMMARY) {
    updateHUD();
    if (morale <= 0) showSummary();
  }

  requestAnimationFrame(loop);
}

// ══════════════════════════════════════════════════════════
// INPUT
// ══════════════════════════════════════════════════════════
function getPos(e) {
  const r = canvas.getBoundingClientRect();
  const src = e.touches ? e.touches[0] : e;
  // Scale from CSS pixels to canvas pixels
  const scaleX2 = canvas.width  / r.width;
  const scaleY2 = canvas.height / r.height;
  return {
    x: (src.clientX - r.left) * scaleX2,
    y: (src.clientY - r.top)  * scaleY2,
  };
}

canvas.addEventListener('mousemove', e => { const p = getPos(e); mouseX = p.x; mouseY = p.y; });
canvas.addEventListener('touchmove', e => { e.preventDefault(); const p = getPos(e); mouseX = p.x; mouseY = p.y; }, { passive: false });

function handleClick(e) {
  if (state === S.IDLE && cloud && cloud.mode === 'idle') {
    const p = getPos(e);
    if (cloud.hitTest(p.x, p.y)) startMinigame();
  }
}
canvas.addEventListener('click',      handleClick);
canvas.addEventListener('touchstart', e => { e.preventDefault(); handleClick(e); }, { passive: false });

// ══════════════════════════════════════════════════════════
// BUTTON HANDLERS
// ══════════════════════════════════════════════════════════
document.getElementById('start-btn').addEventListener('click', () => {
  document.getElementById('start-screen').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
  resetGame();
});

document.getElementById('restart-btn').addEventListener('click', () => {
  document.getElementById('summary-screen').classList.add('hidden');
  resetGame();
});

// ══════════════════════════════════════════════════════════
// BOOT
// ══════════════════════════════════════════════════════════
requestAnimationFrame(ts => { lastTs = ts; requestAnimationFrame(loop); });
