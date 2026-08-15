/* Nap Time — Skill Tree screen (spend points into the per-character tree). */
(function (NAP) {
  "use strict";
  const U = NAP.util, D = NAP.draw;
  const BRANCHES = ["body", "edge", "spark"];
  const BRANCH_LABEL = { body: "COZY", edge: "SPICY", spark: "DREAMY" };
  const BRANCH_COLOR = { body: "#8dffb0", edge: "#ff8b8b", spark: "#8bc8ff" };
  const READOUT = [["maxHp", "HP"], ["damage", "DMG"], ["crit", "Crit"], ["dmgResist", "Res"], ["cdr", "CDR"], ["moveSpeed", "Spd"]];

  NAP.scenes.skills = {
    enter(params) {
      this.char = params.charId || "egg";
      this.back = params.back || "select";
      this.t = 0; this.flash = 0;
      this.layout();
    },
    onResize() { this.layout(); },

    layout() {
      const w = NAP.view.w, h = NAP.view.h;
      // three branch columns
      const colW = Math.min(228, (w - 100) / 3 - 16), cgap = 16;
      const totalW = 3 * colW + 2 * cgap, sx = (w - totalW) / 2, top = h * 0.26;
      const nh = 74, vgap = 14;
      this.colTop = top; this.nh = nh;
      this.cols = BRANCHES.map((b, i) => ({ branch: b, x: sx + i * (colW + cgap), w: colW }));
      this.nodeRects = [];
      for (const col of this.cols) {
        const nodes = NAP.skillTree(this.char).filter(n => n.branch === col.branch).sort((a, b) => a.tier - b.tier);
        for (const node of nodes) {
          this.nodeRects.push({ node, x: col.x, y: top + (node.tier - 1) * (nh + vgap), w: col.w, h: nh });
        }
      }
      this.backRect = { x: w / 2 - 90, y: h - 56, w: 180, h: 40 };
    },

    onKey(k) { if (k === "escape") this.goBack(); },
    goBack() {
      const dest = this.back === "title" ? NAP.scenes.title
        : this.back === "characters" ? NAP.scenes.characters : NAP.scenes.select;
      NAP.go(dest, {}, { type: "fade" });
    },
    onDown(x, y) {
      if (hit(this.backRect, x, y)) { this.goBack(); return; }
      for (const nr of this.nodeRects) if (hit(nr, x, y)) {
        if (NAP.buySkill(this.char, nr.node.id)) { this.flash = 0.4; } return;
      }
    },
    update(dt) { this.t += dt; if (this.flash > 0) this.flash -= dt; },

    draw(ctx) {
      const w = NAP.view.w, h = NAP.view.h, t = this.t;
      NAP.backgrounds.dream_void(ctx, w, h, t);
      const rec = NAP.charProgress(this.char), ch = NAP.DATA.characters[this.char];
      ctx.textAlign = "center";

      // title + points
      ctx.fillStyle = "#e9dcff"; ctx.font = "bold 30px 'Trebuchet MS',sans-serif";
      ctx.fillText((ch ? ch.name : this.char) + " — Skill Tree", w / 2, h * 0.075);
      ctx.font = "bold 16px 'Trebuchet MS',sans-serif";
      ctx.fillStyle = rec.points > 0 ? "#ffe08a" : "rgba(255,255,255,0.55)";
      ctx.fillText("Lv " + rec.level + "   ·   " + rec.points + " skill point" + (rec.points === 1 ? "" : "s"), w / 2, h * 0.075 + 24);

      const mx = NAP.input.mouse.x, my = NAP.input.mouse.y;

      // branch headers
      for (const col of this.cols) {
        ctx.fillStyle = BRANCH_COLOR[col.branch]; ctx.font = "bold 15px 'Trebuchet MS',sans-serif";
        ctx.fillText(BRANCH_LABEL[col.branch], col.x + col.w / 2, this.colTop - 10);
      }

      // nodes
      for (const nr of this.nodeRects) {
        const node = nr.node, rank = rec.nodes[node.id] || 0, can = NAP.canBuy(this.char, node);
        const maxed = rank >= node.max, locked = !can.ok && can.why === "locked";
        const affordable = can.ok, hot = hit(nr, mx, my) && affordable;
        // box
        ctx.globalAlpha = locked ? 0.5 : 1;
        ctx.fillStyle = hot ? "rgba(123,216,143,0.28)" : maxed ? "rgba(120,90,40,0.5)" : "rgba(34,22,54,0.92)";
        D.rr(nr.x, nr.y, nr.w, nr.h, 12); ctx.fill();
        ctx.strokeStyle = maxed ? "#ffd36b" : affordable ? BRANCH_COLOR[node.branch] : "rgba(255,255,255,0.16)";
        ctx.lineWidth = 2; D.rr(nr.x, nr.y, nr.w, nr.h, 12); ctx.stroke();
        // name + rank
        ctx.fillStyle = "#fff"; ctx.font = "bold 15px 'Trebuchet MS',sans-serif"; ctx.textAlign = "left";
        ctx.fillText(node.name, nr.x + 12, nr.y + 22);
        ctx.textAlign = "right"; ctx.fillStyle = maxed ? "#ffd36b" : "rgba(255,255,255,0.8)";
        ctx.font = "bold 13px 'Trebuchet MS',sans-serif";
        ctx.fillText(rank + " / " + node.max, nr.x + nr.w - 12, nr.y + 22);
        // effect / status
        ctx.textAlign = "left"; ctx.font = "12px 'Trebuchet MS',sans-serif"; ctx.fillStyle = "rgba(233,220,255,0.85)";
        const lines = D.wrap(NAP.skillDesc(node), nr.w - 24).slice(0, 2);
        let ly = nr.y + 40; for (const ln of lines) { ctx.fillText(ln, nr.x + 12, ly); ly += 15; }
        // footer status
        ctx.textAlign = "right"; ctx.font = "bold 12px 'Trebuchet MS',sans-serif";
        if (maxed) { ctx.fillStyle = "#ffd36b"; ctx.fillText("MAX", nr.x + nr.w - 12, nr.y + nr.h - 10); }
        else if (locked) { const rq = NAP.nodeById(this.char, node.req); ctx.fillStyle = "#ff9a9a"; ctx.fillText("needs " + (rq ? rq.name : node.req), nr.x + nr.w - 12, nr.y + nr.h - 10); }
        else if (!can.ok && can.why.startsWith("Lv")) { ctx.fillStyle = "#ff9a9a"; ctx.fillText(can.why, nr.x + nr.w - 12, nr.y + nr.h - 10); }
        else if (!can.ok) { ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.fillText("need point", nr.x + nr.w - 12, nr.y + nr.h - 10); }
        else { ctx.fillStyle = BRANCH_COLOR[node.branch]; ctx.fillText("click: +1", nr.x + nr.w - 12, nr.y + nr.h - 10); }
        ctx.globalAlpha = 1;
      }
      ctx.textAlign = "center";

      // live stats readout
      const s = NAP.computeStats(this.char);
      const parts = READOUT.map(([k, lbl]) => {
        const v = s[k]; const pct = (k === "crit" || k === "dmgResist" || k === "cdr");
        return lbl + " " + (pct ? Math.round(v * 100) + "%" : Math.round(v * 10) / 10);
      });
      ctx.fillStyle = "rgba(255,255,255,0.75)"; ctx.font = "13px 'Trebuchet MS',sans-serif";
      ctx.fillText(parts.join("    "), w / 2, h - 74);

      // back button
      const bhot = hit(this.backRect, mx, my);
      ctx.fillStyle = bhot ? "rgba(123,216,143,0.28)" : "rgba(38,24,60,0.92)";
      D.rr(this.backRect.x, this.backRect.y, this.backRect.w, this.backRect.h, 12); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.2)"; ctx.lineWidth = 2;
      D.rr(this.backRect.x, this.backRect.y, this.backRect.w, this.backRect.h, 12); ctx.stroke();
      ctx.fillStyle = "#fff"; ctx.font = "16px 'Trebuchet MS',sans-serif";
      ctx.fillText("← Back", this.backRect.x + this.backRect.w / 2, this.backRect.y + 26);
      ctx.textAlign = "left";
    },
  };

  function hit(r, x, y) { return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; }
})(window.NAP);
