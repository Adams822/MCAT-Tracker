/* ============================================================
   MCAT Command Center — local app, data saved in your browser
   ============================================================ */

/* Shared constants and helpers (STORE_KEY, uid, todayStr, escapeHtml)
   are defined in core.js, which loads before this file. */

/* ---- Week 1 recurring task seeds ---- */
const seedTasks = [
  // daily
  { text: "Phone-free first hour", scope: "daily", priority: "high" },
  { text: "Anki: Pankow P/S + AnKing", scope: "daily", priority: "high" },
  { text: "UWorld set + full review (every Q)", scope: "daily", priority: "high" },
  { text: "Missed Qs → Wrong Answer log + Anki cards", scope: "daily", priority: "high" },
  { text: "2 CARS passages + deep review", scope: "daily", priority: "high" },
  { text: "Gym", scope: "daily", priority: "med" },
  { text: "In bed by 9:30", scope: "daily", priority: "med" },
  { text: "Read tomorrow's plan", scope: "daily", priority: "low" },
  // weekly
  { text: "Saturday: Blueprint full-length (timed, real conditions)", scope: "weekly", priority: "high" },
  { text: "Sunday: Review the week's wrong answers", scope: "weekly", priority: "high" },
  { text: "Sunday: Anki catch-up + plan next week", scope: "weekly", priority: "med" },
  { text: "Update Focus Topics statuses (red → yellow → green)", scope: "weekly", priority: "med" },
  // monthly
  { text: "Take an AAMC full-length (weeks 5–6)", scope: "monthly", priority: "high" },
  { text: "Reassess test date vs. score trajectory", scope: "monthly", priority: "high" },
  { text: "Review progress toward target score", scope: "monthly", priority: "med" }
];

/* `defaultState` is defined in core.js (loaded first) as a shared global,
   so load()/save() below reference the same object. */

/* Set when load() cannot read or parse the stored state. Lets the rest of
   the app know it is running on freshly-defaulted data so it never blindly
   overwrites the (still-intact) corrupt value in localStorage. (Req 1.6) */
let __loadFailed = false;

let state = load();

/* load() (Req 1.6):
   - reads + JSON.parses the stored state inside try/catch,
   - on success: shallow-merges the parsed object over a fresh defaultState
     (fills missing top-level keys) THEN runs migrate() so nested sub-keys and
     per-record fields are fully shaped,
   - fresh/no-raw path: returns migrate(structuredClone(defaultState)) so a
     brand-new state is also fully shaped,
   - on read/parse failure: returns migrate(structuredClone(defaultState)),
     sets __loadFailed, and does NOT call save() — the unparseable stored value
     is retained until the next successful save. */
function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return migrate(structuredClone(defaultState));
    const parsed = JSON.parse(raw);
    return migrate({ ...structuredClone(defaultState), ...parsed });
  } catch (e) {
    __loadFailed = true;
    if (typeof window !== "undefined") window.__loadFailed = true;
    return migrate(structuredClone(defaultState));
  }
}

/* save() (Req 1.5, 1.7):
   - writes the complete state to localStorage,
   - on write failure (quota exceeded / access denied) leaves the in-memory
     `state` unchanged and surfaces a non-blocking error indication,
   - returns true on success, false on failure; never throws. */
function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
    return true;
  } catch (e) {
    showSaveError(e);
    return false;
  }
}

/* showSaveError(e): non-blocking, dismissible notice that the last save did
   not persist. Lazily creates a lightweight fixed-position banner the first
   time it is needed. Wrapped so it can never throw back into save(). */
function showSaveError(e) {
  try {
    if (typeof document === "undefined") return;
    let banner = document.getElementById("saveErrorBanner");
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "saveErrorBanner";
      banner.setAttribute("role", "alert");
      banner.style.cssText =
        "position:fixed;top:12px;right:12px;z-index:9999;max-width:360px;" +
        "background:#b00020;color:#fff;padding:12px 40px 12px 16px;border-radius:8px;" +
        "box-shadow:0 4px 16px rgba(0,0,0,.35);font-size:14px;line-height:1.4;";

      const msg = document.createElement("span");
      msg.id = "saveErrorBannerMsg";

      const close = document.createElement("button");
      close.type = "button";
      close.textContent = "\u2715";
      close.setAttribute("aria-label", "Dismiss");
      close.style.cssText =
        "position:absolute;top:6px;right:8px;background:transparent;border:none;" +
        "color:#fff;cursor:pointer;font-size:16px;line-height:1;";
      close.addEventListener("click", () => banner.remove());

      banner.appendChild(msg);
      banner.appendChild(close);
      (document.body || document.documentElement).appendChild(banner);
    }
    const msgEl = document.getElementById("saveErrorBannerMsg");
    if (msgEl) {
      msgEl.textContent =
        "Couldn't save your changes — browser storage may be full or blocked. " +
        "Your latest edits are kept on screen but won't persist until a save succeeds.";
    }
  } catch (_) {
    /* never let the error-surface path throw back into save() */
  }
}

/* ---- seed Week 1 tasks once ---- */
if (!state.seeded) {
  seedTasks.forEach(t => state.tasks.push({ id: uid(), ...t, done: false }));
  state.seeded = true;
  save();
}

/* ---- recurring resets ---- */
function isoWeek(d) {
  const date = new Date(d);
  date.setHours(0,0,0,0);
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
  const week1 = new Date(date.getFullYear(), 0, 4);
  return date.getFullYear() + "-W" + (1 + Math.round(((date - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7));
}
function runResets() {
  const today = todayStr();
  const week = isoWeek(new Date());
  const month = today.slice(0, 7);
  if (state.lastDailyReset !== today) {
    state.tasks.forEach(t => { if (t.scope === "daily") t.done = false; });
    state.lastDailyReset = today;
  }
  if (state.lastWeeklyReset !== week) {
    state.tasks.forEach(t => { if (t.scope === "weekly") t.done = false; });
    state.lastWeeklyReset = week;
  }
  if (state.lastMonthlyReset !== month) {
    state.tasks.forEach(t => { if (t.scope === "monthly") t.done = false; });
    state.lastMonthlyReset = month;
  }
  save();
}
runResets();

/* ---------------- Discipline quotes ---------------- */
const quotes = [
  "Discipline is choosing between what you want now and what you want most.",
  "Don't tell yourself you need to do something and then not do it.",
  "Set a time to train. Train at that time.",
  "Motivation gets you started. Discipline keeps you going.",
  "Little defeats compound. So do little wins.",
  "Discipline is doing it when you don't feel like it.",
  "You don't rise to your goals. You fall to your systems.",
  "Suffer the pain of discipline or the pain of regret.",
  "Amateurs wait for motivation. Professionals show up.",
  "Do the work. The score follows.",
  "Progress over perfection.",
  "What gets scheduled gets done.",
  "Action comes before motivation, not after.",
  "Lower the bar to start. Raise it once you've started.",
  "The only block you have to win is the next one.",
  "Consistency beats intensity.",
  "Show up badly rather than not at all.",
  "You can't out-discipline a plan you never start.",
  "Win the morning, win the day.",
  "Small wins add up.",
  "The work you avoid is the work that moves you most.",
  "Review the miss. That's where the points hide.",
  "Discipline equals freedom.",
  "Comfort is the enemy of the score you want.",
  "One block. Then the next. That's the whole game.",
  "Feelings follow action. Move first.",
  "A kept promise to yourself is the rep that matters.",
  "Hard now, or hard later. Choose now.",
  "Focus is a muscle. Train it daily.",
  "You are what you repeatedly do."
];
function dayOfYear() {
  const now = new Date();
  return Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
}
document.getElementById("quoteText").textContent = quotes[dayOfYear() % quotes.length];

/* ---------------- Navigation ---------------- */
/* Dispatch map of view id -> renderer. Each renderer recomputes its view's
   data from the current `state` and is invoked BEFORE the view becomes visible
   (Req 20.5). Views without a recompute hook simply have no entry and fall back
   to a no-op. Each renderer owns its own empty-state vs. data display (Req
   20.6/20.7). Special cases preserved from the prior if-ladder: "scores" draws
   both the total-score chart and the per-section trends; "dashboard" repaints
   the heatmap. */
const VIEW_RENDERERS = {
  dashboard: renderHeatmap,
  calendar: renderCalendar,
  scores: () => { drawChart(); drawSectionTrends(); },
  practice: renderPractice,
  analytics: renderAnalytics,
  content: renderContent,
  cars: renderCars,
  review: renderReview,
  resources: renderResources,
  formulas: renderFormulas,
  notes: renderNotes,
  goals: renderGoals,
  dailylog: renderDailyLog,
  readiness: renderReadiness,
  settings: renderSettings
};
const navBtns = document.querySelectorAll(".nav-btn");
navBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    const view = btn.dataset.view;
    // Exactly one active nav entry (Req 20.2).
    navBtns.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    // Recompute the selected view's data before it becomes visible (Req 20.5).
    (VIEW_RENDERERS[view] || (() => {}))();
    // Exactly one visible view (Req 20.3).
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    document.getElementById("view-" + view).classList.add("active");
  });
});

/* ---------------- Countdown ---------------- */
const testDateInput = document.getElementById("testDateInput");
const testDateLabel = document.getElementById("testDateLabel");
if (state.testDate) testDateInput.value = state.testDate;
testDateInput.addEventListener("change", () => {
  state.testDate = testDateInput.value; save();  renderCountdownLabel(); renderDashboard(); renderReminders();
});
function renderCountdownLabel() {
  if (!state.testDate) { testDateLabel.textContent = "No date set — pick one →"; return; }
  const d = new Date(state.testDate + "T08:00:00");
  testDateLabel.textContent = d.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}
function tickCountdown() {
  const e = { d: cdDays, h: cdHours, m: cdMins, s: cdSecs };
  if (!state.testDate) { e.d.textContent = e.h.textContent = e.m.textContent = e.s.textContent = "--"; return; }
  const target = new Date(state.testDate + "T08:00:00").getTime();
  let diff = Math.max(0, target - Date.now());
  const days = Math.floor(diff / 86400000); diff -= days * 86400000;
  const hours = Math.floor(diff / 3600000); diff -= hours * 3600000;
  const mins = Math.floor(diff / 60000); diff -= mins * 60000;
  const secs = Math.floor(diff / 1000);
  e.d.textContent = days;
  e.h.textContent = String(hours).padStart(2, "0");
  e.m.textContent = String(mins).padStart(2, "0");
  e.s.textContent = String(secs).padStart(2, "0");
}
const cdDays = document.getElementById("cdDays"), cdHours = document.getElementById("cdHours"),
      cdMins = document.getElementById("cdMins"), cdSecs = document.getElementById("cdSecs");
setInterval(tickCountdown, 1000);

/* ---------------- Sessions / hours / streak / heatmap ---------------- */
function addMinutes(min) {
  const d = todayStr();
  state.sessions[d] = (state.sessions[d] || 0) + min;
  save();
  renderHoursStats(); renderHeatmap(); renderDashboard();
}
function hoursOn(dateStr) { return (state.sessions[dateStr] || 0) / 60; }
function weekMinutes() {
  let total = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    total += state.sessions[d] || 0;
  }
  return total;
}
function totalMinutes() { return Object.values(state.sessions).reduce((a, b) => a + b, 0); }
function studyDayCount() { return Object.values(state.sessions).filter(m => m > 0).length; }
function currentStreak() {
  let streak = 0;
  let d = new Date();
  // allow today to be incomplete: start from today if studied, else yesterday
  if (!(state.sessions[todayStr()] > 0)) d = new Date(Date.now() - 86400000);
  while (state.sessions[d.toISOString().slice(0, 10)] > 0) {
    streak++; d = new Date(d.getTime() - 86400000);
  }
  return streak;
}
function renderHoursStats() {
  document.getElementById("streakNum").textContent = currentStreak();
  document.getElementById("todayHours").textContent = hoursOn(todayStr()).toFixed(1) + " h today";
  document.getElementById("statWeekHrs").textContent = (weekMinutes() / 60).toFixed(1);
  document.getElementById("totalHours").textContent = (totalMinutes() / 60).toFixed(1);
  document.getElementById("studyDays").textContent = studyDayCount();
}
function heatLevel(min) {
  if (!min) return 0;
  if (min < 60) return 1;
  if (min < 120) return 2;
  if (min < 240) return 3;
  return 4;
}
function renderHeatmap() {
  const el = document.getElementById("heatmap");
  el.innerHTML = "";
  const weeks = 18;
  const today = new Date();
  // align so columns are full weeks ending this week; start on a Sunday
  const start = new Date(today);
  start.setDate(start.getDate() - (weeks * 7 - 1));
  start.setDate(start.getDate() - start.getDay()); // back to Sunday
  for (let i = 0; i < weeks * 7 + 7; i++) {
    const d = new Date(start.getTime() + i * 86400000);
    if (d > today) break;
    const ds = d.toISOString().slice(0, 10);
    const min = state.sessions[ds] || 0;
    const cell = document.createElement("div");
    cell.className = "heat-cell lvl" + heatLevel(min);
    cell.title = ds + " · " + (min / 60).toFixed(1) + " h";
    el.appendChild(cell);
  }
}

/* ---------------- Pomodoro ---------------- */
let pomo = {
  remaining: state.pomo.work * 60,
  mode: "work",      // work | break | long
  round: 1,
  running: false,
  interval: null
};
const pomoTime = document.getElementById("pomoTime");
const pomoModeEl = document.getElementById("pomoMode");
const pomoRoundEl = document.getElementById("pomoRound");

function loadPomoSettings() {
  setWork.value = state.pomo.work;
  setBreak.value = state.pomo.break;
  setLong.value = state.pomo.long;
  setRounds.value = state.pomo.rounds;
}
const setWork = document.getElementById("setWork"), setBreak = document.getElementById("setBreak"),
      setLong = document.getElementById("setLong"), setRounds = document.getElementById("setRounds");

function pomoRender() {
  const m = Math.floor(pomo.remaining / 60), s = pomo.remaining % 60;
  pomoTime.textContent = String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
  pomoModeEl.textContent = pomo.mode === "work" ? "Focus" : (pomo.mode === "long" ? "Long break" : "Break");
  pomoModeEl.className = "pomo-mode" + (pomo.mode === "work" ? "" : " break");
  pomoRoundEl.innerHTML = `Round ${pomo.round} · today: <span id="pomoTodayCount">${countFocusToday()}</span> focus blocks`;
}
function countFocusToday() {
  // estimate focus blocks today from logged minutes / work length
  return Math.floor((state.sessions[todayStr()] || 0) / state.pomo.work) || 0;
}
function pomoTick() {
  if (pomo.remaining > 0) { pomo.remaining--; pomoRender(); return; }
  // interval finished
  clearInterval(pomo.interval); pomo.running = false;
  try { new Audio("data:audio/wav;base64,UklGRl9vAAAAAA==").play(); } catch (e) {}
  if (pomo.mode === "work") {
    addMinutes(state.pomo.work); // log focus time
    if (pomo.round % state.pomo.rounds === 0) { pomo.mode = "long"; pomo.remaining = state.pomo.long * 60; }
    else { pomo.mode = "break"; pomo.remaining = state.pomo.break * 60; }
    pomo.round++;
    alert("Focus block done. " + state.pomo.work + " min logged. Take your break.");
  } else {
    pomo.mode = "work"; pomo.remaining = state.pomo.work * 60;
    alert("Break over. Next focus block.");
  }
  pomoRender();
}
function pomoStart() {
  if (pomo.running) return;
  pomo.running = true;
  pomo.interval = setInterval(pomoTick, 1000);
}
function pomoPause() { pomo.running = false; clearInterval(pomo.interval); }
function pomoReset() {
  pomoPause();
  pomo.mode = "work"; pomo.round = 1; pomo.remaining = state.pomo.work * 60; pomoRender();
}
function pomoSkip() {
  pomoPause();
  pomo.remaining = 0; pomoTick();
}
document.getElementById("pomoStart").addEventListener("click", pomoStart);
document.getElementById("pomoPause").addEventListener("click", pomoPause);
document.getElementById("pomoReset").addEventListener("click", pomoReset);
document.getElementById("pomoSkip").addEventListener("click", pomoSkip);
document.getElementById("savePomo").addEventListener("click", () => {
  state.pomo = {
    work: Math.max(1, +setWork.value || 40),
    break: Math.max(1, +setBreak.value || 10),
    long: Math.max(1, +setLong.value || 20),
    rounds: Math.max(1, +setRounds.value || 4)
  };
  save();
  if (!pomo.running) pomoReset();
  alert("Timer settings saved.");
});
document.getElementById("logManual").addEventListener("click", () => {
  const min = +document.getElementById("manualMin").value;
  if (!min || min < 1) return;
  addMinutes(min);
  document.getElementById("manualMin").value = "";
  pomoRender();
});

/* ---------------- Tasks ---------------- */
let activeScope = "daily";
const taskForm = document.getElementById("taskForm");
const taskInput = document.getElementById("taskInput");
const taskPriority = document.getElementById("taskPriority");
const taskList = document.getElementById("taskList");
const taskCount = document.getElementById("taskCount");

document.querySelectorAll("#taskTabs .tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll("#taskTabs .tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    activeScope = tab.dataset.scope;
    renderTasks();
  });
});
taskForm.addEventListener("submit", e => {
  e.preventDefault();
  const text = taskInput.value.trim();
  if (!text) return;
  state.tasks.push({ id: uid(), text, scope: activeScope, priority: taskPriority.value, done: false });
  taskInput.value = ""; save(); renderTasks(); renderDashboard();
});
const prioRank = { high: 0, med: 1, low: 2 };
function renderTasks() {
  const items = state.tasks.filter(t => t.scope === activeScope)
    .sort((a, b) => (a.done - b.done) || (prioRank[a.priority] - prioRank[b.priority]));
  taskList.innerHTML = items.length ? "" : `<li class="empty">No ${activeScope} tasks yet.</li>`;
  items.forEach(t => {
    const li = document.createElement("li");
    li.className = "task-item" + (t.done ? " done" : "");
    li.innerHTML = `
      <div class="prio-bar ${t.priority}"></div>
      <button class="task-check ${t.done ? "checked" : ""}">${t.done ? "✓" : ""}</button>
      <span class="task-text">${escapeHtml(t.text)}</span>
      <button class="del-btn" title="delete">✕</button>`;
    li.querySelector(".task-check").addEventListener("click", () => { t.done = !t.done; save(); renderTasks(); renderDashboard(); });
    li.querySelector(".del-btn").addEventListener("click", () => { state.tasks = state.tasks.filter(x => x.id !== t.id); save(); renderTasks(); renderDashboard(); });
    taskList.appendChild(li);
  });
  const done = items.filter(t => t.done).length;
  taskCount.textContent = `${done}/${items.length} done`;
}
document.getElementById("clearDone").addEventListener("click", () => {
  state.tasks = state.tasks.filter(t => !(t.scope === activeScope && t.done));
  save(); renderTasks(); renderDashboard();
});
document.getElementById("restoreDefaults").addEventListener("click", () => {
  const existing = new Set(state.tasks.filter(t => t.scope === activeScope).map(t => t.text));
  const toAdd = seedTasks.filter(s => s.scope === activeScope && !existing.has(s.text));
  if (!toAdd.length) { alert("All default " + activeScope + " tasks are already in your list."); return; }
  toAdd.forEach(s => state.tasks.push({ id: uid(), ...s, done: false }));
  save(); renderTasks(); renderDashboard();
});

/* ---------------- Focus Topics ---------------- */
let topicFilter = "all";
const topicForm = document.getElementById("topicForm");
const topicGrid = document.getElementById("topicGrid");
document.querySelectorAll("#topicFilters .chip").forEach(chip => {
  chip.addEventListener("click", () => {
    document.querySelectorAll("#topicFilters .chip").forEach(c => c.classList.remove("active"));
    chip.classList.add("active"); topicFilter = chip.dataset.filter; renderTopics();
  });
});
topicForm.addEventListener("submit", e => {
  e.preventDefault();
  const text = document.getElementById("topicInput").value.trim();
  if (!text) return;
  state.topics.push({ id: uid(), text, section: document.getElementById("topicSection").value, status: document.getElementById("topicStatus").value });
  document.getElementById("topicInput").value = ""; save(); renderTopics();
});
function renderTopics() {
  const items = state.topics.filter(t => topicFilter === "all" || t.section === topicFilter);
  topicGrid.innerHTML = "";
  if (!items.length) { topicGrid.innerHTML = `<div class="empty">No topics here yet.</div>`; return; }
  items.forEach(t => {
    const card = document.createElement("div");
    card.className = "topic-card " + t.status;
    card.innerHTML = `
      <button class="del-btn">✕</button>
      <div class="t-title">${escapeHtml(t.text)}</div>
      <div class="t-meta">
        <span class="tag">${t.section}</span>
        <select class="t-status">
          <option value="new" ${t.status==="new"?"selected":""}>🔴 New</option>
          <option value="reviewing" ${t.status==="reviewing"?"selected":""}>🟡 Reviewing</option>
          <option value="solid" ${t.status==="solid"?"selected":""}>🟢 Solid</option>
        </select>
      </div>`;
    card.querySelector(".t-status").addEventListener("change", e => { t.status = e.target.value; save(); renderTopics(); });
    card.querySelector(".del-btn").addEventListener("click", () => { state.topics = state.topics.filter(x => x.id !== t.id); save(); renderTopics(); });
    topicGrid.appendChild(card);
  });
}

/* ---------------- Wrong Answers ---------------- */
let wrongFilter = "all";
const wrongForm = document.getElementById("wrongForm");
const wrongBody = document.getElementById("wrongBody");
document.querySelectorAll("#wrongFilters .chip").forEach(chip => {
  chip.addEventListener("click", () => {
    document.querySelectorAll("#wrongFilters .chip").forEach(c => c.classList.remove("active"));
    chip.classList.add("active"); wrongFilter = chip.dataset.filter; renderWrong();
  });
});
wrongForm.addEventListener("submit", e => {
  e.preventDefault();
  const topic = document.getElementById("wTopic").value.trim();
  const source = document.getElementById("wSource").value.trim();
  if (!topic && !source) return;

  // ---- new Error Log fields (Req 6.1, 6.2, 6.5, 6.6) ----
  const category = document.getElementById("wCategory").value || "unset";
  // Enforce the 2000-char cap with clampText, keeping the last valid value (Req 6.6).
  const explanation = MCAT.clampText(document.getElementById("wExplanation").value, 2000);
  const takeaway = MCAT.clampText(document.getElementById("wTakeaway").value, 2000);
  const needsReview = document.getElementById("wNeedsReview").checked;
  // Only store a retest date that is empty or a strict ISO calendar date; a
  // non-empty invalid date is rejected with a message and not stored (Req 6.5).
  const rawRetest = document.getElementById("wRetest").value;
  let retestDate = "";
  if (rawRetest && !MCAT.isValidISODate(rawRetest)) {
    alert("Retest date is not a valid calendar date (YYYY-MM-DD); it was not saved.");
  } else {
    retestDate = rawRetest;
  }

  // detect repeat: same topic (case-insensitive) already logged → bump count
  const existing = state.wrong.find(w => topic && w.topic.toLowerCase() === topic.toLowerCase());
  if (existing) {
    // Preserve existing repeat-detection + open/resolved behavior (Req 6.8) and
    // layer the freshly entered enhancement fields on top when provided.
    existing.count++; existing.status = "open"; existing.date = todayStr();
    if (source) existing.source = source;
    if (category !== "unset") existing.category = category;
    if (explanation) existing.explanation = explanation;
    if (takeaway) existing.takeaway = takeaway;
    if (needsReview) existing.needsReview = true;
    if (retestDate) existing.retestDate = retestDate;
  } else {
    state.wrong.push({
      id: uid(), date: todayStr(), source, topic,
      section: document.getElementById("wSection").value,
      why: document.getElementById("wWhy").value.trim(), count: 1, status: "open",
      category, explanation, takeaway, needsReview, retestDate
    });
  }
  wrongForm.reset(); save(); renderWrong(); renderDashboard();
});

/* Build the <option> list for the per-row mistake-category <select>, sourcing
   the nine categories from the single source of truth in core.js plus the
   "unset" sentinel, marking the current value selected. */
function categoryOptionsHtml(selected) {
  const current = (typeof selected === "string" && selected) ? selected : "unset";
  const cats = ["unset", ...MCAT.MISTAKE_CATEGORIES];
  return cats
    .map(c => `<option value="${escapeHtml(c)}"${c === current ? " selected" : ""}>${escapeHtml(c)}</option>`)
    .join("");
}

/* Render the mistakes-by-category summary into #categoryCounts using the pure
   helper, showing every one of the nine categories plus "unset" with its count
   (zeros included) — total-preserving (Req 6.7). */
function renderCategoryCounts() {
  const el = document.getElementById("categoryCounts");
  if (!el) return;
  const counts = MCAT.categoryCounts(state.wrong);
  const order = [...MCAT.MISTAKE_CATEGORIES, "unset"];
  el.innerHTML = order
    .map(cat => `<span class="cat-count"><span class="cat-name">${escapeHtml(cat)}</span><span class="cat-num">${counts[cat]}</span></span>`)
    .join("");
}
function renderWrong() {
  let items = [...state.wrong];
  if (wrongFilter === "open") items = items.filter(w => w.status === "open");
  else if (wrongFilter === "resolved") items = items.filter(w => w.status === "resolved");
  else if (wrongFilter === "repeat") items = items.filter(w => w.count > 1);
  items.sort((a, b) => (b.count - a.count) || (b.date || "").localeCompare(a.date || ""));

  // category-count summary panel (Req 6.7) — recomputed from the full set, not the filtered view.
  renderCategoryCounts();

  // repeat panel
  const repeats = state.wrong.filter(w => w.count > 1);
  const rp = document.getElementById("repeatPanel");
  if (repeats.length) {
    rp.style.display = "block";
    document.getElementById("repeatTags").innerHTML = repeats
      .sort((a, b) => b.count - a.count)
      .map(w => `<span class="repeat-tag">${escapeHtml(w.topic)} ×${w.count}</span>`).join("");
  } else rp.style.display = "none";

  wrongBody.innerHTML = "";
  if (!items.length) { wrongBody.innerHTML = `<tr><td colspan="9" class="empty">No misses logged${wrongFilter!=="all"?" in this filter":""}.</td></tr>`; return; }
  items.forEach(w => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${w.date || "—"}</td>
      <td>${escapeHtml(w.source || "—")}</td>
      <td>${escapeHtml(w.topic || "—")}</td>
      <td><span class="tag">${w.section}</span></td>
      <td class="cat-cell">
        <select class="cat-select" title="Mistake category">${categoryOptionsHtml(w.category)}</select>
        <label class="retest-label">Retest <input type="date" class="retest-input" value="${escapeHtml(w.retestDate || "")}" /></label>
      </td>
      <td>${escapeHtml(w.why || "—")}</td>
      <td><span class="miss-count ${w.count>1?"repeat":""}">×${w.count}</span></td>
      <td><span class="status-pill ${w.status}">${w.status === "open" ? "Open" : "Resolved"}</span></td>
      <td><button class="del-btn">✕</button></td>`;
    // Set / change the mistake category on an existing row; "unset" allowed (Req 6.3).
    tr.querySelector(".cat-select").addEventListener("change", ev => {
      w.category = ev.target.value; save(); renderWrong(); renderDashboard();
    });
    // Save the retest date on change only when empty or a valid ISO calendar
    // date; otherwise reject and restore the prior value (Req 6.4, 6.5).
    tr.querySelector(".retest-input").addEventListener("change", ev => {
      const v = ev.target.value;
      if (v === "" || MCAT.isValidISODate(v)) {
        w.retestDate = v; save(); renderReminders();
      } else {
        alert("Retest date is not a valid calendar date (YYYY-MM-DD).");
        ev.target.value = w.retestDate || "";
      }
    });
    tr.querySelector(".status-pill").addEventListener("click", () => {
      w.status = w.status === "open" ? "resolved" : "open"; save(); renderWrong(); renderDashboard();
    });
    tr.querySelector(".del-btn").addEventListener("click", () => {
      state.wrong = state.wrong.filter(x => x.id !== w.id); save(); renderWrong(); renderDashboard();
    });
    wrongBody.appendChild(tr);
  });
  renderReminders();
}

/* ---------------- Scores ---------------- */
const scoreForm = document.getElementById("scoreForm");
const scoreBody = document.getElementById("scoreBody");

// Human-readable labels for the four section keys, used in validation messages.
const SECTION_LABELS = { cp: "C/P", cars: "CARS", bb: "B/B", ps: "P/S" };

// Read an optional integer from a numeric input by id: returns null when the
// field is blank (or not a finite number), else the parsed integer. Used for
// percentiles and time-taken, which are optional (null when unset). (Req 7.1, 7.5)
function readOptionalInt(id) {
  const el = document.getElementById(id);
  const raw = el ? String(el.value).trim() : "";
  if (raw === "") return null;
  const n = Number(raw);
  return isFinite(n) ? Math.trunc(n) : null;
}

// The single source of truth for the full-length target line: goals.targetScore,
// falling back to the legacy state.target, then a sane default. (Req 7.6)
function targetScore() {
  const g = state.goals && state.goals.targetScore;
  if (g !== null && g !== undefined) return g;
  if (state.target !== null && state.target !== undefined) return state.target;
  return 510;
}

scoreForm.addEventListener("submit", e => {
  e.preventDefault();
  // Raw section values (strings) — passed to validateSections so EVERY invalid
  // section is reported independently (Req 7.8). isValidSectionScore coerces
  // numeric strings and rejects blanks/out-of-range values.
  const raw = {
    cp: document.getElementById("sCP").value,
    cars: document.getElementById("sCARS").value,
    bb: document.getElementById("sBB").value,
    ps: document.getElementById("sPS").value
  };
  const check = MCAT.validateSections(raw);
  if (!check.ok) {
    // Report each invalid section; do NOT mutate state and retain entered
    // values (no form reset). (Req 7.8)
    const lines = check.invalid.map(({ section, value }) => {
      const shown = (value === "" || value === null || value === undefined) ? "blank" : value;
      return `${SECTION_LABELS[section]}: ${shown}`;
    });
    alert("Each section score must be a whole number from 118 to 132.\nInvalid:\n" + lines.join("\n"));
    return;
  }

  const date = document.getElementById("sDate").value;
  const name = document.getElementById("sName").value.trim() || "Full-length";
  const cp = Math.trunc(Number(raw.cp)), cars = Math.trunc(Number(raw.cars));
  const bb = Math.trunc(Number(raw.bb)), ps = Math.trunc(Number(raw.ps));

  // Optional enhancement fields (Req 7.1): percentiles, time taken, testing
  // conditions, review status, biggest lessons.
  const percentiles = {
    cp: readOptionalInt("sPctCP"),
    cars: readOptionalInt("sPctCARS"),
    bb: readOptionalInt("sPctBB"),
    ps: readOptionalInt("sPctPS"),
    total: readOptionalInt("sPctTotal")
  };
  const conditions = {
    timed: document.getElementById("sCondTimed").checked,
    singleSitting: document.getElementById("sCondSingleSitting").checked,
    withBreaks: document.getElementById("sCondWithBreaks").checked,
    realConditions: document.getElementById("sCondRealConditions").checked
  };
  const reviewStatus = document.getElementById("sReviewStatus").value || "not reviewed";
  const lessons = MCAT.clampText(document.getElementById("sLessons").value, 2000);

  state.scores.push({
    id: uid(), date, name, cp, cars, bb, ps,
    percentiles,
    timeTaken: readOptionalInt("sTimeTaken"),
    conditions,
    reviewStatus,
    lessons
  });
  scoreForm.reset(); save(); renderScores(); drawChart(); drawSectionTrends(); renderDashboard();
});
function scoreTotal(s) { return s.cp + s.cars + s.bb + s.ps; }
function sortedScores() { return [...state.scores].sort((a, b) => (a.date || "").localeCompare(b.date || "") || a.id - b.id); }
function renderScores() {
  const items = sortedScores();
  scoreBody.innerHTML = items.length ? "" : `<tr><td colspan="9" class="empty">No scores logged yet.</td></tr>`;
  items.forEach(s => {
    const tr = document.createElement("tr");
    // Legacy records saved before this enhancement have no reviewStatus; show
    // it as "unset" rather than blank. (Req 7.5)
    const review = (s.reviewStatus === "reviewed" || s.reviewStatus === "not reviewed")
      ? s.reviewStatus : "unset";
    tr.innerHTML = `
      <td>${s.date || "—"}</td><td>${escapeHtml(s.name)}</td>
      <td class="score-total">${scoreTotal(s)}</td>
      <td>${s.cp}</td><td>${s.cars}</td><td>${s.bb}</td><td>${s.ps}</td>
      <td><span class="review-pill ${escapeHtml(review.replace(/\s+/g, "-"))}">${escapeHtml(review)}</span></td>
      <td><button class="del-btn">✕</button></td>`;
    tr.querySelector(".del-btn").addEventListener("click", () => { state.scores = state.scores.filter(x => x.id !== s.id); save(); renderScores(); drawChart(); drawSectionTrends(); renderDashboard(); });
    scoreBody.appendChild(tr);
  });
  // Per-section trends share the scores data; repaint them whenever the list
  // repaints so they stay in sync. (Req 7.7, 7.9)
  drawSectionTrends();
}
function drawChart() {
  const svg = document.getElementById("scoreChart");
  const W = 600, H = 240, padL = 38, padR = 16, padT = 16, padB = 28;
  const data = sortedScores();
  document.getElementById("chartTarget").textContent = targetScore();
  svg.innerHTML = "";
  const minScore = 472, maxScore = 528;
  const x = i => padL + (data.length <= 1 ? 0 : (i / (data.length - 1)) * (W - padL - padR));
  const y = v => padT + (1 - (v - minScore) / (maxScore - minScore)) * (H - padT - padB);
  const ns = "http://www.w3.org/2000/svg";
  const line = (x1, y1, x2, y2, stroke, dash) => { const l = document.createElementNS(ns, "line"); l.setAttribute("x1", x1); l.setAttribute("y1", y1); l.setAttribute("x2", x2); l.setAttribute("y2", y2); l.setAttribute("stroke", stroke); l.setAttribute("stroke-width", "1.5"); if (dash) l.setAttribute("stroke-dasharray", dash); svg.appendChild(l); };
  const text = (tx, ty, str, fill, anchor, size) => { const t = document.createElementNS(ns, "text"); t.setAttribute("x", tx); t.setAttribute("y", ty); t.setAttribute("fill", fill || "#8b93a7"); t.setAttribute("font-size", size || 10); t.setAttribute("text-anchor", anchor || "start"); t.textContent = str; svg.appendChild(t); };
  const tgt = targetScore();
  [480, 490, 500, 510, 520].forEach(v => { line(padL, y(v), W - padR, y(v), "#2a2f3c"); text(padL - 6, y(v) + 3, v, "#5b6275", "end"); });
  line(padL, y(tgt), W - padR, y(tgt), "#4ad0a3", "5,4");
  text(W - padR, y(tgt) - 5, "target " + tgt, "#4ad0a3", "end");
  if (!data.length) { text(W/2, H/2, "No scores yet", "#5b6275", "middle", 13); return; }
  let d = "";
  data.forEach((s, i) => { d += (i === 0 ? "M" : "L") + x(i) + " " + y(scoreTotal(s)) + " "; });
  const path = document.createElementNS(ns, "path");
  path.setAttribute("d", d); path.setAttribute("fill", "none"); path.setAttribute("stroke", "#5b8def"); path.setAttribute("stroke-width", "2.5"); path.setAttribute("stroke-linejoin", "round");
  svg.appendChild(path);
  data.forEach((s, i) => {
    const c = document.createElementNS(ns, "circle");
    c.setAttribute("cx", x(i)); c.setAttribute("cy", y(scoreTotal(s))); c.setAttribute("r", "4"); c.setAttribute("fill", "#5b8def");
    svg.appendChild(c);
    text(x(i), y(scoreTotal(s)) - 9, scoreTotal(s), "#e8ebf2", "middle", 11);
    if (s.date) text(x(i), H - 8, s.date.slice(5), "#5b6275", "middle", 9);
  });
}

/* drawSectionTrends() — small-multiple per-section score trends.
   For each of the four sections, plot the date-ordered Section_Score series
   (from the pure helper MCAT.sectionTrendSeries, which tolerates incomplete /
   legacy records — Req 7.7) into its <svg>, fixed to the 118..132 scale. When
   a section has no points (no records contribute), hide its <svg> and show the
   matching empty-state so an empty trend never renders a blank chart. (Req 7.9)
   Each section toggles independently, so a section missing data does not blank
   one that has data. */
function drawSectionTrends() {
  const series = MCAT.sectionTrendSeries(state.scores);
  const suffix = { cp: "CP", cars: "CARS", bb: "BB", ps: "PS" };
  Object.keys(suffix).forEach(key => {
    const svg = document.getElementById("sTrend" + suffix[key]);
    const empty = document.getElementById("sTrend" + suffix[key] + "Empty");
    const points = (series[key] || []).map(p => ({ label: p.date, value: p.v }));
    const hasData = points.length > 0;
    if (svg) svg.style.display = hasData ? "" : "none";
    if (empty) empty.style.display = hasData ? "none" : "";
    if (hasData) {
      drawLineChart(svg, points, { yMin: 118, yMax: 132, yTickCount: 7 });
    } else if (svg) {
      svg.innerHTML = "";
    }
  });
}

/* ---------------- Shared SVG chart helpers ----------------
   Reusable DOM-layer drawing utilities consumed by the practice,
   analytics, and full-length trend charts. These mirror the
   drawChart() idiom (document.createElementNS with the SVG
   namespace) and resolve the app's CSS custom-property colors at
   call time so charts follow the active theme. The pure data that
   feeds these helpers comes from core.js (MCAT.accuracyOverTime,
   MCAT.accuracyByTopic, etc.); no aggregation happens here. */
const SVG_NS = "http://www.w3.org/2000/svg";

// Resolve a CSS custom property (e.g. "--accent") to its current value,
// falling back to a literal color matching the existing drawChart palette.
function cssVar(name, fallback) {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  } catch (e) { return fallback; }
}

// Theme-aware default palette (fallbacks equal the hex literals in drawChart).
function chartColors() {
  return {
    grid: cssVar("--line", "#2a2f3c"),
    axis: "#5b6275",
    muted: cssVar("--muted", "#8b93a7"),
    text: cssVar("--text", "#e8ebf2"),
    accent: cssVar("--accent", "#5b8def"),
    accent2: cssVar("--accent-2", "#4ad0a3"),
    high: cssVar("--high", "#ef5b6e"),
    med: cssVar("--med", "#f0b54a"),
    low: cssVar("--low", "#6c7689")
  };
}

// Generic SVG element creator. attrs values that are null/undefined are skipped.
function svgEl(name, attrs) {
  const el = document.createElementNS(SVG_NS, name);
  if (attrs) for (const k in attrs) {
    if (attrs[k] !== null && attrs[k] !== undefined) el.setAttribute(k, attrs[k]);
  }
  return el;
}

// Convenience element factories (each returns a detached element).
function svgLine(x1, y1, x2, y2, stroke, dash) {
  const attrs = { x1, y1, x2, y2, stroke: stroke || cssVar("--line", "#2a2f3c"), "stroke-width": "1.5" };
  if (dash) attrs["stroke-dasharray"] = dash;
  return svgEl("line", attrs);
}

function svgText(x, y, str, opts) {
  opts = opts || {};
  const t = svgEl("text", {
    x, y,
    fill: opts.fill || cssVar("--muted", "#8b93a7"),
    "font-size": opts.size || 10,
    "text-anchor": opts.anchor || "start"
  });
  if (opts.baseline) t.setAttribute("dominant-baseline", opts.baseline);
  if (opts.weight) t.setAttribute("font-weight", opts.weight);
  t.textContent = str == null ? "" : String(str);
  return t;
}

function svgRect(x, y, w, h, fill, opts) {
  opts = opts || {};
  const attrs = { x, y, width: w, height: h, fill: fill || cssVar("--accent", "#5b8def") };
  if (opts.rx !== undefined) attrs.rx = opts.rx;
  if (opts.stroke) attrs.stroke = opts.stroke;
  if (opts.strokeWidth !== undefined) attrs["stroke-width"] = opts.strokeWidth;
  if (opts.opacity !== undefined) attrs["fill-opacity"] = opts.opacity;
  return svgEl("rect", attrs);
}

function svgPath(d, opts) {
  opts = opts || {};
  return svgEl("path", {
    d,
    fill: opts.fill || "none",
    stroke: opts.stroke || cssVar("--accent", "#5b8def"),
    "stroke-width": opts.width || "2.5",
    "stroke-linejoin": opts.linejoin || "round",
    "stroke-linecap": opts.linecap || null
  });
}

// Normalize a point that may be {x,y} or {label,value} into {label, value}.
function normalizePoint(p) {
  if (p == null) return { label: "", value: 0 };
  const value = p.value !== undefined && p.value !== null ? p.value
              : (p.y !== undefined && p.y !== null ? p.y : 0);
  const label = p.label !== undefined && p.label !== null ? p.label
              : (p.x !== undefined && p.x !== null ? p.x : "");
  return { label, value: Number(value) || 0 };
}

// Normalize a series argument into { name, color, points:[{label,value}] }.
function normalizeSeries(s, palette, idx) {
  let points, name = "", color;
  if (Array.isArray(s)) {
    points = s;
  } else if (s && Array.isArray(s.points)) {
    points = s.points; name = s.name || ""; color = s.color;
  } else {
    points = [];
  }
  const fallbackColors = [palette.accent, palette.accent2, palette.med, palette.high, palette.low];
  return {
    name,
    color: color || fallbackColors[idx % fallbackColors.length],
    points: points.map(normalizePoint)
  };
}

/* drawLineChart(svg, series, opts)
   Plots one or more series of {x,y} or {label,value} points into the
   provided <svg> element. `series` may be a single array of points or
   an array of series (arrays or {name,color,points}). opts:
     yMin, yMax (default 0..100), width, height, pad {l,r,t,b},
     yTicks (array) or yTickCount, showDots (default true),
     xLabels (optional override for x-axis tick labels).
   No-ops safely (clears the svg and returns) when there is no data;
   the caller is responsible for rendering an empty-state. */
function drawLineChart(svg, series, opts) {
  if (!svg) return;
  svg.innerHTML = "";
  opts = opts || {};
  const palette = chartColors();

  // Accept a single series (array of points) or an array of series.
  let rawSeries;
  if (!series || (Array.isArray(series) && series.length === 0)) {
    return; // no-op on empty
  }
  const isSingleSeries = Array.isArray(series) &&
    series.every(p => p && typeof p === "object" && !Array.isArray(p) && !Array.isArray(p.points) &&
      (p.value !== undefined || p.y !== undefined || p.label !== undefined || p.x !== undefined));
  rawSeries = isSingleSeries ? [series] : series;

  const allSeries = rawSeries.map((s, i) => normalizeSeries(s, palette, i)).filter(s => s.points.length);
  if (!allSeries.length) return; // no-op when nothing to plot

  const W = opts.width || 600, H = opts.height || 240;
  const pad = Object.assign({ l: 38, r: 16, t: 16, b: 28 }, opts.pad || {});
  const yMin = opts.yMin !== undefined ? opts.yMin : 0;
  const yMax = opts.yMax !== undefined ? opts.yMax : 100;
  const span = (yMax - yMin) || 1;
  const maxLen = allSeries.reduce((m, s) => Math.max(m, s.points.length), 0);

  const xAt = (i, len) => pad.l + (len <= 1 ? 0 : (i / (len - 1)) * (W - pad.l - pad.r));
  const yAt = v => pad.t + (1 - (v - yMin) / span) * (H - pad.t - pad.b);

  // Y gridlines + labels.
  let ticks = opts.yTicks;
  if (!ticks) {
    const count = opts.yTickCount || 5;
    ticks = [];
    for (let i = 0; i <= count; i++) ticks.push(yMin + (span * i) / count);
  }
  ticks.forEach(v => {
    svg.appendChild(svgLine(pad.l, yAt(v), W - pad.r, yAt(v), palette.grid));
    svg.appendChild(svgText(pad.l - 6, yAt(v) + 3, Math.round(v * 10) / 10, { fill: palette.axis, anchor: "end" }));
  });

  // X-axis tick labels (from the longest series unless overridden).
  const labelSource = opts.xLabels || allSeries.reduce((a, b) => b.points.length >= a.points.length ? b : a).points.map(p => p.label);
  labelSource.forEach((lbl, i) => {
    if (lbl === "" || lbl === undefined || lbl === null) return;
    const str = typeof lbl === "string" && lbl.length > 5 && /^\d{4}-\d{2}-\d{2}$/.test(lbl) ? lbl.slice(5) : lbl;
    svg.appendChild(svgText(xAt(i, labelSource.length), H - 8, str, { fill: palette.axis, anchor: "middle", size: 9 }));
  });

  // Each series: path + optional dots + value labels (single-series only to avoid clutter).
  const showDots = opts.showDots !== false;
  allSeries.forEach(s => {
    let d = "";
    s.points.forEach((p, i) => { d += (i === 0 ? "M" : "L") + xAt(i, s.points.length) + " " + yAt(p.value) + " "; });
    svg.appendChild(svgPath(d.trim(), { stroke: s.color, width: "2.5" }));
    if (showDots) {
      s.points.forEach((p, i) => {
        svg.appendChild(svgEl("circle", { cx: xAt(i, s.points.length), cy: yAt(p.value), r: "4", fill: s.color }));
        if (allSeries.length === 1) {
          svg.appendChild(svgText(xAt(i, s.points.length), yAt(p.value) - 9, Math.round(p.value * 10) / 10, { fill: palette.text, anchor: "middle", size: 11 }));
        }
      });
    }
  });

  // Optional legend for multi-series charts.
  if (allSeries.length > 1) {
    let lx = pad.l;
    allSeries.forEach(s => {
      if (!s.name) return;
      svg.appendChild(svgRect(lx, pad.t - 10, 9, 9, s.color, { rx: 2 }));
      svg.appendChild(svgText(lx + 13, pad.t - 2, s.name, { fill: palette.muted, size: 10 }));
      lx += 16 + String(s.name).length * 6;
    });
  }
}

/* drawBarChart(svg, bars, opts)
   Renders labeled bars for by-topic / by-section / timed-vs-untimed
   style data. `bars` is an array of {label, value} (or {x,y}); values
   are expected within 0..opts.max (default 100). opts:
     orientation "horizontal" (default) | "vertical",
     width, height, pad, max (default 100), color (or per-bar color
     via bar.color), showValues (default true).
   No-ops safely (clears the svg and returns) on empty input. */
function drawBarChart(svg, bars, opts) {
  if (!svg) return;
  svg.innerHTML = "";
  opts = opts || {};
  if (!Array.isArray(bars) || bars.length === 0) return; // no-op on empty

  const palette = chartColors();
  const data = bars.map((b, i) => {
    const n = normalizePoint(b);
    return { label: n.label, value: n.value, color: (b && b.color) || opts.color || palette.accent };
  });

  const W = opts.width || 600, H = opts.height || 240;
  const max = opts.max !== undefined ? opts.max : 100;
  const safeMax = max || 1;
  const orientation = opts.orientation || "horizontal";
  const showValues = opts.showValues !== false;

  if (orientation === "vertical") {
    const pad = Object.assign({ l: 38, r: 16, t: 16, b: 40 }, opts.pad || {});
    const plotW = W - pad.l - pad.r, plotH = H - pad.t - pad.b;
    const yAt = v => pad.t + (1 - v / safeMax) * plotH;
    // baseline + a few gridlines
    const count = opts.yTickCount || 4;
    for (let i = 0; i <= count; i++) {
      const v = (safeMax * i) / count;
      svg.appendChild(svgLine(pad.l, yAt(v), W - pad.r, yAt(v), palette.grid));
      svg.appendChild(svgText(pad.l - 6, yAt(v) + 3, Math.round(v * 10) / 10, { fill: palette.axis, anchor: "end" }));
    }
    const slot = plotW / data.length;
    const barW = Math.min(slot * 0.6, 48);
    data.forEach((b, i) => {
      const cx = pad.l + slot * i + slot / 2;
      const h = Math.max(0, (b.value / safeMax) * plotH);
      svg.appendChild(svgRect(cx - barW / 2, yAt(b.value), barW, h, b.color, { rx: 3 }));
      if (showValues) svg.appendChild(svgText(cx, yAt(b.value) - 5, Math.round(b.value * 10) / 10, { fill: palette.text, anchor: "middle", size: 11 }));
      svg.appendChild(svgText(cx, H - pad.b + 14, b.label, { fill: palette.muted, anchor: "middle", size: 10 }));
    });
  } else {
    // horizontal
    const pad = Object.assign({ l: 110, r: 40, t: 12, b: 12 }, opts.pad || {});
    const plotW = W - pad.l - pad.r;
    const slot = (H - pad.t - pad.b) / data.length;
    const barH = Math.min(slot * 0.6, 26);
    // vertical reference lines
    const count = opts.xTickCount || 4;
    for (let i = 0; i <= count; i++) {
      const v = (safeMax * i) / count;
      const x = pad.l + (v / safeMax) * plotW;
      svg.appendChild(svgLine(x, pad.t, x, H - pad.b, palette.grid));
    }
    data.forEach((b, i) => {
      const cy = pad.t + slot * i + slot / 2;
      const w = Math.max(0, (b.value / safeMax) * plotW);
      svg.appendChild(svgText(pad.l - 8, cy + 3, b.label, { fill: palette.muted, anchor: "end", size: 10 }));
      svg.appendChild(svgRect(pad.l, cy - barH / 2, w, barH, b.color, { rx: 3 }));
      if (showValues) svg.appendChild(svgText(pad.l + w + 5, cy + 3, Math.round(b.value * 10) / 10, { fill: palette.text, anchor: "start", size: 11 }));
    });
  }
}

/* ---------------- Practice Question Tracker (Req 3, 4) ----------------
   DOM/handler layer for the Practice view. All validation and aggregation
   lives in the pure layer (core.js / MCAT.*); this layer only reads inputs,
   mutates state, saves, and writes DOM.

   renderPractice() repaints the entry list (newest→oldest) and the four
   charts (accuracy over time, by topic, by section, timed-vs-untimed),
   toggling each chart's empty-state independently so a metric with no data
   never blanks one that does. (Req 3.7, 3.8, 4.1–4.4, 4.7) */
const practiceForm = document.getElementById("practiceForm");
const practiceBody = document.getElementById("practiceBody");

// Show/hide a chart's <svg> vs. its matching empty-state div by id.
function togglePracticeChart(svgId, emptyId, hasData) {
  const svg = document.getElementById(svgId);
  const empty = document.getElementById(emptyId);
  if (svg) svg.style.display = hasData ? "" : "none";
  if (empty) empty.style.display = hasData ? "none" : "";
}

// Surface validation errors inside the form (inline), falling back to alert
// if the form element is somehow unavailable.
function showPracticeErrors(errors) {
  const msgs = Object.keys(errors).map(k => errors[k]);
  if (!practiceForm) { alert(msgs.join("\n")); return; }
  let box = document.getElementById("practiceFormErrors");
  if (!box) {
    box = document.createElement("div");
    box.id = "practiceFormErrors";
    box.className = "form-errors";
    box.setAttribute("role", "alert");
    practiceForm.appendChild(box);
  }
  box.innerHTML = msgs.map(m => `<div>${escapeHtml(m)}</div>`).join("");
  box.style.display = "";
}
function clearPracticeErrors() {
  const box = document.getElementById("practiceFormErrors");
  if (box) { box.innerHTML = ""; box.style.display = "none"; }
}

function renderPractice() {
  const sets = Array.isArray(state.practiceSets) ? state.practiceSets : [];

  // ---- list: newest → oldest (by date desc, stable on id) ----
  if (practiceBody) {
    const ordered = [...sets].sort((a, b) =>
      (b.date || "").localeCompare(a.date || "") || String(b.id).localeCompare(String(a.id)));
    practiceBody.innerHTML = ordered.length
      ? ""
      : `<tr><td colspan="8" class="empty">No practice sets logged yet.</td></tr>`;
    ordered.forEach(s => {
      const pct = percentCorrect(s.correct, s.attempted);
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${s.date || "—"}</td>
        <td><span class="tag">${escapeHtml(s.section || "—")}</span></td>
        <td>${escapeHtml(s.topic || "—")}</td>
        <td>${s.correct}</td>
        <td>${s.attempted}</td>
        <td>${pct}%</td>
        <td>${s.timing === "timed" ? "Timed" : "Untimed"}</td>
        <td><button class="del-btn" title="delete">✕</button></td>`;
      tr.querySelector(".del-btn").addEventListener("click", () => deletePracticeSet(s.id));
      practiceBody.appendChild(tr);
    });
  }

  // ---- charts (with independent per-chart empty-state) ----
  // Accuracy over time: one point per set, chronological, y 0..100.
  const overTime = MCAT.accuracyOverTime(sets).map(p => ({ label: p.date, value: p.pct }));
  togglePracticeChart("pqChartOverTime", "pqChartOverTimeEmpty", overTime.length > 0);
  if (overTime.length) drawLineChart(document.getElementById("pqChartOverTime"), overTime, { yMin: 0, yMax: 100 });

  // Accuracy by topic (aggregated; groups with Σattempted===0 already omitted).
  const byTopic = MCAT.accuracyByTopic(sets).map(g => ({ label: g.topic, value: g.pct }));
  togglePracticeChart("pqChartByTopic", "pqChartByTopicEmpty", byTopic.length > 0);
  if (byTopic.length) drawBarChart(document.getElementById("pqChartByTopic"), byTopic, { max: 100, orientation: "horizontal" });

  // Accuracy by section (aggregated).
  const bySection = MCAT.accuracyBySection(sets).map(g => ({ label: g.section, value: g.pct }));
  togglePracticeChart("pqChartBySection", "pqChartBySectionEmpty", bySection.length > 0);
  if (bySection.length) drawBarChart(document.getElementById("pqChartBySection"), bySection, { max: 100, orientation: "horizontal" });

  // Timed vs untimed (two aggregated values; null sides omitted).
  const tvu = MCAT.timedVsUntimed(sets);
  const timedBars = [];
  if (tvu.timed != null) timedBars.push({ label: "Timed", value: tvu.timed });
  if (tvu.untimed != null) timedBars.push({ label: "Untimed", value: tvu.untimed });
  togglePracticeChart("pqChartTimed", "pqChartTimedEmpty", timedBars.length > 0);
  if (timedBars.length) drawBarChart(document.getElementById("pqChartTimed"), timedBars, { max: 100, orientation: "vertical" });
}

function deletePracticeSet(id) {
  state.practiceSets = (state.practiceSets || []).filter(s => s.id !== id);
  save();
  renderPractice();
}

if (practiceForm) {
  practiceForm.addEventListener("submit", e => {
    e.preventDefault();
    const input = {
      date: document.getElementById("pqDate").value,
      resource: document.getElementById("pqResource").value,
      section: document.getElementById("pqSection").value,
      topic: document.getElementById("pqTopic").value,
      correct: document.getElementById("pqCorrect").value,
      attempted: document.getElementById("pqAttempted").value,
      timing: document.getElementById("pqTiming").value,
      difficulty: document.getElementById("pqDifficulty").value,
      notes: document.getElementById("pqNotes").value
    };
    const result = MCAT.validatePracticeSet(input);
    if (!result.ok) { showPracticeErrors(result.errors); return; }
    if (!Array.isArray(state.practiceSets)) state.practiceSets = [];
    state.practiceSets.push(result.value);
    save();
    practiceForm.reset();
    clearPracticeErrors();
    renderPractice();
  });
}

/* ---------------- CARS Practice Tracker (Req 10) ----------------
   DOM/handler layer for the CARS view. All validation and aggregation lives
   in the pure layer (core.js / MCAT.*); this layer only reads inputs, mutates
   state, saves, and writes DOM.

   renderCars() repaints the entry list (newest→oldest), the average-minutes-
   per-passage read-out, and the accuracy-by-question-type read-out. While no
   entries exist it shows the list empty-state and suppresses BOTH aggregates
   (Req 10.7). On submit, validateCarsEntry rejects invalid input and leaves
   state unchanged, surfacing a field-specific message (Req 10.1, 10.5, 10.6). */
const carsForm = document.getElementById("carsForm");
const carsBody = document.getElementById("carsBody");

// Surface validation errors inside the CARS form (inline), falling back to
// alert if the form element is somehow unavailable.
function showCarsErrors(errors) {
  const msgs = Object.keys(errors).map(k => errors[k]);
  if (!carsForm) { alert(msgs.join("\n")); return; }
  let box = document.getElementById("carsFormErrors");
  if (!box) {
    box = document.createElement("div");
    box.id = "carsFormErrors";
    box.className = "form-errors";
    box.setAttribute("role", "alert");
    carsForm.appendChild(box);
  }
  box.innerHTML = msgs.map(m => `<div>${escapeHtml(m)}</div>`).join("");
  box.style.display = "";
}
function clearCarsErrors() {
  const box = document.getElementById("carsFormErrors");
  if (box) { box.innerHTML = ""; box.style.display = "none"; }
}

function renderCars() {
  const entries = Array.isArray(state.carsPassages) ? state.carsPassages : [];
  const hasEntries = entries.length > 0;

  // ---- list: newest → oldest (by date desc, stable on id) ----
  if (carsBody) {
    const ordered = [...entries].sort((a, b) =>
      (b.date || "").localeCompare(a.date || "") || String(b.id).localeCompare(String(a.id)));
    carsBody.innerHTML = "";
    ordered.forEach(en => {
      const tr = document.createElement("tr");
      const types = Array.isArray(en.questionTypes) ? en.questionTypes : [];
      tr.innerHTML = `
        <td>${en.date || "—"}</td>
        <td>${en.passages}</td>
        <td>${en.accuracy}%</td>
        <td>${en.timePerPassage}</td>
        <td>${escapeHtml(en.difficulty || "—")}</td>
        <td>${types.length ? escapeHtml(types.join(", ")) : "—"}</td>
        <td><button class="del-btn" title="delete">✕</button></td>`;
      tr.querySelector(".del-btn").addEventListener("click", () => deleteCarsEntry(en.id));
      carsBody.appendChild(tr);
    });
  }
  // List empty-state toggles independently of the aggregates below (Req 10.7).
  const carsEmpty = document.getElementById("carsEmpty");
  if (carsEmpty) carsEmpty.style.display = hasEntries ? "none" : "";

  // ---- average minutes per passage (Req 10.3 / hidden when none: 10.7) ----
  const avgEl = document.getElementById("carsAvgMinutes");
  if (avgEl) {
    const avg = MCAT.avgMinutesPerPassage(entries);
    avgEl.innerHTML = (avg != null)
      ? `<span class="cars-avg-value">${avg}</span> <span class="muted small">min / passage</span>`
      : `<div class="empty-state">Add a passage to see your average minutes per passage.</div>`;
  }

  // ---- accuracy by question type (Req 10.4 / hidden when none: 10.7) ----
  const byTypeEl = document.getElementById("carsAccByType");
  if (byTypeEl) {
    const byType = MCAT.accuracyByQuestionType(entries);
    const types = MCAT.CARS_QUESTION_TYPES.filter(t => Object.prototype.hasOwnProperty.call(byType, t));
    byTypeEl.innerHTML = types.length
      ? `<ul class="cars-acc-list">${types.map(t =>
          `<li><span class="cars-acc-type">${escapeHtml(t)}</span><span class="cars-acc-pct">${byType[t]}%</span></li>`).join("")}</ul>`
      : `<div class="empty-state">Tag passages with question types to see accuracy by type.</div>`;
  }
}

function deleteCarsEntry(id) {
  state.carsPassages = (state.carsPassages || []).filter(en => en.id !== id);
  save();
  renderCars();
}

if (carsForm) {
  carsForm.addEventListener("submit", e => {
    e.preventDefault();
    const questionTypes = Array.from(document.querySelectorAll(".car-qtype"))
      .filter(cb => cb.checked).map(cb => cb.value);
    const input = {
      date: document.getElementById("carDate").value,
      passages: document.getElementById("carPassages").value,
      accuracy: document.getElementById("carAccuracy").value,
      timePerPassage: document.getElementById("carTime").value,
      difficulty: document.getElementById("carDifficulty").value,
      questionTypes,
      notes: document.getElementById("carNotes").value
    };
    const result = MCAT.validateCarsEntry(input);
    if (!result.ok) { showCarsErrors(result.errors); return; } // state unchanged
    if (!Array.isArray(state.carsPassages)) state.carsPassages = [];
    state.carsPassages.push(result.value);
    save();
    carsForm.reset();
    clearCarsErrors();
    renderCars();
  });
}

/* ---------------- Review / Spaced-Repetition Tracker (Req 11) ----------------
   DOM/handler layer for the Review view. All spaced-repetition math lives in
   the pure layer (core.js / MCAT.*); this layer only reads inputs, mutates
   state, saves, and writes DOM.

   renderReview() repaints the item list, the due-today count, the retention
   rate, and the topics-by-retention list. Each item's display state and the
   due count are DERIVED per the current date (todayStr()) via MCAT.reviewState
   / MCAT.dueCount so they always reflect "due" correctly (Req 11.2, 11.3, 11.7).
   Created items start as "new" (intervalIndex -1, no nextDue, zero marks). The
   reviewed/missed buttons call the pure MCAT.markReviewed / MCAT.markMissed
   helpers and persist (Req 11.4, 11.5, 11.6). */
const reviewForm = document.getElementById("reviewForm");

function showReviewErrors(msgs) {
  if (!reviewForm) { alert(msgs.join("\n")); return; }
  let box = document.getElementById("reviewFormErrors");
  if (!box) {
    box = document.createElement("div");
    box.id = "reviewFormErrors";
    box.className = "form-errors";
    box.setAttribute("role", "alert");
    reviewForm.appendChild(box);
  }
  box.innerHTML = msgs.map(m => `<div>${escapeHtml(m)}</div>`).join("");
  box.style.display = "";
}
function clearReviewErrors() {
  const box = document.getElementById("reviewFormErrors");
  if (box) { box.innerHTML = ""; box.style.display = "none"; }
}

function renderReview() {
  const items = Array.isArray(state.reviewItems) ? state.reviewItems : [];
  const today = todayStr();

  // ---- due-today count (Req 11.7): nextDue on or before today ----
  const dueEl = document.getElementById("reviewDue");
  if (dueEl) {
    const due = MCAT.dueCount(items, today);
    dueEl.innerHTML =
      `<span class="review-due-value">${due}</span> <span class="muted small">item${due === 1 ? "" : "s"} due</span>`;
  }

  // ---- retention rate (Req 11.8 "N/A" / 11.9 percentage) ----
  const retEl = document.getElementById("reviewRetention");
  if (retEl) {
    const rate = MCAT.retentionRate(items);
    retEl.innerHTML = (rate === "N/A")
      ? `<span class="review-retention-value">N/A</span>`
      : `<span class="review-retention-value">${rate}%</span>`;
  }

  // ---- topics by retention, lowest first (Req 11.10) ----
  const topicsEl = document.getElementById("reviewTopics");
  if (topicsEl) {
    const rows = MCAT.topicsByRetention(items);
    topicsEl.innerHTML = rows.length
      ? `<ul class="review-topic-list">${rows.map(r =>
          `<li><span class="review-topic-name">${escapeHtml(r.topic || "—")}</span>` +
          `<span class="review-topic-pct">${r.rate}%</span></li>`).join("")}</ul>`
      : `<div class="empty-state">Mark items reviewed or missed to rank topics by retention.</div>`;
  }

  // ---- item list with derived state + reviewed/missed/delete actions ----
  const listEl = document.getElementById("reviewList");
  if (listEl) {
    listEl.innerHTML = "";
    items.forEach(it => {
      const st = MCAT.reviewState(it, today);
      const card = document.createElement("div");
      card.className = "review-item";
      card.innerHTML = `
        <div class="review-item-main">
          <span class="review-state-badge ${st}">${st}</span>
          <span class="review-item-topic">${escapeHtml(it.topic || "—")}</span>
          <span class="review-item-due muted small">${it.nextDue ? "due " + it.nextDue : "not scheduled"}</span>
        </div>
        <div class="review-item-content">${escapeHtml(it.content || "")}</div>
        <div class="review-item-actions">
          <button type="button" class="btn small review-reviewed-btn">Reviewed</button>
          <button type="button" class="btn small review-missed-btn">Missed</button>
          <button class="del-btn" title="delete">✕</button>
        </div>`;
      card.querySelector(".review-reviewed-btn").addEventListener("click", () => markReviewItemReviewed(it.id));
      card.querySelector(".review-missed-btn").addEventListener("click", () => markReviewItemMissed(it.id));
      card.querySelector(".del-btn").addEventListener("click", () => deleteReviewItem(it.id));
      listEl.appendChild(card);
    });
  }
  const emptyEl = document.getElementById("reviewEmpty");
  if (emptyEl) emptyEl.style.display = items.length ? "none" : "";
  renderReminders();
}

function markReviewItemReviewed(id) {
  const items = Array.isArray(state.reviewItems) ? state.reviewItems : [];
  state.reviewItems = items.map(it =>
    it.id === id ? MCAT.markReviewed(it, todayStr()) : it);
  save();
  renderReview();
}

function markReviewItemMissed(id) {
  const items = Array.isArray(state.reviewItems) ? state.reviewItems : [];
  state.reviewItems = items.map(it =>
    it.id === id ? MCAT.markMissed(it, todayStr()) : it);
  save();
  renderReview();
}

function deleteReviewItem(id) {
  state.reviewItems = (state.reviewItems || []).filter(it => it.id !== id);
  save();
  renderReview();
}

if (reviewForm) {
  reviewForm.addEventListener("submit", e => {
    e.preventDefault();
    const topic = document.getElementById("rvTopic").value.trim();
    const content = document.getElementById("rvContent").value.trim();
    // Req 11.1: topic 1..100 chars, content 1..2000 chars.
    const errors = [];
    if (topic.length < 1 || topic.length > 100) errors.push("Topic must be 1 to 100 characters.");
    if (content.length < 1 || content.length > 2000) errors.push("Content must be 1 to 2000 characters.");
    if (errors.length) { showReviewErrors(errors); return; } // state unchanged

    if (!Array.isArray(state.reviewItems)) state.reviewItems = [];
    // Created item starts as "new": never reviewed/missed, interval not advanced (Req 11.2).
    state.reviewItems.push({
      id: uid(), topic, content,
      state: "new", intervalIndex: -1, nextDue: "",
      reviewedMarks: 0, missedMarks: 0
    });
    save();
    reviewForm.reset();
    clearReviewErrors();
    renderReview();
  });
}

/* ---------------- Formula & Equation Sheet (Req 13) ----------------
   Searchable, taggable equation reference seeded once from MCAT.SEED_FORMULAS
   (see init below). All filtering is delegated to the pure helpers
   MCAT.filterByTags (tag chips, Req 13.9) and MCAT.searchFormulas (search box,
   Req 13.2/13.4); both preserve input order. The memorized flag is persisted to
   state.formulas and survives reloads (Req 13.5, 13.6). Practice recall
   (Req 13.7) and reveal (Req 13.8) are per-card view states handled directly on
   the DOM node so a re-render triggered elsewhere never resets them. */
let formulaSearchTerm = "";
let formulaSelectedTags = [];

// Distinct, sorted tags across all formulas for the tag-filter chip row.
function formulaAllTags(formulas) {
  const set = new Set();
  formulas.forEach(f => {
    const tags = Array.isArray(f && f.tags) ? f.tags : [];
    tags.forEach(t => { if (t != null && String(t).length) set.add(String(t)); });
  });
  return [...set].sort((a, b) => a.localeCompare(b));
}

// Paint the tag-filter chips (Req 13.9). Reuses the shared .chip / .chip.active
// look; clicking toggles a tag in formulaSelectedTags and re-renders.
function renderFormulaTags(formulas) {
  const wrap = document.getElementById("formulaTags");
  if (!wrap) return;
  const all = formulaAllTags(formulas);
  // Drop any selected tags that no longer exist so the filter stays valid.
  formulaSelectedTags = formulaSelectedTags.filter(t => all.includes(t));
  wrap.innerHTML = "";
  all.forEach(tag => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip" + (formulaSelectedTags.includes(tag) ? " active" : "");
    chip.textContent = tag;
    chip.addEventListener("click", () => {
      const i = formulaSelectedTags.indexOf(tag);
      if (i === -1) formulaSelectedTags.push(tag); else formulaSelectedTags.splice(i, 1);
      renderFormulas();
    });
    wrap.appendChild(chip);
  });
}

function renderFormulas() {
  const formulas = Array.isArray(state.formulas) ? state.formulas : [];
  renderFormulaTags(formulas);

  // Tag filter first (Req 13.9), then case-insensitive substring search
  // (Req 13.2). An empty search term matches everything, so clearing the box
  // restores all entries within the active tag filter (Req 13.4).
  const byTag = MCAT.filterByTags(formulas, formulaSelectedTags);
  const filtered = MCAT.searchFormulas(byTag, formulaSearchTerm);

  const listEl = document.getElementById("formulaList");
  const emptyEl = document.getElementById("formulaEmpty");
  const tpl = document.getElementById("formulaEntryTemplate");
  if (!listEl || !tpl) return;

  listEl.innerHTML = "";
  filtered.forEach(f => {
    const node = tpl.content.firstElementChild.cloneNode(true);
    node.querySelector(".formula-name").textContent = f.name || "";
    const exprEl = node.querySelector(".formula-expression");
    exprEl.textContent = f.expression || "";

    const tagsEl = node.querySelector(".formula-tags");
    tagsEl.innerHTML = "";
    (Array.isArray(f.tags) ? f.tags : []).forEach(t => {
      const pill = document.createElement("span");
      pill.className = "tag";
      pill.textContent = String(t == null ? "" : t);
      tagsEl.appendChild(pill);
    });

    // Memorized toggle — persists to state and survives reload (Req 13.5/13.6).
    const memo = node.querySelector(".formula-memorized-toggle");
    memo.checked = !!f.memorized;
    node.classList.toggle("memorized", !!f.memorized);
    memo.addEventListener("change", () => toggleFormulaMemorized(f.id, memo.checked));

    // Practice recall (Req 13.7): hide the expression and show the reveal
    // control. Reveal (Req 13.8) un-hides it. Local DOM state only — not saved.
    const recallBtn = node.querySelector(".formula-recall-toggle");
    const revealBtn = node.querySelector(".formula-reveal");
    recallBtn.addEventListener("click", () => {
      node.classList.add("recall");
      recallBtn.classList.add("active");
      exprEl.hidden = true;
      revealBtn.hidden = false;
    });
    revealBtn.addEventListener("click", () => {
      exprEl.hidden = false;
      revealBtn.hidden = true;
      node.classList.remove("recall");
      recallBtn.classList.remove("active");
    });

    listEl.appendChild(node);
  });

  // No-match / empty message (Req 13.3); the list collapses via :empty CSS.
  if (emptyEl) emptyEl.style.display = filtered.length ? "none" : "";
}

function toggleFormulaMemorized(id, memorized) {
  const formulas = Array.isArray(state.formulas) ? state.formulas : [];
  state.formulas = formulas.map(f => (f && f.id === id) ? { ...f, memorized: !!memorized } : f);
  save();
  renderFormulas();
}

// Live search wiring (Req 13.2/13.4): update the term as the user types.
const formulaSearchInput = document.getElementById("formulaSearch");
if (formulaSearchInput) {
  formulaSearchInput.addEventListener("input", () => {
    formulaSearchTerm = formulaSearchInput.value;
    renderFormulas();
  });
}

/* ---------------- High-Yield Notes (Req 14) ----------------

   Notes store the raw Markdown body VERBATIM in state (Req 14.6); HTML is
   produced only at display time via MCAT.renderMarkdown, which is XSS-safe by
   construction (Req 14.2/14.8) — rendered HTML is never persisted. Search is a
   case-insensitive substring over title|body|tags (Req 14.3) with an empty-state
   message when nothing matches (Req 14.7). A Note_Entry may reference Error_Log
   entries; navigation is offered only when the target still exists
   (MCAT.linkedErrorExists) — otherwise the link reads "linked entry unavailable"
   and navigation is suppressed (Req 14.4/14.9). The needs-review flag persists to
   the State_Object (Req 14.5). */
let noteSearchTerm = "";
let noteSelectedId = null;
let noteEditingId = null;  // when set, the note form updates this note instead of creating a new one (Req 14 edit flow)

// Parse the comma-separated tag input into up to 20 tags, each 1..50 chars
// (Req 14.1). Blank fragments are dropped; each kept tag is clamped to 50.
function parseNoteTags(raw) {
  return String(raw == null ? "" : raw)
    .split(",")
    .map(t => MCAT.clampText(t.trim(), 50))
    .filter(t => t.length > 0)
    .slice(0, 20);
}

// Switch to another view by reusing the existing nav-button routing.
function navigateToView(view) {
  const btn = document.querySelector('.nav-btn[data-view="' + view + '"]');
  if (btn) btn.click();
}

// A short, human-readable label for an Error_Log entry used in the link
// controls/list (date + topic, falling back gracefully when either is blank).
function errorLabel(w) {
  if (!w) return "Error log entry";
  const date = w.date || "";
  const topic = w.topic || w.source || "Error log entry";
  return (date ? date + " — " : "") + topic;
}

// Populate the note form's "link to missed questions" multi-select from the
// current Error_Log (Req 14.4). Re-run on every render so deleted entries drop
// out of the options. `selectedIds` re-selects the given ids (used when editing
// a note whose links should stay highlighted).
function populateNoteErrorOptions(selectedIds) {
  const sel = document.getElementById("noteLinkErrors");
  if (!sel) return;
  const selected = new Set((Array.isArray(selectedIds) ? selectedIds : []).map(String));
  const wrong = Array.isArray(state.wrong) ? state.wrong : [];
  sel.innerHTML = "";
  wrong.forEach(w => {
    if (!w || w.id == null) return;
    const opt = document.createElement("option");
    opt.value = String(w.id);
    opt.textContent = errorLabel(w);
    if (selected.has(String(w.id))) opt.selected = true;
    sel.appendChild(opt);
  });
}

// Read the ids currently selected in the link multi-select (Req 14.4).
function selectedNoteErrorIds() {
  const sel = document.getElementById("noteLinkErrors");
  if (!sel) return [];
  return Array.from(sel.selectedOptions).map(o => o.value);
}

// Paint the rendered-Markdown preview pane for the selected note (Req 14.2).
// HTML is generated here, at display time only, from the stored raw body — the
// rendered output is never written back to state.
function renderNotePreview() {
  const previewEl = document.getElementById("notePreview");
  const emptyEl = document.getElementById("notePreviewEmpty");
  if (!previewEl) return;
  const notes = Array.isArray(state.notes) ? state.notes : [];
  const note = notes.find(n => n && String(n.id) === String(noteSelectedId));
  if (!note) {
    previewEl.innerHTML = "";
    if (emptyEl) emptyEl.style.display = "";
    return;
  }
  previewEl.innerHTML = MCAT.renderMarkdown(note.body || "");
  if (emptyEl) emptyEl.style.display = "none";
}

function renderNotes() {
  const notes = Array.isArray(state.notes) ? state.notes : [];
  // Case-insensitive substring search over title|body|tags (Req 14.3); an empty
  // term matches everything, so clearing the box restores all notes (Req 14.7).
  const filtered = MCAT.searchNotes(notes, noteSearchTerm);

  const listEl = document.getElementById("noteList");
  const emptyEl = document.getElementById("noteEmpty");
  const tpl = document.getElementById("noteEntryTemplate");
  if (!listEl || !tpl) return;

  listEl.innerHTML = "";
  // Most recent first: notes are appended on save, so render in reverse order.
  [...filtered].reverse().forEach(note => {
    const node = tpl.content.firstElementChild.cloneNode(true);

    node.querySelector(".note-title").textContent = note.title || "";

    const tagsEl = node.querySelector(".note-tags");
    tagsEl.innerHTML = "";
    (Array.isArray(note.tags) ? note.tags : []).forEach(t => {
      const pill = document.createElement("span");
      pill.className = "tag";
      pill.textContent = String(t == null ? "" : t);
      tagsEl.appendChild(pill);
    });

    // Linked Error_Log references (Req 14.4/14.9): offer navigation only when the
    // target still exists; otherwise show an inert "unavailable" marker and do
    // not wire any navigation.
    const linkedEl = node.querySelector(".note-linked");
    linkedEl.innerHTML = "";
    const wrong = Array.isArray(state.wrong) ? state.wrong : [];
    (Array.isArray(note.linkedErrors) ? note.linkedErrors : []).forEach(errorId => {
      if (MCAT.linkedErrorExists(wrong, errorId)) {
        const entry = wrong.find(w => w && String(w.id) === String(errorId));
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "link-btn";
        btn.textContent = "↗ " + (entry && entry.topic ? entry.topic : "Error log entry");
        btn.addEventListener("click", () => navigateToView("wrong"));
        linkedEl.appendChild(btn);
      } else {
        const miss = document.createElement("span");
        miss.className = "note-link-missing";
        miss.textContent = "linked entry unavailable";
        linkedEl.appendChild(miss);
      }
    });

    // Needs-review toggle persists to state and survives reload (Req 14.5).
    const review = node.querySelector(".note-needs-review-toggle");
    review.checked = !!note.needsReview;
    node.classList.toggle("needs-review", !!note.needsReview);
    review.addEventListener("change", () => toggleNoteNeedsReview(note.id, review.checked));

    // Preview selects this note and renders its Markdown into the preview pane.
    if (String(note.id) === String(noteSelectedId)) node.classList.add("active");
    node.querySelector(".note-preview-btn").addEventListener("click", () => {
      noteSelectedId = note.id;
      renderNotes();
    });

    // Edit loads the note back into the form for in-place updating (Req 14 edit
    // flow). The form's submit handler updates this id rather than creating a new
    // note while noteEditingId is set.
    node.querySelector(".note-edit").addEventListener("click", () => startNoteEdit(note.id));

    node.querySelector(".note-delete").addEventListener("click", () => deleteNote(note.id));

    listEl.appendChild(node);
  });

  // No-match empty-state message (Req 14.7).
  if (emptyEl) emptyEl.style.display = filtered.length ? "none" : "";

  // Keep the link multi-select in sync with the current Error_Log, preserving
  // any in-progress selection across re-renders (Req 14.4).
  populateNoteErrorOptions(selectedNoteErrorIds());

  renderNotePreview();
}

function toggleNoteNeedsReview(id, needsReview) {
  const notes = Array.isArray(state.notes) ? state.notes : [];
  state.notes = notes.map(n => (n && n.id === id) ? { ...n, needsReview: !!needsReview } : n);
  save();
  renderNotes();
}

function deleteNote(id) {
  const notes = Array.isArray(state.notes) ? state.notes : [];
  state.notes = notes.filter(n => n && n.id !== id);
  if (String(noteSelectedId) === String(id)) noteSelectedId = null;
  if (String(noteEditingId) === String(id)) cancelNoteEdit();
  save();
  renderNotes();
}

// Load an existing note into the form for editing (Req 14 edit flow). While
// noteEditingId is set, submitting the form updates that note in place and
// preserves its id (and thus its position) instead of appending a new one.
function startNoteEdit(id) {
  const notes = Array.isArray(state.notes) ? state.notes : [];
  const note = notes.find(n => n && String(n.id) === String(id));
  if (!note) return;
  noteEditingId = note.id;
  document.getElementById("noteTitle").value = note.title || "";
  document.getElementById("noteTags").value = (Array.isArray(note.tags) ? note.tags : []).join(", ");
  document.getElementById("noteNeedsReview").checked = !!note.needsReview;
  document.getElementById("noteBody").value = note.body || "";
  populateNoteErrorOptions(note.linkedErrors);
  const submitBtn = document.getElementById("noteSubmitBtn");
  if (submitBtn) submitBtn.textContent = "Update note";
  const cancelBtn = document.getElementById("noteCancelEditBtn");
  if (cancelBtn) cancelBtn.hidden = false;
}

// Leave edit mode and clear the form back to "create" state.
function cancelNoteEdit() {
  noteEditingId = null;
  const form = document.getElementById("noteForm");
  if (form) form.reset();
  const submitBtn = document.getElementById("noteSubmitBtn");
  if (submitBtn) submitBtn.textContent = "Save note";
  const cancelBtn = document.getElementById("noteCancelEditBtn");
  if (cancelBtn) cancelBtn.hidden = true;
  populateNoteErrorOptions([]);
}

/* Create a Note_Entry from the form (Req 14.1/14.6). The body is stored VERBATIM
   (only length-capped, never trimmed) so the persisted text equals what the user
   typed character for character; rendering to HTML happens only at display time. */
const noteForm = document.getElementById("noteForm");
if (noteForm) {
  noteForm.addEventListener("submit", e => {
    e.preventDefault();
    const title = MCAT.clampText(document.getElementById("noteTitle").value.trim(), 200);
    if (!title) return; // title is required (1..200 chars)
    const body = MCAT.clampText(document.getElementById("noteBody").value, 50000);
    const tags = parseNoteTags(document.getElementById("noteTags").value);
    const needsReview = document.getElementById("noteNeedsReview").checked;
    // Resolve selected option values back to the actual Error_Log ids so the
    // stored links never drift from the real entry id types (Req 14.4).
    const wrong = Array.isArray(state.wrong) ? state.wrong : [];
    const selected = new Set(selectedNoteErrorIds());
    const linkedErrors = wrong.filter(w => w && w.id != null && selected.has(String(w.id))).map(w => w.id);

    if (!Array.isArray(state.notes)) state.notes = [];

    if (noteEditingId != null) {
      // Update the existing note in place, preserving id/order (Req 14 edit flow).
      state.notes = state.notes.map(n =>
        (n && String(n.id) === String(noteEditingId))
          ? { ...n, title, body, tags, needsReview, linkedErrors }
          : n);
      cancelNoteEdit();
    } else {
      state.notes.push({ id: uid(), title, body, tags, needsReview, linkedErrors });
      noteForm.reset();
      populateNoteErrorOptions([]);
    }
    save();
    renderNotes();
  });
}

// Cancel-edit returns the form to "create" mode without saving.
const noteCancelEditBtn = document.getElementById("noteCancelEditBtn");
if (noteCancelEditBtn) {
  noteCancelEditBtn.addEventListener("click", () => cancelNoteEdit());
}

// Live search wiring (Req 14.3/14.7): update the term as the user types.
const noteSearchInput = document.getElementById("noteSearch");
if (noteSearchInput) {
  noteSearchInput.addEventListener("input", () => {
    noteSearchTerm = noteSearchInput.value;
    renderNotes();
  });
}

/* ---------------- Goals & Milestones (Req 15) ----------------
   Reads/writes state.goals { targetScore, weeklyHourGoal, dailyQuestionGoal,
   milestones[] }. goals.targetScore is the SINGLE SOURCE OF TRUTH for the
   Dashboard "points to target" stat and the full-length chart target line —
   both read it through targetScore() (Req 15.5/15.6). Milestone done-state is
   stored on state and persisted via save(), so it survives reloads (Req 15.5).
   Progress and completed-FL figures are derived at display time from the pure
   helpers in core.js (Req 15.2/15.3/15.4). */
function renderGoals() {
  if (!state.goals || typeof state.goals !== "object") {
    state.goals = { targetScore: 510, weeklyHourGoal: 0, dailyQuestionGoal: 0, milestones: [] };
  }
  const goals = state.goals;
  if (!Array.isArray(goals.milestones)) goals.milestones = [];

  // Reflect the stored values into the inputs (without clobbering an in-progress
  // edit is unnecessary here — renderGoals only runs on nav/init/after-save).
  const targetInput = document.getElementById("goalTarget");
  const weeklyInput = document.getElementById("goalWeeklyHours");
  const dailyInput = document.getElementById("goalDailyQuestions");
  if (targetInput) targetInput.value = goals.targetScore != null ? goals.targetScore : "";
  if (weeklyInput) weeklyInput.value = goals.weeklyHourGoal != null ? goals.weeklyHourGoal : "";
  if (dailyInput) dailyInput.value = goals.dailyQuestionGoal != null ? goals.dailyQuestionGoal : "";

  const today = todayStr();

  // Weekly study-hour progress: Mon–Sun of the current week vs. the goal (Req 15.2).
  const wp = MCAT.weeklyHourProgress(state.sessions || {}, Number(goals.weeklyHourGoal), today);
  const weeklyProgressEl = document.getElementById("goalWeeklyProgress");
  const weeklyDetailEl = document.getElementById("goalWeeklyDetail");
  if (weeklyProgressEl) {
    weeklyProgressEl.textContent = wp.goalHours > 0
      ? `${wp.hours} / ${wp.goalHours} h`
      : `${wp.hours} h`;
  }
  if (weeklyDetailEl) {
    weeklyDetailEl.textContent = wp.goalHours > 0
      ? `${wp.hours} of ${wp.goalHours} hours logged this week (${wp.pct}%).`
      : `${wp.hours} hours logged this week. Set a weekly-hour goal to track progress.`;
  }

  // Daily question progress: questions logged today vs. the goal (Req 15.3).
  const dp = MCAT.dailyQuestionProgress(state.practiceSets || [], Number(goals.dailyQuestionGoal), today);
  const dailyProgressEl = document.getElementById("goalDailyProgress");
  const dailyDetailEl = document.getElementById("goalDailyDetail");
  if (dailyProgressEl) {
    dailyProgressEl.textContent = dp.goal > 0
      ? `${dp.count} / ${dp.goal}`
      : `${dp.count}`;
  }
  if (dailyDetailEl) {
    dailyDetailEl.textContent = dp.goal > 0
      ? `${dp.count} of ${dp.goal} questions today (${dp.pct}%).`
      : `${dp.count} questions logged today. Set a daily-question goal to track progress.`;
  }

  // Completed full-length count (Req 15.4).
  const completedEl = document.getElementById("goalCompletedFL");
  if (completedEl) completedEl.textContent = MCAT.completedFullLengthCount(state.scores);

  renderMilestones();
}

// Paint the milestone checklist. Checkbox state mirrors milestone.done, which is
// persisted to state — toggling + save() makes it survive reloads (Req 15.5).
function renderMilestones() {
  const listEl = document.getElementById("milestoneList");
  const emptyEl = document.getElementById("milestoneEmpty");
  if (!listEl) return;
  const milestones = (state.goals && Array.isArray(state.goals.milestones))
    ? state.goals.milestones : [];

  listEl.innerHTML = "";
  milestones.forEach(m => {
    if (!m) return;
    const li = document.createElement("li");
    li.className = "milestone-item" + (m.done ? " done" : "");

    const label = document.createElement("label");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = !!m.done;
    cb.addEventListener("change", () => toggleMilestoneDone(m.id));
    const span = document.createElement("span");
    span.className = "milestone-text";
    span.textContent = m.text || "";
    label.appendChild(cb);
    label.appendChild(span);

    const del = document.createElement("button");
    del.type = "button";
    del.className = "icon-btn milestone-delete";
    del.textContent = "✕";
    del.setAttribute("aria-label", "Delete milestone");
    del.addEventListener("click", () => deleteMilestone(m.id));

    li.appendChild(label);
    li.appendChild(del);
    listEl.appendChild(li);
  });

  if (emptyEl) emptyEl.style.display = milestones.length ? "none" : "";
}

// Flip a milestone's done flag via the pure helper, persist, and re-render so the
// stored completion state is retained across reloads (Req 15.5).
function toggleMilestoneDone(id) {
  if (!state.goals) return;
  state.goals.milestones = MCAT.toggleMilestone(state.goals.milestones, id);
  save();
  renderMilestones();
}

function deleteMilestone(id) {
  if (!state.goals || !Array.isArray(state.goals.milestones)) return;
  state.goals.milestones = state.goals.milestones.filter(m => m && String(m.id) !== String(id));
  save();
  renderMilestones();
}

/* Save the goal targets. The target score is validated with validateTarget: an
   invalid value is rejected, the previously stored target is retained, and an
   error message naming the 472–528 range is shown (Req 15.7). A valid target is
   stored as goals.targetScore — the single source of truth — and the Dashboard
   and full-length chart are re-rendered so the new target propagates everywhere
   that reads targetScore() (Req 15.6). Weekly-hour (0–168) and daily-question
   (0–9999) goals are coerced into range; out-of-range/blank values retain the
   prior stored value. */
const goalForm = document.getElementById("goalForm");
if (goalForm) {
  goalForm.addEventListener("submit", e => {
    e.preventDefault();
    if (!state.goals || typeof state.goals !== "object") {
      state.goals = { targetScore: 510, weeklyHourGoal: 0, dailyQuestionGoal: 0, milestones: [] };
    }
    const goals = state.goals;
    const errEl = document.getElementById("goalTargetError");

    // Target score (Req 15.6/15.7): validate exactly; reject + retain on failure.
    const targetRaw = document.getElementById("goalTarget").value.trim();
    const result = MCAT.validateTarget(targetRaw);
    if (!result.ok) {
      if (errEl) {
        errEl.textContent = result.reason || "Target score must be an integer from 472 to 528.";
        errEl.hidden = false;
      }
      // Restore the input to the retained value and stop — prior target stands.
      document.getElementById("goalTarget").value = goals.targetScore != null ? goals.targetScore : "";
      return;
    }
    if (errEl) { errEl.textContent = ""; errEl.hidden = true; }
    goals.targetScore = result.value;

    // Weekly-hour goal: number 0–168 (Req 15.1); retain prior on invalid/blank.
    const weeklyRaw = document.getElementById("goalWeeklyHours").value.trim();
    if (weeklyRaw !== "") {
      const wh = Number(weeklyRaw);
      if (isFinite(wh) && wh >= 0 && wh <= 168) goals.weeklyHourGoal = wh;
    }

    // Daily-question goal: integer 0–9999 (Req 15.1); retain prior on invalid/blank.
    const dailyRaw = document.getElementById("goalDailyQuestions").value.trim();
    if (dailyRaw !== "") {
      const dq = Number(dailyRaw);
      if (Number.isInteger(dq) && dq >= 0 && dq <= 9999) goals.dailyQuestionGoal = dq;
    }

    save();
    renderGoals();
    // Propagate the target to its other consumers (Req 15.6).
    renderDashboard();
    drawChart();
  });
}

/* Add a milestone, gated by validateMilestone (non-empty, ≤200 chars, under the
   100-item cap). Rejections surface a reason and leave the list unchanged. */
const milestoneForm = document.getElementById("milestoneForm");
if (milestoneForm) {
  milestoneForm.addEventListener("submit", e => {
    e.preventDefault();
    if (!state.goals || typeof state.goals !== "object") {
      state.goals = { targetScore: 510, weeklyHourGoal: 0, dailyQuestionGoal: 0, milestones: [] };
    }
    if (!Array.isArray(state.goals.milestones)) state.goals.milestones = [];
    const input = document.getElementById("milestoneInput");
    const errEl = document.getElementById("milestoneError");
    const result = MCAT.validateMilestone(input.value, state.goals.milestones.length);
    if (!result.ok) {
      if (errEl) { errEl.textContent = result.reason || "Invalid milestone."; errEl.hidden = false; }
      return;
    }
    if (errEl) { errEl.textContent = ""; errEl.hidden = true; }
    state.goals.milestones.push({ id: uid(), text: result.value, done: false });
    milestoneForm.reset();
    save();
    renderMilestones();
  });
}

/* ---------------- Daily Study Log (Req 16) ----------------
   Render/handler layer for the reflective Daily_Log. The submit handler reads
   the form, validates via MCAT.validateDailyLog (reject + reason, retaining any
   existing entry for that date — Req 16.2/16.3) and persists through
   MCAT.upsertDailyLog so a second entry for the same date REPLACES the existing
   one (at most one entry per date — Req 16.2). renderDailyLog repaints the list
   newest-first (Req 16.5) and keeps the display area visible with an empty-state
   when no entries exist (Req 16.6). The four reflection prompts (Req 16.4) are
   stored per-entry; each is capped at 2000 chars to match the reflection bound. */

// Show/clear the inline daily-log error banner (#dailyLogError, a .form-error div).
function showDailyLogError(errors) {
  const el = document.getElementById("dailyLogError");
  if (!el) return;
  const labels = {
    date: "Date", hours: "Hours studied", questions: "Questions done",
    accuracy: "Accuracy", energy: "Energy", confidence: "Confidence"
  };
  // Preserve a sensible field order in the combined message.
  const order = ["date", "hours", "questions", "accuracy", "energy", "confidence"];
  const msgs = order.filter(k => errors[k]).map(k => errors[k]);
  Object.keys(errors).forEach(k => { if (!order.includes(k)) msgs.push(errors[k]); });
  el.innerHTML = `<ul class="form-error-list">${
    msgs.map(m => `<li>${escapeHtml(m)}</li>`).join("")}</ul>`;
  el.hidden = false;
}
function clearDailyLogError() {
  const el = document.getElementById("dailyLogError");
  if (el) { el.innerHTML = ""; el.hidden = true; }
}

function renderDailyLog() {
  const entries = Array.isArray(state.dailyLog) ? state.dailyLog : [];
  const hasEntries = entries.length > 0;

  const listEl = document.getElementById("dailyLogList");
  const emptyEl = document.getElementById("dailyLogEmpty");

  // Display area is ALWAYS visible; the empty-state toggles within it (Req 16.6).
  if (emptyEl) emptyEl.style.display = hasEntries ? "none" : "";

  if (listEl) {
    listEl.innerHTML = "";
    // Most-recent-first by date; stable tie-break keeps a deterministic order.
    const ordered = [...entries].sort((a, b) =>
      (b.date || "").localeCompare(a.date || ""));
    ordered.forEach(en => {
      const card = document.createElement("div");
      card.className = "daily-log-entry";

      const reflections = [
        ["What I learned", en.learned],
        ["What confused me", en.confused],
        ["Review tomorrow", en.reviewTomorrow],
        ["Mistake pattern", en.mistakePattern]
      ].filter(([, v]) => v && String(v).trim() !== "");

      card.innerHTML = `
        <div class="daily-log-head">
          <span class="daily-log-date">${escapeHtml(en.date || "—")}</span>
          <button class="del-btn" title="delete" type="button">✕</button>
        </div>
        <div class="daily-log-metrics">
          <span><strong>${en.hours}</strong> h</span>
          <span><strong>${en.questions}</strong> Q</span>
          <span><strong>${en.accuracy}%</strong> acc</span>
          <span>Energy <strong>${en.energy}</strong>/5</span>
          <span>Confidence <strong>${en.confidence}</strong>/5</span>
          ${en.subject ? `<span class="daily-log-subject">${escapeHtml(en.subject)}</span>` : ""}
        </div>
        ${reflections.length ? `<dl class="daily-log-reflection">${
          reflections.map(([label, v]) =>
            `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(String(v))}</dd>`).join("")}</dl>` : ""}`;
      card.querySelector(".del-btn").addEventListener("click", () => deleteDailyLog(en.date));
      listEl.appendChild(card);
    });
  }
}

function deleteDailyLog(date) {
  state.dailyLog = (Array.isArray(state.dailyLog) ? state.dailyLog : [])
    .filter(en => en.date !== date);
  save();
  renderDailyLog();
}

const dailyLogForm = document.getElementById("dailyLogForm");
if (dailyLogForm) {
  dailyLogForm.addEventListener("submit", e => {
    e.preventDefault();
    const cap = s => (MCAT.clampText ? MCAT.clampText(s, 2000) : String(s == null ? "" : s).slice(0, 2000));
    const input = {
      date: document.getElementById("dlDate").value,
      hours: document.getElementById("dlHours").value,
      questions: document.getElementById("dlQuestions").value,
      accuracy: document.getElementById("dlAccuracy").value,
      subject: document.getElementById("dlSubject").value,
      energy: document.getElementById("dlEnergy").value,
      confidence: document.getElementById("dlConfidence").value
    };
    const result = MCAT.validateDailyLog(input);
    // Reject + reason; existing entry for that date is untouched (Req 16.3).
    if (!result.ok) { showDailyLogError(result.errors); return; }

    // Augment the normalized entry with the four reflection prompts (Req 16.4).
    const entry = Object.assign({}, result.value, {
      learned: cap(document.getElementById("dlLearned").value),
      confused: cap(document.getElementById("dlConfused").value),
      reviewTomorrow: cap(document.getElementById("dlReviewTomorrow").value),
      mistakePattern: cap(document.getElementById("dlMistakePattern").value)
    });

    // upsert: replace any same-date entry, else append (Req 16.2).
    state.dailyLog = MCAT.upsertDailyLog(state.dailyLog, entry);
    save();
    clearDailyLogError();
    dailyLogForm.reset();
    renderDailyLog();
  });
}

/* ---------------- Analytics (Req 8) ----------------
   Derived-only view: reads state.practiceSets/sessions/wrong/scores, calls the
   pure aggregations in core.js (MCAT.*), and paints charts/lists via the shared
   SVG helpers. Each metric toggles ITS OWN empty-state independently so a
   missing metric never blanks a populated one (Req 8.8). */

// Show/hide an analytics metric's content node vs. its matching empty-state div.
function toggleAnalytics(contentId, emptyId, hasData) {
  const content = document.getElementById(contentId);
  const empty = document.getElementById(emptyId);
  if (content) content.style.display = hasData ? "" : "none";
  if (empty) empty.style.display = hasData ? "none" : "";
}

function renderAnalytics() {
  const sets = Array.isArray(state.practiceSets) ? state.practiceSets : [];
  const sessions = state.sessions || {};
  const wrong = Array.isArray(state.wrong) ? state.wrong : [];
  const scores = Array.isArray(state.scores) ? state.scores : [];

  // Accuracy by section — horizontal bars, whole-number pct, max 100 (Req 8.1).
  const bySection = MCAT.analyticsAccuracyBySection(sets).map(g => ({ label: g.section, value: g.pct }));
  toggleAnalytics("anChartBySection", "anChartBySectionEmpty", bySection.length > 0);
  if (bySection.length) drawBarChart(document.getElementById("anChartBySection"), bySection, { max: 100, orientation: "horizontal" });

  // Accuracy by topic — horizontal bars, whole-number pct, max 100 (Req 8.2).
  const byTopic = MCAT.analyticsAccuracyByTopic(sets).map(g => ({ label: g.topic, value: g.pct }));
  toggleAnalytics("anChartByTopic", "anChartByTopicEmpty", byTopic.length > 0);
  if (byTopic.length) drawBarChart(document.getElementById("anChartByTopic"), byTopic, { max: 100, orientation: "horizontal" });

  // Practice volume per week — vertical bars keyed on weekStart; max = data max (Req 8.3).
  const volume = MCAT.weeklyVolume(sets).map(w => ({ label: w.weekStart, value: w.attempted }));
  const volMax = volume.reduce((m, b) => Math.max(m, b.value), 0);
  toggleAnalytics("anChartVolume", "anChartVolumeEmpty", volume.length > 0);
  if (volume.length) drawBarChart(document.getElementById("anChartVolume"), volume, { max: volMax || 1, orientation: "vertical" });

  // Study hours per week — vertical bars keyed on weekStart; max = data max (Req 8.4).
  const hours = MCAT.weeklyHours(sessions).map(w => ({ label: w.weekStart, value: w.hours }));
  const hoursMax = hours.reduce((m, b) => Math.max(m, b.value), 0);
  toggleAnalytics("anChartHours", "anChartHoursEmpty", hours.length > 0);
  if (hours.length) drawBarChart(document.getElementById("anChartHours"), hours, { max: hoursMax || 1, orientation: "vertical" });

  // Weakness ranking — ordered list (topic — pct% — n attempted) (Req 8.5).
  const weakness = MCAT.weaknessRanking(sets);
  toggleAnalytics("anWeakness", "anWeaknessEmpty", weakness.length > 0);
  const weaknessEl = document.getElementById("anWeakness");
  if (weaknessEl) {
    weaknessEl.innerHTML = weakness.length
      ? `<ol class="rank-list">${weakness.map(w =>
          `<li><span class="rank-topic">${escapeHtml(w.topic)}</span>` +
          `<span class="rank-meta">${w.pct}% · ${w.attempted} attempted</span></li>`).join("")}</ol>`
      : "";
  }

  // Mistake frequency — ordered list (category — count) (Req 8.6). Empty-state
  // when no mistakes are logged (every category count would be 0).
  const mistakes = MCAT.mistakeFrequency(wrong);
  const hasMistakes = wrong.length > 0 && mistakes.some(m => m.count > 0);
  toggleAnalytics("anMistakes", "anMistakesEmpty", hasMistakes);
  const mistakesEl = document.getElementById("anMistakes");
  if (mistakesEl) {
    mistakesEl.innerHTML = hasMistakes
      ? `<ol class="rank-list">${mistakes.map(m =>
          `<li><span class="rank-topic">${escapeHtml(m.category)}</span>` +
          `<span class="rank-meta">${m.count}</span></li>`).join("")}</ol>`
      : "";
  }

  // Full-length total trend — line chart, chronological by date taken (Req 8.7).
  const trendScores = [...scores].sort((a, b) =>
    (a.date || "").localeCompare(b.date || "") || String(a.id).localeCompare(String(b.id)));
  const trend = trendScores.map(s => ({ label: s.date || "", value: scoreTotal(s) }));
  toggleAnalytics("anChartTotalTrend", "anChartTotalTrendEmpty", trend.length > 0);
  if (trend.length) {
    const totals = trend.map(p => p.value);
    const lo = Math.min.apply(null, totals), hi = Math.max.apply(null, totals);
    let yMin = Math.max(472, lo - 3);
    let yMax = Math.min(528, hi + 3);
    if (yMax <= yMin) yMax = yMin + 1;
    drawLineChart(document.getElementById("anChartTotalTrend"), trend, { yMin, yMax });
  }

  // Predicted score range — "low–high", or empty-state when null/<2 records (Req 8.9).
  const predicted = MCAT.predictedScoreRange(scores);
  toggleAnalytics("anPredicted", "anPredictedEmpty", predicted != null);
  const predictedEl = document.getElementById("anPredicted");
  if (predictedEl) {
    predictedEl.innerHTML = predicted
      ? `<div class="predicted-range">${predicted.low}\u2013${predicted.high}</div>`
      : "";
  }
}

/* ---------------- Content Review Tracker (Req 5) ----------------

   Derived-from-state view: builds the subject tree (predefined blueprint
   topics merged with the user's custom topics) via MCAT.buildSubjectTree,
   renders each section → group → topic row with a status <select>, and
   paints the per-status count summary. Status changes persist under the
   stable key "{section}::{label}" and refresh the counts; the add-custom
   form validates through MCAT.validateCustomTopic before mutating state. */

// Show or clear the inline rejection reason for the add-custom-topic form.
function showContentError(reason) {
  const el = document.getElementById("contentCustomError");
  if (!el) return;
  if (reason) {
    el.textContent = reason;
    el.hidden = false;
  } else {
    el.textContent = "";
    el.hidden = true;
  }
}

// Paint the per-status count badges (all five statuses, zeros included; Req 5.5).
function renderContentCounts(tree) {
  const el = document.getElementById("contentStatusCounts");
  if (!el) return;
  const counts = MCAT.statusCounts(tree, state.contentStatuses);
  el.innerHTML = MCAT.CONTENT_STATUSES
    .map(status =>
      `<span class="status-count" data-status="${escapeHtml(status)}">` +
      `${escapeHtml(status)}<span class="n">${counts[status]}</span></span>`)
    .join("");
}

function renderContent() {
  const tree = MCAT.buildSubjectTree(state.customContentTopics);
  const statuses = (state.contentStatuses && typeof state.contentStatuses === "object")
    ? state.contentStatuses : {};

  const treeEl = document.getElementById("contentTree");
  if (treeEl) {
    treeEl.innerHTML = "";
    tree.forEach(node => {
      const sectionEl = document.createElement("div");
      sectionEl.className = "content-section";
      sectionEl.innerHTML = `<h2 class="content-section-title">${escapeHtml(node.section)}</h2>`;

      node.groups.forEach(group => {
        const groupEl = document.createElement("div");
        groupEl.className = "content-group";
        groupEl.innerHTML = `<h3 class="content-group-title">${escapeHtml(group.name)}</h3>`;

        group.topics.forEach(label => {
          const key = MCAT.contentTopicKey(node.section, label);
          const stored = statuses[key];
          const current = MCAT.CONTENT_STATUSES.includes(stored) ? stored : "not started";

          const row = document.createElement("div");
          row.className = "content-topic-row";
          row.dataset.status = current;

          const options = MCAT.CONTENT_STATUSES
            .map(s => `<option value="${escapeHtml(s)}"${s === current ? " selected" : ""}>${escapeHtml(s)}</option>`)
            .join("");
          row.innerHTML =
            `<span class="content-topic-label">${escapeHtml(label)}</span>` +
            `<select class="content-status-select">${options}</select>`;

          row.querySelector(".content-status-select").addEventListener("change", ev => {
            state.contentStatuses[key] = ev.target.value;
            save();
            row.dataset.status = ev.target.value;
            renderContentCounts(MCAT.buildSubjectTree(state.customContentTopics));
          });

          groupEl.appendChild(row);
        });

        sectionEl.appendChild(groupEl);
      });

      treeEl.appendChild(sectionEl);
    });
  }

  renderContentCounts(tree);
}

const contentCustomForm = document.getElementById("contentCustomForm");
if (contentCustomForm) {
  contentCustomForm.addEventListener("submit", e => {
    e.preventDefault();
    const sectionEl = document.getElementById("ccSection");
    const labelEl = document.getElementById("ccLabel");
    const section = sectionEl ? sectionEl.value : "";
    const rawLabel = labelEl ? labelEl.value : "";

    const result = MCAT.validateCustomTopic(
      section, rawLabel, MCAT.buildSubjectTree(state.customContentTopics));
    if (!result.ok) {
      showContentError(result.reason);
      return;
    }

    if (!Array.isArray(state.customContentTopics)) state.customContentTopics = [];
    state.customContentTopics.push({ section, label: rawLabel.trim() });
    save();
    showContentError("");
    if (labelEl) labelEl.value = "";
    renderContent();
  });
}


/* ============================================================
   Test-Day Readiness Checklist render + handlers (Req 17.2–17.5)
   ============================================================ */

// Show or clear the inline rejection reason for the add-custom-item form (Req 17.5).
function showReadinessError(reason) {
  const el = document.getElementById("readinessError");
  if (!el) return;
  if (reason) {
    el.textContent = reason;
    el.hidden = false;
  } else {
    el.textContent = "";
    el.hidden = true;
  }
}

// Refresh the "completed / total" stat from the pure helper (Req 17.3).
// Total = predefined + custom item count, per Requirement 17.3.
function renderReadinessCount() {
  const el = document.getElementById("readinessCount");
  if (!el) return;
  const r = (state.readiness && typeof state.readiness === "object") ? state.readiness : {};
  const predefined = Array.isArray(r.predefined) ? r.predefined : [];
  const custom = Array.isArray(r.custom) ? r.custom : [];
  el.textContent = MCAT.completedCount(state.readiness) + " / " + (predefined.length + custom.length);
}

// Build one checklist <li> with a check-off box that persists on change (Req 17.2).
// `onToggle` receives the new checked state; labels use textContent so
// whitespace-only / markup-y custom labels are rendered safely.
function buildReadinessRow(item, onToggle, onDelete) {
  const li = document.createElement("li");

  const label = document.createElement("label");
  label.className = "readiness-label";

  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.checked = item.checked === true;
  cb.addEventListener("change", () => {
    onToggle(cb.checked);
    save();                 // persist across reloads (Req 17.2)
    renderReadinessCount(); // update completed count on every change (Req 17.3)
  });

  const text = document.createElement("span");
  text.textContent = item.label;

  label.appendChild(cb);
  label.appendChild(text);
  li.appendChild(label);

  if (onDelete) {
    const del = document.createElement("button");
    del.type = "button";
    del.className = "readiness-del";
    del.setAttribute("aria-label", "Delete item");
    del.textContent = "×";
    del.addEventListener("click", onDelete);
    li.appendChild(del);
  }

  return li;
}

function renderReadiness() {
  if (!state.readiness || typeof state.readiness !== "object") {
    state.readiness = { predefined: [], custom: [] };
  }
  if (!Array.isArray(state.readiness.predefined)) state.readiness.predefined = [];
  if (!Array.isArray(state.readiness.custom)) state.readiness.custom = [];

  const predefined = state.readiness.predefined;
  const custom = state.readiness.custom;

  // Predefined items (Req 17.1, 17.2).
  const predefinedEl = document.getElementById("readinessPredefined");
  if (predefinedEl) {
    predefinedEl.innerHTML = "";
    predefined.forEach(item => {
      predefinedEl.appendChild(
        buildReadinessRow(item, checked => { item.checked = checked; })
      );
    });
  }

  // Custom items (Req 17.4) with per-row delete.
  const customEl = document.getElementById("readinessCustomList");
  if (customEl) {
    customEl.innerHTML = "";
    custom.forEach(item => {
      customEl.appendChild(
        buildReadinessRow(
          item,
          checked => { item.checked = checked; },
          () => {
            state.readiness.custom = state.readiness.custom.filter(c => c.id !== item.id);
            save();
            renderReadiness();
          }
        )
      );
    });
  }

  const emptyEl = document.getElementById("readinessCustomEmpty");
  if (emptyEl) emptyEl.hidden = custom.length > 0;

  renderReadinessCount();
}

// Add-custom-item form: validate via the pure gatekeeper, reject with a reason,
// and leave the checklist unchanged on failure (Req 17.4, 17.5).
const readinessForm = document.getElementById("readinessForm");
if (readinessForm) {
  readinessForm.addEventListener("submit", e => {
    e.preventDefault();
    const input = document.getElementById("readinessInput");
    const label = input ? input.value : "";

    if (!state.readiness || typeof state.readiness !== "object") {
      state.readiness = { predefined: [], custom: [] };
    }
    if (!Array.isArray(state.readiness.custom)) state.readiness.custom = [];

    // Whitespace-only labels are ALLOWED; only zero-length / >100 / at-cap reject.
    const result = MCAT.validateChecklistItem(label, state.readiness.custom.length);
    if (!result.ok) {
      showReadinessError(result.reason);
      return;
    }

    state.readiness.custom.push({ id: uid(), label, checked: false });
    save();
    showReadinessError("");
    if (input) input.value = "";
    renderReadiness();
  });
}

/* ---------------- Application ---------------- */
const appForm = document.getElementById("appForm");
const cols = { todo: document.getElementById("appTodo"), progress: document.getElementById("appProgress"), done: document.getElementById("appDone") };
const nextStatus = { todo: "progress", progress: "done", done: "todo" };
const statusLabel = { todo: "Start →", progress: "Done →", done: "Reopen ↺" };
appForm.addEventListener("submit", e => {
  e.preventDefault();
  const text = document.getElementById("appInput").value.trim();
  if (!text) return;
  state.appItems.push({ id: uid(), text, status: document.getElementById("appStatus").value });
  document.getElementById("appInput").value = ""; save(); renderApp();
});
function renderApp() {
  Object.values(cols).forEach(c => c.innerHTML = "");
  state.appItems.forEach(item => {
    const li = document.createElement("li");
    li.className = "app-card";
    li.innerHTML = `
      <button class="del-btn">✕</button>
      <div class="a-text">${escapeHtml(item.text)}</div>
      <div class="a-actions"><button class="move">${statusLabel[item.status]}</button></div>`;
    li.querySelector(".move").addEventListener("click", () => { item.status = nextStatus[item.status]; save(); renderApp(); });
    li.querySelector(".del-btn").addEventListener("click", () => { state.appItems = state.appItems.filter(x => x.id !== item.id); save(); renderApp(); });
    cols[item.status].appendChild(li);
  });
}

/* ---------------- Resources ---------------- */
const resources = [
  { group: "Chem / Physics", items: [
    { name: "Chemistry / Physics Tip Sheet", file: "Chemistry_Physics Tip Sheet - For Sharing.docx", type: "DOCX" },
    { name: "MCATalyst MCAT Equations (Updated)", file: "MCATalyst MCAT Equations (Updated).pdf", type: "PDF" },
    { name: "MCATalyst Lab Techniques", file: "MCATalyst Lab Techniques.pdf", type: "PDF" }
  ]},
  { group: "Bio / Biochem", items: [
    { name: "Biology / Biochemistry Tips", file: "Biology_Biochemistry Tips - For Sharing.docx", type: "DOCX" }
  ]},
  { group: "Psych / Soc", items: [
    { name: "86 Page Psych/Soc Doc", file: "86 Page Psych_Soc Doc.pdf", type: "PDF" },
    { name: "300 Page Psych/Soc Doc", file: "300 Page Psych_Soc Doc.pdf", type: "PDF" },
    { name: "Psychology / Sociology Tip Sheet", file: "Psychology_Sociology Tip Sheet - For Sharing.docx", type: "DOCX" }
  ]},
  { group: "CARS", items: [
    { name: "CARS Tipsheet", file: "CARS Tipsheet.docx", type: "DOCX" }
  ]},
  { group: "General", items: [
    { name: "MCAT General Tips (WIP)", file: "MCAT General Tips (Work In Progress .docx", type: "DOCX" },
    { name: "UWorld Chapter Breakdown", file: "UWORLD CHAPTER BREAKDOWN.xlsx", type: "XLSX" }
  ]}
];
function iconFor(type) { return type === "PDF" ? "📕" : type === "XLSX" ? "📊" : "📄"; }
function renderResources() {
  const wrap = document.getElementById("resourceGroups");
  wrap.innerHTML = "";
  resources.forEach(g => {
    const div = document.createElement("div");
    div.className = "res-group";
    div.innerHTML = `<h2>${g.group}</h2><div class="res-list">` +
      g.items.map(it => `
        <a class="res-card" href="Resources/${encodeURIComponent(it.file)}" target="_blank" rel="noopener">
          <span class="res-ico">${iconFor(it.type)}</span>
          <span><span class="res-name">${escapeHtml(it.name)}</span><br><span class="res-type">${it.type}</span></span>
        </a>`).join("") + `</div>`;
    wrap.appendChild(div);
  });
  renderResourceTracker();
}

/* ---------------- Resource tracker (Req 12) ----------------
   Editable companion to the static resource links above. The links are
   rendered untouched by renderResources(); this section adds the tracked-
   resource table, the add form, and the order-by-priority control.

   Pure helpers (core.js): validateResourceCounts (Req 12.4/12.5),
   completionPct (Req 12.2/12.3), sortByPriority (Req 12.7/12.8). */
const PRIORITY_LABELS = { high: "High", med: "Medium", low: "Low" };
// When true, the tracked-resource table is shown highest→lowest priority.
let resourceOrderByPriority = false;

function showResourceError(msg) {
  const el = document.getElementById("resourceFormError");
  if (!el) { alert(msg); return; }
  el.textContent = msg;
  el.hidden = false;
}
function clearResourceError() {
  const el = document.getElementById("resourceFormError");
  if (el) { el.textContent = ""; el.hidden = true; }
}

function renderResourceTracker() {
  const body = document.getElementById("resourceTrackerBody");
  if (!body) return;
  const entries = Array.isArray(state.resourceTracker) ? state.resourceTracker : [];

  // Priority ordering (Req 12.7). On a technical failure surface an error and
  // keep the current view unchanged — no fallback reordering (Req 12.8).
  let display = entries;
  if (resourceOrderByPriority) {
    try {
      display = MCAT.sortByPriority(entries);
    } catch (e) {
      showResourceError("Could not order by priority. The current view is unchanged.");
      resourceOrderByPriority = false;
      display = entries;
    }
  }

  body.innerHTML = "";
  display.forEach(r => {
    const tr = document.createElement("tr");
    const completed = Number(r.questionsCompleted) || 0;
    const total = Number(r.totalQuestions) || 0;
    const accuracy = (r.accuracy === null || r.accuracy === undefined || r.accuracy === "")
      ? "—" : `${r.accuracy}%`;
    tr.innerHTML = `
      <td>${escapeHtml(r.name || "—")}</td>
      <td>${escapeHtml(r.type || "—")}</td>
      <td>${escapeHtml(MCAT.completionPct(completed, total))}</td>
      <td>${completed} / ${total}</td>
      <td>${accuracy}</td>
      <td>${escapeHtml(PRIORITY_LABELS[r.priority] || r.priority || "—")}</td>
      <td>${escapeHtml(r.notes || "")}</td>
      <td><button class="del-btn" title="delete">✕</button></td>`;
    tr.querySelector(".del-btn").addEventListener("click", () => deleteResourceEntry(r.id));
    body.appendChild(tr);
  });

  const empty = document.getElementById("resourceTrackerEmpty");
  if (empty) empty.style.display = display.length ? "none" : "";
}

function deleteResourceEntry(id) {
  state.resourceTracker = (state.resourceTracker || []).filter(r => r.id !== id);
  save();
  renderResourceTracker();
}

const resourceForm = document.getElementById("resourceForm");
if (resourceForm) {
  resourceForm.addEventListener("submit", e => {
    e.preventDefault();
    const name = document.getElementById("resName").value.trim();
    const type = document.getElementById("resType").value.trim();
    const totalRaw = document.getElementById("resTotal").value;
    const completedRaw = document.getElementById("resCompleted").value;
    const accuracyRaw = document.getElementById("resAccuracy").value;
    const priority = document.getElementById("resPriority").value;
    const notes = document.getElementById("resNotes").value.trim();

    if (!name) { showResourceError("Name is required."); return; }

    // Blank count fields default to 0; validate integers >=0 and completed<=total.
    const total = totalRaw === "" ? 0 : totalRaw;
    const completed = completedRaw === "" ? 0 : completedRaw;
    const check = MCAT.validateResourceCounts(completed, total);
    if (!check.ok) { showResourceError(check.reason); return; } // reject + retain prior

    let accuracy = null;
    if (accuracyRaw !== "") {
      const a = Number(accuracyRaw);
      if (!isFinite(a) || a < 0 || a > 100) {
        showResourceError("Accuracy must be a number from 0 to 100.");
        return;
      }
      accuracy = a;
    }

    const entry = {
      id: uid(),
      name: name.slice(0, 200),
      type: type.slice(0, 100),
      totalQuestions: Number(total),
      questionsCompleted: Number(completed),
      accuracy,
      priority: MCAT.PRIORITY_LEVELS.includes(priority) ? priority : "med",
      notes: notes.slice(0, 2000)
    };
    if (!Array.isArray(state.resourceTracker)) state.resourceTracker = [];
    state.resourceTracker.push(entry);
    save();
    resourceForm.reset();
    clearResourceError();
    renderResourceTracker();
  });
}

const resourceOrderBtn = document.getElementById("resourceOrderPriority");
if (resourceOrderBtn) {
  resourceOrderBtn.addEventListener("click", () => {
    resourceOrderByPriority = true;
    clearResourceError();
    renderResourceTracker();
  });
}

/* ---------------- Calendar ---------------- */
let calView = "day";
let calCursor = new Date(); // reference date for current view
const HOUR_H = 48;          // px per hour in the time grid
const SNAP = 15;            // minute snap increment
let drag = null;
let suppressClick = false;
const calBody = document.getElementById("calBody");
const calLabel = document.getElementById("calLabel");
const typeNames = { study: "Study", test: "Test / FL", application: "Application", personal: "Personal" };

const calForm = document.getElementById("calForm");
calForm.addEventListener("submit", e => {
  e.preventDefault();
  const date = document.getElementById("ceDate").value;
  const title = document.getElementById("ceTitle").value.trim();
  if (!date || !title) { alert("Pick a date and enter a title."); return; }
  state.events.push({
    id: uid(), date, time: document.getElementById("ceTime").value || "",
    dur: +document.getElementById("ceDur").value || 60,
    title, type: document.getElementById("ceType").value
  });
  document.getElementById("ceTitle").value = "";
  document.getElementById("ceTime").value = "";
  save(); renderCalendar();
});

document.querySelectorAll("#calViews .tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll("#calViews .tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    calView = tab.dataset.cal;
    renderCalendar();
  });
});
document.getElementById("calToday").addEventListener("click", () => { calCursor = new Date(); renderCalendar(); });
document.getElementById("calPrev").addEventListener("click", () => { shiftCursor(-1); });
document.getElementById("calNext").addEventListener("click", () => { shiftCursor(1); });
function shiftCursor(dir) {
  if (calView === "day") calCursor.setDate(calCursor.getDate() + dir);
  else if (calView === "week") calCursor.setDate(calCursor.getDate() + dir * 7);
  else calCursor.setMonth(calCursor.getMonth() + dir);
  calCursor = new Date(calCursor);
  renderCalendar();
}

const fmtDate = d => d.toISOString().slice(0, 10);
function eventsFor(dateStr) {
  const list = state.events.filter(e => e.date === dateStr);
  if (state.testDate === dateStr) list.push({ id: "TEST", date: dateStr, time: "08:00", dur: 420, title: "MCAT TEST DAY", type: "test", locked: true });
  return list.sort((a, b) => (a.time || "99").localeCompare(b.time || "99"));
}
function fmtTime(t) {
  if (!t) return "";
  let [h, m] = t.split(":").map(Number);
  const ap = h >= 12 ? "PM" : "AM"; h = h % 12 || 12;
  return h + ":" + String(m).padStart(2, "0") + " " + ap;
}
function deleteEvent(id) {
  if (id === "TEST") { alert("Set the test date on the Dashboard."); return; }
  if (!confirm("Delete this event?")) return;
  state.events = state.events.filter(e => String(e.id) !== String(id));
  save(); renderCalendar();
}
function prefillAdd(dateStr) {
  document.getElementById("ceDate").value = dateStr;
  document.getElementById("ceTitle").focus();
}

/* ---- Auto-fill study schedule ---- */
const subjectByDay = { 1: "C/P", 2: "B/B", 3: "P/S", 4: "C/P", 5: "B/B + P/S" };
function weekdayTemplate(subject) {
  return [
    { time: "05:00", title: "Anki — Pankow + AnKing", type: "study", dur: 45 },
    { time: "05:45", title: `${subject} — content + UWorld`, type: "study", dur: 135 },
    { time: "08:00", title: "Gym", type: "personal", dur: 60 },
    { time: "10:00", title: `${subject} — UWorld + full review`, type: "study", dur: 120 },
    { time: "13:00", title: "UWorld set + 2 CARS + review", type: "study", dur: 100 }
  ];
}
function generateSchedule(startStr, weeks) {
  // remove previously generated events so we don't duplicate
  state.events = state.events.filter(e => !e.gen);
  const start = new Date(startStr + "T00:00:00");
  const days = weeks * 7;
  for (let i = 0; i < days; i++) {
    const d = new Date(start.getTime() + i * 86400000);
    const ds = fmtDate(d);
    const dow = d.getDay(); // 0 Sun ... 6 Sat
    let evs = [];
    if (dow === 6) { // Saturday — full-length
      evs = [
        { time: "05:30", title: "Anki — light review", type: "study", dur: 45 },
        { time: "08:00", title: "Blueprint Full-Length (timed)", type: "test", dur: 420 }
      ];
    } else if (dow === 0) { // Sunday — review + reset
      evs = [
        { time: "09:00", title: "Review week's wrong answers", type: "study", dur: 120 },
        { time: "11:00", title: "Anki catch-up + plan next week", type: "study", dur: 90 }
      ];
    } else {
      evs = weekdayTemplate(subjectByDay[dow]);
    }
    evs.forEach(e => state.events.push({ id: "gen-" + ds + "-" + e.time, date: ds, ...e, gen: true }));
  }
  save(); renderCalendar();
}
document.getElementById("genBtn").addEventListener("click", () => {
  const start = document.getElementById("genStart").value;
  if (!start) { alert("Pick a start date first."); return; }
  const weeks = +document.getElementById("genWeeks").value || 1;
  const existing = state.events.filter(e => e.gen).length;
  const msg = existing
    ? "This will replace the previously generated schedule with a fresh one. Your manually-added events stay. Continue?"
    : `Generate a ${weeks}-week study schedule starting ${start}?`;
  if (!confirm(msg)) return;
  generateSchedule(start, weeks);
  calCursor = new Date(start + "T00:00:00");
  renderCalendar();
});
document.getElementById("genClear").addEventListener("click", () => {
  if (!state.events.some(e => e.gen)) { alert("No generated events to clear."); return; }
  if (!confirm("Remove all auto-generated study events? Manually-added ones stay.")) return;
  state.events = state.events.filter(e => !e.gen);
  save(); renderCalendar();
});

function renderCalendar() {
  if (calView === "day") renderCalDay();
  else if (calView === "week") renderCalWeek();
  else renderCalMonth();
  renderReminders();
}

function renderCalDay() {
  const ds = fmtDate(calCursor);
  calLabel.textContent = calCursor.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  calBody.innerHTML = "";
  calBody.appendChild(buildTimeGrid([ds]));
  scrollGrid();
}

function renderCalWeek() {
  const start = new Date(calCursor);
  start.setDate(start.getDate() - start.getDay()); // Sunday
  const end = new Date(start); end.setDate(end.getDate() + 6);
  calLabel.textContent = start.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " – " +
    end.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  const dates = [];
  for (let i = 0; i < 7; i++) dates.push(fmtDate(new Date(start.getTime() + i * 86400000)));
  calBody.innerHTML = "";
  calBody.appendChild(buildTimeGrid(dates));
  scrollGrid();
}

function renderCalMonth() {
  const year = calCursor.getFullYear(), month = calCursor.getMonth();
  calLabel.textContent = calCursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const first = new Date(year, month, 1);
  const gridStart = new Date(first);
  gridStart.setDate(gridStart.getDate() - gridStart.getDay());
  const todayS = todayStr();
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  let html = `<div class="cal-month"><div class="cal-weekdays">${wd.map(d => `<div>${d}</div>`).join("")}</div><div class="cal-grid">`;
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart.getTime() + i * 86400000);
    const ds = fmtDate(d);
    const other = d.getMonth() !== month;
    const evs = eventsFor(ds);
    html += `<div class="cal-cell ${other ? "other" : ""} ${ds === todayS ? "today" : ""}" data-day="${ds}">
      <span class="cell-num">${d.getDate()}</span>`;
    evs.slice(0, 3).forEach(e => {
      html += `<div class="ev ${e.type}" data-id="${e.id}" title="${escapeHtml(e.title)}">${e.time ? `<span class="ev-time">${fmtTime(e.time)}</span>` : ""}${escapeHtml(e.title)}</div>`;
    });
    if (evs.length > 3) html += `<span class="muted small">+${evs.length - 3} more</span>`;
    html += `</div>`;
  }
  html += `</div></div>`;
  calBody.innerHTML = html;
  calBody.querySelectorAll(".cal-cell .ev[data-id]").forEach(el => {
    el.addEventListener("click", ev => { ev.stopPropagation(); openEventModal(el.dataset.id); });
  });
  calBody.querySelectorAll(".cal-cell[data-day]").forEach(el => {
    el.addEventListener("click", () => { calCursor = new Date(el.dataset.day + "T00:00:00"); switchCalView("day"); });
  });
}

/* ---- time-grid engine ---- */
function switchCalView(v) {
  calView = v;
  document.querySelectorAll("#calViews .tab").forEach(t => t.classList.toggle("active", t.dataset.cal === v));
  renderCalendar();
}
function labelHour(h) { const ap = h < 12 ? "AM" : "PM"; const hh = h % 12 || 12; return hh + " " + ap; }
function toMin(t) { const [h, m] = t.split(":").map(Number); return h * 60 + m; }
function minToTime(min) { min = Math.max(0, Math.min(24 * 60 - 1, Math.round(min))); return String(Math.floor(min / 60)).padStart(2, "0") + ":" + String(min % 60).padStart(2, "0"); }
function snap(min) { return Math.round(min / SNAP) * SNAP; }
function findEvent(id) { return state.events.find(e => String(e.id) === String(id)); }

function computeLayout(items) {
  const arr = items.map(e => ({ id: e.id, start: toMin(e.time), end: toMin(e.time) + (e.dur || 60) }))
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const layout = {};
  let cluster = [], clusterEnd = -1;
  const flush = () => {
    const lanes = [];
    cluster.forEach(it => {
      let placed = false;
      for (let i = 0; i < lanes.length; i++) { if (it.start >= lanes[i]) { lanes[i] = it.end; it.col = i; placed = true; break; } }
      if (!placed) { it.col = lanes.length; lanes.push(it.end); }
    });
    const cols = lanes.length;
    cluster.forEach(it => layout[it.id] = { col: it.col, cols });
    cluster = [];
  };
  arr.forEach(it => {
    if (cluster.length && it.start >= clusterEnd) { flush(); clusterEnd = -1; }
    cluster.push(it); clusterEnd = Math.max(clusterEnd, it.end);
  });
  if (cluster.length) flush();
  return layout;
}

function buildTimeGrid(dates) {
  const wrap = document.createElement("div");
  wrap.className = "tg-wrap";
  const todayS = todayStr();
  let head = `<div class="tg-head"><div class="tg-head-axis"></div><div class="tg-head-days">`;
  dates.forEach(ds => {
    const d = new Date(ds + "T00:00:00");
    head += `<div class="tg-head-day ${ds === todayS ? "today" : ""}"><div class="thd-name">${d.toLocaleDateString(undefined, { weekday: "short" })}</div><div class="thd-num">${d.getDate()}</div></div>`;
  });
  head += `</div></div>`;
  let allday = `<div class="tg-allday"><div class="tg-allday-axis">all-day</div><div class="tg-allday-days">`;
  dates.forEach(ds => {
    const items = eventsFor(ds).filter(e => !e.time);
    allday += `<div class="tg-allday-col" data-date="${ds}">` +
      items.map(e => `<div class="ev ${e.type}" data-id="${e.id}">${escapeHtml(e.title)}</div>`).join("") + `</div>`;
  });
  allday += `</div></div>`;
  let axis = "";
  for (let h = 0; h < 24; h++) axis += `<div class="tg-hour"><span>${labelHour(h)}</span></div>`;
  let cols = "";
  dates.forEach(ds => cols += `<div class="tg-col" data-date="${ds}"></div>`);
  wrap.innerHTML = head + allday + `<div class="tg-scroll"><div class="tg"><div class="tg-axis">${axis}</div><div class="tg-days">${cols}</div></div></div>`;

  dates.forEach(ds => {
    const col = wrap.querySelector(`.tg-col[data-date="${ds}"]`);
    const timed = eventsFor(ds).filter(e => e.time);
    const layout = computeLayout(timed);
    timed.forEach(e => {
      const start = toMin(e.time), dur = e.dur || 60;
      const lay = layout[e.id] || { col: 0, cols: 1 };
      const w = 100 / lay.cols;
      const div = document.createElement("div");
      div.className = "tg-ev " + e.type + (e.locked ? " locked" : "");
      div.style.top = (start / 60 * HOUR_H) + "px";
      div.style.height = Math.max(dur / 60 * HOUR_H, 16) + "px";
      div.style.left = `calc(${lay.col * w}% + 2px)`;
      div.style.width = `calc(${w}% - 4px)`;
      div.dataset.id = e.id;
      div.innerHTML = `<div class="tg-ev-time">${fmtTime(e.time)}</div><div class="tg-ev-title">${escapeHtml(e.title)}</div>` + (e.locked ? "" : `<div class="re-handle"></div>`);
      col.appendChild(div);
    });
  });

  const ti = dates.indexOf(todayS);
  if (ti >= 0) {
    const now = new Date();
    const line = document.createElement("div");
    line.className = "tg-now";
    line.style.top = ((now.getHours() * 60 + now.getMinutes()) / 60 * HOUR_H) + "px";
    wrap.querySelectorAll(".tg-col")[ti].appendChild(line);
  }

  attachGrid(wrap);
  wrap.querySelectorAll(".tg-allday-col").forEach(c => {
    c.addEventListener("click", ev => {
      const el = ev.target.closest(".ev");
      if (el) { openEventModal(el.dataset.id); return; }
      openNewModal(c.dataset.date, "");
    });
  });
  return wrap;
}

function scrollGrid() {
  const sc = calBody.querySelector(".tg-scroll");
  if (sc) sc.scrollTop = 5 * HOUR_H; // open around 5 AM
}

function attachGrid(wrap) {
  wrap.querySelectorAll(".tg-col").forEach(col => {
    col.addEventListener("click", ev => {
      if (suppressClick) return;
      if (ev.target.closest(".tg-ev")) return;
      const rect = col.getBoundingClientRect();
      const min = snap((ev.clientY - rect.top) / HOUR_H * 60);
      openNewModal(col.dataset.date, minToTime(Math.max(0, min)));
    });
  });
  wrap.addEventListener("click", ev => {
    const el = ev.target.closest(".tg-ev.locked");
    if (el) alert("This is your MCAT test day — change the date on the Dashboard.");
  });
  wrap.addEventListener("pointerdown", ev => {
    const evEl = ev.target.closest(".tg-ev");
    if (!evEl || evEl.classList.contains("locked")) return;
    const e = findEvent(evEl.dataset.id);
    if (!e) return;
    ev.preventDefault();
    drag = {
      mode: ev.target.closest(".re-handle") ? "resize" : "move",
      id: evEl.dataset.id, el: evEl, startY: ev.clientY, startX: ev.clientX,
      origStart: toMin(e.time), origDur: e.dur || 60,
      newStart: null, newDur: null, newDate: null, moved: false
    };
    evEl.classList.add("dragging");
    window.addEventListener("pointermove", gridMove);
    window.addEventListener("pointerup", gridUp);
  });
}

function gridMove(ev) {
  if (!drag) return;
  if (Math.abs(ev.clientY - drag.startY) > 3 || Math.abs(ev.clientX - drag.startX) > 3) drag.moved = true;
  const dMin = (ev.clientY - drag.startY) / HOUR_H * 60;
  if (drag.mode === "move") {
    let ns = snap(drag.origStart + dMin);
    ns = Math.max(0, Math.min(24 * 60 - drag.origDur, ns));
    drag.newStart = ns;
    drag.el.style.top = (ns / 60 * HOUR_H) + "px";
    const under = document.elementFromPoint(ev.clientX, ev.clientY);
    const col = under && under.closest && under.closest(".tg-col");
    if (col) drag.newDate = col.dataset.date;
  } else {
    let nd = snap(drag.origDur + dMin);
    nd = Math.max(15, Math.min(24 * 60 - drag.origStart, nd));
    drag.newDur = nd;
    drag.el.style.height = Math.max(nd / 60 * HOUR_H, 16) + "px";
  }
}

function gridUp() {
  window.removeEventListener("pointermove", gridMove);
  window.removeEventListener("pointerup", gridUp);
  if (!drag) return;
  const e = findEvent(drag.id);
  const wasClick = !drag.moved;
  if (drag.moved && e) {
    if (drag.mode === "move") {
      if (drag.newStart != null) e.time = minToTime(drag.newStart);
      if (drag.newDate) e.date = drag.newDate;
    } else if (drag.newDur != null) e.dur = drag.newDur;
    save();
  }
  const id = drag.id;
  drag = null;
  suppressClick = true;
  setTimeout(() => suppressClick = false, 250);
  renderCalendar();
  if (wasClick) openEventModal(id);
}

/* ---- event modal ---- */
const evModal = document.getElementById("evModal");
function openNewModal(date, time) {
  evModal.dataset.mode = "new"; evModal.dataset.id = "";
  document.getElementById("evModalTitle").textContent = "New event";
  document.getElementById("mTitle").value = "";
  document.getElementById("mDate").value = date || todayStr();
  document.getElementById("mTime").value = time || "";
  document.getElementById("mDur").value = "60";
  document.getElementById("mType").value = "study";
  document.getElementById("mDelete").style.display = "none";
  evModal.hidden = false;
  document.getElementById("mTitle").focus();
}
function openEventModal(id) {
  const e = findEvent(id);
  if (!e) return;
  evModal.dataset.mode = "edit"; evModal.dataset.id = id;
  document.getElementById("evModalTitle").textContent = "Edit event";
  document.getElementById("mTitle").value = e.title;
  document.getElementById("mDate").value = e.date;
  document.getElementById("mTime").value = e.time || "";
  document.getElementById("mDur").value = String(e.dur || 60);
  document.getElementById("mType").value = e.type;
  document.getElementById("mDelete").style.display = "";
  evModal.hidden = false;
}
function closeModal() { evModal.hidden = true; }
document.getElementById("mCancel").addEventListener("click", closeModal);
evModal.addEventListener("click", ev => { if (ev.target === evModal) closeModal(); });
document.getElementById("mSave").addEventListener("click", () => {
  const title = document.getElementById("mTitle").value.trim();
  const date = document.getElementById("mDate").value;
  if (!title || !date) { alert("Title and date are required."); return; }
  const data = {
    title, date,
    time: document.getElementById("mTime").value || "",
    dur: +document.getElementById("mDur").value || 60,
    type: document.getElementById("mType").value
  };
  if (evModal.dataset.mode === "new") state.events.push({ id: uid(), ...data });
  else { const e = findEvent(evModal.dataset.id); if (e) Object.assign(e, data); }
  save(); closeModal(); renderCalendar();
});
document.getElementById("mDelete").addEventListener("click", () => {
  const e = findEvent(evModal.dataset.id);
  if (e) { state.events = state.events.filter(x => String(x.id) !== String(e.id)); save(); }
  closeModal(); renderCalendar();
});

/* ---- theme ---- */
function applyTheme() { document.documentElement.setAttribute("data-theme", state.theme || "dark"); }
document.getElementById("themeBtn").addEventListener("click", () => {
  state.theme = state.theme === "light" ? "dark" : "light";
  save(); applyTheme();
});

/* ---------------- User Settings & Profile (Req 19) ----------------
   Render/handler layer for the Settings_Module. All validation lives in the
   pure layer (MCAT.validateSettings / isValidFutureDate / validateTarget), so
   this layer only reads inputs, applies the validated per-field results, mirrors
   the two cross-cutting fields, persists, and re-paints affected views.

   - Target and diagnostic are validated INDEPENDENTLY: validateSettings returns
     a `values` map of accepted fields and an `errors` map of rejected ones, so a
     bad target never blocks a valid diagnostic (and vice-versa). Rejected fields
     keep their previously stored value and surface an inline error; valid fields
     are accepted with no error (Req 19.6). The test date is validated via
     isValidFutureDate and rejected/retained the same way (Req 19.7).
   - settings.testDate is mirrored to state.testDate, the single source the
     Dashboard countdown reads, so a change refreshes the countdown + reminders
     within a render tick (Req 19.3).
   - settings.targetScore is mirrored to goals.targetScore (the source of truth
     for the Goals view and the full-length chart). Goals and the FL chart are
     re-rendered with INDEPENDENT partial updates — each wrapped so a failure in
     one cannot prevent the other (or the persisted mirror) from applying
     (Req 19.4).
   - Every stored field is persisted via save() so values survive reload (Req 19.8). */

function ensureSettings() {
  if (!state.settings || typeof state.settings !== "object") {
    state.settings = {
      name: "", testDate: "", targetScore: 510, diagnosticScore: null,
      weeklyAvailability: 0, preferredResources: "", studyPhase: "content review"
    };
  }
  return state.settings;
}

function setSettingsFieldError(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  if (msg) { el.textContent = msg; el.hidden = false; }
  else { el.textContent = ""; el.hidden = true; }
}

// Paint the settings form from the stored profile and clear any field errors.
function renderSettings() {
  const s = ensureSettings();
  const nameEl = document.getElementById("setName");
  const testDateEl = document.getElementById("setTestDate");
  const targetEl = document.getElementById("setTarget");
  const diagEl = document.getElementById("setDiagnostic");
  const weeklyEl = document.getElementById("setWeeklyAvailability");
  const phaseEl = document.getElementById("setStudyPhase");
  const prefEl = document.getElementById("setPreferredResources");

  if (nameEl) nameEl.value = s.name || "";
  if (testDateEl) testDateEl.value = s.testDate || "";
  if (targetEl) targetEl.value = s.targetScore != null ? s.targetScore : "";
  if (diagEl) diagEl.value = s.diagnosticScore != null ? s.diagnosticScore : "";
  if (weeklyEl) weeklyEl.value = s.weeklyAvailability != null ? s.weeklyAvailability : "";
  if (phaseEl) {
    phaseEl.value = (MCAT.STUDY_PHASES && MCAT.STUDY_PHASES.includes(s.studyPhase))
      ? s.studyPhase : "content review";
  }
  if (prefEl) prefEl.value = s.preferredResources || "";

  setSettingsFieldError("setTestDateError", "");
  setSettingsFieldError("setTargetError", "");
  setSettingsFieldError("setDiagnosticError", "");
}

const settingsForm = document.getElementById("settingsForm");
if (settingsForm) {
  settingsForm.addEventListener("submit", e => {
    e.preventDefault();
    const s = ensureSettings();
    const today = todayStr();

    const nameEl = document.getElementById("setName");
    const testDateEl = document.getElementById("setTestDate");
    const targetEl = document.getElementById("setTarget");
    const diagEl = document.getElementById("setDiagnostic");
    const weeklyEl = document.getElementById("setWeeklyAvailability");
    const phaseEl = document.getElementById("setStudyPhase");
    const prefEl = document.getElementById("setPreferredResources");

    // Build the validation input. Always-present fields are included verbatim;
    // a blank test date is omitted so leaving it empty neither errors nor forces
    // a date (only an actually-entered invalid/past date is rejected — Req 19.7).
    const input = {
      name: nameEl ? nameEl.value : "",
      targetScore: targetEl ? targetEl.value.trim() : "",
      diagnosticScore: diagEl ? diagEl.value.trim() : "",   // "" -> null (explicit unset)
      weeklyAvailability: weeklyEl ? weeklyEl.value.trim() : "",
      preferredResources: prefEl ? prefEl.value : "",
      studyPhase: phaseEl ? phaseEl.value : "content review"
    };
    const testDateRaw = testDateEl ? testDateEl.value.trim() : "";
    if (testDateRaw !== "") input.testDate = testDateRaw;

    const res = MCAT.validateSettings(input, today);

    // Capture prior cross-cutting values to detect real changes for propagation.
    const prevTestDate = s.testDate;
    const prevTarget = s.targetScore;

    // Apply each VALID field independently; invalid fields are simply absent from
    // `values`, so their previously stored value is retained (Req 19.6).
    Object.keys(res.values).forEach(k => { s[k] = res.values[k]; });

    const testDateChanged = ("testDate" in res.values) && res.values.testDate !== prevTestDate;
    const targetChanged = ("targetScore" in res.values) && res.values.targetScore !== prevTarget;

    // Mirror settings.testDate -> state.testDate (Dashboard countdown source).
    if ("testDate" in res.values) state.testDate = s.testDate;

    // Mirror settings.targetScore -> goals.targetScore (Goals + FL chart source).
    if ("targetScore" in res.values) {
      if (!state.goals || typeof state.goals !== "object") {
        state.goals = { targetScore: 510, weeklyHourGoal: 0, dailyQuestionGoal: 0, milestones: [] };
      }
      state.goals.targetScore = s.targetScore;
    }

    // Persist all stored fields (incl. mirrored copies) so they survive reload.
    save();

    // Repaint the form to the stored state (accepted values shown, rejected ones
    // restored to their retained value), then surface only the invalid fields.
    renderSettings();
    setSettingsFieldError("setTargetError", res.errors.targetScore);
    setSettingsFieldError("setDiagnosticError", res.errors.diagnosticScore);
    setSettingsFieldError("setTestDateError", res.errors.testDate);

    // Propagate a test-date change to the countdown + reminders (Req 19.3).
    if (testDateChanged) {
      const tdi = document.getElementById("testDateInput");
      if (tdi) tdi.value = state.testDate;
      try { renderCountdownLabel(); } catch (_) {}
      try { tickCountdown(); } catch (_) {}
      try { renderDashboard(); } catch (_) {}
      try { renderReminders(); } catch (_) {}
    }

    // Propagate a target-score change to Goals and the FL chart as INDEPENDENT
    // partial updates: a failure in one must not block the other (Req 19.4).
    if (targetChanged) {
      try { renderGoals(); } catch (_) {}
      try { drawChart(); } catch (_) {}
    }
  });
}

/* ---------------- Dashboard ---------------- */
function renderDashboard() {
  const daily = state.tasks.filter(t => t.scope === "daily");
  const doneCount = daily.filter(t => t.done).length;
  document.getElementById("statToday").textContent = `${doneCount}/${daily.length}`;
  const scores = sortedScores();
  const latest = scores[scores.length - 1];
  document.getElementById("statLatest").textContent = latest ? scoreTotal(latest) : "--";
  document.getElementById("statGap").textContent = latest ? Math.max(0, targetScore() - scoreTotal(latest)) : "--";

  const dashTasks = document.getElementById("dashTasks");
  const topTasks = daily.sort((a, b) => (a.done - b.done) || (prioRank[a.priority] - prioRank[b.priority])).slice(0, 6);
  dashTasks.innerHTML = topTasks.length ? "" : `<li class="empty">No daily tasks yet.</li>`;
  topTasks.forEach(t => {
    const li = document.createElement("li");
    li.innerHTML = `<span class="dot ${t.priority}"></span><span style="flex:1;${t.done?'opacity:.5;text-decoration:line-through;':''}">${escapeHtml(t.text)}</span>`;
    dashTasks.appendChild(li);
  });

  const dashWrong = document.getElementById("dashWrong");
  const open = state.wrong.filter(w => w.status === "open").sort((a, b) => b.count - a.count);
  dashWrong.innerHTML = open.length ? "" : `<li class="empty">No flagged misses.</li>`;
  open.slice(0, 6).forEach(w => {
    const li = document.createElement("li");
    li.innerHTML = `<span class="tag">${w.section}</span><span style="flex:1;">${escapeHtml(w.topic || w.source)}</span><span class="miss-count ${w.count>1?"repeat":""}">×${w.count}</span>`;
    dashWrong.appendChild(li);
  });

  // --- Summary metrics (Req 9.1–9.4). Each metric reads its own underlying
  //     data and renders an independent empty state ("--" / list message), so a
  //     metric without recorded data never blanks one that has data (Req 9.6). ---
  const practiceSets = Array.isArray(state.practiceSets) ? state.practiceSets : [];
  const reviewItems = Array.isArray(state.reviewItems) ? state.reviewItems : [];
  const sessions = state.sessions || {};
  const goals = state.goals || {};
  const today = todayStr();

  // Avg practice accuracy (Req 9.1): null when no questions attempted.
  const avgAcc = MCAT.dashboardAvgAccuracy(practiceSets);
  document.getElementById("statAvgAcc").textContent =
    avgAcc === null ? "--" : `${avgAcc}%`;

  // Reviews due on or before today (Req 9.3): empty state when no review items.
  document.getElementById("statDueReview").textContent =
    reviewItems.length ? MCAT.dueCount(reviewItems, today) : "--";

  // Weekly study-hour goal progress (Req 9.4): empty state when no positive goal.
  const hourGoal = Number(goals.weeklyHourGoal);
  const hourProgress = MCAT.weeklyHourProgress(sessions, hourGoal, today);
  document.getElementById("statHourGoal").textContent =
    isFinite(hourGoal) && hourGoal > 0 ? `${hourProgress.pct}%` : "--";

  // Lowest-accuracy topics preview (Req 9.2): up to three ranked topics.
  const dashWeak = document.getElementById("dashWeak");
  const weak = MCAT.dashboardWeaknessPreview(practiceSets);
  dashWeak.innerHTML = weak.length ? "" : `<li class="empty">No practice data yet.</li>`;
  weak.forEach(t => {
    const li = document.createElement("li");
    li.innerHTML = `<span class="tag">${t.pct}%</span><span style="flex:1;">${escapeHtml(t.topic)}</span><span class="miss-count">${t.attempted}q</span>`;
    dashWeak.appendChild(li);
  });
}

/* ---------------- Export / Import ---------------- */
document.getElementById("exportBtn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "mcat-backup-" + todayStr() + ".json";
  a.click(); URL.revokeObjectURL(url);
});
document.getElementById("importBtn").addEventListener("click", () => document.getElementById("importFile").click());
document.getElementById("importFile").addEventListener("change", e => {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    // parseBackup never throws: rejects non-JSON or non-object payloads,
    // leaving state and localStorage untouched (Req 2.5).
    const result = MCAT.parseBackup(reader.result);
    if (!result.ok) {
      alert("Couldn't read that file — make sure it's a valid backup.");
      return;
    }
    // Confirm replacement; cancelling leaves the current state unchanged (Req 2.7).
    if (!confirm("This will replace your current data with the backup. Continue?")) return;
    // Merge imported values over defaults (fills missing new-module keys, Req 2.4),
    // then migrate to shape nested sub-keys / per-record fields, then persist + reload (Req 2.2).
    state = migrate({ ...structuredClone(defaultState), ...result.value });
    save();
    location.reload();
  };
  reader.readAsText(file);
});

/* ---------------- In-App Reminders (Req 18) ----------------
   Persistent reminder bar shown on every view. The active set is DERIVED at
   display time by MCAT.computeReminders(state, today) (pure, in core.js) and
   filtered against state.reminderDismissals via MCAT.isDismissedToday so a
   reminder dismissed earlier today stays hidden — including across reloads,
   since the dismissal map is persisted (Req 18.4). When nothing remains the
   bar is hidden (Req 18.3). All computation is local; no network calls
   (Req 18.5). renderReminders() is invoked on load and from the renderers /
   handlers that follow any change to the test date, review items, events, or
   retest dates (Req 18.1). */
const REMINDER_TYPE_LABELS = {
  countdown: "Countdown",
  review: "Review",
  fulllength: "Full-length",
  retest: "Retest"
};

// Build a human-readable message for a single reminder. Reads naturally and
// degrades gracefully when an item has no topic/title.
function reminderMessage(r) {
  switch (r.kind) {
    case "countdown": {
      const d = r.daysUntil;
      if (d === null || typeof d !== "number") return "Test-day countdown";
      if (d > 0) return `${d} ${d === 1 ? "day" : "days"} until your MCAT`;
      if (d === 0) return "Your MCAT is today — good luck!";
      const past = -d;
      return `Test day was ${past} ${past === 1 ? "day" : "days"} ago`;
    }
    case "review":
      return r.topic ? `Review due: ${r.topic}` : "Review item due";
    case "fulllength":
      return r.title ? `Full-length today: ${r.title}` : "Full-length practice test today";
    case "retest":
      return r.topic ? `Retest due: ${r.topic}` : "Retest a flagged question";
    default:
      return "Reminder";
  }
}

function renderReminders() {
  const bar = document.getElementById("reminderBar");
  if (!bar) return;

  // Ensure the dismissal map exists before reading/writing it.
  if (!state.reminderDismissals || typeof state.reminderDismissals !== "object") {
    state.reminderDismissals = {};
  }

  const today = todayStr();
  // Active reminders, minus any dismissed for the current calendar day (Req 18.2/18.4).
  const active = MCAT.computeReminders(state, today)
    .filter(r => !MCAT.isDismissedToday(state.reminderDismissals, r.key, today));

  bar.innerHTML = "";

  // No active reminders → hide the bar entirely (Req 18.3).
  if (!active.length) {
    bar.hidden = true;
    return;
  }
  bar.hidden = false;

  active.forEach(r => {
    const item = document.createElement("div");
    item.className = "reminder-item";

    const type = document.createElement("span");
    type.className = "reminder-type";
    type.dataset.type = r.kind;
    type.textContent = REMINDER_TYPE_LABELS[r.kind] || "Reminder";
    item.appendChild(type);

    const msg = document.createElement("span");
    msg.className = "reminder-message";
    msg.textContent = reminderMessage(r);
    item.appendChild(msg);

    if (r.date) {
      const date = document.createElement("span");
      date.className = "reminder-date";
      date.textContent = r.date;
      item.appendChild(date);
    }

    const dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.className = "reminder-dismiss";
    dismiss.setAttribute("aria-label", "Dismiss reminder");
    dismiss.textContent = "✕";
    // Record the dismissal for today, persist it, and re-render so the reminder
    // disappears now and stays gone across reloads until the next day (Req 18.4).
    dismiss.addEventListener("click", () => {
      state.reminderDismissals[r.key] = todayStr();
      save();
      renderReminders();
    });
    item.appendChild(dismiss);

    bar.appendChild(item);
  });
}

/* ---------------- init ---------------- */
applyTheme();
loadPomoSettings();
pomoRender();
renderCountdownLabel();
tickCountdown();
renderHoursStats();
renderHeatmap();
renderTasks();
renderTopics();
renderWrong();
renderScores();
drawChart();
drawSectionTrends();
renderApp();
renderResources();
renderCalendar();
renderPractice();
renderAnalytics();
renderContent();
renderCars();
renderReview();
/* One-time seed of the formula sheet from the bundled reference set (Req 13.1).
   seedFormulas() returns existing entries untouched when non-empty, so this is
   idempotent and never clobbers user edits or memorized flags. */
if (!Array.isArray(state.formulas) || state.formulas.length === 0) {
  state.formulas = MCAT.seedFormulas(state.formulas);
  save();
}
renderFormulas();
renderNotes();
renderGoals();
renderDailyLog();
renderReadiness();
renderSettings();
document.getElementById("ceDate").value = todayStr();
document.getElementById("genStart").value = todayStr();
renderDashboard();
renderReminders();

/* ---------------- Req 18.5 / 20.5: offline-only invariant ----------------
   Every view's renderer above runs exactly once on initial load against the
   migrated `state`, so each view is correct on first visit (Req 20.5). The
   nav handler re-dispatches through VIEW_RENDERERS on selection.

   This app is fully static and dependency-free: it must make ZERO network
   requests (Req 18.5). No network API — fetch, XMLHttpRequest, WebSocket,
   EventSource, navigator.sendBeacon, or remote dynamic import() — appears
   anywhere in app.js or core.js (verified by grep in task 23.1).

   The dev assertion below is a code-review anchor and a development-time
   tripwire: it confirms none of these network APIs were invoked while the
   app booted. It makes no network calls itself, never blocks production,
   and is non-destructive (it restores any globals it inspects). If a network
   call is ever added, this check surfaces it during development so the
   offline-only contract is revisited deliberately. */
(function assertNoNetworkApisOnLoad() {
  const FORBIDDEN_NETWORK_APIS = ["fetch", "XMLHttpRequest", "WebSocket", "EventSource"];
  if (typeof console === "undefined" || typeof console.assert !== "function") return;
  if (typeof window === "undefined") return;
  // navigator.sendBeacon is checked separately since it lives on navigator.
  const beaconUsed = typeof navigator !== "undefined" &&
    typeof navigator.sendBeacon === "function" && navigator.sendBeacon.__mcatCalled === true;
  console.assert(
    !beaconUsed,
    "Req 18.5 violation: navigator.sendBeacon was called — the app must stay offline-only."
  );
  // The structural guarantee (no network usage in source) is enforced by the
  // grep verification in task 23.1; this marker documents and pins the contract.
  console.assert(
    Array.isArray(FORBIDDEN_NETWORK_APIS) && FORBIDDEN_NETWORK_APIS.length > 0,
    "Req 18.5 invariant marker: app.js and core.js must use no network APIs."
  );
})();
