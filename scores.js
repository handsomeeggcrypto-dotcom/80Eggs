/* Shared high scores for the 81eggs games. Talks to /api/scores (api/scores.py).

   Scores.gameOver(board, score)  call when a run ends. Sends the score if the
                                  player has a name, otherwise asks for one once.
   Scores.open(board)             show the top 10 for a board.
   Scores.rankText(board)         "🌍 #3 on the leaderboard" after a run, or "".
   Scores.isOpen()                true while the window is up (games ignore input).

   Boards: tomochi-classic, tomochi-rush, moto-normal, moto-portal.
   The player's name lives in localStorage ("eggs_name"), shared by every game. */
const Scores = (() => {
  const API = "/api/scores";
  const NAME_KEY = "eggs_name", ASKED_KEY = "eggs_name_asked";
  const TITLES = {
    "tomochi-classic": "TOMOCHI POP · CLASSIC", "tomochi-rush": "TOMOCHI POP · RUSH",
    "moto-normal": "MOETORCYCLES · NORMAL", "moto-portal": "MOETORCYCLES · PORTAL",
  };
  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  };
  // each game's own saved best, sent up when a player first adds their name
  const LOCAL_BEST = {
    "tomochi-classic": "bubblepop_best_classic", "tomochi-rush": "bubblepop_best_rush",
    "moto-normal": "moetorcycles_best", "moto-portal": "moetorcycles_best_portal",
  };
  const last = {};   // board → { rank, score } from this visit's last send
  let box = null, open = false, board = null, pending = null;

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const cleanName = (s) => String(s || "").replace(/\s+/g, " ").trim().toUpperCase().replace(/[^A-Z0-9 ._!?-]/g, "").slice(0, 12);

  async function call(method, body) {
    const url = method === "GET" ? `${API}?board=${encodeURIComponent(body.board)}` : API;
    const r = await fetch(url, method === "GET" ? {} : {
      method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || "offline");
    return j;
  }

  function send(b, score) {
    const name = ls.get(NAME_KEY);
    if (!name || !(score > 0)) return Promise.resolve(null);
    return call("POST", { board: b, name, score: Math.floor(score) }).then((j) => {
      last[b] = { rank: j.rank, score };
      return j;
    });
  }

  // ---- the window ----------------------------------------------------------
  function build() {
    const css = document.createElement("style");
    css.textContent = `
      #eggScores { position: fixed; inset: 0; z-index: 1000; display: none; align-items: center; justify-content: center;
        background: rgba(10,2,30,0.72); font-family: "Trebuchet MS", system-ui, sans-serif; color: #fff;
        touch-action: manipulation; }
      #eggScores.on { display: flex; }
      #eggScores .card { width: min(420px, calc(100vw - 32px)); max-height: calc(100vh - 32px); overflow: auto;
        background: #2a1648; border: 3px solid #ff5bd0; border-radius: 18px; padding: 18px 18px 16px;
        box-shadow: 0 0 40px rgba(255,91,208,0.45); }
      #eggScores h2 { margin: 0; font-size: 22px; text-align: center; color: #ffe066; }
      #eggScores .sub { margin: 4px 0 12px; font-size: 13px; text-align: center; color: #c9b8ff; letter-spacing: 1px; }
      #eggScores ol { list-style: none; margin: 0; padding: 0; }
      #eggScores li { display: flex; gap: 10px; padding: 7px 10px; border-radius: 10px; font-size: 17px; font-weight: bold; }
      #eggScores li:nth-child(odd) { background: rgba(255,255,255,0.06); }
      #eggScores li.me { background: rgba(125,255,155,0.22); outline: 2px solid #7dff9b; }
      #eggScores li .n { width: 2.2em; color: #ffe066; }
      #eggScores li .who { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      #eggScores .msg { text-align: center; padding: 18px 6px; color: #c9b8ff; font-size: 15px; }
      #eggScores form { margin: 0 0 14px; text-align: center; }
      #eggScores form p { margin: 0 0 8px; font-size: 15px; }
      #eggScores input { width: 100%; box-sizing: border-box; font: bold 20px "Trebuchet MS", sans-serif; text-align: center;
        text-transform: uppercase; padding: 9px; border-radius: 10px; border: 2px solid #5bc8ff; background: #14002b; color: #fff;
        -webkit-user-select: text; user-select: text; }
      #eggScores .row { display: flex; gap: 10px; margin-top: 12px; }
      #eggScores button { flex: 1; font: bold 16px "Trebuchet MS", sans-serif; padding: 11px; border-radius: 22px; cursor: pointer;
        border: 2px solid #ff5bd0; background: rgba(255,91,208,0.18); color: #fff; }
      #eggScores button.go { background: #ff5bd0; }
      #eggScores .rename { display: block; margin: 10px auto 0; background: none; border: none; color: #c9b8ff;
        font-size: 13px; text-decoration: underline; padding: 4px; flex: none; }`;
    document.head.appendChild(css);
    box = document.createElement("div");
    box.id = "eggScores";
    document.body.appendChild(box);
    // taps outside the card close it; nothing reaches the game underneath
    for (const ev of ["pointerdown", "pointerup", "touchstart", "touchend", "mousedown", "click"]) {
      box.addEventListener(ev, (e) => e.stopPropagation());
    }
    box.addEventListener("click", (e) => { if (e.target === box) close(); });
    // keys go to the window, not the game, while it's open
    window.addEventListener("keydown", (e) => {
      if (!open) return;
      e.stopImmediatePropagation();
      if (e.key === "Escape") { e.preventDefault(); close(); }
      else if (e.key === "Enter" && e.target.tagName === "INPUT") { e.preventDefault(); saveName(); }
    }, true);
    window.addEventListener("keyup", (e) => { if (open) e.stopImmediatePropagation(); }, true);
  }

  function render(state) {
    const me = ls.get(NAME_KEY);
    const typing = box.querySelector("#eggName");   // keep what's typed when the list arrives
    const typed = typing ? typing.value : me || "";
    let html = `<div class="card"><h2>🏆 LEADERBOARD</h2><div class="sub">${esc(TITLES[board] || board)}</div>`;
    if (state.ask) {
      html += `<form onsubmit="return false"><p>${state.score ? `You scored <b>${state.score}</b>! ` : ""}Put your name on the board?</p>
        <input id="eggName" maxlength="12" autocomplete="off" autocapitalize="characters" spellcheck="false"
          placeholder="YOUR NAME" value="${esc(typed)}">
        <div class="row"><button type="button" data-act="skip">${me ? "Cancel" : "No thanks"}</button>
        <button type="button" class="go" data-act="save">Save</button></div></form>`;
    }
    if (state.error) html += `<div class="msg">${esc(state.error)}</div>`;
    else if (!state.top) html += `<div class="msg">Loading…</div>`;
    else if (!state.top.length) html += `<div class="msg">No scores yet. Be the first!</div>`;
    else {
      html += "<ol>" + state.top.map((r, i) =>
        `<li class="${r.name === me ? "me" : ""}"><span class="n">${i + 1}.</span><span class="who">${esc(r.name)}</span><span>${r.score}</span></li>`
      ).join("") + "</ol>";
    }
    if (!state.ask) {
      html += `<div class="row"><button type="button" class="go" data-act="close">OK</button></div>`;
      html += `<button type="button" class="rename" data-act="rename">${me ? `Playing as ${esc(me)} · change name` : "Add your name"}</button>`;
    }
    box.innerHTML = html + "</div>";
    box.querySelectorAll("button[data-act]").forEach((b) => {
      b.addEventListener("click", () => {
        const a = b.dataset.act;
        if (a === "close") close();
        else if (a === "save") saveName();
        else if (a === "skip") { ls.set(ASKED_KEY, "1"); pending = null; show({}); }
        else if (a === "rename") show({ ask: true });
      });
    });
    const inp = box.querySelector("#eggName");
    if (inp) {
      inp.addEventListener("input", () => { const p = inp.selectionStart; inp.value = cleanName(inp.value); inp.setSelectionRange(p, p); });
      if (!typing) setTimeout(() => inp.focus(), 50);
      else if (document.activeElement === document.body) { inp.focus(); inp.setSelectionRange(typed.length, typed.length); }
    }
  }

  let view = {};
  function show(state) {
    view = state;
    render(view);
    if (state.top || state.error) return;
    const b = board, v = state, still = () => board === b && open && view === v;
    call("GET", { board: b })
      .then((j) => { if (still()) show({ ...v, top: j.top }); })
      .catch(() => { if (still()) show({ ...v, error: "Can't reach the leaderboard right now." }); });
  }

  function saveName() {
    const inp = box.querySelector("#eggName");
    const name = cleanName(inp && inp.value);
    if (!name) { if (inp) inp.focus(); return; }
    ls.set(NAME_KEY, name);
    ls.set(ASKED_KEY, "1");
    const score = Math.max(pending ? pending.score : 0, +ls.get(LOCAL_BEST[board]) || 0);
    pending = null;
    render({});
    if (score > 0) {
      send(board, score)
        .then((j) => show(j ? { top: j.top } : {}))
        .catch((e) => show({ error: "Couldn't save: " + e.message }));
    } else show({});
  }

  function openBoard(b, state) {
    if (!box) build();
    board = b; open = true;
    box.classList.add("on");
    show(state || {});
  }
  function close() {
    open = false; pending = null;
    if (box) { box.classList.remove("on"); box.innerHTML = ""; }
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }

  return {
    gameOver(b, score) {
      score = Math.floor(score);
      delete last[b];
      if (!(score > 0)) return;
      if (ls.get(NAME_KEY)) { send(b, score).catch(() => {}); return; }
      if (ls.get(ASKED_KEY)) return;
      pending = { score };
      openBoard(b, { ask: true, score });
    },
    open(b) { openBoard(b); },
    isOpen: () => open,
    rankText(b) { const r = last[b]; return r && r.rank ? `🌍 #${r.rank} on the leaderboard` : ""; },
  };
})();
