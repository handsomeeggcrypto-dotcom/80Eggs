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
    name: "Grand Finale", types: [0, 1, 2, 3, 4], goal: "rescue", shots: 45, drop: 11,
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
];
