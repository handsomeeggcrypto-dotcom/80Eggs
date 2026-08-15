/* Nap Time — Dream Select (simple level/character launcher) */
(function (NAP) {
  "use strict";
  const U = NAP.util, D = NAP.draw;

  NAP.scenes.select = {
    enter() {
      this.t = 0;
      this.entries = [
        { label: "Egg — Night One", sub: "cloud meadows · tutorial",
          go: () => NAP.startChapter("egg") },
        { label: "Neogaucha — Rooftop Night", sub: "punk-rock oni · her story",
          go: () => NAP.startChapter("neogaucha") },
        { label: "Lua — Cloud Library", sub: "star dreamling · corruption creeping in",
          go: () => NAP.playDream("lua", NAP.DATA.characters.lua.library) },
        { label: "🌙 Deep Sleep", sub: "endless rift · grind & descend",
          go: () => NAP.go(NAP.scenes.deepsleep, {}, { type: "fade" }) },
        { label: "✦ Skill Trees", sub: "spend skill points",
          go: () => NAP.go(NAP.scenes.skills, { charId: "egg", back: "select" }, { type: "fade" }) },
        { label: "← Back", sub: "", go: () => NAP.go(NAP.scenes.title, {}, { type: "fade" }) },
      ];
      this.layout();
    },
    onResize() { this.layout(); },
    layout() {
      const w = NAP.view.w, h = NAP.view.h, bw = Math.min(460, w - 80), bh = 62, gap = 16;
      const totalH = this.entries.length * bh + (this.entries.length - 1) * gap;
      let y = h * 0.34;
      for (const e of this.entries) { e.x = (w - bw) / 2; e.y = y; e.w = bw; e.h = bh; y += bh + gap; }
    },
    onKey(k) { if (k === "escape") NAP.go(NAP.scenes.title, {}, { type: "fade" }); },
    onDown(x, y) {
      for (const e of this.entries)
        if (x >= e.x && x <= e.x + e.w && y >= e.y && y <= e.y + e.h) { e.go(); return; }
    },
    update(dt) { this.t += dt; },
    draw(ctx) {
      const w = NAP.view.w, h = NAP.view.h, t = this.t;
      NAP.backgrounds.dream_void(ctx, w, h, t);
      ctx.textAlign = "center";
      ctx.fillStyle = "#e9dcff"; ctx.font = "bold 40px 'Trebuchet MS',sans-serif";
      ctx.fillText("Choose a Dream", w / 2, h * 0.22);
      const mx = NAP.input.mouse.x, my = NAP.input.mouse.y;
      for (const e of this.entries) {
        const hot = mx >= e.x && mx <= e.x + e.w && my >= e.y && my <= e.y + e.h;
        ctx.fillStyle = hot ? "rgba(123,216,143,0.28)" : "rgba(38,24,60,0.92)";
        D.rr(e.x, e.y, e.w, e.h, 14); ctx.fill();
        ctx.strokeStyle = hot ? "#a8e6cf" : "rgba(255,255,255,0.18)"; ctx.lineWidth = 2;
        D.rr(e.x, e.y, e.w, e.h, 14); ctx.stroke();
        ctx.fillStyle = "#fff"; ctx.font = "bold 20px 'Trebuchet MS',sans-serif";
        ctx.fillText(e.label, e.x + e.w / 2, e.y + (e.sub ? e.h / 2 - 4 : e.h / 2 + 7));
        if (e.sub) { ctx.fillStyle = "rgba(255,255,255,0.6)"; ctx.font = "13px 'Trebuchet MS',sans-serif";
          ctx.fillText(e.sub, e.x + e.w / 2, e.y + e.h / 2 + 16); }
      }
      ctx.textAlign = "left";
    },
  };
})(window.NAP);
