/* =============================================================
   Nap Time — Dream scene (top-down ARPG). Objective-driven.
   Config (from data + choice mods):
     { charId, playerChar, enemyFoe, theme, bg, bossName,
       cols, rows, objective, spawnEnemies, boss, waves,
       difficulty, food, extraPotion, companion, mood }
   playerChar -> META.chars[...], enemyFoe -> META.foes[...],
   theme -> TILESETS[...], bg -> META.misc[...] background image.
   ============================================================= */
(function (NAP) {
  "use strict";
  const U = NAP.util, D = NAP.draw, M = NAP.META;

  // --- tuning ---
  const TILE = 72;
  const PLAYER_H = 104, ENEMY_H = 92, BOSS_H = 158, MINION_H = 72;
  const PLAYER_SPEED = 190, ENEMY_SPEED = 92, BOSS_SPEED = 70;
  const PLAYER_MAX_HP = 100, PLAYER_DMG = 22;
  const ENEMY_MAX_HP = 40, ENEMY_DMG = 9;
  const BOSS_MAX_HP = 220, BOSS_DMG = 14;
  const PLAYER_REACH = TILE * 1.15;
  const ENEMY_DETECT = TILE * 4.2, ENEMY_REACH = TILE * 0.95;
  const ATTACK_TIME = 0.40, ATTACK_HIT_AT = 0.45;
  const ENEMY_ATK_TIME = 0.55, ENEMY_ATK_CD = 1.1;
  const BOSS_ATK_TIME = 0.6, BOSS_ATK_CD = 1.6, BOSS_BLAST_CD = 2.6;
  const POTION_HEAL = 45, SURVIVE_TIME = 45;
  // phase 2 (triggers at 50% HP): faster, and a telegraphed ring-nova of blasts
  const BOSS_P2_SPEED = 1.7, BOSS_P2_ATK = 0.72;   // speed + attack-rate multipliers
  const NOVA_COUNT = 12, NOVA_CD = 3.0, NOVA_CHARGE = 0.6;

  // tile sets per theme: {floor, floor2, wall (perimeter), wall2 (interior)}
  const TILESETS = {
    cloud:   { floor: "tile_floor.png", floor2: "tile_floor2.png", wall: "tile_wall.png", wall2: "tile_wall.png" },
    rooftop: { floor: "tile_rooftop_floor.png", floor2: "tile_rooftop_floor2.png", wall: "tile_rooftop_wall.png", wall2: "tile_rooftop_wall2.png" },
    library: { floor: "tile_library_floor.png", floor2: "tile_library_floor2.png", wall: "tile_library_wall.png", wall2: "tile_library_wall2.png",
      corruptFloor: "tile_library_corrupt_floor.png", corruptWall: "tile_library_corrupt_wall.png" },
    pond: { floor: "tile_pond_floor.png", floor2: "tile_pond_floor2.png", wall: "tile_pond_reeds.png", wall2: "tile_pond_bush.png",
      water: "tile_pond_water.png", edge: "tile_pond_edge.png", overlayWalls: true },
    meadow: { floor: "tile_meadow_floor.png", floor2: "tile_meadow_floor2.png", wall: "tile_meadow_wall.png", wall2: "tile_meadow_wall2.png",
      picnic: "tile_meadow_picnic.png" },
    ship: { floor: "tile_ship_floor.png", floor2: "tile_ship_floor2.png", wall: "tile_ship_wall.png", wall2: "tile_ship_wall2.png" },
  };
  // grid tile types: 0 floor, 1 floor2, 2 wall, 3 wall2(interior), 4 corrupt-floor(hazard),
  //                  5 corrupt-wall, 6 water(non-walkable), 7 pond-edge, 8 picnic(walkable variant)
  const CORRUPT_DPS = 7;

  const dream = NAP.scenes.dream = {

  enter(params) {
    this.cfg = params.config;
    this.diff = this.cfg.difficulty || 1;
    this.cols = this.cfg.cols || 20;
    this.rows = this.cfg.rows || 15;
    // config-driven look & cast (charId comes from playerChar or the chapter's charId)
    this.charId = this.cfg.playerChar || this.cfg.charId || "egg";
    this.pMeta = M.chars[this.charId] || M.chars.egg;
    this.eMeta = M.foes[this.cfg.enemyFoe || "shadow_egg"];
    this.tiles = TILESETS[this.cfg.theme] || TILESETS.cloud;
    this.bgImg = this.cfg.bg || null;                      // e.g. "bg_rooftop"
    this.bossName = this.cfg.bossName || "EGG — SHADOW NIGHTMARE";
    this.adventure = !!this.cfg.adventure;                 // free-roam bounty mode
    this.chests = [];
    this.biomeGrid = (this.cfg.biomes && this.cfg.biomes.length) ? this.buildBiomeGrid(this.cfg.biomes) : null;
    this.buildLevel();
    // permanent stats come from the unified pipeline (base + char + level [+ skills/gear])
    this.charProg = NAP.charProgress(this.charId);
    this.stats = NAP.computeStats(this.charId);
    this.pMaxHp = this.stats.maxHp;
    this.pBaseDmg = this.stats.damage;
    this.levelFlash = 0;
    // difficulty scales enemy damage a little (0.8->0.88, 1.5->1.30)
    this.enemyDmgScale = 1 + (this.diff - 1) * 0.6;
    this.player = { x: 2.5 * TILE, y: 2.5 * TILE, radius: 16, hp: this.pMaxHp, maxhp: this.pMaxHp,
      dir: "down", moving: false, animT: 0, attacking: false, atkT: 0, atkHit: false, hurtT: 0,
      buff: { kind: null, t: 0 }, form: 0 };   // buff = food; form = Oni Mode timer
    // signature active (Shift), cooldown shortened by cdr, empowered by capstone.
    // cfg.lockActive gates it (e.g. before Neogaucha "discovers" it in her story).
    this.active = this.cfg.lockActive ? null : ((NAP.DATA.characters[this.charId] || {}).active || null);
    this.activeMax = this.active ? this.active.cooldown * (1 - Math.min(0.6, this.stats.cdr)) : 0;
    this.activeCd = 0;
    this.empowered = NAP.hasFlag(this.charId, "empower");
    this.healZones = [];
    this.buddyType = (NAP.DATA.characters[this.charId] || {}).buddy || "cloud";
    this.minions = [];         // Lua's summoned attackers
    this.zaps = [];            // Excited! chain-lightning arcs (visual)
    this.element = NAP.elementOf ? NAP.elementOf(this.charId) : null;   // basic-attack vibe
    this.enemies = [];
    this.projectiles = [];
    this.particles = [];
    this.popups = [];          // floating damage / xp numbers
    this.hitStop = 0;          // brief freeze on impact
    this.shake = 0;            // screen-shake magnitude (px)
    this.shakeX = 0; this.shakeY = 0;
    this.bossFlash = 0;        // purple flash when the boss powers up
    this.fragments = [];
    this.potions = [];
    // chosen food becomes a pickup that respawns through the dream
    this.food = this.cfg.food || null;
    this.foodItem = null;
    this.foodRespawn = 1.5;
    this.treats = [];          // rift: random food treats scattered about
    this.treatCd = 2 + Math.random() * 3;
    this.buddy = null;
    this.boss = null;
    this.bosses = [];          // supports multi-boss finales (e.g. Napling's Dream 3)
    this.cam = { x: 0, y: 0 };
    this.time = 0;
    // survive waves
    this.waves = this.cfg.waves || 3;
    this.wave = 0;
    this.waveClearing = false;
    this.waveBreak = 0;
    // deep-sleep rift
    this.isRift = this.cfg.objective === "rift";
    this.depth = this.cfg.depth || 1;
    this.riftProgress = 0;
    this.riftKillsNeeded = Math.round(8 + this.depth * 2);
    this.riftGuardianSpawned = false;
    this.riftSpawnCd = 0;
    this.riftButtons = [];
    this.xpMult = this.isRift ? 1 + this.depth * 0.2 : 1;
    this.outcome = null;       // 'win' | 'lose'
    this.outcomeT = 0;
    this.finished = false;
    this.bannerT = 3.2;        // objective banner fades
    this.setupObjective();
  },

  // ---------- level ----------
  // organic, guaranteed-connected level: scattered wall blobs + pillars carved
  // out of open floor, a jagged (non-rectangular) border, then connectivity repair.
  buildLevel() {
    const C = this.cols, R = this.rows;
    const spawnX = 2, spawnY = 2;   // player starts near here (freeCell / player init)
    const g = [];
    for (let y = 0; y < R; y++) { const row = [];
      for (let x = 0; x < C; x++) {
        let t = Math.random() < 0.16 ? 1 : 0;                 // floor / floor2 sprinkle
        if (x === 0 || y === 0 || x === C - 1 || y === R - 1) t = 2;
        row.push(t);
      } g.push(row);
    }
    const inSpawn = (x, y) => Math.abs(x - spawnX) <= 2 && Math.abs(y - spawnY) <= 2;
    const setWall = (x, y, t) => { if (x > 0 && y > 0 && x < C - 1 && y < R - 1 && !inSpawn(x, y)) g[y][x] = t; };
    // random-walk wall blob (rooms/masses to weave around)
    const blob = (cx, cy, steps, t) => {
      let x = cx, y = cy;
      for (let i = 0; i < steps; i++) {
        setWall(x, y, t);
        if (Math.random() < 0.5) setWall(x + 1, y, t);        // fatten a little
        const d = (Math.random() * 4) | 0;
        x = U.clamp(x + (d === 0 ? 1 : d === 1 ? -1 : 0), 1, C - 2);
        y = U.clamp(y + (d === 2 ? 1 : d === 3 ? -1 : 0), 1, R - 2);
      }
    };
    const area = C * R;
    const nBlobs = Math.max(4, Math.round(area / 42));
    for (let i = 0; i < nBlobs; i++) {
      const cx = 2 + ((Math.random() * (C - 4)) | 0), cy = 2 + ((Math.random() * (R - 4)) | 0);
      blob(cx, cy, 5 + ((Math.random() * 9) | 0), Math.random() < 0.7 ? 2 : 3);
    }
    // lone pillars for cover
    for (let i = 0; i < Math.round(area / 55); i++) {
      setWall(1 + ((Math.random() * (C - 2)) | 0), 1 + ((Math.random() * (R - 2)) | 0), 3);
    }
    // jagged border: push a few wall "peninsulas" inward so the edge isn't a clean rectangle
    for (let i = 0; i < Math.round((C + R) / 4); i++) {
      const edge = (Math.random() * 4) | 0, depth = 1 + ((Math.random() * 3) | 0);
      if (edge === 0) { const x = 1 + ((Math.random() * (C - 2)) | 0); for (let d = 1; d <= depth; d++) setWall(x, d, 2); }
      else if (edge === 1) { const x = 1 + ((Math.random() * (C - 2)) | 0); for (let d = 1; d <= depth; d++) setWall(x, R - 1 - d, 2); }
      else if (edge === 2) { const y = 1 + ((Math.random() * (R - 2)) | 0); for (let d = 1; d <= depth; d++) setWall(d, y, 2); }
      else { const y = 1 + ((Math.random() * (R - 2)) | 0); for (let d = 1; d <= depth; d++) setWall(C - 1 - d, y, 2); }
    }
    // library: a contained "infected" corner — corrupt floor (hazard) + corrupt wall
    if (this.tiles && this.tiles.corruptFloor) {
      const ox = C - 6, oy = R - 6;
      const patch = [[0, 1], [1, 1], [2, 1], [1, 2], [2, 2], [3, 2], [2, 3]];
      for (const [dx, dy] of patch) { const x = ox + dx, y = oy + dy; if (x > 0 && y > 0 && x < C - 1 && y < R - 1) g[y][x] = 4; }
      for (const [dx, dy] of [[0, 0], [1, 0], [3, 1], [3, 3]]) { const x = ox + dx, y = oy + dy; if (x > 0 && y > 0 && x < C - 1 && y < R - 1) g[y][x] = 5; }
    }
    // meadow: a cozy picnic-blanket cluster in a corner (walkable floor variant)
    if (this.tiles && this.tiles.picnic) {
      const ox = C - 5, oy = R - 5;
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const x = ox + dx, y = oy + dy; if (x > 0 && y > 0 && x < C - 1 && y < R - 1 && g[y][x] !== 2 && g[y][x] !== 3) g[y][x] = 8; }
    }
    // pond: carve a corner pond (bottom-left) with a diagonal shoreline of edge tiles
    if (this.tiles && this.tiles.water) {
      const T = 6;
      for (let y = 1; y < R - 1; y++) for (let x = 1; x < C - 1; x++) {
        const m = y - x;
        if (m >= T + 1) g[y][x] = 6;        // open water
        else if (m === T) g[y][x] = 7;      // shoreline (diagonal edge tile)
      }
    }
    this.connectRepair(g, C, R, spawnX, spawnY);   // last: reconnect anything sealed off by features
    this.grid = g;
  },
  // Guarantee every open cell is reachable from the spawn: flood-fill, then drill
  // an L-corridor from any stranded floor pocket back to the reachable region.
  connectRepair(g, C, R, sx, sy) {
    const blocked = t => (t === 2 || t === 3 || t === 5 || t === 6 || t === 7);
    g[sy][sx] = 0;
    for (let pass = 0; pass < 60; pass++) {
      const seen = []; for (let y = 0; y < R; y++) seen.push(new Array(C).fill(false));
      const st = [[sx, sy]]; seen[sy][sx] = true;
      while (st.length) {
        const [x, y] = st.pop();
        for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
          if (nx < 0 || ny < 0 || nx >= C || ny >= R || seen[ny][nx]) continue;
          if (blocked(g[ny][nx])) continue;
          seen[ny][nx] = true; st.push([nx, ny]);
        }
      }
      // find a stranded open cell
      let sxc = -1, syc = -1;
      for (let y = 1; y < R - 1 && sxc < 0; y++) for (let x = 1; x < C - 1; x++) {
        if (!blocked(g[y][x]) && !seen[y][x]) { sxc = x; syc = y; break; }
      }
      if (sxc < 0) return;                          // fully connected
      // drill an L-path toward the spawn until we touch reachable ground
      let x = sxc, y = syc, guard = 0;
      while (!(seen[y] && seen[y][x]) && guard++ < C + R) {
        if (g[y][x] !== 6 && g[y][x] !== 7) g[y][x] = 0;   // never fill water/shoreline
        if (x !== sx) x += x < sx ? 1 : -1;
        else if (y !== sy) y += y < sy ? 1 : -1;
        else break;
      }
    }
    // terminal cleanup: any pocket still unreachable (e.g. sealed by water) -> scenery wall
    const seen2 = []; for (let y = 0; y < R; y++) seen2.push(new Array(C).fill(false));
    const st2 = [[sx, sy]]; seen2[sy][sx] = true;
    const blk = t => (t === 2 || t === 3 || t === 5 || t === 6 || t === 7);
    while (st2.length) { const [x, y] = st2.pop();
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (nx < 0 || ny < 0 || nx >= C || ny >= R || seen2[ny][nx] || blk(g[ny][nx])) continue;
        seen2[ny][nx] = true; st2.push([nx, ny]);
      } }
    for (let y = 1; y < R - 1; y++) for (let x = 1; x < C - 1; x++)
      if (!blk(g[y][x]) && !seen2[y][x]) g[y][x] = 2;
  },
  // mixed "dreamland": Voronoi regions, each cell painted by its nearest biome seed
  buildBiomeGrid(biomes) {
    const C = this.cols, R = this.rows;
    const seeds = [];
    const n = Math.max(biomes.length, Math.round((C * R) / 120));
    for (let i = 0; i < n; i++) seeds.push({ x: (Math.random() * C) | 0, y: (Math.random() * R) | 0, b: biomes[i % biomes.length] });
    // shuffle biome assignment so regions vary
    for (const s of seeds) s.b = biomes[(Math.random() * biomes.length) | 0];
    const grid = [];
    for (let y = 0; y < R; y++) { const row = [];
      for (let x = 0; x < C; x++) {
        let best = seeds[0], bd = 1e9;
        for (const s of seeds) { const d = (s.x - x) * (s.x - x) + (s.y - y) * (s.y - y); if (d < bd) { bd = d; best = s; } }
        row.push(best.b);
      } grid.push(row);
    }
    return grid;
  },
  isWall(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.cols || ty >= this.rows) return true;
    const t = this.grid[ty][tx]; return t === 2 || t === 3 || t === 5 || t === 6 || t === 7;
  },
  freeCell(minDistFromPlayer) {
    for (let i = 0; i < 400; i++) {
      const x = 1 + ((Math.random() * (this.cols - 2)) | 0), y = 1 + ((Math.random() * (this.rows - 2)) | 0);
      if (this.isWall(x, y)) continue;
      const wx = (x + 0.5) * TILE, wy = (y + 0.5) * TILE;
      if (!minDistFromPlayer || !this.player || U.dist(wx, wy, this.player.x, this.player.y) > minDistFromPlayer)
        return { x: wx, y: wy };
    }
    return { x: 2.5 * TILE, y: 2.5 * TILE };
  },

  // ---------- objective setup ----------
  setupObjective() {
    const cfg = this.cfg;
    if (cfg.objective === "adventure") { this.setupAdventure(); return; }
    if (cfg.objective === "survive") {
      this.startWave(1);                          // wave-based tutorial
    } else if (cfg.objective === "rift") {
      const start = Math.round(3 + this.depth * 0.3);
      for (let i = 0; i < start; i++) this.enemies.push(this.makeEnemy(this.freeCell(TILE * 5)));
    } else {
      const n = Math.round((cfg.spawnEnemies || 0) * this.diff);
      const foeList = cfg.foes || [cfg.enemyFoe || "shadow_egg"];   // wisps may be mixed types
      for (let i = 0; i < n; i++) this.enemies.push(this.makeEnemy(this.freeCell(TILE * 5), foeList[i % foeList.length]));
    }
    // boss(es): cfg.bosses = [foeKey,...] for a multi-boss finale, else cfg.boss = single
    const bossKeys = cfg.bosses || (cfg.boss ? [cfg.enemyFoe || "shadow_egg"] : []);
    for (let bi = 0; bi < bossKeys.length; bi++) {
      const b = this.makeBoss(this.freeCell(TILE * 6), bossKeys[bi]);
      b.bossName = (cfg.bossNames && cfg.bossNames[bi]) || this.bossName;
      this.enemies.push(b); this.bosses.push(b);
    }
    this.boss = this.bosses[0] || null;
    if (cfg.objective === "collect") {
      const target = 5;
      for (let i = 0; i < target; i++) this.fragments.push(Object.assign(this.freeCell(TILE * 2), { bob: Math.random() * 6.28 }));
      this.fragTotal = target;
    }
    if (cfg.objective === "escort") { this.exit = this.freeCell(TILE * 8); this.spawnBuddy(true); }
    // potions
    for (let i = 0; i < 2; i++) this.potions.push(Object.assign(this.freeCell(TILE * 2), { bob: Math.random() * 6.28 }));
  },
  // ---------- Adventure Mode: free roam, scattered hordes + treasure + bounties ----------
  setupAdventure() {
    const cfg = this.cfg;
    const foes = cfg.foes || ["shadow_egg", "oni", "siren", "nightmarebeek"];
    // scattered roaming hordes (packs) all over the map
    const packs = cfg.packs || 6;
    let hordeTotal = 0;
    for (let p = 0; p < packs; p++) {
      const c = this.freeCell(TILE * 7), foe = foes[(Math.random() * foes.length) | 0];
      const size = 2 + ((Math.random() * 3) | 0);
      for (let i = 0; i < size; i++) {
        const e = this.makeEnemy({ x: c.x + (Math.random() - 0.5) * TILE * 2, y: c.y + (Math.random() - 0.5) * TILE * 2 }, foe);
        this.clampToOpen(e); this.enemies.push(e); hordeTotal++;
      }
    }
    // a wandering mini-boss
    const bfoe = foes[(Math.random() * foes.length) | 0];
    const boss = this.makeBoss(this.freeCell(TILE * 9), bfoe);
    boss.bossName = "THE DREAM-HOARDER";
    this.enemies.push(boss); this.bosses.push(boss); this.boss = boss;
    // treasure chests to find
    const chestGoal = cfg.chests || 5;
    for (let i = 0; i < chestGoal; i++) this.chests.push(Object.assign(this.freeCell(TILE * 4), { bob: Math.random() * 6.28, opened: false }));
    // potions sprinkled around
    for (let i = 0; i < 4; i++) this.potions.push(Object.assign(this.freeCell(TILE * 3), { bob: Math.random() * 6.28 }));
    // bounty checklist
    this.advKills = 0; this.chestsOpened = 0;
    this.bounties = [
      { id: "boss", label: "Best the Dream-Hoarder", have: 0, need: 1, done: false },
      { id: "chest", label: "Loot 3 Dream-Chests", have: 0, need: Math.min(3, chestGoal), done: false },
      { id: "horde", label: "Rout the Hordes", have: 0, need: hordeTotal, done: false },
    ];
    this.advCleared = false;
    this.bannerT = 2.4;
  },
  clampToOpen(e) {
    let tx = Math.floor(e.x / TILE), ty = Math.floor(e.y / TILE);
    if (this.isWall(tx, ty)) { const f = this.freeCell(0); e.x = f.x; e.y = f.y; }
  },
  bountyProgress(id, n) {
    if (!this.bounties) return;
    const b = this.bounties.find(q => q.id === id); if (!b || b.done) return;
    b.have = Math.min(b.need, b.have + n);
    if (b.have >= b.need) {
      b.done = true;
      this.popup(this.player.x, this.player.y - 64, "BOUNTY DONE!", "#ffe08a", true);
      this.gainXP(10); this.addShake(4); this.spawnHearts(this.player.x, this.player.y - 24);
      if (this.bounties.every(q => q.done)) { this.advCleared = true; this.bannerT = 2.4; }
    }
  },
  startWave(n) {
    this.wave = n;
    const count = Math.round((this.cfg.spawnEnemies || 3) * this.diff) + (n - 1);
    for (let i = 0; i < count; i++) this.enemies.push(this.makeEnemy(this.freeCell(TILE * 4)));
    this.bannerT = 1.8;   // flash the wave banner
  },
  // --- food pickup ---
  spawnFood() {
    if (!this.food) return;
    this.foodItem = Object.assign(this.freeCell(TILE * 2), { bob: Math.random() * 6.28, type: this.food });
  },
  // rift: sprinkle random food treats around the level
  updateTreats(dt) {
    this.treatCd -= dt;
    if (this.treatCd <= 0 && this.treats.length < 4) {
      const keys = Object.keys(M.misc.foods), type = keys[(Math.random() * keys.length) | 0];
      this.treats.push(Object.assign(this.freeCell(TILE * 2.5), { bob: Math.random() * 6.28, type }));
      this.treatCd = 3.5 + Math.random() * 4;
    }
  },
  applyFood(type) {
    const p = this.player;
    if (type === "apol") { p.buff = { kind: "speed", t: 8 }; }
    else if (type === "tendie") { p.buff = { kind: "dmg", t: 8 }; }
    else if (type === "borgir") { p.hp = Math.min(p.maxhp, p.hp + 50); p.buff = { kind: "resist", t: 8 }; }
    else if (type === "pizza") { p.hp = Math.min(p.maxhp, p.hp + 30); if (!this.buddy) this.spawnBuddy(false); }
    this.spawnHearts(p.x, p.y - 24);
  },
  // --- XP / leveling ---
  gainXP(n) {
    n = Math.max(1, Math.round(n * this.xpMult * this.stats.xpFind));
    this.popup(this.player.x + 14, this.player.y - 52, "+" + n + " XP", "#ff6fce");
    const r = NAP.addXP(this.charId, n);
    if (r.leveled > 0) {
      this.addShake(4);
      this.levelFlash = 1.8;
      // recompute from the pipeline and reward a full heal on level up
      this.stats = NAP.computeStats(this.charId);
      this.pBaseDmg = this.stats.damage;
      this.player.maxhp = this.stats.maxHp;
      this.player.hp = this.player.maxhp;
      this.spawnHearts(this.player.x, this.player.y - 28);
    }
  },
  spawnBuddy(isEscort) {
    this.buddy = { x: this.player.x - 30, y: this.player.y + 20, radius: 14, hp: 30, maxhp: 30,
      bob: 0, healCd: 0, escort: !!isEscort };
  },

  // ---------- entity factories ----------
  makeEnemy(pos, foeKey) {
    return { x: pos.x, y: pos.y, radius: 16, hp: Math.round(ENEMY_MAX_HP * this.diff), maxhp: Math.round(ENEMY_MAX_HP * this.diff),
      state: "idle", animT: 0, faceLeft: false, attacking: false, atkT: 0, atkCd: 0, atkDealt: false,
      hurtT: 0, dying: false, deathT: 0, dead: false, isBoss: false, h: ENEMY_H,
      foe: foeKey || this.cfg.enemyFoe || "shadow_egg" };
  },
  makeBoss(pos, foeKey) {
    return { x: pos.x, y: pos.y, radius: 24, hp: Math.round(BOSS_MAX_HP * this.diff), maxhp: Math.round(BOSS_MAX_HP * this.diff),
      state: "idle", animT: 0, faceLeft: false, attacking: false, atkT: 0, atkCd: 1, atkDealt: false,
      hurtT: 0, dying: false, deathT: 0, dead: false, isBoss: true, h: BOSS_H, blastCd: BOSS_BLAST_CD,
      phase: 1, novaCd: 2.0, novaCharge: 0,
      foe: foeKey || this.cfg.enemyFoe || "shadow_egg" };
  },

  // ---------- collision ----------
  move(e, dx, dy) {
    const r = e.radius;
    let nx = e.x + dx;
    if (dx !== 0) { const edge = nx + Math.sign(dx) * r;
      const tx = Math.floor(edge / TILE), t0 = Math.floor((e.y - r + 2) / TILE), t1 = Math.floor((e.y + r - 2) / TILE);
      if (this.isWall(tx, t0) || this.isWall(tx, t1)) nx = e.x; }
    e.x = nx;
    let ny = e.y + dy;
    if (dy !== 0) { const edge = ny + Math.sign(dy) * r;
      const ty = Math.floor(edge / TILE), t0 = Math.floor((e.x - r + 2) / TILE), t1 = Math.floor((e.x + r - 2) / TILE);
      if (this.isWall(t0, ty) || this.isWall(t1, ty)) ny = e.y; }
    e.y = ny;
  },

  // ---------- input ----------
  onKey(k) {
    if (this.outcome) { if (this.outcome === "riftlose") this.riftFinish(); return; }
    if (this.adventure && (k === "e" || k === "escape")) { this.win(); return; }   // wake from Adventure
    if (k === " ") this.tryAttack();
    else if (k === "shift") this.tryActive();
  },
  onDown(x, y) {
    if (this.outcome === "riftclear") { for (const b of this.riftButtons) if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { b.act(); return; } return; }
    if (this.outcome === "riftlose") { this.riftFinish(); return; }
    if (!this.outcome) this.tryAttack();
  },
  tryAttack() {
    const p = this.player; if (p.attacking) return;
    p.attacking = true; p.atkT = 0; p.atkHit = false;
  },
  // ---------- deep-sleep rift ----------
  updateRift(dt) {
    if (this.riftGuardianSpawned) return;
    const alive = this.enemies.filter(e => !e.dying && !e.isBoss).length;
    const target = Math.min(3 + Math.floor(this.depth / 2), 7);
    this.riftSpawnCd -= dt;
    if (alive < target && this.riftSpawnCd <= 0) {
      this.enemies.push(this.makeEnemy(this.freeCell(TILE * 4))); this.riftSpawnCd = 1.1;
    }
    if (this.riftProgress >= 1) this.spawnGuardian();
  },
  spawnGuardian() {
    this.riftGuardianSpawned = true;
    this.boss = this.makeBoss(this.freeCell(TILE * 6)); this.enemies.push(this.boss); this.bosses = [this.boss];
    this.bannerT = 2.2; this.addShake(9); this.bossFlash = 0.5;
  },
  riftFinish() {
    const reached = this.outcome === "riftclear" ? this.depth : this.depth - 1;
    NAP.riftEnd(Math.max(0, reached));
  },
  layoutRiftButtons() {
    const V = NAP.view, bw = 200, bh = 52, gap = 20, y = V.h * 0.60;
    this.riftButtons = [
      { label: "Descend ↓", x: V.w / 2 - bw - gap / 2, y, w: bw, h: bh, act: () => NAP.riftDescend() },
      { label: "Wake up", x: V.w / 2 + gap / 2, y, w: bw, h: bh, act: () => this.riftFinish() },
    ];
  },
  // ---------- signature active ----------
  tryActive() {
    if (!this.active || this.activeCd > 0) return;
    this.activeCd = this.activeMax;
    if (this.active.id === "sweetdreams") this.castSweetDreams();
    else if (this.active.id === "oniform") this.castOniForm();
    else if (this.active.id === "summon") this.castSummon();
    else if (this.active.id === "summonchar") this.castSummonChar();
    else if (this.active.id === "puddlesplash") this.castPuddleSplash();
    else if (this.active.id === "zapburst") this.castZapBurst();
  },
  castZapBurst() {
    const p = this.player, emp = this.empowered;
    const R = emp ? TILE * 4.2 : TILE * 3.2;
    const dmg = this.pBaseDmg * (emp ? 2.6 : 1.9);
    // zap every enemy in range with green taser-lightning + a brief stun
    let hits = 0;
    for (const en of this.enemies) {
      if (en.dead || en.dying) continue;
      if (U.dist(en.x, en.y, p.x, p.y) >= R) continue;
      this.hitEnemy(en, dmg * (en.isBoss ? 0.6 : 1));
      en.lull = Math.max(en.lull || 0, en.isBoss ? 0.4 : (emp ? 1.1 : 0.8));
      this.zaps.push({ x1: p.x, y1: p.y - 30, x2: en.x, y2: en.y - en.h * 0.4, t: 0, life: 0.22, c: "#d0ffe6", glow: "#4dff9e" });
      this.spawnBurst(en.x, en.y - en.h * 0.4, "#4dff9e");
      hits++;
    }
    this.particles.push({ ring: true, x: p.x, y: p.y - 20, t: 0, life: 0.4, r0: 10, r1: R, c: "#4dff9e" });
    this.spawnPoof(p.x, p.y - 18, "#4dff9e");
    this.popup(p.x, p.y - 58, hits ? "ZAP!" : "nnh—", "#4dff9e", true);
    this.addShake(emp ? 9 : 6); this.freeze(0.05);
  },
  castSummonChar() {
    const p = this.player, emp = this.empowered;
    const pool = NAP.DATA.order.filter(id => id !== "nap" && M.chars[id]);
    const count = emp ? 2 : 1;   // capstone: summon two
    for (let i = 0; i < count; i++) {
      const id = pool[(Math.random() * pool.length) | 0];
      this.minions.push({ kind: "char", charId: id,
        x: p.x + (Math.random() - 0.5) * 30, y: p.y + 16, t: 0,
        life: (this.active.dur || 9), atkCd: 0, animT: 0, moving: false, dir: "down", flip: false, atkAnim: 0,
        dmg: (16 + (this.charProg.level - 1) * 1.5) });
      this.popup(p.x + (i ? 24 : -24), p.y - 58, NAP.DATA.characters[id].name + "!", "#ff9ecf");
    }
    this.spawnPoof(p.x, p.y - 18, "#ffd0ea"); this.spawnPoof(p.x, p.y - 18, "#c8b0ff");
    this.spawnHearts(p.x, p.y - 24); this.addShake(4);
  },
  castSummon() {
    const p = this.player, emp = this.empowered;
    this.minions.push({ x: p.x + (Math.random() - 0.5) * 20, y: p.y + 16, t: 0,
      life: (this.active.dur || 8) * (emp ? 1.4 : 1), atkCd: 0, animT: 0, moving: false, flip: false, atkAnim: 0,
      dmg: (12 + (this.charProg.level - 1) * 1.2) * (emp ? 1.4 : 1) });
    this.spawnPoof(p.x, p.y - 18, "#ffe08a"); this.popup(p.x, p.y - 56, "go, Leech!", "#ffe08a"); this.addShake(2);
  },
  updateMinions(dt) {
    for (const m of this.minions) {
      m.t += dt; m.animT += dt; if (m.atkCd > 0) m.atkCd -= dt; if (m.atkAnim > 0) m.atkAnim -= dt;
      // seek nearest living enemy
      let best = null, bd = 1e9;
      for (const en of this.enemies) { if (en.dead || en.dying) continue; const d = U.dist(m.x, m.y, en.x, en.y); if (d < bd) { bd = d; best = en; } }
      m.moving = false;
      if (best) {
        const dx = best.x - m.x, dy = best.y - m.y, d = Math.hypot(dx, dy) || 1;
        m.flip = best.x < m.x;
        if (Math.abs(dy) >= Math.abs(dx)) m.dir = dy < 0 ? "up" : "down"; else m.dir = dx < 0 ? "left" : "right";
        const burst = m.kind === "char" ? "#ff9ecf" : "#ffe08a";
        if (d > 40) { const s = 210 * dt; m.x += dx / d * s; m.y += dy / d * s; m.moving = true; }
        else if (m.atkCd <= 0) { this.hitEnemy(best, m.dmg); m.atkCd = 0.6; m.atkAnim = 0.4; this.spawnBurst(best.x, best.y - best.h * 0.4, burst); }
      }
    }
    this.minions = this.minions.filter(m => m.t < m.life);
  },
  drawMinion(ctx, cam, m) {
    const sx = m.x - cam.x, sy = m.y - cam.y;
    const fade = m.life - m.t < 1 ? (m.life - m.t) : 1;
    if (m.kind === "char") {
      const C = M.chars[m.charId], scale = (PLAYER_H * 0.86) / M.storeBody;
      D.shadow(sx, sy, 20, 7);
      const vk = m.dir === "up" ? "up" : "down", flip = m.dir === "left";
      let anim, file;
      if (m.atkAnim > 0) { anim = C["attack_" + vk]; file = anim.files[U.clamp(Math.floor((1 - m.atkAnim / 0.4) * anim.files.length), 0, anim.files.length - 1)]; }
      else if (m.moving) { anim = C["walk_" + vk]; file = this.frameOf(anim, m.animT, 8); }
      else { anim = C["idle_" + vk]; file = anim.files[0]; }
      // sparkly summon ring on arrival
      if (m.t < 0.35) { ctx.save(); ctx.globalAlpha = (0.35 - m.t) / 0.35; ctx.strokeStyle = "#ffd0ea"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(sx, sy - PLAYER_H * 0.3, PLAYER_H * 0.5 * (m.t / 0.35 + 0.3), 0, 6.283); ctx.stroke(); ctx.restore(); }
      NAP.drawSprite(file, anim, sx, sy, scale, flip, U.clamp(fade, 0, 1));
      return;
    }
    const A = M.allies.leech, scale = MINION_H / M.storeBody;
    D.shadow(sx, sy, 16, 6);
    let anim, file;
    if (m.t < 0.3) { anim = A.summon; file = anim.files[0]; }
    else if (m.atkAnim > 0) { anim = A.attack; file = anim.files[U.clamp(Math.floor((1 - m.atkAnim / 0.4) * anim.files.length), 0, anim.files.length - 1)]; }
    else if (m.moving) { anim = A.walk; file = this.frameOf(A.walk, m.animT, 8); }
    else { anim = A.idle; file = anim.files[0]; }
    NAP.drawSprite(file, anim, sx, sy, scale, m.flip, U.clamp(fade, 0, 1));
  },
  castSweetDreams() {
    const p = this.player, emp = this.empowered;
    p.hp = Math.min(p.maxhp, p.hp + p.maxhp * (emp ? 0.35 : 0.25));
    this.healZones.push({ x: p.x, y: p.y, r: emp ? 112 : 82, t: 0, life: 5 });
    const lullR = emp ? TILE * 3.6 : TILE * 2.6, lullT = emp ? 3.6 : 2.6;
    for (const en of this.enemies) if (!en.isBoss && !en.dying && U.dist(en.x, en.y, p.x, p.y) < lullR) en.lull = lullT;
    this.spawnPoof(p.x, p.y - 20, "#a8ffd0"); this.spawnHearts(p.x, p.y - 24);
    this.addShake(3); this.popup(p.x, p.y - 60, "sweet dweams~", "#a8ffd0");
  },
  castOniForm() {
    const p = this.player;
    p.form = (this.active.dur || 6) * (this.empowered ? 1.5 : 1);
    this.bossFlash = 0.5; this.addShake(9); this.freeze(0.08);
    this.spawnPoof(p.x, p.y - 24, "#c98be0"); this.spawnPoof(p.x, p.y - 24, "#7a3bb0");
    this.popup(p.x, p.y - 60, "RAWR", "#e0a0ff");
  },
  castPuddleSplash() {
    const p = this.player, emp = this.empowered;
    p.hopDur = 0.5; p.hopT = 0; p.hopH = emp ? 64 : 50;   // jump arc height
    this.pendingSplash = { emp, fired: false };
    this.spawnPoof(p.x, p.y - 8, "#bfe9ff");
    this.popup(p.x, p.y - 60, "up we go~", "#bfe9ff"); this.addShake(2);
  },
  doSplash(emp) {
    const p = this.player;
    const R = emp ? TILE * 3.4 : TILE * 2.5;
    const dmg = this.pBaseDmg * (emp ? 3.0 : 2.2);
    // expanding water rings
    this.particles.push({ ring: true, x: p.x, y: p.y, t: 0, life: emp ? 0.6 : 0.5, r0: 12, r1: R, c: "#8fd3ff" });
    this.particles.push({ ring: true, x: p.x, y: p.y, t: 0, life: emp ? 0.5 : 0.42, r0: 8, r1: R * 0.7, c: "#eaf9ff" });
    // splash droplets flung outward
    for (let i = 0; i < 24; i++) { const a = Math.random() * 6.28, s = 90 + Math.random() * 130;
      this.particles.push({ x: p.x, y: p.y - 6, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 50, t: 0, life: .5 + Math.random() * .3, c: i % 3 ? "#bfe9ff" : "#eaf9ff", r: 3 + Math.random() * 4 }); }
    // damage + soak everyone in the ring
    for (const en of this.enemies) {
      if (en.dead || en.dying) continue;
      const dx = en.x - p.x, dy = en.y - p.y, d = Math.hypot(dx, dy);
      if (d >= R) continue;
      this.hitEnemy(en, dmg * (en.isBoss ? 0.6 : 1));
      en.lull = Math.max(en.lull || 0, en.isBoss ? 0.3 : (emp ? 0.9 : 0.6));   // splash-back stagger
      en.wet = emp ? 2.6 : 1.8;                                                 // wet = slowed
      const dd = d || 1, push = emp ? 26 : 20;
      this.move(en, (dx / dd) * push, (dy / dd) * push);                        // shove outward (walls block)
    }
    this.addShake(emp ? 11 : 8); this.freeze(0.06);
    this.popup(p.x, p.y - 40, "SPLOOSH!", "#8fd3ff", true);
  },
  faceVec(dir) {
    return dir === "up" ? { x: 0, y: -1 } : dir === "down" ? { x: 0, y: 1 } :
      dir === "left" ? { x: -1, y: 0 } : { x: 1, y: 0 };
  },

  // ---------- juice helpers ----------
  freeze(s) { if (s > this.hitStop) this.hitStop = s; },
  addShake(m) { if (m > this.shake) this.shake = m; },
  updateShake(dt) {
    this.shake = Math.max(0, this.shake - dt * 60);
    this.shakeX = (Math.random() - 0.5) * this.shake;
    this.shakeY = (Math.random() - 0.5) * this.shake;
  },
  popup(x, y, text, color, big) {
    this.popups.push({ x: x + (Math.random() - 0.5) * 10, y, text, color, t: 0, life: big ? 1.0 : 0.75, vy: -46, big: !!big });
  },
  updatePopups(dt) {
    for (const q of this.popups) { q.t += dt; q.y += q.vy * dt; q.vy += 70 * dt; }
    this.popups = this.popups.filter(q => q.t < q.life);
  },
  spawnPoof(x, y, color) {
    this.particles.push({ ring: true, x, y, t: 0, life: 0.35, r0: 6, r1: 34, c: color || "#ffd9ec" });
    for (let i = 0; i < 10; i++) { const a = Math.random() * 6.28, s = 40 + Math.random() * 70;
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 30, t: 0, life: .45 + Math.random() * .25, c: "#efe6ff", r: 3 + Math.random() * 4 }); }
  },

  // ---------- update ----------
  update(dt) {
    this.time += dt;
    if (this.bannerT > 0) this.bannerT -= dt;
    if (this.outcome) { this.outcomeT += dt;
      this.updateShake(dt); this.updatePopups(dt); this.updateParticles(dt);
      // rift outcomes wait for a button (descend/wake); story outcomes auto-finish
      if ((this.outcome === "win" || this.outcome === "lose") && this.outcomeT > 1.1) this.finish();
      return;
    }
    // hit-stop: freeze the sim briefly, but keep shake + popups alive
    if (this.hitStop > 0) { this.hitStop -= dt; this.updateShake(dt); this.updatePopups(dt); return; }
    this.updateShake(dt);
    this.updatePopups(dt);
    // food pickup respawns through the dream
    if (this.food && !this.foodItem) { this.foodRespawn -= dt; if (this.foodRespawn <= 0) { this.spawnFood(); this.foodRespawn = 12; } }
    if (this.player.buff.t > 0) this.player.buff.t -= dt;
    if (this.levelFlash > 0) this.levelFlash -= dt;
    if (this.bossFlash > 0) this.bossFlash -= dt;
    if (this.activeCd > 0) this.activeCd -= dt;
    if (this.player.form > 0) this.player.form -= dt;
    this.updateHealZones(dt);
    this.updatePlayer(dt);
    this.updateEnemies(dt);
    if (this.isRift) { this.updateRift(dt); this.updateTreats(dt); }
    this.updateProjectiles(dt);
    this.updatePickups(dt);
    this.updateBuddy(dt);
    this.updateMinions(dt);
    this.updateZaps(dt);
    this.updateParticles(dt);
    this.checkObjective(dt);
  },

  updatePlayer(dt) {
    const p = this.player, keys = NAP.input.keys;
    // Beek's Sploosh: airborne hop — no movement/attack while in the air, splash on the way down
    if (p.hopDur > 0) {
      p.hopT += dt; p.animT += dt * 0.6; p.moving = false;
      if (this.pendingSplash && !this.pendingSplash.fired && p.hopT >= p.hopDur * 0.82) {
        this.pendingSplash.fired = true; this.doSplash(this.pendingSplash.emp);
      }
      if (p.hopT >= p.hopDur) { p.hopDur = 0; p.hopT = 0; this.pendingSplash = null; }
      if (p.hurtT > 0) p.hurtT -= dt;
      return;
    }
    let mx = 0, my = 0;
    if (keys["a"] || keys["arrowleft"]) mx -= 1;
    if (keys["d"] || keys["arrowright"]) mx += 1;
    if (keys["w"] || keys["arrowup"]) my -= 1;
    if (keys["s"] || keys["arrowdown"]) my += 1;
    const ax = NAP.input.axis;                       // gamepad stick / touch joystick
    if (ax) { mx += ax.x; my += ax.y; }
    if (Math.abs(mx) < 0.12 && Math.abs(my) < 0.12) { mx = 0; my = 0; }
    const moving = (mx || my) && !p.attacking;
    p.moving = !!moving;
    if (mx || my) {
      if (Math.abs(my) >= Math.abs(mx)) p.dir = my < 0 ? "up" : "down";
      else p.dir = mx < 0 ? "left" : "right";
    }
    const speed = this.stats.moveSpeed * (p.buff.kind === "speed" && p.buff.t > 0 ? 1.5 : 1);
    if (moving) { const len = Math.hypot(mx, my) || 1;
      this.move(p, (mx / len) * speed * dt, (my / len) * speed * dt); p.animT += dt; }
    else if (!p.attacking) p.animT += dt * 0.6;

    if (p.attacking) {
      p.atkT += dt;
      if (!p.atkHit && p.atkT / ATTACK_TIME >= ATTACK_HIT_AT) {
        p.atkHit = true;
        const v = this.faceVec(p.dir);
        for (const en of this.enemies) {
          if (en.dead || en.dying) continue;
          const dx = en.x - p.x, dy = (en.y - 20) - (p.y - 20), dist = Math.hypot(dx, dy);
          if (dist <= PLAYER_REACH + (en.isBoss ? 14 : 0)) {
            const pdmg = this.pBaseDmg * (p.buff.kind === "dmg" && p.buff.t > 0 ? 1.6 : 1) * (p.form > 0 ? 1.6 : 1);
            if (dist < TILE * 0.5 || dx * v.x + dy * v.y > 0) { this.hitEnemy(en, pdmg); this.applyElement(en, pdmg); }
          }
        }
      }
      if (p.atkT >= ATTACK_TIME) p.attacking = false;
    }
    if (p.hurtT > 0) p.hurtT -= dt;
    // corruption hazard: standing on a corrupt-floor tile drains HP
    const ftx = Math.floor(p.x / TILE), fty = Math.floor(p.y / TILE);
    if (this.grid[fty] && this.grid[fty][ftx] === 4) {
      p.hp -= CORRUPT_DPS * dt;
      if (Math.random() < 0.2) this.particles.push({ x: p.x + (Math.random() - 0.5) * 26, y: p.y - 8, vx: 0, vy: -34, t: 0, life: 0.55, c: "#c86bff", r: 2 + Math.random() * 2 });
    }
    if (p.hp <= 0 && !this.outcome) this.lose();
  },

  updateEnemies(dt) {
    const p = this.player;
    for (const en of this.enemies) {
      if (en.dead) continue;
      if (en.dying) { en.deathT += dt; if (en.deathT >= this.deathDur(en)) en.dead = true; continue; }
      if (en.hurtT > 0) en.hurtT -= dt;
      if (en.hitPop > 0) en.hitPop = Math.max(0, en.hitPop - dt * 6);
      if (en.wet > 0) en.wet -= dt;
      if (en.burn && en.burn.t > 0) {                                  // Cozy flames: damage over time
        en.burn.t -= dt; en.hp -= en.burn.dps * dt;
        if (Math.random() < 0.25) this.particles.push({ x: en.x + (Math.random() - .5) * 20, y: en.y - en.h * 0.5, vx: (Math.random() - .5) * 18, vy: -46, t: 0, life: .45, c: Math.random() < .5 ? "#ff9a4d" : "#ffe0a8", r: 2 + Math.random() * 3 });
        if (en.hp <= 0 && !en.dying) {
          en.dying = true; en.deathT = 0;
          this.spawnPoof(en.x, en.y - en.h * 0.4, en.isBoss ? "#c98be0" : "#ffb0d6");
          if (this.isRift && !en.isBoss) this.riftProgress = Math.min(1, this.riftProgress + 1 / this.riftKillsNeeded);
          this.gainXP(en.isBoss ? 12 : 1);
        }
      }
      if (en.lull > 0) { en.lull -= dt; en.state = "idle"; en.animT += dt * 0.4; en.attacking = false; continue; }
      en.faceLeft = p.x < en.x;
      const dx = p.x - en.x, dy = p.y - en.y, dist = Math.hypot(dx, dy);
      if (en.atkCd > 0) en.atkCd -= dt;
      const p2 = en.isBoss && en.phase === 2;
      const reach = en.isBoss ? ENEMY_REACH + 24 : ENEMY_REACH;
      const speed = (en.isBoss ? BOSS_SPEED : ENEMY_SPEED) * (p2 ? BOSS_P2_SPEED : 1) * (en.wet > 0 ? 0.5 : 1);
      const atkTime = (en.isBoss ? BOSS_ATK_TIME : ENEMY_ATK_TIME) * (p2 ? BOSS_P2_ATK : 1);
      const atkCd = (en.isBoss ? BOSS_ATK_CD : ENEMY_ATK_CD) * (p2 ? BOSS_P2_ATK : 1);
      const dmg = en.isBoss ? BOSS_DMG : ENEMY_DMG;

      if (en.isBoss) {
        // enter phase 2 at half health
        if (en.phase === 1 && en.hp <= en.maxhp * 0.5) this.bossPhase2(en);
        // phase-2 ring nova: charge (telegraph), then fire in all directions
        if (p2) {
          if (en.novaCharge > 0) {
            en.novaCharge -= dt; en.animT += dt;
            if (en.novaCharge <= 0) { this.fireNova(en); en.novaCd = NOVA_CD; }
            continue;                                  // hold still while charging
          }
          en.novaCd -= dt;
          if (en.novaCd <= 0 && !en.attacking) { en.novaCharge = NOVA_CHARGE; this.addShake(4); continue; }
        }
        // aimed dark blast
        en.blastCd -= dt;
        if (!en.attacking && en.blastCd <= 0 && dist < TILE * 6 && dist > TILE * 1.4) {
          en.blastCd = BOSS_BLAST_CD; en.attacking = true; en.atkT = 0; en.atkDealt = "blast";
        }
      }

      if (en.attacking) {
        en.atkT += dt; en.animT += dt;
        if (en.atkDealt === "blast") {
          if (en.atkT >= atkTime * 0.5) { this.fireBlast(en, p); en.atkDealt = true; }
        } else if (!en.atkDealt && en.atkT >= atkTime * 0.5) {
          en.atkDealt = true; if (dist < reach + 18) this.damagePlayer(dmg);
        }
        if (en.atkT >= atkTime) { en.attacking = false; en.atkCd = atkCd; }
        continue;
      }
      if (dist < reach) { en.state = "idle"; en.animT += dt;
        if (en.atkCd <= 0) { en.attacking = true; en.atkT = 0; en.atkDealt = false; } }
      else if (dist < ENEMY_DETECT || en.isBoss) { en.state = "walk"; en.animT += dt;
        const len = dist || 1; this.move(en, (dx / len) * speed * dt, (dy / len) * speed * dt); }
      else { en.state = "idle"; en.animT += dt * 0.5; }
    }
    this.enemies = this.enemies.filter(e => !e.dead);
    this.bosses = this.bosses.filter(b => !b.dead);
    this.boss = this.bosses[0] || null;
  },

  fireBlast(en, target) {
    const dx = target.x - en.x, dy = (target.y - 20) - en.y, d = Math.hypot(dx, dy) || 1;
    const sp = 260;
    this.projectiles.push({ x: en.x, y: en.y - en.h * 0.4, vx: dx / d * sp, vy: dy / d * sp, life: 2.2, t: 0, r: 12 });
    this.addShake(3);
  },
  bossPhase2(en) {
    en.phase = 2; en.novaCd = 1.2;
    this.freeze(0.12); this.addShake(13); this.bossFlash = 0.7;
    this.spawnPoof(en.x, en.y - en.h * 0.4, "#c98be0");
    this.spawnPoof(en.x, en.y - en.h * 0.4, "#7a3bb0");
  },
  fireNova(en) {
    const sp = 230, off = Math.random() * 6.28;
    for (let i = 0; i < NOVA_COUNT; i++) {
      const a = off + i / NOVA_COUNT * 6.28;
      this.projectiles.push({ x: en.x, y: en.y - en.h * 0.4, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 2.4, t: 0, r: 11 });
    }
    this.addShake(7); this.spawnPoof(en.x, en.y - en.h * 0.4, "#c98be0");
  },
  updateProjectiles(dt) {
    const p = this.player;
    for (const pr of this.projectiles) {
      pr.t += dt; pr.x += pr.vx * dt; pr.y += pr.vy * dt;
      const tx = Math.floor(pr.x / TILE), ty = Math.floor(pr.y / TILE);
      if (this.isWall(tx, ty)) { pr.t = pr.life; this.spawnBurst(pr.x, pr.y, "#b06bd8"); continue; }
      if (U.dist(pr.x, pr.y, p.x, p.y - 20) < pr.r + p.radius) {
        this.damagePlayer(BOSS_DMG); pr.t = pr.life; this.spawnBurst(pr.x, pr.y, "#b06bd8");
      }
    }
    this.projectiles = this.projectiles.filter(pr => pr.t < pr.life);
  },

  updatePickups(dt) {
    const p = this.player;
    // treasure chests (Adventure): walk into one to pop it open
    for (const ch of this.chests) { if (ch.opened) continue; ch.bob += dt * 2.5;
      if (U.dist(ch.x, ch.y, p.x, p.y - 12) < TILE * 0.7) {
        ch.opened = true; ch.pop = 0.6; this.chestsOpened++;
        p.hp = Math.min(p.maxhp, p.hp + 25); this.gainXP(6);
        this.spawnPoof(ch.x, ch.y - 8, "#ffe08a"); this.spawnHearts(ch.x, ch.y - 20);
        this.popup(ch.x, ch.y - 40, "✦ loot!", "#ffe08a"); this.addShake(3);
        this.bountyProgress("chest", 1);
      } }
    for (const pt of this.potions) { if (pt.taken) continue; pt.bob += dt * 2.5;
      if (U.dist(pt.x, pt.y, p.x, p.y - 18) < TILE * 0.6) {
        pt.taken = true; p.hp = Math.min(p.maxhp, p.hp + POTION_HEAL); this.spawnHearts(pt.x, pt.y - 30); } }
    this.potions = this.potions.filter(pt => !pt.taken);
    // food pickup -> timed buff, then respawns later
    if (this.foodItem) { this.foodItem.bob += dt * 2.5;
      if (U.dist(this.foodItem.x, this.foodItem.y, p.x, p.y - 18) < TILE * 0.6) {
        this.applyFood(this.foodItem.type); this.foodItem = null; this.foodRespawn = 12; } }
    // rift treats -> eat for that food's buff
    for (const tr of this.treats) { tr.bob += dt * 2.5;
      if (U.dist(tr.x, tr.y, p.x, p.y - 18) < TILE * 0.6) { this.applyFood(tr.type); tr.taken = true; } }
    this.treats = this.treats.filter(t => !t.taken);
    for (const fr of this.fragments) { if (fr.taken) continue; fr.bob += dt * 2.5;
      if (U.dist(fr.x, fr.y, p.x, p.y - 18) < TILE * 0.6) {
        fr.taken = true; this.spawnBurst(fr.x, fr.y - 20, "#ff2d95"); this.gainXP(1); } }
    this.fragments = this.fragments.filter(fr => !fr.taken);
  },

  updateBuddy(dt) {
    const b = this.buddy, p = this.player; if (!b) return;
    b.bob += dt * 3;
    const target = b.escort ? this.exit : p;
    const tx = b.escort ? this.exit.x : p.x - 34, ty = b.escort ? this.exit.y : p.y + 16;
    const dx = tx - b.x, dy = ty - b.y, d = Math.hypot(dx, dy);
    if (d > (b.escort ? 4 : 40)) { const s = Math.min(d, (b.escort ? ENEMY_SPEED : 150) * dt); b.x += dx / (d || 1) * s; b.y += dy / (d || 1) * s; }
    b.healCd -= dt;
    if (!b.escort && b.healCd <= 0 && p.hp < p.maxhp) { b.healCd = 5; p.hp = Math.min(p.maxhp, p.hp + 4); this.spawnHearts(b.x, b.y - 10); }
  },

  updateParticles(dt) {
    for (const pt of this.particles) {
      pt.t += dt;
      if (pt.ring) continue;                 // rings just expand in place
      pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.vy += 180 * dt;
    }
    this.particles = this.particles.filter(pt => pt.t < pt.life);
  },
  updateHealZones(dt) {
    const p = this.player;
    for (const z of this.healZones) {
      z.t += dt;
      if (U.dist(z.x, z.y, p.x, p.y) < z.r && p.hp < p.maxhp) p.hp = Math.min(p.maxhp, p.hp + 9 * dt);
    }
    this.healZones = this.healZones.filter(z => z.t < z.life);
  },

  // ---------- objective resolution ----------
  checkObjective(dt) {
    if (this.outcome) return;
    const o = this.cfg.objective;
    if (o === "defeat") {
      const hadBoss = this.cfg.boss || (this.cfg.bosses && this.cfg.bosses.length);
      const bossGone = hadBoss ? this.bosses.length === 0 : true;
      const wispsGone = this.enemies.filter(e => !e.isBoss && !e.dying).length === 0;
      if (bossGone && wispsGone) this.win();
    } else if (o === "survive") {
      // wave-based: clear all wisps to advance; win after the last wave
      const alive = this.enemies.filter(e => !e.dying).length;
      if (this.waveClearing) {
        this.waveBreak -= dt;
        if (this.waveBreak <= 0) { this.waveClearing = false; this.startWave(this.wave + 1); }
      } else if (alive === 0) {
        if (this.wave >= this.waves) this.win();
        else { this.waveClearing = true; this.waveBreak = 2.4; }
      }
    } else if (o === "collect") {
      if (this.fragments.length === 0) this.win();
    } else if (o === "escort") {
      if (this.buddy && U.dist(this.buddy.x, this.buddy.y, this.exit.x, this.exit.y) < TILE * 0.6) this.win();
    } else if (o === "rift") {
      if (this.riftGuardianSpawned && !this.boss) this.win();   // guardian down -> depth clear
    }
  },
  win() { if (!this.outcome) { this.outcome = this.isRift ? "riftclear" : "win"; this.outcomeT = 0; if (this.isRift) this.layoutRiftButtons(); } },
  lose() { if (!this.outcome) { this.outcome = this.isRift ? "riftlose" : "lose"; this.outcomeT = 0; } },
  finish() {
    if (this.finished) return; this.finished = true;
    if (NAP.chapter && this.outcome === "win") {
      NAP.chapterAfterDreamWin();          // chapter flow: runSegment applies the wake
    } else {
      // standalone dream (or any loss) -> show the wake-up card
      NAP.go(NAP.scenes.result, { config: this.cfg, won: this.outcome === "win" },
        { type: "wake", outDur: 0.9, inDur: 0.7 });
    }
  },

  // ---------- combat fx ----------
  deathDur(en) { const m = (en && M.foes[en.foe]) || this.eMeta; return m.death.files.length * 0.16; },
  hitEnemy(en, dmg) {
    dmg = Math.round(dmg);
    en.hp -= dmg; en.hurtT = 0.18; en.hitPop = 1;
    const p = this.player;
    // Rawr Mode: lifesteal while in Oni Form
    if (p.form > 0 && this.empowered && p.hp < p.maxhp) { p.hp = Math.min(p.maxhp, p.hp + dmg * 0.15); }
    const buffed = this.player.buff.kind === "dmg" && this.player.buff.t > 0;
    this.spawnBurst(en.x, en.y - en.h * 0.5, "#ff6fae");
    this.popup(en.x, en.y - en.h * 0.55, dmg, buffed ? "#ffd36b" : "#ffffff");
    const dx = en.x - this.player.x, dy = en.y - this.player.y, d = Math.hypot(dx, dy) || 1;
    if (!en.isBoss) this.move(en, dx / d * 20, dy / d * 20);
    const kill = en.hp <= 0 && !en.dying;
    this.freeze(kill ? 0.08 : 0.045);
    this.addShake(kill ? 6 : 2.5);
    if (kill) {
      en.dying = true; en.deathT = 0;
      this.spawnPoof(en.x, en.y - en.h * 0.4, en.isBoss ? "#c98be0" : "#ffb0d6");
      if (en.isBoss) this.addShake(11);
      if (this.isRift && !en.isBoss) this.riftProgress = Math.min(1, this.riftProgress + 1 / this.riftKillsNeeded);
      this.gainXP(en.isBoss ? 12 : 1);
      if (this.adventure) { if (en.isBoss) this.bountyProgress("boss", 1); else this.bountyProgress("horde", 1); }
    }
  },
  damagePlayer(dmg) {
    const p = this.player; if (p.hurtT > 0) return;
    let resist = (p.buff.kind === "resist" && p.buff.t > 0) ? 0.5 : 1;
    if (p.form > 0) resist *= 0.5;                 // Oni Mode: tanky
    resist *= (1 - Math.min(0.75, this.stats.dmgResist || 0));
    const taken = Math.round(dmg * this.enemyDmgScale * resist);
    p.hp -= taken; p.hurtT = 0.4;
    this.popup(p.x, p.y - 44, taken, "#ff5f7a");
    this.freeze(0.06); this.addShake(6);
  },
  spawnBurst(x, y, c) { for (let i = 0; i < 8; i++) { const a = Math.random() * 6.28, s = 60 + Math.random() * 90;
    this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, t: 0, life: .4 + Math.random() * .2, c, r: 3 + Math.random() * 3 }); } },
  spawnHearts(x, y) { for (let i = 0; i < 10; i++) { const a = -1.57 + (Math.random() - .5) * 1.2, s = 50 + Math.random() * 70;
    this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 70, t: 0, life: .8 + Math.random() * .4, c: "#8dffb0", r: 4 + Math.random() * 3, heart: true }); } },

  // cute elemental on-hit effect for the basic attack
  applyElement(en, baseDmg) {
    const el = this.element; if (!el || en.dead || en.dying) return;
    const p = this.player;
    if (el.effect === "burn") {
      en.burn = { t: 2.4, dps: baseDmg * 0.28 };                       // marshmallow flames
    } else if (el.effect === "slow") {
      en.wet = Math.max(en.wet || 0, 1.8);                             // soaked = slow
    } else if (el.effect === "nudge") {
      const dx = en.x - p.x, dy = en.y - p.y, d = Math.hypot(dx, dy) || 1;
      if (!en.isBoss) this.move(en, (dx / d) * 16, (dy / d) * 16);     // breezy push
    } else if (el.effect === "chain") {
      let best = null, bd = 1e9;                                        // zap to one more nearby
      for (const o of this.enemies) { if (o === en || o.dead || o.dying) continue;
        const dd = U.dist(o.x, o.y, en.x, en.y); if (dd < bd && dd < TILE * 3) { bd = dd; best = o; } }
      if (best) {
        this.hitEnemy(best, baseDmg * 0.5);
        this.zaps.push({ x1: en.x, y1: en.y - en.h * 0.4, x2: best.x, y2: best.y - best.h * 0.4, t: 0, life: 0.18, c: el.spark, glow: el.color });
      }
    }
    this.spawnBurst(en.x, en.y - en.h * 0.45, el.color);               // vibe-colored sparkle
  },
  updateZaps(dt) { for (const z of this.zaps) z.t += dt; this.zaps = this.zaps.filter(z => z.t < z.life); },

  // ---------- anim pickers ----------
  frameOf(a, t, fps) { return a.files[Math.floor(t * fps) % a.files.length]; },
  playerAnim() {
    const p = this.player;
    // Oni Mode: render Neogaucha as her Oni nightmare (non-directional foe anims)
    if (p.form > 0) {
      const om = M.foes.oni, flip = p.dir === "left";
      if (p.attacking) { const a = om.attack; const idx = U.clamp(Math.floor((p.atkT / ATTACK_TIME) * a.files.length), 0, a.files.length - 1); return { file: a.files[idx], meta: a, flip }; }
      if (p.moving) { const a = om.walk; return { file: this.frameOf(a, p.animT, 7), meta: a, flip }; }
      const a = om.idle; return { file: a.files[0], meta: a, flip };
    }
    const m = this.pMeta, vk = p.dir === "up" ? "up" : "down", flip = p.dir === "left";
    if (p.attacking) { const a = m["attack_" + vk];
      const idx = U.clamp(Math.floor((p.atkT / ATTACK_TIME) * a.files.length), 0, a.files.length - 1);
      return { file: a.files[idx], meta: a, flip }; }
    if (p.moving) { const a = m["walk_" + vk]; return { file: this.frameOf(a, p.animT, 8), meta: a, flip }; }
    const a = m["idle_" + vk]; return { file: a.files[0], meta: a, flip };
  },
  enemyAnim(en) {
    const m = M.foes[en.foe] || this.eMeta;
    if (en.dying) { const a = m.death; const idx = U.clamp(Math.floor((en.deathT / this.deathDur(en)) * a.files.length), 0, a.files.length - 1);
      return { file: a.files[idx], meta: a, flip: en.faceLeft }; }
    if (en.attacking) { const a = m.attack; const idx = U.clamp(Math.floor((en.atkT / (en.isBoss ? BOSS_ATK_TIME : ENEMY_ATK_TIME)) * a.files.length), 0, a.files.length - 1);
      return { file: a.files[idx], meta: a, flip: en.faceLeft }; }
    if (en.state === "walk") { const a = m.walk; return { file: this.frameOf(a, en.animT, 7), meta: a, flip: en.faceLeft }; }
    const a = m.idle; return { file: a.files[0], meta: a, flip: en.faceLeft };
  },

  // ---------- render ----------
  draw(ctx) {
    const V = NAP.view, worldW = this.cols * TILE, worldH = this.rows * TILE, t = this.time;
    this.cam.x = U.clamp(this.player.x - V.w / 2, 0, Math.max(0, worldW - V.w)) + this.shakeX;
    this.cam.y = U.clamp(this.player.y - V.h / 2, 0, Math.max(0, worldH - V.h)) + this.shakeY;
    const cam = this.cam;

    // background: image (parallax) or gradient sky
    const bgim = this.bgImg && NAP.img(M.misc[this.bgImg].file);
    if (bgim) {
      const bm = M.misc[this.bgImg], s = Math.max(V.w / bm.w, V.h / bm.h);
      const dw = bm.w * s, dh = bm.h * s;
      const px = -(cam.x / Math.max(1, worldW - V.w || 1)) * (dw - V.w);
      const py = -(cam.y / Math.max(1, worldH - V.h || 1)) * (dh - V.h);
      ctx.drawImage(bgim, (isFinite(px) ? px : 0), (isFinite(py) ? py : 0), dw, dh);
    } else {
      const g = ctx.createLinearGradient(0, 0, 0, V.h);
      g.addColorStop(0, "#2f2350"); g.addColorStop(0.5, "#4a3576"); g.addColorStop(1, "#6b4f92");
      ctx.fillStyle = g; ctx.fillRect(0, 0, V.w, V.h);
    }

    // tiles
    const x0 = Math.floor(cam.x / TILE), x1 = Math.ceil((cam.x + V.w) / TILE);
    const y0 = Math.floor(cam.y / TILE), y1 = Math.ceil((cam.y + V.h) / TILE);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) continue;
      const T = this.biomeGrid ? (TILESETS[this.biomeGrid[y][x]] || this.tiles) : this.tiles;  // mixed dreamland
      const sx = x * TILE - cam.x, sy = y * TILE - cam.y, tt = this.grid[y][x];
      if (tt === 6) { const im = NAP.img(T.water); if (im) ctx.drawImage(im, sx, sy, TILE, TILE); continue; }
      if (tt === 7) { const im = NAP.img(T.edge); if (im) ctx.drawImage(im, sx, sy, TILE, TILE); continue; }
      if (T.overlayWalls && (tt === 2 || tt === 3)) {
        // foliage drawn OVER grass (transparent corners), not as a solid tile
        const fl = NAP.img(T.floor); if (fl) ctx.drawImage(fl, sx, sy, TILE, TILE);
        const ov = NAP.img(tt === 2 ? T.wall : T.wall2); if (ov) ctx.drawImage(ov, sx, sy, TILE, TILE);
        continue;
      }
      const key = tt === 2 ? T.wall : tt === 3 ? T.wall2 : tt === 1 ? T.floor2
        : tt === 8 ? (T.picnic || T.floor)
        : tt === 4 ? (T.corruptFloor || T.floor) : tt === 5 ? (T.corruptWall || T.wall) : T.floor;
      const im = NAP.img(key);
      if (im) ctx.drawImage(im, sx, sy, TILE, TILE);
      if (tt === 2 || tt === 3) { ctx.fillStyle = "rgba(20,10,40,0.12)"; ctx.fillRect(sx, sy, TILE, TILE); }
      if (tt === 4 || tt === 5) {  // corruption pulse
        ctx.fillStyle = "rgba(120,30,160," + (0.14 + 0.1 * Math.sin(t * 3 + x + y)) + ")"; ctx.fillRect(sx, sy, TILE, TILE);
      }
    }

    // Sweet Dweams heal zones (on the floor, under characters)
    for (const z of this.healZones) {
      const sx = z.x - cam.x, sy = z.y - cam.y, fade = U.clamp(1 - z.t / z.life, 0, 1);
      ctx.save(); ctx.globalAlpha = 0.25 * fade + 0.08 * Math.sin(t * 4);
      const g = ctx.createRadialGradient(sx, sy, z.r * 0.2, sx, sy, z.r);
      g.addColorStop(0, "#a8ffd0"); g.addColorStop(1, "rgba(168,255,208,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, z.r, 0, 6.28); ctx.fill();
      ctx.globalAlpha = 0.5 * fade; ctx.strokeStyle = "#c8ffe4"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(sx, sy, z.r, 0, 6.28); ctx.stroke(); ctx.restore();
    }

    // escort exit
    if (this.cfg.objective === "escort" && this.exit) {
      const sx = this.exit.x - cam.x, sy = this.exit.y - cam.y;
      ctx.globalAlpha = 0.5 + 0.3 * Math.sin(t * 3); ctx.fillStyle = "#fff3c0";
      ctx.beginPath(); ctx.arc(sx, sy, 30, 0, 6.28); ctx.fill(); ctx.globalAlpha = 1;
    }

    // ground pickups
    // treasure chests (Adventure)
    for (const ch of this.chests) {
      const sx = ch.x - cam.x, sy = ch.y - cam.y, bob = ch.opened ? 0 : Math.sin(ch.bob) * 3;
      D.shadow(sx, sy + 8, 20, 7);
      if (!ch.opened && !((sx + TILE) < 0 || sx - TILE > V.w || (sy + TILE) < 0 || sy - TILE > V.h)) {
        ctx.globalAlpha = 0.5 + 0.3 * Math.sin(t * 4); ctx.fillStyle = "#ffe08a";
        ctx.beginPath(); ctx.arc(sx, sy - 8 + bob, 20, 0, 6.28); ctx.fill(); ctx.globalAlpha = 1;
      }
      // chest body
      ctx.save(); ctx.translate(sx, sy - 6 + bob);
      ctx.fillStyle = ch.opened ? "#6a5230" : "#8a6a3a"; ctx.strokeStyle = "#3a2814"; ctx.lineWidth = 2;
      D.rr(-13, -8, 26, 18, 4); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#c9a06a"; D.rr(-13, -8, 26, 7, 4); ctx.fill();  // lid band
      ctx.fillStyle = "#ffd36b"; ctx.beginPath(); ctx.arc(0, -1, 2.4, 0, 6.28); ctx.fill();  // lock
      if (ch.opened) { ctx.globalAlpha = 0.8; ctx.fillStyle = "#fff3c0"; ctx.font = "12px sans-serif"; ctx.textAlign = "center"; ctx.fillText("✓", 0, 3); ctx.globalAlpha = 1; }
      ctx.restore();
    }
    for (const pt of this.potions) { const sx = pt.x - cam.x, sy = pt.y - cam.y; D.shadow(sx, sy, 26, 10);
      const pm = M.misc.potion, ph = 52, pw = pm.w * ph / pm.h, bob = Math.sin(pt.bob) * 4;
      const im = NAP.img("potion.png"); if (im) ctx.drawImage(im, sx - pw / 2, sy - ph - 6 + bob, pw, ph); }
    // XP fragments — bright deep-neon-pink gems that glow
    for (const fr of this.fragments) {
      const sx = fr.x - cam.x, sy = fr.y - cam.y - 20 + Math.sin(fr.bob) * 4;
      const pulse = 0.6 + 0.4 * Math.sin(t * 4 + fr.bob);
      ctx.save(); ctx.translate(sx, sy);
      // outer glow
      ctx.globalCompositeOperation = "lighter";
      const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 30);
      g.addColorStop(0, "rgba(255,45,149," + (0.55 * pulse) + ")");
      g.addColorStop(1, "rgba(255,45,149,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 30, 0, 6.28); ctx.fill();
      ctx.globalCompositeOperation = "source-over";
      // gem
      ctx.rotate(t * 1.2);
      ctx.fillStyle = "#ff2d95"; ctx.strokeStyle = "#ffd0ea"; ctx.lineWidth = 2;
      ctx.beginPath(); for (let i = 0; i < 4; i++) { const a = i / 4 * 6.28; ctx.lineTo(Math.cos(a) * 12, Math.sin(a) * 13); }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // bright core
      ctx.fillStyle = "#ffe3f2"; ctx.beginPath(); ctx.arc(0, 0, 3.5, 0, 6.28); ctx.fill();
      ctx.restore();
    }
    // food pickup (chosen snack) + rift treats
    const drawFood = (item) => {
      const fm = M.misc.foods[item.type], im = NAP.img(fm.file);
      const sx = item.x - cam.x, sy = item.y - cam.y, bob = Math.sin(item.bob) * 4;
      D.shadow(sx, sy, 24, 9);
      ctx.globalAlpha = 0.45 + 0.2 * Math.sin(t * 4); ctx.fillStyle = "#fff3c0";
      ctx.beginPath(); ctx.arc(sx, sy - 24 + bob, 22, 0, 6.28); ctx.fill(); ctx.globalAlpha = 1;
      const fh = 46, fw = fm.w * fh / fm.h;
      if (im) ctx.drawImage(im, sx - fw / 2, sy - fh - 4 + bob, fw, fh);
    };
    if (this.foodItem) drawFood(this.foodItem);
    for (const tr of this.treats) drawFood(tr);

    // depth-sorted actors (player, enemies, buddy)
    const actors = [{ k: "p", y: this.player.y }];
    for (const en of this.enemies) actors.push({ k: "e", e: en, y: en.y });
    if (this.buddy) actors.push({ k: "b", y: this.buddy.y });
    actors.sort((a, b) => a.y - b.y);
    for (const ac of actors) {
      if (ac.k === "p") this.drawPlayer(ctx, cam);
      else if (ac.k === "e") this.drawEnemy(ctx, cam, ac.e);
      else this.drawBuddy(ctx, cam);
    }
    for (const m of this.minions) this.drawMinion(ctx, cam, m);

    // Excited! chain-lightning arcs
    for (const z of this.zaps) {
      const a = U.clamp(1 - z.t / z.life, 0, 1);
      const x1 = z.x1 - cam.x, y1 = z.y1 - cam.y, x2 = z.x2 - cam.x, y2 = z.y2 - cam.y;
      ctx.save(); ctx.lineCap = "round";
      ctx.globalAlpha = a * 0.4; ctx.strokeStyle = z.glow || "#ff5bd0"; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.globalAlpha = a; ctx.strokeStyle = z.c || "#ffd0f4"; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(x1, y1);
      for (let i = 1; i < 4; i++) { const f = i / 4; ctx.lineTo(x1 + (x2 - x1) * f + (Math.random() - .5) * 12, y1 + (y2 - y1) * f + (Math.random() - .5) * 12); }
      ctx.lineTo(x2, y2); ctx.stroke(); ctx.restore();
    }
    ctx.globalAlpha = 1;

    // projectiles
    for (const pr of this.projectiles) { const sx = pr.x - cam.x, sy = pr.y - cam.y;
      ctx.fillStyle = "rgba(176,107,216,0.35)"; ctx.beginPath(); ctx.arc(sx, sy, pr.r + 5, 0, 6.28); ctx.fill();
      ctx.fillStyle = "#c98be0"; ctx.beginPath(); ctx.arc(sx, sy, pr.r, 0, 6.28); ctx.fill(); }

    // particles
    for (const pt of this.particles) { const sx = pt.x - cam.x, sy = pt.y - cam.y;
      const a = U.clamp(1 - pt.t / pt.life, 0, 1);
      if (pt.ring) {
        ctx.globalAlpha = a; ctx.strokeStyle = pt.c; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(sx, sy, U.lerp(pt.r0, pt.r1, pt.t / pt.life), 0, 6.28); ctx.stroke();
      } else {
        ctx.globalAlpha = a; ctx.fillStyle = pt.c;
        if (pt.heart) D.heart(sx, sy, pt.r); else { ctx.beginPath(); ctx.arc(sx, sy, pt.r, 0, 6.28); ctx.fill(); }
      }
    }
    ctx.globalAlpha = 1;

    // floating damage / xp popups
    ctx.textAlign = "center";
    for (const q of this.popups) {
      const sx = q.x - cam.x, sy = q.y - cam.y;
      ctx.globalAlpha = U.clamp(1 - q.t / q.life, 0, 1);
      ctx.font = "bold " + (q.big ? 24 : 18) + "px 'Trebuchet MS',sans-serif";
      ctx.lineWidth = 3; ctx.strokeStyle = "rgba(10,6,22,0.85)";
      ctx.strokeText(q.text, sx, sy); ctx.fillStyle = q.color; ctx.fillText(q.text, sx, sy);
    }
    ctx.globalAlpha = 1; ctx.textAlign = "left";

    // boss power-up flash (purple)
    if (this.bossFlash > 0) {
      ctx.fillStyle = "rgba(168,59,208," + (this.bossFlash * 0.5) + ")"; ctx.fillRect(0, 0, V.w, V.h);
    }
    this.drawHUD(ctx);
    if (this.outcome) { ctx.fillStyle = "rgba(10,6,22," + U.clamp(this.outcomeT, 0, 0.5) + ")"; ctx.fillRect(0, 0, V.w, V.h); }
    if (this.outcome === "riftclear" || this.outcome === "riftlose") this.drawRiftOverlay(ctx);
  },

  drawRiftOverlay(ctx) {
    const V = NAP.view, t = this.time, pop = U.ease.out(U.clamp(this.outcomeT * 2.5, 0, 1));
    ctx.textAlign = "center";
    if (this.outcome === "riftclear") {
      ctx.save(); ctx.translate(V.w / 2, V.h * 0.34); ctx.scale(pop, pop);
      ctx.fillStyle = "#c8b0ff"; ctx.font = "bold 46px 'Trebuchet MS',sans-serif";
      ctx.fillText("Depth " + this.depth + " Cleared", 0, 0);
      ctx.restore();
      ctx.fillStyle = "#eae2ff"; ctx.font = "18px 'Trebuchet MS',sans-serif";
      ctx.fillText("Descend for a tougher dream and more XP — or wake to keep what you earned.", V.w / 2, V.h * 0.34 + 40);
      const mx = NAP.input.mouse.x, my = NAP.input.mouse.y;
      for (const b of this.riftButtons) {
        const hot = mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h;
        const descend = b.label.indexOf("Descend") === 0;
        ctx.fillStyle = hot ? "rgba(155,107,255,0.35)" : "rgba(40,26,64,0.95)";
        D.rr(b.x, b.y, b.w, b.h, 12); ctx.fill();
        ctx.strokeStyle = hot ? (descend ? "#c8b0ff" : "#a8e6cf") : "rgba(255,255,255,0.2)"; ctx.lineWidth = 2;
        D.rr(b.x, b.y, b.w, b.h, 12); ctx.stroke();
        ctx.fillStyle = "#fff"; ctx.font = "bold 18px 'Trebuchet MS',sans-serif";
        ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 6);
      }
    } else {
      ctx.save(); ctx.translate(V.w / 2, V.h * 0.4); ctx.scale(pop, pop);
      ctx.fillStyle = "#ff8fb0"; ctx.font = "bold 44px 'Trebuchet MS',sans-serif";
      ctx.fillText("You Woke With a Gasp", 0, 0);
      ctx.restore();
      ctx.fillStyle = "#eae2ff"; ctx.font = "20px 'Trebuchet MS',sans-serif";
      ctx.fillText("Deepest depth cleared: " + Math.max(0, this.depth - 1), V.w / 2, V.h * 0.4 + 42);
      ctx.globalAlpha = 0.5 + 0.4 * Math.sin(t * 4);
      ctx.fillStyle = "#fff"; ctx.font = "16px 'Trebuchet MS',sans-serif";
      ctx.fillText("click to wake up", V.w / 2, V.h * 0.4 + 78); ctx.globalAlpha = 1;
    }
    ctx.textAlign = "left";
  },

  drawPlayer(ctx, cam) {
    const p = this.player, scale = PLAYER_H / M.storeBody, sx = p.x - cam.x;
    // Beek's Sploosh hop: parabolic lift, shadow shrinks as she rises
    let hop = 0;
    if (p.hopDur > 0) hop = Math.sin(Math.PI * U.clamp(p.hopT / p.hopDur, 0, 1)) * (p.hopH || 50);
    const sy = p.y - cam.y - hop;
    D.shadow(sx, p.y - cam.y, 24 * (1 - Math.min(0.55, hop / 120)), 9 * (1 - Math.min(0.55, hop / 120)));
    // Oni Mode aura
    if (p.form > 0) {
      ctx.save(); ctx.globalAlpha = 0.28 + 0.12 * Math.sin(this.time * 8);
      ctx.fillStyle = "#a83bd0"; ctx.beginPath();
      ctx.ellipse(sx, sy - PLAYER_H * 0.35, PLAYER_H * 0.34, PLAYER_H * 0.44, 0, 0, 6.28); ctx.fill(); ctx.restore();
    }
    // attack-arc telegraph (behind the sprite so the character stays readable)
    if (p.attacking) {
      const f = U.clamp(p.atkT / ATTACK_TIME, 0, 1), fade = Math.sin(Math.PI * f);
      const ang = p.dir === "down" ? Math.PI / 2 : p.dir === "up" ? -Math.PI / 2 : p.dir === "left" ? Math.PI : 0;
      const cx = sx + Math.cos(ang) * 18, cy = sy - 22 + Math.sin(ang) * 18, r = PLAYER_REACH * 0.6, spread = 0.95;
      const lead = ang - spread + 2 * spread * f;
      const arcC = (this.element && this.element.color) || "#ffffff";
      const arcS = (this.element && this.element.spark) || "#ffe3f6";
      ctx.save(); ctx.lineCap = "round";
      ctx.globalAlpha = 0.35 * fade; ctx.strokeStyle = arcC; ctx.lineWidth = 7;
      ctx.beginPath(); ctx.arc(cx, cy, r, ang - spread, ang + spread); ctx.stroke();
      ctx.globalAlpha = 0.9 * fade; ctx.strokeStyle = arcS; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(cx, cy, r, lead - 0.14, lead + 0.14); ctx.stroke();
      ctx.restore(); ctx.globalAlpha = 1;
    }
    const a = this.playerAnim();
    let alpha = 1;
    if (p.hurtT > 0 && Math.floor(p.hurtT * 20) % 2 === 0) alpha = 0.55;
    NAP.drawSprite(a.file, a.meta, sx, sy, scale, a.flip, alpha);
    const headY = sy - this.pMeta.idle_down.canvasH * scale + 2;
    D.bar(sx - 24, headY, 48, 6, p.hp / p.maxhp, "#8dffb0");
  },
  drawEnemy(ctx, cam, en) {
    const scale = en.h / M.storeBody, sx = en.x - cam.x, sy = en.y - cam.y;
    if (!en.dying) D.shadow(sx, sy, en.isBoss ? 34 : 22, en.isBoss ? 12 : 8);
    const a = this.enemyAnim(en);
    let alpha = 1;
    if (en.dying) alpha = U.clamp(1 - (en.deathT / this.deathDur(en)) * 0.9, 0.1, 1);
    if (en.hurtT > 0 && Math.floor(en.hurtT * 30) % 2 === 0) alpha *= 0.5;
    if (en.isBoss && !en.dying) {  // menacing aura (brighter/redder in phase 2)
      const p2 = en.phase === 2;
      ctx.save(); ctx.globalAlpha = (p2 ? 0.34 : 0.25) + 0.12 * Math.sin(this.time * (p2 ? 7 : 4));
      ctx.fillStyle = p2 ? "#a83bd0" : "#7a3bb0";
      ctx.beginPath(); ctx.ellipse(sx, sy - en.h * 0.35, en.h * 0.34, en.h * 0.42, 0, 0, 6.28); ctx.fill();
      ctx.restore();
      // nova charge telegraph: contracting warning rings
      if (en.novaCharge > 0) {
        const cyy = sy - en.h * 0.4, f = 1 - en.novaCharge / NOVA_CHARGE;
        ctx.save(); ctx.globalAlpha = 0.8;
        ctx.strokeStyle = "#ff5bd0"; ctx.lineWidth = 4;
        for (let k = 0; k < 2; k++) {
          const rr = 90 * (1 - ((f + k * 0.5) % 1));
          ctx.beginPath(); ctx.arc(sx, cyy, Math.max(2, rr), 0, 6.28); ctx.stroke();
        }
        ctx.restore();
      }
    }
    const pop = en.hitPop ? 1 + 0.16 * en.hitPop : 1;
    NAP.drawSprite(a.file, a.meta, sx, sy, scale * pop, a.flip, alpha);
    if (!en.dying && !en.isBoss) {
      const headY = sy - (M.foes[en.foe] || this.eMeta).idle.canvasH * scale + 2;
      D.bar(sx - 24, headY, 48, 6, en.hp / en.maxhp, "#ff6b8a");
    }
  },
  drawBuddy(ctx, cam) {
    const b = this.buddy, sx = b.x - cam.x, sy = b.y - cam.y + Math.sin(b.bob) * 4;
    D.shadow(sx, sy + 14, 16, 6);
    if (this.buddyType === "teddy") this.drawTeddy(ctx, sx, sy);
    else if (this.buddyType === "glorp") this.drawGlorp(ctx, sx, sy);
    else if (this.buddyType === "glorpcat") this.drawGlorpCat(ctx, sx, sy);
    else if (this.buddyType === "orca") this.drawOrca(ctx, sx, sy);
    else if (this.buddyType === "leech" && M.allies && M.allies.leech) {
      const A = M.allies.leech; NAP.drawSprite(A.idle.files[0], A.idle, sx, sy + 14, 50 / M.storeBody, b.flip, 1);
    }
    else this.drawCloud(ctx, sx, sy);
  },
  drawOrca(ctx, sx, sy) {
    const blk = "#2a2f38", wht = "#f4f8ff", blue = "#8fd3ff";
    // light-blue spout
    ctx.fillStyle = blue; ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.arc(sx, sy - 20, 2, 0, 6.28); ctx.arc(sx - 3, sy - 17, 1.6, 0, 6.28); ctx.arc(sx + 3, sy - 17, 1.6, 0, 6.28); ctx.fill(); ctx.globalAlpha = 1;
    // dorsal fin + flippers + body
    ctx.fillStyle = blk;
    ctx.beginPath(); ctx.moveTo(sx - 4, sy - 8); ctx.lineTo(sx, sy - 17); ctx.lineTo(sx + 4, sy - 8); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.ellipse(sx - 12, sy + 5, 4, 6, 0.5, 0, 6.28); ctx.fill();
    ctx.beginPath(); ctx.ellipse(sx + 12, sy + 5, 4, 6, -0.5, 0, 6.28); ctx.fill();
    ctx.beginPath(); ctx.ellipse(sx, sy + 3, 13, 12, 0, 0, 6.28); ctx.fill();
    // white belly + eye patches
    ctx.fillStyle = wht; ctx.beginPath(); ctx.ellipse(sx, sy + 7, 8, 6, 0, 0, 6.28); ctx.fill();
    ctx.beginPath(); ctx.ellipse(sx - 4.5, sy - 2, 3, 2.4, 0.2, 0, 6.28); ctx.fill();
    ctx.beginPath(); ctx.ellipse(sx + 4.5, sy - 2, 3, 2.4, -0.2, 0, 6.28); ctx.fill();
    // eyes + smile
    ctx.fillStyle = blk; ctx.beginPath(); ctx.arc(sx - 4.5, sy - 2, 1.5, 0, 6.28); ctx.arc(sx + 4.5, sy - 2, 1.5, 0, 6.28); ctx.fill();
    ctx.fillStyle = wht; ctx.beginPath(); ctx.arc(sx - 5, sy - 2.6, 0.6, 0, 6.28); ctx.arc(sx + 4, sy - 2.6, 0.6, 0, 6.28); ctx.fill();
    ctx.strokeStyle = "#3a2a30"; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(sx, sy + 2, 3, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
  },
  drawCloud(ctx, sx, sy) {
    ctx.fillStyle = "#f2ecff";
    ctx.beginPath(); ctx.arc(sx - 8, sy, 11, 0, 6.28); ctx.arc(sx + 8, sy, 11, 0, 6.28); ctx.arc(sx, sy - 8, 13, 0, 6.28); ctx.arc(sx, sy + 4, 14, 0, 6.28); ctx.fill();
    ctx.fillStyle = "#5b4a7a"; ctx.beginPath(); ctx.arc(sx - 5, sy - 2, 1.8, 0, 6.28); ctx.arc(sx + 5, sy - 2, 1.8, 0, 6.28); ctx.fill();
    ctx.fillStyle = "#ffb0cf"; ctx.globalAlpha = .6; ctx.beginPath(); ctx.arc(sx - 8, sy + 2, 2.4, 0, 6.28); ctx.arc(sx + 8, sy + 2, 2.4, 0, 6.28); ctx.fill(); ctx.globalAlpha = 1;
  },
  drawTeddy(ctx, sx, sy) {
    const brown = "#8a6a44", tan = "#c9a06a", dk = "#3a2814";
    ctx.strokeStyle = dk; ctx.lineWidth = 1.5;
    // limbs + body
    ctx.fillStyle = brown;
    for (const [dx, dy, r] of [[-11, 5, 5], [11, 5, 5], [-6, 15, 5], [6, 15, 5]]) { ctx.beginPath(); ctx.arc(sx + dx, sy + dy, r, 0, 6.28); ctx.fill(); }
    ctx.beginPath(); ctx.ellipse(sx, sy + 6, 12, 11, 0, 0, 6.28); ctx.fill();
    // ears
    for (const dx of [-8, 8]) { ctx.fillStyle = brown; ctx.beginPath(); ctx.arc(sx + dx, sy - 15, 5, 0, 6.28); ctx.fill(); ctx.fillStyle = tan; ctx.beginPath(); ctx.arc(sx + dx, sy - 15, 2.4, 0, 6.28); ctx.fill(); }
    // head + muzzle
    ctx.fillStyle = brown; ctx.beginPath(); ctx.arc(sx, sy - 8, 11, 0, 6.28); ctx.fill();
    ctx.fillStyle = tan; ctx.beginPath(); ctx.ellipse(sx, sy - 5, 6, 4.5, 0, 0, 6.28); ctx.fill();
    ctx.fillStyle = dk; ctx.beginPath(); ctx.arc(sx, sy - 7, 1.8, 0, 6.28); ctx.fill();
    // x-eyes
    ctx.strokeStyle = dk; ctx.lineWidth = 1.6; ctx.lineCap = "round";
    for (const ex of [-4.5, 4.5]) { ctx.beginPath(); ctx.moveTo(sx + ex - 2, sy - 11); ctx.lineTo(sx + ex + 2, sy - 7); ctx.moveTo(sx + ex + 2, sy - 11); ctx.lineTo(sx + ex - 2, sy - 7); ctx.stroke(); }
    // little bow
    ctx.fillStyle = "#c0446a"; ctx.beginPath(); ctx.moveTo(sx, sy + 1); ctx.lineTo(sx - 6, sy - 2); ctx.lineTo(sx - 6, sy + 4); ctx.closePath(); ctx.moveTo(sx, sy + 1); ctx.lineTo(sx + 6, sy - 2); ctx.lineTo(sx + 6, sy + 4); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(sx, sy + 1, 1.8, 0, 6.28); ctx.fill();
  },
  drawGlorpCat(ctx, sx, sy) {
    // IMQ's green glorp cat: green alien kitty with antennae + big violet eyes
    const green = "#5fd36a", drk = "#2e7a3a", eye = "#3a2a7c";
    ctx.lineCap = "round";
    // antennae with glowy tips
    ctx.strokeStyle = green; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(sx - 4, sy - 14); ctx.lineTo(sx - 6, sy - 22);
    ctx.moveTo(sx + 4, sy - 14); ctx.lineTo(sx + 6, sy - 22); ctx.stroke();
    ctx.fillStyle = "#c8ffd0"; ctx.beginPath(); ctx.arc(sx - 6, sy - 23, 2.4, 0, 6.28); ctx.arc(sx + 6, sy - 23, 2.4, 0, 6.28); ctx.fill();
    // tail
    ctx.strokeStyle = green; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(sx + 11, sy + 8); ctx.quadraticCurveTo(sx + 20, sy + 4, sx + 17, sy - 6); ctx.stroke();
    // cat ears
    ctx.fillStyle = green;
    ctx.beginPath(); ctx.moveTo(sx - 11, sy - 12); ctx.lineTo(sx - 6, sy - 20); ctx.lineTo(sx - 3, sy - 12); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(sx + 11, sy - 12); ctx.lineTo(sx + 6, sy - 20); ctx.lineTo(sx + 3, sy - 12); ctx.closePath(); ctx.fill();
    ctx.fillStyle = drk; ctx.beginPath(); ctx.moveTo(sx - 8, sy - 13); ctx.lineTo(sx - 6, sy - 17); ctx.lineTo(sx - 4.5, sy - 13); ctx.closePath();
    ctx.moveTo(sx + 8, sy - 13); ctx.lineTo(sx + 6, sy - 17); ctx.lineTo(sx + 4.5, sy - 13); ctx.closePath(); ctx.fill();
    // paws + body + head
    ctx.fillStyle = green;
    ctx.beginPath(); ctx.arc(sx - 9, sy + 10, 3.5, 0, 6.28); ctx.arc(sx + 9, sy + 10, 3.5, 0, 6.28); ctx.fill();
    ctx.beginPath(); ctx.ellipse(sx, sy + 6, 11, 10, 0, 0, 6.28); ctx.fill();
    ctx.beginPath(); ctx.arc(sx, sy - 6, 10, 0, 6.28); ctx.fill();
    // big violet almond eyes + shine
    ctx.fillStyle = eye;
    for (const s of [-1, 1]) { ctx.save(); ctx.translate(sx + s * 4.2, sy - 6); ctx.rotate(s * 0.3); ctx.beginPath(); ctx.ellipse(0, 0, 3, 4.2, 0, 0, 6.28); ctx.fill(); ctx.restore(); }
    ctx.fillStyle = "#dce6ff"; ctx.beginPath(); ctx.arc(sx - 5, sy - 8, 1, 0, 6.28); ctx.arc(sx + 3.4, sy - 8, 1, 0, 6.28); ctx.fill();
    // pink nose + whiskers
    ctx.fillStyle = "#ff9ecf"; ctx.beginPath(); ctx.arc(sx, sy - 2, 1.4, 0, 6.28); ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.6)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(sx - 3, sy - 1); ctx.lineTo(sx - 10, sy - 2); ctx.moveTo(sx + 3, sy - 1); ctx.lineTo(sx + 10, sy - 2); ctx.stroke();
    // belly spot
    ctx.fillStyle = "#c8ffd0"; ctx.globalAlpha = 0.7; ctx.beginPath(); ctx.ellipse(sx, sy + 8, 5, 5, 0, 0, 6.28); ctx.fill(); ctx.globalAlpha = 1;
  },
  drawGlorp(ctx, sx, sy) {
    // pink alien-bear plush: antennae, big blue eyes, purple nose/feet
    const pink = "#e83cc0", eye = "#2b2a7c", purp = "#5a2a9a";
    ctx.lineCap = "round";
    // antennae
    ctx.strokeStyle = pink; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(sx - 4, sy - 15); ctx.lineTo(sx - 6, sy - 23);
    ctx.moveTo(sx + 4, sy - 15); ctx.lineTo(sx + 6, sy - 23); ctx.stroke();
    ctx.fillStyle = pink; ctx.beginPath(); ctx.arc(sx - 6, sy - 24, 2.6, 0, 6.28); ctx.arc(sx + 6, sy - 24, 2.6, 0, 6.28); ctx.fill();
    // ears, arms, body
    ctx.beginPath(); ctx.arc(sx - 8, sy - 13, 4.5, 0, 6.28); ctx.arc(sx + 8, sy - 13, 4.5, 0, 6.28); ctx.fill();
    ctx.beginPath(); ctx.arc(sx - 11, sy + 3, 4, 0, 6.28); ctx.arc(sx + 11, sy + 3, 4, 0, 6.28); ctx.fill();
    ctx.beginPath(); ctx.ellipse(sx, sy + 5, 12, 11, 0, 0, 6.28); ctx.fill();
    // purple foot pads
    ctx.fillStyle = purp;
    ctx.beginPath(); ctx.ellipse(sx - 6, sy + 14, 4.5, 3, 0, 0, 6.28); ctx.fill();
    ctx.beginPath(); ctx.ellipse(sx + 6, sy + 14, 4.5, 3, 0, 0, 6.28); ctx.fill();
    // head
    ctx.fillStyle = pink; ctx.beginPath(); ctx.arc(sx, sy - 6, 11, 0, 6.28); ctx.fill();
    // big angled blue eyes + highlights
    ctx.fillStyle = eye;
    for (const s of [-1, 1]) { ctx.save(); ctx.translate(sx + s * 4.5, sy - 7); ctx.rotate(s * 0.35); ctx.beginPath(); ctx.ellipse(0, 0, 3.2, 4.4, 0, 0, 6.28); ctx.fill(); ctx.restore(); }
    ctx.fillStyle = "#cfe0ff"; ctx.beginPath(); ctx.arc(sx - 5.5, sy - 9, 1, 0, 6.28); ctx.arc(sx + 3.5, sy - 9, 1, 0, 6.28); ctx.fill();
    // nose + smile
    ctx.fillStyle = purp; ctx.beginPath(); ctx.arc(sx, sy - 3, 1.8, 0, 6.28); ctx.fill();
    ctx.strokeStyle = "#7a2a6a"; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(sx, sy - 2, 3, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
  },

  drawHUD(ctx) {
    const V = NAP.view, p = this.player;
    // HP + XP panel
    ctx.fillStyle = "rgba(25,15,45,0.62)"; D.rr(14, 14, 210, 80, 12); ctx.fill();
    // level badge (per character)
    const cp = this.charProg, maxed = cp.level >= NAP.MAX_LEVEL;
    ctx.fillStyle = "#ffe08a"; ctx.font = "bold 13px 'Trebuchet MS',sans-serif"; ctx.textAlign = "left";
    ctx.fillText("LV " + cp.level, 26, 32);
    ctx.fillStyle = "#ffd9ec"; ctx.fillText("♥ HEALTH", 78, 32);
    D.bar(26, 40, 184, 13, p.hp / p.maxhp, "#ff5f8f");
    // xp bar
    const xpFrac = maxed ? 1 : cp.xp / NAP.xpToNext(cp.level);
    D.bar(26, 74, 184, 7, xpFrac, "#ff2d95");
    ctx.fillStyle = "rgba(255,255,255,0.75)"; ctx.font = "9px sans-serif"; ctx.textAlign = "right";
    ctx.fillText(maxed ? "MAX" : (cp.xp + " / " + NAP.xpToNext(cp.level) + " xp"), 210, 71);
    ctx.fillStyle = "#fff"; ctx.font = "bold 11px sans-serif"; ctx.textAlign = "center";
    ctx.fillText(Math.max(0, Math.ceil(p.hp)) + " / " + p.maxhp, 118, 51);

    // signature-active chip (F key + cooldown)
    if (this.active) {
      const bx = 14, by = 100, bw = 210, bh = 40, ready = this.activeCd <= 0;
      ctx.fillStyle = "rgba(25,15,45,0.62)"; D.rr(bx, by, bw, bh, 10); ctx.fill();
      ctx.fillStyle = ready ? "#a8e6cf" : "rgba(255,255,255,0.22)"; D.rr(bx + 6, by + 6, 28, 28, 7); ctx.fill();
      ctx.fillStyle = ready ? "#173a28" : "#fff"; ctx.font = "bold 15px sans-serif"; ctx.textAlign = "center";
      ctx.fillText("⇧", bx + 20, by + 27);
      ctx.textAlign = "left"; ctx.fillStyle = ready ? "#fff" : "rgba(255,255,255,0.6)"; ctx.font = "bold 13px 'Trebuchet MS',sans-serif";
      ctx.fillText(this.active.name, bx + 44, by + 17);
      D.bar(bx + 44, by + 24, bw - 58, 8, ready ? 1 : 1 - this.activeCd / this.activeMax, ready ? "#8dffb0" : "#c98be0");
      if (!ready) { ctx.fillStyle = "rgba(255,255,255,0.8)"; ctx.font = "11px sans-serif"; ctx.textAlign = "right"; ctx.fillText(Math.ceil(this.activeCd) + "s", bx + bw - 8, by + 17); }
      ctx.textAlign = "left";
    }

    // active food buff indicator (icon + shrinking timer)
    if (p.buff.kind && p.buff.t > 0 && this.food) {
      const fm = M.misc.foods[this.food], im = NAP.img(fm.file);
      const bx = 232, by = 20;
      ctx.fillStyle = "rgba(25,15,45,0.6)"; D.rr(bx, by, 46, 46, 10); ctx.fill();
      const ih = 30, iw = fm.w * ih / fm.h;
      if (im) ctx.drawImage(im, bx + 23 - iw / 2, by + 4, iw, ih);
      D.bar(bx + 6, by + 37, 34, 5, p.buff.t / 8, "#c8f7d4");
    }

    // Adventure: bounty checklist (top-right) + wake hint
    if (this.adventure && this.bounties) {
      ctx.textAlign = "left";
      const bx = V.w - 244, bw = 230, bh = 26 + this.bounties.length * 22;
      ctx.fillStyle = "rgba(25,15,45,0.66)"; D.rr(bx, 14, bw, bh, 12); ctx.fill();
      ctx.fillStyle = this.advCleared ? "#8dffb0" : "#ffe08a"; ctx.font = "bold 14px 'Trebuchet MS',sans-serif";
      ctx.fillText(this.advCleared ? "★ Bounties Cleared!" : "Bounties", bx + 14, 34);
      let ly = 52;
      for (const b of this.bounties) {
        ctx.fillStyle = b.done ? "#8dffb0" : "rgba(255,255,255,0.85)"; ctx.font = "12px 'Trebuchet MS',sans-serif";
        const mark = b.done ? "✓ " : "○ ";
        const prog = b.need > 1 ? "  (" + b.have + "/" + b.need + ")" : "";
        ctx.fillText(mark + b.label + prog, bx + 14, ly); ly += 22;
      }
      ctx.textAlign = "right"; ctx.fillStyle = "rgba(255,255,255,0.6)"; ctx.font = "11px 'Trebuchet MS',sans-serif";
      ctx.fillText("press E / Start to wake", V.w - 14, 14 + bh + 16); ctx.textAlign = "left";
    }

    // objective tracker (top-right) — non-adventure modes
    if (!this.adventure) {
      const o = this.cfg.objective, def = this.cfg.objDef;
      let sub = "";
      if (o === "defeat") sub = this.boss ? "Nightmare lives" : (this.enemies.length ? this.enemies.length + " wisps left" : "clear!");
      else if (o === "survive") sub = this.waveClearing ? "wave " + (this.wave + 1) + " incoming…" : "wave " + this.wave + " / " + this.waves;
      else if (o === "collect") sub = (this.fragTotal - this.fragments.length) + " / " + this.fragTotal;
      else if (o === "escort") sub = "guide the buddy";
      else if (o === "rift") sub = "Depth " + this.depth + (this.riftGuardianSpawned ? " · GUARDIAN" : " · " + Math.round(this.riftProgress * 100) + "%");
      ctx.textAlign = "right";
      const label = def.label + "  ·  " + sub;
      ctx.font = "bold 14px 'Trebuchet MS',sans-serif";
      const pw = ctx.measureText(label).width + 28;
      ctx.fillStyle = "rgba(25,15,45,0.6)"; D.rr(V.w - 14 - pw, 14, pw, 34, 12); ctx.fill();
      ctx.fillStyle = "#d9c8ff"; ctx.fillText(label, V.w - 28, 36);
    }

    // boss health bar(s) (bottom center, stacked upward for multi-boss finales)
    const liveBosses = (this.bosses || []).filter(b => !b.dying);
    let bby = V.h - 30;
    for (let i = 0; i < liveBosses.length; i++) {
      const b = liveBosses[i], bw = Math.min(420, V.w - 80), bx = (V.w - bw) / 2;
      const p2 = b.phase === 2;
      ctx.textAlign = "center"; ctx.fillStyle = p2 ? "#ff8be0" : "#e0b0ff"; ctx.font = "bold 13px 'Trebuchet MS',sans-serif";
      ctx.fillText((b.bossName || this.bossName) + (p2 ? "   ✦ ENRAGED ✦" : ""), V.w / 2, bby - 8);
      D.bar(bx, bby, bw, 12, b.hp / b.maxhp, p2 ? "#ff3bb0" : "#a24bd8");
      bby -= 36;
    }

    // rift descent meter (bottom center, before the guardian appears)
    if (this.isRift && !this.riftGuardianSpawned && !this.outcome) {
      const bw = Math.min(420, V.w - 80), bx = (V.w - bw) / 2, by = V.h - 30;
      ctx.textAlign = "center"; ctx.fillStyle = "#c8b0ff"; ctx.font = "bold 13px 'Trebuchet MS',sans-serif";
      ctx.fillText("DESCENT · DEPTH " + this.depth, V.w / 2, by - 8);
      D.bar(bx, by, bw, 12, this.riftProgress, "#9b6bff");
    }

    // objective banner (fades in first seconds)
    if (this.bannerT > 0) {
      ctx.globalAlpha = U.clamp(this.bannerT, 0, 1) * (this.bannerT > 2.2 ? (3.2 - this.bannerT) / 1 : 1);
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(10,6,22,0.6)"; ctx.fillRect(0, V.h * 0.28, V.w, 92);
      if (this.cfg.title) {
        ctx.fillStyle = this.char && this.char.accent ? "#c8f7d4" : "#c8f7d4";
        ctx.font = "bold 15px 'Trebuchet MS',sans-serif";
        ctx.fillText(this.cfg.title.toUpperCase(), V.w / 2, V.h * 0.28 + 30);
      }
      ctx.fillStyle = "#fff"; ctx.font = "italic 26px 'Trebuchet MS',sans-serif";
      ctx.fillText((this.cfg.objDef && this.cfg.objDef.banner) || "", V.w / 2, V.h * 0.28 + 62);
      ctx.globalAlpha = 1;
    }

    // level-up flash
    if (this.levelFlash > 0) {
      const f = this.levelFlash;
      const pop = U.ease.out(U.clamp((1.8 - f) * 3, 0, 1));
      ctx.save(); ctx.textAlign = "center";
      ctx.globalAlpha = U.clamp(f, 0, 1);
      ctx.translate(V.w / 2, V.h * 0.42); ctx.scale(pop, pop);
      ctx.fillStyle = "#ffe08a"; ctx.font = "bold 40px 'Trebuchet MS',sans-serif";
      ctx.fillText("LEVEL UP!", 0, 0);
      ctx.fillStyle = "#fff"; ctx.font = "bold 18px 'Trebuchet MS',sans-serif";
      ctx.fillText("Lv " + this.charProg.level, 0, 28);
      ctx.restore(); ctx.globalAlpha = 1;
    }
    ctx.textAlign = "left";
  },

  };
})(window.NAP);
