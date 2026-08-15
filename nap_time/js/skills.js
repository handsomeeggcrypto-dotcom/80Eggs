/* =============================================================
   Nap Time — skill trees.

   Small per-character tree: 3 branches (Body / Edge / Spark), each with
   rankable passive nodes (the point sink), plus a per-character capstone
   milestone that empowers the signature active. Purchased ranks live in
   progress.chars[id].nodes and are folded into the stat pipeline
   (see computeStats in stats.js).
   ============================================================= */
(function (NAP) {
  "use strict";

  const STAT_LABEL = {
    maxHp: "Max HP", damage: "Damage", moveSpeed: "Move Spd", atkSpeed: "Atk Spd",
    crit: "Crit", critMult: "Crit Dmg", cdr: "Cooldown Red", buffDur: "Buff Time",
    dmgResist: "Resist", xpFind: "XP Find",
  };
  const PCT = { crit: 1, dmgResist: 1, cdr: 1, buffDur: 1, xpFind: 1 };

  // shared passive nodes (same stats for everyone; flavored capstone differs)
  function passives() {
    return [
      { id: "hp",   branch: "body",  tier: 1, name: "Extwa Fwuff", max: 8, per: { maxHp: 12 },      reqLevel: 1 },
      { id: "res",  branch: "body",  tier: 2, name: "Snug Blankie",max: 5, per: { dmgResist: 0.03 }, reqLevel: 4, req: "hp" },
      { id: "dmg",  branch: "edge",  tier: 1, name: "Angy Boop",   max: 8, per: { damage: 2 },       reqLevel: 1 },
      { id: "crit", branch: "edge",  tier: 2, name: "Sparkle Boop",max: 8, per: { crit: 0.02 },      reqLevel: 4, req: "dmg" },
      { id: "spd",  branch: "spark", tier: 1, name: "Zoomies",     max: 6, per: { moveSpeed: 6 },    reqLevel: 1 },
      { id: "cdr",  branch: "spark", tier: 2, name: "Power Nap",   max: 5, per: { cdr: 0.06 },       reqLevel: 4, req: "spd" },
    ];
  }

  NAP.SKILLS = {
    egg: passives().concat([
      { id: "capstone", branch: "spark", tier: 3, name: "Sweetest Dweams", max: 1, reqLevel: 8, req: "cdr",
        per: { buffDur: 0.5, maxHp: 20 }, flag: "empower",
        desc: "Makes Sweet Dweams bigger — wider snuggle, longer sleepies." },
    ]),
    neogaucha: passives().concat([
      { id: "capstone", branch: "edge", tier: 3, name: "Rawr Mode", max: 1, reqLevel: 8, req: "crit",
        per: { damage: 8, moveSpeed: 10 }, flag: "empower",
        desc: "Oni Mode lasts longer and slurps HP when you boop (wah!)." },
    ]),
    lua: passives().concat([
      { id: "capstone", branch: "spark", tier: 3, name: "Wish Upon a Staw", max: 1, reqLevel: 8, req: "cdr",
        per: { xpFind: 0.25, maxHp: 15 }, flag: "empower",
        desc: "Dreams shine brighter — extra XP and a little more pep." },
    ]),
  };

  NAP.skillTree = charId => NAP.SKILLS[charId] || [];
  NAP.nodeById = (charId, id) => NAP.skillTree(charId).find(n => n.id === id);
  NAP.nodeRank = (charId, id) => (NAP.charProgress(charId).nodes[id] || 0);
  NAP.hasFlag = (charId, flag) => NAP.skillTree(charId).some(n => n.flag === flag && NAP.nodeRank(charId, n.id) > 0);

  NAP.skillDesc = function (node) {
    if (node.desc) return node.desc;
    const parts = [];
    for (const k in (node.per || {})) {
      const v = node.per[k];
      parts.push("+" + (PCT[k] ? Math.round(v * 100) + "%" : v) + " " + (STAT_LABEL[k] || k));
    }
    return parts.join(", ");
  };

  NAP.canBuy = function (charId, node) {
    const rec = NAP.charProgress(charId), rank = rec.nodes[node.id] || 0;
    if (rank >= node.max) return { ok: false, why: "MAX" };
    if (node.reqLevel && rec.level < node.reqLevel) return { ok: false, why: "Lv " + node.reqLevel };
    if (node.req && !(rec.nodes[node.req] > 0)) return { ok: false, why: "locked" };
    if (rec.points < 1) return { ok: false, why: "no points" };
    return { ok: true };
  };
  NAP.buySkill = function (charId, id) {
    const node = NAP.nodeById(charId, id); if (!node) return false;
    if (!NAP.canBuy(charId, node).ok) return false;
    const rec = NAP.charProgress(charId);
    rec.nodes[id] = (rec.nodes[id] || 0) + 1; rec.points -= 1; NAP.save();
    return true;
  };
})(window.NAP);
