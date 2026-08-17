/* =============================================================
   Nap Time — content data (characters, chapters, dreams).

   A character's night is a CHAPTER: an ordered list of segments.
     { type:"story", beats:[...] }              -> visual-novel
     { type:"dream", dream:{...}, title:"..." }  -> playable ARPG

   A story beat:
     { bg, speaker, side:'egg'|'shadow'|null, mood, text, choice? }
   A choice:
     { prompt, options:[{ label, reply, mods:{...} }] }
   Choice mods merge into the NEXT dream's config (choices shape the dream).

   NOTE: this script is a FIRST PASS meant to be rewritten beat-by-beat.
   ============================================================= */
(function (NAP) {
  "use strict";
  const M = NAP.META;

  NAP.OBJECTIVES = {
    defeat:  { label: "Defeat the Nightmare", banner: "Face your Nightmare." },
    survive: { label: "Survive the waves", banner: "Three waves. Don't let up." },
    collect: { label: "Gather the dream", banner: "Collect the scattered pieces." },
    escort:  { label: "Guide your Cloud Buddy", banner: "Keep your Cloud Buddy safe." },
  };

  const egg = {
    id: "egg",
    name: "Egg",
    title: "Dreamwalker",
    accent: "#7bd88f",
    vn: M.misc.vn_egg,
    nightmareVN: M.misc.vn_shadow,
    tutorial: true,
    buddy: "cloud",
    active: { id: "sweetdreams", name: "Sweet Dweams", cooldown: 12 },

    // shown on the LOSE card only (chapter wins flow straight into the next scene)
    lose: { title: "You Woke With a Gasp", text: "The dream spat you out, heart pounding. Steady... and back down we go." },

    chapter: {
      segments: [

        // ---- SEG 0: opening story + choice (shapes Dream 1) ----
        { type: "story", beats: [
          { bg: "bedroom_night", side: null, speaker: "",
            text: "Night one. The cloud meadows are fast asleep — and so is everyone in them. Everyone but Egg." },
          { bg: "bedroom_night", side: "egg", speaker: "Egg", mood: "sleepy",
            text: "Nnn... I'm so sleepy. But every time I shut my eyes lately, I end up... there." },
          { bg: "bedroom_night", side: "egg", speaker: "Egg", mood: "sad",
            text: "A grey place. And something in it that wears my face — only wrong. Colder." },
          { bg: "bedroom_night", side: "egg", speaker: "Egg", mood: "neutral",
            text: "Cloud Buddy says I should just face it. Easy for a pillow to say." },
          { bg: "bedroom_night", side: "egg", speaker: "Egg", mood: "neutral",
            text: "...But first — I can't sleep on an empty tummy. One little bedtime snack.",
            choice: { prompt: "What does Egg pack as her dream snack?", persist: true, options: [
              { label: "Bogir", icon: "borgir", reply: "Bogir! A big warm burger. Nothing scary gets past a full belly.",
                mods: { food: "borgir" } },
              { label: "Apol", icon: "apol", reply: "Apol — crisp and green. Keeps me light on my feet.",
                mods: { food: "apol" } },
              { label: "Tenddie", icon: "tendie", reply: "Tenddie! Crunchy courage on a stick.",
                mods: { food: "tendie" } },
              { label: "Pizza", icon: "pizza", reply: "Pizza... but it's more fun to share. Cloud Buddy, want a slice?",
                mods: { food: "pizza" } },
            ] } },
          { bg: "galaxy", side: "egg", speaker: "Egg", mood: "sleepy",
            text: "...Okay. Here I go. Goodnight, real world." },
        ] },

        // ---- SEG 1: Dream 1 — collect ----
        { type: "dream", title: "Dream 1", dream: {
          theme: "cloud", cols: 18, rows: 13, objective: "collect", spawnEnemies: 2, boss: false,
        } },

        // ---- SEG 2: wake up + choice (shapes Dream 2) ----
        { type: "story", beats: [
          { bg: "bedroom_night", side: null, speaker: "",
            text: "Egg's eyes flutter open. Moonlight. Her own ceiling. Safe." },
          { bg: "bedroom_night", side: "egg", speaker: "Egg", mood: "surprised",
            text: "I— I did it? I actually held a piece of it together?" },
          { bg: "bedroom_night", side: "egg", speaker: "Egg", mood: "happy",
            text: "Okay. Okay! Maybe I can do this. But it isn't finished — I can feel it pulling me back down." },
          { bg: "bedroom_night", side: "egg", speaker: "Egg", mood: "neutral",
            text: "This next part comes in waves, I can feel it. How deep should I let myself go?",
            choice: { prompt: "How deep does Egg sleep?", options: [
              { label: "Light nap", reply: "Just a toe in the water. Easy does it.",
                mods: { difficulty: 0.8 } },
              { label: "Nap nap", reply: "A proper nap. Let's see what it's got.",
                mods: { difficulty: 1.0 } },
              { label: "Deep sleep", reply: "All the way down. Give me your worst.",
                mods: { difficulty: 1.5 } },
            ] } },
          { bg: "galaxy", side: "egg", speaker: "Egg", mood: "sleepy",
            text: "Back under. Deep breath..." },
        ] },

        // ---- SEG 3: Dream 2 — survive ----
        { type: "dream", title: "Dream 2", dream: {
          theme: "cloud", cols: 20, rows: 15, objective: "survive", spawnEnemies: 3, boss: false, waves: 3,
        } },

        // ---- SEG 4: wake up + a line + choice (shapes the final dream) ----
        { type: "story", beats: [
          { bg: "bedroom_night", side: null, speaker: "",
            text: "She wakes with a gasp, blanket twisted around her like armor." },
          { bg: "bedroom_night", side: "egg", speaker: "Egg", mood: "surprised",
            text: "It's getting stronger. That was almost too much." },
          { bg: "bedroom_night", side: "egg", speaker: "Egg", mood: "neutral",
            text: "But so am I. One more. The real one. The shadow that started all of this — I can feel it waiting." },
          { bg: "bedroom_night", side: "egg", speaker: "Egg", mood: "neutral",
            text: "This is it. How do I face myself?",
            choice: { prompt: "How does Egg meet her Nightmare?", options: [
              { label: "With kindness", reply: "It's still me in there. Maybe it just needs someone to stop running.",
                mods: { companion: true, extraPotion: true, mood: "kind" } },
              { label: "With everything I've got", reply: "I'm done being afraid of my own dreams.",
                mods: { difficulty: 1.3, mood: "fierce" } },
            ] } },
          { bg: "galaxy", side: "egg", speaker: "Egg", mood: "sleepy",
            text: "One last time. Take me down." },
        ] },

        // ---- SEG 5: Dream 3 — defeat the Nightmare (boss) ----
        { type: "dream", title: "Final Dream", dream: {
          theme: "cloud", cols: 20, rows: 15, objective: "defeat", spawnEnemies: 2, boss: true,
        } },

        // ---- SEG 6: victory + end ----
        { type: "story", end: true, beats: [
          { bg: "dream_void", side: null, speaker: "",
            text: "The grey place cracks like an eggshell. Warm light pours through." },
          { bg: "dream_void", side: "shadow", speaker: "???", mood: "sad",
            text: "( ...you're not going to run this time? )" },
          { bg: "dream_void", side: "egg", speaker: "Egg", mood: "happy",
            text: "No. You're not a monster. You're just the part of me that got scared and stayed scared." },
          { bg: "bedroom_night", side: "egg", speaker: "Egg", mood: "excited",
            text: "You can rest now. We both can." },
          { bg: "bedroom_night", side: null, speaker: "",
            text: "Egg wakes to a soft pink dawn. For the first time in weeks, she isn't tired at all." },
          { bg: "bedroom_night", side: "egg", speaker: "Egg", mood: "happy",
            text: "Good morning, world. I think... I think I finally slept." },
          { bg: "bedroom_night", side: null, speaker: "",
            text: "—  End of Night One  —" },
        ] },
      ],
    },
  };

  // ---- Neogaucha (playable character #2) --------------------------------
  // Her night (story chapter) isn't written yet — for now she has a single
  // standalone "Rooftop Dream" level, launched from the Dream Select.
  const neogaucha = {
    id: "neogaucha",
    name: "Neogaucha",
    title: "Rebel Oni",
    accent: "#ff5b6e",
    vn: M.misc.vn_neogaucha,
    nightmareVN: M.misc.vn_oni,
    tutorial: false,
    buddy: "teddy",
    active: { id: "oniform", name: "Oni Mode", cooldown: 14, dur: 6 },
    lose: { title: "You Woke With a Gasp", text: "The rooftop dream shoved you out. The Oni's still up there, waiting." },
    win: { title: "Nightmare Silenced", text: "The Oni dissolved into static and smoke. The rooftop is quiet — just the city and the stars." },
    // reusable standalone level (Deep Sleep uses this too)
    rooftop: {
      playerChar: "neogaucha", enemyFoe: "oni", theme: "rooftop", bg: "bg_rooftop",
      bossName: "NIGHTMARE ONI", cols: 20, rows: 15, objective: "defeat",
      spawnEnemies: 2, boss: true, title: "Rooftop Dream",
    },

    // ---- Neogaucha's night (placeholder script; L1 food, L2 discovers Oni Mode, L3 boss) ----
    chapter: {
      segments: [
        // SEG 0: rooftop story + food choice, Oni Mode still locked
        { type: "story", beats: [
          { bg: "rooftop", side: null, speaker: "",
            text: "The rooftop studio, past 3am. The city hums. Neogaucha still can't sleep." },
          { bg: "rooftop", side: "neo", speaker: "Neogaucha", mood: "annoyed",
            text: "Every time I crash up here I wake up somewhere GROSS. All static and teeth. Wah." },
          { bg: "rooftop", side: "neo", speaker: "Neogaucha", mood: "neutral",
            text: "...Can't fight a bad dream hungry, though. Gotta grab a snack first. Priorities." },
          { bg: "rooftop", side: "neo", speaker: "Neogaucha", mood: "neutral",
            text: "What's tonight's rooftop snack?",
            choice: { prompt: "What does Neogaucha snack on?", persist: true, options: [
              { label: "Bogir", icon: "borgir", reply: "Bogir. Obviously. Punk fuel.", mods: { food: "borgir" } },
              { label: "Apol", icon: "apol", reply: "Apol. Keeps me fast and mean.", mods: { food: "apol" } },
              { label: "Tenddie", icon: "tendie", reply: "Tenddie! Crunchy little goblins.", mods: { food: "tendie" } },
              { label: "Pizza", icon: "pizza", reply: "Pizza. Cold pizza is a lifestyle.", mods: { food: "pizza" } },
            ] } },
          { bg: "galaxy", side: "neo", speaker: "Neogaucha", mood: "sleepy",
            text: "...Fine. Lights out. Let's get this over with, wah." },
        ] },
        // SEG 1: Dream 1 — defeat, active LOCKED (she hasn't found her power yet)
        { type: "dream", title: "Rooftop · Dream 1", dream: {
          enemyFoe: "oni", theme: "rooftop", bg: "bg_rooftop", cols: 20, rows: 15,
          objective: "defeat", spawnEnemies: 3, boss: false, lockActive: true,
        } },
        // SEG 2: wake up — the spark of her power
        { type: "story", beats: [
          { bg: "rooftop", side: null, speaker: "",
            text: "She wakes slumped against the water tower, knuckles aching." },
          { bg: "rooftop", side: "neo", speaker: "Neogaucha", mood: "surprised",
            text: "Okay?! There were way too many of those things. I need an edge. A real one." },
          { bg: "rooftop", side: "neo", speaker: "Neogaucha", mood: "excited",
            text: "...Wait. Down there, when I got MAD — something in me went RAWR. Horns. Claws. It felt GOOD." },
          { bg: "rooftop", side: "neo", speaker: "Neogaucha", mood: "smug",
            text: "Next time I feel it, I'm letting it out. Hold SHIFT and become the nightmare. Heh." },
          { bg: "galaxy", side: "neo", speaker: "Neogaucha", mood: "sleepy",
            text: "Back down. Come on, come on..." },
        ] },
        // SEG 3: Dream 2 — survive, active UNLOCKED (Oni Mode discovered)
        { type: "dream", title: "Rooftop · Dream 2", dream: {
          enemyFoe: "oni", theme: "rooftop", bg: "bg_rooftop", cols: 20, rows: 15,
          objective: "survive", spawnEnemies: 3, waves: 3, boss: false,
        } },
        // SEG 4: wake up — steel for the real one
        { type: "story", beats: [
          { bg: "rooftop", side: null, speaker: "",
            text: "Dawn's a rumor on the skyline. She's grinning now, and it's a little scary." },
          { bg: "rooftop", side: "neo", speaker: "Neogaucha", mood: "smug",
            text: "Oh, THAT'S the good stuff. Okay. No more warmups." },
          { bg: "rooftop", side: "neo", speaker: "Neogaucha", mood: "neutral",
            text: "The big one's still up there. The shadow wearing my face. Time to headline this nightmare." },
          { bg: "galaxy", side: "neo", speaker: "Neogaucha", mood: "sleepy",
            text: "One more dive. Let's GO." },
        ] },
        // SEG 5: Dream 3 — boss (mirror match)
        { type: "dream", title: "Final · Nightmare Oni", dream: {
          enemyFoe: "oni", theme: "rooftop", bg: "bg_rooftop", cols: 20, rows: 15,
          objective: "defeat", spawnEnemies: 2, boss: true, bossName: "NIGHTMARE ONI",
        } },
        // SEG 6: victory + end
        { type: "story", end: true, beats: [
          { bg: "rooftop", side: "shadow", speaker: "???", mood: "sad",
            text: "( you can't get rid of me. i'm the angry part. i'm ALWAYS here. )" },
          { bg: "rooftop", side: "neo", speaker: "Neogaucha", mood: "happy",
            text: "Yeah, I know. You're not a bug — you're a feature. Just... let me drive sometimes, okay?" },
          { bg: "rooftop", side: null, speaker: "",
            text: "The shadow grins back, and folds into her like a shrug. The rooftop goes quiet." },
          { bg: "rooftop", side: "neo", speaker: "Neogaucha", mood: "excited",
            text: "Best. Nap. Ever. Encore tomorrow. Wah!" },
          { bg: "rooftop", side: null, speaker: "",
            text: "—  End of Neogaucha's Night  —" },
        ] },
      ],
    },
  };

  // ---- Lua (playable character #3) --------------------------------------
  // Her nightmare (a siren) isn't drawn yet, so no dedicated night/boss.
  // Playable now via Deep Sleep in her Cloud Library theme. Signature TBD.
  const lua = {
    id: "lua",
    name: "Lua",
    title: "Star Dreamling",
    accent: "#ffd35e",
    vn: M.misc.vn_lua,
    nightmareVN: M.misc.vn_siren,
    tutorial: false,
    buddy: "glorp",
    // Summons Leech, a little axe guy who seeks & attacks enemies.
    active: { id: "summon", name: "Leech", cooldown: 14, dur: 8 },
    lose: { title: "You Woke With a Gasp", text: "The siren's song faded, and the dream spat you out. The library waits." },
    win: { title: "Sweet Dream", text: "The siren's song broke into quiet. The clouds hush; the books settle." },
    // standalone Cloud Library level vs the Nightmare-Lua siren
    library: {
      playerChar: "lua", enemyFoe: "siren", theme: "library", bg: "bg_library",
      bossName: "NIGHTMARE LUA", cols: 20, rows: 15, objective: "defeat",
      spawnEnemies: 2, boss: true, title: "Cloud Library",
    },

    // ---- Lua's night (placeholder script) ----
    chapter: {
      segments: [
        // SEG 0: library story + food choice
        { type: "story", beats: [
          { bg: "library", side: null, speaker: "",
            text: "High in the cloud library, the lamps dim for the night. Lua tucks the last book back onto its shelf." },
          { bg: "library", side: "lua", speaker: "Lua", mood: "daydreaming",
            text: "The stories always get restless right before sleep... like they don't want the day to end. I know the feeling." },
          { bg: "library", side: "lua", speaker: "Lua", mood: "worried",
            text: "...But lately something's been getting in. A corner of the library gone all wrong. Grey. Whispery." },
          { bg: "library", side: "lua", speaker: "Lua", mood: "neutral",
            text: "If I'm tidying it up in my dreams, I should bring a snack. Reading fuel.",
            choice: { prompt: "What does Lua nibble on?", persist: true, options: [
              { label: "Bogir", icon: "borgir", reply: "A warm Bogir. Cozy reading food.", mods: { food: "borgir" } },
              { label: "Apol", icon: "apol", reply: "An Apol. Crunchy and bright, like a good ending.", mods: { food: "apol" } },
              { label: "Tenddie", icon: "tendie", reply: "Tenddies! One for every chapter.", mods: { food: "tendie" } },
              { label: "Pizza", icon: "pizza", reply: "Pizza. Read a page, take a bite. Perfect.", mods: { food: "pizza" } },
            ] } },
          { bg: "galaxy", side: "lua", speaker: "Lua", mood: "sleepy",
            text: "Okay. Deep breath. Into the pages I go..." },
        ] },
        // SEG 1: Dream 1 — collect the scattered pages
        { type: "dream", title: "Library · Dream 1", dream: {
          enemyFoe: "siren", theme: "library", bg: "bg_library", cols: 20, rows: 15,
          objective: "collect", spawnEnemies: 2, boss: false,
        } },
        // SEG 2: wake up — the grey is spreading
        { type: "story", beats: [
          { bg: "library", side: null, speaker: "",
            text: "Lua blinks awake in her reading nook, a page still faintly glowing in her hand." },
          { bg: "library", side: "lua", speaker: "Lua", mood: "surprised",
            text: "Oh! I found some of the lost pages. They were so frightened, poor things." },
          { bg: "library", side: "lua", speaker: "Lua", mood: "worried",
            text: "But the grey is still spreading. It isn't just messy — it's hungry. I have to go back." },
          { bg: "galaxy", side: "lua", speaker: "Lua", mood: "sleepy",
            text: "Back into the story..." },
        ] },
        // SEG 3: Dream 2 — survive the corruption's waves
        { type: "dream", title: "Library · Dream 2", dream: {
          enemyFoe: "siren", theme: "library", bg: "bg_library", cols: 20, rows: 15,
          objective: "survive", spawnEnemies: 3, waves: 3, boss: false,
        } },
        // SEG 4: wake up + a line + into the boss
        { type: "story", beats: [
          { bg: "library", side: null, speaker: "",
            text: "She wakes with a start, hugging her little glorp plush a bit too tight." },
          { bg: "library", side: "lua", speaker: "Lua", mood: "worried",
            text: "It's her, isn't it. The one who sings. She wears my face, but... starving. So sad." },
          { bg: "library", side: "lua", speaker: "Lua", mood: "neutral",
            text: "I don't want to fight her. But I can't let her swallow the whole library. One more dream." },
          { bg: "galaxy", side: "lua", speaker: "Lua", mood: "sleepy",
            text: "Wait for me. I'm coming." },
        ] },
        // SEG 5: Dream 3 — the siren, Nightmare Lua
        { type: "dream", title: "Final · Nightmare Lua", dream: {
          enemyFoe: "siren", theme: "library", bg: "bg_library", cols: 20, rows: 15,
          objective: "defeat", spawnEnemies: 2, boss: true, bossName: "NIGHTMARE LUA",
        } },
        // SEG 6: victory + end
        { type: "story", end: true, beats: [
          { bg: "library", side: "shadow", speaker: "???", mood: "sad",
            text: "( ...you'd really share your stories with me? even after all this? )" },
          { bg: "library", side: "lua", speaker: "Lua", mood: "happy",
            text: "Of course. There's always room for one more reader. Come sit." },
          { bg: "library", side: null, speaker: "",
            text: "The grey unwinds into soft starlight. The library breathes out, whole again." },
          { bg: "library", side: "lua", speaker: "Lua", mood: "happy",
            text: "Sweet dreams, everyone. See you in the next chapter." },
          { bg: "library", side: null, speaker: "",
            text: "—  End of Lua's Night  —" },
        ] },
      ],
    },
  };

  // ---- Beek (playable character #4) --------------------------------------
  const beek = {
    id: "beek",
    name: "Beek",
    title: "Pond Keeper",
    accent: "#8fd3ff",
    vn: M.misc.vn_beek,
    nightmareVN: M.misc.vn_nightmarebeek,
    tutorial: false,
    buddy: "orca",
    active: null,                // signature move TBD
    lose: { title: "You Woke With a Gasp", text: "The pond rippled and the dream slipped under. The meadow waits, still and green." },
    win: { title: "Sweet Dream", text: "The demon bunny hopped off into the reeds, harmless again. The pond goes quiet." },
    // standalone Pond Meadow level vs the demon-bunny nightmare
    pond: {
      playerChar: "beek", enemyFoe: "nightmarebeek", theme: "pond", bg: "bg_pond",
      bossName: "NIGHTMARE BEEK", cols: 20, rows: 15, objective: "defeat",
      spawnEnemies: 2, boss: true, title: "Pond Meadow",
    },
  };

  const napling = {
    id: "nap",
    name: "Napling",
    title: "Dream-Weaver of Yumemono",
    accent: "#ffc0d8",
    vn: M.misc.vn_nap,
    nightmareVN: M.misc.vn_nap,   // Napling has no nightmare of her own (placeholder)
    tutorial: false,
    buddy: "leech",
    active: { id: "summonchar", name: "Yumemono!", cooldown: 16, dur: 9 },
    lose: { title: "The Dream Faded", text: "The blossoms drifted down and the meadow dimmed. Napling blinked awake, still sleepy." },
    win: { title: "Sweet Dream", text: "The last bad dream popped like a soap bubble. The meadow glowed warm and pink again." },
    // standalone Sunny Meadow level. She has no nightmare, so foes are random bad-dreams.
    meadow: {
      playerChar: "nap", enemyFoe: "shadow_egg", theme: "meadow", bg: "bg_meadow",
      bossName: "BAD DREAM", cols: 20, rows: 15, objective: "defeat",
      spawnEnemies: 4, boss: false, title: "Sunny Meadow",
    },
  };

  NAP.DATA = { characters: { egg, neogaucha, lua, beek, nap: napling }, order: ["egg", "neogaucha", "lua", "beek", "nap"] };

  // Merge a dream's base config with persistent (whole-night) + pending (next
  // dream only) choice modifiers.
  NAP.buildDreamConfig = function (charId, base, persist, pending) {
    const cfg = Object.assign({ charId }, base, persist || {}, pending || {});
    cfg.objDef = NAP.OBJECTIVES[cfg.objective];
    return cfg;
  };

  // Launch a standalone (non-chapter) dream, e.g. Neogaucha's rooftop level.
  NAP.playDream = function (charId, base) {
    NAP.chapter = null;
    const cfg = NAP.buildDreamConfig(charId, base);
    NAP.go(NAP.scenes.dream, { config: cfg }, { type: "sleep", outDur: 1.0, inDur: 0.9 });
  };
})(window.NAP);
