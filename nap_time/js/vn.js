/* =============================================================
   Nap Time — Visual Novel scene
   Background + bottom character sprite + dialogue box (typewriter)
   + choices that set dream modifiers.
   ============================================================= */
(function (NAP) {
  "use strict";
  const U = NAP.util, D = NAP.draw;

  const vn = NAP.scenes.vn = {
    enter(params) {
      this.char = NAP.DATA.characters[params.charId];
      this.segment = params.segment;
      this.script = params.segment.beats;
      this.i = 0;
      this.mods = {};           // per-dream choice modifiers (next dream only)
      this.persist = {};        // whole-night modifiers (e.g. favorite food)
      this.buttons = [];
      this.loadBeat();
    },

    onResize() { if (this.state === "choosing") this.buildButtons(); },

    loadBeat() {
      const beat = this.script[this.i];
      this.beat = beat;
      this.full = beat.text;
      this.shown = 0;
      this.state = "typing";
      this.choiceResolved = false;
      this.buttons = [];
    },

    // --- sprite for the current speaker ---
    speakerSprite() {
      const b = this.beat;
      if (b.side === "shadow") return this.char.nightmareVN;
      if (b.side) return this.char.vn;   // the character speaking
      return null;
    },

    advance() {
      if (this.state === "typing") { this.shown = this.full.length; this.afterType(); return; }
      if (this.state === "choosing") return;             // must pick
      if (this.state === "done") this.next();
    },

    afterType() {
      // once fully typed: show choice, or mark done
      if (this.beat.choice && !this.choiceResolved) {
        this.state = "choosing";
        this.buildButtons();
      } else {
        this.state = "done";
      }
    },

    buildButtons() {
      const w = NAP.view.w, opts = this.beat.choice.options;
      const gap = 12, boxTop = this.boxY() - 12, topMargin = 14;
      this.gridChoice = opts.some(o => o.icon);   // icon choices -> card grid
      if (this.gridChoice) {
        const cols = opts.length >= 3 ? 2 : opts.length;
        const rows = Math.ceil(opts.length / cols);
        const cardW = Math.min(200, (w - 80) / cols - gap);
        let cardH = (boxTop - topMargin - (rows - 1) * gap) / rows;
        cardH = Math.max(62, Math.min(108, cardH));
        const gridW = cols * cardW + (cols - 1) * gap;
        const gridH = rows * cardH + (rows - 1) * gap;
        const sx = (w - gridW) / 2, sy = Math.max(topMargin, (boxTop - gridH) / 2 - 4);
        this.buttons = opts.map((o, k) => {
          const c = k % cols, r = (k / cols) | 0;
          return { x: sx + c * (cardW + gap), y: sy + r * (cardH + gap), w: cardW, h: cardH, opt: o };
        });
      } else {
        const bw = Math.min(560, w - 80), bh = 50;
        const totalH = opts.length * bh + (opts.length - 1) * gap;
        let y = Math.max(topMargin, this.boxY() - totalH - 16);
        this.buttons = opts.map(o => { const b = { x: (w - bw) / 2, y, w: bw, h: bh, opt: o }; y += bh + gap; return b; });
      }
    },

    pick(btn) {
      // route mods to per-night (persist) or per-dream (mods) bucket
      const dest = this.beat.choice.persist ? this.persist : this.mods;
      Object.assign(dest, btn.opt.mods || {});
      NAP.progress.choices[this.char.id] = Object.assign(
        NAP.progress.choices[this.char.id] || {}, btn.opt.mods || {});
      // show the reply as the beat's new line, then continue normally
      this.full = btn.opt.reply || "...";
      this.shown = 0;
      this.state = "typing";
      this.choiceResolved = true;
      this.buttons = [];
    },

    next() {
      if (this.i < this.script.length - 1) {
        this.i++; this.loadBeat();
      } else {
        // end of this story segment -> hand choice mods to the chapter runner
        NAP.chapterAfterStory(this.mods, this.persist);
      }
    },

    // input
    onKey(k) { if (k === " " || k === "enter") this.advance(); },
    onDown(x, y) {
      if (this.state === "choosing") {
        for (const b of this.buttons)
          if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { this.pick(b); return; }
        return;
      }
      this.advance();
    },

    update(dt) {
      if (this.state === "typing") {
        this.shown += dt * 45;           // chars/sec
        if (this.shown >= this.full.length) { this.shown = this.full.length; this.afterType(); }
      }
    },

    boxY() { return NAP.view.h - 172; },

    draw(ctx) {
      const w = NAP.view.w, h = NAP.view.h, t = U.now();
      NAP.backgrounds.paint(this.beat.bg, ctx, w, h, t);

      // speaker sprite standing on the dialogue box
      const spr = this.speakerSprite();
      const boxY = this.boxY();
      if (spr) {
        const im = NAP.img(spr.file);
        if (im) {
          // portrait rises from behind the dialogue box, head near the top
          const bottomY = boxY + 44;                 // tucked a bit behind the box
          const targetH = Math.min(spr.h, bottomY - 8);
          const s = targetH / spr.h, dw = spr.w * s, dh = targetH;
          const cx = w * 0.20;
          const bob = Math.sin(t * 1.6) * 3;
          ctx.drawImage(im, cx - dw / 2, bottomY - dh + bob, dw, dh);
        }
      }

      // dialogue box
      const bx = 36, bw = w - 72, bh = 150;
      ctx.fillStyle = "rgba(24,14,42,0.86)"; D.rr(bx, boxY, bw, bh, 18); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.12)"; ctx.lineWidth = 2;
      D.rr(bx, boxY, bw, bh, 18); ctx.stroke();

      // name plate
      const b = this.beat;
      if (b.speaker) {
        ctx.font = "bold 18px 'Trebuchet MS',sans-serif";
        const nw = ctx.measureText(b.speaker).width + 34;
        const npx = bx + 26, npy = boxY - 20;
        const accent = b.side === "shadow" ? "#b98be0" : this.char.accent;
        ctx.fillStyle = "rgba(24,14,42,0.95)"; D.rr(npx, npy, nw, 32, 10); ctx.fill();
        ctx.strokeStyle = accent; ctx.lineWidth = 2; D.rr(npx, npy, nw, 32, 10); ctx.stroke();
        ctx.fillStyle = accent; ctx.textAlign = "center";
        ctx.fillText(b.speaker, npx + nw / 2, npy + 22); ctx.textAlign = "left";
      }

      // text (typewriter, wrapped)
      ctx.font = (b.speaker ? "" : "italic ") + "20px 'Trebuchet MS',sans-serif";
      ctx.fillStyle = b.speaker ? "#f3ecff" : "#d7c9f0";
      const shown = this.full.slice(0, Math.floor(this.shown));
      const lines = D.wrap(shown, bw - 60);
      let ty = boxY + 44;
      for (const ln of lines) { ctx.fillText(ln, bx + 30, ty); ty += 28; }

      // choice buttons
      if (this.state === "choosing") {
        if (!this._btnW || this._btnW !== w) { this.buildButtons(); this._btnW = w; }  // keep layout matched to viewport
        ctx.textAlign = "center";
        const mx = NAP.input.mouse.x, my = NAP.input.mouse.y;
        for (const btn of this.buttons) {
          const hot = mx >= btn.x && mx <= btn.x + btn.w && my >= btn.y && my <= btn.y + btn.h;
          ctx.fillStyle = hot ? "rgba(123,216,143,0.30)" : "rgba(40,26,64,0.92)";
          D.rr(btn.x, btn.y, btn.w, btn.h, 12); ctx.fill();
          ctx.strokeStyle = hot ? this.char.accent : "rgba(255,255,255,0.18)";
          ctx.lineWidth = 2; D.rr(btn.x, btn.y, btn.w, btn.h, 12); ctx.stroke();
          if (btn.opt.icon && this.gridChoice) {
            // icon card: food image on top, label below
            const fm = NAP.META.misc.foods[btn.opt.icon], im = NAP.img(fm.file);
            const labelH = 22, pad = 8;
            const availH = btn.h - labelH - pad, availW = btn.w - pad * 2;
            if (im) {
              const s = Math.min(availW / fm.w, availH / fm.h);
              const iw = fm.w * s, ih = fm.h * s;
              ctx.drawImage(im, btn.x + (btn.w - iw) / 2, btn.y + pad + (availH - ih) / 2, iw, ih);
            }
            ctx.fillStyle = "#fff"; ctx.font = "bold 15px 'Trebuchet MS',sans-serif";
            ctx.fillText(btn.opt.label, btn.x + btn.w / 2, btn.y + btn.h - 8);
          } else {
            ctx.fillStyle = "#fff"; ctx.font = "17px 'Trebuchet MS',sans-serif";
            ctx.fillText(btn.opt.label, btn.x + btn.w / 2, btn.y + btn.h / 2 + 6);
          }
        }
        ctx.textAlign = "left";
      } else if (this.state === "done") {
        // blinking advance arrow
        ctx.globalAlpha = 0.4 + 0.4 * Math.sin(t * 5);
        ctx.fillStyle = "#d9c8ff"; ctx.textAlign = "right";
        ctx.font = "16px 'Trebuchet MS',sans-serif";
        ctx.fillText("click / space  ▸", bx + bw - 24, boxY + bh - 18);
        ctx.textAlign = "left"; ctx.globalAlpha = 1;
      }
    },
  };
})(window.NAP);
