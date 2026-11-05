/* 80Eggs 90s kit. One line makes a page 90s:

     <script src="/retro.js" data-kit="stars sparkles ring counter"></script>

   Pick the pieces in data-kit (leave it out to get "sparkles ring"):
     stars     tiled starfield behind the page
     sparkles  a twinkly trail behind the mouse (skipped on touch screens and for reduced motion)
     ring      the 80Eggs Webring bar (◀ prev · random · next ▶)
     counter   an old-school visitor counter inside the webring bar

   Put <div data-retro-ring></div> where the bar should go, or add data-ring-in=".some-box" to the script tag
   to put it at the end of that box (handy when the page's body is a flex row). Otherwise it goes at the end of the page,
   and <span data-retro-counter></span> anywhere for a counter on its own.
   The counter is just for fun: it lives in each visitor's browser, it isn't a real count. */
(function () {
  "use strict";
  var me = document.currentScript;
  var kit = ((me && me.getAttribute("data-kit")) || "sparkles ring").split(/\s+/);
  var on = function (k) { return kit.indexOf(k) >= 0; };

  // The webring, in order. Add new pages here.
  var RING = [
    { name: "MoeSpace", path: "/", icon: "🥚" },
    { name: "The Blorp Museum", path: "/blorps/", icon: "🛸" },
    { name: "Blorp Patrol", path: "/blorps/patrol.html", icon: "🚀" },
    { name: "Moekedex", path: "/moekedex/", icon: "💛" },
    { name: "Dream Things", path: "/dreamthings/", icon: "☁️" },
    { name: "Tomochi Pop", path: "/bubbles/", icon: "🫧" },
    { name: "MOEtorcycles", path: "/moetorcycles/", icon: "🏍️" },
    { name: "Defend Your LLC", path: "/moecastle/", icon: "🏰" },
    { name: "MoeFights", path: "/moe_fights.html", icon: "⚔️" },
    { name: "Smoke Break", path: "/smokebreak.html", icon: "🚬" },
    { name: "Egg Defend", path: "/eggdefend.html", icon: "🥚" },
    { name: "Sudoku", path: "/sudoku.html", icon: "🔢" },
    { name: "Typing Terminal", path: "/typing.html", icon: "⌨️" },
    { name: "Egg Control Panel", path: "/crypto.html", icon: "📡" },
    { name: "The Nest", path: "/nest.html", icon: "🪺" }
  ];

  var store = function (k, v) {
    try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) {}
    return null;
  };
  var reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  var css = [
    ".retro-stars{background-color:#050522!important;background-image:",
    "radial-gradient(1px 1px at 12px 18px,#fff 99%,transparent),",
    "radial-gradient(1px 1px at 70px 90px,#9fe0ff 99%,transparent),",
    "radial-gradient(2px 2px at 140px 40px,#fff 99%,transparent),",
    "radial-gradient(1px 1px at 180px 150px,#ffff99 99%,transparent),",
    "radial-gradient(1px 1px at 40px 170px,#fff 99%,transparent),",
    "radial-gradient(1px 1px at 110px 130px,#fff 99%,transparent)!important;",
    "background-size:200px 200px!important}",
    ".retro-sparkle{position:fixed;pointer-events:none;z-index:2147483646;font:14px/1 sans-serif;animation:retro-fall .8s linear forwards}",
    "@keyframes retro-fall{to{transform:translateY(30px) scale(.3);opacity:0}}",
    ".retro-ring{box-sizing:border-box;display:block;max-width:560px;margin:24px auto 16px;padding:8px 12px;text-align:center;",
    "background:#200020;border:3px ridge #ff66cc;color:#fff;font:14px/1.5 'Comic Sans MS','Chalkboard SE',cursive}",
    ".retro-ring a{color:#39ff14;text-decoration:underline}.retro-ring a:visited{color:#ff66cc}",
    ".retro-ring .rr-title{font-weight:bold;color:#ffff33;white-space:nowrap}",
    ".retro-ring .rr-row{display:flex;flex-wrap:wrap;justify-content:center;gap:4px 12px;align-items:baseline}",
    ".retro-ring .rr-here{display:block;font-size:12px;color:#c0c0c0;margin-top:2px}",
    ".retro-ring .rr-count{display:block;margin-top:6px;font-size:12px;color:#c0c0c0}",
    ".retro-counter{display:inline-flex;gap:2px;vertical-align:middle}",
    ".retro-counter b{background:#000;color:#39ff14;font:bold 16px 'Courier New',monospace;padding:1px 4px;border:1px solid #555}"
  ].join("");
  var st = document.createElement("style");
  st.textContent = css;
  document.head.appendChild(st);

  function ready(fn) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn); else fn();
  }

  // ---- visitor counter (pretend, per browser) ----
  var visits = (+store("retro_visits") || 0) + 1;
  store("retro_visits", visits);
  function counterHTML() {
    var days = Math.floor(Date.now() / 864e5) - 20400;
    var n = String(4096 + Math.max(0, days) * 13 + visits).padStart(7, "0");
    return '<span class="retro-counter" aria-label="visitor number ' + (+n) + '">' +
      n.split("").map(function (d) { return "<b>" + d + "</b>"; }).join("") + "</span>";
  }

  // ---- webring ----
  function here() {
    var p = location.pathname.replace(/index\.html$/, "");
    for (var i = 0; i < RING.length; i++) if (RING[i].path === p || RING[i].path === p + "/") return i;
    return -1;
  }
  function ringHTML() {
    var i = here(), n = RING.length;
    var prev = RING[(i < 0 ? 0 : i - 1 + n) % n], next = RING[(i + 1) % n];
    var others = RING.filter(function (_, k) { return k !== i; });
    var rnd = others[Math.floor(Math.random() * others.length)];
    var link = function (s, text) { return '<a href="' + s.path + '">' + text + "</a>"; };
    return '<div class="rr-row">' +
      link(prev, "◀ " + prev.name) +
      '<span class="rr-title">~ 80Eggs Webring ~</span>' +
      link(next, next.name + " ▶") +
      "</div>" +
      '<span class="rr-here">' + (i >= 0 ? "you are at site " + (i + 1) + " of " + n + " · " : "") +
      link(rnd, "🎲 random site") + " · " + link(RING[0], "list") + "</span>" +
      (on("counter") ? '<span class="rr-count">you are visitor ' + counterHTML() + "</span>" : "");
  }

  ready(function () {
    if (on("stars")) { document.documentElement.classList.add("retro-stars"); document.body.classList.add("retro-stars"); }

    document.querySelectorAll("[data-retro-counter]").forEach(function (el) { el.innerHTML = counterHTML(); });

    if (on("ring")) {
      var inSel = me && me.getAttribute("data-ring-in");
      var spot = document.querySelector("[data-retro-ring]") || (inSel && document.querySelector(inSel));
      var bar = document.createElement("nav");
      bar.className = "retro-ring";
      bar.setAttribute("aria-label", "80Eggs Webring");
      bar.innerHTML = ringHTML();
      if (spot) spot.appendChild(bar); else document.body.appendChild(bar);
    }

    if (on("sparkles") && !reduced && window.matchMedia && matchMedia("(pointer: fine)").matches) {
      var last = 0, shapes = ["✦", "✧", "★", "·"], colors = ["#3fa9ff", "#9fe0ff", "#39ff14", "#ffff33", "#ff66cc"];
      document.addEventListener("mousemove", function (e) {
        var now = Date.now();
        if (now - last < 45) return;
        last = now;
        var s = document.createElement("span");
        s.className = "retro-sparkle";
        s.setAttribute("aria-hidden", "true");
        s.textContent = shapes[Math.floor(Math.random() * shapes.length)];
        s.style.left = e.clientX + 6 + "px";
        s.style.top = e.clientY + 6 + "px";
        s.style.color = colors[Math.floor(Math.random() * colors.length)];
        document.body.appendChild(s);
        setTimeout(function () { s.remove(); }, 800);
      }, { passive: true });
    }
  });
})();
