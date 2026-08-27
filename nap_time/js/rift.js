/* =============================================================
   Nap Time — Deep Sleep (endless rift runner).

   A run = a chosen character descending through randomized dreams.
   Each depth rolls a random theme + nightmare + scaling difficulty.
   Clear enemies to fill the descent meter -> a Rift Guardian spawns ->
   kill it to clear the depth -> Descend (harder) or Wake (bank).

   The dream engine is already config-driven, so a rift depth is just a
   randomized dream config with objective "rift".
   ============================================================= */
(function (NAP) {
  "use strict";
  const THEMES = ["cloud", "rooftop", "library", "pond", "meadow", "ship"];
  const FOES = ["shadow_egg", "oni", "siren", "nightmarebeek", "ims"];
  const pick = a => a[(Math.random() * a.length) | 0];

  NAP.rift = null;
  NAP.riftDifficulty = d => 0.9 + d * 0.12;

  NAP.riftConfig = function () {
    const r = NAP.rift, d = r.depth;
    const theme = pick(THEMES), foe = pick(FOES);
    return {
      charId: r.charId, playerChar: r.charId, enemyFoe: foe,
      theme, bg: theme === "rooftop" ? "bg_rooftop" : theme === "library" ? "bg_library" : theme === "pond" ? "bg_pond" : theme === "meadow" ? "bg_meadow" : theme === "ship" ? "bg_ship" : null,
      objective: "rift", difficulty: NAP.riftDifficulty(d), depth: d,
      boss: false, bossName: "RIFT GUARDIAN" + (foe === "oni" ? " · ONI" : ""),
      cols: 20, rows: 15, title: "Deep Sleep · Depth " + d,
      objDef: { label: "Descend", banner: "Depth " + d + " — sink deeper." },
    };
  };

  NAP.startRift = function (charId) {
    NAP.chapter = null;
    NAP.rift = { charId, depth: 1 };
    NAP.go(NAP.scenes.dream, { config: NAP.riftConfig() }, { type: "sleep", outDur: 1.0, inDur: 0.9 });
  };
  NAP.riftDescend = function () {
    if (!NAP.rift) return;
    NAP.rift.depth++;
    NAP.go(NAP.scenes.dream, { config: NAP.riftConfig() }, { type: "sleep", outDur: 0.9, inDur: 0.9 });
  };
  NAP.riftEnd = function (reachedDepth) {
    if (NAP.rift) {
      const rec = NAP.charProgress(NAP.rift.charId);
      rec.bestDepth = Math.max(rec.bestDepth || 0, reachedDepth || 0);
      NAP.save();
    }
    NAP.rift = null;
    NAP.go(NAP.scenes.deepsleep, {}, { type: "wake", outDur: 0.9, inDur: 0.6 });
  };
})(window.NAP);
