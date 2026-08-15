/* =============================================================
   Nap Time — procedural VN backgrounds (canvas-painted).
   Placeholders until real scene art drops in; keyed by name so a
   painter can later be swapped for an image without touching data.
   ============================================================= */
(function (NAP) {
  "use strict";
  const BG = NAP.backgrounds = {};

  // deterministic star field per scene so it doesn't shimmer randomly
  function stars(n, seed) {
    const out = []; let s = seed;
    const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    for (let i = 0; i < n; i++) out.push({ x: rnd(), y: rnd(), r: rnd() * 1.6 + 0.3, p: rnd() * 6.28 });
    return out;
  }
  const roomStars = stars(60, 12345);

  // Egg's room — use the real scene art (cover-fit). Falls back to the
  // procedural room below if the image hasn't loaded.
  BG.bedroom_night = function (ctx, w, h, t) {
    const im = NAP.img(NAP.META.misc.bg_egg_room.file);
    if (im) {
      const s = Math.max(w / im.width, h / im.height);
      const dw = im.width * s, dh = im.height * s;
      ctx.drawImage(im, (w - dw) / 2, (h - dh) / 2, dw, dh);
      return;
    }
    BG._bedroom_procedural(ctx, w, h, t);
  };

  // Kumori's cozy bedroom at night (procedural fallback)
  BG._bedroom_procedural = function (ctx, w, h, t) {
    // wall gradient
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#3b2a63"); g.addColorStop(0.6, "#4d3576"); g.addColorStop(1, "#5f4488");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

    // floor
    const fy = h * 0.74;
    const fg = ctx.createLinearGradient(0, fy, 0, h);
    fg.addColorStop(0, "#6b4f92"); fg.addColorStop(1, "#7d5ea3");
    ctx.fillStyle = fg; ctx.fillRect(0, fy, w, h - fy);
    ctx.strokeStyle = "rgba(30,18,55,0.25)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, fy); ctx.lineTo(w, fy); ctx.stroke();

    // window with night sky
    const wx = w * 0.60, wy = h * 0.12, ww = w * 0.30, wh = h * 0.42;
    ctx.fillStyle = "#20163d"; NAP.draw.rr(wx - 8, wy - 8, ww + 16, wh + 16, 14); ctx.fill();
    const sky = ctx.createLinearGradient(0, wy, 0, wy + wh);
    sky.addColorStop(0, "#15103a"); sky.addColorStop(1, "#3a2c66");
    ctx.save(); NAP.draw.rr(wx, wy, ww, wh, 8); ctx.clip();
    ctx.fillStyle = sky; ctx.fillRect(wx, wy, ww, wh);
    // moon
    ctx.fillStyle = "#fdf3d0"; ctx.beginPath();
    ctx.arc(wx + ww * 0.72, wy + wh * 0.30, 22, 0, 6.28); ctx.fill();
    ctx.fillStyle = "#3a2c66"; ctx.beginPath();
    ctx.arc(wx + ww * 0.80, wy + wh * 0.25, 18, 0, 6.28); ctx.fill();
    // stars
    for (const st of roomStars) {
      const a = 0.35 + 0.4 * Math.sin(t * 1.4 + st.p);
      ctx.globalAlpha = a; ctx.fillStyle = "#fff8e7";
      ctx.beginPath(); ctx.arc(wx + st.x * ww, wy + st.y * wh, st.r, 0, 6.28); ctx.fill();
    }
    ctx.globalAlpha = 1; ctx.restore();
    // window frame cross
    ctx.strokeStyle = "#20163d"; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(wx + ww / 2, wy); ctx.lineTo(wx + ww / 2, wy + wh);
    ctx.moveTo(wx, wy + wh / 2); ctx.lineTo(wx + ww, wy + wh / 2); ctx.stroke();

    // bed (left)
    const bx = w * 0.05, by = h * 0.52, bw = w * 0.42, bh = h * 0.30;
    ctx.fillStyle = "#8a6bb0"; NAP.draw.rr(bx, by + bh * 0.35, bw, bh * 0.65, 12); ctx.fill(); // frame
    ctx.fillStyle = "#f4e8ff"; NAP.draw.rr(bx + 6, by + bh * 0.30, bw - 12, bh * 0.35, 14); ctx.fill(); // mattress
    ctx.fillStyle = "#ff9ec2"; NAP.draw.rr(bx + 6, by + bh * 0.30, bw - 12, bh * 0.16, 12); ctx.fill(); // blanket fold
    ctx.fillStyle = "#fff"; NAP.draw.rr(bx + 16, by + bh * 0.18, bw * 0.30, bh * 0.22, 12); ctx.fill(); // pillow

    // a couple of floating "z" and cloud motes for atmosphere
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    for (let i = 0; i < 5; i++) {
      const mx = (w * 0.15 + i * w * 0.16 + Math.sin(t * 0.5 + i) * 12);
      const my = h * 0.30 + Math.cos(t * 0.6 + i * 1.7) * 10 + i * 4;
      ctx.beginPath(); ctx.arc(mx, my, 5 + (i % 2) * 3, 0, 6.28); ctx.fill();
    }

    // warm vignette
    const vg = ctx.createRadialGradient(w / 2, h * 0.55, h * 0.3, w / 2, h * 0.55, h * 0.85);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(20,10,40,0.5)");
    ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);
  };

  // A dim, dreamlike void used for the "drifting off" beat
  BG.dream_void = function (ctx, w, h, t) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#241640"); g.addColorStop(1, "#3a2560");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    for (const st of roomStars) {
      const a = 0.3 + 0.5 * Math.sin(t * 1.2 + st.p);
      ctx.globalAlpha = a; ctx.fillStyle = "#e9dcff";
      ctx.beginPath(); ctx.arc(st.x * w, st.y * h, st.r * 1.4, 0, 6.28); ctx.fill();
    }
    ctx.globalAlpha = 1;
    const vg = ctx.createRadialGradient(w / 2, h / 2, h * 0.2, w / 2, h / 2, h * 0.8);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(10,6,22,0.6)");
    ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);
  };

  // Galaxy nebula (real painting), cover-fit with a slow drift + twinkle.
  BG.galaxy = function (ctx, w, h, t) {
    const im = NAP.img(NAP.META.misc.bg_galaxy.file);
    if (!im) { BG.dream_void(ctx, w, h, t); return; }
    // cover-fit
    const s = Math.max(w / im.width, h / im.height);
    const dw = im.width * s, dh = im.height * s;
    const dx = (w - dw) / 2, dy = (h - dh) / 2 + Math.sin(t * 0.2) * 8;
    ctx.drawImage(im, dx, dy, dw, dh);
    // gentle dark wash for text legibility over bright areas
    ctx.fillStyle = "rgba(20,12,40,0.18)"; ctx.fillRect(0, 0, w, h);
    // extra twinkle sparkles
    for (const st of roomStars) {
      const a = 0.15 + 0.35 * Math.sin(t * 2 + st.p);
      ctx.globalAlpha = a; ctx.fillStyle = "#fff8e7";
      ctx.beginPath(); ctx.arc(st.x * w, st.y * h, st.r, 0, 6.28); ctx.fill();
    }
    ctx.globalAlpha = 1;
  };

  // Neogaucha's rooftop (uses the rooftop dream art as a scene backdrop)
  BG.rooftop = function (ctx, w, h, t) {
    const im = NAP.img(NAP.META.misc.bg_rooftop.file);
    if (!im) { BG.dream_void(ctx, w, h, t); return; }
    const s = Math.max(w / im.width, h / im.height), dw = im.width * s, dh = im.height * s;
    ctx.drawImage(im, (w - dw) / 2, (h - dh) / 2 + Math.sin(t * 0.2) * 6, dw, dh);
    ctx.fillStyle = "rgba(20,12,40,0.14)"; ctx.fillRect(0, 0, w, h);
    for (const st of roomStars) {
      const a = 0.15 + 0.3 * Math.sin(t * 1.6 + st.p);
      ctx.globalAlpha = a; ctx.fillStyle = "#fff8e7";
      ctx.beginPath(); ctx.arc(st.x * w, st.y * h * 0.5, st.r, 0, 6.28); ctx.fill();
    }
    ctx.globalAlpha = 1;
  };

  // Lua's cloud library (uses the library art as a scene backdrop)
  BG.library = function (ctx, w, h, t) {
    const im = NAP.img(NAP.META.misc.bg_library.file);
    if (!im) { BG.dream_void(ctx, w, h, t); return; }
    const s = Math.max(w / im.width, h / im.height), dw = im.width * s, dh = im.height * s;
    ctx.drawImage(im, (w - dw) / 2, (h - dh) / 2 + Math.sin(t * 0.2) * 5, dw, dh);
    ctx.fillStyle = "rgba(20,12,40,0.08)"; ctx.fillRect(0, 0, w, h);
  };

  BG.paint = function (name, ctx, w, h, t) {
    (BG[name] || BG.bedroom_night)(ctx, w, h, t);
  };
})(window.NAP);
