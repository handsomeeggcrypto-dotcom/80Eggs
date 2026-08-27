/* Nap Time — cute elemental "vibes" for basic attacks.
   Each dreamer has an innate vibe (data.js `element`) that can be swapped on
   their character page. A vibe recolors the basic attack and adds one small
   on-hit effect: chain / burn / slow / nudge. */
(function (NAP) {
  "use strict";

  NAP.ELEMENTS = {
    excited: { id: "excited", name: "Excited!", emoji: "⚡", effect: "chain",
      color: "#ff5bd0", spark: "#ffd0f4",
      desc: "pink lightning that leaps to a nearby dream" },
    cozy: { id: "cozy", name: "Cozy", emoji: "🔥", effect: "burn",
      color: "#ff9a4d", spark: "#ffe0a8",
      desc: "warm marshmallow flames that linger a bit" },
    sleepy: { id: "sleepy", name: "Sleepy", emoji: "💧", effect: "slow",
      color: "#5bc8ff", spark: "#d6f4ff",
      desc: "bubbly water that soaks & slows them down" },
    giggly: { id: "giggly", name: "Giggly", emoji: "🍃", effect: "nudge",
      color: "#7be88f", spark: "#e0ffe6",
      desc: "minty gusts that push dreams back" },
    zappy: { id: "zappy", name: "Zappy", emoji: "🔌", effect: "chain",
      color: "#4dff9e", spark: "#d0ffe6",
      desc: "green taser-lightning that leaps to a nearby dream" },
  };
  NAP.ELEMENT_ORDER = ["excited", "cozy", "sleepy", "giggly", "zappy"];

  // the vibe a character is currently using (chosen, else innate default)
  NAP.charElement = function (charId) {
    const r = NAP.progress && NAP.progress.chars && NAP.progress.chars[charId];
    const chosen = r && r.element;
    if (NAP.ELEMENTS[chosen]) return chosen;
    return ((NAP.DATA.characters[charId] || {}).element) || "sleepy";
  };
  NAP.elementOf = function (charId) { return NAP.ELEMENTS[NAP.charElement(charId)]; };

  // swap + persist
  NAP.setElement = function (charId, key) {
    if (!NAP.ELEMENTS[key]) return;
    const r = NAP.charProgress(charId);
    r.element = key; NAP.save();
  };
})(window.NAP);
