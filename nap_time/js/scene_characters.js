/* Nap Time — Characters roster. Pick a dreamer to open their skill tree. */
(function (NAP) {
  "use strict";
  const U = NAP.util, D = NAP.draw, M = NAP.META;

  NAP.scenes.characters = {
    enter() { this.t = 0; this.layout(); },
    onResize() { this.layout(); },
    roster() { return NAP.DATA.order.filter(id => NAP.DATA.characters[id] && NAP.SKILLS[id]); },

    layout() {
      const w = NAP.view.w, h = NAP.view.h, ids = this.roster(), n = ids.length;
      const gap = 22, cardW = Math.min(230, (w - 90) / n - gap), cardH = Math.min(h * 0.62, 360);
      const totalW = n * cardW + (n - 1) * gap, sx = (w - totalW) / 2, y = h * 0.24;
      this.cards = ids.map((id, i) => ({ id, x: sx + i * (cardW + gap), y, w: cardW, h: cardH }));
      this.backRect = { x: w / 2 - 90, y: h - 56, w: 180, h: 40 };
    },
    onKey(k) { if (k === "escape") NAP.go(NAP.scenes.select, {}, { type: "fade" }); },
    onDown(x, y) {
      for (const c of this.cards) {
        if (x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h) {
          if (NAP.progress.unlocked.indexOf(c.id) >= 0) NAP.go(NAP.scenes.skills, { charId: c.id, back: "characters" }, { type: "fade" });
          return;
        }
      }
      if (x >= this.backRect.x && x <= this.backRect.x + this.backRect.w && y >= this.backRect.y && y <= this.backRect.y + this.backRect.h)
        NAP.go(NAP.scenes.select, {}, { type: "fade" });
    },
    update(dt) { this.t += dt; },

    draw(ctx) {
      const w = NAP.view.w, h = NAP.view.h, t = this.t;
      NAP.backgrounds.dream_void(ctx, w, h, t);
      ctx.textAlign = "center";
      ctx.fillStyle = "#e9dcff"; ctx.font = "bold 40px 'Trebuchet MS',sans-serif";
      ctx.fillText("Dreamers", w / 2, h * 0.14);
      ctx.fillStyle = "rgba(233,220,255,0.75)"; ctx.font = "italic 16px 'Trebuchet MS',sans-serif";
      ctx.fillText("Pick a dreamer to spend their skill points.", w / 2, h * 0.14 + 26);

      const mx = NAP.input.mouse.x, my = NAP.input.mouse.y;
      for (const c of this.cards) {
        const ch = NAP.DATA.characters[c.id], rec = NAP.charProgress(c.id);
        const unlocked = NAP.progress.unlocked.indexOf(c.id) >= 0;
        const hot = unlocked && mx >= c.x && mx <= c.x + c.w && my >= c.y && my <= c.y + c.h;
        const bob = hot ? Math.sin(t * 4) * 3 : 0;

        // card
        ctx.fillStyle = hot ? "rgba(123,216,143,0.22)" : "rgba(30,20,50,0.9)";
        D.rr(c.x, c.y - bob, c.w, c.h, 16); ctx.fill();
        ctx.strokeStyle = hot ? (ch.accent || "#a8e6cf") : "rgba(255,255,255,0.16)"; ctx.lineWidth = 2;
        D.rr(c.x, c.y - bob, c.w, c.h, 16); ctx.stroke();

        // portrait (idle sprite, contain-fit in the upper area)
        const anim = M.chars[c.id].idle_down, im = NAP.img(anim.files[0]);
        const padTop = 14, portH = c.h * 0.60, portW = c.w - 24;
        if (im) {
          const s = Math.min(portW / anim.canvasW, portH / anim.canvasH);
          const dw = anim.canvasW * s, dh = anim.canvasH * s;
          ctx.save(); if (!unlocked) ctx.globalAlpha = 0.35;
          ctx.drawImage(im, c.x + (c.w - dw) / 2, c.y + padTop - bob, dw, dh);
          ctx.restore();
        }

        // name + title
        const ty = c.y + c.h * 0.66 - bob;
        ctx.fillStyle = unlocked ? "#fff" : "rgba(255,255,255,0.5)"; ctx.font = "bold 20px 'Trebuchet MS',sans-serif";
        ctx.fillText(ch.name, c.x + c.w / 2, ty);
        ctx.fillStyle = ch.accent || "#d9c8ff"; ctx.font = "12px 'Trebuchet MS',sans-serif";
        ctx.globalAlpha = unlocked ? 1 : 0.5;
        ctx.fillText((ch.title || "").toUpperCase(), c.x + c.w / 2, ty + 18);
        ctx.globalAlpha = 1;

        if (unlocked) {
          ctx.fillStyle = "rgba(255,255,255,0.8)"; ctx.font = "13px 'Trebuchet MS',sans-serif";
          ctx.fillText("Lv " + rec.level, c.x + c.w / 2, ty + 40);
          if (rec.points > 0) {
            ctx.fillStyle = "#ffe08a"; ctx.font = "bold 13px 'Trebuchet MS',sans-serif";
            ctx.fillText("★ " + rec.points + " skill point" + (rec.points === 1 ? "" : "s"), c.x + c.w / 2, ty + 60);
          } else {
            ctx.fillStyle = "rgba(255,255,255,0.45)"; ctx.font = "12px 'Trebuchet MS',sans-serif";
            ctx.fillText("no points to spend", c.x + c.w / 2, ty + 60);
          }
        } else {
          ctx.fillStyle = "#ff9a9a"; ctx.font = "bold 14px 'Trebuchet MS',sans-serif";
          ctx.fillText("🔒 locked", c.x + c.w / 2, ty + 44);
        }
      }
      ctx.textAlign = "center";

      const bhot = mx >= this.backRect.x && mx <= this.backRect.x + this.backRect.w && my >= this.backRect.y && my <= this.backRect.y + this.backRect.h;
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
