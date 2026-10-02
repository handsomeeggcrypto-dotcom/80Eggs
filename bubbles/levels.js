// Bubble Pop — level map levels. Edit freely; the game reads this list as-is.
//
// Each level:
//   name    shown on the level intro banner
//   types   which characters appear (indexes into TYPES in game.js):
//             0 cat donut · 1 luna donut · 2 poki · 3 poki donut · 4 poki wash · 5 rabbit donut
//   goal    "clear"  – pop/drop every character bubble (stones can stay)
//           "rescue" – drop every trapped friend (@) by cutting it loose; friends can't be matched
//           "score"  – reach `target` points
//   shots   shot limit. Stars: 3 if you finish with 40%+ shots left, 2 if 20%+, else 1
//   drop    optional: the ceiling drops a row every this many shots
//   layout  one string per row, top row first. Rows alternate 10 and 9 cells; odd rows are
//           written with a leading space so the text looks like the honeycomb.
//             .  empty          *  random character from `types`
//             1-6  that slot of `types` (1 = first)
//             #  stone – can't be matched, only falls when cut loose
//             @  trapped friend – drop it to rescue it
//           Anything a typo leaves floating is removed when the level loads.

const LEVELS = [
  {
    name: "First Pop", types: [0, 3, 2], goal: "clear", shots: 20,
    layout: [
      "1 1 2 2 3 3 1 1 2 2",
      " 1 2 2 3 3 1 1 2 2",
      "3 3 1 1 2 2 3 3 1 1",
      " 3 1 1 2 2 3 3 1 1",
    ],
  },
  {
    name: "Sweetheart", types: [1, 0, 2], goal: "clear", shots: 30,
    layout: [
      ". * * * . . * * * .",
      " * * * * * * * * *",
      "* * * * * * * * * *",
      " * * * * * * * * *",
      ". * * * * * * * * .",
      " . * * * * * * * .",
      ". . . * * * * . . .",
      " . . . * * * . . .",
      ". . . . * * . . . .",
    ],
  },
  {
    name: "Stripes", types: [0, 3, 2], goal: "clear", shots: 22,
    layout: [
      "1 1 1 1 1 1 1 1 1 1",
      " 2 2 2 2 2 2 2 2 2",
      "3 3 3 3 3 3 3 3 3 3",
      " 1 1 1 1 1 1 1 1 1",
      "2 2 2 2 2 2 2 2 2 2",
    ],
  },
  {
    name: "Rescue Party", types: [0, 3, 2], goal: "rescue", shots: 14,
    layout: [
      "* * * * * * * * * *",
      " * * * * * * * * *",
      "* * * * * * * * * *",
      " . * . . * . . * .",
      ". @ . . @ . . @ . .",
    ],
  },
  {
    name: "Pyramid", types: [0, 3, 2], goal: "clear", shots: 38,
    layout: [
      "* * * * * * * * * *",
      " * * * * * * * * *",
      ". * * * * * * * * .",
      " . * * * * * * * .",
      ". . * * * * * * . .",
      " . . * * * * * . .",
      ". . . * * * * . . .",
      " . . . * * * . . .",
      ". . . . * * . . . .",
    ],
  },
  {
    name: "Stone Wall", types: [0, 3, 2], goal: "clear", shots: 34,
    layout: [
      "* * * * * * * * * *",
      " * * * * * * * * *",
      "# # * * # # * * # #",
      " * * * * * * * * *",
      "* * * * * * * * * *",
    ],
  },
  {
    name: "Smiley", types: [2, 0, 3, 5], goal: "clear", shots: 36,
    layout: [
      ". . * * * * * * . .",
      " . * * * * * * * .",
      ". * * # * * # * * .",
      " * * * * * * * * *",
      "* 2 * * * * * * 2 *",
      " * 2 2 2 2 2 2 2 *",
      ". * * * * * * * * .",
      " . . * * * * * . .",
    ],
  },
  {
    name: "Score Attack", types: [0, 1, 2, 3], goal: "score", target: 700, shots: 20, drop: 6,
    layout: [
      "* * * * * * * * * *",
      " * * * * * * * * *",
      "* * * * * * * * * *",
      " * * * * * * * * *",
      "* * * * * * * * * *",
      " * * * * * * * * *",
    ],
  },
  {
    name: "Hide and Seek", types: [3, 1, 0, 2, 4], goal: "rescue", shots: 26,
    layout: [
      "* * * * * * * * * *",
      " * * * * * * * * *",
      "* * * * * * * * * *",
      " * * * * * * * * *",
      ". * * . * * . * * .",
      " . @ . . @ . . @ .",
    ],
  },
  {
    name: "Diagonals", types: [5, 2, 4], goal: "clear", shots: 30,
    layout: [
      "1 2 3 1 2 3 1 2 3 1",
      " 2 3 1 2 3 1 2 3 1",
      "2 3 1 2 3 1 2 3 1 2",
      " 3 1 2 3 1 2 3 1 2",
      "3 1 2 3 1 2 3 1 2 3",
      " 1 2 3 1 2 3 1 2 3",
    ],
  },
  {
    name: "Swiss Cheese", types: [0, 1, 2, 3], goal: "clear", shots: 44, drop: 12,
    layout: [
      "* * * * * * * * * *",
      " * . * * . * * . *",
      "* * * . * * . * * *",
      " . * * * * . * * .",
      "* * . * * * * . * *",
    ],
  },
  {
    name: "Caged", types: [0, 3, 2, 4], goal: "rescue", shots: 30,
    layout: [
      "* * * * * * * * * *",
      " * * * * * * * * *",
      "* * * * * * * * * *",
      " . * . . . . * . .",
      ". # @ # . . # @ # .",
      " . # # . . . # # .",
    ],
  },
  {
    name: "Chandelier", types: [0, 1, 2, 3, 4], goal: "clear", shots: 28,
    layout: [
      ". . . * * * * . . .",
      " . . . * * * . . .",
      ". . . * * * * . . .",
      " . . . * * * . . .",
      ". . . * * * * . . .",
      " . . . * * * . . .",
      ". . . * * * * . . .",
      " . . . * * * . . .",
      ". . . . * * . . . .",
    ],
  },
  {
    name: "Rainbow", types: [0, 1, 2, 3, 4], goal: "clear", shots: 44, drop: 12,
    layout: [
      "1 1 1 1 1 1 1 1 1 1",
      " 2 2 2 2 2 2 2 2 2",
      "3 3 3 3 3 3 3 3 3 3",
      " 4 4 4 4 4 4 4 4 4",
      "5 5 5 5 5 5 5 5 5 5",
    ],
  },
  {
    name: "Great Escape", types: [0, 1, 2, 3, 4], goal: "rescue", shots: 45, drop: 11,
    layout: [
      "* * * * * * * * * *",
      " * * * * * * * * *",
      "* * # * * * * # * *",
      " * * * * * * * * *",
      "* * * # * * # * * *",
      " * @ * * * * * @ *",
      ". . . . @ @ . . . .",
    ],
  },
  // ---- levels 16–30 ----
  {
    name: "Pillars", types: [0, 3, 2, 4], goal: "clear", shots: 28,
    layout: [
      ". * * . * * . * * .",
      " * * . * * . * * .",
      ". * * . * * . * * .",
      " * * . * * . * * .",
      ". * * . * * . * * .",
      " * * . * * . * * .",
      ". * * . * * . * * .",
    ],
  },
  {
    name: "Diamond", types: [2, 0, 3, 4], goal: "clear", shots: 26,
    layout: [
      ". . . . * * . . . .",
      " . . . * * * . . .",
      ". . . * * * * . . .",
      " . . * * * * * . .",
      ". . * * * * * * . .",
      " . . * * * * * . .",
      ". . . * * * * . . .",
      " . . . * * * . . .",
      ". . . . * * . . . .",
    ],
  },
  {
    name: "Stone Garden", types: [0, 3, 2], goal: "clear", shots: 40,
    layout: [
      "* * * * * * * * * *",
      " * * * * * * * * *",
      "* * * * # # * * * *",
      " * * * * * * * * *",
      "* * # * * * * # * *",
      " * * * * * * * * *",
    ],
  },
  {
    name: "Lanterns", types: [3, 1, 0, 2], goal: "rescue", shots: 16,
    layout: [
      ". * * . * * . * * .",
      " * * . * * . * * .",
      ". * * . * * . * * .",
      " * * . * * . * * .",
      ". * * . * * . * * .",
      " . @ . . @ . . @ .",
    ],
  },
  {
    name: "Score Frenzy", types: [0, 3, 2, 4], goal: "score", target: 1000, shots: 22, drop: 5,
    layout: [
      "* * * * * * * * * *",
      " * * * * * * * * *",
      "* * * * * * * * * *",
      " * * * * * * * * *",
      "* * * * * * * * * *",
      " * * * * * * * * *",
      "* * * * * * * * * *",
    ],
  },
  {
    name: "Hourglass", types: [0, 3, 2, 5], goal: "clear", shots: 40,
    layout: [
      "* * * * * * * * * *",
      " * * * * * * * * *",
      ". * * * * * * * * .",
      " . . * * * * * . .",
      ". . . . * * . . . .",
      " . . . * * * . . .",
      ". . * * * * * * . .",
      " . * * * * * * * .",
    ],
  },
  {
    name: "Double Trouble", types: [0, 3, 2, 4, 1], goal: "rescue", shots: 32, drop: 12,
    layout: [
      "* * * * * * * * * *",
      " * * * * * * * * *",
      "* * * * * * * * * *",
      " * * * * * * * * *",
      ". * . . . . . * . .",
      " # @ # . . # @ # .",
      ". # # . . . . # # .",
    ],
  },
  {
    name: "Checkerboard", types: [0, 3, 2, 4], goal: "clear", shots: 44,
    layout: [
      "* * * * * * * * * *",
      " # * # * # * # * #",
      "* * * * * * * * * *",
      " * # * # * # * # *",
      "* * * * * * * * * *",
    ],
  },
  {
    name: "Waves", types: [0, 3, 2, 4, 5], goal: "clear", shots: 50, drop: 12,
    layout: [
      "1 1 2 2 3 3 4 4 5 5",
      " 1 2 2 3 3 4 4 5 5",
      "2 2 3 3 4 4 5 5 1 1",
      " 2 3 3 4 4 5 5 1 1",
      "3 3 4 4 5 5 1 1 2 2",
      " 3 4 4 5 5 1 1 2 2",
    ],
  },
  {
    name: "Crown Jewels", types: [2, 0, 3, 4, 1], goal: "rescue", shots: 26,
    layout: [
      "* * * * * * * * * *",
      " * * * * * * * * *",
      "* * * * * * * * * *",
      " * . * * . * * . *",
      "@ . . @ . . @ . . @",
    ],
  },
  {
    name: "Arrowhead", types: [0, 1, 2, 3, 4], goal: "clear", shots: 34,
    layout: [
      ". . . * * * * . . .",
      " . . . * * * . . .",
      "* * * * * * * * * *",
      " . * * * * * * * .",
      ". . * * * * * * . .",
      " . . * * * * * . .",
      ". . . * * * * . . .",
      " . . . * * * . . .",
      ". . . . * * . . . .",
    ],
  },
  {
    name: "Big Score", types: [0, 1, 2, 3, 4], goal: "score", target: 900, shots: 26, drop: 6,
    layout: [
      "* * * * * * * * * *",
      " * * * * * * * * *",
      "* * * * * * * * * *",
      " * * * * * * * * *",
      "* * * * * * * * * *",
      " * * * * * * * * *",
    ],
  },
  {
    name: "Fortress", types: [0, 3, 2, 4], goal: "clear", shots: 44,
    layout: [
      "* * * * * * * * * *",
      " * * * * * * * * *",
      "* # * * * * * * # *",
      " * # * * * * * # *",
      "* * * * * * * * * *",
    ],
  },
  {
    name: "Jailbreak", types: [0, 1, 2, 3, 4], goal: "rescue", shots: 40, drop: 11,
    layout: [
      "* * * * * * * * * *",
      " * * * * * * * * *",
      "* * * * * * * * * *",
      " * * @ * * * @ * *",
      "* * * * * * * * * *",
      " * @ * * @ * * @ *",
    ],
  },
  {
    name: "Heart of Stone", types: [0, 1, 2, 3, 4], goal: "rescue", shots: 40, drop: 10,
    layout: [
      ". * * * . . * * * .",
      " * * * * * * * * *",
      "* * # * * * * # * *",
      " * * * * * * * * *",
      ". * * * # # * * * .",
      " . * * * * * * * .",
      ". . . * @ @ * . . .",
      " . . . * * * . . .",
      ". . . . @ @ . . . .",
    ],
  },
  // ---- levels 31–45 ----
  {
    name: "Twin Towers", types: [0, 3, 2, 4, 1], goal: "clear", shots: 34,
    layout: [
      ". * * * . . * * * .",
      " * * * . . * * * .",
      ". * * * . . * * * .",
      " * * * . . * * * .",
      ". * * * . . * * * .",
      " * * * . . * * * .",
      ". * * * . . * * * .",
    ],
  },
  {
    name: "Staircase", types: [0, 3, 2, 4], goal: "clear", shots: 46,
    layout: [
      "* * * * * * * * * *",
      " * * * * * * * * .",
      "* * * * * * * * . .",
      " * * * * * * * . .",
      "* * * * * * . . . .",
      " * * * * * . . . .",
      "* * * * . . . . . .",
      " * * * . . . . . .",
    ],
  },
  {
    name: "Bubble Bath", types: [4, 0, 3, 2], goal: "rescue", shots: 18,
    layout: [
      "* * * * * * * * * *",
      " * * * * * * * * *",
      "* * * * * * * * * *",
      " * . . * . . * . .",
      "* * . . * . . * . .",
      " @ . . @ . . @ . .",
    ],
  },
  {
    name: "Stone Rain", types: [0, 3, 2, 4], goal: "clear", shots: 48,
    layout: [
      "* * * * * * * * * *",
      " * * * * * * * * *",
      "* * * * * * * * * *",
      " * * * * * * * * *",
      "* * * * * * * * * *",
      " # * * # * * # * #",
    ],
  },
  {
    name: "Heart of Gold", types: [1, 0, 2, 3], goal: "score", target: 1100, shots: 26, drop: 7,
    layout: [
      ". * * * . . * * * .",
      " * * * * * * * * *",
      "* * * * * * * * * *",
      " * * * * * * * * *",
      ". * * * * * * * * .",
      " . * * * * * * * .",
      ". . . * * * * . . .",
      " . . . * * * . . .",
      ". . . . * * . . . .",
    ],
  },
  {
    name: "Honeycomb", types: [0, 3, 2, 4, 5], goal: "clear", shots: 52,
    layout: [
      "* * * * * * * * * *",
      " * . * * . * * . *",
      "* * * * * * * * * *",
      " . * * . * * . * *",
      "* * * * * * * * * *",
      " * * . * * . * * .",
    ],
  },
  {
    name: "Rescue Squad", types: [0, 1, 2, 3, 4], goal: "rescue", shots: 30,
    layout: [
      "* * * * * * * * * *",
      " * * * * * * * * *",
      "* * * * * * * * * *",
      " * * * * * * * * *",
      ". * . * . * . * . .",
      " @ . @ . @ . @ . .",
    ],
  },
  {
    name: "Plus Sign", types: [0, 1, 2, 3, 4], goal: "clear", shots: 34,
    layout: [
      ". . . * * * * . . .",
      " . . . * * * . . .",
      ". . . * * * * . . .",
      " * * * * * * * * *",
      "* * * * * * * * * *",
      " * * * * * * * * *",
      ". . . * * * * . . .",
      " . . . * * * . . .",
      ". . . * * * * . . .",
    ],
  },
  {
    name: "Fastball", types: [0, 3, 2, 4], goal: "score", target: 1000, shots: 24, drop: 4,
    layout: [
      "* * * * * * * * * *",
      " * * * * * * * * *",
      "* * * * * * * * * *",
      " * * * * * * * * *",
      "* * * * * * * * * *",
      " * * * * * * * * *",
    ],
  },
  {
    name: "Stone Maze", types: [0, 3, 2, 4], goal: "clear", shots: 54,
    layout: [
      "* * * * * * * * * *",
      " * * * * * * * * *",
      "* * * * * * * * * *",
      " * # * * # * * # *",
      "* * # * * # * * # *",
      " * * * * * * * * *",
    ],
  },
  {
    name: "Candy Cane", types: [1, 2, 4], goal: "clear", shots: 36, drop: 11,
    layout: [
      "1 1 2 2 1 1 2 2 1 1",
      " 1 2 2 1 1 2 2 1 1",
      "2 2 1 1 2 2 1 1 2 2",
      " 2 1 1 2 2 1 1 2 2",
      "1 1 2 2 1 1 2 2 1 1",
      " 1 2 2 1 1 2 2 1 1",
      "3 3 3 3 3 3 3 3 3 3",
    ],
  },
  {
    name: "Friend Chain", types: [0, 3, 2, 4, 1], goal: "rescue", shots: 14,
    layout: [
      "* * * * * * * * * *",
      " * * * * * * * * *",
      "* * * * * * * * * *",
      " . . . * * . . . .",
      ". . . . @ . . . . .",
      " . . . * * . . . .",
      ". . . . @ . . . . .",
      " . . . * * . . . .",
      ". . . . @ . . . . .",
    ],
  },
  {
    name: "Mega Board", types: [0, 1, 2, 3, 4], goal: "clear", shots: 62,
    layout: [
      "* * * * * * * * * *",
      " * * * * * * * * *",
      "* * * * * * * * * *",
      " * * * * * * * * *",
      "* * * * * * * * * *",
      " * * * * * * * * *",
      "* * * * * * * * * *",
    ],
  },
  {
    name: "Hanging Gardens", types: [0, 3, 2, 4, 1], goal: "rescue", shots: 20,
    layout: [
      ". * * . * * . * * .",
      " * * . * * . * * .",
      ". * * . * * . * * .",
      " * * . * * . * * .",
      ". * * . * * . * * .",
      " # * . # * . # * .",
      ". @ . . @ . . @ . .",
    ],
  },
  {
    name: "Big Rescue", types: [0, 1, 2, 3, 4], goal: "rescue", shots: 50, drop: 9,
    layout: [
      "* * * * * * * * * *",
      " * * * * * * * * *",
      "* # * * * * * * # *",
      " * * * @ * @ * * *",
      "* * * * * * * * * *",
      " * @ * * * * * @ *",
      ". . . * @ @ * . . .",
    ],
  },
  // ---- levels 46–60 ----
  {
    name: "Koi Pond", types: [0, 3, 2], goal: "clear", shots: 52,
    layout: [
      "* * * * * * * * * *",
      " * * . . . . . * *",
      "* * . . . . . . * *",
      " * * . . . . . * *",
      "* * * * * * * * * *",
    ],
  },
  {
    name: "Bamboo Grove", types: [0, 3, 2, 4, 1], goal: "clear", shots: 22,
    layout: [
      "* . * . * . * . * .",
      " * . * . * . * . *",
      "* . * . * . * . * .",
      " * . * . * . * . *",
      "* . * . * . * . * .",
      " * . * . * . * . *",
      "* . * . * . * . * .",
      " * . * . * . * . *",
    ],
  },
  {
    name: "Lantern Festival", types: [0, 3, 2, 4], goal: "rescue", shots: 10,
    layout: [
      ". * . . * . . * . .",
      " . * . . * . . * .",
      ". * . . * . . * . .",
      " . * . . * . . * .",
      ". * . . * . . * . .",
      " . * . . * . . * .",
      ". @ . . @ . . @ . .",
    ],
  },
  {
    name: "Rock Garden", types: [0, 3, 2, 4], goal: "clear", shots: 46,
    layout: [
      "* * * * * * * * * *",
      " * * * * * * * * *",
      "* * * * * * * * * *",
      " * * * * * * * * *",
      "* * * # * * # * * *",
      " * # * * * * * # *",
    ],
  },
  {
    name: "Blossom Score", types: [0, 3, 2, 4], goal: "score", target: 1200, shots: 26, drop: 6,
    layout: [
      "* * * * * * * * * *",
      " * * * * * * * * *",
      "* * * * * * * * * *",
      " * * * * * * * * *",
      "* * * * * * * * * *",
      " * * * * * * * * *",
    ],
  },
  {
    name: "Torii Gate", types: [0, 1, 2, 3, 4], goal: "clear", shots: 40,
    layout: [
      "* * * * * * * * * *",
      " * * * * * * * * *",
      ". * . . . . . . * .",
      " * * * * * * * * *",
      ". * . . . . . . * .",
      " * . . . . . . * .",
      ". * . . . . . . * .",
    ],
  },
  {
    name: "Mount Fuji", types: [4, 0, 3, 2], goal: "clear", shots: 18,
    layout: [
      ". . . . * * . . . .",
      " . . . * * * . . .",
      ". . . * * * * . . .",
      " . . * * * * * . .",
      ". . * * * * * * . .",
      " . * * * * * * * .",
      ". * * * * * * * * .",
      " * * * * * * * * *",
    ],
  },
  {
    name: "Sakura Rescue", types: [0, 1, 2, 3, 4], goal: "rescue", shots: 18,
    layout: [
      "* * * * * * * * * *",
      " * * * * * * * * *",
      "* * * * * * * * * *",
      " . * * . . . * * .",
      ". . @ . . . . @ . .",
      " . * * . . . * * .",
      ". . @ . . . . @ . .",
    ],
  },
  {
    name: "Stepping Stones", types: [0, 3, 2, 4], goal: "clear", shots: 52,
    layout: [
      "* * * * * * * * * *",
      " * * * * * * * * *",
      "* * * # * * # * * *",
      " * * * * * * * * *",
      "* # * * * * * * # *",
      " * * * * * * * * *",
    ],
  },
  {
    name: "Moon Gate", types: [0, 3, 2, 4, 1], goal: "clear", shots: 34,
    layout: [
      ". . * * * * * * . .",
      " . * * . . . * * .",
      ". * * . . . . * * .",
      " * * . . . . . * *",
      ". * * . . . . * * .",
      " . * * . . . * * .",
      ". . * * * * * * . .",
    ],
  },
  {
    name: "Festival Score", types: [0, 1, 2, 3, 4], goal: "score", target: 1000, shots: 28, drop: 5,
    layout: [
      "* * * * * * * * * *",
      " * * * * * * * * *",
      "* * * * * * * * * *",
      " * * * * * * * * *",
      "* * * * * * * * * *",
      " * * * * * * * * *",
    ],
  },
  {
    name: "Waterfall", types: [0, 3, 2, 4, 5], goal: "clear", shots: 52, drop: 12,
    layout: [
      "1 1 2 2 3 3 4 4 5 5",
      " 1 2 2 3 3 4 4 5 5",
      "1 1 2 2 3 3 4 4 5 5",
      " 1 2 2 3 3 4 4 5 5",
      "1 1 2 2 3 3 4 4 5 5",
      " 1 2 2 3 3 4 4 5 5",
    ],
  },
  {
    name: "Shrine Guardians", types: [0, 3, 2, 4], goal: "rescue", shots: 22,
    layout: [
      "* * * * * * * * * *",
      " * * * * * * * * *",
      "* * * * * * * * * *",
      " . * . . * . . * .",
      "# @ # . # @ . # @ #",
    ],
  },
  {
    name: "Garden Maze", types: [0, 3, 2, 4], goal: "clear", shots: 52,
    layout: [
      "* * * * * * * * * *",
      " * * * * * * * * *",
      "* * * * * * * * * *",
      " * # * * * * * # *",
      "* * * # * * # * * *",
      " * * # * * * # * *",
    ],
  },
  {
    name: "Grand Finale", types: [0, 1, 2, 3, 4], goal: "rescue", shots: 55, drop: 10,
    layout: [
      "* * * * * * * * * *",
      " * * * * * * * * *",
      "* # * * * * * * # *",
      " * * @ * * * @ * *",
      "* * * * # # * * * *",
      " * @ * * * * * @ *",
      ". . * * @ @ * * . .",
      " . . * * * * * . .",
    ],
  },
];

// Worlds: each covers a run of levels and gives them a background (built from
// ~/Desktop/bubbles/level_bg_NN into assets/bg/). A world starts at level `from`
// and lasts until the next world starts. Classic and Rush pick one at random.
// `map` is the world's stretch of the level map, bottom image first (built from
// ~/Desktop/bubbles/map_bg_NN into assets/map/); the images fade into each other.
const WORLDS = [
  { name: "Nature Trail",    bg: "level_bg_01", from: 1,  map: ["map_bg_01", "map_bg_02"] },
  { name: "Donut Shop",      bg: "level_bg_02", from: 16, map: ["map_bg_03", "map_bg_04"] },
  { name: "Strawberry Farm", bg: "level_bg_03", from: 31, map: ["map_bg_05", "map_bg_06"] },
  { name: "Japanese Garden", bg: "level_bg_04", from: 46, map: ["map_bg_07", "map_bg_08"] },
];
