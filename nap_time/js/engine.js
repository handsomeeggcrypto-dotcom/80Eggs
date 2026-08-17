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
    im.src = NAP.DIR + f;
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
  const input = NAP.input = { keys: {}, mouse: { x: 0, y: 0, down: false } };
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
  // basic touch -> click/move
  canvas.addEventListener("touchstart", e => {
    const t = e.touches[0]; if (!t) return; const r = canvas.getBoundingClientRect();
    const x = t.clientX - r.left, y = t.clientY - r.top;
    input.mouse.x = x; input.mouse.y = y; input.mouse.down = true;
    if (NAP.scene && NAP.scene.onDown && !NAP.transition) NAP.scene.onDown(x, y, 0);
    e.preventDefault();
  }, { passive: false });

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
      const cfg = NAP.buildDreamConfig(chap.charId, seg.dream, chap.persist, chap.pending);
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
    if (NAP.scene) {
      if (NAP.scene.update) NAP.scene.update(dt);
      if (NAP.scene.draw) NAP.scene.draw(ctx);
    }
    updateTransition(dt);
    drawTransition();
    requestAnimationFrame(loop);
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
      M.misc.vn_kumori.file, M.misc.vn_shadow.file, M.misc.bg_galaxy.file,
      M.misc.bg_egg_room.file, M.misc.vn_egg.file, M.misc.bg_rooftop.file, M.misc.vn_neogaucha.file,
      M.misc.bg_library.file, M.misc.vn_lua.file, M.misc.vn_siren.file,
      M.misc.bg_pond.file, M.misc.vn_beek.file, M.misc.bg_meadow.file, M.misc.vn_nap.file];
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
