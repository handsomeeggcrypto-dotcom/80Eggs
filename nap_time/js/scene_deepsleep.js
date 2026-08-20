/* Nap Time — Deep Sleep menu (choose a dreamer, dive into the endless rift). */
(function (NAP) {
  "use strict";
  const U = NAP.util, D = NAP.draw;

  NAP.scenes.deepsleep = {
    enter() { this.t = 0; this.layout(); },
    onResize() { this.layout(); },
    chars() { return NAP.progress.unlocked.filter(id => NAP.DATA.characters[id]); },
    layout() {
      const w = NAP.view.w, h = NAP.view.h, chars = this.chars();
      const bw = Math.min(420, w - 80), bh = 68, gap = 16;
      let y = h * 0.32;
      this.rows = chars.map(id => { const r = { id, x: (w - bw) / 2, y, w: bw, h: bh }; y += bh + gap; return r; });
      this.backRect = { x: w / 2 - 90, y: h - 56, w: 180, h: 40 };
    },
    onKey(k) { if (k === "escape") NAP.go(NAP.scenes.select, {}, { type: "fade" }); },
    onDown(x, y) {
      for (const r of this.rows) if (in_(r, x, y)) { NAP.startRift(r.id); return; }
      if (in_(this.backRect, x, y)) NAP.go(NAP.scenes.select, {}, { type: "fade" });
    },
    update(dt) { this.t += dt; },
    draw(ctx) {
      const w = NAP.view.w, h = NAP.view.h, t = this.t;
      NAP.backgrounds.dream_void(ctx, w, h, t);
      ctx.textAlign = "center";
      ctx.fillStyle = "#c8b0ff"; ctx.font = "bold 42px 'Trebuchet MS',sans-serif";
      ctx.fillText("Deep Sleep", w / 2, h * 0.18);
      ctx.fillStyle = "rgba(233,220,255,0.8)"; ctx.font = "italic 17px 'Trebuchet MS',sans-serif";
      ctx.fillText("Dive into endless dreams. How deep can you sink?", w / 2, h * 0.18 + 30);

      const mx = NAP.input.mouse.x, my = NAP.input.mouse.y;
      for (const r of this.rows) {
        const ch = NAP.DATA.characters[r.id], rec = NAP.charProgress(r.id), hot = in_(r, mx, my);
        ctx.fillStyle = hot ? "rgba(155,107,255,0.28)" : "rgba(34,22,54,0.92)";
        D.rr(r.x, r.y, r.w, r.h, 14); ctx.fill();
        ctx.strokeStyle = hot ? "#c8b0ff" : "rgba(255,255,255,0.18)"; ctx.lineWidth = 2;
        D.rr(r.x, r.y, r.w, r.h, 14); ctx.stroke();
        ctx.textAlign = "left"; ctx.fillStyle = "#fff"; ctx.font = "bold 20px 'Trebuchet MS',sans-serif";
        ctx.fillText("Dive as " + ch.name, r.x + 20, r.y + 30);
        ctx.fillStyle = "rgba(255,255,255,0.6)"; ctx.font = "13px 'Trebuchet MS',sans-serif";
        ctx.fillText("Lv " + rec.level + "  ·  " + (rec.points || 0) + " skill pts", r.x + 20, r.y + 50);
        ctx.textAlign = "right"; ctx.fillStyle = "#ffe08a"; ctx.font = "bold 15px 'Trebuchet MS',sans-serif";
        ctx.fillText("best depth: " + (rec.bestDepth || 0), r.x + r.w - 20, r.y + 40);
      }
      ctx.textAlign = "center";

      const bhot = in_(this.backRect, mx, my);
      ctx.fillStyle = bhot ? "rgba(123,216,143,0.28)" : "rgba(38,24,60,0.92)";
      D.rr(this.backRect.x, this.backRect.y, this.backRect.w, this.backRect.h, 12); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.2)"; ctx.lineWidth = 2;
      D.rr(this.backRect.x, this.backRect.y, this.backRect.w, this.backRect.h, 12); ctx.stroke();
      ctx.fillStyle = "#fff"; ctx.font = "16px 'Trebuchet MS',sans-serif";
      ctx.fillText("← Back", this.backRect.x + this.backRect.w / 2, this.backRect.y + 26);
      ctx.textAlign = "left";
    },
  };
  function in_(r, x, y) { return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; }

  // ---- Adventure Mode picker (choose a dreamer, roam a big mixed-biome map) ----
  NAP.scenes.adventure = {
    enter() { this.t = 0; this.layout(); },
    onResize() { this.layout(); },
    chars() { return NAP.progress.unlocked.filter(id => NAP.DATA.characters[id]); },
    layout() {
      const w = NAP.view.w, h = NAP.view.h, chars = this.chars();
      const bw = Math.min(420, w - 80), bh = 64, gap = 14;
      let y = h * 0.30;
      this.rows = chars.map(id => { const r = { id, x: (w - bw) / 2, y, w: bw, h: bh }; y += bh + gap; return r; });
      this.backRect = { x: w / 2 - 90, y: h - 56, w: 180, h: 40 };
    },
    onKey(k) { if (k === "escape") NAP.go(NAP.scenes.select, {}, { type: "fade" }); },
    onDown(x, y) {
      for (const r of this.rows) if (in_(r, x, y)) { NAP.playAdventure(r.id); return; }
      if (in_(this.backRect, x, y)) NAP.go(NAP.scenes.select, {}, { type: "fade" });
    },
    update(dt) { this.t += dt; },
    draw(ctx) {
      const w = NAP.view.w, h = NAP.view.h, t = this.t;
      NAP.backgrounds.dream_void(ctx, w, h, t);
      ctx.textAlign = "center";
      ctx.fillStyle = "#a8e6cf"; ctx.font = "bold 42px 'Trebuchet MS',sans-serif";
      ctx.fillText("Adventure", w / 2, h * 0.17);
      ctx.fillStyle = "rgba(233,220,255,0.8)"; ctx.font = "italic 17px 'Trebuchet MS',sans-serif";
      ctx.fillText("Roam the dreamland. Bounties, treasure, and roaming hordes.", w / 2, h * 0.17 + 30);
      const mx = NAP.input.mouse.x, my = NAP.input.mouse.y;
      for (const r of this.rows) {
        const ch = NAP.DATA.characters[r.id], rec = NAP.charProgress(r.id), hot = in_(r, mx, my);
        ctx.fillStyle = hot ? "rgba(123,216,143,0.28)" : "rgba(34,22,54,0.92)";
        D.rr(r.x, r.y, r.w, r.h, 14); ctx.fill();
        ctx.strokeStyle = hot ? "#a8e6cf" : "rgba(255,255,255,0.18)"; ctx.lineWidth = 2;
        D.rr(r.x, r.y, r.w, r.h, 14); ctx.stroke();
        ctx.textAlign = "left"; ctx.fillStyle = "#fff"; ctx.font = "bold 20px 'Trebuchet MS',sans-serif";
        ctx.fillText("Explore as " + ch.name, r.x + 20, r.y + 30);
        ctx.fillStyle = "rgba(255,255,255,0.6)"; ctx.font = "13px 'Trebuchet MS',sans-serif";
        ctx.fillText("Lv " + rec.level + "  ·  " + (rec.points || 0) + " skill pts", r.x + 20, r.y + 48);
      }
      ctx.textAlign = "center";
      const bhot = in_(this.backRect, mx, my);
      ctx.fillStyle = bhot ? "rgba(123,216,143,0.28)" : "rgba(38,24,60,0.92)";
      D.rr(this.backRect.x, this.backRect.y, this.backRect.w, this.backRect.h, 12); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.2)"; ctx.lineWidth = 2;
      D.rr(this.backRect.x, this.backRect.y, this.backRect.w, this.backRect.h, 12); ctx.stroke();
      ctx.fillStyle = "#fff"; ctx.font = "16px 'Trebuchet MS',sans-serif";
      ctx.fillText("← Back", this.backRect.x + this.backRect.w / 2, this.backRect.y + 26);
      ctx.textAlign = "left";
    },
  };
})(window.NAP);
