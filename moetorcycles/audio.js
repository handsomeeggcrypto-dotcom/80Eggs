/* ============================================================
   MOEtorcycles — Sound
   All audio is synthesized with the Web Audio API (no files, no
   network). Procedural SFX + a looping synthwave soundtrack.
   Browsers block audio until a user gesture, so call Sound.unlock()
   from the first keydown/pointerdown.
   ============================================================ */
const Sound = (() => {
  let ctx = null;
  let master, musicGain, sfxGain, noiseBuf;
  let unlocked = false;
  let muted = localStorage.getItem("moetorcycles_muted") === "1";

  // ---- music sequencer state ----
  let musicOn = false;
  let timer = null;
  let step = 0;
  let nextNoteTime = 0;
  const BPM = 124;
  const LOOKAHEAD = 0.1;      // seconds scheduled ahead
  const TICK = 25;            // scheduler poll (ms)
  const STEPS = 64;          // 4 bars x 16 sixteenth-notes
  const stepDur = () => 60 / BPM / 4;

  // i–VI–III–VII synthwave loop (Am – F – C – G). bass = root, arp = chord tones.
  const PROG = [
    { bass: 45, arp: [57, 60, 64, 69] }, // Am
    { bass: 41, arp: [53, 57, 60, 65] }, // F
    { bass: 48, arp: [60, 64, 67, 72] }, // C
    { bass: 43, arp: [55, 59, 62, 67] }, // G
  ];

  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  function init() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();  master.gain.value = 0.85;  master.connect(ctx.destination);
    musicGain = ctx.createGain(); musicGain.gain.value = muted ? 0 : 0.32; musicGain.connect(master);
    sfxGain = ctx.createGain();   sfxGain.gain.value = muted ? 0 : 0.6;   sfxGain.connect(master);
    // one reusable white-noise buffer for drums / whooshes
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }

  // ---- low-level voices -------------------------------------------------
  function tone(freq, t, dur, type, peak, dest) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest || sfxGain);
    o.start(t); o.stop(t + dur + 0.02);
    return o;
  }

  function noise(t, dur, peak, filterType, freq, q, dest) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = filterType; f.frequency.value = freq; if (q) f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(dest || sfxGain);
    src.start(t); src.stop(t + dur + 0.02);
    return { src, f, g };
  }

  // ---- music: schedule one 16th-note step ------------------------------
  function scheduleStep(s, t) {
    const bar = Math.floor(s / 16) % PROG.length;
    const sub = s % 16;
    const chord = PROG[bar];

    // arp: a short pluck on every 16th
    const note = chord.arp[sub % chord.arp.length] + (sub >= 8 ? 12 : 0) * 0;
    tone(mtof(note), t, 0.14, "square", 0.10, musicGain);

    // bass on every 8th
    if (sub % 2 === 0) tone(mtof(chord.bass), t, 0.22, "sawtooth", 0.22, musicGain);

    // drums
    if (sub === 0 || sub === 8) {                      // kick
      const k = tone(120, t, 0.16, "sine", 0.9, musicGain);
      k.frequency.setValueAtTime(120, t);
      k.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    }
    if (sub === 4 || sub === 12) noise(t, 0.18, 0.5, "highpass", 1800, 0, musicGain); // snare
    if (sub % 2 === 1) noise(t, 0.04, 0.12, "highpass", 7000, 0, musicGain);          // hat
  }

  function scheduler() {
    if (!ctx) return;
    while (nextNoteTime < ctx.currentTime + LOOKAHEAD) {
      scheduleStep(step, nextNoteTime);
      nextNoteTime += stepDur();
      step = (step + 1) % STEPS;
    }
  }

  function startMusic() {
    if (!ctx || musicOn) return;
    musicOn = true;
    step = 0;
    nextNoteTime = ctx.currentTime + 0.1;
    timer = setInterval(scheduler, TICK);
  }

  // ---- public SFX -------------------------------------------------------
  function guard() { return ctx && unlocked; }

  const api = {
    unlock() {
      if (unlocked) { if (ctx && ctx.state === "suspended") ctx.resume(); return; }
      if (!init()) return;
      unlocked = true;
      if (ctx.state === "suspended") ctx.resume();
      if (!muted) startMusic(); else startMusic(); // music runs; musicGain=0 while muted
    },
    get muted() { return muted; },
    toggleMute() {
      muted = !muted;
      localStorage.setItem("moetorcycles_muted", muted ? "1" : "0");
      if (ctx) {
        const tgtM = muted ? 0 : 0.32, tgtS = muted ? 0 : 0.6, now = ctx.currentTime;
        musicGain.gain.linearRampToValueAtTime(tgtM, now + 0.08);
        sfxGain.gain.linearRampToValueAtTime(tgtS, now + 0.08);
      }
      return muted;
    },

    jump() {
      if (!guard()) return;
      const t = ctx.currentTime;
      const o = tone(300, t, 0.16, "square", 0.28);
      o.frequency.setValueAtTime(300, t);
      o.frequency.exponentialRampToValueAtTime(720, t + 0.12);
    },
    dash() {
      if (!guard()) return;
      const t = ctx.currentTime;
      const n = noise(t, 0.34, 0.45, "bandpass", 800, 1.2);
      n.f.frequency.setValueAtTime(500, t);
      n.f.frequency.exponentialRampToValueAtTime(4500, t + 0.3);
      const o = tone(180, t, 0.34, "sawtooth", 0.18);
      o.frequency.exponentialRampToValueAtTime(680, t + 0.3);
    },
    star(combo = 0) {
      if (!guard()) return;
      const t = ctx.currentTime;
      const base = 76 + Math.min(combo, 12); // pitch climbs with combo
      tone(mtof(base), t, 0.10, "triangle", 0.3);
      tone(mtof(base + 5), t + 0.06, 0.12, "triangle", 0.28);
    },
    smash() {
      if (!guard()) return;
      const t = ctx.currentTime;
      noise(t, 0.22, 0.6, "lowpass", 2200, 0.7);
      const o = tone(160, t, 0.2, "square", 0.35);
      o.frequency.exponentialRampToValueAtTime(60, t + 0.18);
    },
    land() {
      if (!guard()) return;
      const t = ctx.currentTime;
      const o = tone(150, t, 0.12, "sine", 0.3);
      o.frequency.exponentialRampToValueAtTime(80, t + 0.1);
    },
    crash() {
      if (!guard()) return;
      const t = ctx.currentTime;
      const o = tone(400, t, 0.5, "sawtooth", 0.4);
      o.frequency.exponentialRampToValueAtTime(60, t + 0.45);
      noise(t, 0.5, 0.5, "lowpass", 1600, 0.5);
    },
    ui() {
      if (!guard()) return;
      tone(520, ctx.currentTime, 0.08, "square", 0.18);
    },
  };
  return api;
})();
