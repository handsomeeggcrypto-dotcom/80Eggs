/* Nap Time — Dream Select: Stories (left column) + Modes (right column). */
(function (NAP) {
  "use strict";
  const D = NAP.draw;

  NAP.scenes.select = {
    enter() {
      this.t = 0;
      this.stories = [
        { label: "Egg", sub: "cloud meadows · tutorial", go: () => NAP.startChapter("egg") },
        { label: "Neogaucha", sub: "rooftop oni · her story", go: () => NAP.startChapter("neogaucha") },
        { label: "Lua", sub: "cloud library · her story", go: () => NAP.startChapter("lua") },
        { label: "Beek", sub: "pond meadow · his story", go: () => NAP.startChapter("beek") },
        { label: "Napling", sub: "dream-weaver · her story", go: () => NAP.startChapter("nap") },
        { label: "IMQ", sub: "glorp alien · her story", go: () => NAP.startChapter("imq") },
      ];
      this.modes = [
        { label: "🗺 Adventure", sub: "free roam · bounties & treasure",
          go: () => NAP.go(NAP.scenes.adventure, {}, { type: "fade" }) },
        { label: "🌙 Deep Sleep", sub: "endless rift · descend",
          go: () => NAP.go(NAP.scenes.deepsleep, {}, { type: "fade" }) },
        { label: "✦ Skill Trees", sub: "dreamers · spend skill points",
          go: () => NAP.go(NAP.scenes.characters, {}, { type: "fade" }) },
      ];
      this.layout();
    },
    onResize() { this.layout(); },
    layout() {
      const w = NAP.view.w, h = NAP.view.h;
      const colW = Math.min(340, (w - 70) / 2);
      const totalW = colW * 2 + 30, startX = (w - totalW) / 2;
      this.leftX = startX; this.rightX = startX + colW + 30; this.colW = colW;
      this.colTop = h * 0.30;
      this.backRect = { x: w / 2 - 90, y: h - 56, w: 180, h: 40 };
      const bottomLimit = this.backRect.y - 18, availH = bottomLimit - this.colTop;
      // left: stories
      const nL = this.stories.length, gapL = 10;
      const bhL = Math.max(38, Math.min(62, (availH - (nL - 1) * gapL) / nL));
      let y = this.colTop;
      for (const e of this.stories) { e.x = this.leftX; e.y = y; e.w = colW; e.h = bhL; y += bhL + gapL; }
      // right: modes (fewer, so taller)
      const nR = this.modes.length, gapR = 14;
      const bhR = Math.max(48, Math.min(80, (availH - (nR - 1) * gapR) / nR));
      y = this.colTop;
      for (const e of this.modes) { e.x = this.rightX; e.y = y; e.w = colW; e.h = bhR; y += bhR + gapR; }
    },
    onKey(k) { if (k === "escape") NAP.go(NAP.scenes.title, {}, { type: "fade" }); },
    onDown(x, y) {
      const hit = e => x >= e.x && x <= e.x + e.w && y >= e.y && y <= e.y + e.h;
      for (const e of this.stories) if (hit(e)) { e.go(); return; }
      for (const e of this.modes) if (hit(e)) { e.go(); return; }
      if (hit(this.backRect)) NAP.go(NAP.scenes.title, {}, { type: "fade" });
    },
    update(dt) { this.t += dt; },
    draw(ctx) {
      const w = NAP.view.w, h = NAP.view.h, t = this.t;
      NAP.backgrounds.dream_void(ctx, w, h, t);
      const mx = NAP.input.mouse.x, my = NAP.input.mouse.y;
      ctx.textAlign = "center";
      ctx.fillStyle = "#e9dcff"; ctx.font = "bold 38px 'Trebuchet MS',sans-serif";
      ctx.fillText("Choose a Dream", w / 2, h * 0.17);

      const drawBtn = (e, accent) => {
        const hot = mx >= e.x && mx <= e.x + e.w && my >= e.y && my <= e.y + e.h;
        ctx.fillStyle = hot ? "rgba(123,216,143,0.28)" : "rgba(38,24,60,0.92)";
        D.rr(e.x, e.y, e.w, e.h, 13); ctx.fill();
        ctx.strokeStyle = hot ? "#a8e6cf" : "rgba(255,255,255,0.18)"; ctx.lineWidth = 2;
        D.rr(e.x, e.y, e.w, e.h, 13); ctx.stroke();
        ctx.fillStyle = "#fff"; ctx.font = "bold 19px 'Trebuchet MS',sans-serif";
        ctx.fillText(e.label, e.x + e.w / 2, e.y + (e.sub ? e.h / 2 - 3 : e.h / 2 + 6));
        if (e.sub) { ctx.fillStyle = "rgba(255,255,255,0.6)"; ctx.font = "12px 'Trebuchet MS',sans-serif";
          ctx.fillText(e.sub, e.x + e.w / 2, e.y + e.h / 2 + 15); }
      };

      // column headers
      ctx.fillStyle = "#a8e6cf"; ctx.font = "bold 15px 'Trebuchet MS',sans-serif";
      ctx.fillText("STORIES", this.leftX + this.colW / 2, this.colTop - 12);
      ctx.fillStyle = "#c8b0ff";
      ctx.fillText("MODES", this.rightX + this.colW / 2, this.colTop - 12);

      for (const e of this.stories) drawBtn(e);
      for (const e of this.modes) drawBtn(e);

      // back
      const b = this.backRect, bhot = mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h;
      ctx.fillStyle = bhot ? "rgba(123,216,143,0.28)" : "rgba(38,24,60,0.92)";
      D.rr(b.x, b.y, b.w, b.h, 12); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.2)"; ctx.lineWidth = 2;
      D.rr(b.x, b.y, b.w, b.h, 12); ctx.stroke();
      ctx.fillStyle = "#fff"; ctx.font = "16px 'Trebuchet MS',sans-serif";
      ctx.fillText("← Back", b.x + b.w / 2, b.y + 26);
      ctx.textAlign = "left";
    },
  };
})(window.NAP);
