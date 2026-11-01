// DEFEND YOUR LLC: grab the invaders, fling them, keep Moemoe LLC HQ standing.
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d", { alpha: false });
const W = 1280, H = 720;
const GROUND = 620;      // where feet touch
const WALL_X = 905;      // front of the HQ
// where the HQ picture sits: its source is 1024x1536, wall at x=38, roof deck at y=668
const HQ_K = 0.385, HQ_X = WALL_X - 38 * HQ_K, HQ_Y = GROUND + 4 - 1536 * HQ_K;
const ROOF_Y = HQ_Y + 668 * HQ_K;
const PIT_X = 690, PIT_W = 150;
const GRAVITY = 1500;
const SAFE_FALL = 620;   // landing slower than this does no damage
const FONT = '"Trebuchet MS", system-ui, sans-serif';
const BOARD = "llc-defend";
const BEST_KEY = "moecastle_best", MUTE_KEY = "moecastle_muted";

// ---- who attacks ----------------------------------------------------------
const TYPES = {
  grunt:   { hp: 1.0, speed: 62,  size: 124, dmg: 3,  pay: 5,  who: ["egg", "nug", "hazy", "deet", "isi", "kizuna", "denx", "vara", "emma", "mishiuz", "leech"] },
  runner:  { hp: 0.7, speed: 150, size: 114,  dmg: 2,  pay: 7,  who: ["hawky", "tash"] },
  thrower: { hp: 0.9, speed: 55,  size: 120, dmg: 4,  pay: 9,  who: ["qosha"], standoff: 300 },
  heavy:   { hp: 2.6, speed: 36,  size: 164, dmg: 7,  pay: 16, who: ["slothulu", "mrcat"], mass: 1.7 },
  bomber:  { hp: 0.5, speed: 92,  size: 114, dmg: 60, pay: 12, who: ["parrot"], bomb: true },
  boss:    { hp: 6.0, speed: 28,  size: 220, dmg: 14, pay: 90, who: ["bradley", "heartmoe", "bluu"], mass: 2.6, boss: true },
};
const NAMES = { heartmoe: "HIROKI", bradley: "BRADLEY", bluu: "BLUU" };

// ---- spending ---------------------------------------------------------------
const JOBS = {
  intern: { name: "Crayon Intern", desc: "Throws crayons from the roof" },
  legal:  { name: "Legal Dept",    desc: "Launches invaders with lawsuits" },
  fixer:  { name: "Maintenance",   desc: "Repairs the HQ all day" },
};
const REPAIR_PER_HP = 0.7;
const SHOP = [
  { id: "wall", name: "Thicker Walls", desc: "+60 max HQ health", base: 120, grow: 90, max: 8 },
  { id: "grip", name: "Heavier Landings", desc: "Falls hurt 30% more", base: 180, grow: 140, max: 5 },
  { id: "pit",  name: "Hiring Pit", desc: "Drop invaders in. They work for you now", base: 350, grow: 0, max: 1, fromDay: 5 },
  { id: "perk", name: "Better Perks", desc: "Your employees work 15% faster", base: 350, grow: 250, max: 4 },
];

// ---- art --------------------------------------------------------------------
const img = {};
let manifest = {};
const ARENA_ORDER = [7, 13, 12, 9, 14, 15, 3, 23, 19, 10, 11, 25];  // one backdrop per day, then round again
const ARENAS = [];
let hqImg = null, hqLayer = null;
let backLayer = null, backFor = -1;
function load(src) {
  return new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; });
}
async function boot() {
  manifest = await (await fetch("assets/manifest.json")).json();
  const jobs = [];
  for (const c of Object.keys(manifest)) {
    img[c] = {};
    for (const [f] of manifest[c]) jobs.push(load(`assets/sprites/${c}_${f}.webp`).then((i) => { img[c][f] = i; }));
  }
  ARENA_ORDER.forEach((n, i) => jobs.push(load(`assets/arenas/arena${n}.webp`).then((a) => { ARENAS[i] = a; })));
  jobs.push(load("assets/hq.webp").then((i) => { hqImg = i; }));
  await Promise.all(jobs);
  prepareArt();
  state = "title";
}
function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
  return c;
}
// Shrinking a picture on every frame is slow, so each fighter pose is shrunk once and kept.
const spriteCache = new Map();
function sprite(who, name, size) {
  const key = who + "|" + name + "|" + size;
  let sp = spriteCache.get(key);
  if (sp !== undefined) return sp;
  const im = frame(who, name), base = frame(who, "walk_01");
  sp = null;
  if (im && base) {
    const k = size / base.height, w = im.width * k, h = im.height * k;
    const c = makeCanvas(w, h), g = c.getContext("2d");
    g.imageSmoothingQuality = "high";
    g.drawImage(im, 0, 0, c.width, c.height);
    sp = { c, w: c.width, h: c.height };
  }
  spriteCache.set(key, sp);
  return sp;
}
function prepareArt() {
  for (const T of Object.values(TYPES)) for (const who of T.who) for (const [name] of manifest[who] || []) sprite(who, name, T.size);
  if (hqImg) {
    hqLayer = makeCanvas(1024 * HQ_K, 1536 * HQ_K);
    const g = hqLayer.getContext("2d");
    g.imageSmoothingQuality = "high";
    g.drawImage(hqImg, 0, 0, hqLayer.width, hqLayer.height);
  }
}
function frame(c, name) {
  const s = img[c] || {};
  return s[name] || s.idle_01 || s.walk_01;
}

// ---- sound ------------------------------------------------------------------
const Sound = (() => {
  const make = (f) => { const a = new Audio(`assets/audio/${f}`); a.preload = "auto"; return a; };
  // effects are decoded up front and mixed by Web Audio, which never holds up a frame
  const AC = window.AudioContext || window.webkitAudioContext;
  const ac = AC ? new AC() : null;
  const sfx = {}, lastPlayed = {};
  if (ac) for (const [n, f] of [["punch", "punch_01.mp3"], ["kick", "kick_01.mp3"], ["swoosh", "swoosh_01.mp3"]]) {
    fetch(`assets/audio/${f}`).then((r) => r.arrayBuffer()).then((b) => ac.decodeAudioData(b)).then((d) => { sfx[n] = d; }).catch(() => {});
  }
  const tracks = ["1_4_crayons.m4a", "1_5_warhawk.m4a", "1_7_bluu.m4a", "1_3_bradley.m4a"];
  const players = [];
  let muted = false, music = null, cur = -1;
  try { muted = localStorage.getItem(MUTE_KEY) === "1"; } catch (e) {}
  return {
    play(n, vol = 0.6) {
      if (muted || !ac || !sfx[n]) return;
      const now = performance.now();
      if (now - (lastPlayed[n] || 0) < 55) return;  // a crowd doesn't need the same thud 20 times at once
      lastPlayed[n] = now;
      const src = ac.createBufferSource(), gain = ac.createGain();
      src.buffer = sfx[n]; gain.gain.value = vol;
      src.connect(gain); gain.connect(ac.destination);
      src.start();
    },
    unlock() { if (ac && ac.state === "suspended") ac.resume().catch(() => {}); },
    day(d) {
      const i = (d - 1) % tracks.length;
      if (i === cur && music) { if (!muted) music.play().catch(() => {}); return; }
      if (music) music.pause();
      cur = i; music = players[i] || (players[i] = make(tracks[i])); music.loop = true; music.volume = 0.32;
      if (!muted) music.play().catch(() => {});
    },
    stop() { if (music) music.pause(); },
    toggle() {
      muted = !muted;
      try { localStorage.setItem(MUTE_KEY, muted ? "1" : "0"); } catch (e) {}
      if (music) { if (muted) music.pause(); else if (state === "play") music.play().catch(() => {}); }
    },
    get muted() { return muted; },
  };
})();

// ---- game state -------------------------------------------------------------
let state = "loading";
let day = 1, money = 0, earned = 0, flung = 0, hired = 0;
let hp = 200, maxHp = 200;
let levels = {}, staff = { intern: 0, legal: 0, fixer: 0 }, roster = [];
let foes = [], shots = [], bits = [], popups = [];
let toSpawn = [], spawnT = 0, dayIntro = 0, shake = 0, wallHit = 0;
let held = null, best = 0;
const ptr = { x: 0, y: 0, down: false, vx: 0, vy: 0 };
let buttons = [];
let score = 0, t = 0;
let staffT = { intern: 0, legal: 0 };
try { best = +localStorage.getItem(BEST_KEY) || 0; } catch (e) {}

const lvl = (id) => levels[id] || 0;
const cost = (it) => it.base + it.grow * lvl(it.id);
const perk = () => 1 + 0.15 * lvl("perk");
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const rand = (a, b) => a + Math.random() * (b - a);
// how many people the company can employ: 2 to start, one more opening every 3 days
const hireCap = () => Math.min(12, 2 + Math.floor((day - 1) / 3));
const nextOpeningDay = () => 3 * (hireCap() - 1) + 1;
const idleStaff = () => roster.length - staff.intern - staff.legal - staff.fixer;

function newGame() {
  day = 1; money = 0; earned = 0; flung = 0; hired = 0;
  maxHp = hp = 200;
  levels = {}; staff = { intern: 0, legal: 0, fixer: 0 }; roster = [];
  startDay();
}

// the mix of invaders per day, in the order they turn up
function buildDay(d) {
  const n = 6 + Math.floor(d * 3.2);
  const list = [];
  for (let i = 0; i < n; i++) {
    const r = Math.random();
    let k = "grunt";
    if (d >= 2 && r < 0.2) k = "runner";
    else if (d >= 3 && r < 0.32) k = "thrower";
    else if (d >= 4 && r < 0.44) k = "heavy";
    else if (d >= 6 && r < 0.54) k = "bomber";
    list.push(k);
  }
  if (d % 5 === 0) list.push("boss");
  return list;
}

function startDay() {
  foes = []; shots = []; bits = []; popups = []; held = null;
  toSpawn = buildDay(day);
  spawnT = 1.2; dayIntro = 2.2;
  state = "play";
  Sound.day(day);
}

function spawn(kind) {
  const T = TYPES[kind];
  const who = kind === "boss" ? T.who[(Math.floor(day / 5) - 1) % T.who.length] : pick(T.who);
  const toughen = 1 + (day - 1) * 0.1;
  const f = {
    kind, T, who, x: -80, y: GROUND, vx: 0, vy: 0,
    hp: T.hp * toughen, maxHp: T.hp * toughen,
    mode: "walk",  // walk, held, air, daze, hit, ko
    timer: 0, phase: Math.random() * 4, spin: 0, angle: 0,
    speed: T.speed * rand(0.9, 1.15) * (1 + Math.min(day, 20) * 0.015),
    size: T.size, mass: T.mass || 1,
  };
  foes.push(f);
  if (T.boss) popups.push({ x: W / 2, y: 190, text: `${NAMES[who] || "THE BOSS"} WANTS A REFUND`, life: 2.6, max: 2.6, size: 44, color: "#ffd23c" });
}

// ---- hurting people ---------------------------------------------------------
function hurt(f, amount, x, y) {
  f.hp -= amount;
  burst(x, y, "#fff", 6);
  if (f.hp <= 0) ko(f);
}
function ko(f) {
  if (f.mode === "ko") return;
  f.mode = "ko"; f.timer = 1.1; f.angle = 0; f.vx = 0; f.vy = 0; f.y = Math.min(f.y, GROUND);
  if (held === f) held = null;
  flung++;
  pay(f.T.pay + Math.floor(day / 3), f.x, f.y - f.size);
  if (f.T.bomb) explode(f.x, f.y - 30);
}
function pay(n, x, y) {
  money += n; earned += n;
  popups.push({ x, y, text: "+$" + n, life: 0.9, max: 0.9, size: 26, color: "#ffe066" });
}
function explode(x, y) {
  shake = Math.max(shake, 14);
  Sound.play("kick", 0.9);
  burst(x, y, "#ff9d3c", 26);
  for (const o of foes) {
    if (o.mode === "ko" || o === held) continue;
    const d = Math.hypot(o.x - x, o.y - 50 - y);
    if (d < 190) {
      launch(o, (o.x - x) * 3, -520);
      o.hp -= 0.35;
    }
  }
}
function launch(f, vx, vy) {
  f.mode = "air"; f.vx = vx / f.mass; f.vy = vy / f.mass; f.spin = rand(-9, 9) ;
  if (f.y >= GROUND) f.y = GROUND - 1;
}
function burst(x, y, color, n) {
  for (let i = 0; i < n; i++) {
    bits.push({ x, y, vx: rand(-260, 260), vy: rand(-340, 40), life: rand(0.25, 0.6), color, r: rand(2, 6) });
  }
}

// ---- update -----------------------------------------------------------------
function update(dt) {
  t += dt;
  if (dayIntro > 0) dayIntro -= dt;
  if (shake > 0) shake = Math.max(0, shake - dt * 40);
  if (wallHit > 0) wallHit -= dt;

  spawnT -= dt;
  if (spawnT <= 0 && toSpawn.length) {
    spawn(toSpawn.shift());
    spawnT = rand(0.7, 1.6) * Math.max(0.24, 1 - day * 0.05);
  }

  for (const f of foes) updateFoe(f, dt);
  foes = foes.filter((f) => !(f.mode === "ko" && f.timer <= 0) && f.mode !== "gone");

  runStaff(dt);

  for (const s of shots) {
    s.vy += GRAVITY * 0.45 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.a += dt * 12;
    if (s.enemy) {
      if (s.x >= WALL_X + 6) { s.dead = true; damageWall(s.dmg); }
    } else {
      for (const f of foes) {
        if (f.mode === "ko" || f === held) continue;
        if (Math.abs(f.x - s.x) < f.size * 0.4 && s.y > f.y - f.size && s.y < f.y) {
          s.dead = true; f.hp -= s.dmg; burst(s.x, s.y, "#ff7fc8", 5); Sound.play("punch", 0.2);
          if (f.hp <= 0) ko(f);
          break;
        }
      }
    }
    if (s.y > GROUND + 10) s.dead = true;
  }
  shots = shots.filter((s) => !s.dead);

  for (const b of bits) { b.vy += 900 * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt; }
  bits = bits.filter((b) => b.life > 0);
  if (bits.length > 140) bits.splice(0, bits.length - 140);
  for (const p of popups) { p.life -= dt; p.y -= 40 * dt; }
  popups = popups.filter((p) => p.life > 0);
  if (popups.length > 14) popups.splice(0, popups.length - 14);

  if (hp <= 0) return bankrupt();
  if (!toSpawn.length && !foes.length) endDay();
}

function updateFoe(f, dt) {
  f.phase += dt;
  switch (f.mode) {
    case "walk": {
      const stop = WALL_X - f.size * 0.28 - (f.T.standoff || 0);
      if (f.x < stop) f.x += f.speed * dt;
      else if (f.T.bomb) { damageWall(f.T.dmg); f.hp = 0; ko(f); }
      else { f.mode = "hit"; f.timer = 0.4; }
      break;
    }
    case "hit": {  // standing at the wall (or at range) hurting it
      f.timer -= dt;
      if (f.timer <= 0) {
        f.timer = f.T.standoff ? 2.4 : 1.1;
        f.swing = 0.22;
        if (f.T.standoff) {
          shots.push({ x: f.x + 20, y: f.y - f.size * 0.7, vx: f.T.standoff * 1.1, vy: -260, a: 0, enemy: true, dmg: f.T.dmg, kind: "crayon" });
        } else {
          damageWall(f.T.dmg * (1 + day * 0.04)); Sound.play("punch", 0.25);
        }
      }
      if (f.swing > 0) f.swing -= dt;
      break;
    }
    case "held": {
      // the fighter trails the pointer a bit; big ones lag more
      const k = Math.min(1, dt * 60 / f.mass);
      f.x += (ptr.x - f.x) * k;
      f.y += (ptr.y + f.size * 0.45 - f.y) * k;
      f.angle = Math.max(-0.7, Math.min(0.7, ptr.vx / 1600));
      break;
    }
    case "air": {
      f.vy += GRAVITY * dt; f.x += f.vx * dt; f.y += f.vy * dt; f.angle += f.spin * dt;
      if (f.x < 30) { f.x = 30; f.vx = Math.abs(f.vx) * 0.5; }
      if (f.x > WALL_X - 20) { f.x = WALL_X - 20; f.vx = -Math.abs(f.vx) * 0.45; hurt(f, 0.2 * f.hp + 0.1, f.x, f.y - f.size / 2); Sound.play("punch", 0.4); }
      // a flying body bowls over whoever it hits
      const speed = Math.hypot(f.vx, f.vy);
      if (speed > 420) for (const o of foes) {
        if (o === f || o === held || o.mode === "ko" || o.mode === "air") continue;
        if (Math.abs(o.x - f.x) < (o.size + f.size) * 0.28 && Math.abs(o.y - o.size / 2 - (f.y - f.size / 2)) < (o.size + f.size) * 0.36) {
          launch(o, f.vx * 0.55, -300 - speed * 0.2); o.hp -= 0.3 / o.mass;
          f.vx *= 0.75; Sound.play("punch", 0.4);
          popups.push({ x: o.x, y: o.y - o.size, text: "BONK", life: 0.6, max: 0.6, size: 24, color: "#fff" });
        }
      }
      if (f.y >= GROUND) land(f);
      break;
    }
    case "daze":
      f.timer -= dt;
      if (f.timer <= 0) { f.mode = "walk"; f.angle = 0; }
      break;
    case "ko":
      f.timer -= dt;
      break;
  }
}

function land(f) {
  const impact = f.vy;
  f.y = GROUND; f.angle = 0;
  if (lvl("pit") && f.x > PIT_X - PIT_W / 2 && f.x < PIT_X + PIT_W / 2 && !f.T.boss) {
    if (roster.length < hireCap()) return hire(f);
    popups.push({ x: f.x, y: GROUND - 90, text: "NO OPENINGS", life: 1, max: 1, size: 26, color: "#ffd23c" });
  }
  const power = 1 + 0.3 * lvl("grip");
  const dmg = Math.max(0, (impact - SAFE_FALL) / 620) * power;
  if (dmg > 0) {
    shake = Math.max(shake, Math.min(10, dmg * 5) * f.mass);
    Sound.play("kick", Math.min(0.9, 0.3 + dmg * 0.3));
    burst(f.x, GROUND - 6, "#c9b28c", 10);
    f.hp -= dmg;
  }
  if (f.hp <= 0) return ko(f);
  if (dmg > 0) popups.push({ x: f.x, y: f.y - f.size, text: pick(["OW", "OOF", "UGH"]), life: 0.6, max: 0.6, size: 24, color: "#fff" });
  f.vx = 0; f.vy = 0;
  f.mode = "daze"; f.timer = dmg > 0 ? 1.3 : 0.5;
}

function hire(f) {
  f.mode = "gone";
  hired++;
  roster.push(f.who);
  popups.push({ x: f.x, y: GROUND - 90, text: "HIRED!", life: 1.2, max: 1.2, size: 36, color: "#9dff6e" });
  burst(f.x, GROUND - 10, "#9dff6e", 14);
  Sound.play("swoosh", 0.7);
}

function damageWall(n) {
  hp = Math.max(0, hp - n);
  wallHit = 0.15;
  burst(WALL_X + 6, rand(GROUND - 200, GROUND - 20), "#b9b2a5", 3);
}

function runStaff(dt) {
  const speed = perk();
  hp = Math.min(maxHp, hp + staff.fixer * 0.8 * speed * dt);
  const targets = foes.filter((f) => f.mode !== "ko" && f !== held && f.x > 20);
  // nearest to the wall first
  targets.sort((a, b) => b.x - a.x);

  if (staff.intern) {
    staffT.intern -= dt * staff.intern * speed;
    if (staffT.intern <= 0 && targets.length) {
      staffT.intern = 2;
      const f = targets[Math.floor(Math.random() * Math.min(3, targets.length))];
      const sx = WALL_X + 40, sy = ROOF_Y - 30;
      const flight = Math.max(0.5, (sx - f.x) / 700);
      shots.push({ x: sx, y: sy, vx: (f.x + f.speed * flight * (f.mode === "walk" ? 1 : 0) - sx) / flight,
        vy: (f.y - f.size / 2 - sy) / flight - GRAVITY * 0.225 * flight, a: 0, dmg: 0.2, kind: "crayon" });
    }
  }
  if (staff.legal) {
    staffT.legal -= dt * staff.legal * speed;
    if (staffT.legal <= 0) {
      const ground = targets.filter((f) => f.mode === "walk" || f.mode === "hit");
      if (ground.length) {
        staffT.legal = 10;
        const f = ground[0];
        launch(f, rand(-160, 60), -700);
        popups.push({ x: f.x, y: f.y - f.size - 10, text: "SUED!", life: 0.9, max: 0.9, size: 28, color: "#8ad7ff" });
        burst(f.x, GROUND - 6, "#8ad7ff", 12);
        Sound.play("swoosh", 0.5);
      }
    }
  }
}

function endDay() {
  const bonus = 15 + day * 6;
  money += bonus; earned += bonus;
  state = "shop";
  ptr.down = false;
}

function bankrupt() {
  state = "over"; held = null;
  score = earned + (day - 1) * 25 + hired * 10;
  if (score > best) { best = score; try { localStorage.setItem(BEST_KEY, String(best)); } catch (e) {} }
  Sound.stop();
  if (window.Scores) Scores.gameOver(BOARD, score);
}

// ---- drawing ----------------------------------------------------------------
// Outlined text is slow to draw, so each label is drawn once and kept.
const textCache = new Map();
function textImage(s, size, color, stroke) {
  const key = s + "|" + size + "|" + color + "|" + stroke;
  let t = textCache.get(key);
  if (t) return t;
  if (textCache.size > 400) textCache.clear();
  const font = `900 ${size}px ${FONT}`;
  ctx.font = font;
  const pad = Math.ceil(size / 4) + 3;
  const c = makeCanvas(ctx.measureText(s).width + pad * 2, size * 1.5 + pad * 2), g = c.getContext("2d");
  g.font = font; g.textAlign = "center"; g.textBaseline = "middle"; g.lineJoin = "round";
  if (stroke) { g.lineWidth = Math.max(3, size / 6); g.strokeStyle = stroke; g.strokeText(s, c.width / 2, c.height / 2); }
  g.fillStyle = color; g.fillText(s, c.width / 2, c.height / 2);
  t = { c, pad };
  textCache.set(key, t);
  return t;
}
function text(s, x, y, size, color = "#fff", align = "center", stroke = "#1b1026") {
  const t = textImage(s, size, color, stroke), w = t.c.width;
  const dx = align === "left" ? x - t.pad : align === "right" ? x - w + t.pad : x - w / 2;
  ctx.drawImage(t.c, Math.round(dx), Math.round(y - t.c.height / 2));
}
function roundRect(x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function button(label, x, y, w, h, fn, opts = {}) {
  const on = !opts.disabled;
  roundRect(x, y, w, h, 12);
  ctx.fillStyle = on ? (opts.color || "#ff5fa8") : "#544a60"; ctx.fill();
  ctx.lineWidth = 4; ctx.strokeStyle = "#1b1026"; ctx.stroke();
  text(label, x + w / 2, y + h / 2 + 1, opts.size || 24, on ? "#fff" : "#a89fb3");
  if (on) buttons.push({ x, y, w, h, fn });
}

function drawBackdrop() {
  // the backdrop and ground only change between days, so they're painted once per day
  const i = ARENAS.length ? (day - 1) % ARENAS.length : 0;
  if (!backLayer || backFor !== i) {
    backLayer = backLayer || makeCanvas(W, H);
    backFor = i;
    const g = backLayer.getContext("2d"), a = ARENAS[i];
    g.imageSmoothingQuality = "high";
    if (a) {
      const k = Math.max(W / a.width, H / a.height);
      g.drawImage(a, (W - a.width * k) / 2, H - a.height * k, a.width * k, a.height * k);
    } else { g.fillStyle = "#7fb7e0"; g.fillRect(0, 0, W, H); }
    g.fillStyle = "#4d3a2a"; g.fillRect(0, GROUND - 4, W, H - GROUND + 4);
    g.fillStyle = "#6fa13f"; g.fillRect(0, GROUND - 8, W, 16);
    g.fillStyle = "#39501f"; g.fillRect(0, GROUND + 8, W, 4);
    g.fillStyle = "#3d2d20";
    for (let n = 0; n < 26; n++) g.fillRect((n * 173) % W, GROUND + 30 + (n * 37) % 60, 26 + (n * 13) % 30, 6);
  }
  ctx.drawImage(backLayer, 0, 0);
}

function drawPit() {
  if (!lvl("pit")) return;
  const x = PIT_X - PIT_W / 2;
  ctx.fillStyle = "#14090c"; ctx.fillRect(x, GROUND - 4, PIT_W, 78);
  ctx.fillStyle = "#2c1a14"; ctx.fillRect(x - 8, GROUND - 8, 8, 82); ctx.fillRect(x + PIT_W, GROUND - 8, 8, 82);
  // walkers cross on a plank
  ctx.fillStyle = "#a9794a"; ctx.fillRect(x - 12, GROUND - 6, PIT_W + 24, 9);
  ctx.strokeStyle = "#1b1026"; ctx.lineWidth = 2; ctx.strokeRect(x - 12, GROUND - 6, PIT_W + 24, 9);
  ctx.save();
  ctx.translate(PIT_X, GROUND + 40);
  const full = roster.length >= hireCap();
  text(full ? "FULL" : `HIRING ${roster.length}/${hireCap()}`, 0, 0, 20, full ? "#ffd23c" : "#9dff6e");
  ctx.restore();
}

function drawCastle() {
  const jig = wallHit > 0 ? rand(-2, 2) : 0;
  ctx.save(); ctx.translate(jig, 0);
  if (hqLayer) ctx.drawImage(hqLayer, HQ_X, HQ_Y);

  // cracks grow with damage
  const damage = 1 - hp / maxHp;
  ctx.strokeStyle = "#1b1026"; ctx.lineWidth = 4; ctx.lineJoin = "round";
  const cracks = Math.floor(damage * 9);
  for (let i = 0; i < cracks; i++) {
    let x = WALL_X + 8 + (i * 83) % 330, y = ROOF_Y + 30 + (i * 131) % 230;
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let j = 1; j < 5; j++) { x += ((i + j) % 2 ? 16 : -10); y += 16; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  ctx.restore();
}

// employees stand on the battlements, facing the invaders
function drawStaff() {
  let i = 0;
  const order = [];
  for (const job of ["intern", "legal", "fixer"]) for (let n = 0; n < staff[job]; n++) order.push(job);
  for (const job of order) {
    const who = roster[i];
    const x = WALL_X + 24 + (i % 6) * 36 + Math.floor(i / 6) * 14, base = ROOF_Y + 2 - Math.floor(i / 6) * 8;
    const sp = sprite(who, "idle_01", 66);
    if (sp) ctx.drawImage(sp.c, x - sp.w / 2, base - sp.h + Math.sin(t * 3 + i) * 1.5);
    ctx.fillStyle = job === "intern" ? "#ff7fc8" : job === "legal" ? "#8ad7ff" : "#ffd23c";
    ctx.beginPath(); ctx.arc(x, base - 74, 5, 0, 7); ctx.fill();
    i++;
  }
}

function drawFoe(f) {
  let name;
  if (f.mode === "ko") name = "koed_01";
  else if (f.mode === "held" || f.mode === "air" || f.mode === "daze") name = "hit_01";
  else if (f.mode === "hit") name = f.swing > 0 ? "punch_02" : "idle_01";
  else {
    const walk = ["walk_01", "walk_02", "walk_03", "walk_02"];
    name = walk[Math.floor(f.phase * Math.max(5, f.speed / 12)) % 4];
  }
  const sp = sprite(f.who, name, f.size);
  if (!sp) return;

  // shadow, shrinks as they go up: it tells you how high they are
  if (f.mode !== "ko") {
    const up = Math.max(0, GROUND - f.y);
    const s = Math.max(0.25, 1 - up / 500);
    ctx.fillStyle = "rgba(0,0,0,.28)";
    ctx.beginPath(); ctx.ellipse(f.x, GROUND + 2, f.size * 0.34 * s, 7 * s, 0, 0, 7); ctx.fill();
  }

  ctx.save();
  if (f.mode === "ko") ctx.globalAlpha = Math.min(1, f.timer * 2);
  ctx.translate(f.x, f.y);
  if (f.angle) { ctx.translate(0, -f.size / 2); ctx.rotate(f.angle); ctx.translate(0, f.size / 2); }
  ctx.drawImage(sp.c, -sp.w / 2, -sp.h);
  ctx.restore();

  if (f.T.bomb && f.mode !== "ko") {
    ctx.fillStyle = "#1b1026";
    ctx.beginPath(); ctx.arc(f.x + 8, f.y - f.size - 10, 15, 0, 7); ctx.fill();
    ctx.fillStyle = Math.floor(t * 8) % 2 ? "#ffd23c" : "#ff5a3c";
    ctx.beginPath(); ctx.arc(f.x + 18, f.y - f.size - 26, 5, 0, 7); ctx.fill();
  }
  if (f.mode !== "ko" && (f.hp < f.maxHp || f.T.boss) && f.mode !== "held") {
    const bw = Math.min(150, f.size * 0.7), by = f.y - f.size - 12;
    ctx.fillStyle = "#1b1026"; ctx.fillRect(f.x - bw / 2 - 2, by - 2, bw + 4, 9);
    ctx.fillStyle = "#ff5a3c"; ctx.fillRect(f.x - bw / 2, by, bw * Math.max(0, f.hp / f.maxHp), 5);
  }
}

function drawShots() {
  for (const s of shots) {
    ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.a);
    ctx.fillStyle = s.enemy ? "#ffb02e" : "#ff5fa8";
    ctx.strokeStyle = "#1b1026"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-15, -5); ctx.lineTo(9, -5); ctx.lineTo(18, 0); ctx.lineTo(9, 5); ctx.lineTo(-15, 5); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }
}

function drawHud() {
  const bw = 420, x = W / 2 - bw / 2;
  roundRect(x - 4, 16, bw + 8, 34, 10); ctx.fillStyle = "#1b1026"; ctx.fill();
  const r = hp / maxHp;
  ctx.fillStyle = r > 0.5 ? "#7ee05b" : r > 0.25 ? "#ffd23c" : "#ff5a3c";
  roundRect(x, 20, Math.max(0, bw * r), 26, 7); ctx.fill();
  text(`HQ  ${Math.ceil(hp)} / ${maxHp}`, W / 2, 34, 18);
  text(`DAY ${day}`, 26, 34, 32, "#fff", "left");
  text(`$${money}`, W - 80, 34, 32, "#ffe066", "right");
  const left = toSpawn.length + foes.filter((f) => f.mode !== "ko").length;
  text(`${left} left`, 26, 70, 20, "#fff", "left");
}

function drawMute() {
  button(Sound.muted ? "🔇" : "🔊", W - 62, 12, 48, 44, () => Sound.toggle(), { color: "#3a2a4d", size: 22 });
}

function drawWorld() {
  ctx.save();
  if (shake > 0) ctx.translate(rand(-shake, shake), rand(-shake, shake));
  drawBackdrop();
  drawPit();
  drawStaff();   // behind the HQ, so they stand behind the railing
  drawCastle();
  const order = foes.slice().sort((a, b) => (a === held) - (b === held) || a.y - b.y);
  for (const f of order) drawFoe(f);
  drawShots();
  for (const b of bits) { ctx.globalAlpha = Math.min(1, b.life * 3); ctx.fillStyle = b.color; ctx.fillRect(b.x, b.y, b.r, b.r); }
  ctx.globalAlpha = 1;
  ctx.restore();
  for (const p of popups) {
    ctx.globalAlpha = Math.min(1, p.life / p.max * 2);
    text(p.text, p.x, p.y, p.size, p.color);
    ctx.globalAlpha = 1;
  }
}

function drawTitle() {
  day = 1 + Math.floor(t / 8) % 8;
  drawBackdrop(); drawCastle();
  ctx.fillStyle = "rgba(20,10,35,.45)"; ctx.fillRect(0, 0, W, H);
  text("DEFEND YOUR LLC", W / 2 - 110, 150, 84, "#ffd23c");
  text("Everyone wants a refund. Nobody gets one.", W / 2 - 110, 225, 28);
  const lineup = ["egg", "hawky", "slothulu", "qosha", "parrot", "bradley"];
  lineup.forEach((c, i) => {
    const sp = sprite(c, ["walk_01", "walk_02", "walk_03"][Math.floor(t * 6 + i) % 3], c === "bradley" ? 170 : 110);
    if (sp) ctx.drawImage(sp.c, 60 + i * 148 - sp.w / 2, GROUND - sp.h);
  });
  text("Grab them. Fling them. Let gravity handle the paperwork.", W / 2 - 110, 300, 24, "#fff");
  button("OPEN FOR BUSINESS", W / 2 - 280, 345, 340, 72, () => newGame(), { size: 28 });
  button("🏆 LEADERBOARD", W / 2 - 240, 430, 260, 50, () => Scores.open(BOARD), { color: "#6a4fc7", size: 20 });
  if (best) text(`Your best: ${best}`, W / 2 - 110, 505, 22, "#ffe066");
}

function drawShop() {
  drawBackdrop(); drawPit(); drawStaff(); drawCastle();
  ctx.fillStyle = "rgba(20,10,35,.72)"; ctx.fillRect(0, 0, W, H);
  text(`DAY ${day} SURVIVED`, W / 2, 44, 44, "#ffd23c");
  text(`$${money}`, W / 2, 92, 34, "#ffe066");

  // repairs
  const missing = Math.ceil(maxHp - hp);
  const repairCost = Math.ceil(missing * REPAIR_PER_HP);
  panel(40, 120, 590, 96);
  text(`HQ ${Math.ceil(hp)} / ${maxHp}`, 62, 148, 24, "#fff", "left");
  text("Fix the place up", 62, 186, 18, "#cfc4dd", "left", null);
  const part = Math.min(money, repairCost);
  button(missing === 0 ? "ALL FIXED" : `REPAIR $${part}`, 380, 138, 230, 60, () => {
    const pay = Math.min(money, repairCost);
    money -= pay; hp = Math.min(maxHp, hp + pay / REPAIR_PER_HP);
    Sound.play("punch", 0.4);
  }, { disabled: missing === 0 || money <= 0, color: "#3fae5a" });

  // upgrades
  SHOP.forEach((it, i) => {
    const y = 228 + i * 92;
    panel(40, y, 590, 82);
    const lv = lvl(it.id), done = lv >= it.max;
    text(it.name + (it.max > 1 ? `  ${lv}/${it.max}` : ""), 62, y + 26, 22, "#fff", "left");
    text(it.desc, 62, y + 58, 17, "#cfc4dd", "left", null);
    const c = cost(it);
    // the shop after Day 4 is the first that sells it, ready for Day 5
    const locked = it.fromDay && day + 1 < it.fromDay;
    button(done ? "OWNED" : locked ? `DAY ${it.fromDay}` : `$${c}`, 450, y + 13, 160, 56, () => {
      money -= c; levels[it.id] = lv + 1;
      if (it.id === "wall") { maxHp += 60; hp += 60; }
      Sound.play("swoosh", 0.5);
    }, { disabled: done || locked || money < c, color: "#ff5fa8" });
  });

  // employees
  panel(650, 120, 590, 300);
  text("EMPLOYEES", 672, 148, 24, "#fff", "left");
  const free = idleStaff();
  text(lvl("pit") ? `${roster.length} of ${hireCap()} hired · ${free} with no job` : "Buy the Hiring Pit to get staff", 1218, 148, 18, free ? "#9dff6e" : "#cfc4dd", "right", null);
  Object.keys(JOBS).forEach((id, i) => {
    const y = 180 + i * 78, J = JOBS[id];
    text(J.name, 672, y + 18, 21, "#fff", "left");
    text(J.desc, 672, y + 48, 16, "#cfc4dd", "left", null);
    button("−", 1036, y + 6, 52, 52, () => { staff[id]--; }, { disabled: !staff[id], color: "#6a4fc7", size: 30 });
    text(String(staff[id]), 1120, y + 32, 28);
    button("+", 1152, y + 6, 52, 52, () => { staff[id]++; }, { disabled: !free, color: "#6a4fc7", size: 30 });
  });

  panel(650, 432, 590, 164);
  text("TIP", 672, 458, 20, "#ffd23c", "left");
  const tips = [
    "Throw hard and high. A bad fall hurts more than a short one.",
    "Throw one invader into another and you bowl them both over.",
    "Fling the parrot away from the wall. That bomb is not for you.",
    "Big ones are heavy. They take a few good throws.",
    "Drop anyone but a boss into the Hiring Pit and they work for you.",
  ];
  wrap(tips[(day - 1) % tips.length], 672, 492, 546, 22);
  if (lvl("pit") && hireCap() < 12) text(`New job opening on Day ${nextOpeningDay()}`, 672, 572, 18, "#9dff6e", "left", null);

  button(`START DAY ${day + 1}`, 650, 612, 590, 80, () => { day++; startDay(); }, { size: 34, color: "#ff5fa8" });
}

function panel(x, y, w, h) {
  roundRect(x, y, w, h, 14);
  ctx.fillStyle = "rgba(255,255,255,.08)"; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = "rgba(255,255,255,.2)"; ctx.stroke();
}
function wrap(s, x, y, width, size) {
  ctx.font = `600 ${size}px ${FONT}`; ctx.textAlign = "left"; ctx.fillStyle = "#fff";
  let line = "", row = 0;
  for (const word of s.split(" ")) {
    if (ctx.measureText(line + word).width > width) { ctx.fillText(line, x, y + row * (size + 8)); line = ""; row++; }
    line += word + " ";
  }
  ctx.fillText(line, x, y + row * (size + 8));
}

function drawOver() {
  drawWorld();
  ctx.fillStyle = "rgba(20,10,35,.76)"; ctx.fillRect(0, 0, W, H);
  text("BANKRUPT", W / 2, 150, 92, "#ff5a3c");
  text(`You lasted ${day} day${day > 1 ? "s" : ""}. ${flung} invaders flattened, ${hired} hired.`, W / 2, 240, 28);
  text(`SCORE ${score}`, W / 2, 310, 56, "#ffd23c");
  text(score >= best ? "A new company record!" : `Your best: ${best}`, W / 2, 368, 24, "#ffe066");
  const rank = window.Scores && Scores.rankText(BOARD);
  if (rank) text(rank, W / 2, 404, 22, "#9dff6e");
  button("START A NEW LLC", W / 2 - 200, 440, 400, 76, () => newGame(), { size: 28 });
  button("🏆 LEADERBOARD", W / 2 - 140, 530, 280, 54, () => Scores.open(BOARD), { color: "#6a4fc7", size: 20 });
}

function render() {
  buttons = [];
  ctx.clearRect(0, 0, W, H);
  if (state === "loading") {
    ctx.fillStyle = "#16101f"; ctx.fillRect(0, 0, W, H);
    text("Filing paperwork…", W / 2, H / 2, 36);
    return;
  }
  if (state === "title") drawTitle();
  else if (state === "shop") drawShop();
  else if (state === "over") drawOver();
  else {
    drawWorld();
    drawHud();
    if (dayIntro > 0) {
      ctx.globalAlpha = Math.min(1, dayIntro);
      text(`DAY ${day}`, W / 2, 200, 84, "#ffd23c");
      if (day === 1) text("Drag an invader up, then let go", W / 2, 270, 32);
      ctx.globalAlpha = 1;
    }
  }
  drawMute();
}

// ---- input ------------------------------------------------------------------
function toCanvas(e) {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height };
}
function findFoe(x, y) {
  let found = null, bestD = 1e9;
  for (const f of foes) {
    if (f.mode === "ko") continue;
    const cx = f.x, cy = f.y - f.size / 2;
    const dx = Math.abs(x - cx), dy = Math.abs(y - cy);
    // a generous grab box, so fast ones and fingers both work
    if (dx < f.size * 0.45 + 18 && dy < f.size * 0.5 + 18) {
      const d = dx + dy;
      if (d < bestD) { bestD = d; found = f; }
    }
  }
  return found;
}
canvas.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  Sound.unlock();
  if (window.Scores && Scores.isOpen()) return;
  try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
  const p = toCanvas(e);
  ptr.x = p.x; ptr.y = p.y; ptr.vx = 0; ptr.vy = 0; ptr.down = true; ptr.lastT = performance.now();
  for (const b of buttons) {
    if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) { b.fn(); return; }
  }
  if (state !== "play") return;
  release();  // never two at once: a stray earlier grab can't stay stuck to the pointer
  ptr.down = true;
  const f = findFoe(p.x, p.y);
  if (f) {
    held = f; f.mode = "held"; f.vx = 0; f.vy = 0;
    canvas.classList.add("holding");
    Sound.play("swoosh", 0.25);
  }
});
canvas.addEventListener("pointermove", (e) => {
  // the button is up but we never heard about it (right-click menu, two buttons at once…)
  if (held && e.pointerType === "mouse" && !(e.buttons & 1)) release();
  const p = toCanvas(e), now = performance.now();
  const dt = Math.max(1, now - (ptr.lastT || now)) / 1000;
  // smoothed, so the throw follows the last moment of the drag
  ptr.vx += ((p.x - ptr.x) / dt - ptr.vx) * 0.45;
  ptr.vy += ((p.y - ptr.y) / dt - ptr.vy) * 0.45;
  ptr.x = p.x; ptr.y = p.y; ptr.lastT = now;
});
function release() {
  ptr.down = false;
  canvas.classList.remove("holding");
  if (!held) return;
  const f = held; held = null;
  // a pause before letting go means a plain drop, not a throw
  if (performance.now() - (ptr.lastT || 0) > 90) { ptr.vx = 0; ptr.vy = 0; }
  const clamp = (v, m) => Math.max(-m, Math.min(m, v));
  f.mode = "air";
  f.vx = clamp(ptr.vx * 0.85, 1500) / f.mass;
  f.vy = clamp(ptr.vy * 0.85, 1400) / f.mass;
  f.spin = clamp(f.vx / 90, -11, 11) || rand(-2, 2);
  if (f.vy < -500 || Math.abs(f.vx) > 500) Sound.play("swoosh", 0.6);
}
canvas.addEventListener("pointerup", release);
canvas.addEventListener("pointercancel", release);
canvas.addEventListener("lostpointercapture", release);
canvas.addEventListener("contextmenu", (e) => { e.preventDefault(); release(); });
addEventListener("blur", release);
addEventListener("keydown", (e) => {
  if (window.Scores && Scores.isOpen()) return;
  if (e.code === "KeyM") Sound.toggle();
});
document.addEventListener("gesturestart", (e) => e.preventDefault());

// ---- loop -------------------------------------------------------------------
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (state === "play") update(dt);
  else if (state === "title") t += dt;
  render();
  requestAnimationFrame(loop);
}
boot();
requestAnimationFrame(loop);
