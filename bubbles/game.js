// Bubble Pop — proof-of-concept bubble shooter with character art bubbles.
// Aim with mouse/finger, release to shoot. Match 3+ of the same character to pop.
// Bubbles cut off from the ceiling fall. Every few shots the ceiling drops a row.

const W = 600, H = 900;
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

// ---- art -------------------------------------------------------------------
// One entry per bubble type. `tint` is used for the glass bubble style + particles.
const TYPES = [
  { id: "cat_donut",    tint: "#7fd3e8" },
  { id: "luna_donut",   tint: "#f28bb0" },
  { id: "poki",         tint: "#ffd36b" },
  { id: "poki_donut",   tint: "#9a6a4a" },
  { id: "poki_wash",    tint: "#b8d8ff" },
  { id: "rabbit_donut", tint: "#3f8fd1" },
];
for (const t of TYPES) { t.img = new Image(); t.img.src = `assets/${t.id}.png`; }

// Art styles to compare, cycled with the STYLE button (or S key).
const STYLES = ["Raw art", "Glass bubble", "Colour ring"];
let styleIdx = 0;
try { styleIdx = +localStorage.getItem("bubblepop_style") || 0; } catch (e) {}

// ---- grid ------------------------------------------------------------------
const COLS = 10;
const R = 28;                       // bubble radius
const D = R * 2;
const ROW_H = R * Math.sqrt(3);
const BOARD_X = (W - (COLS * D + R)) / 2;
const TOP = 70;                     // y of the ceiling
const SHOOTER = { x: W / 2, y: 820 };
const DEAD_Y = 740;                 // a bubble below this line = game over
const SHOT_SPEED = 1500;

// ---- modes -----------------------------------------------------------------
// CLASSIC: clear the board. Every shot ticks the ceiling countdown, and each drop
//   makes the next one come sooner (shotsPerDrop).
// RUSH: endless. The ceiling drops on a timer that speeds up after every drop
//   (dropInterval); clearing the board just refills it for a bonus.
const MODES = [
  {
    id: "classic", name: "CLASSIC", startRows: 6,
    desc: ["Clear the board.", "The ceiling drops sooner and sooner."],
    shotsPerDrop: (drops) => Math.max(3, 6 - Math.floor(drops / 2)), // 6,6,5,5,4,4,3…
  },
  {
    id: "rush", name: "RUSH", startRows: 5, endless: true,
    desc: ["Endless. The ceiling drops on a timer", "that keeps getting faster."],
    dropInterval: (drops) => Math.max(2.2, 8 - drops * 0.5),          // seconds: 8, 7.5, 7…
    slideRate: 0.5,      // half the usual slide chances…
    slideCooldown: 18,   // …and a longer gap between them, so they don't pile onto the pressure
  },
];
let modeIdx = 0;
try { modeIdx = Math.min(MODES.length - 1, +localStorage.getItem("bubblepop_mode") || 0); } catch (e) {}
const mode = () => MODES[modeIdx];

let grid, shift, score, best, shotsLeft, drops, dropTimer, ceilAnim, current, next, shot, popping, falling, particles, state, aim, menuT;
state = "menu"; menuT = 1;
const bestKey = () => "bubblepop_best_" + mode().id;
function loadBest() { try { best = +localStorage.getItem(bestKey()) || 0; } catch (e) { best = 0; } }
loadBest();

// Row r is shifted right by R when (r + shift) is odd; dropping a row flips shift.
const rowOdd = (r) => (r + shift) % 2 === 1;
const colsIn = (r) => (rowOdd(r) ? COLS - 1 : COLS);
const cellX = (r, c) => BOARD_X + R + c * D + (rowOdd(r) ? R : 0);
const cellY = (r) => TOP + R + r * ROW_H;
const inGrid = (r, c) => r >= 0 && c >= 0 && c < colsIn(r);
const get = (r, c) => (grid[r] && inGrid(r, c) ? grid[r][c] : -1);

function neighbors(r, c) {
  const o = rowOdd(r) ? 0 : -1; // column offset of the diagonal neighbours
  return [
    [r, c - 1], [r, c + 1],
    [r - 1, c + o], [r - 1, c + o + 1],
    [r + 1, c + o], [r + 1, c + o + 1],
  ].filter(([rr, cc]) => rr >= 0 && inGrid(rr, cc));
}

function newRow(r) {
  const row = [];
  for (let c = 0; c < COLS; c++) row.push(c < colsIn(r) ? randType() : -1);
  return row;
}
const randType = () => Math.floor(Math.random() * TYPES.length);

function startGame(i) {
  modeIdx = i;
  try { localStorage.setItem("bubblepop_mode", i); } catch (e) {}
  loadBest();
  reset();
}

function reset() {
  shift = 0;
  grid = [];
  for (let r = 0; r < mode().startRows; r++) grid.push(newRow(r));
  score = 0;
  drops = 0;
  ceilAnim = 0;
  shotsLeft = mode().shotsPerDrop ? mode().shotsPerDrop(0) : 0;
  dropTimer = mode().dropInterval ? mode().dropInterval(0) : 0;
  popping = []; falling = []; particles = [];
  shot = null;
  slide = null; slideCool = 3; popStreak = 0;
  current = pickShotType();
  next = pickShotType();
  state = "play";
  aim = -Math.PI / 2;
}

// Only hand out types still on the board so the game can always be cleared.
function pickShotType() {
  const present = new Set();
  for (const row of grid) for (const t of row) if (t >= 0) present.add(t);
  const list = [...present];
  return list.length ? list[Math.floor(Math.random() * list.length)] : randType();
}

// ---- shooting --------------------------------------------------------------
function fire() {
  if (state !== "play" || shot) return;
  shot = { x: SHOOTER.x, y: SHOOTER.y, vx: Math.cos(aim) * SHOT_SPEED, vy: Math.sin(aim) * SHOT_SPEED, t: current };
  current = next;
  next = pickShotType();
  Sound.shoot();
}

function swap() {
  if (state !== "play" || shot) return;
  [current, next] = [next, current];
}

function updateShot(dt) {
  const steps = 8;
  for (let i = 0; i < steps && shot; i++) {
    shot.x += (shot.vx * dt) / steps;
    shot.y += (shot.vy * dt) / steps;
    const minX = BOARD_X + R, maxX = BOARD_X + COLS * D + R - R;
    if (shot.x < minX) { shot.x = minX; shot.vx = Math.abs(shot.vx); Sound.bounce(); }
    if (shot.x > maxX) { shot.x = maxX; shot.vx = -Math.abs(shot.vx); Sound.bounce(); }
    if (shot.y <= TOP + R) return land();
    for (let r = 0; r < grid.length; r++)
      for (let c = 0; c < colsIn(r); c++)
        if (grid[r][c] >= 0 && Math.hypot(shot.x - cellX(r, c), shot.y - cellY(r)) < D * 0.82) return land();
  }
}

function land() {
  // snap to the nearest empty cell
  const rGuess = Math.max(0, Math.round((shot.y - TOP - R) / ROW_H));
  let bestCell = null, bestD = Infinity;
  for (let r = Math.max(0, rGuess - 1); r <= rGuess + 1; r++) {
    for (let c = 0; c < colsIn(r); c++) {
      if (get(r, c) >= 0) continue;
      // must touch the ceiling or an existing bubble
      if (r > 0 && !neighbors(r, c).some(([a, b]) => get(a, b) >= 0)) continue;
      const d = Math.hypot(shot.x - cellX(r, c), shot.y - cellY(r));
      if (d < bestD) { bestD = d; bestCell = [r, c]; }
    }
  }
  const t = shot.t;
  shot = null;
  if (!bestCell) return;
  const [r, c] = bestCell;
  while (grid.length <= r) grid.push(new Array(COLS).fill(-1));
  grid[r][c] = t;

  const group = flood(r, c, (rr, cc) => get(rr, cc) === t);
  let dropped = 0, ceiling = false, missed = false;
  if (group.length >= 3) {
    for (const [a, b] of group) popBubble(a, b, 0);
    dropped = dropFloating();
    score += group.length * 10;
    Sound.pop(group.length);
    popStreak++;
  } else {
    Sound.land();
    missed = true;
    popStreak = 0;
  }
  // classic: every shot ticks the countdown, popped or not
  if (mode().shotsPerDrop && --shotsLeft <= 0) {
    dropCeiling();
    shotsLeft = mode().shotsPerDrop(drops);
    ceiling = true;
  }
  trimGrid();
  checkEnd();
  if (state !== "play") return; // win()/lose already showed their slide

  // reactions: at most one slide per shot, and rarely (see SLIDE_CHANCE)
  const shown =
    (group.length >= 3 && (group.length >= 5 || dropped >= 3) && maybeSlide("good", "bigPop")) ||
    (popStreak >= 3 && maybeSlide("good", "combo")) ||
    (ceiling && maybeSlide("bad", "ceiling")) ||
    (missed && maybeSlide("bad", "miss"));
  if (!shown) maybeSlide("random", "random");
}

function flood(r, c, ok) {
  const seen = new Set([r + "," + c]);
  const out = [[r, c]], q = [[r, c]];
  while (q.length) {
    const [a, b] = q.pop();
    for (const [x, y] of neighbors(a, b)) {
      const k = x + "," + y;
      if (!seen.has(k) && ok(x, y)) { seen.add(k); out.push([x, y]); q.push([x, y]); }
    }
  }
  return out;
}

function popBubble(r, c, delay) {
  popping.push({ x: cellX(r, c), y: cellY(r), t: grid[r][c], age: -delay });
  grid[r][c] = -1;
}

function dropFloating() {
  const anchored = new Set();
  for (let c = 0; c < colsIn(0); c++) {
    if (get(0, c) < 0 || anchored.has("0," + c)) continue;
    for (const [a, b] of flood(0, c, (x, y) => get(x, y) >= 0)) anchored.add(a + "," + b);
  }
  let n = 0;
  for (let r = 0; r < grid.length; r++)
    for (let c = 0; c < colsIn(r); c++)
      if (grid[r][c] >= 0 && !anchored.has(r + "," + c)) {
        falling.push({ x: cellX(r, c), y: cellY(r), vx: (Math.random() - 0.5) * 120, vy: -Math.random() * 150, t: grid[r][c], rot: 0, vr: (Math.random() - 0.5) * 6 });
        grid[r][c] = -1;
        n++;
      }
  if (n) { score += n * 20; Sound.drop(); }
  return n;
}

function dropCeiling() {
  shift = 1 - shift;          // row 0 changes parity, so everything below keeps its x
  grid.unshift(newRow(0));
  drops++;
  ceilAnim = 1;               // rows slide down into place (render only)
  Sound.thud();
  shakeT = 0.25;
}

function trimGrid() {
  while (grid.length && grid[grid.length - 1].every((t) => t < 0)) grid.pop();
}

function checkEnd() {
  if (!grid.length || !grid.some((row) => row.some((t) => t >= 0))) {
    if (mode().endless) { refill(); return; }
    win(); return;
  }
  for (let r = 0; r < grid.length; r++)
    if (cellY(r) + R > DEAD_Y && grid[r].some((t) => t >= 0)) { state = "lose"; menuT = 0; saveBest(); Sound.lose(); maybeSlide("bad", "lose"); return; }
}

// rush: a cleared board is worth a bonus and comes straight back
function refill() {
  score += 300;
  grid = [];
  for (let r = 0; r < 4; r++) grid.push(newRow(r));
  current = pickShotType(); next = pickShotType();
  Sound.win();
  maybeSlide("good", "bigPop");
}
function win() { state = "win"; menuT = 0; score += 500; saveBest(); Sound.win(); maybeSlide("good", "win"); }
function saveBest() {
  if (score > best) { best = score; try { localStorage.setItem(bestKey(), best); } catch (e) {} }
}

// ---- peek-in slides --------------------------------------------------------
// Reaction art (assets/slides.json, built from ~/Desktop/bubbles/*_slide_*) that
// peeks in from a random screen edge. Each image has a flat cut edge along its
// bottom, so it's rotated to sit flush against whichever edge it enters from.
// They're rare on purpose: a global cooldown plus a per-event chance.
const SLIDES = { good: [], bad: [], random: [] };
fetch("assets/slides.json").then((r) => r.json()).then((j) => {
  for (const kind in SLIDES)
    SLIDES[kind] = (j[kind] || []).map((src) => { const img = new Image(); img.src = "assets/" + src; return img; });
}).catch(() => {});

// Entrance speeds, picked at random per slide. `pop` = springy overshoot on arrival.
// `weight` = how often each speed is picked relative to the others.
const SLIDE_SPEEDS = [
  { name: "creep",  weight: 3, in: 2.2,  hold: 1.3, out: 0.6, pop: false }, // inches into frame
  { name: "normal", weight: 2, in: 0.8,  hold: 1.3, out: 0.4, pop: false },
  { name: "fast",   weight: 1, in: 0.35, hold: 1.3, out: 0.3, pop: true  },
];
function pickSpeed() {
  let r = Math.random() * SLIDE_SPEEDS.reduce((a, s) => a + s.weight, 0);
  for (const s of SLIDE_SPEEDS) if ((r -= s.weight) < 0) return s;
  return SLIDE_SPEEDS[0];
}
const SLIDE_COOLDOWN = 10;         // seconds between slides, minimum
const SLIDE_CHANCE = {             // chance a qualifying event shows a slide
  bigPop: 0.55,                    // popped 5+ bubbles or dropped 3+ in one shot
  combo: 0.45,                     // popped on 3 shots in a row
  win: 1,
  ceiling: 0.4,                    // the ceiling dropped a row
  miss: 0.3,                       // a shot that didn't pop anything
  lose: 1,
  random: 0.07,                    // any shot at all
};
let slide = null, slideCool = 3, popStreak = 0;

function maybeSlide(kind, reason) {
  const pool = SLIDES[kind];
  if (!pool.length || slide) return false;
  // win/lose always get through; everything else respects the cooldown
  const force = SLIDE_CHANCE[reason] >= 1;
  const chance = SLIDE_CHANCE[reason] * (mode().slideRate ?? 1);
  if (!force && (slideCool > 0 || Math.random() > chance)) return false;
  const img = pool[Math.floor(Math.random() * pool.length)];
  if (!img.naturalWidth) return false;
  const edge = ["bottom", "top", "left", "right"][Math.floor(Math.random() * 4)];
  const speed = pickSpeed();
  // dodge: which side of the launcher a bottom slide sits on
  slide = { img, edge, t: 0, along: 0.25 + Math.random() * 0.5, dodge: Math.random() < 0.5 ? -1 : 1, kind, speed };
  slideCool = mode().slideCooldown ?? SLIDE_COOLDOWN;
  if (speed.pop) Sound.whoosh();
  return true;
}

function updateSlide(dt) {
  slideCool = Math.max(0, slideCool - dt);
  if (slide && (slide.t += dt) > slide.speed.in + slide.speed.hold + slide.speed.out) slide = null;
}

function drawSlide() {
  if (!slide) return;
  const { img, edge, t, along, dodge, speed: sp } = slide;
  // reveal 0..1 with an overshoot on the way in
  let p;
  if (t < sp.in) {
    const k = t / sp.in;
    p = sp.pop ? 1 + 1.7 * Math.pow(k - 1, 3) + 0.7 * Math.pow(k - 1, 2) // overshoot
               : k * k * (3 - 2 * k);                                      // smooth ease in-out
  } else if (t < sp.in + sp.hold) p = 1;
  else { const k = (t - sp.in - sp.hold) / sp.out; p = 1 - k * k; }
  const side = edge === "left" || edge === "right";
  const h = side ? W * 0.36 : H * 0.26;      // how far it pokes into the screen
  const w = h * (img.naturalWidth / img.naturalHeight);
  // Bottom slides never cover the launcher: they sit beside it, pushed toward a
  // corner (hanging off-screen is fine, it reads as peeking round the edge).
  // Side slides only reach ~W*0.36 in, so they already clear the centred launcher.
  const bottomX = SHOOTER.x + dodge * (w / 2 + R + 30);
  const anchor = {
    bottom: [bottomX, H, 0],
    top:    [W * along, 0, Math.PI],
    left:   [0, H * along, Math.PI / 2],
    right:  [W, H * along, -Math.PI / 2],
  }[edge];
  ctx.save();
  ctx.translate(anchor[0], anchor[1]);
  ctx.rotate(anchor[2]);
  // local space: the cut edge sits on y=0, the character extends toward -y
  ctx.drawImage(img, -w / 2, -h * p, w, h);
  ctx.restore();
}

// ---- drawing ---------------------------------------------------------------
let shakeT = 0;

function drawBubble(t, x, y, scale = 1, alpha = 1, rot = 0) {
  const type = TYPES[t];
  const img = type.img;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(scale, scale);
  const style = STYLES[styleIdx];

  if (style === "Raw art") {
    const s = D * 1.12; // donuts are lumpy, let them overlap a hair so the board reads full
    if (img.complete && img.naturalWidth) ctx.drawImage(img, -s / 2, -s / 2, s, s);
  } else if (style === "Glass bubble") {
    // tinted soap-bubble shell with the art inside
    const g = ctx.createRadialGradient(-R * 0.3, -R * 0.35, R * 0.1, 0, 0, R);
    g.addColorStop(0, "rgba(255,255,255,0.35)");
    g.addColorStop(0.7, hexA(type.tint, 0.18));
    g.addColorStop(1, hexA(type.tint, 0.55));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, R - 1, 0, Math.PI * 2); ctx.fill();
    const s = D * 0.86;
    if (img.complete && img.naturalWidth) ctx.drawImage(img, -s / 2, -s / 2, s, s);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = hexA(type.tint, 0.95);
    ctx.beginPath(); ctx.arc(0, 0, R - 1.5, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(0, 0, R - 4, 0, Math.PI * 2); ctx.stroke();
    // shine
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.beginPath(); ctx.ellipse(-R * 0.42, -R * 0.45, R * 0.2, R * 0.11, -0.7, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(-R * 0.18, -R * 0.64, R * 0.06, 0, Math.PI * 2); ctx.fill();
  } else {
    // solid colour disc behind the art — makes types easiest to tell apart
    ctx.fillStyle = type.tint;
    ctx.beginPath(); ctx.arc(0, 0, R - 1, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.beginPath(); ctx.arc(0, 0, R - 5, 0, Math.PI * 2); ctx.fill();
    const s = D * 0.92;
    if (img.complete && img.naturalWidth) ctx.drawImage(img, -s / 2, -s / 2, s, s);
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#2a1f4a";
    ctx.beginPath(); ctx.arc(0, 0, R - 1.5, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

function drawBackground() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#ffd9ec");
  g.addColorStop(0.55, "#d9ccff");
  g.addColorStop(1, "#bfe6ff");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // soft floating dots
  const t = performance.now() / 1000;
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  for (let i = 0; i < 18; i++) {
    const x = (i * 97 + t * (8 + (i % 5) * 3)) % (W + 40) - 20;
    const y = (i * 151) % H;
    ctx.beginPath(); ctx.arc(x, y, 4 + (i % 4) * 3, 0, Math.PI * 2); ctx.fill();
  }
  // board well
  ctx.fillStyle = "rgba(255,255,255,0.28)";
  roundRect(BOARD_X - 6, TOP - 6, COLS * D + R + 12, DEAD_Y - TOP + 12, 18);
  ctx.fill();
  // ceiling bar
  ctx.fillStyle = "#6b4fc4";
  roundRect(BOARD_X - 6, TOP - 14, COLS * D + R + 12, 12, 6);
  ctx.fill();
  // danger line
  ctx.setLineDash([10, 8]);
  ctx.strokeStyle = "rgba(230,60,110,0.55)";
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(BOARD_X, DEAD_Y); ctx.lineTo(BOARD_X + COLS * D + R, DEAD_Y); ctx.stroke();
  ctx.setLineDash([]);
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// dotted aim line with up to two wall bounces
function drawAim() {
  if (state !== "play" || shot) return;
  let x = SHOOTER.x, y = SHOOTER.y, vx = Math.cos(aim), vy = Math.sin(aim);
  const minX = BOARD_X + R, maxX = BOARD_X + COLS * D;
  ctx.fillStyle = "rgba(107,79,196,0.55)";
  let dist = 0;
  for (let i = 0; i < 700; i++) {
    x += vx * 2; y += vy * 2; dist += 2;
    if (x < minX || x > maxX) vx = -vx;
    if (y < TOP + R) break;
    let hit = false;
    for (let r = 0; r < grid.length && !hit; r++)
      for (let c = 0; c < colsIn(r); c++)
        if (grid[r][c] >= 0 && Math.hypot(x - cellX(r, c), y - cellY(r)) < D * 0.82) { hit = true; break; }
    if (hit) break;
    if (dist % 18 === 0) { ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill(); }
  }
}

function drawShooter() {
  // launcher base
  ctx.fillStyle = "#6b4fc4";
  ctx.beginPath(); ctx.arc(SHOOTER.x, SHOOTER.y + 18, 46, Math.PI, 0); ctx.fill();
  ctx.save();
  ctx.translate(SHOOTER.x, SHOOTER.y);
  ctx.rotate(aim + Math.PI / 2);
  ctx.fillStyle = "#8f75e6";
  roundRect(-10, -58, 20, 40, 8); ctx.fill();
  ctx.restore();
  if (state === "play" && !shot) drawBubble(current, SHOOTER.x, SHOOTER.y);
  // next bubble
  ctx.fillStyle = "#4b3a8a";
  ctx.font = "bold 14px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("NEXT", NEXT_POS.x, NEXT_POS.y - 36);
  drawBubble(next, NEXT_POS.x, NEXT_POS.y, 0.75);
  ctx.fillText("tap to swap", NEXT_POS.x, NEXT_POS.y + 38);
  // ceiling countdown
  ctx.textAlign = "left";
  ctx.fillText("CEILING DROPS IN", 24, SHOOTER.y - 10);
  if (mode().shotsPerDrop) {
    const total = mode().shotsPerDrop(drops);
    for (let i = 0; i < total; i++) {
      ctx.fillStyle = i < shotsLeft ? (shotsLeft <= 1 ? "#e63c6e" : "#6b4fc4") : "rgba(107,79,196,0.2)";
      ctx.beginPath(); ctx.arc(32 + i * 18, SHOOTER.y + 12, 6, 0, Math.PI * 2); ctx.fill();
    }
  } else {
    const k = dropTimer / mode().dropInterval(drops);
    ctx.fillStyle = "rgba(107,79,196,0.2)";
    roundRect(24, SHOOTER.y + 4, 150, 14, 7); ctx.fill();
    ctx.fillStyle = k < 0.25 ? "#e63c6e" : "#6b4fc4";
    roundRect(24, SHOOTER.y + 4, Math.max(14, 150 * k), 14, 7); ctx.fill();
    ctx.fillStyle = "#4b3a8a";
    ctx.fillText(`${dropTimer.toFixed(1)}s`, 180, SHOOTER.y + 16);
  }
}
const NEXT_POS = { x: W - 70, y: SHOOTER.y + 10 };
const STYLE_BTN = { x: W - 170, y: 16, w: 154, h: 36 };

function drawHud() {
  ctx.fillStyle = "#4b3a8a";
  ctx.font = "bold 24px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(`${score}`, 20, 44);
  ctx.font = "bold 13px system-ui, sans-serif";
  ctx.fillText(`${mode().name} · BEST ${best}`, 20, 60);
  // style toggle
  ctx.fillStyle = "#6b4fc4";
  roundRect(STYLE_BTN.x, STYLE_BTN.y, STYLE_BTN.w, STYLE_BTN.h, 18); ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.font = "bold 14px system-ui, sans-serif";
  ctx.fillText(`STYLE: ${STYLES[styleIdx]}`, STYLE_BTN.x + STYLE_BTN.w / 2, STYLE_BTN.y + 23);
}

// menu = title screen and game-over screen, both with the mode buttons
const modeBtn = (i) => ({ x: 60, y: 430 + i * 130, w: W - 120, h: 110 });

function drawOverlay() {
  if (state === "play") return;
  ctx.fillStyle = "rgba(42,31,74,0.72)";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  const title = state === "win" ? "CLEARED!" : state === "lose" ? "GAME OVER" : "BUBBLE POP";
  ctx.font = "bold 56px system-ui, sans-serif";
  ctx.fillText(title, W / 2, 250);
  ctx.font = "bold 22px system-ui, sans-serif";
  if (state === "menu") ctx.fillText("pick a mode", W / 2, 300);
  else ctx.fillText(`${mode().name}   ·   Score ${score}   ·   Best ${best}`, W / 2, 300);
  MODES.forEach((m, i) => {
    const b = modeBtn(i);
    const sel = i === modeIdx;
    ctx.fillStyle = sel ? "#8f75e6" : "#6b4fc4";
    roundRect(b.x, b.y, b.w, b.h, 22); ctx.fill();
    if (sel) { ctx.strokeStyle = "#fff"; ctx.lineWidth = 3; ctx.stroke(); }
    ctx.fillStyle = "#fff";
    ctx.font = "bold 30px system-ui, sans-serif";
    ctx.fillText(m.name, W / 2, b.y + 42);
    ctx.font = "16px system-ui, sans-serif";
    m.desc.forEach((line, j) => ctx.fillText(line, W / 2, b.y + 68 + j * 20));
  });
  ctx.font = "14px system-ui, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.fillText("tap a mode to play  ·  ↑/↓ + Enter", W / 2, modeBtn(MODES.length).y + 10);
}

// ---- update / loop ---------------------------------------------------------
function update(dt) {
  if (state !== "play") menuT += dt;
  if (state === "play" && mode().dropInterval && (dropTimer -= dt) <= 0) {
    dropCeiling();
    dropTimer = mode().dropInterval(drops);
    trimGrid();
    checkEnd();
    if (state === "play") maybeSlide("bad", "ceiling");
  }
  ceilAnim = Math.max(0, ceilAnim - dt / 0.18);
  if (shot) updateShot(dt);
  for (const p of popping) p.age += dt;
  for (const p of popping) if (p.age >= 0 && !p.burst) { p.burst = true; burst(p.x, p.y, TYPES[p.t].tint); }
  popping = popping.filter((p) => p.age < 0.22);
  for (const f of falling) { f.vy += 1800 * dt; f.x += f.vx * dt; f.y += f.vy * dt; f.rot += f.vr * dt; }
  falling = falling.filter((f) => f.y < H + R);
  for (const p of particles) { p.vy += 900 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
  particles = particles.filter((p) => p.life > 0);
  shakeT = Math.max(0, shakeT - dt);
  updateSlide(dt);
}

function burst(x, y, color) {
  for (let i = 0; i < 10; i++) {
    const a = Math.random() * Math.PI * 2, s = 120 + Math.random() * 220;
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 100, life: 0.5 + Math.random() * 0.3, color, r: 3 + Math.random() * 4 });
  }
}

function render() {
  ctx.save();
  if (shakeT > 0) ctx.translate((Math.random() - 0.5) * 10 * shakeT * 4, (Math.random() - 0.5) * 10 * shakeT * 4);
  drawBackground();
  for (let r = 0; r < grid.length; r++)
    for (let c = 0; c < colsIn(r); c++)
      if (grid[r][c] >= 0) drawBubble(grid[r][c], cellX(r, c), cellY(r) - ceilAnim * ROW_H);
  for (const p of popping) {
    const k = Math.max(0, p.age) / 0.22;
    drawBubble(p.t, p.x, p.y, 1 + k * 0.4, 1 - k);
  }
  for (const f of falling) drawBubble(f.t, f.x, f.y, 1, 1, f.rot);
  for (const p of particles) {
    ctx.globalAlpha = Math.min(1, p.life * 2);
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  drawAim();
  if (shot) drawBubble(shot.t, shot.x, shot.y);
  drawShooter();
  drawHud();
  ctx.restore();
  drawOverlay();
  drawSlide();
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  update(dt);
  render();
  requestAnimationFrame(frame);
}

// ---- input -----------------------------------------------------------------
let scale = 1;
function resize() {
  const dpr = window.devicePixelRatio || 1;
  scale = Math.min(window.innerWidth / W, window.innerHeight / H);
  canvas.style.width = W * scale + "px";
  canvas.style.height = H * scale + "px";
  canvas.width = W * scale * dpr;
  canvas.height = H * scale * dpr;
  ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
}
window.addEventListener("resize", resize);

function toGame(e) {
  const rect = canvas.getBoundingClientRect();
  return { x: (e.clientX - rect.left) / scale, y: (e.clientY - rect.top) / scale };
}
function setAim(p) {
  const a = Math.atan2(p.y - SHOOTER.y, p.x - SHOOTER.x);
  // keep it pointing upward
  aim = Math.max(-Math.PI + 0.12, Math.min(-0.12, a > Math.PI / 2 ? -Math.PI + 0.12 : a > 0 ? -0.12 : a));
}
const inRect = (p, b) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
function cycleStyle() {
  styleIdx = (styleIdx + 1) % STYLES.length;
  try { localStorage.setItem("bubblepop_style", styleIdx); } catch (e) {}
}

let aiming = false;
canvas.addEventListener("pointerdown", (e) => {
  Sound.unlock();
  const p = toGame(e);
  if (inRect(p, STYLE_BTN)) return cycleStyle();
  if (state !== "play") {
    if (menuT < 0.6) return; // don't eat the tap that ended the game
    MODES.forEach((m, i) => { if (inRect(p, modeBtn(i))) startGame(i); });
    return;
  }
  if (Math.hypot(p.x - NEXT_POS.x, p.y - NEXT_POS.y) < 44) return swap();
  if (p.y > SHOOTER.y - 20) return; // taps down by the launcher don't fire
  aiming = true;
  setAim(p);
});
canvas.addEventListener("pointermove", (e) => {
  const p = toGame(e);
  if (aiming || e.pointerType === "mouse") if (p.y < SHOOTER.y - 20) setAim(p);
});
canvas.addEventListener("pointerup", (e) => {
  if (!aiming) return;
  aiming = false;
  fire();
});
window.addEventListener("keydown", (e) => {
  Sound.unlock();
  if (e.key === "s" || e.key === "S") cycleStyle();
  else if (state !== "play") {
    if (e.key === "ArrowUp") modeIdx = (modeIdx + MODES.length - 1) % MODES.length;
    else if (e.key === "ArrowDown") modeIdx = (modeIdx + 1) % MODES.length;
    else if ((e.key === " " || e.key === "Enter") && menuT > 0.6) startGame(modeIdx);
  }
  else if (e.key === " " || e.key === "Enter") fire();
  else if (e.key === "Shift" || e.key === "x" || e.key === "X") swap();
  else if (e.key === "ArrowLeft") aim = Math.max(-Math.PI + 0.12, aim - 0.05);
  else if (e.key === "ArrowRight") aim = Math.min(-0.12, aim + 0.05);
  else if (e.key === "m" || e.key === "M") Sound.muted = !Sound.muted;
});
document.addEventListener("gesturestart", (e) => e.preventDefault());

// ---- tiny synth SFX --------------------------------------------------------
const Sound = {
  ac: null, muted: false,
  unlock() { if (!this.ac) try { this.ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} },
  tone(freq, dur, type = "sine", vol = 0.15, slide = 0) {
    if (!this.ac || this.muted) return;
    const t = this.ac.currentTime, o = this.ac.createOscillator(), g = this.ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.ac.destination);
    o.start(t); o.stop(t + dur);
  },
  shoot() { this.tone(520, 0.08, "triangle", 0.1, 300); },
  bounce() { this.tone(300, 0.04, "square", 0.04); },
  land() { this.tone(220, 0.08, "sine", 0.12, -60); },
  pop(n) { for (let i = 0; i < Math.min(n, 6); i++) setTimeout(() => this.tone(600 + i * 110, 0.09, "sine", 0.14, 400), i * 40); },
  drop() { this.tone(700, 0.35, "triangle", 0.1, -500); },
  whoosh() { this.tone(250, 0.22, "triangle", 0.08, 500); },
  thud() { this.tone(90, 0.25, "sine", 0.25, -40); },
  win() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.tone(f, 0.18, "triangle", 0.14), i * 110)); },
  lose() { [392, 330, 262].forEach((f, i) => setTimeout(() => this.tone(f, 0.25, "sawtooth", 0.07), i * 160)); },
};

resize();
reset();          // a board to show behind the title screen
state = "menu";
requestAnimationFrame(frame);
