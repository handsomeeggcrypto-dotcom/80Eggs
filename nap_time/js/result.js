/* Nap Time — wake-up / result card */
(function (NAP) {
  "use strict";
  const U = NAP.util, D = NAP.draw;

  NAP.scenes.result = {
    enter(params) {
      this.cfg = params.config;
      this.won = params.won;
      this.char = NAP.DATA.characters[this.cfg.charId];
      this.t = 0;
      this.newlyUnlocked = [];
      if (this.won) {
        const firstClear = NAP.progress.cleared.indexOf(this.char.id) < 0;
        NAP.markCleared(this.char.id);
        if (firstClear && this.char.tutorial) {
          // clearing the tutorial unlocks the rest of the current roster
          for (const id of NAP.DATA.order) {
            if (id !== this.char.id && NAP.progress.unlocked.indexOf(id) < 0) {
              NAP.unlock(id); this.newlyUnlocked.push(id);
            }
          }
          NAP.save();
        }
      }
      this.buttons = this.makeButtons();
    },
    makeButtons() {
      // y is filled in each draw() (layout depends on wrapped text height)
      const w = NAP.view.w, bw = 200, bh = 50;
      const charId = this.cfg.playerChar || this.cfg.charId;
      const pts = NAP.SKILLS && NAP.SKILLS[charId] ? NAP.charProgress(charId).points : 0;
      const btns = this.won
        ? [{ label: "Continue", act: "title" }]
        : [{ label: "Try again", act: "retry" }, { label: "Wake up", act: "title" }];
      // offer the skill screen if there are points waiting to spend
      if (pts > 0) btns.unshift({ label: "Spend " + pts + " pt" + (pts === 1 ? "" : "s"), act: "skills", accent: true });
      const n = btns.length, gap = 16, totalW = n * bw + (n - 1) * gap;
      let x = (w - totalW) / 2;
      for (const b of btns) { b.x = x; b.y = 0; b.w = bw; b.h = bh; x += bw + gap; }
      this._charId = charId;
      return btns;
    },
    onResize() { this.buttons = this.makeButtons(); },
    onKey(k) {
      if (k === "enter" || k === " ") this.do(this.buttons[0].act);
      if (k === "r" && !this.won) this.do("retry");
    },
    onDown(x, y) {
      for (const b of this.buttons)
        if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { this.do(b.act); return; }
    },
    do(act) {
      if (act === "skills") { NAP.go(NAP.scenes.skills, { charId: this._charId, back: "characters" }, { type: "fade" }); }
      else if (act === "title") { if (NAP.chapter) NAP.chapterQuit(); else NAP.go(NAP.scenes.title, {}, { type: "fade" }); }
      else if (act === "retry") {
        if (NAP.chapter) NAP.chapterReplayDream();   // replay the same dream segment
        else NAP.go(NAP.scenes.dream, { config: this.cfg }, { type: "sleep", outDur: 0.8, inDur: 0.8 });
      }
    },
    update(dt) { this.t += dt; },
    draw(ctx) {
      const w = NAP.view.w, h = NAP.view.h, t = this.t;
      NAP.backgrounds.bedroom_night(ctx, w, h, t);
      ctx.fillStyle = "rgba(16,10,32,0.72)"; ctx.fillRect(0, 0, w, h);

      const info = this.won ? this.char.win : this.char.lose;
      ctx.textAlign = "center";

      // deterministic vertical stack (holds at any viewport height)
      let ty = Math.max(58, h * 0.20);
      const pop = U.ease.out(U.clamp(t * 2.2, 0, 1));
      ctx.save(); ctx.translate(w / 2, ty); ctx.scale(pop, pop);
      ctx.fillStyle = this.won ? "#9dffc4" : "#ff8fb0";
      ctx.font = "bold 44px 'Trebuchet MS',sans-serif";
      ctx.fillText(info.title, 0, 0);
      ctx.restore();

      ty += 48;
      ctx.fillStyle = "#eae2ff"; ctx.font = "20px 'Trebuchet MS',sans-serif";
      for (const ln of D.wrap(info.text, Math.min(680, w - 80))) { ctx.fillText(ln, w / 2, ty); ty += 28; }

      ty += 14;
      ctx.fillStyle = "rgba(255,255,255,0.75)"; ctx.font = "15px 'Trebuchet MS',sans-serif";
      ctx.fillText("Objective — " + this.cfg.objDef.label, w / 2, ty);

      ty += 30;
      if (this.won && this.newlyUnlocked.length) {
        ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 3);
        ctx.fillStyle = "#ffe08a"; ctx.font = "bold 18px 'Trebuchet MS',sans-serif";
        ctx.fillText("★ New dreamers stir awake — " + this.newlyUnlocked.length + " more nights unlocked ★", w / 2, ty);
        ctx.globalAlpha = 1;
      } else if (this.won && this.char.tutorial) {
        ctx.fillStyle = "rgba(255,255,255,0.55)"; ctx.font = "14px sans-serif";
        ctx.fillText("(more characters coming soon)", w / 2, ty);
      }

      // buttons: below the content, but never off the bottom
      const btnY = Math.min(h - 74, ty + 30);
      for (const b of this.buttons) b.y = btnY;
      const mx = NAP.input.mouse.x, my = NAP.input.mouse.y;
      for (const b of this.buttons) {
        const hot = mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h;
        ctx.fillStyle = hot ? "rgba(123,216,143,0.30)" : "rgba(40,26,64,0.92)";
        D.rr(b.x, b.y, b.w, b.h, 12); ctx.fill();
        ctx.strokeStyle = hot ? "#a8e6cf" : "rgba(255,255,255,0.2)"; ctx.lineWidth = 2;
        D.rr(b.x, b.y, b.w, b.h, 12); ctx.stroke();
        ctx.fillStyle = "#fff"; ctx.font = "18px 'Trebuchet MS',sans-serif";
        ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 6);
      }
      ctx.textAlign = "left";
    },
  };
})(window.NAP);
