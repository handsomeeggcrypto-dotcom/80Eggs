/* Nap Time — title screen */
(function (NAP) {
  "use strict";
  const U = NAP.util, D = NAP.draw;

  NAP.scenes.title = {
    enter() { this.t = 0; },
    onKey(k) { if (k === " " || k === "enter") this.toSelect(); },
    onDown() { this.toSelect(); },
    toSelect() { NAP.go(NAP.scenes.select, {}, { type: "fade" }); },
    update(dt) { this.t += dt; },
    draw(ctx) {
      const w = NAP.view.w, h = NAP.view.h, t = this.t;
      NAP.backgrounds.dream_void(ctx, w, h, t);

      // floating Kumori + shadow flanking the title
      const km = NAP.META.misc.vn_egg, sh = NAP.META.misc.vn_shadow;
      const drawFloat = (spr, cx, dir) => {
        const im = NAP.img(spr.file); if (!im) return;
        const H = h * 0.5, s = H / spr.h, dw = spr.w * s;
        const by = h * 0.60 + Math.sin(t * 1.3 + dir) * 10;
        ctx.globalAlpha = 0.92;
        ctx.drawImage(im, cx - dw / 2, by - H, dw, H);
        ctx.globalAlpha = 1;
      };
      drawFloat(sh, w * 0.80, 1.6);
      drawFloat(km, w * 0.20, 0);

      // title
      ctx.textAlign = "center";
      ctx.save();
      ctx.translate(w / 2, h * 0.34 + Math.sin(t * 1.5) * 4);
      ctx.font = "bold 76px 'Trebuchet MS',sans-serif";
      ctx.fillStyle = "#1a1030"; ctx.fillText("Nap Time", 3, 4);
      const g = ctx.createLinearGradient(0, -40, 0, 40);
      g.addColorStop(0, "#c8f7d4"); g.addColorStop(0.5, "#a8e6cf"); g.addColorStop(1, "#f7b7d6");
      ctx.fillStyle = g; ctx.fillText("Nap Time", 0, 0);
      ctx.restore();

      ctx.fillStyle = "#e9dcff"; ctx.font = "italic 20px 'Trebuchet MS',sans-serif";
      ctx.fillText("every dream has a shadow", w / 2, h * 0.34 + 46);

      ctx.globalAlpha = 0.5 + 0.4 * Math.sin(t * 4);
      ctx.fillStyle = "#fff"; ctx.font = "18px 'Trebuchet MS',sans-serif";
      ctx.fillText("click  or  press space  to choose a dream", w / 2, h * 0.86);
      ctx.globalAlpha = 1;

      if (NAP.progress.cleared.length) {
        ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.font = "13px sans-serif";
        ctx.fillText("nights cleared: " + NAP.progress.cleared.length, w / 2, h * 0.93);
      }
      ctx.textAlign = "left";
    },
  };
})(window.NAP);
