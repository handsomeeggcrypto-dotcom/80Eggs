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
    element: "excited",   // pink lightning
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
    element: "cozy",      // marshmallow fire
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
    element: "giggly",    // breezy sparkle
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
    element: "sleepy",     // water (matches Sploosh!)
    active: { id: "puddlesplash", name: "Sploosh!", cooldown: 11 },  // jump + 360° water splash
    lose: { title: "You Woke With a Gasp", text: "The pond rippled and the dream slipped under. The meadow waits, still and green." },
    win: { title: "Sweet Dream", text: "The demon bunny hopped off into the reeds, harmless again. The pond goes quiet." },
    // standalone Pond Meadow level vs the demon-bunny nightmare
    pond: {
      playerChar: "beek", enemyFoe: "nightmarebeek", theme: "pond", bg: "bg_pond",
      bossName: "NIGHTMARE BEEK", cols: 20, rows: 15, objective: "defeat",
      spawnEnemies: 2, boss: true, title: "Pond Meadow",
    },

    // Beek's night at the pond (placeholder story — ready for the Yumemono writer).
    chapter: {
      segments: [

        // ---- SEG 0: opening + snack choice (persists all night) ----
        { type: "story", beats: [
          { bg: "pond", side: null, speaker: "",
            text: "The pond meadow lies still under a low blue moon. Beek sits at the water's edge, feet dangling, refusing to look at his own reflection." },
          { bg: "pond", side: "egg", speaker: "Beek", mood: "sleepy",
            text: "Wah... every night the pond shows me something. A me that isn't me. Long ears. Sharp little grin." },
          { bg: "pond", side: "egg", speaker: "Beek", mood: "sad",
            text: "Big Orca says I shouldn't be scawed of a weflection. But it hops when I don't move. That's not how weflections work." },
          { bg: "pond", side: "egg", speaker: "Beek", mood: "neutral",
            text: "...Okay. If I'm going down there, I'm going down there with a snack. What sounds good, Big Orca?",
            choice: { prompt: "What does Beek bring to the pond?", persist: true, options: [
              { label: "Bogir", icon: "borgir", reply: "Bogir. Warm and heavy and brave. Perfect pond food.", mods: { food: "borgir" } },
              { label: "Apol", icon: "apol", reply: "Apol! Crunchy and cool. Keeps me quick on the lily pads.", mods: { food: "apol" } },
              { label: "Tenddie", icon: "tendie", reply: "Tenddie. Little sticks of courage, wah.", mods: { food: "tendie" } },
              { label: "Pizza", icon: "pizza", reply: "Pizza — but Big Orca gets the middle bite. That's the wules.", mods: { food: "pizza" } },
            ] } },
          { bg: "galaxy", side: "egg", speaker: "Beek", mood: "sleepy",
            text: "Deep breath. Into the water we go~" },
        ] },

        // ---- SEG 1: Dream 1 — gather the pond's scattered calm ----
        { type: "dream", title: "Dream One", dream: {
          playerChar: "beek", enemyFoe: "nightmarebeek", theme: "pond", bg: "bg_pond",
          objective: "collect", cols: 18, rows: 13, spawnEnemies: 2, boss: false,
        } },

        // ---- SEG 2: wake + difficulty choice ----
        { type: "story", beats: [
          { bg: "pond", side: null, speaker: "",
            text: "Beek surfaces with a gasp, pond water dripping off nothing at all. He's back on the bank." },
          { bg: "pond", side: "egg", speaker: "Beek", mood: "surprised",
            text: "I held it together! The pond went calm — just for a sec. But the bunny's still down there, hopping." },
          { bg: "pond", side: "egg", speaker: "Beek", mood: "neutral",
            text: "It comes in waves next. How far out do I swim?",
            choice: { prompt: "How deep does Beek wade in?", options: [
              { label: "Toes in", reply: "Just the shallows. Easy does it.", mods: { difficulty: 0.8 } },
              { label: "Up to here", reply: "Waist deep. Let's see what the pond's got.", mods: { difficulty: 1.0 } },
              { label: "All the way under", reply: "All the way down. Big Orca, don't let go.", mods: { difficulty: 1.4 } },
            ] } },
          { bg: "galaxy", side: "egg", speaker: "Beek", mood: "sleepy",
            text: "Back under. Hold my flipper..." },
        ] },

        // ---- SEG 3: Dream 2 — survive the ripples ----
        { type: "dream", title: "Dream Two", dream: {
          playerChar: "beek", enemyFoe: "nightmarebeek", theme: "pond", bg: "bg_pond",
          objective: "survive", cols: 20, rows: 15, spawnEnemies: 3, boss: false, waves: 3,
        } },

        // ---- SEG 4: wake + how-to-meet-it choice ----
        { type: "story", beats: [
          { bg: "pond", side: null, speaker: "",
            text: "He wakes tangled in his blanket like a fishing net. Heart going fast. But steadier than before." },
          { bg: "pond", side: "egg", speaker: "Beek", mood: "neutral",
            text: "One left. The big one. The bunny that wears my face — down at the very bottom of the pond." },
          { bg: "pond", side: "egg", speaker: "Beek", mood: "neutral",
            text: "How do I meet it?",
            choice: { prompt: "How does Beek face the dream-bunny?", options: [
              { label: "Gently", reply: "It's just scared, I think. Like me. Maybe it wants a flipper to hold too.",
                mods: { companion: true, extraPotion: true, mood: "kind" } },
              { label: "Head-on", reply: "I'm not scawed of my own pond anymore. Splash time.",
                mods: { difficulty: 1.25, mood: "fierce" } },
            ] } },
          { bg: "galaxy", side: "egg", speaker: "Beek", mood: "sleepy",
            text: "One more dive. All the way to the bottom." },
        ] },

        // ---- SEG 5: Dream 3 — the demon-bunny boss ----
        { type: "dream", title: "The Deepest Pond", dream: {
          playerChar: "beek", enemyFoe: "nightmarebeek", theme: "pond", bg: "bg_pond",
          bossName: "NIGHTMARE BEEK", objective: "defeat", cols: 20, rows: 15, spawnEnemies: 2, boss: true,
        } },

        // ---- SEG 6: victory ----
        { type: "story", end: true, beats: [
          { bg: "dream_void", side: null, speaker: "",
            text: "The bunny stops hopping. Sits. Tilts its head. And, slowly, tilts it back the way Beek does." },
          { bg: "dream_void", side: "shadow", speaker: "???", mood: "sad",
            text: "( ...you came all the way down here. For me? )" },
          { bg: "pond", side: "egg", speaker: "Beek", mood: "happy",
            text: "'Course I did, wah. You're part of the pond. Part of me. No more hiding at the bottom." },
          { bg: "pond", side: null, speaker: "",
            text: "The reflection settles. Just Beek now — and a very sleepy orca, drifting belly-up in the calm water." },
        ] },
      ],
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
    element: "excited",   // creator spark
    active: { id: "summonchar", name: "Yumemono!", cooldown: 16, dur: 9 },
    lose: { title: "The Dream Faded", text: "The blossoms drifted down and the meadow dimmed. Napling blinked awake, still sleepy." },
    win: { title: "Sweet Dream", text: "The last bad dream popped like a soap bubble. The meadow glowed warm and pink again." },
    // standalone Sunny Meadow level. She has no nightmare, so foes are random bad-dreams.
    meadow: {
      playerChar: "nap", enemyFoe: "shadow_egg", theme: "meadow", bg: "bg_meadow",
      bossName: "BAD DREAM", cols: 20, rows: 15, objective: "defeat",
      spawnEnemies: 4, boss: false, title: "Sunny Meadow",
    },

    // Napling's night: she visits the other dreamers' nightmares.
    // Dream boss types are resolved from the opening choice (see NAP.resolveNapArena):
    //   napSlot "chosen" -> the boss the player picked, "other" -> the one they didn't,
    //   napSlot "finale" -> Egg's shadow AND Beek's dream-bunny together.
    chapter: {
      segments: [

        // ---- SEG 0: intro + the choice (persists all night) ----
        { type: "story", beats: [
          { bg: "dream_void", side: null, speaker: "",
            text: "Yumemono sleeps. Its maker, Napling, drifts between her friends' dreams — and tonight, something has slipped loose in more than one of them." },
          { bg: "dream_void", side: "egg", speaker: "Napling", mood: "happy",
            text: "Wah~ so many sleepy heads! And so many bad dreams sneaking in where they don't belong. Nuh-uh. Not on my watch." },
          { bg: "dream_void", side: "egg", speaker: "Napling", mood: "neutral",
            text: "Two of them are crying out the loudest. I can only tuck into one dream first... which way do I go?",
            choice: { prompt: "Which cry does Napling follow first?", persist: true, options: [
              { label: "The one that sings", reply: "A song — sweet and sad — curling through the shelves of somebody's dream. I'm coming!",
                mods: { napPick: "siren" } },
              { label: "The one that smoulders", reply: "Something stubborn and hot, pacing back and forth up on the rooftops. Okay — you first.",
                mods: { napPick: "oni" } },
            ] } },
          { bg: "dream_void", side: "egg", speaker: "Napling", mood: "sleepy",
            text: "Here we go. Into the dream~" },
        ] },

        // ---- SEG 1: Dream 1 — the chosen nightmare ----
        { type: "dream", title: "Dream One", dream: {
          napSlot: "chosen", objective: "defeat", boss: true, cols: 20, rows: 15, spawnEnemies: 2,
        } },

        // ---- SEG 2: between dreams ----
        { type: "story", beats: [
          { bg: "dream_void", side: null, speaker: "",
            text: "One nightmare stilled. Napling catches her breath in the hush between dreams." },
          { bg: "dream_void", side: "egg", speaker: "Napling", mood: "happy",
            text: "Phew! That one just wanted somebody to sit with it, I think. But the other's still out there..." },
          { bg: "dream_void", side: "egg", speaker: "Napling", mood: "neutral",
            text: "I hear it now. Louder than before. Take me there." },
        ] },

        // ---- SEG 3: Dream 2 — the one she DIDN'T choose ----
        { type: "dream", title: "Dream Two", dream: {
          napSlot: "other", objective: "defeat", boss: true, cols: 20, rows: 15, spawnEnemies: 2,
        } },

        // ---- SEG 4: before the finale ----
        { type: "story", beats: [
          { bg: "dream_void", side: null, speaker: "",
            text: "Two dreams mended. But the deepest part of the night is still pulling at her — and it isn't alone down there." },
          { bg: "dream_void", side: "egg", speaker: "Napling", mood: "surprised",
            text: "Wah?! Two more?? The little grey shadow... and the dream-bunny. They found each other." },
          { bg: "dream_void", side: "egg", speaker: "Napling", mood: "neutral",
            text: "Okay. Okay! I made this whole world — I can hold two bad dreams at once. ...probably. Fwiends, lend me your strength!" },
        ] },

        // ---- SEG 5: Dream 3 — BOTH bosses at once (Egg's + Beek's) ----
        { type: "dream", title: "The Deepest Dream", dream: {
          napSlot: "finale", objective: "defeat", cols: 22, rows: 16, spawnEnemies: 2,
        } },

        // ---- SEG 6: victory ----
        { type: "story", end: true, beats: [
          { bg: "dream_void", side: null, speaker: "",
            text: "Both nightmares unravel into soft light. The meadow exhales." },
          { bg: "meadow", side: "egg", speaker: "Napling", mood: "happy",
            text: "There. All tucked in. Sweet dreams, everyone~" },
          { bg: "meadow", side: null, speaker: "",
            text: "Napling curls up in the middle of her meadow and — for the first time all night — lets herself nap, too." },
        ] },
      ],
    },
  };

  NAP.DATA = { characters: { egg, neogaucha, lua, beek, nap: napling }, order: ["egg", "neogaucha", "lua", "beek", "nap"] };

  // Napling's dreams borrow the OTHER dreamers' nightmares. Each boss key maps to
  // its home arena (foe sprites + theme + backdrop + a coy boss name).
  const NAP_ARENA = {
    siren:         { enemyFoe: "siren",         theme: "library", bg: "bg_library", bossName: "THE SIREN'S SONG" },
    oni:           { enemyFoe: "oni",           theme: "rooftop", bg: "bg_rooftop", bossName: "THE RESTLESS ONI" },
    shadow_egg:    { enemyFoe: "shadow_egg",    theme: "cloud",   bg: null,          bossName: "THE GREY SHADOW" },
    nightmarebeek: { enemyFoe: "nightmarebeek", theme: "pond",    bg: "bg_pond",     bossName: "THE DREAM-BUNNY" },
  };
  // resolve a Napling dream slot -> a concrete arena, given the night's choice (napPick)
  NAP.resolveNapArena = function (slot, pick) {
    const PAIR = ["siren", "oni"];   // the two options in Napling's opening choice
    if (slot === "chosen") return NAP_ARENA[pick] || NAP_ARENA.siren;
    if (slot === "other") return NAP_ARENA[PAIR.find(k => k !== pick) || "oni"];
    if (slot === "finale") return {   // Egg's shadow AND Beek's dream-bunny, in her own meadow
      foes: ["shadow_egg", "nightmarebeek"], bosses: ["shadow_egg", "nightmarebeek"],
      bossNames: ["THE GREY SHADOW", "THE DREAM-BUNNY"], theme: "meadow", bg: "bg_meadow",
    };
    return {};
  };

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
