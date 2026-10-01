'use strict';
// MoeMode — answers "what should I do right now?"
// All data lives in this browser's localStorage (never in the repo). Backup via export/import.

const KEY = 'moemode_v1';
const DAY = 864e5;
const now = () => Date.now();
const uid = () => now().toString(36) + Math.random().toString(36).slice(2, 7);
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

const MAX_ACTIVE = 3;
const XP = { idea: 1, research: 2, plan: 2, progress: 3, task: 10, important: 25, quest: 100 };
const TYPES = { execute: 'Do', research: 'Research', plan: 'Plan' };
const MINUTES = [5, 15, 30, 45, 60, 90];

// ---------- state ----------
function fresh() {
  return {
    version: 1, setupDone: false, mainQuest: '',
    campaigns: ['Income', 'Build & Learn', 'Life'],
    quests: [], tasks: [], ideas: [], dumps: [], sessions: [], events: [], feedback: [], xp: [],
    rec: null, focus: null, lowEnergyUntil: 0, lastBackup: 0,
    settings: { repo: 'handsomeeggcrypto-dotcom/80Eggs' },
    commits: { fetchedAt: 0, list: [] },
  };
}
function load() {
  try { const r = JSON.parse(localStorage.getItem(KEY)); if (r && r.version) return Object.assign(fresh(), r); } catch (e) {}
  return fresh();
}
let S = load();
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('Could not save — storage blocked or full'); } }
function log(type, data) { S.events.push({ t: now(), type, data: data || {} }); }

const quest = id => S.quests.find(q => q.id === id);
const task = id => S.tasks.find(t => t.id === id);
const activeQuests = () => S.quests.filter(q => q.status === 'active');
const liveQuest = q => q && (q.status === 'active' || q.status === 'side');
const openTasks = qid => S.tasks.filter(t => t.questId === qid && t.status === 'open');
const nextAction = q => openTasks(q.id)[0] || null;
const totalXP = () => S.xp.reduce((a, x) => a + x.n, 0);
const levelOf = xp => Math.floor(Math.sqrt(xp / 50)) + 1;
const xpForLevel = l => 50 * (l - 1) * (l - 1);
function addXP(n, why) { S.xp.push({ t: now(), n, why }); }

function today() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function dayDiff(ymd) { const [y, m, d] = ymd.split('-').map(Number); const a = new Date(y, m - 1, d); const b = new Date(); b.setHours(0, 0, 0, 0); return Math.round((a - b) / DAY); }
const daysSince = t => Math.floor((now() - t) / DAY);
function ago(t) { const m = Math.round((now() - t) / 60000); if (m < 1) return 'just now'; if (m < 60) return m + 'm ago'; const h = Math.round(m / 60); if (h < 24) return h + 'h ago'; return plural(Math.round(h / 24), 'day') + ' ago'; }

// ---------- git commits (the repo is public, so this works on any device) ----------
async function refreshCommits(force) {
  if (!force && now() - S.commits.fetchedAt < 30 * 60e3) return false;
  const since = new Date(now() - 90 * DAY).toISOString();
  try {
    const r = await fetch(`https://api.github.com/repos/${S.settings.repo}/commits?per_page=100&since=${since}`);
    if (!r.ok) return false;
    const j = await r.json();
    S.commits = { fetchedAt: now(), list: j.map(x => ({ sha: x.sha, msg: (x.commit.message || '').split('\n')[0], t: Date.parse(x.commit.author.date) })) };
    save(); return true;
  } catch (e) { return false; }
}
function prefixOf(msg) { const i = msg.indexOf(':'); return i > 0 && i < 32 ? msg.slice(0, i).trim() : null; }
function commitsFor(q) {
  if (!q.prefix) return [];
  const p = q.prefix.toLowerCase();
  return S.commits.list.filter(c => c.msg.toLowerCase().startsWith(p));
}
function detectedProjects() {
  const m = {};
  for (const c of S.commits.list) {
    const p = prefixOf(c.msg); if (!p) continue;
    (m[p] = m[p] || { name: p, n: 0, last: 0 }); m[p].n++; m[p].last = Math.max(m[p].last, c.t);
  }
  return Object.values(m).sort((a, b) => b.last - a.last);
}

// ---------- recommendation engine (deterministic) ----------
function questActivity(q) {
  let t = 0;  // real activity only; fall back to creation time when there's none
  for (const s of S.sessions) if (s.questId === q.id) t = Math.max(t, s.end);
  for (const k of S.tasks) if (k.questId === q.id && k.doneAt) t = Math.max(t, k.doneAt);
  for (const c of commitsFor(q)) t = Math.max(t, c.t);
  return t || q.createdAt;
}
function researchVsExec(qid, days = 14) {
  const since = now() - days * DAY, q = quest(qid);
  let r = 0, e = 0;
  for (const s of S.sessions) if (s.questId === qid && s.start > since) { if (s.kind === 'research') r++; else if (s.kind === 'execute') e++; }
  if (q) e += commitsFor(q).filter(c => c.t > since).length;
  return { r, e };
}
function candidates() {
  const list = [];
  for (const q of activeQuests()) if (!nextAction(q))
    list.push({ define: true, questId: q.id, title: `Decide the next action for ${q.title}`, minutes: 5, type: 'plan' });
  for (const t of S.tasks) {
    if (t.status !== 'open') continue;
    const q = t.questId ? quest(t.questId) : null;
    if (t.questId && !liveQuest(q)) continue;
    list.push({ taskId: t.id, questId: t.questId || null, title: t.title, minutes: t.minutes || 25, type: t.type || 'execute' });
  }
  return list;
}
function score(c, avail) {
  const f = [], add = (p, why) => f.push({ p, why });
  const t = c.taskId ? task(c.taskId) : null, q = c.questId ? quest(c.questId) : null;
  if (q) {
    add(q.status === 'active' ? 30 : 5, null);
    if (q.campaign === 'Income') add(12, 'it moves your Income campaign forward');
    if (t && nextAction(q) === t) add(10, null);
    if (q.progress >= 70) add(12, `${q.title} is ${q.progress}% done — close to the finish line`);
    if (q.status === 'active') { const d = daysSince(questActivity(q)); if (d >= 2) add(Math.min(21, d * 3), `${q.title} hasn't been touched in ${d} days`); }
  } else add(8, null);
  if (c.define) add(14, 'every Active Quest needs a clear next action');
  if (t && t.important) add(15, 'you marked it important');
  const due = (t && t.due) || (q && q.due);
  if (due) {
    const d = dayDiff(due);
    if (d < 0) add(45, "it's overdue"); else if (d === 0) add(38, "it's due today"); else if (d === 1) add(30, "it's due tomorrow");
    else if (d <= 3) add(20, `it's due in ${d} days`); else if (d <= 7) add(8, "it's due this week");
  }
  if (c.type === 'execute') add(8, null);
  if (c.type === 'plan' && !c.define) add(-6, null);
  if (c.type === 'research' && q) { const rv = researchVsExec(q.id); add(rv.r >= 3 && rv.e <= 1 ? -30 : -4, null); }
  if (avail) { if (c.minutes > avail) add(-60, null); else add(5, `it fits in your ${avail} minutes`); }
  if (S.lowEnergyUntil > now()) { if (c.minutes > 30) add(-20, null); else if (c.minutes <= 20) add(10, "it's short — good for low energy"); }
  const rej = S.feedback.filter(x => x.taskId && x.taskId === c.taskId && now() - x.t < DAY).length;
  if (rej) add(-25 * rej, null);
  return { c, score: f.reduce((a, x) => a + x.p, 0), f };
}
function reasonFor(s) {
  const c = s.c, q = c.questId && quest(c.questId);
  const whys = s.f.filter(x => x.why && x.p > 0).sort((a, b) => b.p - a.p).map(x => x.why);
  let r = whys.length ? cap(whys.slice(0, 2).join(', and ')) + '.'
    : q ? `It's the next action on ${q.title}, your highest-value open work.` : "It's the most useful open item right now.";
  if (q) {
    const rv = researchVsExec(q.id);
    if (rv.r >= 3 && rv.e <= 1) r += ` You've researched ${q.title} ${rv.r} times lately with ${plural(rv.e, 'work session')}. You have enough info — execute.`;
  }
  if (c.taskId && S.feedback.filter(x => x.taskId === c.taskId).length >= 3) r += " You've passed on this 3+ times — maybe it needs to be broken into something smaller.";
  return r;
}
function ranked(avail) { return candidates().map(c => score(c, avail)).sort((a, b) => b.score - a.score); }
function whatNow(avail) {
  const top = ranked(avail)[0];
  if (!top) { S.rec = null; save(); return null; }
  S.rec = { ...top.c, reason: reasonFor(top), at: now(), avail: avail || null };
  log('recommendation', { title: top.c.title, score: top.score, avail: avail || null });
  save(); return S.rec;
}
function recValid(r) {
  if (!r) return false;
  if (r.taskId) { const t = task(r.taskId); return !!t && t.status === 'open' && (!t.questId || liveQuest(quest(t.questId))); }
  if (r.define) { const q = quest(r.questId); return q && q.status === 'active' && !nextAction(q); }
  return false;
}

// ---------- mutations ----------
function makeQuest(d) {
  const q = { id: uid(), title: d.title.trim(), status: d.status || 'active', campaign: d.campaign || 'Build & Learn',
    prefix: d.prefix || '', progress: d.progress || 0, due: d.due || '', createdAt: now(), completedAt: d.status === 'done' ? now() : null };
  S.quests.push(q); log('quest_created', { id: q.id, title: q.title, status: q.status }); return q;
}
function makeTask(d) {
  const t = { id: uid(), title: d.title.trim(), questId: d.questId || null, minutes: +d.minutes || 25, type: d.type || 'execute',
    important: !!d.important, due: d.due || '', status: 'open', createdAt: now(), doneAt: null };
  S.tasks.push(t); log('task_created', { id: t.id, title: t.title, questId: t.questId }); return t;
}
function makeIdea(title, desc) {
  const i = { id: uid(), title: title.trim(), desc: desc || '', createdAt: now(), upside: '', difficulty: '', cost: '', campaign: '', status: 'unreviewed' };
  S.ideas.push(i); addXP(XP.idea, 'idea'); log('idea_captured', { id: i.id, title: i.title }); return i;
}
function completeTask(t, viaFocus) {
  t.status = 'done'; t.doneAt = now();
  const n = t.type === 'execute' ? (t.important ? XP.important : XP.task) : XP[t.type] || 2;
  addXP(n, 'task'); log('task_done', { id: t.id, viaFocus: !!viaFocus });
  return n;
}
function completeQuest(q) {
  q.status = 'done'; q.completedAt = now(); q.progress = 100;
  addXP(XP.quest, 'quest'); log('quest_done', { id: q.id, title: q.title });
  if (S.rec && S.rec.questId === q.id) S.rec = null;
}

// ---------- view + router ----------
let view = 'home', vparam = null, ui = {};
function go(v, p) { view = v; vparam = p ?? null; ui = {}; closeSheet(); render(); window.scrollTo(0, 0); }

function render() {
  if (!S.setupDone && view !== 'setup') view = 'setup';
  if (S.focus && view !== 'focus') view = 'focus';
  document.body.className = view === 'focus' ? 'focus' : view === 'setup' ? 'setup' : '';
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on',
    b.dataset.v === view || (b.dataset.v === 'quests' && view === 'quest') || (b.dataset.v === 'dump' && view === 'vault')));
  const R = { setup: vSetup, home: vHome, quests: vQuests, quest: vQuest, dump: vDump, vault: vVault, insights: vInsights, focus: vFocus };
  $('#app').innerHTML = (R[view] || vHome)();
}

// ---------- setup ----------
function vSetup() {
  const d = ui.setup || (ui.setup = { step: 1, main: S.mainQuest || '', projects: [], custom: '' });
  if (d.step === 1) return `
    <div class="brand"><h1>MOEMODE</h1></div>
    <p class="dim">MoeMode answers one question: <b style="color:var(--text)">what should I do right now?</b> Three quick steps to set it up.</p>
    <div class="label" style="margin-top:22px">Step 1 · Main Quest</div>
    <div class="field"><textarea id="mainq" placeholder="The one long-term thing everything else serves.">${esc(d.main)}</textarea></div>
    <button class="btn primary" data-a="setupMain">NEXT</button>
    <button class="btn ghost" data-a="importBackup" style="margin-top:10px">Restore from a backup instead</button>`;
  if (d.step === 2) {
    if (!d.projects.length && !d.loaded) {
      d.loaded = true;
      refreshCommits(true).then(() => {
        d.fetched = true;
        for (const p of detectedProjects()) if (p.n >= 2 && !d.projects.some(x => x.name === p.name)) d.projects.push({ name: p.name, prefix: p.name, n: p.n, last: p.last, status: 'skip' });
        if (view === 'setup') render();
      });
    }
    const n = d.projects.filter(p => p.status === 'active').length;
    return `
    <div class="brand"><h1>MOEMODE</h1></div>
    <div class="label">Step 2 · Your projects</div>
    <p class="dim small">Found in your commit history. Mark each one. Active = what you're pushing on now (max ${MAX_ACTIVE}). Done = finished, counts as history.</p>
    ${d.projects.length ? '' : `<div class="empty">${d.fetched ? 'No projects found in commits — add them below.' : 'Reading commits…'}</div>`}
    ${d.projects.map((p, i) => `
      <div class="card" style="padding:12px">
        <div style="display:flex;justify-content:space-between;margin-bottom:8px"><b>${esc(p.name)}</b>
          <span class="faint small">${p.n ? plural(p.n, 'commit') + ' · ' + ago(p.last) : 'added'}</span></div>
        <div class="seg">${['active', 'side', 'done', 'skip'].map(s => `<button class="${p.status === s ? 'on' : ''}" data-a="setupProj" data-i="${i}" data-s="${s}">${{ active: 'Active', side: 'Side', done: 'Done', skip: 'Skip' }[s]}</button>`).join('')}</div>
      </div>`).join('')}
    <div class="row" style="margin:6px 0 16px"><input type="text" id="customProj" placeholder="Add another project"><button class="btn sm" data-a="setupAdd" style="flex:none">Add</button></div>
    ${n > MAX_ACTIVE ? `<p class="small" style="color:var(--gold)">That's ${n} active. MoeMode works best with ${MAX_ACTIVE} or fewer — consider making some Side Quests.</p>` : ''}
    <button class="btn primary" data-a="setupProjects">NEXT</button>
    <button class="btn ghost" data-a="setupBack">Back</button>`;
  }
  const act = d.projects.filter(p => p.status === 'active');
  return `
    <div class="brand"><h1>MOEMODE</h1></div>
    <div class="label">Step 3 · Next actions</div>
    <p class="dim small">For each Active Quest: the very next concrete thing, doable in 5–90 minutes. "Work on it" doesn't count — be specific.</p>
    ${act.length ? act.map((p, i) => `
      <div class="card">
        <div class="label" style="color:var(--cyan)">${esc(p.name)}</div>
        <div class="field"><input type="text" id="na${i}" value="${esc(p.next || '')}" placeholder="e.g. Add 5 new levels to the level map"></div>
        <select id="nm${i}">${MINUTES.map(m => `<option value="${m}" ${m === (p.min || 30) ? 'selected' : ''}>~${m} min</option>`).join('')}</select>
      </div>`).join('') : '<div class="empty">No Active Quests picked — you can add them later.</div>'}
    <button class="btn primary" data-a="setupFinish">ENTER MOEMODE</button>
    <button class="btn ghost" data-a="setupBack">Back</button>`;
}

// ---------- home ----------
function vHome() {
  if (!recValid(S.rec)) whatNow();
  const r = S.rec, q = r && r.questId && quest(r.questId);
  const xp = totalXP(), lv = levelOf(xp);
  return `
    <div class="brand"><h1>MOEMODE</h1><span class="pill">LV ${lv} · ${xp} XP</span></div>
    <div class="card" data-a="editMain" style="cursor:pointer">
      <div class="label">Main Quest</div>
      <div class="mainq">${esc(S.mainQuest) || '<span class="faint">Tap to set your Main Quest</span>'}</div>
    </div>
    ${r ? `
    <div class="card glow fade-in">
      <div class="label" style="color:var(--cyan)">Right Now</div>
      <div class="now-title">${esc(r.title)}</div>
      <div class="meta">
        ${q ? `<span class="tag">${esc(q.title)}</span>` : '<span class="tag">Loose end</span>'}
        <span class="tag c">~${r.minutes} min</span>
        ${r.type !== 'execute' ? `<span class="tag g">${TYPES[r.type]}</span>` : ''}
      </div>
      <p class="reason">${esc(r.reason)}</p>
    </div>
    <div class="stack">
      <button class="btn primary" data-a="start">START</button>
      <button class="btn alt" data-a="whatNow">WHAT NOW?</button>
      <button class="btn ghost" data-a="disagree">Not this →</button>
    </div>` : `
    <div class="card glow">
      <div class="label" style="color:var(--cyan)">Right Now</div>
      <div class="now-title">Nothing queued.</div>
      <p class="reason">Add a quest with a next action, or brain-dump what's on your mind.</p>
    </div>
    <div class="stack"><button class="btn primary" data-a="go" data-v="quests">ADD A QUEST</button>
    <button class="btn alt" data-a="go" data-v="dump">BRAIN DUMP</button></div>`}`;
}

// ---------- quests ----------
function questRow(q) {
  const na = nextAction(q), c = commitsFor(q).filter(c => c.t > now() - 30 * DAY).length;
  return `<div class="item" data-a="go" data-v="quest" data-p="${q.id}"><div class="grow">
    <div class="t">${esc(q.title)}</div>
    <div class="s">${q.status === 'done' ? (q.completedAt ? 'Finished ' + ago(q.completedAt) : 'Finished') : na ? 'Next: ' + esc(na.title) : '<span style="color:var(--gold)">No next action</span>'}${c ? ` · ${c} commits/30d` : ''}</div>
    ${q.status !== 'done' && q.progress ? `<div class="bar"><i style="width:${q.progress}%"></i></div>` : ''}
  </div><span class="faint">›</span></div>`;
}
function vQuests() {
  const by = s => S.quests.filter(q => q.status === s);
  const act = by('active'), side = by('side'), done = by('done');
  const loose = S.tasks.filter(t => !t.questId && t.status === 'open');
  return `
    <div class="brand"><h1>QUESTS</h1></div>
    <div class="card" data-a="editMain" style="cursor:pointer"><div class="label">Main Quest</div><div class="mainq">${esc(S.mainQuest) || '<span class="faint">Not set</span>'}</div></div>
    <h2>Active · ${act.length}/${MAX_ACTIVE}</h2>
    ${act.map(questRow).join('') || '<div class="empty">No Active Quests.</div>'}
    <button class="btn" data-a="newQuest">+ New Quest</button>
    ${side.length ? `<h2>Side Quests</h2>${side.map(questRow).join('')}` : ''}
    <h2>Loose ends</h2>
    ${loose.map(t => taskRow(t)).join('') || '<div class="empty">Errands and one-off tasks land here.</div>'}
    <button class="btn" data-a="newTask" data-q="">+ Loose task</button>
    ${done.length ? `<h2>Completed · ${done.length}</h2>${done.map(questRow).join('')}` : ''}
    ${S.quests.some(q => q.status === 'dropped') ? `<h2>Dropped</h2>${by('dropped').map(questRow).join('')}` : ''}
    <button class="btn ghost" data-a="go" data-v="vault" style="margin-top:20px">Idea Vault (${S.ideas.filter(i => i.status !== 'rejected' && i.status !== 'promoted').length}) →</button>`;
}
function taskRow(t) {
  const sub = [`~${t.minutes} min`, t.type !== 'execute' ? TYPES[t.type] : '', t.important ? '★ important' : '', t.due ? 'due ' + t.due : '', t.status === 'blocked' ? 'BLOCKED' + (t.blockedNote ? ': ' + t.blockedNote : '') : ''].filter(Boolean).join(' · ');
  return `<div class="item ${t.status === 'done' ? 'done' : ''}">
    ${t.status === 'open' ? `<button class="tick" data-a="tickTask" data-id="${t.id}" aria-label="Complete"></button>` : ''}
    <div class="grow" data-a="editTask" data-id="${t.id}"><div class="t">${esc(t.title)}</div><div class="s">${esc(sub)}</div></div>
    ${t.status === 'blocked' ? `<button class="btn sm" data-a="unblock" data-id="${t.id}">Unblock</button>` : ''}
  </div>`;
}
function vQuest() {
  const q = quest(vparam); if (!q) return vQuests();
  const ts = S.tasks.filter(t => t.questId === q.id);
  const open = ts.filter(t => t.status !== 'done'), done = ts.filter(t => t.status === 'done');
  const rv = researchVsExec(q.id, 30), cm = commitsFor(q);
  const focusMin = S.sessions.filter(s => s.questId === q.id).reduce((a, s) => a + s.actualMin, 0);
  return `
    <button class="back" data-a="go" data-v="quests">‹ Quests</button>
    <div class="label">${esc(q.campaign)} · ${{ active: 'Active Quest', side: 'Side Quest', done: 'Completed', dropped: 'Dropped' }[q.status]}</div>
    <div class="now-title">${esc(q.title)}</div>
    <div class="meta">
      <span class="tag c">${focusMin} focus min</span>
      ${cm.length ? `<span class="tag">${plural(cm.length, 'commit')} · last ${ago(cm[0].t)}</span>` : ''}
      ${rv.r ? `<span class="tag g">${rv.r} research / ${rv.e} work (30d)</span>` : ''}
      ${q.due ? `<span class="tag r">due ${q.due}</span>` : ''}
    </div>
    ${q.status !== 'done' ? `
    <div class="field"><label>Progress · <span id="pv">${q.progress}%</span></label>
      <input type="range" min="0" max="100" step="5" value="${q.progress}" data-q="${q.id}" id="prog" style="width:100%;accent-color:var(--cyan)"></div>` : ''}
    <h2>Next actions</h2>
    ${open.map(taskRow).join('') || '<div class="empty">No next action. Every quest needs one.</div>'}
    <button class="btn" data-a="newTask" data-q="${q.id}">+ Add action</button>
    ${done.length ? `<h2>Done · ${done.length}</h2>${done.slice(-8).reverse().map(taskRow).join('')}` : ''}
    <h2>Quest</h2>
    <div class="stack">
      ${q.status === 'side' ? `<button class="btn" data-a="activate" data-id="${q.id}">Make Active</button>` : ''}
      ${q.status === 'active' ? `<button class="btn" data-a="setStatus" data-id="${q.id}" data-s="side">Move to Side Quests</button>` : ''}
      ${q.status !== 'done' ? `<button class="btn" data-a="finishQuest" data-id="${q.id}" style="color:var(--gold)">Mark Quest Complete 🏁</button>` : ''}
      <button class="btn" data-a="editQuest" data-id="${q.id}">Edit details</button>
      ${q.status === 'done' || q.status === 'dropped' ? `<button class="btn" data-a="setStatus" data-id="${q.id}" data-s="side">Reopen as Side Quest</button>` : `<button class="btn danger" data-a="setStatus" data-id="${q.id}" data-s="dropped">Drop quest</button>`}
    </div>`;
}

// ---------- brain dump ----------
const CATS = { task: 'Task', errand: 'Errand', research: 'Research', idea: 'Idea', toss: 'Toss' };
function splitDump(text) {
  return text.split(/\n|;|\.(?:\s|$)|,\s*(?:and\s+)?|\s+and\s+(?=(?:i|maybe|also|then)\b)/i)
    .map(s => s.trim().replace(/^(and|also|then|plus)\s+/i, '')
      .replace(/^(i\s+(really\s+)?(need|have|want|should|gotta|got)\s+to|i\s+need|i\s+had\s+an\s+idea\s+about|need\s+to|gotta|maybe\s+i\s+should|i\s+should)\s+/i, '').trim())
    .filter(s => s.length > 1).map(cap);
}
function guessCat(s) {
  const l = s.toLowerCase();
  if (/\b(idea|what if|could (make|build|sell)|business|app (for|that)|startup|side hustle|selling|sell)\b/.test(l)) return 'idea';
  if (/\b(research|look into|learn about|read about|figure out|compare|investigate|study)\b/.test(l)) return 'research';
  if (/\b(groceries|call|bank|pay|bills?|buy|pick up|appointment|email|laundry|dentist|doctor|store|clean|dishes|mail|return)\b/.test(l)) return 'errand';
  return 'task';
}
function guessQuest(s) {
  const l = s.toLowerCase();
  const q = S.quests.find(q => liveQuest(q) && (l.includes(q.title.toLowerCase()) || (q.prefix && l.includes(q.prefix.toLowerCase()))));
  return q ? q.id : '';
}
const URGENT = /\b(today|tonight|urgent|asap|now|deadline|overdue)\b/i;
function vDump() {
  const d = ui.dump;
  if (!d) return `
    <div class="brand"><h1>BRAIN DUMP</h1></div>
    <p class="dim small">Empty your head. Ramble — commas, "and", new lines all work. Nothing you dump becomes a project automatically. Tip: the mic on your keyboard works here.</p>
    <textarea class="big" id="dumpText" placeholder="I need to call the bank, I had an idea about selling my game assets, research greenhouses, groceries…"></textarea>
    <button class="btn primary" data-a="sortDump" style="margin-top:12px">SORT IT</button>
    <button class="btn ghost" data-a="go" data-v="vault" style="margin-top:10px">Idea Vault (${S.ideas.filter(i => i.status !== 'rejected' && i.status !== 'promoted').length}) →</button>`;
  const live = S.quests.filter(liveQuest);
  return `
    <div class="brand"><h1>SORT</h1></div>
    <p class="dim small">Guessed a category for each. Fix anything wrong, then capture.</p>
    ${d.items.map((it, i) => `
      <div class="dcard">
        <input type="text" value="${esc(it.text)}" data-i="${i}" class="dtext">
        <div class="chips">${Object.entries(CATS).map(([k, v]) => `<button class="chip ${it.cat === k ? 'on' : ''}" data-a="dumpCat" data-i="${i}" data-c="${k}">${v}</button>`).join('')}</div>
        ${it.cat === 'task' || it.cat === 'research' ? `<select data-i="${i}" class="dq">
          <option value="">Loose end (no quest)</option>
          ${live.map(q => `<option value="${q.id}" ${it.questId === q.id ? 'selected' : ''}>${esc(q.title)}</option>`).join('')}
        </select>` : ''}
      </div>`).join('')}
    <button class="btn primary" data-a="saveDump">CAPTURE</button>
    <button class="btn ghost" data-a="cancelDump">Back</button>`;
}

// ---------- idea vault ----------
const ISTAT = { unreviewed: 'Unreviewed', interesting: 'Interesting', later: 'Later', promoted: 'Promoted', rejected: 'Rejected' };
function vVault() {
  const f = ui.vf || 'open';
  const list = S.ideas.filter(i => f === 'all' ? true : f === 'open' ? !['promoted', 'rejected'].includes(i.status) : i.status === f).slice().reverse();
  return `
    <button class="back" data-a="go" data-v="dump">‹ Brain Dump</button>
    <div class="brand"><h1>IDEA VAULT</h1></div>
    <p class="dim small">Ideas are safe here. They don't compete with your quests unless you promote one.</p>
    <div class="chips" style="margin-bottom:14px">${[['open', 'Open'], ...Object.entries(ISTAT), ['all', 'All']].map(([k, v]) => `<button class="chip ${f === k ? 'on' : ''}" data-a="vf" data-f="${k}">${v}</button>`).join('')}</div>
    ${list.map(i => `<div class="item" data-a="openIdea" data-id="${i.id}"><div class="grow">
      <div class="t">${esc(i.title)}</div>
      <div class="s">${ISTAT[i.status]} · ${ago(i.createdAt)}${i.upside ? ' · upside ' + i.upside : ''}${i.difficulty ? ' · ' + i.difficulty + ' effort' : ''}</div>
    </div><span class="faint">›</span></div>`).join('') || '<div class="empty">Nothing here.</div>'}
    <button class="btn" data-a="newIdea">+ Capture an idea</button>`;
}

// ---------- insights ----------
function observations() {
  const out = [], since30 = now() - 30 * DAY;
  for (const q of S.quests.filter(liveQuest)) {
    const rv = researchVsExec(q.id, 30);
    if (rv.r >= 3 && rv.e <= 1) out.push({ ev: `${q.title}: ${rv.r} research sessions and ${plural(rv.e, 'work session')} in 30 days.`, hyp: 'Research may be standing in for the harder execution step. Try one Do task next.' });
    const d = daysSince(questActivity(q));
    if (q.status === 'active' && d >= 7) out.push({ ev: `${q.title} is Active but hasn't been touched in ${d} days.`, hyp: 'If it isn\'t really active, moving it to Side Quests frees up attention.' });
  }
  const started = S.quests.filter(q => q.createdAt > since30 && !S.events.some(e => e.type === 'setup' && Math.abs(e.t - q.createdAt) < 5000)).length;
  const finished = S.quests.filter(q => q.completedAt && q.completedAt > since30).length;
  if (started >= 3 && started > finished * 2) out.push({ ev: `${started} quests started and ${finished} finished in the last 30 days.`, hyp: 'Starting may be easier than the middle stretch of existing projects. Hypothesis, not fact.' });
  const s30 = S.sessions.filter(s => s.start > since30);
  const bad = s30.filter(s => s.outcome === 'distracted' || s.outcome === 'abandoned').length;
  if (s30.length >= 5 && bad / s30.length >= .4) out.push({ ev: `${bad} of ${s30.length} focus sessions ended distracted or abandoned.`, hyp: 'Shorter sessions (15 min) might be easier to finish.' });
  const fb = S.feedback.filter(f => f.t > since30), byR = {};
  for (const f of fb) byR[f.reason] = (byR[f.reason] || 0) + 1;
  if ((byR.energy || 0) >= 3) out.push({ ev: `You passed on recommendations for low energy ${byR.energy} times this month.`, hyp: 'Keeping a few 15-minute tasks on each quest gives low-energy days something to grab.' });
  const ideas30 = S.ideas.filter(i => i.createdAt > since30).length;
  if (ideas30 >= 8) out.push({ ev: `${ideas30} ideas captured in 30 days.`, hyp: 'Lots of ideas — good. They\'re parked in the Vault, not competing with quests.' });
  return out.slice(0, 4);
}
function vInsights() {
  const since = now() - 7 * DAY, ss = S.sessions.filter(s => s.start > since);
  const mins = k => ss.filter(s => !k || s.kind === k).reduce((a, s) => a + s.actualMin, 0);
  const tasksDone = S.tasks.filter(t => t.doneAt && t.doneAt > since).length;
  const qDone = S.quests.filter(q => q.completedAt && q.completedAt > since).length;
  const xp = totalXP(), lv = levelOf(xp), lo = xpForLevel(lv), hi = xpForLevel(lv + 1);
  const xpWeek = S.xp.filter(x => x.t > since).reduce((a, x) => a + x.n, 0);
  const cWeek = S.commits.list.filter(c => c.t > since), byP = {};
  for (const c of cWeek) { const p = prefixOf(c.msg) || 'Other'; byP[p] = (byP[p] || 0) + 1; }
  const pList = Object.entries(byP).sort((a, b) => b[1] - a[1]), pMax = pList.length ? pList[0][1] : 1;
  const outc = {}; for (const s of ss) outc[s.outcome] = (outc[s.outcome] || 0) + 1;
  const obs = observations();
  return `
    <div class="brand"><h1>INSIGHTS</h1><span class="pill">LV ${lv}</span></div>
    <div class="card"><div class="label">Level ${lv} · ${xp} XP</div><div class="bar"><i style="width:${Math.round((xp - lo) / (hi - lo) * 100)}%"></i></div>
      <div class="small faint" style="margin-top:8px">${hi - xp} XP to level ${lv + 1}. Finishing pays, planning barely does.</div></div>
    <h2>This week</h2>
    <div class="grid">
      <div class="stat"><b>${mins()}</b><span>focus minutes</span></div>
      <div class="stat"><b>${tasksDone}</b><span>tasks completed</span></div>
      <div class="stat"><b>${qDone}</b><span>quests finished</span></div>
      <div class="stat"><b>${cWeek.length}</b><span>commits</span></div>
      <div class="stat"><b>${mins('research')}<span style="font-size:15px;color:var(--faint)"> / ${mins('execute')}</span></b><span>research / doing min</span></div>
      <div class="stat"><b>${xpWeek}</b><span>XP earned</span></div>
    </div>
    ${ss.length ? `<div class="card"><div class="label">Session outcomes</div>${Object.entries(outc).map(([k, v]) => `<div class="hbar"><span class="n">${OUT[k] || k}</span><span class="b"><i style="width:${v / ss.length * 100}%"></i></span><span class="v">${v}</span></div>`).join('')}</div>` : ''}
    <div class="card"><div class="label">Commits by project · 7 days</div>
      ${pList.map(([p, n]) => `<div class="hbar"><span class="n">${esc(p)}</span><span class="b"><i style="width:${n / pMax * 100}%"></i></span><span class="v">${n}</span></div>`).join('') || '<div class="faint small">No commits this week.</div>'}
      <div class="faint small" style="margin-top:8px">${S.commits.fetchedAt ? 'Updated ' + ago(S.commits.fetchedAt) : 'Not loaded yet'} · <a href="#" data-a="refreshCommits" style="color:var(--cyan)">refresh</a></div></div>
    <h2>Observations</h2>
    ${obs.map(o => `<div class="card obs"><div class="ev">${esc(o.ev)}</div><div class="hyp">Possible explanation: ${esc(o.hyp)}</div></div>`).join('') || '<div class="empty">Not enough history yet. Patterns show up after a week or two of use.</div>'}
    <h2>Data</h2>
    <p class="small dim">Everything is stored on this device only. ${S.lastBackup ? 'Last backup ' + ago(S.lastBackup) + '.' : 'No backup yet.'}</p>
    <div class="row"><button class="btn" data-a="exportBackup">Back up</button><button class="btn" data-a="importBackup">Restore</button></div>
    <div class="field" style="margin-top:14px"><label>GitHub repo for commit tracking</label><input type="text" id="repo" value="${esc(S.settings.repo)}"></div>
    <button class="btn danger" data-a="reset" style="margin-top:20px">Erase everything</button>`;
}

// ---------- focus ----------
const OUT = { completed: 'Completed', progress: 'Made progress', blocked: 'Got blocked', abandoned: 'Abandoned', distracted: 'Got distracted' };
const elapsed = f => now() - f.start - f.pausedMs - (f.pausedAt ? now() - f.pausedAt : 0);
function fmt(ms) { const s = Math.round(Math.abs(ms) / 1000); return (ms < 0 ? '+' : '') + Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
function vFocus() {
  const f = S.focus; if (!f) { view = 'home'; return vHome(); }
  const q = f.questId && quest(f.questId);
  if (ui.outcome) {
    const o = ui.outcome === true ? '' : ui.outcome;
    return `<div class="focus-wrap" style="justify-content:flex-start;text-align:left;padding-top:20px">
      <div class="label">Session over · ${Math.max(1, Math.round(elapsed(f) / 60000))} min</div>
      <div class="q now-title">What happened?</div>
      <div class="stack">${Object.entries(OUT).map(([k, v]) => `<button class="btn ${o === k ? 'alt' : ''}" data-a="pickOutcome" data-o="${k}">${v}</button>`).join('')}</div>
      <div class="field" style="margin-top:14px"><textarea id="fnote" placeholder="${o === 'blocked' ? 'What\'s blocking it?' : 'Optional note'}" style="min-height:80px">${esc(ui.note || '')}</textarea></div>
      <button class="btn primary" data-a="endFocus" ${o ? '' : 'disabled style="opacity:.4"'}>SAVE</button>
      <button class="btn ghost" data-a="backToTimer">Back to timer</button></div>`;
  }
  const rem = f.dur * 1000 - elapsed(f);
  return `<div class="focus-wrap">
    <div class="label" style="color:var(--cyan)">${q ? esc(q.title) : 'Focus'}</div>
    <div class="focus-task">${esc(f.title)}</div>
    <div class="timer ${rem < 0 ? 'over' : ''} ${f.pausedAt ? 'paused' : ''}" id="timer">${fmt(rem)}</div>
    <div class="faint small" id="tsub" style="margin-bottom:34px">${f.pausedAt ? 'Paused' : rem < 0 ? 'Time\'s up — finish or keep going' : 'of ' + f.dur / 60 + ' min'}</div>
    <div class="stack">
      <button class="btn primary" data-a="finish">FINISH</button>
      <div class="row"><button class="btn" data-a="pause">${f.pausedAt ? 'Resume' : 'Pause'}</button><button class="btn" data-a="blocked">Blocked</button></div>
    </div></div>`;
}
let wakeLock = null, actx = null;
async function lockScreen() { try { if ('wakeLock' in navigator && S.focus) wakeLock = await navigator.wakeLock.request('screen'); } catch (e) {} }
function beep() {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    [0, .25, .5].forEach(d => { const o = actx.createOscillator(), g = actx.createGain(); o.frequency.value = 880; o.connect(g); g.connect(actx.destination);
      g.gain.setValueAtTime(.0001, actx.currentTime + d); g.gain.exponentialRampToValueAtTime(.25, actx.currentTime + d + .02);
      g.gain.exponentialRampToValueAtTime(.0001, actx.currentTime + d + .2); o.start(actx.currentTime + d); o.stop(actx.currentTime + d + .22); });
  } catch (e) {}
}
setInterval(() => {
  const f = S.focus; if (view !== 'focus' || !f || ui.outcome) return;
  const el = $('#timer'); if (!el) return;
  const rem = f.dur * 1000 - elapsed(f);
  el.textContent = fmt(rem); el.classList.toggle('over', rem < 0);
  if (rem <= 0 && !f.alerted && !f.pausedAt) { f.alerted = true; save(); beep(); if (navigator.vibrate) navigator.vibrate([200, 100, 200]); $('#tsub').textContent = "Time's up — finish or keep going"; }
}, 250);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { lockScreen(); if (view === 'home') render(); } });

// ---------- sheet / fx ----------
function sheet(html) { const s = $('#sheet'); s.innerHTML = `<div class="sheet-bg" data-a="closeSheet"></div><div class="sheet-panel"><div>${html}</div></div>`; s.classList.add('open'); }
function closeSheet() { const s = $('#sheet'); s.classList.remove('open'); s.innerHTML = ''; }
function toast(msg, ms = 2600) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), ms); }
function pop(n, label) { const fx = $('#fx'); fx.innerHTML = `<div class="xp-pop">+${n} XP<small>${esc(label || '')}</small></div>`; setTimeout(() => { fx.innerHTML = ''; }, 1600); }

function timeSheet(then) {
  ui.timeThen = then;
  sheet(`<h3>WHAT NOW?</h3><div class="q">How much time do you have?</div>
    <div class="chips">${[15, 30, 60, 90].map(m => `<button class="chip" data-a="pickTime" data-m="${m}">${m} min</button>`).join('')}
    <button class="chip" data-a="pickTime" data-m="0">Plenty</button></div>`);
}
function durationSheet() {
  const r = S.rec, def = [15, 25, 30, 45, 60].reduce((a, b) => Math.abs(b - r.minutes) < Math.abs(a - r.minutes) ? b : a);
  sheet(`<h3>FOCUS</h3><div class="q">${esc(r.title)}</div>
    <div class="chips" style="margin-bottom:14px">${[15, 25, 30, 45, 60].map(m => `<button class="chip ${m === def ? 'on' : ''}" data-a="startFocus" data-m="${m}">${m} min</button>`).join('')}</div>
    <div class="row"><input type="number" id="customMin" placeholder="Custom minutes" inputmode="numeric" min="1" max="240"><button class="btn sm" data-a="startFocus" data-m="custom" style="flex:none">Go</button></div>`);
}
function taskSheet(t, questId) {
  const d = t || { title: '', minutes: 30, type: 'execute', important: false, due: '' };
  ui.taskEdit = { id: t ? t.id : null, questId: t ? t.questId : questId, type: d.type };
  const live = S.quests.filter(liveQuest);
  sheet(`<h3>${t ? 'EDIT ACTION' : 'NEW ACTION'}</h3>
    <div class="field" style="margin-top:12px"><input type="text" id="tTitle" value="${esc(d.title)}" placeholder="Concrete next step (5–90 min)"></div>
    <div class="row field"><select id="tMin">${MINUTES.map(m => `<option value="${m}" ${m === d.minutes ? 'selected' : ''}>~${m} min</option>`).join('')}</select>
      <input type="date" id="tDue" value="${esc(d.due)}"></div>
    <div class="field"><div class="seg" id="tType">${Object.entries(TYPES).map(([k, v]) => `<button class="${d.type === k ? 'on' : ''}" data-a="tType" data-t="${k}">${v}</button>`).join('')}</div></div>
    <div class="field"><select id="tQuest"><option value="">Loose end (no quest)</option>${live.map(q => `<option value="${q.id}" ${q.id === ui.taskEdit.questId ? 'selected' : ''}>${esc(q.title)}</option>`).join('')}</select></div>
    <label class="check"><input type="checkbox" id="tImp" ${d.important ? 'checked' : ''}> Important</label>
    <div class="stack" style="margin-top:10px"><button class="btn primary" data-a="saveTask">SAVE</button>
    ${t ? `<div class="row">${t.status === 'open' ? `<button class="btn" data-a="topTask" data-id="${t.id}">Make it next</button>` : ''}<button class="btn danger" data-a="delTask" data-id="${t.id}">Remove</button></div>` : ''}</div>`);
  setTimeout(() => { const i = $('#tTitle'); if (i && !t) i.focus(); }, 50);
}
function questSheet(q) {
  const d = q || { title: '', campaign: 'Build & Learn', prefix: '', due: '' };
  sheet(`<h3>${q ? 'EDIT QUEST' : 'NEW QUEST'}</h3>
    <div class="field" style="margin-top:12px"><label>Name</label><input type="text" id="qTitle" value="${esc(d.title)}" placeholder="e.g. Ship Bubble Pop to the team"></div>
    <div class="field"><label>Campaign</label><select id="qCamp">${S.campaigns.map(c => `<option ${c === d.campaign ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
    <div class="field"><label>Commit prefix (counts commits starting with "Name:")</label><input type="text" id="qPrefix" value="${esc(d.prefix)}" placeholder="e.g. Bubble Pop"></div>
    <div class="field"><label>Deadline (optional)</label><input type="date" id="qDue" value="${esc(d.due)}"></div>
    ${q ? '' : `<label class="check"><input type="checkbox" id="qSide"> Side Quest (lower priority)</label>`}
    <button class="btn primary" data-a="saveQuest" data-id="${q ? q.id : ''}" style="margin-top:10px">SAVE</button>`);
}
// Project-switching guardrail. onGo(status) is called with 'active' or 'side'; onVault parks it as an idea.
function guardrail(title, onGo, onVault) {
  const act = activeQuests();
  if (act.length < MAX_ACTIVE) return onGo('active');
  ui.guard = { onGo, onVault, title };
  log('guardrail_shown', { title });
  sheet(`<h3 style="color:var(--gold)">NEW QUEST DETECTED</h3>
    <div class="q">You already have ${act.length} Active Quests. Does "${esc(title)}" replace one?</div>
    <div class="stack">
      ${act.map(q => `<button class="btn" data-a="guard" data-c="replace" data-id="${q.id}">Replace ${esc(q.title)} <span class="faint small">(→ Side)</span></button>`).join('')}
      <button class="btn alt" data-a="guard" data-c="vault">Save to Idea Vault</button>
      <button class="btn" data-a="guard" data-c="side">Make it a Side Quest</button>
      <button class="btn ghost" data-a="guard" data-c="anyway">Start anyway</button>
    </div>`);
}
function afterTaskDone(t, n) {
  pop(n, 'COMPLETE');
  const q = t.questId && quest(t.questId);
  if (q && q.status !== 'done' && !openTasks(q.id).length) {
    ui.lastQuest = q.id;
    setTimeout(() => sheet(`<h3>NEXT ACTION?</h3><div class="q">That was the last open action on ${esc(q.title)}. Is the quest finished?</div>
      <div class="stack"><button class="btn primary" data-a="finishQuest" data-id="${q.id}">QUEST COMPLETE 🏁</button>
      <button class="btn" data-a="newTask" data-q="${q.id}">Add the next action</button>
      <button class="btn ghost" data-a="closeSheet">Later</button></div>`), 900);
  }
}

// ---------- actions ----------
const A = {
  go: d => go(d.v, d.p),
  closeSheet,
  editMain() {
    sheet(`<h3>MAIN QUEST</h3><div class="field" style="margin-top:12px"><textarea id="mainEdit">${esc(S.mainQuest)}</textarea></div>
      <button class="btn primary" data-a="saveMain">SAVE</button>`);
  },
  saveMain() { S.mainQuest = $('#mainEdit').value.trim(); log('main_quest_set', { text: S.mainQuest }); save(); closeSheet(); render(); },

  // setup
  setupMain() { const v = $('#mainq').value.trim(); if (!v) return toast('Write your Main Quest first'); ui.setup.main = v; ui.setup.step = 2; render(); },
  setupProj(d) { ui.setup.projects[+d.i].status = d.s; render(); },
  setupAdd() { const v = $('#customProj').value.trim(); if (!v) return; ui.setup.projects.push({ name: v, prefix: '', n: 0, status: 'active' }); render(); },
  setupProjects() { ui.setup.step = 3; render(); },
  setupBack() { const d = ui.setup; if (d.step === 3) d.projects.filter(p => p.status === 'active').forEach((p, i) => { p.next = $('#na' + i).value; p.min = +$('#nm' + i).value; }); d.step--; render(); },
  setupFinish() {
    const d = ui.setup, act = d.projects.filter(p => p.status === 'active');
    act.forEach((p, i) => { p.next = $('#na' + i).value.trim(); p.min = +$('#nm' + i).value; });
    S.mainQuest = d.main;
    for (const p of d.projects) {
      if (p.status === 'skip') continue;
      const q = makeQuest({ title: p.name, status: p.status, prefix: p.prefix });
      if (p.status === 'done') q.completedAt = p.last || 0;  // finished before MoeMode; don't count it as this week
      if (p.status === 'active' && p.next) makeTask({ title: p.next, questId: q.id, minutes: p.min });
    }
    S.setupDone = true; log('setup', { quests: S.quests.length });
    whatNow(); save(); go('home');
  },

  // home
  whatNow() { timeSheet('rec'); },
  pickTime(d) {
    const m = +d.m || null; closeSheet();
    if (ui.timeThen === 'disagree' && S.rec) S.feedback.push({ t: now(), taskId: S.rec.taskId || null, questId: S.rec.questId, reason: 'time', avail: m });
    whatNow(m); render();
  },
  disagree() {
    sheet(`<h3>NOT THIS</h3><div class="q">What's off about it?</div><div class="stack">
      <button class="btn" data-a="dis" data-r="time">Not enough time</button>
      <button class="btn" data-a="dis" data-r="energy">Low energy right now</button>
      <button class="btn" data-a="dis" data-r="urgent">Something else matters more</button>
      ${S.rec && S.rec.taskId ? '<button class="btn" data-a="dis" data-r="blocked">It\'s blocked</button>' : ''}
      <button class="btn" data-a="dis" data-r="meh">Just not feeling it</button></div>`);
  },
  dis(d) {
    const r = S.rec; if (!r) return closeSheet();
    if (d.r === 'time') return timeSheet('disagree');
    if (d.r === 'urgent') {
      const alts = ranked(r.avail).filter(s => !(s.c.taskId && s.c.taskId === r.taskId) && !(s.c.define && s.c.questId === r.questId)).slice(0, 5);
      ui.alts = alts.map(s => s.c);
      return sheet(`<h3>YOUR CALL</h3><div class="q">What matters more?</div><div class="stack">
        ${ui.alts.map((c, i) => `<button class="btn" data-a="pickAlt" data-i="${i}" style="text-align:left;letter-spacing:0">${esc(c.title)}<div class="small faint">${c.questId ? esc(quest(c.questId).title) + ' · ' : ''}~${c.minutes} min</div></button>`).join('') || '<div class="empty">Nothing else is queued.</div>'}
        <button class="btn" data-a="newTask" data-q="">Something not listed…</button></div>`);
    }
    if (d.r === 'blocked') {
      return sheet(`<h3>BLOCKED</h3><div class="q">What's blocking it?</div><div class="field"><input type="text" id="blockNote" placeholder="Optional"></div>
        <button class="btn primary" data-a="confirmBlock">SAVE</button>`);
    }
    if (d.r === 'energy') S.lowEnergyUntil = now() + 3 * 3600e3;
    S.feedback.push({ t: now(), taskId: r.taskId || null, questId: r.questId, reason: d.r });
    closeSheet(); whatNow(r.avail); render();
    toast(d.r === 'energy' ? 'Got it — favoring short tasks for the next few hours.' : 'Noted. Here\'s the next best option.');
  },
  pickAlt(d) {
    const c = ui.alts[+d.i], r = S.rec;
    S.feedback.push({ t: now(), taskId: r.taskId || null, questId: r.questId, reason: 'urgent', chose: c.taskId || c.questId });
    S.rec = { ...c, reason: 'Your call — you said this matters more right now.', at: now(), avail: r.avail };
    log('recommendation_override', { title: c.title }); save(); closeSheet(); render();
  },
  confirmBlock() {
    const t = task(S.rec.taskId), note = $('#blockNote').value.trim();
    t.status = 'blocked'; t.blockedNote = note;
    S.feedback.push({ t: now(), taskId: t.id, questId: t.questId, reason: 'blocked', note });
    log('task_blocked', { id: t.id, note }); closeSheet(); whatNow(S.rec.avail); render();
  },
  start() {
    const r = S.rec; if (!r) return;
    if (r.define) return taskSheet(null, r.questId);
    try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); actx.resume(); } catch (e) {}
    durationSheet();
  },
  startFocus(d) {
    const m = d.m === 'custom' ? +$('#customMin').value : +d.m;
    if (!m || m < 1) return toast('Enter minutes');
    const r = S.rec;
    S.focus = { taskId: r.taskId || null, questId: r.questId || null, title: r.title, type: r.type, start: now(), dur: Math.round(m * 60), pausedAt: null, pausedMs: 0 };
    log('focus_start', { title: r.title, min: m }); save(); closeSheet(); lockScreen(); go('focus');
  },

  // focus
  pause() {
    const f = S.focus;
    if (f.pausedAt) { f.pausedMs += now() - f.pausedAt; f.pausedAt = null; } else f.pausedAt = now();
    save(); render();
  },
  finish() { ui.outcome = true; render(); },
  blocked() { ui.outcome = 'blocked'; render(); },
  backToTimer() { ui.outcome = null; render(); },
  pickOutcome(d) { ui.note = ($('#fnote') || {}).value || ''; ui.outcome = d.o; render(); },
  endFocus() {
    const f = S.focus, o = ui.outcome; if (!o || o === true) return;
    const note = $('#fnote').value.trim();
    if (f.pausedAt) { f.pausedMs += now() - f.pausedAt; f.pausedAt = null; }
    const actualMin = Math.max(1, Math.round(elapsed(f) / 60000));
    S.sessions.push({ id: uid(), taskId: f.taskId, questId: f.questId, title: f.title, kind: f.type, planned: f.dur / 60, actualMin, outcome: o, note, start: f.start, end: now() });
    log('focus_end', { outcome: o, actualMin });
    const t = f.taskId && task(f.taskId);
    let n = 0;
    if (t && o === 'completed') n = completeTask(t, true);
    else if (o === 'progress') { n = f.type === 'execute' ? XP.progress : XP.research; addXP(n, 'progress'); }
    else if (t && o === 'blocked') { t.status = 'blocked'; t.blockedNote = note; log('task_blocked', { id: t.id, note }); }
    S.focus = null; S.rec = null; ui = {};
    if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
    save(); go('home');
    if (t && o === 'completed') afterTaskDone(t, n);
    else if (n) pop(n, OUT[o].toUpperCase());
    else toast(o === 'blocked' ? 'Marked blocked. Picking something else.' : 'Logged. No judgment — it all feeds the patterns.');
  },

  // quests
  newQuest() { questSheet(null); },
  editQuest(d) { questSheet(quest(d.id)); },
  saveQuest(d) {
    const title = $('#qTitle').value.trim(); if (!title) return toast('Name it');
    const fields = { title, campaign: $('#qCamp').value, prefix: $('#qPrefix').value.trim(), due: $('#qDue').value };
    if (d.id) { Object.assign(quest(d.id), fields); save(); closeSheet(); return render(); }
    const wantSide = $('#qSide').checked;
    const create = status => { const q = makeQuest({ ...fields, status }); save(); closeSheet(); go('quest', q.id); if (status === 'active') toast('Now give it a next action.'); };
    if (wantSide) return create('side');
    guardrail(title, create, () => { makeIdea(title); save(); closeSheet(); toast('Parked in the Idea Vault.'); render(); });
  },
  activate(d) {
    const q = quest(d.id);
    guardrail(q.title, s => { q.status = s; log('quest_status', { id: q.id, status: s }); save(); closeSheet(); render(); },
      () => { closeSheet(); toast('Kept as a Side Quest.'); });
  },
  guard(d) {
    const g = ui.guard; log('guardrail_choice', { title: g.title, choice: d.c });
    if (d.c === 'replace') { const old = quest(d.id); old.status = 'side'; log('quest_status', { id: old.id, status: 'side' }); g.onGo('active'); }
    else if (d.c === 'vault') g.onVault();
    else if (d.c === 'side') g.onGo('side');
    else g.onGo('active');
  },
  setStatus(d) {
    const q = quest(d.id);
    if (d.s === 'dropped' && !confirm(`Drop "${q.title}"? It stays in your history.`)) return;
    q.status = d.s; if (d.s !== 'done') q.completedAt = null;
    log('quest_status', { id: q.id, status: d.s }); save(); render();
  },
  finishQuest(d) {
    const q = quest(d.id); completeQuest(q); save(); closeSheet(); go('quests');
    const fx = $('#fx'); fx.innerHTML = `<div class="xp-pop">QUEST COMPLETE<small>${esc(q.title)} · +${XP.quest} XP</small></div>`; setTimeout(() => { fx.innerHTML = ''; }, 2200);
  },
  newTask(d) { taskSheet(null, d.q || null); },
  editTask(d) { taskSheet(task(d.id)); },
  tType(d) { ui.taskEdit.type = d.t; document.querySelectorAll('#tType button').forEach(b => b.classList.toggle('on', b.dataset.t === d.t)); },
  saveTask() {
    const title = $('#tTitle').value.trim(); if (!title) return toast('What\'s the action?');
    const e = ui.taskEdit, fields = { title, minutes: +$('#tMin').value, due: $('#tDue').value, type: e.type, important: $('#tImp').checked, questId: $('#tQuest').value || null };
    if (e.id) Object.assign(task(e.id), fields); else makeTask(fields);
    if (S.rec && (S.rec.define || S.rec.taskId === e.id)) S.rec = null;
    save(); closeSheet(); render();
  },
  topTask(d) { const t = task(d.id), i = S.tasks.indexOf(t); S.tasks.splice(i, 1); S.tasks.unshift(t); save(); closeSheet(); render(); },
  delTask(d) { const t = task(d.id); t.status = 'dropped'; log('task_dropped', { id: t.id }); save(); closeSheet(); render(); },
  tickTask(d) { const t = task(d.id), n = completeTask(t, false); save(); render(); afterTaskDone(t, n); },
  unblock(d) { const t = task(d.id); t.status = 'open'; t.blockedNote = ''; log('task_unblocked', { id: t.id }); save(); render(); },

  // dump
  sortDump() {
    const text = $('#dumpText').value.trim(); if (!text) return toast('Dump something first');
    ui.dump = { raw: text, items: splitDump(text).map(s => ({ text: s, cat: guessCat(s), questId: guessQuest(s) })) };
    render();
  },
  dumpCat(d) { syncDump(); ui.dump.items[+d.i].cat = d.c; render(); },
  cancelDump() { ui.dump = null; render(); },
  saveDump() {
    syncDump();
    const d = ui.dump, counts = { task: 0, errand: 0, research: 0, idea: 0 }, urgent = [];
    S.dumps.push({ id: uid(), text: d.raw, createdAt: now(), items: d.items.map(i => ({ text: i.text, cat: i.cat })) });
    for (const it of d.items) {
      if (it.cat === 'toss' || !it.text.trim()) continue;
      counts[it.cat]++;
      if (it.cat === 'idea') { makeIdea(it.text); continue; }
      const isUrgent = URGENT.test(it.text);
      makeTask({ title: it.text, questId: it.cat === 'errand' ? null : it.questId || null, type: it.cat === 'research' ? 'research' : 'execute', minutes: it.cat === 'errand' ? 15 : 30, due: isUrgent ? today() : '' });
      if (isUrgent) urgent.push(it.text);
    }
    if (urgent.length) S.rec = null;  // something time-sensitive: re-rank on the way home
    log('brain_dump', counts); save();
    const parts = [counts.task && plural(counts.task, 'task'), counts.errand && plural(counts.errand, 'errand'), counts.research && plural(counts.research, 'research item'), counts.idea && plural(counts.idea, 'idea') + ' → Vault'].filter(Boolean);
    ui.dump = null; render();
    sheet(`<h3>CAPTURED</h3><div class="q">${urgent.length ? `Heads up: "${esc(urgent[0])}" looks time-sensitive. It's in the WHAT NOW mix for today.` : "Nothing here changes today's Main Quest."}</div>
      <p class="dim">${parts.join(' · ') || 'Nothing kept.'}</p>
      <button class="btn primary" data-a="go" data-v="home">BACK TO RIGHT NOW</button>`);
  },

  // vault
  vf(d) { ui.vf = d.f; render(); },
  newIdea() {
    sheet(`<h3>NEW IDEA</h3><div class="field" style="margin-top:12px"><input type="text" id="iTitle" placeholder="The idea in a few words"></div>
      <div class="field"><textarea id="iDesc" placeholder="Details (optional)" style="min-height:80px"></textarea></div>
      <button class="btn primary" data-a="saveNewIdea">PARK IT</button>`);
  },
  saveNewIdea() { const t = $('#iTitle').value.trim(); if (!t) return; makeIdea(t, $('#iDesc').value.trim()); save(); closeSheet(); render(); pop(1, 'IDEA PARKED'); },
  openIdea(d) {
    const i = S.ideas.find(x => x.id === d.id), lvl = ['', 'Low', 'Medium', 'High'];
    const seg = (key, label) => `<div class="field"><label>${label}</label><div class="seg">${lvl.slice(1).map(v => `<button class="${i[key] === v ? 'on' : ''}" data-a="ideaSet" data-id="${i.id}" data-k="${key}" data-v="${v}">${v}</button>`).join('')}</div></div>`;
    sheet(`<h3>IDEA · ${ago(i.createdAt).toUpperCase()}</h3>
      <div class="field" style="margin-top:12px"><input type="text" id="iTitle" value="${esc(i.title)}"></div>
      <div class="field"><textarea id="iDesc" placeholder="Description" style="min-height:70px">${esc(i.desc)}</textarea></div>
      ${seg('upside', 'Potential upside')}${seg('difficulty', 'Difficulty')}${seg('cost', 'Cost')}
      <div class="field"><label>Connects to</label><select id="iCamp"><option value="">—</option>${S.campaigns.map(c => `<option ${c === i.campaign ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
      <div class="field"><label>Status</label><div class="chips">${['unreviewed', 'interesting', 'later', 'rejected'].map(s => `<button class="chip ${i.status === s ? 'on' : ''}" data-a="ideaSet" data-id="${i.id}" data-k="status" data-v="${s}">${ISTAT[s]}</button>`).join('')}</div></div>
      <div class="stack"><button class="btn primary" data-a="saveIdea" data-id="${i.id}">SAVE</button>
      ${i.status !== 'promoted' ? `<button class="btn alt" data-a="promoteIdea" data-id="${i.id}">Promote to Quest</button>` : ''}</div>`);
  },
  ideaSet(d) { const i = S.ideas.find(x => x.id === d.id); syncIdea(i); i[d.k] = i[d.k] === d.v && d.k !== 'status' ? '' : d.v; save(); A.openIdea(d); },
  saveIdea(d) { const i = S.ideas.find(x => x.id === d.id); syncIdea(i); save(); closeSheet(); render(); },
  promoteIdea(d) {
    const i = S.ideas.find(x => x.id === d.id); syncIdea(i);
    guardrail(i.title, status => {
      i.status = 'promoted'; const q = makeQuest({ title: i.title, status, campaign: i.campaign || 'Build & Learn' });
      log('idea_promoted', { id: i.id, questId: q.id }); save(); closeSheet(); go('quest', q.id);
    }, () => { closeSheet(); toast('Staying in the Vault.'); save(); render(); });
  },

  // insights / data
  refreshCommits(d, el, e) { e.preventDefault(); refreshCommits(true).then(ok => { toast(ok ? 'Commits updated' : 'Couldn\'t reach GitHub'); render(); }); },
  exportBackup() {
    const name = `moemode-backup-${today()}.json`, blob = new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' });
    const file = new File([blob], name, { type: 'application/json' });
    const done = () => { S.lastBackup = now(); log('backup', {}); save(); render(); };
    if (navigator.canShare && navigator.canShare({ files: [file] })) return navigator.share({ files: [file], title: 'MoeMode backup' }).then(done).catch(() => {});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); done();
  },
  importBackup() { $('#importFile').click(); },
  reset() { if (confirm('Erase all MoeMode data on this device? Back up first if you want it.') && confirm('Really erase everything?')) { localStorage.removeItem(KEY); S = fresh(); go('setup'); } },
};
function syncDump() { document.querySelectorAll('.dtext').forEach(el => { ui.dump.items[+el.dataset.i].text = el.value; }); document.querySelectorAll('.dq').forEach(el => { ui.dump.items[+el.dataset.i].questId = el.value; }); }
function syncIdea(i) { const t = $('#iTitle'); if (!t) return; i.title = t.value.trim() || i.title; i.desc = $('#iDesc').value.trim(); i.campaign = $('#iCamp').value; }

document.addEventListener('click', e => {
  const el = e.target.closest('[data-a]'); if (!el || el.disabled) return;
  const fn = A[el.dataset.a]; if (fn) fn(el.dataset, el, e);
});
document.addEventListener('input', e => {
  if (e.target.id === 'prog') { const q = quest(e.target.dataset.q); q.progress = +e.target.value; $('#pv').textContent = q.progress + '%'; save(); }
  if (e.target.id === 'repo') { S.settings.repo = e.target.value.trim(); S.commits.fetchedAt = 0; save(); }
});
$('#importFile').addEventListener('change', e => {
  const f = e.target.files[0]; if (!f) return;
  f.text().then(txt => {
    const d = JSON.parse(txt); if (!d || !d.version || !Array.isArray(d.quests)) throw 0;
    if (S.setupDone && !confirm('Replace everything on this device with this backup?')) return;
    S = Object.assign(fresh(), d); S.focus = null; save(); go('home'); toast('Backup restored');
  }).catch(() => toast('That file isn\'t a MoeMode backup')).finally(() => { e.target.value = ''; });
});

render();
if (S.setupDone) refreshCommits().then(ok => { if (ok && view !== 'focus') render(); });
