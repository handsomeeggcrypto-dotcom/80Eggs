/* =============================================================
   Nap Time — engine core
   Classic script (file:// friendly). Everything hangs off NAP.
   ============================================================= */
window.NAP = window.NAP || {};
(function (NAP) {
  "use strict";

  // ---- constants / meta ----
  NAP.META = window.GAME_META;
  NAP.DIR = "assets/processed/";
  NAP.ASSET_V = "16";   // bump when processed image contents change (busts browser cache)

  // ---- math / util ----
  const U = NAP.util = {
    clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
    lerp: (a, b, t) => a + (b - a) * t,
    now: () => performance.now() / 1000,
    rand: (a, b) => a + Math.random() * (b - a),
    dist: (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by),
    ease: {
      inOut: t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
      out: t => 1 - (1 - t) * (1 - t),
      in: t => t * t,
    },
  };

  // ---- canvas / view ----
  const canvas = document.getElementById("c");
  const ctx = canvas.getContext("2d");
  NAP.canvas = canvas; NAP.ctx = ctx;
  NAP.view = { w: 960, h: 540, dpr: 1 };

  NAP.resize = function () {
    const maxW = 1280, maxH = 760;
    let w = Math.min(window.innerWidth, maxW);
    let h = Math.min(window.innerHeight, maxH);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    NAP.view.w = w; NAP.view.h = h; NAP.view.dpr = dpr;
    if (NAP.scene && NAP.scene.onResize) NAP.scene.onResize();
  };
  window.addEventListener("resize", NAP.resize);

  // ---- assets ----
  const images = NAP.images = {};
  NAP.img = f => images[f];
  NAP.loadImage = f => new Promise(res => {
    if (images[f]) return res();
    const im = new Image();
    im.onload = () => { images[f] = im; res(); };
    im.onerror = () => { console.warn("missing asset", f); res(); };
    im.src = NAP.DIR + f + "?v=" + NAP.ASSET_V;
  });
  NAP.loadImages = list => Promise.all([...new Set(list)].map(NAP.loadImage));

  // gather every frame file referenced by an entity meta block
  NAP.entityFiles = entMeta => {
    const out = [];
    for (const a in entMeta) if (entMeta[a].files) out.push(...entMeta[a].files);
    return out;
  };

  // ---- feet-anchored sprite draw (shared by dream + VN) ----
  // sx,sy = feet position (screen). meta = anim block {canvasW,canvasH,baselineY}.
  NAP.drawSprite = function (file, meta, sx, sy, scale, flip, alpha) {
    const im = images[file]; if (!im) return;
    const dw = meta.canvasW * scale, dh = meta.canvasH * scale;
    const baseY = meta.baselineY * scale;
    ctx.save();
    if (alpha != null) ctx.globalAlpha = alpha;
    ctx.translate(sx, sy - baseY);
    if (flip) { ctx.translate(dw, 0); ctx.scale(-1, 1); }
    ctx.drawImage(im, 0, 0, dw, dh);
    ctx.restore();
  };

  // ---- shared drawing helpers ----
  const D = NAP.draw = {
    rr(x, y, w, h, r) {
      r = Math.min(r, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    },
    bar(x, y, w, h, frac, color, bg) {
      frac = U.clamp(frac, 0, 1);
      ctx.fillStyle = "rgba(15,8,28,0.7)"; D.rr(x - 1.5, y - 1.5, w + 3, h + 3, h / 2 + 1); ctx.fill();
      ctx.fillStyle = bg || "#3a2a50"; D.rr(x, y, w, h, h / 2); ctx.fill();
      ctx.fillStyle = color; D.rr(x, y, w * frac, h, h / 2); ctx.fill();
    },
    // wrap text into lines that fit maxW; returns array of lines
    wrap(text, maxW) {
      const words = text.split(" "), lines = []; let line = "";
      for (const w of words) {
        const t = line ? line + " " + w : w;
        if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; }
        else line = t;
      }
      if (line) lines.push(line);
      return lines;
    },
    shadow(sx, sy, rx, ry) {
      ctx.save(); ctx.fillStyle = "rgba(20,10,40,0.28)";
      ctx.beginPath(); ctx.ellipse(sx, sy, rx, ry, 0, 0, 6.28); ctx.fill(); ctx.restore();
    },
    heart(x, y, r) {
      ctx.beginPath(); ctx.moveTo(x, y + r * 0.3);
      ctx.bezierCurveTo(x, y - r * 0.3, x - r, y - r * 0.3, x - r, y + r * 0.1);
      ctx.bezierCurveTo(x - r, y + r * 0.6, x, y + r * 0.9, x, y + r * 1.1);
      ctx.bezierCurveTo(x, y + r * 0.9, x + r, y + r * 0.6, x + r, y + r * 0.1);
      ctx.bezierCurveTo(x + r, y - r * 0.3, x, y - r * 0.3, x, y + r * 0.3); ctx.fill();
    },
  };

  // ---- input ----
  const input = NAP.input = { keys: {}, mouse: { x: 0, y: 0, down: false },
    axis: { x: 0, y: 0 },        // combined analog move (gamepad stick + touch joystick)
    touchVec: { x: 0, y: 0 },    // touch joystick vector
    joy: { active: false, ox: 0, oy: 0, kx: 0, ky: 0, id: null },  // joystick visual
    fireAttack: false,           // attack held (pad A / touch attack button)
    padActive: false, padPrev: {},
    touch: ("ontouchstart" in window) || (navigator.maxTouchPoints > 0) };
  window.addEventListener("keydown", e => {
    const k = e.key.toLowerCase();
    input.keys[k] = true;
    if (k === " " || k.startsWith("arrow")) e.preventDefault();
    if (NAP.scene && NAP.scene.onKey && !NAP.transition) NAP.scene.onKey(k, e);
  });
  window.addEventListener("keyup", e => { input.keys[e.key.toLowerCase()] = false; });
  function mousePos(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  canvas.addEventListener("mousedown", e => {
    const p = mousePos(e); input.mouse.x = p.x; input.mouse.y = p.y; input.mouse.down = true;
    if (NAP.scene && NAP.scene.onDown && !NAP.transition) NAP.scene.onDown(p.x, p.y, e.button);
  });
  canvas.addEventListener("mousemove", e => {
    const p = mousePos(e); input.mouse.x = p.x; input.mouse.y = p.y;
  });
  window.addEventListener("mouseup", e => {
    input.mouse.down = false;
    if (NAP.scene && NAP.scene.onUp && !NAP.transition) NAP.scene.onUp(e.button);
  });
  canvas.addEventListener("contextmenu", e => e.preventDefault());

  // ---- touch controls ----
  // Gameplay: left half = virtual joystick, two thumb-buttons on the right = attack / active.
  // Menus: a tap is just a click (hit-tests the same rects the mouse would).
  NAP.touchZones = function () {
    const V = NAP.view;
    return { atk: { x: V.w - 82, y: V.h - 92, r: 48 }, act: { x: V.w - 176, y: V.h - 148, r: 38 }, joyR: 78 };
  };
  function inCircle(x, y, c) { return Math.hypot(x - c.x, y - c.y) <= c.r; }
  function inDreamPlay() { return NAP.scene === NAP.scenes.dream && !NAP.scene.outcome && !NAP.transition; }
  function touchXY(t) { const r = canvas.getBoundingClientRect(); return { x: t.clientX - r.left, y: t.clientY - r.top }; }
  const activeTouches = {};   // identifier -> role: "joy" | "atk" | "act" | "tap"

  canvas.addEventListener("touchstart", e => {
    for (const t of e.changedTouches) {
      const p = touchXY(t);
      if (inDreamPlay()) {
        const z = NAP.touchZones();
        if (inCircle(p.x, p.y, z.act)) {                                     // active button (check first)
          activeTouches[t.identifier] = "act"; if (NAP.scene.tryActive) NAP.scene.tryActive();
        } else if (p.x > NAP.view.w * 0.5) {                                 // right half = attack
          activeTouches[t.identifier] = "atk"; input.fireAttack = true;
        } else {                                                            // left half = joystick
          activeTouches[t.identifier] = "joy";
          input.joy = { active: true, ox: p.x, oy: p.y, kx: p.x, ky: p.y, id: t.identifier };
        }
      } else {
        activeTouches[t.identifier] = "tap";
        input.mouse.x = p.x; input.mouse.y = p.y; input.mouse.down = true;
        if (NAP.scene && NAP.scene.onDown && !NAP.transition) NAP.scene.onDown(p.x, p.y, 0);
      }
    }
    e.preventDefault();
  }, { passive: false });

  canvas.addEventListener("touchmove", e => {
    for (const t of e.changedTouches) {
      if (activeTouches[t.identifier] !== "joy") continue;
      const p = touchXY(t), z = NAP.touchZones();
      let dx = p.x - input.joy.ox, dy = p.y - input.joy.oy;
      const d = Math.hypot(dx, dy), R = z.joyR;
      if (d > R) { dx = dx / d * R; dy = dy / d * R; }
      input.joy.kx = input.joy.ox + dx; input.joy.ky = input.joy.oy + dy;
      const dead = 0.18;
      input.touchVec.x = Math.abs(dx / R) < dead ? 0 : dx / R;
      input.touchVec.y = Math.abs(dy / R) < dead ? 0 : dy / R;
    }
    e.preventDefault();
  }, { passive: false });

  function touchAttackHeld() { for (const id in activeTouches) if (activeTouches[id] === "atk") return true; return false; }
  function endTouch(e) {
    for (const t of e.changedTouches) {
      if (activeTouches[t.identifier] === "joy") { input.joy.active = false; input.touchVec.x = 0; input.touchVec.y = 0; }
      delete activeTouches[t.identifier];
      input.mouse.down = false;
    }
    input.fireAttack = touchAttackHeld();
    e.preventDefault();
  }
  canvas.addEventListener("touchend", endTouch, { passive: false });
  canvas.addEventListener("touchcancel", endTouch, { passive: false });

  // ---- gamepad (console controller) ----
  // Gameplay: left stick / dpad move, A = attack (held), X or RB = active, Start = pause/back.
  // Menus: stick / dpad glide a cursor, A = click, B = back.
  NAP.pollGamepad = function (dt) {
    // seed combined axis from the touch joystick each frame
    input.axis.x = input.touchVec.x; input.axis.y = input.touchVec.y;
    // getGamepads() can return null, throw, or be blocked by permissions policy on
    // some browsers — never let that break the game loop.
    let gp = null;
    try {
      const pads = (navigator.getGamepads && navigator.getGamepads()) || [];
      for (const g of pads) if (g) { gp = g; break; }
    } catch (e) { gp = null; }
    if (!gp || !gp.buttons || !gp.axes) { input.padActive = false; return; }
    input.padActive = true;
    const dz = v => (Math.abs(v) < 0.28 ? 0 : v);
    const b = i => !!(gp.buttons[i] && gp.buttons[i].pressed);
    const prev = input.padPrev;
    let sx = dz(gp.axes[0] || 0), sy = dz(gp.axes[1] || 0);
    if (b(14)) sx = -1; if (b(15)) sx = 1; if (b(12)) sy = -1; if (b(13)) sy = 1;
    const inDream = NAP.scene === NAP.scenes.dream && !NAP.transition;
    const justActive = (b(2) && !prev[2]) || (b(5) && !prev[5]);
    const justBack = b(1) && !prev[1];
    const justStart = b(9) && !prev[9];
    const justA = b(0) && !prev[0];
    if (inDream) {
      input.axis.x += sx; input.axis.y += sy;
      input.fireAttack = touchAttackHeld() || b(0);       // A held = attack (or a held attack-pad touch)
      if (justActive && NAP.scene.tryActive) NAP.scene.tryActive();
      if (justStart && NAP.scene.onKey) NAP.scene.onKey("escape");
    } else {
      const spd = 640 * dt;
      input.mouse.x = Math.max(0, Math.min(NAP.view.w, input.mouse.x + sx * spd));
      input.mouse.y = Math.max(0, Math.min(NAP.view.h, input.mouse.y + sy * spd));
      if ((justA || justStart) && NAP.scene.onDown && !NAP.transition) NAP.scene.onDown(input.mouse.x, input.mouse.y, 0);
      if (justBack && NAP.scene.onKey && !NAP.transition) NAP.scene.onKey("escape");
    }
    const np = {}; for (let i = 0; i < gp.buttons.length; i++) np[i] = gp.buttons[i].pressed; input.padPrev = np;
  };

  // draw the on-screen thumbstick + buttons (touch) and a soft cursor (gamepad in menus)
  NAP.drawInputOverlay = function (ctx) {
    const V = NAP.view;
    if (input.touch && inDreamPlay()) {
      const z = NAP.touchZones();
      ctx.save();
      if (input.joy.active) {
        ctx.globalAlpha = 0.22; ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(input.joy.ox, input.joy.oy, z.joyR, 0, 6.28); ctx.fill();
        ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.arc(input.joy.kx, input.joy.ky, 30, 0, 6.28); ctx.fill();
      } else {
        ctx.globalAlpha = 0.12; ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(110, V.h - 110, z.joyR, 0, 6.28); ctx.fill();
      }
      const btn = (c, label, col) => { ctx.globalAlpha = 0.28; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, 6.28); ctx.fill();
        ctx.globalAlpha = 0.9; ctx.fillStyle = "#fff"; ctx.font = "bold 13px 'Trebuchet MS',sans-serif"; ctx.textAlign = "center"; ctx.fillText(label, c.x, c.y + 5); };
      btn(z.atk, "TAP", "#ff6fae"); btn(z.act, "✦", "#8dffb0");
      ctx.restore(); ctx.globalAlpha = 1; ctx.textAlign = "left";
    }
    if (input.padActive && NAP.scene !== NAP.scenes.dream) {   // gamepad cursor in menus
      ctx.save(); ctx.globalAlpha = 0.85; ctx.fillStyle = "#fff"; ctx.strokeStyle = "rgba(0,0,0,0.5)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(input.mouse.x, input.mouse.y, 7, 0, 6.28); ctx.fill(); ctx.stroke(); ctx.restore(); ctx.globalAlpha = 1;
    }
  };

  // ---- scene manager ----
  NAP.scene = null;
  NAP.setScene = function (scene, params) {
    NAP.scene = scene;
    if (scene.enter) scene.enter(params || {});
    if (scene.onResize) scene.onResize();
  };

  // ---- transitions (fall-asleep / wake / fade) ----
  // NAP.go(scene, params, {type, outDur, inDur})
  NAP.transition = null;
  NAP.go = function (scene, params, opts) {
    opts = opts || {};
    NAP.transition = {
      phase: "out", t: 0,
      outDur: opts.outDur != null ? opts.outDur : 0.6,
      inDur: opts.inDur != null ? opts.inDur : 0.6,
      type: opts.type || "fade",
      scene, params,
    };
  };
  function drawTransition() {
    const tr = NAP.transition; if (!tr) return;
    const w = NAP.view.w, h = NAP.view.h;
    let cover; // 0 = fully clear, 1 = fully covered
    if (tr.phase === "out") cover = U.ease.inOut(U.clamp(tr.t / tr.outDur, 0, 1));
    else cover = 1 - U.ease.inOut(U.clamp(tr.t / tr.inDur, 0, 1));

    if (tr.type === "sleep" || tr.type === "wake") {
      // eyelids closing (two dark bands meeting in the middle)
      const half = (h / 2) * cover;
      const g1 = ctx.createLinearGradient(0, 0, 0, half);
      g1.addColorStop(0, "#0a0616"); g1.addColorStop(1, "#241640");
      ctx.fillStyle = g1; ctx.fillRect(0, 0, w, half);
      const g2 = ctx.createLinearGradient(0, h - half, 0, h);
      g2.addColorStop(0, "#241640"); g2.addColorStop(1, "#0a0616");
      ctx.fillStyle = g2; ctx.fillRect(0, h - half, w, half);
      // soft lash line
      ctx.fillStyle = "rgba(10,6,22," + cover + ")";
      ctx.fillRect(0, half - 3, w, 6); ctx.fillRect(0, h - half - 3, w, 6);
      if (cover > 0.55) {
        ctx.globalAlpha = (cover - 0.55) / 0.45;
        ctx.fillStyle = "#d9c8ff"; ctx.textAlign = "center";
        ctx.font = "italic 22px 'Trebuchet MS',sans-serif";
        ctx.fillText(tr.type === "sleep" ? "z z z . . ." : "waking up . . .", w / 2, h / 2 + 8);
        ctx.globalAlpha = 1; ctx.textAlign = "left";
      }
    } else {
      ctx.fillStyle = "rgba(10,6,22," + cover + ")";
      ctx.fillRect(0, 0, w, h);
    }
  }
  function updateTransition(dt) {
    const tr = NAP.transition; if (!tr) return;
    tr.t += dt;
    if (tr.phase === "out" && tr.t >= tr.outDur) {
      NAP.setScene(tr.scene, tr.params);
      tr.phase = "in"; tr.t = 0;
    } else if (tr.phase === "in" && tr.t >= tr.inDur) {
      NAP.transition = null;
    }
  }

  // ---- progress / save ----
  const SAVE_KEY = "naptime_save_v1";
  NAP.progress = (function () {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) {}
    if (!s) s = { unlocked: ["egg"], cleared: [], choices: {} };
    if (!s.chars) s.chars = {};
    if (s.unlocked.indexOf("nap") < 0) s.unlocked.push("nap");   // Napling fully unlocked for now
    if (s.unlocked.indexOf("imq") < 0) s.unlocked.push("imq");   // IMQ fully unlocked for now
    // migrate a legacy global level/xp onto egg
    if (s.level != null) { s.chars.egg = { level: s.level, xp: s.xp || 0, points: 0, nodes: {} };
      delete s.level; delete s.xp; }
    return s;
  })();
  NAP.save = function () {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(NAP.progress)); } catch (e) {}
  };

  // ---- per-character progression -----------------------------------------
  // Each character has its own {level, xp (into current level), points, nodes}.
  NAP.MAX_LEVEL = 50;
  NAP.xpToNext = L => 5 * L;   // cost L -> L+1 (5,10,15,...)
  NAP.charProgress = function (charId) {
    let r = NAP.progress.chars[charId];
    if (!r) r = NAP.progress.chars[charId] = { level: 1, xp: 0, points: 0, nodes: {} };
    if (r.points == null) r.points = 0;
    if (!r.nodes) r.nodes = {};
    return r;
  };
  NAP.addXP = function (charId, n) {
    const r = NAP.charProgress(charId); let ups = 0;
    if (r.level >= NAP.MAX_LEVEL) return { leveled: 0, level: r.level };
    r.xp += n;
    while (r.level < NAP.MAX_LEVEL && r.xp >= NAP.xpToNext(r.level)) {
      r.xp -= NAP.xpToNext(r.level); r.level++; r.points++; ups++;
    }
    if (r.level >= NAP.MAX_LEVEL) { r.level = NAP.MAX_LEVEL; r.xp = 0; }
    NAP.save();
    return { leveled: ups, level: r.level };
  };
  NAP.unlock = function (id) {
    if (NAP.progress.unlocked.indexOf(id) < 0) NAP.progress.unlocked.push(id);
  };
  NAP.markCleared = function (id) {
    if (NAP.progress.cleared.indexOf(id) < 0) NAP.progress.cleared.push(id);
    NAP.save();
  };

  // ---- chapter runner (threads story -> dream -> wake -> story ...) ----
  NAP.chapter = null;
  NAP.startChapter = function (charId) {
    // persist = mods that last the whole night (e.g. favorite food buff)
    // pending = mods for the very next dream only
    NAP.chapter = { charId, i: 0, persist: {}, pending: {}, prevType: null };
    NAP.runSegment();
  };
  NAP.runSegment = function () {
    const chap = NAP.chapter; if (!chap) return;
    const segs = NAP.DATA.characters[chap.charId].chapter.segments;
    const seg = segs[chap.i];
    if (!seg) { NAP.completeChapter(chap.charId); return; }

    if (seg.type === "story") {
      // wake up out of a dream, else a soft fade
      const type = chap.prevType === "dream" ? "wake" : "fade";
      chap.prevType = "story";
      NAP.go(NAP.scenes.vn, { charId: chap.charId, segment: seg },
        { type, outDur: 0.7, inDur: 0.7 });
    } else { // dream
      // Napling's dreams resolve their boss/arena from the opening choice
      let base = seg.dream;
      if (base.napSlot && NAP.resolveNapArena) base = Object.assign({}, base, NAP.resolveNapArena(base.napSlot, (chap.persist || {}).napPick));
      const cfg = NAP.buildDreamConfig(chap.charId, base, chap.persist, chap.pending);
      cfg.title = seg.title;
      chap.pending = {};
      chap.prevType = "dream";
      NAP.go(NAP.scenes.dream, { config: cfg }, { type: "sleep", outDur: 1.1, inDur: 0.9 });
    }
  };
  // story segment finished -> stash its choice mods, go to next segment
  NAP.chapterAfterStory = function (pending, persist) {
    const chap = NAP.chapter; if (!chap) return;
    if (persist) Object.assign(chap.persist, persist);
    if (pending) chap.pending = Object.assign(chap.pending, pending);
    chap.i++; NAP.runSegment();
  };
  // dream won -> next segment. dream lost -> handled via result (replay).
  NAP.chapterAfterDreamWin = function () {
    const chap = NAP.chapter; if (!chap) return;
    chap.i++; NAP.runSegment();
  };
  NAP.chapterReplayDream = function () { NAP.runSegment(); };
  NAP.chapterQuit = function () { NAP.chapter = null; NAP.go(NAP.scenes.title, {}, { type: "fade" }); };
  NAP.completeChapter = function (charId) {
    const firstClear = NAP.progress.cleared.indexOf(charId) < 0;
    NAP.markCleared(charId);
    if (firstClear) {
      const ch = NAP.DATA.characters[charId];
      if (ch.tutorial) for (const id of NAP.DATA.order)
        if (id !== charId && NAP.progress.unlocked.indexOf(id) < 0) NAP.unlock(id);
      NAP.save();
    }
    NAP.chapter = null;
    NAP.go(NAP.scenes.title, {}, { type: "fade" });
  };

  // ---- main loop ----
  let last = 0;
  function loop(ts) {
    const t = ts / 1000; let dt = last ? t - last : 0; last = t;
    dt = Math.min(dt, 0.05);
    try { NAP.pollGamepad(dt); } catch (e) { /* input never blocks the frame */ }
    try {
      // held attack (pad A / touch attack pad) — tryAttack guards its own rate
      if (input.fireAttack && NAP.scene === NAP.scenes.dream && !NAP.transition && NAP.scene.tryAttack) NAP.scene.tryAttack();
      if (NAP.scene) {
        if (NAP.scene.update) NAP.scene.update(dt);
        if (NAP.scene.draw) NAP.scene.draw(ctx);
      }
      NAP.drawInputOverlay(ctx);
    } catch (e) {
      if (!loop._warned) { console.error("Nap Time scene error:", e); loop._warned = true; }
    }
    // transitions run in their own block so a scene error can never break them
    try { updateTransition(dt); drawTransition(); } catch (e) { NAP.transition = null; }
    requestAnimationFrame(loop);   // always reschedule, even after an error
  }

  // ---- boot ----
  NAP.boot = async function () {
    NAP.resize();
    // preload always-needed sprites (player + enemy dream frames, tiles, potion, VN sprites)
    const M = NAP.META;
    const files = ["tile_floor.png", "tile_floor2.png", "tile_wall.png", "potion.png",
      "tile_rooftop_floor.png", "tile_rooftop_floor2.png", "tile_rooftop_wall.png", "tile_rooftop_wall2.png",
      "tile_library_floor.png", "tile_library_floor2.png", "tile_library_wall.png", "tile_library_wall2.png",
      "tile_library_corrupt_floor.png", "tile_library_corrupt_wall.png",
      "tile_pond_floor.png", "tile_pond_floor2.png", "tile_pond_water.png", "tile_pond_edge.png", "tile_pond_reeds.png", "tile_pond_bush.png",
      "tile_meadow_floor.png", "tile_meadow_floor2.png", "tile_meadow_picnic.png", "tile_meadow_wall.png", "tile_meadow_wall2.png",
      "tile_ship_floor.png", "tile_ship_floor2.png", "tile_ship_wall.png", "tile_ship_wall2.png",
      M.misc.vn_kumori.file, M.misc.vn_shadow.file, M.misc.bg_galaxy.file,
      M.misc.bg_egg_room.file, M.misc.vn_egg.file, M.misc.bg_rooftop.file, M.misc.vn_neogaucha.file,
      M.misc.bg_library.file, M.misc.vn_lua.file, M.misc.vn_siren.file,
      M.misc.bg_pond.file, M.misc.vn_beek.file, M.misc.bg_meadow.file, M.misc.vn_nap.file,
      M.misc.bg_ship.file, M.misc.vn_imq.file, M.misc.vn_ims.file];
    for (const k in M.misc.foods) files.push(M.misc.foods[k].file);
    for (const id in M.chars) NAP.entityFiles(M.chars[id]).forEach(f => files.push(f));
    for (const id in M.foes) NAP.entityFiles(M.foes[id]).forEach(f => files.push(f));
    for (const id in M.allies) NAP.entityFiles(M.allies[id]).forEach(f => files.push(f));
    await NAP.loadImages(files);
    const loading = document.getElementById("loading");
    if (loading) loading.style.display = "none";
    NAP.setScene(NAP.scenes.title);
    requestAnimationFrame(loop);
  };

  NAP.scenes = {}; // filled by scene files
})(window.NAP);
