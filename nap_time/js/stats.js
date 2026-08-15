/* =============================================================
   Nap Time — unified stat pipeline.

   One place that computes a character's effective PERMANENT stats by
   stacking sources: base -> per-character base -> level growth
   -> skill nodes (later) -> gear (later). Runtime/temporary effects
   (food buffs, Oni Form, etc.) are applied on top at play time in dream.js.

   Everything that makes a character stronger should push numbers HERE,
   so gear slots in later without a rewrite.
   ============================================================= */
(function (NAP) {
  "use strict";

  // Full stat schema + neutral defaults (shared base for everyone).
  const BASE = {
    maxHp: 100,
    damage: 22,
    moveSpeed: 190,
    atkSpeed: 1.0,      // attack-rate multiplier (higher = faster swings)
    crit: 0.05,         // crit chance 0..1
    critMult: 2.0,      // crit damage multiplier
    cdr: 0.0,           // cooldown reduction 0..~0.6 (for the signature active)
    buffDur: 1.0,       // food-buff duration multiplier
    dmgResist: 0.0,     // flat incoming-damage reduction 0..~0.75
    xpFind: 1.0,        // xp gain multiplier
  };

  // Per-character identity via base-stat overrides.
  const CHAR_BASE = {
    egg:       { /* balanced -> uses BASE */ },
    neogaucha: { maxHp: 85, damage: 27, moveSpeed: 200 },  // glass-cannon oni
    lua:       { maxHp: 95, moveSpeed: 205, xpFind: 1.15 }, // nimble, dream-lucky star girl
  };

  // Small automatic growth per level (skill points add the rest on top).
  const PER_LEVEL = { maxHp: 6, damage: 1.2 };

  NAP.STAT_KEYS = Object.keys(BASE);
  NAP.STAT_BASE = BASE;

  // Effective permanent stats for a character (base + char + level [+ skills/gear later]).
  NAP.computeStats = function (charId) {
    const rec = NAP.charProgress(charId);
    const s = Object.assign({}, BASE, CHAR_BASE[charId] || {});
    const lv = rec.level - 1;
    s.maxHp += PER_LEVEL.maxHp * lv;
    s.damage += PER_LEVEL.damage * lv;
    // fold in purchased skill-node ranks
    const tree = NAP.SKILLS && NAP.SKILLS[charId];
    if (tree) for (const node of tree) {
      const rank = rec.nodes[node.id] || 0;
      if (rank > 0 && node.per) for (const k in node.per) s[k] = (s[k] || 0) + node.per[k] * rank;
    }
    // TODO(gear): fold in equipped-item affixes here
    // round the display-y ones
    s.maxHp = Math.round(s.maxHp);
    s.damage = Math.round(s.damage * 10) / 10;
    return s;
  };
})(window.NAP);
