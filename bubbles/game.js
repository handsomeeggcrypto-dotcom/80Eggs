// Bubble Pop — proof-of-concept bubble shooter with character art bubbles.
// Aim with mouse/finger, release to shoot. Match 3+ of the same character to pop.
// Bubbles cut off from the ceiling fall.
//
// Screens: title → LEVELS (map of hand-made levels from levels.js) or the
// CLASSIC / RUSH quick-play modes.

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
const ALL_TYPES = TYPES.map((_, i) => i);

// Level rating icon: 0–3 "hamstars" per level.
const HAMSTAR = new Image();
HAMSTAR.src = "assets/hamstar.png";
let HAMSTAR_DIM = null; // greyed-out copy for hamstars not yet earned
HAMSTAR.onload = () => {
  const c = document.createElement("canvas");
  c.width = HAMSTAR.naturalWidth; c.height = HAMSTAR.naturalHeight;
  const g = c.getContext("2d");
  g.drawImage(HAMSTAR, 0, 0);
  try {
    const d = g.getImageData(0, 0, c.width, c.height);
    for (let i = 0; i < d.data.length; i += 4) {
      const v = 0.3 * d.data[i] + 0.59 * d.data[i + 1] + 0.11 * d.data[i + 2];
      d.data[i] = d.data[i + 1] = d.data[i + 2] = 150 + v * 0.35;
    }
    g.putImageData(d, 0, 0);
  } catch (e) {}
  HAMSTAR_DIM = c;
};
const hamstarWord = (n) => `${n} hamstar${n === 1 ? "" : "s"}`;

// Title-screen background (built from ~/Desktop/bubbles/menu_01). It fills the
// screen anchored to the BOTTOM, so the big hamster peeking up stays in view; the
// title sits in the empty top area and the buttons over its belly.
const MENU_BG = new Image();
MENU_BG.src = "assets/menu/menu_01.jpg";

// Optional map background art: drop a tall image at assets/map_bg.png and it's
// tiled down the level map instead of the drawn pastel background.
const MAP_BG = new Image();
MAP_BG.src = "assets/map_bg.png";

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

// Cell values: -1 empty · 0..5 a character (TYPES index) · STONE · FRIEND + type
const STONE = 50;                   // can't be matched; only falls when cut loose
const FRIEND = 100;                 // trapped friend: can't be matched, drop it to rescue it
const isColor = (v) => v >= 0 && v < STONE;
const isFriend = (v) => v >= FRIEND;

// ---- modes -----------------------------------------------------------------
// CLASSIC: clear the board. Every shot ticks the ceiling countdown, and each drop
//   makes the next one come sooner (shotsPerDrop).
// RUSH: endless. The ceiling drops on a timer that speeds up after every drop
//   (dropInterval); clearing the board just refills it for a bonus.
// Levels (levels.js) become a mode object too, via levelMode().
const MODES = [
  {
    id: "classic", name: "CLASSIC", startRows: 6, types: ALL_TYPES,
    desc: "Clear the board. The ceiling drops sooner and sooner.",
    shotsPerDrop: (drops) => Math.max(3, 6 - Math.floor(drops / 2)), // 6,6,5,5,4,4,3…
  },
  {
    id: "rush", name: "RUSH", startRows: 5, endless: true, types: ALL_TYPES,
    desc: "Endless. The ceiling drops on a faster and faster timer.",
    dropInterval: (drops) => Math.max(2.2, 8 - drops * 0.5),          // seconds: 8, 7.5, 7…
    slideRate: 0.5,      // half the usual slide chances…
    slideCooldown: 18,   // …and a longer gap between them, so they don't pile onto the pressure
  },
];

function levelMode(i) {
  const L = LEVELS[i];
  return {
    id: "level", levelIdx: i, name: `LEVEL ${i + 1}`, title: L.name,
    types: L.types, goal: L.goal, target: L.target, shots: L.shots, layout: L.layout,
    shotsPerDrop: L.drop ? () => L.drop : null,
  };
}

let cur = MODES[0];
const mode = () => cur;

let grid, shift, score, best, shotsLeft, dropLeft, drops, dropTimer, ceilAnim, current, next, shot;
let popping, falling, particles, popups, state, aim, menuT, focus, loseReason, stars;
let friendsTotal, friendsFreed, banner;
let specials, armed, summon, ghosts, endSticker;
state = "title"; menuT = 1; focus = 0;

const bestKey = () => "bubblepop_best_" + mode().id + (mode().levelIdx ?? "");
function loadBest() { try { best = +localStorage.getItem(bestKey()) || 0; } catch (e) { best = 0; } }

// level progress: { "<levelIdx>": stars }
let progress = {};
try { progress = JSON.parse(localStorage.getItem("bubblepop_levels")) || {}; } catch (e) {}
const levelStars = (i) => progress[i] || 0;
const levelUnlocked = (i) => i === 0 || levelStars(i - 1) > 0;
const totalStars = () => LEVELS.reduce((a, _, i) => a + levelStars(i), 0);
function nextLevelToPlay() {
  const i = LEVELS.findIndex((_, i) => !levelStars(i));
  return i < 0 ? LEVELS.length - 1 : i;
}
function saveLevelStars(i, n) {
  if (n <= levelStars(i)) return;
  progress[i] = n;
  try { localStorage.setItem("bubblepop_levels", JSON.stringify(progress)); } catch (e) {}
}

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
function randType() {
  const pal = mode().types;
  return pal[Math.floor(Math.random() * pal.length)];
}

function buildLevelGrid(m) {
  grid = [];
  m.layout.forEach((line, r) => {
    const cells = line.replace(/ /g, "");
    const row = new Array(COLS).fill(-1);
    for (let c = 0; c < colsIn(r) && c < cells.length; c++) row[c] = cellFromChar(cells[c]);
    grid.push(row);
  });
  for (const [r, c] of floatingCells()) grid[r][c] = -1; // safety net for layout typos
  trimGrid();
}
function cellFromChar(ch) {
  if (ch === ".") return -1;
  if (ch === "#") return STONE;
  if (ch === "@") return FRIEND + randType();
  if (ch >= "1" && ch <= "9") return mode().types[(+ch - 1) % mode().types.length];
  return randType(); // "*"
}

// ---- screens ---------------------------------------------------------------
function setState(s) { state = s; menuT = 0; focus = 0; banner = null; }

function startMode(i) {
  cur = MODES[i];
  loadBest();
  reset();
}
function startLevel(i) {
  cur = levelMode(i);
  loadBest();
  reset();
  banner = { title: `LEVEL ${i + 1}`, sub: `${cur.title} · ${goalText(true)}`, t: 0 };
}
function openMap() {
  setState("map");
  mapFocusOn(mode().levelIdx ?? nextLevelToPlay());
}
function quitToMenu() {
  if (mode().id === "level") openMap();
  else setState("title");
}

function reset() {
  shift = 0;
  if (mode().layout) buildLevelGrid(mode());
  else { grid = []; for (let r = 0; r < mode().startRows; r++) grid.push(newRow(r)); }
  score = 0;
  drops = 0;
  ceilAnim = 0;
  shotsLeft = mode().shots || 0;
  dropLeft = mode().shotsPerDrop ? mode().shotsPerDrop(0) : 0;
  dropTimer = mode().dropInterval ? mode().dropInterval(0) : 0;
  friendsTotal = grid.reduce((a, row) => a + row.filter(isFriend).length, 0);
  friendsFreed = 0;
  popping = []; falling = []; particles = []; popups = [];
  shot = null;
  banner = null;
  slide = null; slideCool = 3; popStreak = 0;
  specials = { ...SPECIALS_PER_GAME };
  armed = null; summon = null; ghosts = []; endSticker = null;
  current = pickShotType();
  next = pickShotType();
  state = "play";
  aim = -Math.PI / 2;
}

// Only hand out characters still on the board so the game can always be cleared.
function pickShotType() {
  const present = new Set();
  for (const row of grid) for (const t of row) if (isColor(t)) present.add(t);
  const list = [...present];
  return list.length ? list[Math.floor(Math.random() * list.length)] : randType();
}

function goalText(long) {
  const m = mode();
  if (m.goal === "rescue") return long ? "Drop the trapped friends!" : `Friends freed ${friendsFreed}/${friendsTotal}`;
  if (m.goal === "score") return long ? `Score ${m.target} points!` : `Score ${score}/${m.target}`;
  return "Clear the board";
}

// ---- shooting --------------------------------------------------------------
function fire() {
  if (state !== "play" || busy()) return;
  if (mode().shots && shotsLeft <= 0) return;
  if (armed === "torpedo") return fireTorpedo();
  shot = { x: SHOOTER.x, y: SHOOTER.y, vx: Math.cos(aim) * SHOT_SPEED, vy: Math.sin(aim) * SHOT_SPEED, t: current };
  current = next;
  next = pickShotType();
  Sound.shoot();
}

function swap() {
  if (state !== "play" || busy()) return;
  [current, next] = [next, current];
}

function updateShot(dt) {
  if (shot.torpedo) return updateTorpedo(dt);
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
  let dropped = 0, freed = 0, ceiling = false, missed = false;
  if (group.length >= 3) {
    for (const [a, b] of group) popBubble(a, b, 0);
    [dropped, freed] = dropFloating();
    score += group.length * 10;
    Sound.pop(group.length);
    popStreak++;
  } else {
    Sound.land();
    missed = true;
    popStreak = 0;
  }
  if (mode().shots) shotsLeft--;
  // every shot ticks the ceiling countdown, popped or not
  if (mode().shotsPerDrop && --dropLeft <= 0) {
    dropCeiling();
    dropLeft = mode().shotsPerDrop(drops);
    ceiling = true;
  }
  trimGrid();
  checkEnd();
  if (state !== "play") return; // win()/lose already showed their slide

  // reactions: at most one slide per shot, and rarely (see SLIDE_CHANCE)
  const shown =
    ((freed > 0 || (group.length >= 3 && (group.length >= 5 || dropped >= 3))) && maybeSlide("bigPop")) ||
    (popStreak >= 3 && maybeSlide("combo")) ||
    (ceiling && maybeSlide("ceiling")) ||
    (missed && maybeSlide("miss"));
  if (!shown) maybeSlide("shot");
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

// cells no longer connected to the ceiling
function floatingCells() {
  const anchored = new Set();
  for (let c = 0; c < colsIn(0); c++) {
    if (get(0, c) < 0 || anchored.has("0," + c)) continue;
    for (const [a, b] of flood(0, c, (x, y) => get(x, y) >= 0)) anchored.add(a + "," + b);
  }
  const out = [];
  for (let r = 0; r < grid.length; r++)
    for (let c = 0; c < colsIn(r); c++)
      if (grid[r][c] >= 0 && !anchored.has(r + "," + c)) out.push([r, c]);
  return out;
}

// returns [bubbles dropped, friends freed]
function dropFloating() {
  let n = 0, freed = 0;
  for (const [r, c] of floatingCells()) {
    const v = grid[r][c];
    falling.push({ x: cellX(r, c), y: cellY(r), vx: (Math.random() - 0.5) * 120, vy: -Math.random() * 150, t: v, rot: 0, vr: (Math.random() - 0.5) * 6 });
    grid[r][c] = -1;
    n++;
    if (isFriend(v)) {
      freed++;
      score += 100;
      spawnPopup("FREED!", cellX(r, c), cellY(r));
      burst(cellX(r, c), cellY(r), "#ffc93c");
    }
  }
  friendsFreed += freed;
  if (n) { score += n * 20; Sound.drop(); }
  if (freed) Sound.win();
  return [n, freed];
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

function goalMet() {
  const g = mode().goal || "clear";
  if (g === "score") return score >= mode().target;
  const anyFriend = grid.some((row) => row.some(isFriend));
  if (g === "rescue") return !anyFriend;
  return !anyFriend && !grid.some((row) => row.some(isColor)); // stones may stay
}

function checkEnd() {
  if (goalMet()) {
    if (mode().endless) { refill(); return; }
    win(); return;
  }
  for (let r = 0; r < grid.length; r++)
    if (cellY(r) + R > DEAD_Y && grid[r].some((t) => t >= 0)) return lose("GAME OVER");
  if (mode().shots && shotsLeft <= 0) lose("OUT OF SHOTS");
}

// rush: a cleared board is worth a bonus and comes straight back
function refill() {
  score += 300;
  grid = [];
  for (let r = 0; r < 4; r++) grid.push(newRow(r));
  current = pickShotType(); next = pickShotType();
  Sound.win();
  maybeSlide("bigPop");
}

function win() {
  setState("win");
  endSticker = pickSticker("win");
  if (mode().id === "level") {
    const frac = shotsLeft / mode().shots;
    stars = frac >= 0.4 ? 3 : frac >= 0.2 ? 2 : 1;
    score += shotsLeft * 50; // leftover shots bonus
    saveLevelStars(mode().levelIdx, stars);
  } else score += 500;
  saveBest();
  Sound.win();
  maybeSlide("win");
}
function lose(reason) {
  setState("lose");
  endSticker = pickSticker("lose");
  loseReason = reason;
  saveBest();
  Sound.lose();
  maybeSlide("lose");
}
function saveBest() {
  if (score > best) { best = score; try { localStorage.setItem(bestKey(), best); } catch (e) {} }
}

// ---- special moves ---------------------------------------------------------
// TORPEDO: arm it, then shoot — a hamster rockets along the aim line (bouncing off
//   the walls) and pops every bubble and stone it passes through. Friends are safe:
//   it flies over them, and they fall free if it cuts what they hang from.
// GHOSTS: a summoning circle opens and GHOST_COUNT ghosts float up out of it; each
//   flies to a random character bubble, pops it, and keeps floating away.
// Neither uses up a shot. Everyone gets SPECIALS_PER_GAME of each per game.
const SPECIALS_PER_GAME = { torpedo: 1, ghosts: 1 };
const TORPEDO_SPEED = 1100;
const TORPEDO_REACH = R * 1.35;     // how wide a path it cuts
const GHOST_COUNT = 6;
const GHOST_SIZE = D * 1.15;        // ghosts are drawn about one bubble big, whatever the art size
const SUMMON = { x: W / 2, y: 610, size: 230 };
const FX = {};
for (const n of ["hamster_projectile_01", "summon_01", "ghost_01", "ghost_02"]) {
  FX[n] = new Image();
  FX[n].src = `assets/fx/${n}.png`;
}
const GHOST_ART = ["ghost_01", "ghost_02"];
const SPECIAL_BTNS = {
  torpedo: { x: 386, y: SHOOTER.y + 14, r: 25, key: "1" },
  ghosts:  { x: 444, y: SHOOTER.y + 14, r: 25, key: "2" },
};
const busy = () => !!shot || !!summon || ghosts.length > 0;
const fxReady = (img) => img && img.complete && img.naturalWidth;

function useSpecial(kind) {
  if (state !== "play" || busy() || !specials[kind]) return;
  if (kind === "torpedo") { armed = armed === "torpedo" ? null : "torpedo"; Sound.bounce(); return; }
  specials.ghosts--;
  armed = null;
  summon = { t: 0, spawned: 0 };
  Sound.whoosh();
}

function fireTorpedo() {
  specials.torpedo--;
  armed = null;
  shot = { torpedo: true, x: SHOOTER.x, y: SHOOTER.y, vx: Math.cos(aim) * TORPEDO_SPEED, vy: Math.sin(aim) * TORPEDO_SPEED, hits: 0 };
  Sound.whoosh();
  shakeT = 0.12;
}

function updateTorpedo(dt) {
  const steps = 10;
  for (let i = 0; i < steps; i++) {
    shot.x += (shot.vx * dt) / steps;
    shot.y += (shot.vy * dt) / steps;
    const minX = BOARD_X + R, maxX = BOARD_X + COLS * D;
    if (shot.x < minX) { shot.x = minX; shot.vx = Math.abs(shot.vx); Sound.bounce(); }
    if (shot.x > maxX) { shot.x = maxX; shot.vx = -Math.abs(shot.vx); Sound.bounce(); }
    for (let r = 0; r < grid.length; r++)
      for (let c = 0; c < colsIn(r); c++) {
        const v = grid[r][c];
        if (v < 0 || isFriend(v)) continue;
        if (Math.hypot(shot.x - cellX(r, c), shot.y - cellY(r)) < TORPEDO_REACH) {
          popBubble(r, c, 0);
          shot.hits++;
          score += 10;
          Sound.tone(500 + Math.min(shot.hits, 12) * 60, 0.07, "sine", 0.1, 300);
        }
      }
    if (shot.y < TOP - R * 2) return endTorpedo();
  }
  // sparkle trail
  if (Math.random() < 0.8) particles.push({ x: shot.x, y: shot.y, vx: (Math.random() - 0.5) * 60, vy: 40, life: 0.35, color: "#ffe27a", r: 2 + Math.random() * 3 });
}

function endTorpedo() {
  const hits = shot.hits;
  shot = null;
  const [dropped, freed] = dropFloating();
  trimGrid();
  checkEnd();
  if (state === "play" && (hits >= 5 || dropped >= 3 || freed)) maybeSlide("bigPop");
}

function pickGhostTarget() {
  const taken = new Set(ghosts.filter((g) => g.target).map((g) => g.target.join()));
  const cells = [];
  for (let r = 0; r < grid.length; r++)
    for (let c = 0; c < colsIn(r); c++)
      if (isColor(grid[r][c]) && !taken.has(r + "," + c)) cells.push([r, c]);
  return cells.length ? cells[Math.floor(Math.random() * cells.length)] : null;
}

function updateSpecials(dt) {
  if (summon) {
    summon.t += dt;
    // ghosts start rising once the circle has opened, one every 0.22s
    while (summon.spawned < GHOST_COUNT && summon.t > 0.45 + summon.spawned * 0.22) {
      summon.spawned++;
      ghosts.push({
        x: SUMMON.x + (Math.random() - 0.5) * 90, y: SUMMON.y, t: 0, wob: Math.random() * 6,
        img: FX[GHOST_ART[Math.floor(Math.random() * GHOST_ART.length)]], target: pickGhostTarget(),
      });
    }
    if (summon.t > 0.45 + GHOST_COUNT * 0.22 + 0.6) summon = null;
  }
  for (const g of ghosts) {
    g.t += dt;
    const sway = Math.sin(g.t * 5 + g.wob) * 70 * dt;
    if (g.target && !isColor(get(g.target[0], g.target[1]))) g.target = state === "play" ? pickGhostTarget() : null;
    if (g.target && state === "play") {
      const [r, c] = g.target;
      const tx = cellX(r, c), ty = cellY(r);
      const dx = tx - g.x, dy = ty - g.y, d = Math.hypot(dx, dy);
      if (d < 14) {
        popBubble(r, c, 0);
        score += 10;
        Sound.tone(880, 0.12, "triangle", 0.1, -300);
        g.target = null;
        dropFloating();
        trimGrid();
        checkEnd();
      } else {
        const sp = Math.min(d, 380 * dt);
        g.x += (dx / d) * sp + sway;
        g.y += (dy / d) * sp;
      }
    } else {
      g.x += sway;
      g.y -= 300 * dt; // drift up and away
    }
  }
  ghosts = ghosts.filter((g) => g.y > -GHOST_SIZE);
}

function drawSpecials() {
  // summoning circle: opens, turns slowly, then fades
  if (summon && fxReady(FX.summon_01)) {
    const img = FX.summon_01, t = summon.t, end = 0.45 + GHOST_COUNT * 0.22 + 0.6;
    const open = Math.min(1, t / 0.35), fade = Math.min(1, (end - t) / 0.4);
    const sc = (0.3 + 0.7 * (1 - Math.pow(1 - open, 3))) * (SUMMON.size / Math.max(img.naturalWidth, img.naturalHeight));
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(open, fade));
    ctx.translate(SUMMON.x, SUMMON.y);
    ctx.rotate(Math.sin(t * 1.5) * 0.08);
    ctx.fillStyle = "rgba(200,40,70,0.18)";
    ctx.beginPath(); ctx.ellipse(0, 10, SUMMON.size * 0.5, SUMMON.size * 0.3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.drawImage(img, (-img.naturalWidth * sc) / 2, (-img.naturalHeight * sc) / 2, img.naturalWidth * sc, img.naturalHeight * sc);
    ctx.restore();
  }
  for (const g of ghosts) {
    if (!fxReady(g.img)) continue;
    const k = GHOST_SIZE / Math.max(g.img.naturalWidth, g.img.naturalHeight);
    const w = g.img.naturalWidth * k, h = g.img.naturalHeight * k;
    ctx.save();
    ctx.globalAlpha = Math.min(1, g.t / 0.25) * 0.95;
    ctx.translate(g.x, g.y);
    ctx.rotate(Math.sin(g.t * 4 + g.wob) * 0.15);
    ctx.drawImage(g.img, -w / 2, -h / 2, w, h);
    ctx.restore();
  }
  if (shot && shot.torpedo) drawTorpedo(shot.x, shot.y, Math.atan2(shot.vy, shot.vx), 1);
}

// Only the hamster + its dust puff are drawn (a crop of the art — the long speed
// lines are left out). Coordinates are in the built 512px-wide asset.
const TORPEDO_CROP = { x: 50, y: 62, w: 320, h: 88, cx: 242, cy: 44, hamsterH: 63 };
function drawTorpedo(x, y, angle, size) {
  const img = FX.hamster_projectile_01;
  if (!fxReady(img)) return;
  const f = img.naturalWidth / 512; // in case the art is rebuilt at another size
  const c = TORPEDO_CROP;
  const k = (D * 1.1 * size) / c.hamsterH; // hamster ≈ one bubble tall
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  if (Math.cos(angle) < 0) ctx.scale(1, -1); // flying left: keep the hamster the right way up
  ctx.drawImage(img, c.x * f, c.y * f, c.w * f, c.h * f, -c.cx * k, -c.cy * k, c.w * k, c.h * k);
  ctx.restore();
}

function drawSpecialButtons() {
  for (const kind of Object.keys(SPECIAL_BTNS)) {
    const b = SPECIAL_BTNS[kind], n = specials[kind];
    const isArmed = armed === kind;
    const usable = state === "play" && n > 0 && !busy();
    ctx.save();
    ctx.globalAlpha = usable || isArmed ? 1 : 0.4;
    if (isArmed) {
      ctx.fillStyle = `rgba(255,201,60,${0.5 + 0.3 * Math.sin(performance.now() / 120)})`;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 7, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#6b4fc4";
    ctx.stroke();
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r - 2, 0, Math.PI * 2); ctx.clip();
    if (kind === "torpedo") drawTorpedo(b.x, b.y, 0, 0.62);
    else if (fxReady(FX.ghost_01)) {
      const img = FX.ghost_01, k = (b.r * 1.6) / Math.max(img.naturalWidth, img.naturalHeight);
      ctx.drawImage(img, b.x - (img.naturalWidth * k) / 2, b.y - (img.naturalHeight * k) / 2, img.naturalWidth * k, img.naturalHeight * k);
    }
    ctx.restore();
    // count badge
    ctx.fillStyle = n > 0 ? "#ff7fb0" : "#b8b0cc";
    ctx.beginPath(); ctx.arc(b.x + b.r * 0.72, b.y - b.r * 0.72, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = `bold 12px ${FONT}`;
    ctx.textAlign = "center";
    ctx.fillText(n, b.x + b.r * 0.72, b.y - b.r * 0.72 + 4);
  }
}

// ---- win / lose stickers ---------------------------------------------------
// One sticker (assets/stickers.json, from ~/Desktop/bubbles/win_* and lose_*)
// pops onto every end screen. STICKER_WEIGHT makes some come up more often.
const STICKER_WEIGHT = { win_03: 3, lose_03: 3 }; // everything else counts 1
const STICKERS = { win: [], lose: [] };
fetch("assets/stickers.json", { cache: "no-cache" }).then((r) => r.json()).then((j) => {
  for (const kind in STICKERS)
    STICKERS[kind] = (j[kind] || []).map((src) => {
      const img = new Image();
      img.src = "assets/" + src;
      img.weight = STICKER_WEIGHT[src.split("/").pop().replace(/\.png$/, "")] || 1;
      return img;
    });
}).catch(() => {});

function pickSticker(kind) {
  const pool = STICKERS[kind].filter((img) => img.naturalWidth);
  let r = Math.random() * pool.reduce((a, img) => a + img.weight, 0);
  for (const img of pool) if ((r -= img.weight) < 0) return img;
  return pool[0] || null;
}

function drawSticker() {
  const img = endSticker;
  if (!img || !img.naturalWidth) return;
  const k0 = Math.min(1, menuT / 0.35);
  const pop = k0 < 1 ? 1 + 2.2 * Math.pow(k0 - 1, 3) + 1.2 * Math.pow(k0 - 1, 2) : 1; // springy pop-in
  const fit = Math.min(185 / img.naturalWidth, 145 / img.naturalHeight);
  const w = img.naturalWidth * fit * pop, h = img.naturalHeight * fit * pop;
  ctx.save();
  ctx.translate(W / 2, 104);
  ctx.rotate(-0.08 + Math.sin(menuT * 2.2) * 0.04);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
}

// ---- peek-in slides --------------------------------------------------------
// Reaction art (assets/slides.json, built from ~/Desktop/bubbles/*_slide_*) that
// peeks in from a random screen edge. Each image has a flat cut edge along its
// bottom, so it's rotated to sit flush against whichever edge it enters from.
// Some are also cut on a side ("cut": ["left"] etc.) — those peek round a CORNER,
// with the side cut pressed against the neighbouring screen edge. One cut on both
// sides would only fit full-width, so it hangs from the top.
// Every slide goes in ONE pool (the good/bad/random file names no longer matter)
// and is dealt like a shuffled deck: all of them show once before any repeats.
// They're rare on purpose: a global cooldown plus a per-event chance.
let SLIDES = [];
fetch("assets/slides.json", { cache: "no-cache" }).then((r) => r.json()).then((j) => {
  SLIDES = Object.values(j).flat().map((e) => {
    const { src, cut = [] } = typeof e === "string" ? { src: e } : e;
    const img = new Image();
    img.src = "assets/" + src;
    img.cut = cut;
    return img;
  });
}).catch(() => {});

let slideDeck = [];
function nextSlideImage() {
  const ready = SLIDES.filter((img) => img.naturalWidth);
  if (!ready.length) return null;
  slideDeck = slideDeck.filter((img) => ready.includes(img));
  if (!slideDeck.length) {
    slideDeck = ready.slice();
    for (let i = slideDeck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [slideDeck[i], slideDeck[j]] = [slideDeck[j], slideDeck[i]];
    }
    // don't show the same slide twice in a row across a reshuffle
    if (slideDeck.length > 1 && slideDeck[slideDeck.length - 1] === lastSlideImg) slideDeck.unshift(slideDeck.pop());
  }
  return slideDeck.pop();
}
let lastSlideImg = null;

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
const SLIDE_CHANCE = {             // chance an event shows a slide (any slide can show for any event)
  bigPop: 0.55,                    // popped 5+ / dropped 3+ in one shot, or freed a friend
  combo: 0.45,                     // popped on 3 shots in a row
  win: 1,
  ceiling: 0.4,                    // the ceiling dropped a row
  miss: 0.3,                       // a shot that didn't pop anything
  lose: 1,
  shot: 0.07,                      // any other shot
};
let slide = null, slideCool = 3, popStreak = 0;

function maybeSlide(reason) {
  if (slide) return false;
  // win/lose always get through; everything else respects the cooldown
  const force = SLIDE_CHANCE[reason] >= 1;
  const chance = SLIDE_CHANCE[reason] * (mode().slideRate ?? 1);
  if (!force && (slideCool > 0 || Math.random() > chance)) return false;
  const img = nextSlideImage();
  if (!img) return false;
  lastSlideImg = img;
  const both = img.cut.includes("left") && img.cut.includes("right");
  const edges = both ? ["top"] : ["bottom", "top", "left", "right"];
  const edge = edges[Math.floor(Math.random() * edges.length)];
  const speed = pickSpeed();
  // dodge: which side of the launcher a bottom slide sits on
  slide = { img, edge, t: 0, along: 0.25 + Math.random() * 0.5, dodge: Math.random() < 0.5 ? -1 : 1, speed };
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
  const peek = side ? W * 0.36 : H * 0.26;   // how far it pokes into the screen
  const aspect = img.naturalWidth / img.naturalHeight;
  const cutL = img.cut.includes("left"), cutR = img.cut.includes("right");
  let w = peek * aspect, h = peek;
  if (cutL && cutR) { w = W; h = W / aspect; } // full-width: only its top `peek` shows
  const span = side ? H : W;                   // length of the edge it sits on
  // position along the edge, in the image's own left→right direction. Corner
  // peekers press their cut side against the end of the edge.
  let u;
  if (cutL && !cutR) u = w / 2;
  else if (cutR && !cutL) u = span - w / 2;
  else if (cutL && cutR) u = span / 2;
  else if (edge === "bottom") u = SHOOTER.x + dodge * (w / 2 + R + 30); // beside the launcher
  else u = span * along;
  // the image's left→right runs: bottom → screen right, top → screen left,
  // left edge → screen down, right edge → screen up
  const anchor = {
    bottom: [u, H, 0],
    top:    [W - u, 0, Math.PI],
    left:   [0, u, Math.PI / 2],
    right:  [W, H - u, -Math.PI / 2],
  }[edge];
  ctx.save();
  ctx.translate(anchor[0], anchor[1]);
  ctx.rotate(anchor[2]);
  // local space: the cut edge sits on y=0, the character extends toward -y
  ctx.drawImage(img, -w / 2, -Math.min(h, peek) * p, w, h);
  ctx.restore();
}

// ---- drawing ---------------------------------------------------------------
let shakeT = 0;
const FONT = "system-ui, sans-serif";

function drawBubble(v, x, y, scale = 1, alpha = 1, rot = 0) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(scale, scale);
  if (v === STONE) drawStone();
  else if (isFriend(v)) drawFriend(v - FRIEND);
  else drawCharacter(v);
  ctx.restore();
}

function drawCharacter(t) {
  const type = TYPES[t];
  const img = type.img;
  const ready = img.complete && img.naturalWidth;
  const style = STYLES[styleIdx];
  if (style === "Raw art") {
    const s = D * 1.12; // donuts are lumpy, let them overlap a hair so the board reads full
    if (ready) ctx.drawImage(img, -s / 2, -s / 2, s, s);
  } else if (style === "Glass bubble") {
    // tinted soap-bubble shell with the art inside
    const g = ctx.createRadialGradient(-R * 0.3, -R * 0.35, R * 0.1, 0, 0, R);
    g.addColorStop(0, "rgba(255,255,255,0.35)");
    g.addColorStop(0.7, hexA(type.tint, 0.18));
    g.addColorStop(1, hexA(type.tint, 0.55));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, R - 1, 0, Math.PI * 2); ctx.fill();
    const s = D * 0.86;
    if (ready) ctx.drawImage(img, -s / 2, -s / 2, s, s);
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
    if (ready) ctx.drawImage(img, -s / 2, -s / 2, s, s);
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#2a1f4a";
    ctx.beginPath(); ctx.arc(0, 0, R - 1.5, 0, Math.PI * 2); ctx.stroke();
  }
}

// grey rock with a couple of cracks
function drawStone() {
  const g = ctx.createRadialGradient(-R * 0.3, -R * 0.35, R * 0.1, 0, 0, R);
  g.addColorStop(0, "#c9c4d6");
  g.addColorStop(1, "#7a7390");
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, R - 1, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#4a4460";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-R * 0.5, -R * 0.2); ctx.lineTo(-R * 0.1, R * 0.05); ctx.lineTo(-R * 0.2, R * 0.45);
  ctx.moveTo(R * 0.15, -R * 0.55); ctx.lineTo(R * 0.35, -R * 0.15);
  ctx.stroke();
}

// trapped friend: the character behind golden cage bars
function drawFriend(t) {
  const img = TYPES[t].img;
  const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 250);
  ctx.fillStyle = `rgba(255,214,90,${0.25 + pulse * 0.25})`;
  ctx.beginPath(); ctx.arc(0, 0, R + 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#fff6d8";
  ctx.beginPath(); ctx.arc(0, 0, R - 1, 0, Math.PI * 2); ctx.fill();
  const s = D * 0.84;
  if (img.complete && img.naturalWidth) ctx.drawImage(img, -s / 2, -s / 2, s, s);
  ctx.save();
  ctx.beginPath(); ctx.arc(0, 0, R - 1, 0, Math.PI * 2); ctx.clip();
  ctx.strokeStyle = "rgba(201,143,20,0.85)";
  ctx.lineWidth = 3;
  for (const bx of [-R * 0.5, 0, R * 0.5]) { ctx.beginPath(); ctx.moveTo(bx, -R); ctx.lineTo(bx, R); ctx.stroke(); }
  ctx.restore();
  ctx.strokeStyle = "#e0a820";
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(0, 0, R - 2, 0, Math.PI * 2); ctx.stroke();
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

// a hamstar icon centred on x,y; `size` = its width/height. Unearned ones are
// a faded grey copy.
function drawHamstar(x, y, size, earned) {
  const img = earned ? HAMSTAR : HAMSTAR_DIM;
  if (!img || (earned && !HAMSTAR.naturalWidth)) return;
  ctx.save();
  if (!earned) ctx.globalAlpha *= 0.55;
  ctx.drawImage(img, x - size / 2, y - size / 2, size, size);
  ctx.restore();
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

// dotted aim line with wall bounces
function drawAim() {
  if (state !== "play" || busy()) return;
  let x = SHOOTER.x, y = SHOOTER.y, vx = Math.cos(aim), vy = Math.sin(aim);
  const minX = BOARD_X + R, maxX = BOARD_X + COLS * D;
  const torpedo = armed === "torpedo"; // the torpedo's line runs straight through bubbles
  ctx.fillStyle = torpedo ? "rgba(230,160,20,0.8)" : "rgba(107,79,196,0.55)";
  let dist = 0;
  for (let i = 0; i < 700; i++) {
    x += vx * 2; y += vy * 2; dist += 2;
    if (x < minX || x > maxX) vx = -vx;
    if (y < TOP + R) break;
    let hit = false;
    for (let r = 0; r < grid.length && !hit && !torpedo; r++)
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
  const outOfShots = mode().shots && shotsLeft <= 0;
  if (state === "play" && !shot && !outOfShots) {
    if (armed === "torpedo") drawTorpedo(SHOOTER.x, SHOOTER.y, aim, 0.9);
    else drawBubble(current, SHOOTER.x, SHOOTER.y);
  }
  // next bubble
  ctx.fillStyle = "#4b3a8a";
  ctx.font = `bold 14px ${FONT}`;
  ctx.textAlign = "center";
  ctx.fillText("NEXT", NEXT_POS.x, NEXT_POS.y - 36);
  drawBubble(next, NEXT_POS.x, NEXT_POS.y, 0.75);
  ctx.fillText("tap to swap", NEXT_POS.x, NEXT_POS.y + 38);
  ctx.textAlign = "left";

  if (mode().shots) {
    // levels: shots left, plus a small ceiling countdown if the level has one
    ctx.fillText("SHOTS LEFT", 24, SHOOTER.y - 26);
    ctx.font = `bold 34px ${FONT}`;
    ctx.fillStyle = shotsLeft <= 3 ? "#e63c6e" : "#4b3a8a";
    ctx.fillText(shotsLeft, 24, SHOOTER.y + 10);
    if (mode().shotsPerDrop) {
      ctx.font = `bold 11px ${FONT}`;
      ctx.fillStyle = "#4b3a8a";
      ctx.fillText("CEILING", 24, SHOOTER.y + 34);
      drawDropDots(28, SHOOTER.y + 46, 5, 14);
    }
  } else if (mode().shotsPerDrop) {
    ctx.fillText("CEILING DROPS IN", 24, SHOOTER.y - 10);
    drawDropDots(32, SHOOTER.y + 12, 6, 18);
  } else {
    ctx.fillText("CEILING DROPS IN", 24, SHOOTER.y - 10);
    const k = dropTimer / mode().dropInterval(drops);
    ctx.fillStyle = "rgba(107,79,196,0.2)";
    roundRect(24, SHOOTER.y + 4, 150, 14, 7); ctx.fill();
    ctx.fillStyle = k < 0.25 ? "#e63c6e" : "#6b4fc4";
    roundRect(24, SHOOTER.y + 4, Math.max(14, 150 * k), 14, 7); ctx.fill();
    ctx.fillStyle = "#4b3a8a";
    ctx.fillText(`${dropTimer.toFixed(1)}s`, 180, SHOOTER.y + 16);
  }
}
function drawDropDots(x, y, r, gap) {
  const total = mode().shotsPerDrop(drops);
  for (let i = 0; i < total; i++) {
    ctx.fillStyle = i < dropLeft ? (dropLeft <= 1 ? "#e63c6e" : "#6b4fc4") : "rgba(107,79,196,0.2)";
    ctx.beginPath(); ctx.arc(x + i * gap, y, r, 0, Math.PI * 2); ctx.fill();
  }
}
const NEXT_POS = { x: W - 70, y: SHOOTER.y + 10 };
const STYLE_BTN = { x: W - 170, y: 16, w: 154, h: 36 };
const QUIT_BTN = { x: W - 240, y: 16, w: 60, h: 36 };

function drawPill(b, label, fill = "#6b4fc4") {
  ctx.fillStyle = fill;
  roundRect(b.x, b.y, b.w, b.h, b.h / 2); ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.font = `bold 14px ${FONT}`;
  ctx.fillText(label, b.x + b.w / 2, b.y + b.h / 2 + 5);
}

function drawHud() {
  ctx.fillStyle = "#4b3a8a";
  ctx.font = `bold 24px ${FONT}`;
  ctx.textAlign = "left";
  ctx.fillText(`${score}`, 20, 30);
  ctx.font = `bold 13px ${FONT}`;
  const sub = mode().id === "level" ? `${mode().name} · ${goalText(false)}` : `${mode().name} · BEST ${best}`;
  ctx.fillText(sub, 20, 49);
  drawPill(STYLE_BTN, `STYLE: ${STYLES[styleIdx]}`);
  if (state === "play") drawPill(QUIT_BTN, "QUIT", "#8f75e6");
}

// ---- menus (title + end screens) -------------------------------------------
// Each screen is a title plus a column of buttons; tap one or use ↑/↓ + Enter.
function menuButtons() {
  if (state === "title") return [
    { label: "LEVELS", sub: `${totalStars()} / ${LEVELS.length * 3} hamstars  ·  hand-made puzzles`, act: openMap },
    { label: MODES[0].name, sub: MODES[0].desc, act: () => startMode(0) },
    { label: MODES[1].name, sub: MODES[1].desc, act: () => startMode(1) },
  ];
  if (mode().id === "level") {
    const i = mode().levelIdx;
    if (state === "win") return [
      ...(i + 1 < LEVELS.length ? [{ label: "NEXT LEVEL", act: () => startLevel(i + 1) }] : []),
      { label: "REPLAY", act: () => startLevel(i) },
      { label: "MAP", act: openMap },
    ];
    return [
      { label: "RETRY", act: () => startLevel(i) },
      { label: "MAP", act: openMap },
    ];
  }
  return [
    { label: "PLAY AGAIN", act: () => startMode(MODES.indexOf(mode())) },
    { label: "MENU", act: () => setState("title") },
  ];
}
const menuArt = () => state === "title" && MENU_BG.complete && MENU_BG.naturalWidth;
function buttonRects(list) {
  const art = menuArt();
  const y0 = state === "title" ? (art ? 548 : 380) : mode().id === "level" && state === "win" ? 480 : 420;
  let y = y0;
  return list.map((b) => {
    const h = b.sub ? (art ? 84 : 96) : 70;
    const r = { x: 70, y, w: W - 140, h };
    y += h + (art ? 12 : 18);
    return r;
  });
}

function drawButtons() {
  const list = menuButtons();
  const art = menuArt();
  buttonRects(list).forEach((b, i) => {
    const sel = i === focus;
    ctx.fillStyle = sel ? "#8f75e6" : art ? "rgba(107,79,196,0.94)" : "#6b4fc4";
    roundRect(b.x, b.y, b.w, b.h, 22); ctx.fill();
    if (sel || art) { ctx.strokeStyle = sel ? "#fff" : "rgba(255,255,255,0.55)"; ctx.lineWidth = 3; ctx.stroke(); }
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.font = `bold 28px ${FONT}`;
    ctx.fillText(list[i].label, W / 2, b.y + (list[i].sub ? (art ? 38 : 42) : 45));
    if (list[i].sub) { ctx.font = `15px ${FONT}`; ctx.fillText(list[i].sub, W / 2, b.y + (art ? 64 : 72)); }
  });
}

// title screen over the menu art
function drawMenu() {
  const img = MENU_BG;
  const k = Math.max(W / img.naturalWidth, H / img.naturalHeight); // cover
  const w = img.naturalWidth * k, h = img.naturalHeight * k;
  ctx.drawImage(img, (W - w) / 2, H - h, w, h); // bottom-anchored
  ctx.textAlign = "center";
  ctx.lineJoin = "round";
  const bob = Math.sin(menuT * 2) * 4;
  ctx.font = `bold 64px ${FONT}`;
  ctx.lineWidth = 12;
  ctx.strokeStyle = "#4b3a8a";
  ctx.strokeText("BUBBLE POP", W / 2, 118 + bob);
  ctx.fillStyle = "#fff";
  ctx.fillText("BUBBLE POP", W / 2, 118 + bob);
  ctx.font = `bold 20px ${FONT}`;
  ctx.lineWidth = 6;
  ctx.strokeText("pick how to play", W / 2, 160);
  ctx.fillText("pick how to play", W / 2, 160);
  drawButtons();
  drawPill(STYLE_BTN, `STYLE: ${STYLES[styleIdx]}`);
}

function drawOverlay() {
  ctx.fillStyle = "rgba(42,31,74,0.72)";
  ctx.fillRect(0, 0, W, H);
  drawSlide(); // on menus the reaction art sits behind the text and buttons
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  const lvl = mode().id === "level";
  let title = "BUBBLE POP";
  if (state === "win") title = lvl ? "LEVEL CLEAR!" : "CLEARED!";
  if (state === "lose") title = loseReason || "GAME OVER";
  if (state === "win" || state === "lose") drawSticker();
  ctx.fillStyle = "#fff";
  ctx.font = `bold 52px ${FONT}`;
  ctx.fillText(title, W / 2, 230);
  ctx.font = `bold 22px ${FONT}`;
  if (state === "title") ctx.fillText("pick how to play", W / 2, 285);
  else if (lvl && state === "lose") ctx.fillText(`${mode().name} · ${mode().title}   ·   ${hamstarWord(0)}`, W / 2, 285);
  else if (lvl) ctx.fillText(`${mode().name} · ${mode().title}   ·   Score ${score}`, W / 2, 285);
  else ctx.fillText(`${mode().name}   ·   Score ${score}   ·   Best ${best}`, W / 2, 285);
  if (state === "win" && lvl) {
    // hamstars pop in one after another
    for (let i = 0; i < 3; i++) {
      const k = Math.min(1, Math.max(0, (menuT - 0.2 - i * 0.25) / 0.25));
      const s = k < 1 ? 0.6 + k * 0.6 : 1;
      drawHamstar(W / 2 + (i - 1) * 100, 360 - (i === 1 ? 14 : 0), 96 * s, i < stars && k > 0);
    }
    ctx.fillStyle = "#fff";
    ctx.font = `bold 22px ${FONT}`;
    ctx.fillText(`You earned ${hamstarWord(stars)}!`, W / 2, 448);
  }
  drawButtons();
}

// level intro banner
function drawBanner() {
  if (!banner) return;
  const a = Math.min(1, banner.t / 0.2, (2.4 - banner.t) / 0.4);
  if (a <= 0) return;
  ctx.globalAlpha = a;
  ctx.fillStyle = "rgba(42,31,74,0.78)";
  ctx.fillRect(0, H * 0.42, W, 110);
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.font = `bold 38px ${FONT}`;
  ctx.fillText(banner.title, W / 2, H * 0.42 + 50);
  ctx.font = `bold 18px ${FONT}`;
  ctx.fillText(banner.sub, W / 2, H * 0.42 + 84);
  ctx.globalAlpha = 1;
}

// floating score text ("FREED!")
function spawnPopup(text, x, y) { popups.push({ text, x, y, t: 0 }); }
function drawPopups() {
  ctx.textAlign = "center";
  ctx.font = `bold 22px ${FONT}`;
  ctx.lineWidth = 4;
  for (const p of popups) {
    ctx.globalAlpha = Math.max(0, 1 - p.t / 1.2);
    const y = p.y - p.t * 60;
    ctx.strokeStyle = "#6b4fc4";
    ctx.strokeText(p.text, p.x, y);
    ctx.fillStyle = "#fff";
    ctx.fillText(p.text, p.x, y);
  }
  ctx.globalAlpha = 1;
}

// ---- level map -------------------------------------------------------------
// A winding path of level nodes, level 1 at the bottom. Drag or scroll to move.
const MAP_SPACING = 120, MAP_PAD_TOP = 190, MAP_PAD_BOTTOM = 170, NODE_R = 34;
const MAP_BACK = { x: 14, y: 16, w: 90, h: 38 };
let mapScroll = 0;                                  // world y at the top of the screen
const mapH = () => MAP_PAD_TOP + (LEVELS.length - 1) * MAP_SPACING + MAP_PAD_BOTTOM;
const pathAt = (t) => ({ x: W / 2 + Math.sin(t * 1.05) * 170, y: mapH() - MAP_PAD_BOTTOM - t * MAP_SPACING });
const clampScroll = (s) => Math.max(0, Math.min(mapH() - H, s));
function mapFocusOn(i) { mapScroll = clampScroll(pathAt(i).y - H * 0.55); }

function drawMap() {
  const now = performance.now() / 1000;
  ctx.save();
  ctx.translate(0, -mapScroll);

  // background: optional art, else a drawn pastel sky with floating character bubbles
  if (MAP_BG.complete && MAP_BG.naturalWidth) {
    const th = (W * MAP_BG.naturalHeight) / MAP_BG.naturalWidth;
    for (let y = 0; y < mapH(); y += th) ctx.drawImage(MAP_BG, 0, y, W, th);
  } else {
    const g = ctx.createLinearGradient(0, 0, 0, mapH());
    g.addColorStop(0, "#bfe6ff");
    g.addColorStop(0.5, "#d9ccff");
    g.addColorStop(1, "#ffd9ec");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, mapH());
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 60; i++) {
      const x = rnd() * W, y = rnd() * mapH(), r = 6 + rnd() * 26;
      ctx.fillStyle = `rgba(255,255,255,${0.2 + rnd() * 0.3})`;
      ctx.beginPath(); ctx.arc(x, y + Math.sin(now + i) * 4, r, 0, Math.PI * 2); ctx.fill();
    }
    for (let i = 0; i < 16; i++) {
      const x = rnd() * W, y = rnd() * mapH();
      drawBubble(i % TYPES.length, x, y + Math.sin(now * 0.8 + i) * 6, 0.7, 0.35);
    }
  }

  // the road: a soft white band with dots, coloured up to the furthest unlocked level
  const reached = nextLevelToPlay();
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(255,255,255,0.65)";
  ctx.lineWidth = 30;
  ctx.beginPath();
  for (let t = 0; t <= LEVELS.length - 1 + 1e-6; t += 0.05) { const p = pathAt(t); ctx.lineTo(p.x, p.y); }
  ctx.stroke();
  for (let t = 0; t < LEVELS.length - 1; t += 0.12) {
    const p = pathAt(t);
    ctx.fillStyle = t < reached ? "#ff7fb0" : "rgba(107,79,196,0.3)";
    ctx.beginPath(); ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2); ctx.fill();
  }

  // nodes
  LEVELS.forEach((L, i) => {
    const { x, y } = pathAt(i);
    if (y - mapScroll < -80 || y - mapScroll > H + 80) return;
    const open = levelUnlocked(i);
    const isNext = open && i === reached && !levelStars(i);
    if (isNext) {
      const pr = NODE_R + 8 + Math.sin(now * 4) * 4;
      ctx.fillStyle = "rgba(255,127,176,0.35)";
      ctx.beginPath(); ctx.arc(x, y, pr, 0, Math.PI * 2); ctx.fill();
    }
    const g = ctx.createRadialGradient(x - 10, y - 12, 4, x, y, NODE_R);
    g.addColorStop(0, open ? "#a48cf0" : "#ddd8ea");
    g.addColorStop(1, open ? "#5e43b8" : "#aaa3bf");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, NODE_R, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#fff";
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.fillStyle = "#fff";
    if (open) {
      ctx.font = `bold 26px ${FONT}`;
      ctx.fillText(i + 1, x, y + 9);
      for (let s = 0; s < 3; s++) drawHamstar(x + (s - 1) * 24, y + NODE_R + 14 - (s === 1 ? 4 : 0), 26, s < levelStars(i));
      // tiny goal badge
      const badge = L.goal === "rescue" ? "♥" : L.goal === "score" ? "⚡" : null; // not ★: that reads as a rating
      if (badge) {
        ctx.fillStyle = "#ff7fb0";
        ctx.beginPath(); ctx.arc(x + NODE_R * 0.75, y - NODE_R * 0.75, 12, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.font = `bold 14px ${FONT}`;
        ctx.fillText(badge, x + NODE_R * 0.75, y - NODE_R * 0.75 + 5);
      }
    } else {
      ctx.font = `22px ${FONT}`;
      ctx.fillText("🔒", x, y + 8);
    }
    // the player's marker bobs above the next level to play
    if (isNext) drawBubble(2, x, y - NODE_R - 34 + Math.sin(now * 3) * 5, 0.85);
  });
  ctx.restore();

  // header
  ctx.fillStyle = "rgba(107,79,196,0.92)";
  ctx.fillRect(0, 0, W, 70);
  drawPill(MAP_BACK, "‹ BACK", "#8f75e6");
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.font = `bold 24px ${FONT}`;
  ctx.fillText("LEVELS", W / 2, 44);
  ctx.textAlign = "right";
  ctx.font = `bold 18px ${FONT}`;
  ctx.fillText(`${totalStars()}/${LEVELS.length * 3}`, W - 20, 42);
  drawHamstar(W - 34 - ctx.measureText(`${totalStars()}/${LEVELS.length * 3}`).width, 35, 34, true);
}

function mapTap(p) {
  if (inRect(p, MAP_BACK)) return setState("title");
  for (let i = 0; i < LEVELS.length; i++) {
    const { x, y } = pathAt(i);
    if (Math.hypot(p.x - x, p.y + mapScroll - y) < NODE_R + 10) {
      if (levelUnlocked(i)) startLevel(i);
      else Sound.bounce();
      return;
    }
  }
}

// ---- update / loop ---------------------------------------------------------
function update(dt) {
  menuT += dt;
  if (banner && (banner.t += dt) > 2.4) banner = null;
  if (state === "play" && mode().dropInterval && (dropTimer -= dt) <= 0) {
    dropCeiling();
    dropTimer = mode().dropInterval(drops);
    trimGrid();
    checkEnd();
    if (state === "play") maybeSlide("ceiling");
  }
  ceilAnim = Math.max(0, ceilAnim - dt / 0.18);
  if (shot) updateShot(dt);
  updateSpecials(dt);
  for (const p of popping) p.age += dt;
  for (const p of popping) if (p.age >= 0 && !p.burst) { p.burst = true; burst(p.x, p.y, isColor(p.t) ? TYPES[p.t].tint : "#9a94ad"); }
  popping = popping.filter((p) => p.age < 0.22);
  for (const f of falling) { f.vy += 1800 * dt; f.x += f.vx * dt; f.y += f.vy * dt; f.rot += f.vr * dt; }
  falling = falling.filter((f) => f.y < H + R);
  for (const p of particles) { p.vy += 900 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
  particles = particles.filter((p) => p.life > 0);
  for (const p of popups) p.t += dt;
  popups = popups.filter((p) => p.t < 1.2);
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
  if (state === "map") { drawMap(); drawSlide(); return; }
  if (menuArt()) { drawMenu(); return; }
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
  if (shot && !shot.torpedo) drawBubble(shot.t, shot.x, shot.y);
  drawSpecials();
  drawShooter();
  drawSpecialButtons();
  drawPopups();
  drawHud();
  ctx.restore();
  drawBanner();
  if (state === "play") drawSlide();
  else drawOverlay();
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

let aiming = false, drag = null;
canvas.addEventListener("pointerdown", (e) => {
  Sound.unlock();
  const p = toGame(e);
  if (state === "map") { drag = { y0: p.y, s0: mapScroll, moved: false }; return; }
  if (inRect(p, STYLE_BTN)) return cycleStyle();
  if (state !== "play") {
    if (state !== "title" && menuT < 0.6) return; // don't eat the tap that ended the game
    const list = menuButtons();
    buttonRects(list).forEach((b, i) => { if (inRect(p, b)) list[i].act(); });
    return;
  }
  if (inRect(p, QUIT_BTN)) return quitToMenu();
  for (const kind of Object.keys(SPECIAL_BTNS)) {
    const b = SPECIAL_BTNS[kind];
    if (Math.hypot(p.x - b.x, p.y - b.y) < b.r + 6) return useSpecial(kind);
  }
  if (Math.hypot(p.x - NEXT_POS.x, p.y - NEXT_POS.y) < 44) return swap();
  if (p.y > SHOOTER.y - 20) return; // taps down by the launcher don't fire
  aiming = true;
  setAim(p);
});
canvas.addEventListener("pointermove", (e) => {
  const p = toGame(e);
  if (state === "map") {
    if (!drag) return;
    if (Math.abs(p.y - drag.y0) > 8) drag.moved = true;
    if (drag.moved) mapScroll = clampScroll(drag.s0 - (p.y - drag.y0));
    return;
  }
  if (aiming || e.pointerType === "mouse") if (p.y < SHOOTER.y - 20) setAim(p);
});
canvas.addEventListener("pointerup", (e) => {
  if (state === "map") {
    if (drag && !drag.moved) mapTap(toGame(e));
    drag = null;
    return;
  }
  if (!aiming) return;
  aiming = false;
  fire();
});
canvas.addEventListener("wheel", (e) => {
  if (state !== "map") return;
  e.preventDefault();
  mapScroll = clampScroll(mapScroll + e.deltaY);
}, { passive: false });

window.addEventListener("keydown", (e) => {
  Sound.unlock();
  const k = e.key;
  if (k === "s" || k === "S") return cycleStyle();
  if (k === "m" || k === "M") { Sound.muted = !Sound.muted; return; }
  if (state === "map") {
    if (k === "Escape") setState("title");
    else if (k === "ArrowUp") mapScroll = clampScroll(mapScroll - MAP_SPACING);
    else if (k === "ArrowDown") mapScroll = clampScroll(mapScroll + MAP_SPACING);
    else if (k === "Enter" || k === " ") startLevel(nextLevelToPlay());
    return;
  }
  if (state !== "play") {
    const n = menuButtons().length;
    if (k === "ArrowUp") focus = (focus + n - 1) % n;
    else if (k === "ArrowDown") focus = (focus + 1) % n;
    else if ((k === " " || k === "Enter") && (state === "title" || menuT > 0.6)) menuButtons()[focus].act();
    return;
  }
  if (k === "Escape") quitToMenu();
  else if (k === "1") useSpecial("torpedo");
  else if (k === "2") useSpecial("ghosts");
  else if (k === " " || k === "Enter") fire();
  else if (k === "Shift" || k === "x" || k === "X") swap();
  else if (k === "ArrowLeft") aim = Math.max(-Math.PI + 0.12, aim - 0.05);
  else if (k === "ArrowRight") aim = Math.min(-0.12, aim + 0.05);
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
loadBest();
reset();          // a board to show behind the title screen
setState("title");
menuT = 1;
requestAnimationFrame(frame);
