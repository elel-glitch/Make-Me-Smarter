// DEV_MODE = true: every page load gives a fresh round, and "done" shows an "Another round" button.
// Set it to false before you launch to get the real "one set per day" behaviour.
const DEV_MODE = true;

let CARDS = [];

// ---------- Answer matching ----------
const norm = s => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();

function distance(a, b) {
  const d = Array.from({length: a.length + 1}, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i-1][j] + 1, d[i][j-1] + 1, d[i-1][j-1] + (a[i-1] === b[j-1] ? 0 : 1));
  return d[a.length][b.length];
}

// Returns {ok, typo}. Numbers must be exact; words allow small typos.
function match(typed, card) {
  const t = norm(typed);
  for (const raw of (card.accept || [card.a])) {
    const c = norm(raw);
    if (t === c || t.replace(/ /g, "") === c.replace(/ /g, "")) return {ok: true, typo: false};
    if (/\d/.test(c)) continue;
    const allowed = c.length >= 9 ? 2 : c.length >= 5 ? 1 : 0;
    if (allowed && distance(t, c) <= allowed) return {ok: true, typo: true};
  }
  return {ok: false, typo: false};
}

// ---------- State (saved in localStorage) ----------
const KEY = "dailyfive:v1";
const dayStr = (d = new Date()) => d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
const shuffle = a => a.map(x => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map(x => x[1]);
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} };

let state = load();
state.cards ||= {}; state.days ||= {}; state.streak ||= 0;
const today = dayStr();
let day, phase = "ask", res = null, resultAt = 0;

function buildToday() {
  const seen = CARDS.filter(c => state.cards[c.id]);
  const unseen = CARDS.filter(c => !state.cards[c.id]);
  const review = shuffle(seen).sort((a, b) => state.cards[a.id].box - state.cards[b.id].box).slice(0, 2);
  const fresh = shuffle(unseen).slice(0, 3);
  const set = [...fresh.map(c => ({id:c.id, type:"new"})), ...review.map(c => ({id:c.id, type:"review"}))];
  const used = new Set(set.map(s => s.id));
  for (const c of shuffle(CARDS)) {
    if (set.length >= 5) break;
    if (!used.has(c.id)) { set.push({id:c.id, type: state.cards[c.id] ? "review" : "new"}); used.add(c.id); }
  }
  return set.sort((a, b) => (a.type === "new" ? 0 : 1) - (b.type === "new" ? 0 : 1));
}

function newRound() {
  state.days[today] = {set: buildToday(), idx: 0, score: 0};
  day = state.days[today];
  phase = "ask";
  save();
}

// ---------- UI ----------
const view = document.getElementById("view");
const bar = document.getElementById("bar");
const esc = s => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

function render() {
  document.getElementById("streak").textContent = state.streak ? "🔥 " + state.streak + " day streak" : "";
  bar.style.width = (day.idx / day.set.length * 100) + "%";
  if (day.idx >= day.set.length) return renderDone();

  const item = day.set[day.idx];
  const card = CARDS.find(c => c.id === item.id);
  const head = '<div class="tags"><span class="tag ' + item.type + '">' + (item.type === "new" ? "NEW" : "REVIEW") + '</span>' +
    '<span class="tag">' + esc(card.cat) + '</span><span class="tag">' + (day.idx + 1) + '/' + day.set.length + '</span></div>' +
    '<p class="q">' + esc(card.q) + '</p>';

  const fields = card.fields || [{a: card.a, accept: card.accept}];
  if (phase === "ask") {
    view.innerHTML = head + fields.map((f, i) =>
      (f.label ? '<p class="lbl">' + esc(f.label) + '</p>' : '') +
      '<input class="inp" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="' + (f.label ? esc(f.label) : "Type your answer") + '">').join("") +
      '<button id="check">Check</button>';
    const inps = [...view.querySelectorAll(".inp")];
    inps[0].focus();
    const submit = () => {
      const empty = inps.find(i => !i.value.trim());
      if (empty) { empty.focus(); return; }
      const parts = fields.map((f, i) => ({typed: inps[i].value, ...match(inps[i].value, f)}));
      res = {parts, ok: parts.every(p => p.ok), typo: parts.some(p => p.typo)};
      phase = "result"; resultAt = Date.now(); render();
    };
    document.getElementById("check").onclick = submit;
    inps.forEach((inp, i) => inp.onkeydown = e => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      if (i < inps.length - 1) inps[i + 1].focus(); else submit();
    });
  } else {
    const msg = res.ok ? (res.typo ? "Correct (watch the spelling)" : "Correct!") : "Not quite";
    view.innerHTML = head +
      '<p class="status ' + (res.ok ? "ok" : "no") + '">' + msg + '</p>' +
      fields.map((f, i) => '<p class="a">' + (f.label ? esc(f.label) + ': ' : '') + esc(f.a) + (res.parts[i].ok ? ' ✓' : '') + '</p>').join("") +
      (res.ok ? "" : '<p class="muted">You typed: ' + res.parts.map(x => esc(x.typed)).join(" / ") + '</p>') +
      '<div class="row">' + (res.ok ? "" : '<button class="alt" id="override">I was right</button>') + '<button id="next">Next (Enter)</button></div>';
    document.getElementById("next").onclick = () => answer(card, res.ok);
    const o = document.getElementById("override");
    if (o) o.onclick = () => { res.ok = true; render(); };
  }
}

function answer(card, correct) {
  const prev = state.cards[card.id] || {box: 0};
  state.cards[card.id] = {box: correct ? Math.min(prev.box + 1, 4) : 0};
  if (correct) day.score++;
  day.idx++;
  phase = "ask";
  if (day.idx >= day.set.length) finishDay();
  save(); render();
}

function finishDay() {
  if (state.last === today) return;
  const y = new Date(); y.setDate(y.getDate() - 1);
  state.streak = state.last === dayStr(y) ? state.streak + 1 : 1;
  state.last = today;
}

function renderDone() {
  bar.style.width = "100%";
  view.innerHTML = '<p class="big">' + day.score + '/' + day.set.length + '</p><p class="q">Done for today. 🎉</p>' +
    '<p class="muted">You have seen ' + Object.keys(state.cards).length + ' of ' + CARDS.length + ' cards. Come back tomorrow for 3 new ones and 2 to review.</p>' +
    (DEV_MODE ? '<div class="row" style="margin-top:16px"><button id="again">Another round (dev mode)</button></div>' : '');
  const again = document.getElementById("again");
  if (again) again.onclick = () => { newRound(); render(); };
}

// Test mode: open the page with ?test on the end of the URL to get unlimited new rounds
if (new URLSearchParams(location.search).has("test")) {
  const nr = document.getElementById("newround");
  nr.style.display = "block";
  nr.onclick = () => {
    state.days[today] = {set: buildToday(), idx: 0, score: 0};
    day = state.days[today]; phase = "ask"; save(); render();
  };
}

document.getElementById("reset").onclick = () => {
  if (confirm("Delete all progress?")) { try { localStorage.removeItem(KEY); } catch {} location.reload(); }
};

// Enter on the result screen = Next (ignores the Enter press that submitted the answer)
document.addEventListener("keydown", e => {
  if (e.key !== "Enter" || e.repeat || phase !== "result" || Date.now() - resultAt < 300) return;
  e.preventDefault();
  answer(CARDS.find(c => c.id === day.set[day.idx].id), res.ok);
});

// ---------- Start: load cards.json, then run ----------
fetch("cards.json")
  .then(r => r.json())
  .then(data => {
    CARDS = data;
    if (DEV_MODE || !state.days[today]) newRound(); else day = state.days[today];
    render();
  })
  .catch(() => { view.textContent = "Could not load cards.json. Open the app through Live Server (not by double-clicking the file)."; });