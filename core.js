/* ============================================================
   MCAT Command Center — core.js (pure layer)
   ------------------------------------------------------------
   DOM-free, dependency-free logic shared between the browser app
   (loaded via <script src="core.js"> BEFORE app.js) and the
   dev-only Node test harness (loaded via require("../core.js")).

   Everything testable hangs off the MCAT namespace object. In the
   browser, top-level `const` declarations in a classic script share
   one global lexical scope, so identifiers declared here (uid,
   todayStr, escapeHtml, STORE_KEY, ...) remain usable as globals in
   app.js. Under Node, the bottom-of-file shim exports MCAT instead.
   ============================================================ */

const MCAT = {};

/* ---- shared constants ---- */
const STORE_KEY = "mcat_command_center_v2";
const REVIEW_INTERVALS = [1, 3, 7, 21]; // spaced-repetition intervals, in days

MCAT.STORE_KEY = STORE_KEY;
MCAT.REVIEW_INTERVALS = REVIEW_INTERVALS;

/* ---- shared helpers ---- */
const uid = () => Date.now() + Math.floor(Math.random() * 1000);
const todayStr = () => new Date().toISOString().slice(0, 10);
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

MCAT.uid = uid;
MCAT.todayStr = todayStr;
MCAT.escapeHtml = escapeHtml;

/* ---- default application state ----
   The single source of truth for the shape of `state`. Lives in the pure
   layer so migrate()/load() (and the Node tests) can reference it. In the
   browser this top-level `const` is a shared global, so app.js's load()/
   save() keep referencing the same `defaultState` they always have.

   schemaVersion 2 adds the expansion modules. No existing key was removed
   or renamed; new keys carry the documented defaults from the design's
   "Extended defaultState" / Data Models sections. */
const defaultState = {
  // ---- existing keys (unchanged) ----
  testDate: "",
  target: 510,
  tasks: [],
  topics: [],
  scores: [{ id: 1, date: "", name: "BP FL1", cp: 119, cars: 124, bb: 124, ps: 124 }],
  appItems: [],
  wrong: [],                 // {id, date, source, topic, section, why, count, status}
  events: [],                // {id, date, time, title, type}
  sessions: {},              // { "YYYY-MM-DD": minutes }
  pomo: { work: 40, break: 10, long: 20, rounds: 4 },
  theme: "dark",
  seeded: false,
  lastDailyReset: "",
  lastWeeklyReset: "",
  lastMonthlyReset: "",

  // ---- NEW keys (expansion) ----
  schemaVersion: 2,                 // bumped from implicit v1; migrate() reads/sets this
  practiceSets: [],                 // PracticeSet[]
  contentStatuses: {},              // { "section::label": status }  (absence = "not started")
  customContentTopics: [],          // [{ section, label }]
  carsPassages: [],                 // CarsPassageEntry[]
  reviewItems: [],                  // ReviewItem[]
  resourceTracker: [],              // ResourceEntry[]
  formulas: [],                     // FormulaEntry[] (seeded once from blueprint §11)
  notes: [],                        // NoteEntry[]
  goals: {                          // Goals_Module
    targetScore: 510,               // mirrors legacy `target` on migration; source of truth going forward
    weeklyHourGoal: 0,
    dailyQuestionGoal: 0,
    milestones: []                  // [{ id, text, done }]
  },
  dailyLog: [],                     // DailyLogEntry[] (one per date)
  readiness: {                      // Readiness_Checklist
    predefined: [                   // fixed 10 items, default checked:false
      { key: "testLocationConfirmed", label: "test location confirmed", checked: false },
      { key: "validIdReady", label: "valid ID ready", checked: false },
      { key: "aamcLoginReady", label: "AAMC login ready", checked: false },
      { key: "snacksPacked", label: "snacks packed", checked: false },
      { key: "breakPlanMade", label: "break plan made", checked: false },
      { key: "sleepScheduleAdjusted", label: "sleep schedule adjusted", checked: false },
      { key: "lastFullLengthCompleted", label: "last full-length completed", checked: false },
      { key: "formulasReviewed", label: "formulas reviewed", checked: false },
      { key: "weakTopicsReviewed", label: "weak topics reviewed", checked: false },
      { key: "noHeavyStudyingDayBefore", label: "no heavy studying day before", checked: false }
    ],
    custom: []                      // [{ id, label, checked }] up to 50
  },
  reminderDismissals: {},           // { reminderKey: "YYYY-MM-DD" }
  settings: {                       // Settings_Module / profile
    name: "",
    testDate: "",
    targetScore: 510,
    diagnosticScore: null,
    weeklyAvailability: 0,
    preferredResources: "",
    studyPhase: "content review"
  }
};

MCAT.defaultState = defaultState;

/* ============================================================
   Migration (Req 1, 6.3, 7.5)
   ------------------------------------------------------------
   Pure, DOM-free, localStorage-free. migrate() upgrades an older
   saved state to the current schema by ADDING missing keys/sub-keys
   and per-record fields with their documented defaults, while never
   overwriting any value that is already present. It is idempotent:
   migrate(migrate(s)) deep-equals migrate(s).
   ============================================================ */

/* Plain-object test: a non-null, non-array object (rejects arrays and
   class instances like Date so we only recurse into config-style maps). */
function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/* Deep-clone helper for default values copied into a target. Uses
   structuredClone (Node >=17, all modern browsers) so nested object/array
   defaults are never shared by reference with `defaultState`. */
function cloneDefault(v) {
  return v !== null && typeof v === "object" ? structuredClone(v) : v;
}

/* applyDefaults(target, defaults):
   - adds keys present in `defaults` but absent in `target`,
   - existing values ALWAYS win (never overwritten),
   - recurses into plain-object sub-keys,
   - is idempotent,
   - returns `target`.
   Non-object targets/defaults are returned unchanged (defensive). */
function applyDefaults(target, defaults) {
  if (!isPlainObject(target) || !isPlainObject(defaults)) return target;
  for (const key of Object.keys(defaults)) {
    const dv = defaults[key];
    if (!(key in target)) {
      target[key] = cloneDefault(dv);
    } else if (isPlainObject(target[key]) && isPlainObject(dv)) {
      applyDefaults(target[key], dv);
    }
    // else: key already present (and not a plain-object pair) -> existing wins.
  }
  return target;
}

/* mergeReadiness(stateReadiness, defaultReadiness):
   - keeps existing checked states for predefined items (match by `key`),
   - adds any missing predefined items from the defaults,
   - preserves existing custom items,
   - tolerates a missing/empty/invalid stateReadiness,
   - returns the merged readiness object. */
function mergeReadiness(stateReadiness, defaultReadiness) {
  const base = isPlainObject(stateReadiness) ? stateReadiness : {};
  const existingPredefined = Array.isArray(base.predefined) ? base.predefined : [];

  // Index existing predefined items by their stable `key`.
  const existingByKey = {};
  for (const item of existingPredefined) {
    if (isPlainObject(item) && item.key != null) existingByKey[item.key] = item;
  }

  // For each default predefined item, keep the existing one (preserving its
  // checked state) or add a fresh clone of the default.
  const defaultKeys = new Set(defaultReadiness.predefined.map(d => d.key));
  const merged = defaultReadiness.predefined.map(def =>
    Object.prototype.hasOwnProperty.call(existingByKey, def.key)
      ? existingByKey[def.key]
      : cloneDefault(def)
  );

  // Preserve any existing predefined items that aren't part of the defaults
  // so no user data is lost.
  const extras = existingPredefined.filter(
    item => isPlainObject(item) && !defaultKeys.has(item.key)
  );

  base.predefined = [...merged, ...extras];
  base.custom = Array.isArray(base.custom) ? base.custom : cloneDefault(defaultReadiness.custom);
  return base;
}

/* migrate(state): upgrade a loaded state in place. See module header. */
function migrate(state) {
  // 1. Top-level: add any missing key from defaultState with a deep clone.
  for (const k of Object.keys(defaultState)) {
    if (!(k in state)) state[k] = cloneDefault(defaultState[k]);
  }

  // 2. Nested objects: deep-merge missing sub-keys without touching present ones.
  state.goals = applyDefaults(state.goals, defaultState.goals);
  state.settings = applyDefaults(state.settings, defaultState.settings);
  state.readiness = mergeReadiness(state.readiness, defaultState.readiness);

  // 3. Per-record back-fill on existing arrays (existing values preserved).
  if (Array.isArray(state.wrong)) {
    state.wrong.forEach(w => applyDefaults(w, {
      category: "unset",
      explanation: "",
      takeaway: "",
      needsReview: false,
      retestDate: ""
    }));
  }
  if (Array.isArray(state.scores)) {
    state.scores.forEach(s => applyDefaults(s, {
      percentiles: { cp: null, cars: null, bb: null, ps: null, total: null },
      timeTaken: null,
      conditions: { timed: false, singleSitting: false, withBreaks: false, realConditions: false },
      reviewStatus: "not reviewed",
      lessons: ""
    }));
  }

  // 4. Legacy bridge: copy legacy `target` into goals.targetScore when unset.
  if (state.goals.targetScore == null) state.goals.targetScore = state.target ?? 510;

  // 5. Stamp the current schema version.
  state.schemaVersion = defaultState.schemaVersion;
  return state;
}

MCAT.applyDefaults = applyDefaults;
MCAT.mergeReadiness = mergeReadiness;
MCAT.migrate = migrate;

/* ============================================================
   Backup parsing (Req 2.5)
   ------------------------------------------------------------
   parseBackup(text): pure, never-throwing guard for the import flow.
   Returns { ok:true, value } ONLY when `text` is valid JSON that parses
   to a plain object (non-null, non-array). Anything else — invalid JSON,
   or JSON that parses to an array / null / number / string / boolean —
   yields { ok:false, reason } so the caller can reject the import and
   leave the current state untouched. Must never throw.
   ============================================================ */
function parseBackup(text) {
  if (typeof text !== "string") {
    return { ok: false, reason: "Backup contents are not text." };
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { ok: false, reason: "File is not valid JSON." };
  }
  if (!isPlainObject(parsed)) {
    return { ok: false, reason: "Backup must be a JSON object." };
  }
  return { ok: true, value: parsed };
}

MCAT.parseBackup = parseBackup;

/* ============================================================
   Core accuracy helpers (Req 3.3, 4.1–4.6)
   ------------------------------------------------------------
   Pure, DOM-free, localStorage-free aggregations over arrays of
   practice-set-like records ({ date, section, topic, timing,
   correct, attempted }). These power the Practice Question Tracker
   list (percent correct) and its four accuracy graphs (over-time,
   by-topic, by-section, timed-vs-untimed), and are reused by the
   Analytics/Dashboard whole-number aggregations.
   ============================================================ */

/* roundTo(value, dp): round a finite number to `dp` decimal places,
   half-up. A small epsilon nudge keeps values like 1.005 from falling
   to 1.00 due to binary floating-point representation. Non-finite
   inputs are returned unchanged. Reusable across the pure layer. */
function roundTo(value, dp) {
  if (typeof value !== "number" || !isFinite(value)) return value;
  const places = Number.isFinite(dp) ? dp : 0;
  const factor = Math.pow(10, places);
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/* clamp a number into the inclusive [0, 100] accuracy range. */
function clampPct(n) {
  if (!isFinite(n)) return n;
  return n < 0 ? 0 : n > 100 ? 100 : n;
}

/* Sum of `attempted` across records, counting only finite, positive
   values. Used to decide whether a group has data (Σattempted>0). */
function sumAttempted(sets) {
  let total = 0;
  if (Array.isArray(sets)) {
    for (const s of sets) {
      if (!isPlainObject(s)) continue;
      const a = Number(s.attempted);
      if (isFinite(a) && a > 0) total += a;
    }
  }
  return total;
}

/* Sum of `correct` across records, counting only finite, non-negative
   values. */
function sumCorrect(sets) {
  let total = 0;
  if (Array.isArray(sets)) {
    for (const s of sets) {
      if (!isPlainObject(s)) continue;
      const c = Number(s.correct);
      if (isFinite(c) && c > 0) total += c;
    }
  }
  return total;
}

/* Group records by a field, preserving first-seen key order so the
   output is deterministic regardless of engine. Returns
   [{ key, members:[...] }]. */
function groupSetsBy(sets, keyName) {
  const order = [];
  const groups = new Map();
  if (Array.isArray(sets)) {
    for (const s of sets) {
      if (!isPlainObject(s)) continue;
      const key = s[keyName];
      if (!groups.has(key)) {
        groups.set(key, []);
        order.push(key);
      }
      groups.get(key).push(s);
    }
  }
  return order.map(key => ({ key, members: groups.get(key) }));
}

/* percentCorrect(correct, attempted) -> integer 0..100.
   Per-set percent correct: correct / attempted * 100, round-half-up to
   a whole number. attempted>0 is guaranteed by validation upstream;
   we still guard divide-by-zero by returning 0 when attempted<=0. */
function percentCorrect(correct, attempted) {
  const a = Number(attempted);
  const c = Number(correct);
  if (!isFinite(a) || a <= 0) return 0;
  return clampPct(Math.round(((isFinite(c) ? c : 0) / a) * 100));
}

/* computeGroupAccuracy(sets, opts) -> number in [0,100] | null.
   Aggregate accuracy for a group: Σcorrect / Σattempted * 100. Returns
   null when Σattempted===0 (no division performed; the caller omits the
   group). Precision is configurable via `opts`: pass a number or
   { dp } to control decimal places — default 1 dp (graphs); pass 0 for
   whole-number rounding (analytics/dashboard). */
function computeGroupAccuracy(sets, opts) {
  let dp = 1;
  if (typeof opts === "number") dp = opts;
  else if (isPlainObject(opts) && typeof opts.dp === "number") dp = opts.dp;

  const attempted = sumAttempted(sets);
  if (attempted === 0) return null;
  const correct = sumCorrect(sets);
  return clampPct(roundTo((correct / attempted) * 100, dp));
}

/* accuracyByTopic(sets) -> [{ topic, pct, attempted }].
   One entry per distinct topic with a positive attempted sum, in
   first-seen order; topics with zero attempted are omitted. pct uses
   the shared 1-dp group aggregation. */
function accuracyByTopic(sets) {
  const out = [];
  for (const g of groupSetsBy(sets, "topic")) {
    const attempted = sumAttempted(g.members);
    if (attempted <= 0) continue;
    out.push({ topic: g.key, pct: computeGroupAccuracy(g.members), attempted });
  }
  return out;
}

/* accuracyBySection(sets) -> [{ section, pct, attempted }].
   One entry per distinct section with a positive attempted sum, in
   first-seen order; sections with zero attempted are omitted. */
function accuracyBySection(sets) {
  const out = [];
  for (const g of groupSetsBy(sets, "section")) {
    const attempted = sumAttempted(g.members);
    if (attempted <= 0) continue;
    out.push({ section: g.key, pct: computeGroupAccuracy(g.members), attempted });
  }
  return out;
}

/* timedVsUntimed(sets) -> { timed: pct|null, untimed: pct|null }.
   Two separate 1-dp group aggregations; each side is null when that
   group has zero attempted (which also covers no members). */
function timedVsUntimed(sets) {
  const arr = Array.isArray(sets) ? sets : [];
  const timed = arr.filter(s => isPlainObject(s) && s.timing === "timed");
  const untimed = arr.filter(s => isPlainObject(s) && s.timing === "untimed");
  return {
    timed: computeGroupAccuracy(timed),
    untimed: computeGroupAccuracy(untimed)
  };
}

/* accuracyOverTime(sets) -> [{ date, pct }].
   One point per set, sorted ascending by date string. pct is the
   per-set integer percent correct. The sort is stable: records with
   equal dates keep their original input order (decorate with the
   original index and break ties on it). */
function accuracyOverTime(sets) {
  const arr = Array.isArray(sets) ? sets.filter(isPlainObject) : [];
  return arr
    .map((s, i) => ({ s, i }))
    .sort((a, b) => {
      const da = String(a.s.date == null ? "" : a.s.date);
      const db = String(b.s.date == null ? "" : b.s.date);
      if (da < db) return -1;
      if (da > db) return 1;
      return a.i - b.i; // stable ordering for equal dates
    })
    .map(({ s }) => ({ date: s.date, pct: percentCorrect(s.correct, s.attempted) }));
}

MCAT.roundTo = roundTo;
MCAT.percentCorrect = percentCorrect;
MCAT.computeGroupAccuracy = computeGroupAccuracy;
MCAT.accuracyByTopic = accuracyByTopic;
MCAT.accuracyBySection = accuracyBySection;
MCAT.timedVsUntimed = timedVsUntimed;
MCAT.accuracyOverTime = accuracyOverTime;

/* ============================================================
   XSS-safe Markdown (Req 14.2, 14.6, 14.8)
   ------------------------------------------------------------
   renderMarkdown(body) is a small, hand-rolled (no library) renderer
   for a Markdown subset. It is XSS-safe by construction:

     1. ESCAPE FIRST — the ENTIRE raw body is passed through the shared
        escapeHtml(), so every <, >, &, ", ' becomes an HTML entity
        BEFORE any transform runs. Any author-supplied HTML/script tag
        therefore renders as inert escaped text (Req 14.8); the output
        can never contain an un-escaped author angle bracket.
     2. TRANSFORM SECOND — markdown syntax characters (#, *, -, `, [],
        (), digits) are NOT escaped, so block/inline transforms still
        work on the already-escaped text.

   Link targets are additionally sanitized: only http:, https:, mailto:
   and relative URLs are allowed; javascript:, data:, vbscript: and any
   other scheme are neutralized (the link is rendered as plain text).

   The raw markdown is stored verbatim elsewhere (Req 14.6); this
   function is a pure display-time transform that never mutates input.
   ============================================================ */

/* Sanitize a link target. Returns the (already HTML-escaped) URL when it
   is safe to use as an href, or null when the scheme is disallowed.

   Allowed: http:, https:, mailto:, and relative URLs (no scheme — this
   covers "/abs", "#frag", "./rel", "../up", "page.html", query strings).
   Neutralized: javascript:, data:, vbscript:, and every other scheme.

   Scheme smuggling via embedded control characters / whitespace (e.g.
   "java\tscript:") is defeated by stripping chars in the 0x00–0x20 range
   from the detected scheme before comparing, mirroring what browsers
   ignore when parsing a URL scheme. */
function sanitizeUrl(rawUrl) {
  const url = String(rawUrl == null ? "" : rawUrl).trim();
  // The scheme, if any, is the text before the first path separator.
  const head = url.split(/[/?#]/)[0];
  const colon = head.indexOf(":");
  if (colon === -1) {
    return url; // no scheme -> relative URL, allowed
  }
  const scheme = head
    .slice(0, colon)
    .replace(/[\u0000-\u0020]/g, "") // drop control/whitespace chars browsers ignore
    .toLowerCase();
  if (scheme === "http" || scheme === "https" || scheme === "mailto") {
    return url;
  }
  return null; // disallowed scheme (javascript:, data:, vbscript:, ...)
}

/* Apply inline transforms to a single (already-escaped) span of text:
   inline code, links, bold, then italic. Code spans and links are
   replaced with sentinels first so their contents are not re-processed
   by the bold/italic passes, then restored at the end. */
function renderInline(text) {
  const tokens = [];
  const stash = html => {
    tokens.push(html);
    return "\uE000" + (tokens.length - 1) + "\uE001";
  };

  let s = String(text);

  // 1. inline `code` — wrap verbatim (content already escaped).
  s = s.replace(/`([^`]+)`/g, (_m, code) => stash("<code>" + code + "</code>"));

  // 2. [label](url) links — sanitize href; neutralized links degrade to
  //    their plain (escaped) label so no executable target survives.
  s = s.replace(/\[([^\]]*)\]\(([^)]*)\)/g, (_m, label, rawUrl) => {
    const href = sanitizeUrl(rawUrl);
    if (href === null) return stash(label);
    return stash('<a href="' + href + '">' + label + "</a>");
  });

  // 3. **bold** then 4. *italic* (bold first so ** is not eaten by *).
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/\*([^*]+)\*/g, "<em>$1</em>");

  // restore stashed code/link HTML
  s = s.replace(/\uE000(\d+)\uE001/g, (_m, i) => tokens[Number(i)]);
  return s;
}

/* renderMarkdown(body) -> HTML string. See section header. */
function renderMarkdown(body) {
  const escaped = escapeHtml(body == null ? "" : body);
  const lines = escaped.split(/\r?\n/);
  const out = [];
  let listType = null; // "ul" | "ol" | null — currently open list, if any

  const closeList = () => {
    if (listType) {
      out.push("</" + listType + ">");
      listType = null;
    }
  };

  for (const line of lines) {
    let m;
    if ((m = /^###\s+(.*)$/.exec(line))) {
      closeList();
      out.push("<h3>" + renderInline(m[1]) + "</h3>");
    } else if ((m = /^##\s+(.*)$/.exec(line))) {
      closeList();
      out.push("<h2>" + renderInline(m[1]) + "</h2>");
    } else if ((m = /^#\s+(.*)$/.exec(line))) {
      closeList();
      out.push("<h1>" + renderInline(m[1]) + "</h1>");
    } else if ((m = /^\s*\d+\.\s+(.*)$/.exec(line))) {
      if (listType !== "ol") { closeList(); out.push("<ol>"); listType = "ol"; }
      out.push("<li>" + renderInline(m[1]) + "</li>");
    } else if ((m = /^\s*[-*]\s+(.*)$/.exec(line))) {
      if (listType !== "ul") { closeList(); out.push("<ul>"); listType = "ul"; }
      out.push("<li>" + renderInline(m[1]) + "</li>");
    } else if (/^\s*$/.test(line)) {
      closeList(); // blank line terminates any open list; emit nothing
    } else {
      closeList();
      out.push("<p>" + renderInline(line) + "</p>");
    }
  }
  closeList();
  return out.join("\n");
}

MCAT.renderMarkdown = renderMarkdown;

/* ============================================================
   Target-score validation (Req 15.7, 19.6)
   ------------------------------------------------------------
   validateTarget(n) accepts a value IF AND ONLY IF it is an integer in
   the inclusive range [472, 528]. Numeric strings are Number()-coerced
   ("510" -> 510) but non-integers ("510.5", 510.5), out-of-range values,
   NaN/Infinity, booleans, null/undefined, objects, and non-integer-like
   strings ("abc", "510px", "") are all rejected. Shared by the Goals
   module (15.7) and the Settings target/diagnostic fields (19.6).
   ============================================================ */
function validateTarget(n) {
  const reason = "Target score must be an integer from 472 to 528.";
  // Only numbers and strings are candidates; reject booleans/null/objects.
  if (typeof n !== "number" && typeof n !== "string") {
    return { ok: false, reason };
  }
  if (typeof n === "string" && n.trim() === "") {
    return { ok: false, reason };
  }
  const num = Number(n);
  if (!Number.isInteger(num)) {
    return { ok: false, reason };
  }
  if (num < 472 || num > 528) {
    return { ok: false, reason };
  }
  return { ok: true, value: num };
}

MCAT.validateTarget = validateTarget;

/* ============================================================
   Case-insensitive substring search helpers (Req 13.2, 14.3)
   ------------------------------------------------------------
   containsCI(haystack, term) is the shared primitive: true when `term`
   (coerced to string, lower-cased) is a substring of `haystack` (same
   treatment). An empty/whitespace term matches everything, so clearing
   a search box restores the full list.

   searchFormulas matches name | expression | any tag.
   searchNotes    matches title | body | any tag.
   Both are pure filters preserving input order; non-object entries and
   non-array inputs are tolerated (skipped / treated as empty).
   ============================================================ */
function containsCI(haystack, term) {
  const t = String(term == null ? "" : term).toLowerCase();
  if (t === "") return true; // empty term matches all
  return String(haystack == null ? "" : haystack).toLowerCase().includes(t);
}

function searchFormulas(formulas, term) {
  const arr = Array.isArray(formulas) ? formulas : [];
  return arr.filter(f => {
    if (!isPlainObject(f)) return false;
    if (containsCI(f.name, term)) return true;
    if (containsCI(f.expression, term)) return true;
    const tags = Array.isArray(f.tags) ? f.tags : [];
    return tags.some(tag => containsCI(tag, term));
  });
}

function searchNotes(notes, term) {
  const arr = Array.isArray(notes) ? notes : [];
  return arr.filter(n => {
    if (!isPlainObject(n)) return false;
    if (containsCI(n.title, term)) return true;
    if (containsCI(n.body, term)) return true;
    const tags = Array.isArray(n.tags) ? n.tags : [];
    return tags.some(tag => containsCI(tag, term));
  });
}

/* linkedErrorExists(wrong, errorId) -> boolean   (Req 14.9)
   ------------------------------------------------------------
   A Note_Entry may reference Error_Log entries by id in its
   `linkedErrors` array. Before the render layer offers navigation to a
   linked Error_Log entry, it must confirm the target still exists in
   `state.wrong` (entries can be deleted independently of the notes that
   link to them). This helper answers exactly that question.

   Returns true iff some plain-object entry of `wrong` has an `id` equal
   to `errorId`. Comparison tolerates number/string id representations by
   coercing both sides to string. A null/undefined `errorId` never
   matches. Non-array `wrong` is treated as empty; non-object entries and
   entries without an id are skipped. Pure and side-effect free. */
function linkedErrorExists(wrong, errorId) {
  if (errorId == null) return false;
  const arr = Array.isArray(wrong) ? wrong : [];
  const target = String(errorId);
  return arr.some(e => isPlainObject(e) && e.id != null && String(e.id) === target);
}

/* filterByTags(formulas, selectedTags) -> Formula[]   (Req 13.9, Property 33)
   ------------------------------------------------------------
   Returns exactly those Formula_Entries that include at least one of the
   `selectedTags` (set intersection on the entry's `tags`). Tag matching is
   an exact string comparison — the selected tags are drawn from the chips
   built off the entries' own tags, so no case-folding is applied.

   No active tag filter (empty/invalid `selectedTags`) is treated as "show
   all" so the render layer can call this unconditionally; in that case
   every plain-object entry passes. Non-array inputs and non-object entries
   are tolerated (treated as empty / skipped). Input order is preserved. */
function filterByTags(formulas, selectedTags) {
  const arr = Array.isArray(formulas) ? formulas : [];
  const selected = Array.isArray(selectedTags) ? selectedTags : [];
  const noFilter = selected.length === 0;
  const wanted = new Set(selected.map(t => String(t == null ? "" : t)));
  return arr.filter(f => {
    if (!isPlainObject(f)) return false;
    if (noFilter) return true;
    const tags = Array.isArray(f.tags) ? f.tags : [];
    return tags.some(tag => wanted.has(String(tag == null ? "" : tag)));
  });
}

MCAT.containsCI = containsCI;
MCAT.searchFormulas = searchFormulas;
MCAT.searchNotes = searchNotes;
MCAT.linkedErrorExists = linkedErrorExists;
MCAT.filterByTags = filterByTags;

/* ============================================================
   Formula seed data (blueprint §11, Req 13.1)
   ------------------------------------------------------------
   One-time reference set so the Formula_Sheet is useful out of the box.
   Covers the blueprint's listed topics: Physics, General Chemistry,
   Equilibrium, Electrochemistry, Fluids, Circuits, Thermodynamics,
   Kinematics, Optics, and Acid/base chemistry. Each entry matches the
   FormulaEntry shape { id, name, expression, tags, memorized:false } with a
   stable string id so re-seeding never collides. Treat as read-only;
   seedFormulas() always hands back deep clones.
   ============================================================ */
const SEED_FORMULAS = [
  // Kinematics
  { id: "seed-kin-velocity", name: "Average velocity", expression: "v = Δx / Δt", tags: ["Physics", "Kinematics"], memorized: false },
  { id: "seed-kin-accel", name: "Constant acceleration (velocity)", expression: "v = v₀ + at", tags: ["Physics", "Kinematics"], memorized: false },
  { id: "seed-kin-displacement", name: "Constant acceleration (displacement)", expression: "x = x₀ + v₀t + ½at²", tags: ["Physics", "Kinematics"], memorized: false },
  // Physics (forces, energy)
  { id: "seed-phys-newton2", name: "Newton's second law", expression: "F = ma", tags: ["Physics"], memorized: false },
  { id: "seed-phys-ke", name: "Kinetic energy", expression: "KE = ½mv²", tags: ["Physics", "Thermodynamics"], memorized: false },
  { id: "seed-phys-pe", name: "Gravitational potential energy", expression: "PE = mgh", tags: ["Physics"], memorized: false },
  { id: "seed-phys-work", name: "Work", expression: "W = Fd·cosθ", tags: ["Physics"], memorized: false },
  // Fluids
  { id: "seed-fluid-density", name: "Density", expression: "ρ = m / V", tags: ["Fluids", "Physics"], memorized: false },
  { id: "seed-fluid-pressure", name: "Hydrostatic pressure", expression: "P = ρgh", tags: ["Fluids", "Physics"], memorized: false },
  { id: "seed-fluid-continuity", name: "Continuity equation", expression: "A₁v₁ = A₂v₂", tags: ["Fluids", "Physics"], memorized: false },
  { id: "seed-fluid-bernoulli", name: "Bernoulli's equation", expression: "P + ½ρv² + ρgh = constant", tags: ["Fluids", "Physics"], memorized: false },
  // Circuits
  { id: "seed-circ-ohm", name: "Ohm's law", expression: "V = IR", tags: ["Circuits", "Physics"], memorized: false },
  { id: "seed-circ-power", name: "Electrical power", expression: "P = IV = I²R", tags: ["Circuits", "Physics"], memorized: false },
  { id: "seed-circ-cap", name: "Capacitance", expression: "C = Q / V", tags: ["Circuits", "Physics"], memorized: false },
  // Optics
  { id: "seed-opt-snell", name: "Snell's law", expression: "n₁sinθ₁ = n₂sinθ₂", tags: ["Optics", "Physics"], memorized: false },
  { id: "seed-opt-thinlens", name: "Thin lens equation", expression: "1/f = 1/o + 1/i", tags: ["Optics", "Physics"], memorized: false },
  { id: "seed-opt-mag", name: "Magnification", expression: "m = -i / o", tags: ["Optics", "Physics"], memorized: false },
  // Thermodynamics
  { id: "seed-thermo-first", name: "First law of thermodynamics", expression: "ΔU = Q - W", tags: ["Thermodynamics", "Physics"], memorized: false },
  { id: "seed-thermo-gibbs", name: "Gibbs free energy", expression: "ΔG = ΔH - TΔS", tags: ["Thermodynamics", "General Chemistry"], memorized: false },
  // General Chemistry
  { id: "seed-gchem-idealgas", name: "Ideal gas law", expression: "PV = nRT", tags: ["General Chemistry"], memorized: false },
  { id: "seed-gchem-molarity", name: "Molarity", expression: "M = mol solute / L solution", tags: ["General Chemistry"], memorized: false },
  // Equilibrium
  { id: "seed-eq-keq", name: "Equilibrium constant", expression: "Keq = [products]^n / [reactants]^m", tags: ["Equilibrium", "General Chemistry"], memorized: false },
  { id: "seed-eq-gibbsk", name: "Gibbs energy and K", expression: "ΔG° = -RT·lnK", tags: ["Equilibrium", "Thermodynamics", "General Chemistry"], memorized: false },
  // Electrochemistry
  { id: "seed-echem-nernst", name: "Nernst equation", expression: "E = E° - (RT/nF)·lnQ", tags: ["Electrochemistry", "General Chemistry"], memorized: false },
  { id: "seed-echem-gibbs", name: "Cell potential and Gibbs energy", expression: "ΔG = -nFE", tags: ["Electrochemistry", "Thermodynamics"], memorized: false },
  // Acid/base chemistry
  { id: "seed-acid-ph", name: "pH", expression: "pH = -log[H⁺]", tags: ["Acid/base chemistry", "General Chemistry"], memorized: false },
  { id: "seed-acid-poh", name: "pH + pOH", expression: "pH + pOH = 14", tags: ["Acid/base chemistry", "General Chemistry"], memorized: false },
  { id: "seed-acid-hh", name: "Henderson–Hasselbalch", expression: "pH = pKa + log([A⁻]/[HA])", tags: ["Acid/base chemistry", "Equilibrium", "General Chemistry"], memorized: false }
];

/* seedFormulas(existing) -> Formula[]   (Req 13.1)
   ------------------------------------------------------------
   One-time seed helper for the render layer. When `existing` is a
   non-empty array (the user already has formulas), it is returned
   unchanged so user edits and memorized flags are never clobbered.
   Otherwise a deep clone of SEED_FORMULAS is returned. Pure and
   idempotent: seeding an already-seeded list is a no-op. */
function seedFormulas(existing) {
  if (Array.isArray(existing) && existing.length > 0) return existing;
  return cloneDefault(SEED_FORMULAS);
}

MCAT.SEED_FORMULAS = SEED_FORMULAS;
MCAT.seedFormulas = seedFormulas;

/* ============================================================
   Weekly bucketing, totals, and rounding (Req 7.2, 8.3, 8.4)
   ------------------------------------------------------------
   Pure, DOM-free, timezone-safe helpers for the Analytics page and
   the Full-Length tracker. Weeks run Monday–Sunday: every date is
   bucketed to the Monday that opens its ISO week, so a Sunday belongs
   to the week that began the preceding Monday. All date math is done
   in UTC to avoid local-timezone drift; the shared roundTo() helper
   (defined above, task 3.1) is REUSED, not redefined.
   ============================================================ */

/* Parse a strict "YYYY-MM-DD" string into a UTC Date, or null when the
   string is malformed or not a real calendar date (e.g. 2024-02-30).
   Doing the parse in UTC keeps weeklyBucketKey free of local-timezone
   surprises around midnight / DST boundaries. */
function parseISODateUTC(dateStr) {
  if (typeof dateStr !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  // Reject overflow (e.g. Feb 30 rolled into March) by round-tripping.
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    return null;
  }
  return d;
}

/* Format a UTC Date back to "YYYY-MM-DD". */
function formatISODateUTC(d) {
  const y = String(d.getUTCFullYear()).padStart(4, "0");
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return y + "-" + m + "-" + day;
}

/* weeklyBucketKey(dateStr) -> "YYYY-MM-DD" of the MONDAY that opens the
   Monday–Sunday week containing dateStr, or "" for invalid input.
   getUTCDay(): 0=Sun..6=Sat; we map so Monday is the week start, so
   Sunday (0) is treated as 6 days after its Monday. */
function weeklyBucketKey(dateStr) {
  const d = parseISODateUTC(dateStr);
  if (d === null) return "";
  const dow = d.getUTCDay();              // 0=Sun .. 6=Sat
  const offsetToMonday = (dow + 6) % 7;   // Mon->0, Tue->1, ..., Sun->6
  const monday = new Date(d.getTime());
  monday.setUTCDate(monday.getUTCDate() - offsetToMonday);
  return formatISODateUTC(monday);
}

/* weeklyVolume(practiceSets) -> [{ weekStart, attempted }] ascending by
   weekStart. attempted is the sum of each set's `attempted` (Number-
   coerced, finite, positive) across sets whose date falls in that
   Monday–Sunday week. Sets with an invalid/missing date are skipped, so
   the property "Σ bucket attempted === Σ all valid-dated set attempted"
   holds. */
function weeklyVolume(practiceSets) {
  const order = [];
  const totals = new Map();
  if (Array.isArray(practiceSets)) {
    for (const s of practiceSets) {
      if (!isPlainObject(s)) continue;
      const key = weeklyBucketKey(s.date);
      if (key === "") continue;
      const a = Number(s.attempted);
      if (!isFinite(a) || a <= 0) continue;
      if (!totals.has(key)) {
        totals.set(key, 0);
        order.push(key);
      }
      totals.set(key, totals.get(key) + a);
    }
  }
  return order
    .sort()
    .map(weekStart => ({ weekStart, attempted: totals.get(weekStart) }));
}

/* weeklyHours(sessions) -> [{ weekStart, hours }] ascending by weekStart.
   `sessions` is the existing state.sessions map of "YYYY-MM-DD" -> minutes;
   hours = (Σ minutes in that week) / 60. Minutes are Number-coerced and
   counted only when finite and positive. Total-preserving: Σ bucket hours
   === (Σ all valid-dated minutes)/60. */
function weeklyHours(sessions) {
  const order = [];
  const minutesByWeek = new Map();
  if (isPlainObject(sessions)) {
    for (const dateKey of Object.keys(sessions)) {
      const week = weeklyBucketKey(dateKey);
      if (week === "") continue;
      const mins = Number(sessions[dateKey]);
      if (!isFinite(mins) || mins <= 0) continue;
      if (!minutesByWeek.has(week)) {
        minutesByWeek.set(week, 0);
        order.push(week);
      }
      minutesByWeek.set(week, minutesByWeek.get(week) + mins);
    }
  }
  return order
    .sort()
    .map(weekStart => ({ weekStart, hours: minutesByWeek.get(weekStart) / 60 }));
}

/* scoreTotal(record) -> integer sum of the four section scores
   (cp + cars + bb + ps). Sections are Number-coerced; a non-finite
   section contributes 0 so the function never returns NaN. For valid
   sections (each 118..132) the result lands in 472..528. */
function scoreTotal(record) {
  const rec = isPlainObject(record) ? record : {};
  const section = v => {
    const n = Number(v);
    return isFinite(n) ? n : 0;
  };
  return section(rec.cp) + section(rec.cars) + section(rec.bb) + section(rec.ps);
}

MCAT.weeklyBucketKey = weeklyBucketKey;
MCAT.weeklyVolume = weeklyVolume;
MCAT.weeklyHours = weeklyHours;
MCAT.scoreTotal = scoreTotal;

/* ============================================================
   Practice-set validation (Req 3.1, 3.2, 3.4, 3.5, 3.6)
   ------------------------------------------------------------
   validatePracticeSet(input) is the pure gatekeeper for the Practice
   Question Tracker entry form. It validates the user's inputs and, on
   success, returns a NORMALIZED PracticeSet value object ready to push
   onto state.practiceSets.

     -> { ok: true,  value: PracticeSet }
     -> { ok: false, errors: { field: message, ... } }

   Validation rules:
     - section   must be exactly one of C/P, CARS, B/B, P/S        (3.1)
     - attempted must be an integer in 1..9999                     (3.5)
     - correct   must be an integer >= 0 (3.6) AND <= attempted    (3.4)
     - date      must be present (a non-empty string); stored as given (3.1)
     - resource / topic are trimmed and capped to 100 chars        (3.2)
     - notes is trimmed and capped to 500 chars                    (3.2)
     - timing defaults to "untimed" when missing/invalid           (3.2)
     - difficulty defaults to "medium" when missing/invalid        (3.2)

   ALL applicable field errors are collected (validation never aborts on
   the first failure) so the UI can surface every problem at once. The
   "correct exceeds attempted" check (3.4) only runs when attempted is
   itself a valid integer, so an invalid attempted never masquerades as a
   correct-too-large error.

   percentCorrect is intentionally NOT stored on the value object: it is a
   derived quantity (percentCorrect(correct, attempted)) so it can never
   drift from its inputs (Req 3.3). */
function validatePracticeSet(input) {
  const inp = isPlainObject(input) ? input : {};
  const errors = {};

  // Coerce a value to a number ONLY when it is a number or a non-empty
  // string; everything else (booleans, null, objects, "") -> NaN so the
  // integer checks below reject it.
  const toNum = v => {
    if (typeof v === "number") return v;
    if (typeof v === "string" && v.trim() !== "") return Number(v);
    return NaN;
  };

  // Trim then hard-cap a free-text field to `max` characters.
  const capText = (v, max) => String(v == null ? "" : v).trim().slice(0, max);

  // --- section (3.1) ---
  const VALID_SECTIONS = ["C/P", "CARS", "B/B", "P/S"];
  if (!VALID_SECTIONS.includes(inp.section)) {
    errors.section = "Section must be one of C/P, CARS, B/B, or P/S.";
  }

  // --- attempted (3.5) ---
  const attempted = toNum(inp.attempted);
  const attemptedValid = Number.isInteger(attempted) && attempted >= 1 && attempted <= 9999;
  if (!attemptedValid) {
    errors.attempted = "Number attempted must be a whole number from 1 to 9999.";
  }

  // --- correct (3.6 then 3.4) ---
  const correct = toNum(inp.correct);
  if (!Number.isInteger(correct) || correct < 0) {
    errors.correct = "Number correct must be a whole number of zero or greater.";
  } else if (attemptedValid && correct > attempted) {
    errors.correct = "Number correct cannot exceed the number attempted.";
  }

  // --- date (3.1: presence expected; stored as given) ---
  const date = typeof inp.date === "string" ? inp.date : "";
  if (date.trim() === "") {
    errors.date = "Date is required.";
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  // --- normalized PracticeSet value object (Req 3.2) ---
  const timing = (inp.timing === "timed" || inp.timing === "untimed") ? inp.timing : "untimed";
  const difficulty = ["easy", "medium", "hard"].includes(inp.difficulty) ? inp.difficulty : "medium";

  return {
    ok: true,
    value: {
      id: inp.id != null ? inp.id : uid(),
      date,
      resource: capText(inp.resource, 100),
      section: inp.section,
      topic: capText(inp.topic, 100),
      correct,
      attempted,
      timing,
      difficulty,
      notes: capText(inp.notes, 500)
    }
  };
}

MCAT.validatePracticeSet = validatePracticeSet;

/* ============================================================
   Error Log enhancements (Req 6.1, 6.5, 6.6, 6.7)
   ------------------------------------------------------------
   Pure, DOM-free helpers for the enhanced Wrong Answers / Error Log
   module: strict ISO-date validation for the retest field, complete
   mistake-category counting for the summary panel, and a length-cap
   text clamp shared by the explanation/takeaway inputs.
   ============================================================ */

/* The fixed Mistake_Category taxonomy (Req 6.1), in display order.
   Exported so the render layer can build the <select> and the count
   summary from a single source of truth. */
const MISTAKE_CATEGORIES = [
  "content gap",
  "misread question",
  "misread passage",
  "calculation error",
  "timing issue",
  "wrong reasoning",
  "trap answer",
  "did not know formula",
  "guessed"
];

/* isValidISODate(s) -> boolean (Req 6.5).
   True IF AND ONLY IF `s` is a strict "YYYY-MM-DD" string naming a REAL
   calendar date: 4-digit year, month 01..12, and day within that
   month's actual length (including leap-year Feb 29). Anything else —
   non-strings, wrong shapes ("2024-1-1", "2024/01/01"), surrounding
   whitespace, impossible dates ("2024-02-30", "2023-02-29") — is false.

   Strictness note: no trimming is performed, so " 2024-01-01 " is
   rejected; this is intentional for a field whose value is a normalized
   <input type="date"> string. Calendar validity is confirmed by
   round-tripping through a UTC Date so month overflow (Feb 30 rolling
   into March) cannot slip through. */
function isValidISODate(s) {
  if (typeof s !== "string") return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12) return false;
  // Leap-year-aware month length, avoiding Date.UTC (which maps years 0-99
  // to 1900-1999 and would wrongly reject valid dates in years 0001-0099).
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const monthLengths = [31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day < 1 || day > monthLengths[month - 1]) return false;
  return true;
}

/* categoryCounts(wrong) -> { <each of 9 categories>: n, unset: n } (Req 6.1, 6.7).
   Tallies a `wrong`-array's entries by Mistake_Category. EVERY one of the
   nine categories is present as a key (0 when no entry uses it), plus an
   "unset" key counting entries whose category is missing, the literal
   "unset", or any value outside the taxonomy. The returned counts always
   sum to the number of array entries, so the panel is total-preserving.
   Non-array input is treated as empty; non-object entries count as unset. */
function categoryCounts(wrong) {
  const counts = { unset: 0 };
  for (const cat of MISTAKE_CATEGORIES) counts[cat] = 0;

  const arr = Array.isArray(wrong) ? wrong : [];
  for (const entry of arr) {
    const cat = isPlainObject(entry) ? entry.category : undefined;
    if (typeof cat === "string" && MISTAKE_CATEGORIES.includes(cat)) {
      counts[cat] += 1;
    } else {
      counts.unset += 1;
    }
  }
  return counts;
}

/* clampText(s, max) -> string (Req 6.6).
   Coerce `s` to a string and return at most `max` characters — the
   "last valid value" kept when a length-capped input (explanation /
   takeaway, ≤2000) hits its limit. When `max` is not a usable
   non-negative number the input is returned uncapped (defensive); a
   negative/zero cap yields an empty string. No trimming is performed so
   the user's exact text (sans the overflow) is preserved. */
function clampText(s, max) {
  const str = String(s == null ? "" : s);
  const n = Number(max);
  if (!isFinite(n)) return str;
  const limit = Math.max(0, Math.floor(n));
  return str.slice(0, limit);
}

MCAT.MISTAKE_CATEGORIES = MISTAKE_CATEGORIES;
MCAT.isValidISODate = isValidISODate;
MCAT.categoryCounts = categoryCounts;
MCAT.clampText = clampText;

/* ============================================================
   Full-Length Tracker enhancements (Req 7.1, 7.2, 7.7, 7.8)
   ------------------------------------------------------------
   Pure, DOM-free helpers for the Full-Length Exam Tracker:

     - validateSections(input): gatekeeper for the four Section_Scores
       on submit. Reports EVERY section outside the integer range
       118..132 INDEPENDENTLY (never short-circuits on the first bad
       value), so the UI can flag each invalid section at once (Req 7.8).
     - sectionTrendSeries(scores): builds four date-ordered {date, v}
       series (one per section) from the saved Full_Length_Records,
       tolerating records that are missing/incomplete (Req 7.7).

   scoreTotal (task 3.2) is REUSED by the render layer for the displayed
   total; it is not re-implemented here.
   ============================================================ */

/* The four section keys, in canonical display order. */
const SECTION_KEYS = ["cp", "cars", "bb", "ps"];
const SECTION_MIN = 118;
const SECTION_MAX = 132;

/* isValidSectionScore(v) -> boolean.
   A Section_Score is valid IFF it is an integer in [118, 132].
   Numeric strings are Number()-coerced ("120" -> 120) to mirror form
   inputs, but non-integers (120.5, "120.5"), out-of-range values,
   NaN/Infinity, booleans, null/undefined, "", and non-numeric strings
   are all rejected. */
function isValidSectionScore(v) {
  if (typeof v !== "number" && typeof v !== "string") return false;
  if (typeof v === "string" && v.trim() === "") return false;
  const n = Number(v);
  if (!Number.isInteger(n)) return false;
  return n >= SECTION_MIN && n <= SECTION_MAX;
}

/* validateSections(input) ->
     { ok: true }
   | { ok: false, invalid: [{ section, value }, ...] }

   Checks all four section keys (cp, cars, bb, ps) INDEPENDENTLY and
   collects every section whose value is not an integer in 118..132. The
   `invalid` list is in canonical section order and carries the ORIGINAL
   submitted value (not coerced) so the caller can echo it back in the
   error message. ok:true only when all four sections are valid. */
function validateSections(input) {
  const inp = isPlainObject(input) ? input : {};
  const invalid = [];
  for (const section of SECTION_KEYS) {
    const value = inp[section];
    if (!isValidSectionScore(value)) {
      invalid.push({ section, value });
    }
  }
  return invalid.length === 0 ? { ok: true } : { ok: false, invalid };
}

/* sectionTrendSeries(scores) ->
     { cp: [{date, v}], cars: [...], bb: [...], ps: [...] }

   For each of the four sections, produce a series of {date, v} points —
   one point per record whose value for that section is a finite number —
   ordered ascending by date (string compare). The sort is STABLE:
   records sharing a date keep their original input order. Records that
   are missing the section value, carry a non-finite value, or are not
   plain objects contribute no point to that section's series, so the
   function never throws on incomplete/legacy data (Req 7.7). */
function sectionTrendSeries(scores) {
  const arr = Array.isArray(scores) ? scores : [];
  const result = {};
  for (const section of SECTION_KEYS) {
    const points = [];
    arr.forEach((rec, i) => {
      if (!isPlainObject(rec)) return;
      const raw = rec[section];
      // Only number-typed, finite values produce a point. We intentionally
      // do NOT coerce strings here: a stored Section_Score is a number;
      // anything else is treated as incomplete data and skipped.
      if (typeof raw !== "number" || !isFinite(raw)) return;
      points.push({ date: rec.date == null ? "" : String(rec.date), v: raw, i });
    });
    points.sort((a, b) => {
      if (a.date < b.date) return -1;
      if (a.date > b.date) return 1;
      return a.i - b.i; // stable ordering for equal dates
    });
    result[section] = points.map(p => ({ date: p.date, v: p.v }));
  }
  return result;
}

MCAT.validateSections = validateSections;
MCAT.sectionTrendSeries = sectionTrendSeries;

/* ============================================================
   Content Review Tracker (Req 5.1, 5.2, 5.4, 5.5, 5.6, 5.7)
   ------------------------------------------------------------
   Pure, DOM-free helpers for the Content Review Tracker. The
   predefined subject tree (blueprint §3) and the five-status list
   are exported as the SINGLE SOURCE OF TRUTH so the render layer
   builds its markup, <select> options, and count summary from the
   same constants the validation/aggregation logic uses.

   Topic identity is the stable key "{section}::{label}" (matching the
   contentStatuses map in state), so adding/removing custom topics
   never disturbs the stored status of a predefined topic.
   ============================================================ */

/* The five Content_Topic statuses (Req 5.2), in display order.
   contentStatuses[key] holds exactly one of these; an unkeyed topic is
   treated as "not started" (Req 5.4). Exported as the single source of
   truth for the render layer's <select> and the count summary. */
const CONTENT_STATUSES = [
  "not started",
  "in progress",
  "reviewed",
  "needs practice",
  "mastered"
];

/* The predefined MCAT subject tree from blueprint §3 (Req 5.1).
   Shape: [{ section, groups: [{ name, topics: [label] }] }]. Each of the
   four MCAT_Sections (C/P, CARS, B/B, P/S) carries a single predefined
   group — named for its foundation heading — whose `topics` are the
   blueprint's subject groupings. These topics are the trackable
   Content_Topics that receive a status. Treat this constant as
   read-only; buildSubjectTree() always works on a deep clone. */
const CONTENT_SUBJECT_TREE = [
  {
    section: "C/P",
    groups: [
      {
        name: "Chemical and Physical Foundations",
        topics: ["General Chemistry", "Organic Chemistry", "Physics", "Biochemistry"]
      }
    ]
  },
  {
    section: "CARS",
    groups: [
      {
        name: "Critical Analysis and Reasoning Skills",
        topics: ["Passage practice", "Timing", "Question type review"]
      }
    ]
  },
  {
    section: "B/B",
    groups: [
      {
        name: "Biological and Biochemical Foundations",
        topics: ["Biology", "Biochemistry", "Experimental design"]
      }
    ]
  },
  {
    section: "P/S",
    groups: [
      {
        name: "Psychological, Social, and Biological Foundations",
        topics: ["Psychology", "Sociology", "Research methods/statistics"]
      }
    ]
  }
];

/* contentTopicKey(section, label) -> "{section}::{label}".
   The stable identity used to look up a topic's status in the
   contentStatuses map. Keeps key construction in one place so the pure
   layer and the render layer never drift. */
function contentTopicKey(section, label) {
  return String(section == null ? "" : section) + "::" + String(label == null ? "" : label);
}

/* buildSubjectTree(customContentTopics) ->
     [{ section, groups: [{ name, topics: [label] }] }]

   Returns the predefined tree (deep-cloned, never mutated) merged with
   the user's custom topics. Custom topics are documented to attach under
   their section in a dedicated trailing group named "Custom", so every
   predefined group stays intact and a predefined vs. custom topic is
   always distinguishable. The "Custom" group is created lazily — only a
   section that actually has custom topics gains one.

   `customContentTopics` is the state array of { section, label }. Entries
   that are not plain objects, that target an unknown section (not one of
   the four), or whose label is not a non-empty (trimmed) string are
   skipped, so malformed/legacy data can never corrupt the tree. Labels
   are stored trimmed to match validateCustomTopic's comparisons. */
function buildSubjectTree(customContentTopics) {
  const tree = CONTENT_SUBJECT_TREE.map(node => ({
    section: node.section,
    groups: node.groups.map(g => ({ name: g.name, topics: g.topics.slice() }))
  }));

  // Index sections by code for O(1) attachment of custom topics.
  const bySection = new Map(tree.map(node => [node.section, node]));

  const customs = Array.isArray(customContentTopics) ? customContentTopics : [];
  for (const entry of customs) {
    if (!isPlainObject(entry)) continue;
    const node = bySection.get(entry.section);
    if (!node) continue; // unknown section -> skip (tree stays the four sections)
    const label = String(entry.label == null ? "" : entry.label).trim();
    if (label === "") continue;

    let customGroup = node.groups.find(g => g.name === "Custom");
    if (!customGroup) {
      customGroup = { name: "Custom", topics: [] };
      node.groups.push(customGroup);
    }
    customGroup.topics.push(label);
  }

  return tree;
}

/* statusCounts(tree, contentStatuses) ->
     { "not started": n, "in progress": n, reviewed: n,
       "needs practice": n, mastered: n }

   Tallies every Content_Topic in `tree` by its stored status. ALL five
   status keys are always present (0 when no topic holds that status,
   Req 5.5). A topic's status is read from contentStatuses under the
   stable key "{section}::{label}"; a topic with no stored status, or a
   stored value outside the five-status set, counts as "not started"
   (Req 5.4). The counts always sum to the total number of topic entries
   in the tree, so the summary is total-preserving (Req 5.2). Malformed
   tree/map inputs are tolerated (treated as empty). */
function statusCounts(tree, contentStatuses) {
  const counts = {};
  for (const status of CONTENT_STATUSES) counts[status] = 0;

  const nodes = Array.isArray(tree) ? tree : [];
  const statuses = isPlainObject(contentStatuses) ? contentStatuses : {};

  for (const node of nodes) {
    if (!isPlainObject(node)) continue;
    const groups = Array.isArray(node.groups) ? node.groups : [];
    for (const group of groups) {
      if (!isPlainObject(group)) continue;
      const topics = Array.isArray(group.topics) ? group.topics : [];
      for (const label of topics) {
        const stored = statuses[contentTopicKey(node.section, label)];
        if (typeof stored === "string" && CONTENT_STATUSES.includes(stored)) {
          counts[stored] += 1;
        } else {
          counts["not started"] += 1;
        }
      }
    }
  }
  return counts;
}

/* validateCustomTopic(section, label, tree) ->
     { ok: true } | { ok: false, reason }

   Gatekeeper for adding a custom Content_Topic (Req 5.6, 5.7). Rejects:
     - an empty or whitespace-only label,
     - a label whose trimmed length exceeds 100 characters,
     - a case-insensitive duplicate of any topic already present in that
       section of `tree` (predefined OR previously-added custom).
   The comparison trims and lower-cases both sides so " Physics " would
   duplicate "physics". `tree` is the current built tree (from
   buildSubjectTree); if the section is absent it simply has no existing
   topics to collide with. On success returns { ok: true }. */
function validateCustomTopic(section, label, tree) {
  const trimmed = String(label == null ? "" : label).trim();

  if (trimmed === "") {
    return { ok: false, reason: "Topic label cannot be empty." };
  }
  if (trimmed.length > 100) {
    return { ok: false, reason: "Topic label cannot exceed 100 characters." };
  }

  // Gather existing topic labels for this section from the tree.
  const nodes = Array.isArray(tree) ? tree : [];
  const needle = trimmed.toLowerCase();
  for (const node of nodes) {
    if (!isPlainObject(node) || node.section !== section) continue;
    const groups = Array.isArray(node.groups) ? node.groups : [];
    for (const group of groups) {
      if (!isPlainObject(group)) continue;
      const topics = Array.isArray(group.topics) ? group.topics : [];
      for (const existing of topics) {
        if (String(existing == null ? "" : existing).trim().toLowerCase() === needle) {
          return { ok: false, reason: "That topic already exists in this section." };
        }
      }
    }
  }

  return { ok: true };
}

MCAT.CONTENT_STATUSES = CONTENT_STATUSES;
MCAT.CONTENT_SUBJECT_TREE = CONTENT_SUBJECT_TREE;
MCAT.contentTopicKey = contentTopicKey;
MCAT.buildSubjectTree = buildSubjectTree;
MCAT.statusCounts = statusCounts;
MCAT.validateCustomTopic = validateCustomTopic;

/* ============================================================
   CARS Practice Tracker (Req 10.1–10.6)
   ------------------------------------------------------------
   Pure, DOM-free helpers for the CARS module: strict entry validation
   plus the two aggregate read-outs (average minutes per passage and
   accuracy-by-question-type). A CARS_Passage_Entry is shaped:

     { id, date (ISO YYYY-MM-DD, not after today), passages: int 1..99,
       accuracy: 0..100, timePerPassage: >0 and <=600 (minutes),
       difficulty: "easy"|"medium"|"hard",
       questionTypes: [ subset of the six types ],
       notes: "" (<=2000 chars) }

   `timePerPassage` is minutes spent per passage, so the recorded time
   for an entry is timePerPassage * passages.
   ============================================================ */

/* The six CARS question types (Req 10.2/10.4). Exported so the render
   layer can build the question-type checkboxes and the by-type display
   from a single source of truth. */
const CARS_QUESTION_TYPES = [
  "main idea",
  "author's tone",
  "inference",
  "function",
  "detail",
  "new information/application"
];

/* validateCarsEntry(input) ->
     { ok: true, value: CarsPassageEntry } | { ok: false, errors: {field: msg} }

   Validates a submitted CARS entry, collecting EVERY field error (never
   aborting on the first failure) so the UI can surface them all at once:
     - date          a strict ISO calendar date, not later than today   (10.1)
     - accuracy      a number in [0, 100]                                (10.6)
     - timePerPassage a number > 0 and <= 600 minutes                    (10.5)
     - passages      an integer in [1, 99]                               (10.2)
     - difficulty    one of easy | medium | hard                         (10.2)
     - questionTypes a subset of the six allowed types                   (10.2)
     - notes         trimmed and capped to 2000 chars                    (10.2)

   On success returns a normalized value object (id via uid() when absent;
   questionTypes de-duplicated while preserving the canonical type order;
   notes capped). */
function validateCarsEntry(input) {
  const inp = isPlainObject(input) ? input : {};
  const errors = {};

  // Coerce only numbers / non-empty numeric strings; everything else -> NaN.
  const toNum = v => {
    if (typeof v === "number") return v;
    if (typeof v === "string" && v.trim() !== "") return Number(v);
    return NaN;
  };

  // --- date (10.1): valid ISO calendar date, not after today ---
  const date = typeof inp.date === "string" ? inp.date : "";
  if (!isValidISODate(date)) {
    errors.date = "Date must be a valid calendar date (YYYY-MM-DD).";
  } else if (date > todayStr()) {
    // Lexicographic comparison is valid for zero-padded ISO date strings.
    errors.date = "Date cannot be later than today.";
  }

  // --- accuracy (10.6): number in [0, 100] ---
  const accuracy = toNum(inp.accuracy);
  if (!isFinite(accuracy) || accuracy < 0 || accuracy > 100) {
    errors.accuracy = "Accuracy must be a number between 0 and 100.";
  }

  // --- timePerPassage (10.5): number > 0 and <= 600 ---
  const timePerPassage = toNum(inp.timePerPassage);
  if (!isFinite(timePerPassage) || timePerPassage <= 0 || timePerPassage > 600) {
    errors.timePerPassage = "Time taken must be greater than 0 and at most 600 minutes.";
  }

  // --- passages (10.2): integer in [1, 99] ---
  const passages = toNum(inp.passages);
  if (!Number.isInteger(passages) || passages < 1 || passages > 99) {
    errors.passages = "Passages completed must be a whole number from 1 to 99.";
  }

  // --- difficulty (10.2): one of easy | medium | hard ---
  if (!["easy", "medium", "hard"].includes(inp.difficulty)) {
    errors.difficulty = "Difficulty must be one of easy, medium, or hard.";
  }

  // --- questionTypes (10.2): a subset of the six allowed types ---
  const rawTypes = Array.isArray(inp.questionTypes) ? inp.questionTypes : [];
  if (!Array.isArray(inp.questionTypes) && inp.questionTypes != null) {
    errors.questionTypes = "Question types must be a list.";
  } else if (rawTypes.some(t => !CARS_QUESTION_TYPES.includes(t))) {
    errors.questionTypes = "Question types must be from the allowed set.";
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  // De-duplicate selected types and emit them in the canonical order so
  // the stored value is normalized regardless of input order/duplicates.
  const selected = new Set(rawTypes);
  const questionTypes = CARS_QUESTION_TYPES.filter(t => selected.has(t));

  return {
    ok: true,
    value: {
      id: inp.id != null ? inp.id : uid(),
      date,
      passages,
      accuracy,
      timePerPassage,
      difficulty: inp.difficulty,
      questionTypes,
      notes: String(inp.notes == null ? "" : inp.notes).trim().slice(0, 2000)
    }
  };
}

/* avgMinutesPerPassage(entries) -> number (1 dp) | null (Req 10.3).
   Average minutes per passage = total recorded time / total passages
   across all entries, where an entry's recorded time is
   timePerPassage * passages. Returns null when the total number of
   passages is 0 (no division performed; the caller hides the read-out).
   Only entries with a finite positive `passages` and finite positive
   `timePerPassage` contribute. */
function avgMinutesPerPassage(entries) {
  const arr = Array.isArray(entries) ? entries : [];
  let totalPassages = 0;
  let totalMinutes = 0;
  for (const e of arr) {
    if (!isPlainObject(e)) continue;
    const passages = Number(e.passages);
    const tpp = Number(e.timePerPassage);
    if (!isFinite(passages) || passages <= 0) continue;
    if (!isFinite(tpp) || tpp <= 0) continue;
    totalPassages += passages;
    totalMinutes += tpp * passages;
  }
  if (totalPassages === 0) return null;
  return roundTo(totalMinutes / totalPassages, 1);
}

/* accuracyByQuestionType(entries) -> { <type present>: pct (1 dp, 0..100) }
   (Req 10.4). For each of the six question types, aggregates accuracy
   ACROSS only the entries tagged with that type, as a passage-weighted
   mean of their accuracy values: Σ(accuracy * passages) / Σ passages,
   rounded to one decimal place and clamped to [0, 100]. A type with no
   tagged entries (or no entries carrying usable accuracy/passage data)
   is omitted from the result. Entries missing a positive `passages`
   count toward the mean with a weight of 1 so a tagged entry is never
   silently dropped. */
function accuracyByQuestionType(entries) {
  const arr = Array.isArray(entries) ? entries : [];
  const out = {};
  for (const type of CARS_QUESTION_TYPES) {
    let weightSum = 0;
    let weightedAcc = 0;
    for (const e of arr) {
      if (!isPlainObject(e)) continue;
      const types = Array.isArray(e.questionTypes) ? e.questionTypes : [];
      if (!types.includes(type)) continue;
      const acc = Number(e.accuracy);
      if (!isFinite(acc)) continue;
      const passages = Number(e.passages);
      const weight = isFinite(passages) && passages > 0 ? passages : 1;
      weightSum += weight;
      weightedAcc += acc * weight;
    }
    if (weightSum > 0) {
      out[type] = clampPct(roundTo(weightedAcc / weightSum, 1));
    }
  }
  return out;
}

MCAT.CARS_QUESTION_TYPES = CARS_QUESTION_TYPES;
MCAT.validateCarsEntry = validateCarsEntry;
MCAT.avgMinutesPerPassage = avgMinutesPerPassage;
MCAT.accuracyByQuestionType = accuracyByQuestionType;

/* ============================================================
   Analytics aggregations (Req 8.1, 8.2, 8.5, 8.6, 8.7, 8.9)
   ------------------------------------------------------------
   Pure, DOM-free read-models for the Analytics page. These reuse the
   shared accuracy/grouping/total helpers above rather than recomputing
   anything, so an analytics number can never drift from the practice/
   error/full-length data it summarizes. Whole-number accuracy variants
   (Req 8.1, 8.2) wrap computeGroupAccuracy(group, { dp: 0 }); weekly
   volume/hours are taken verbatim from weeklyVolume/weeklyHours; the
   ordering helpers (weaknessRanking, mistakeFrequency) and the
   predicted-range model are defined here.
   ============================================================ */

/* analyticsAccuracyBySection(sets) -> [{ section, pct, attempted }].
   Same shape as accuracyBySection but with pct rounded to the NEAREST
   WHOLE NUMBER (Req 8.1). One entry per distinct section with a positive
   attempted sum, in first-seen order; sections with zero attempted are
   omitted (no division). */
function analyticsAccuracyBySection(sets) {
  const out = [];
  for (const g of groupSetsBy(sets, "section")) {
    const attempted = sumAttempted(g.members);
    if (attempted <= 0) continue;
    out.push({ section: g.key, pct: computeGroupAccuracy(g.members, { dp: 0 }), attempted });
  }
  return out;
}

/* analyticsAccuracyByTopic(sets) -> [{ topic, pct, attempted }].
   Same shape as accuracyByTopic but with pct rounded to the NEAREST
   WHOLE NUMBER (Req 8.2). One entry per distinct topic with a positive
   attempted sum, in first-seen order; topics with zero attempted are
   omitted (no division). */
function analyticsAccuracyByTopic(sets) {
  const out = [];
  for (const g of groupSetsBy(sets, "topic")) {
    const attempted = sumAttempted(g.members);
    if (attempted <= 0) continue;
    out.push({ topic: g.key, pct: computeGroupAccuracy(g.members, { dp: 0 }), attempted });
  }
  return out;
}

/* weaknessRanking(practiceSets) -> [{ topic, pct, attempted }] (Req 8.5).
   Topics ordered from LOWEST to HIGHEST computed accuracy. Ties (equal
   pct) are broken by GREATER number of questions attempted first; a
   further alphabetical tie-break on topic keeps the order deterministic
   for topics that share both pct and attempted. Built by REUSING
   accuracyByTopic (which already omits zero-attempted topics) and
   sorting a copy, so the underlying aggregation logic stays in one
   place. */
function weaknessRanking(practiceSets) {
  return accuracyByTopic(practiceSets)
    .slice()
    .sort((a, b) => {
      if (a.pct !== b.pct) return a.pct - b.pct;            // ascending accuracy
      if (a.attempted !== b.attempted) return b.attempted - a.attempted; // greater attempted first
      return String(a.topic).localeCompare(String(b.topic)); // stable, deterministic
    });
}

/* mistakeFrequency(wrong) -> [{ category, count }] (Req 8.6).
   Counts Error_Log entries per Mistake_Category ordered from MOST to
   LEAST frequent, with equal-count categories ordered ALPHABETICALLY by
   category name. Built by REUSING categoryCounts and emitting the nine
   defined categories (the "unset" pseudo-category is excluded — Req 8.6
   speaks of the Mistake_Category taxonomy). Every one of the nine
   categories appears, including those with a count of 0. */
function mistakeFrequency(wrong) {
  const counts = categoryCounts(wrong);
  return MISTAKE_CATEGORIES
    .map(category => ({ category, count: counts[category] }))
    .sort((a, b) => {
      if (a.count !== b.count) return b.count - a.count;   // descending count
      return a.category.localeCompare(b.category);          // ties alphabetical
    });
}

/* predictedScoreRange(scores) -> { low, high } | null (Req 8.9).
   Returns null when fewer than two Full_Length_Records exist (no band to
   predict). Otherwise computes the mean and SAMPLE standard deviation of
   the recorded Total_Scores (each via scoreTotal) and returns the band
   [round(mean - sd), round(mean + sd)], each bound rounded to a whole
   number and CLAMPED to the inclusive [472, 528] score range. Because
   clamping is monotonic and sd >= 0, low <= high always holds; a final
   min/max guard makes that invariant explicit. */
function predictedScoreRange(scores) {
  const arr = Array.isArray(scores) ? scores.filter(isPlainObject) : [];
  if (arr.length < 2) return null;

  const totals = arr.map(scoreTotal);
  const n = totals.length;
  const mean = totals.reduce((sum, t) => sum + t, 0) / n;
  const variance = totals.reduce((sum, t) => sum + (t - mean) * (t - mean), 0) / (n - 1);
  const sd = Math.sqrt(variance);

  const clampScore = v => Math.min(528, Math.max(472, v));
  let low = clampScore(roundTo(mean - sd, 0));
  let high = clampScore(roundTo(mean + sd, 0));
  if (low > high) { const t = low; low = high; high = t; } // enforce low <= high

  return { low, high };
}

MCAT.analyticsAccuracyBySection = analyticsAccuracyBySection;
MCAT.analyticsAccuracyByTopic = analyticsAccuracyByTopic;
MCAT.weaknessRanking = weaknessRanking;
MCAT.mistakeFrequency = mistakeFrequency;
MCAT.predictedScoreRange = predictedScoreRange;

/* ============================================================
   Dashboard previews and goal progress (Req 9)
   ------------------------------------------------------------
   Pure, DOM-free helpers that summarize state for the dashboard.
   Each REUSES an existing aggregation helper rather than recomputing,
   and every function that depends on "now" takes the reference date as
   an explicit "today" parameter ("YYYY-MM-DD") so the logic stays
   deterministic and testable (no Date.now() inside the pure layer).
   The render layer is responsible for the per-metric empty-state
   messaging required by Req 9.6.
   ============================================================ */

/* dashboardWeaknessPreview(practiceSets) -> [{ topic, pct, attempted }]
   (Req 9.2). The dashboard's lowest-accuracy topics list: the first
   min(3, number of distinct ranked topics) elements of weaknessRanking.
   Because it is a verbatim prefix of weaknessRanking, it inherits that
   helper's ascending-accuracy ordering and tie-breaks, and omits any
   zero-attempted topic. Returns [] when there is no practice data. */
function dashboardWeaknessPreview(practiceSets) {
  return weaknessRanking(practiceSets).slice(0, 3);
}

/* dashboardAvgAccuracy(practiceSets) -> integer 0..100 | null (Req 9.1).
   Average practice accuracy = Σcorrect / Σattempted * 100 across ALL
   recorded sets, rounded to the nearest whole number. Returns null when
   no set has any attempted questions (Σattempted===0) so the render
   layer can show that metric's independent empty state. Built by
   REUSING computeGroupAccuracy at whole-number precision. */
function dashboardAvgAccuracy(practiceSets) {
  return computeGroupAccuracy(practiceSets, { dp: 0 });
}

/* weeklyHourProgress(sessions, goalHours, today)
     -> { hours, goalHours, pct } (Req 9.4).
   hours = study hours logged in the Monday–Sunday week that contains
   `today`, taken verbatim from weeklyHours(sessions) (total-preserving,
   Monday-aligned). pct = round(hours / goalHours * 100), rounded to the
   nearest whole number. When goalHours is not a positive number there is
   no goal to measure against, so pct is 0 (no division performed). */
function weeklyHourProgress(sessions, goalHours, today) {
  const goal = Number(goalHours);
  const weekKey = weeklyBucketKey(today);
  let hours = 0;
  if (weekKey !== "") {
    const bucket = weeklyHours(sessions).find(b => b.weekStart === weekKey);
    if (bucket) hours = bucket.hours;
  }
  const pct = isFinite(goal) && goal > 0 ? Math.round((hours / goal) * 100) : 0;
  return { hours, goalHours: goal, pct };
}

/* dailyQuestionProgress(practiceSets, goalQ, today)
     -> { count, goal, pct } (Req 9.4).
   count = sum of `attempted` across Practice_Sets dated exactly `today`
   (finite, positive values only, mirroring sumAttempted). pct =
   round(count / goalQ * 100). When goalQ is not a positive number, pct
   is 0 (no division performed). */
function dailyQuestionProgress(practiceSets, goalQ, today) {
  const goal = Number(goalQ);
  const todays = Array.isArray(practiceSets)
    ? practiceSets.filter(s => isPlainObject(s) && s.date === today)
    : [];
  const count = sumAttempted(todays);
  const pct = isFinite(goal) && goal > 0 ? Math.round((count / goal) * 100) : 0;
  return { count, goal, pct };
}

MCAT.dashboardWeaknessPreview = dashboardWeaknessPreview;
MCAT.dashboardAvgAccuracy = dashboardAvgAccuracy;
MCAT.weeklyHourProgress = weeklyHourProgress;
MCAT.dailyQuestionProgress = dailyQuestionProgress;

/* ============================================================
   Goals and Milestones (Req 15.1, 15.4, 15.5, 15.7)
   ------------------------------------------------------------
   Pure, DOM-free helpers backing the Goals_Module. The target-score
   validator (validateTarget) and the weekly-hour / daily-question
   progress helpers (weeklyHourProgress, dailyQuestionProgress, defined
   above) already exist and are REUSED by the render layer directly — they
   are deliberately NOT duplicated here. This block adds only the two
   pieces unique to the Goals view: a completed-full-length count
   (Req 15.4) and milestone create/toggle helpers honoring the 100-item
   cap (Req 15.1, 15.5).
   ============================================================ */

/* Maximum number of Milestones the Goals_Module stores (Req 15.1). */
const MAX_MILESTONES = 100;

/* completedFullLengthCount(scores) -> integer >= 0   (Req 15.4)
   The number of "completed" Full_Length_Records. A record counts as
   completed when all four of its Section_Scores are valid integers in
   118..132 — REUSING validateSections so "complete" stays consistent
   with the Full_Length_Tracker's own validation rather than introducing
   a second notion. A non-array `scores`, or records with missing/invalid
   sections, contribute nothing, so the result is always a non-negative
   integer. */
function completedFullLengthCount(scores) {
  const arr = Array.isArray(scores) ? scores : [];
  let count = 0;
  for (const rec of arr) {
    if (validateSections(rec).ok) count++;
  }
  return count;
}

/* validateMilestone(text, currentCount) ->
     { ok: true, value } | { ok: false, reason }   (Req 15.1)

   Gate for adding a Milestone, mirroring the checklist-item validator's
   shape. A candidate is accepted IF AND ONLY IF:
     - the current milestone count is below the 100-item cap, AND
     - `text` is a string whose trimmed form is non-empty (a milestone
       must describe a goal), AND
     - the trimmed text is at most 200 characters.
   On success the trimmed text is returned as `value`, ready to store in a
   { id, text, done:false } milestone. Rejected candidates leave the list
   unchanged (the render layer retains prior state). */
function validateMilestone(text, currentCount) {
  const count = Number(currentCount);
  if (isFinite(count) && count >= MAX_MILESTONES) {
    return { ok: false, reason: "Milestone list is full (maximum 100 milestones)." };
  }
  if (typeof text !== "string") {
    return { ok: false, reason: "Milestone text must contain at least 1 character." };
  }
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { ok: false, reason: "Milestone text must contain at least 1 character." };
  }
  if (trimmed.length > 200) {
    return { ok: false, reason: "Milestone text must be 200 characters or fewer." };
  }
  return { ok: true, value: trimmed };
}

/* toggleMilestone(milestones, id) -> Milestone[]   (Req 15.5)
   Returns a NEW array (non-mutating) in which the milestone whose `id`
   matches `id` has its `done` flag flipped; every other milestone is
   passed through unchanged. The id comparison tolerates number/string
   representations. A non-array input yields []. The returned array is
   plain data; persisting it via save() is what makes the toggled state
   survive reloads (Req 15.5). */
function toggleMilestone(milestones, id) {
  const arr = Array.isArray(milestones) ? milestones : [];
  const target = String(id);
  return arr.map(m =>
    isPlainObject(m) && m.id != null && String(m.id) === target
      ? { ...m, done: !(m.done === true) }
      : m
  );
}

MCAT.MAX_MILESTONES = MAX_MILESTONES;
MCAT.completedFullLengthCount = completedFullLengthCount;
MCAT.validateMilestone = validateMilestone;
MCAT.toggleMilestone = toggleMilestone;

/* ============================================================
   Review / Spaced-Repetition Tracker (Req 11)
   ------------------------------------------------------------
   Pure, DOM-free spaced-repetition math built on the shared
   constant REVIEW_INTERVALS = [1, 3, 7, 21] (days). All date math
   is done in UTC via parseISODateUTC()/formatISODateUTC() (defined
   above) to avoid local-timezone drift.

   ReviewItem shape (per design, Req 11.1):
     { id, topic, content,
       state: "new"|"due"|"reviewed"|"mature"|"missed",
       intervalIndex: 0,    // index into REVIEW_INTERVALS; -1 = never advanced (new)
       nextDue: "YYYY-MM-DD",
       reviewedMarks: 0, missedMarks: 0 }

   markReviewed/markMissed return a NEW item object (non-mutating) and
   keep the cumulative reviewedMarks / missedMarks counters that drive
   retentionRate(). The live display state is derived by reviewState()
   from the current date, so it always reflects "due" correctly.
   ============================================================ */

/* addDaysISO(dateStr, n) -> "YYYY-MM-DD" of dateStr advanced by n whole
   days (n may be negative), computed in UTC; "" for invalid input. */
function addDaysISO(dateStr, n) {
  const d = parseISODateUTC(dateStr);
  if (d === null) return "";
  const days = Number.isFinite(n) ? Math.trunc(n) : 0;
  d.setUTCDate(d.getUTCDate() + days);
  return formatISODateUTC(d);
}

/* nextInterval(currentInterval) -> the next value in the ascending
   sequence [1,3,7,21], capped at 21. Non-finite input starts at 1. */
function nextInterval(currentInterval) {
  const cur = Number(currentInterval);
  if (!isFinite(cur)) return REVIEW_INTERVALS[0];
  for (let i = 0; i < REVIEW_INTERVALS.length; i++) {
    if (REVIEW_INTERVALS[i] > cur) return REVIEW_INTERVALS[i];
  }
  return REVIEW_INTERVALS[REVIEW_INTERVALS.length - 1]; // cap at 21
}

/* markReviewed(item, today) -> new item. Advances intervalIndex to the
   next slot in REVIEW_INTERVALS (capped at the last), sets nextDue to
   today + that interval, increments reviewedMarks, and sets state to
   "reviewed" (or "mature" once the interval reaches 21). (Req 11.4, 11.5) */
function markReviewed(item, today) {
  const base = isPlainObject(item) ? item : {};
  const last = REVIEW_INTERVALS.length - 1;
  const curIdx = Number.isInteger(base.intervalIndex) ? base.intervalIndex : -1;
  const newIdx = Math.min(curIdx + 1, last);
  const interval = REVIEW_INTERVALS[newIdx];
  const reviewedMarks = (Number.isFinite(base.reviewedMarks) ? base.reviewedMarks : 0) + 1;
  const state = interval >= REVIEW_INTERVALS[last] ? "mature" : "reviewed";
  return Object.assign({}, base, {
    intervalIndex: newIdx,
    nextDue: addDaysISO(today, interval),
    reviewedMarks,
    state,
  });
}

/* markMissed(item, today) -> new item. Resets the interval to 1 day
   (intervalIndex 0), sets nextDue to today + 1, increments missedMarks,
   and sets state to "missed". (Req 11.6) */
function markMissed(item, today) {
  const base = isPlainObject(item) ? item : {};
  const missedMarks = (Number.isFinite(base.missedMarks) ? base.missedMarks : 0) + 1;
  return Object.assign({}, base, {
    intervalIndex: 0,
    nextDue: addDaysISO(today, 1),
    missedMarks,
    state: "missed",
  });
}

/* isDueOnOrBefore(dueStr, today) -> true when dueStr is a valid ISO date
   on or before today. Both are zero-padded "YYYY-MM-DD", so lexical
   comparison matches chronological order. */
function isDueOnOrBefore(dueStr, today) {
  if (typeof dueStr !== "string" || parseISODateUTC(dueStr) === null) return false;
  return dueStr <= today;
}

/* reviewState(item, today) -> "new"|"due"|"reviewed"|"mature"|"missed".
   Precedence (design Property 26): "new" when never reviewed or missed;
   else "due" whenever nextDue <= today (overrides reviewed/mature);
   else "mature" when the interval has reached 21; else the last action's
   state ("reviewed" or "missed"). (Req 11.2, 11.3, 11.5) */
function reviewState(item, today) {
  const base = isPlainObject(item) ? item : {};
  const reviewed = Number.isFinite(base.reviewedMarks) ? base.reviewedMarks : 0;
  const missed = Number.isFinite(base.missedMarks) ? base.missedMarks : 0;
  if (reviewed + missed === 0) return "new";
  if (isDueOnOrBefore(base.nextDue, today)) return "due";
  const last = REVIEW_INTERVALS.length - 1;
  const idx = Number.isInteger(base.intervalIndex) ? base.intervalIndex : -1;
  if (idx >= 0 && REVIEW_INTERVALS[Math.min(idx, last)] >= REVIEW_INTERVALS[last]) {
    return "mature";
  }
  return base.state === "missed" ? "missed" : "reviewed";
}

/* dueCount(items, today) -> count of items whose nextDue is a valid date
   on or before today. New items (no valid nextDue) are not counted.
   (Req 11.7, 9.3) */
function dueCount(items, today) {
  if (!Array.isArray(items)) return 0;
  let count = 0;
  for (const it of items) {
    if (!isPlainObject(it)) continue;
    if (isDueOnOrBefore(it.nextDue, today)) count++;
  }
  return count;
}

/* retentionRate(items) -> integer 0..100, or "N/A" when the combined
   reviewed + missed marks across all items is zero (no division is
   performed in that case). (Req 11.8, 11.9) */
function retentionRate(items) {
  let reviewed = 0;
  let missed = 0;
  if (Array.isArray(items)) {
    for (const it of items) {
      if (!isPlainObject(it)) continue;
      if (Number.isFinite(it.reviewedMarks)) reviewed += it.reviewedMarks;
      if (Number.isFinite(it.missedMarks)) missed += it.missedMarks;
    }
  }
  const total = reviewed + missed;
  if (total === 0) return "N/A";
  return Math.round((reviewed / total) * 100);
}

/* topicsByRetention(items) -> [{ topic, rate }] ordered by ascending
   retention rate, ties broken alphabetically by topic label. Items are
   grouped by topic; a topic's rate is round(reviewed/(reviewed+missed)*100)
   over its items. Topics with zero combined marks are omitted (no rate is
   defined for a zero denominator, mirroring the codebase's empty-group
   handling). (Req 11.10) */
function topicsByRetention(items) {
  const map = new Map(); // topic -> { reviewed, missed }
  if (Array.isArray(items)) {
    for (const it of items) {
      if (!isPlainObject(it)) continue;
      const topic = typeof it.topic === "string" ? it.topic : "";
      const reviewed = Number.isFinite(it.reviewedMarks) ? it.reviewedMarks : 0;
      const missed = Number.isFinite(it.missedMarks) ? it.missedMarks : 0;
      const cur = map.get(topic) || { reviewed: 0, missed: 0 };
      cur.reviewed += reviewed;
      cur.missed += missed;
      map.set(topic, cur);
    }
  }
  const out = [];
  for (const [topic, m] of map) {
    const total = m.reviewed + m.missed;
    if (total === 0) continue; // omit topics with no recorded marks
    out.push({ topic, rate: Math.round((m.reviewed / total) * 100) });
  }
  out.sort(
    (a, b) =>
      a.rate - b.rate ||
      (a.topic < b.topic ? -1 : a.topic > b.topic ? 1 : 0)
  );
  return out;
}

MCAT.addDaysISO = addDaysISO;
MCAT.nextInterval = nextInterval;
MCAT.markReviewed = markReviewed;
MCAT.markMissed = markMissed;
MCAT.reviewState = reviewState;
MCAT.dueCount = dueCount;
MCAT.retentionRate = retentionRate;
MCAT.topicsByRetention = topicsByRetention;

/* ============================================================
   Resource Tracker enhancements (Req 12.2, 12.3, 12.4, 12.5, 12.7, 12.8)
   ------------------------------------------------------------
   Pure, DOM-free helpers for the editable Resource_Tracker list that
   sits alongside the existing static resource links. They power three
   behaviors: validating the completed/total question counts on entry
   (12.4, 12.5), deriving the completion-percentage display string with
   an explicit zero-denominator guard (12.2, 12.3), and ordering tracked
   resources from highest to lowest priority (12.7, 12.8).
   ============================================================ */

/* PRIORITY_LEVELS: the fixed set of selectable priority levels, listed
   from HIGHEST to LOWEST. Index === rank, so a lower index means higher
   priority. The ResourceEntry shape uses "high" | "med" | "low"
   (design Data Models), and sortByPriority orders by this ranking. */
const PRIORITY_LEVELS = ["high", "med", "low"];

/* Rank lookup: priority label -> 0-based rank (0 = highest priority).
   Unknown / missing priorities are ranked AFTER every known level so an
   entry with a bad priority falls to the bottom rather than throwing. */
const PRIORITY_RANK = (() => {
  const rank = {};
  PRIORITY_LEVELS.forEach((level, i) => { rank[level] = i; });
  return rank;
})();

function priorityRank(priority) {
  return Object.prototype.hasOwnProperty.call(PRIORITY_RANK, priority)
    ? PRIORITY_RANK[priority]
    : PRIORITY_LEVELS.length; // unknown -> sort last (lowest)
}

/* validateResourceCounts(completed, total) -> { ok:true } | { ok:false, reason }.
   Both values must be integers >= 0 and `completed` must not exceed
   `total`. Numeric strings are Number()-coerced ("10" -> 10); non-integers
   ("1.5", 1.5), negatives, NaN/Infinity, booleans, null/undefined, objects,
   and non-numeric strings are all rejected. The reason distinguishes the
   "completed exceeds total" case (Req 12.4) from the "not a whole number
   of 0 or greater" case (Req 12.5). */
function validateResourceCounts(completed, total) {
  const wholeReason =
    "Questions completed and total questions must each be a whole number of 0 or greater.";
  const exceedReason = "Questions completed cannot exceed total questions.";

  const toInt = v => {
    if (typeof v !== "number" && typeof v !== "string") return null;
    if (typeof v === "string" && v.trim() === "") return null;
    const num = Number(v);
    if (!Number.isInteger(num) || num < 0) return null;
    return num;
  };

  const c = toInt(completed);
  const t = toInt(total);
  if (c === null || t === null) return { ok: false, reason: wholeReason };
  if (c > t) return { ok: false, reason: exceedReason };
  return { ok: true };
}

/* completionPct(completed, total) -> string ending in "%".
   Returns "0%" when total === 0 WITHOUT performing the division (Req 12.3).
   Otherwise computes (completed / total) * 100, clamps into [0,100],
   rounds to one decimal place via the shared roundTo(), and appends "%"
   (Req 12.2). Inputs are Number()-coerced; non-finite or invalid inputs
   degrade to "0%" rather than producing "NaN%". */
function completionPct(completed, total) {
  const t = Number(total);
  const c = Number(completed);
  if (!isFinite(t) || t === 0) return "0%"; // zero-denominator guard, no division
  const safeC = isFinite(c) ? c : 0;
  const pct = clampPct(roundTo((safeC / t) * 100, 1));
  return pct + "%";
}

/* sortByPriority(resources) -> resources ordered highest -> lowest priority.
   Returns a NEW array (input not mutated); the sort is STABLE, so
   resources sharing a priority level keep their original relative order
   (decorate-with-index tie-break). Unknown/missing priorities sort last.

   Per Req 12.8 the RENDER layer surfaces any error and keeps the view
   unchanged on failure (no fallback reordering); this pure function is
   kept total and non-throwing for any array input so normal use never
   triggers that path. It throws ONLY on truly invalid input (a non-array),
   which the caller treats as the technical-failure case. */
function sortByPriority(resources) {
  if (!Array.isArray(resources)) {
    throw new TypeError("sortByPriority expects an array of resources.");
  }
  return resources
    .map((r, i) => ({ r, i }))
    .sort((a, b) => {
      const ra = priorityRank(isPlainObject(a.r) ? a.r.priority : undefined);
      const rb = priorityRank(isPlainObject(b.r) ? b.r.priority : undefined);
      return ra - rb || a.i - b.i; // higher priority first; stable on ties
    })
    .map(({ r }) => r);
}

MCAT.PRIORITY_LEVELS = PRIORITY_LEVELS;
MCAT.validateResourceCounts = validateResourceCounts;
MCAT.completionPct = completionPct;
MCAT.sortByPriority = sortByPriority;

/* ============================================================
   Daily Study Log (Req 16.1, 16.2, 16.3)
   ------------------------------------------------------------
   Pure, DOM-free helpers for the reflective Daily_Log. validateDailyLog
   is the gatekeeper for the entry form: it accepts a candidate entry IFF
   the date is a valid calendar date AND every numeric field is within its
   allowed range, returning a NORMALIZED DailyLogEntry on success (Req
   16.1, 16.3). upsertDailyLog stores an entry keyed by its date, replacing
   any existing same-date entry rather than creating a duplicate, else
   appending (Req 16.2). Display ordering (most-recent-first) is a render
   concern handled in the DOM layer.

   DailyLogEntry shape (design Data Models, Req 16.1):
     { date: "YYYY-MM-DD", hours: 0..24 (<=1 dp), questions: int 0..9999,
       accuracy: 0..100, subject: "", energy: int 1..5,
       confidence: int 1..5, reflection: "" (<=2000) }
   ============================================================ */

/* validateDailyLog(input) ->
     { ok: true, value: DailyLogEntry } | { ok: false, errors: {field: msg} }

   Validation (each numeric field independently; all errors collected):
   - date: a valid ISO calendar date (rejects missing/invalid, Req 16.3).
   - hours: number in [0, 24] with at most one decimal place.
   - questions: integer in [0, 9999].
   - accuracy: number in [0, 100].
   - energy: integer in [1, 5].
   - confidence: integer in [1, 5].
   reflection is a length-capped free-text field (<=2000, Req 16.1) and is
   NOT a rejection cause — it is clamped on the normalized value, matching
   how other capped text inputs behave across the app. subject is stored
   trimmed as given. */
function validateDailyLog(input) {
  const inp = isPlainObject(input) ? input : {};
  const errors = {};

  // Coerce only numbers / non-empty numeric strings; everything else -> NaN.
  const toNum = v => {
    if (typeof v === "number") return v;
    if (typeof v === "string" && v.trim() !== "") return Number(v);
    return NaN;
  };

  // --- date (16.3): valid ISO calendar date ---
  const date = typeof inp.date === "string" ? inp.date : "";
  if (!isValidISODate(date)) {
    errors.date = "Date must be a valid calendar date (YYYY-MM-DD).";
  }

  // --- hours (16.1): number in [0, 24] with at most one decimal place ---
  const hours = toNum(inp.hours);
  if (!isFinite(hours) || hours < 0 || hours > 24 || roundTo(hours, 1) !== hours) {
    errors.hours = "Hours studied must be a number from 0 to 24 with at most one decimal place.";
  }

  // --- questions (16.1): integer in [0, 9999] ---
  const questions = toNum(inp.questions);
  if (!Number.isInteger(questions) || questions < 0 || questions > 9999) {
    errors.questions = "Questions completed must be a whole number from 0 to 9999.";
  }

  // --- accuracy (16.1): number in [0, 100] ---
  const accuracy = toNum(inp.accuracy);
  if (!isFinite(accuracy) || accuracy < 0 || accuracy > 100) {
    errors.accuracy = "Accuracy must be a number between 0 and 100.";
  }

  // --- energy (16.1): integer in [1, 5] ---
  const energy = toNum(inp.energy);
  if (!Number.isInteger(energy) || energy < 1 || energy > 5) {
    errors.energy = "Energy level must be a whole number from 1 to 5.";
  }

  // --- confidence (16.1): integer in [1, 5] ---
  const confidence = toNum(inp.confidence);
  if (!Number.isInteger(confidence) || confidence < 1 || confidence > 5) {
    errors.confidence = "Confidence level must be a whole number from 1 to 5.";
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      date,
      hours,
      questions,
      accuracy,
      subject: String(inp.subject == null ? "" : inp.subject).trim(),
      energy,
      confidence,
      reflection: clampText(inp.reflection, 2000)
    }
  };
}

/* upsertDailyLog(log, entry) -> log (Req 16.2).
   Returns a NEW array (input not mutated). If an entry with the same
   `date` already exists, it is REPLACED in place (preserving position);
   otherwise `entry` is appended. Idempotent for a fixed entry: upserting
   the same entry twice yields a log with a single entry for that date.
   A non-array `log` is treated as empty; an entry without a string date
   is appended as-is (the validate step upstream guarantees a valid date
   in normal use). */
function upsertDailyLog(log, entry) {
  const arr = Array.isArray(log) ? log.slice() : [];
  const date = isPlainObject(entry) ? entry.date : undefined;
  if (typeof date === "string") {
    const idx = arr.findIndex(e => isPlainObject(e) && e.date === date);
    if (idx >= 0) {
      arr[idx] = entry;
      return arr;
    }
  }
  arr.push(entry);
  return arr;
}

MCAT.validateDailyLog = validateDailyLog;
MCAT.upsertDailyLog = upsertDailyLog;

/* ============================================================
   Test-Day Readiness Checklist (Req 17.3, 17.4, 17.5)
   ------------------------------------------------------------
   Pure, DOM-free helpers for the Readiness_Checklist.

   validateChecklistItem(label, customCount) is the gatekeeper for the
   add-custom-item form. A candidate label is accepted IF AND ONLY IF it
   is a string of 1–100 characters AND the current custom-item count is
   below the 50-item cap. Per Req 17.4 whitespace-only labels (e.g. " ")
   ARE allowed, so the length is measured on the raw label WITHOUT
   trimming — only a truly zero-length string is rejected for emptiness.

   completedCount(readiness) returns the number of checked items across
   both the predefined and custom arrays. It tolerates a missing/invalid
   readiness object or arrays so the render layer can call it
   unconditionally.
   ============================================================ */

/* validateChecklistItem(label, customCount) ->
     { ok: true } | { ok: false, reason }   (Req 17.4, 17.5)

   - reject when the 50-custom-item cap is already reached (customCount>=50),
   - reject a non-string or zero-length label ("completely empty"),
   - reject a label longer than 100 characters,
   - otherwise accept (whitespace-only labels are valid, Req 17.4).
   Length is the raw character count; no trimming is applied. */
function validateChecklistItem(label, customCount) {
  const count = Number(customCount);
  if (isFinite(count) && count >= 50) {
    return { ok: false, reason: "Checklist is full (maximum 50 custom items)." };
  }
  if (typeof label !== "string" || label.length === 0) {
    return { ok: false, reason: "Custom item must contain at least 1 character." };
  }
  if (label.length > 100) {
    return { ok: false, reason: "Custom item must be 100 characters or fewer." };
  }
  return { ok: true };
}

/* completedCount(readiness) -> integer   (Req 17.3)
   Counts items whose `checked` is strictly true across the predefined and
   custom arrays. Non-array sections and non-object items are skipped, and a
   missing/invalid readiness object yields 0. */
function completedCount(readiness) {
  const r = isPlainObject(readiness) ? readiness : {};
  const predefined = Array.isArray(r.predefined) ? r.predefined : [];
  const custom = Array.isArray(r.custom) ? r.custom : [];
  let total = 0;
  for (const item of predefined) {
    if (isPlainObject(item) && item.checked === true) total++;
  }
  for (const item of custom) {
    if (isPlainObject(item) && item.checked === true) total++;
  }
  return total;
}

MCAT.validateChecklistItem = validateChecklistItem;
MCAT.completedCount = completedCount;

/* ============================================================
   In-App Reminders (Req 18.1, 18.4, 18.5)
   ------------------------------------------------------------
   Pure, DOM-free, network-free derivation of the active reminder set
   from existing state plus a caller-supplied reference date `today`
   (passed in so the function stays deterministic/testable — it never
   reads the system clock). The render layer (renderReminders) filters
   the result against `reminderDismissals` via isDismissedToday and
   paints the persistent reminder bar.

   computeReminders(state, today) -> Reminder[]
     Each Reminder is a plain object:
       { kind, key, date, ...kind-specific fields }
     where `kind` is one of:
       "countdown"   — the test-date countdown (when state.testDate is a
                       valid calendar date). Adds { daysUntil }.
       "review"      — each Review_Item whose nextDue is a valid date on or
                       before today. Adds { id, topic }.
       "fulllength"  — each scheduled full-length event (type "test") dated
                       exactly today. Adds { id, title }.
       "retest"      — each Error_Log (`wrong`) entry whose retestDate is a
                       valid date on or before today. Adds { id, topic }.
     `key` uniquely identifies the reminder for day-scoped dismissal and is
     stable across reloads. Output order is deterministic: countdown first,
     then review items, full-length events, and retests in array order.
   ============================================================ */

/* daysBetweenISO(fromStr, toStr) -> whole-day difference (to - from),
   computed in UTC, or null when either date is invalid. */
function daysBetweenISO(fromStr, toStr) {
  const from = parseISODateUTC(fromStr);
  const to = parseISODateUTC(toStr);
  if (from === null || to === null) return null;
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

function computeReminders(state, today) {
  const s = isPlainObject(state) ? state : {};
  const reminders = [];

  // 1. Test-date countdown — when a valid test date is set.
  const testDate = typeof s.testDate === "string" ? s.testDate : "";
  if (isValidISODate(testDate)) {
    const daysUntil = daysBetweenISO(today, testDate);
    reminders.push({
      kind: "countdown",
      key: "countdown",
      date: testDate,
      daysUntil: daysUntil === null ? null : daysUntil,
    });
  }

  // 2. Review items due on or before today (new items have no valid nextDue
  //    and are therefore not due — consistent with dueCount).
  const reviewItems = Array.isArray(s.reviewItems) ? s.reviewItems : [];
  for (const it of reviewItems) {
    if (!isPlainObject(it)) continue;
    if (isDueOnOrBefore(it.nextDue, today)) {
      reminders.push({
        kind: "review",
        key: "review:" + it.id,
        date: it.nextDue,
        id: it.id,
        topic: typeof it.topic === "string" ? it.topic : "",
      });
    }
  }

  // 3. Scheduled full-length events (type "test") dated exactly today.
  const events = Array.isArray(s.events) ? s.events : [];
  for (const e of events) {
    if (!isPlainObject(e)) continue;
    if (e.type === "test" && typeof e.date === "string" && e.date === today) {
      reminders.push({
        kind: "fulllength",
        key: "event:" + e.id,
        date: e.date,
        id: e.id,
        title: typeof e.title === "string" ? e.title : "",
      });
    }
  }

  // 4. Error-log entries whose retest date is on or before today.
  const wrong = Array.isArray(s.wrong) ? s.wrong : [];
  for (const w of wrong) {
    if (!isPlainObject(w)) continue;
    if (isDueOnOrBefore(w.retestDate, today)) {
      reminders.push({
        kind: "retest",
        key: "retest:" + w.id,
        date: w.retestDate,
        id: w.id,
        topic: typeof w.topic === "string" ? w.topic : "",
      });
    }
  }

  return reminders;
}

/* isDismissedToday(dismissals, key, today) -> boolean   (Req 18.4)
   True IFF the reminder identified by `key` was dismissed for the current
   calendar day, i.e. dismissals[key] === today. Accepts either the
   `reminderDismissals` map directly or a full state object containing one,
   so the render layer can pass whichever is convenient. The day scoping
   falls out naturally: a dismissal recorded on an earlier day no longer
   matches `today`, so the reminder reappears on later days. */
function isDismissedToday(dismissals, key, today) {
  let map = {};
  if (isPlainObject(dismissals)) {
    map = isPlainObject(dismissals.reminderDismissals)
      ? dismissals.reminderDismissals
      : dismissals;
  }
  return map[key] === today;
}

MCAT.computeReminders = computeReminders;
MCAT.isDismissedToday = isDismissedToday;

/* ============================================================
   User Settings and Profile (Req 19.1, 19.2, 19.6, 19.7)
   ------------------------------------------------------------
   Pure, DOM-free validation for the Settings_Module fields. The render
   layer (renderSettings) calls these to decide which fields to persist
   and which to reject (retaining the previously saved value for the
   rejected field only).

   isValidFutureDate(s, today) -> boolean (Req 19.7)
     True IF AND ONLY IF `s` is a strict, real "YYYY-MM-DD" calendar date
     (via isValidISODate) that is NOT earlier than the reference date
     `today`. The reference date is passed in so the function stays
     deterministic/testable and never reads the system clock; when
     `today` itself is not a valid calendar date the comparison cannot be
     made and the result is false (defensive). Because both operands are
     validated fixed-width "YYYY-MM-DD" strings, lexicographic string
     comparison coincides exactly with chronological comparison.

   STUDY_PHASES — the four allowed study-phase values (Req 19.2).

   validateSettings(input, today) -> { ok, values, errors } (Req 19.1, 19.2, 19.6, 19.7)
     Validates each present field INDEPENDENTLY so valid fields can be
     applied even when sibling fields are rejected (the partial-update
     contract behind Req 19.4/19.6). Only keys actually present on
     `input` are considered. `values` collects every accepted field
     (sanitized) and `errors` maps each rejected field to a human-readable
     message naming its valid range. `ok` is true when no field errored.
       - name              : coerced to string, clamped to 100 chars (never errors)
       - testDate          : must satisfy isValidFutureDate(_, today)
       - targetScore       : integer 472–528 (via validateTarget)
       - diagnosticScore   : integer 472–528, OR explicit unset (null/""/undefined -> null)
       - weeklyAvailability: integer 0–168
       - preferredResources: coerced to string, clamped to 1000 chars (never errors)
       - studyPhase        : exactly one of STUDY_PHASES
   ============================================================ */
const STUDY_PHASES = ["content review", "practice-heavy", "AAMC phase", "final review"];

function isValidFutureDate(s, today) {
  if (!isValidISODate(s)) return false;
  if (!isValidISODate(today)) return false;
  // Both are validated "YYYY-MM-DD" strings: lexical >= is chronological >=.
  return s >= today;
}

function validateSettings(input, today) {
  const inp = isPlainObject(input) ? input : {};
  const values = {};
  const errors = {};

  // name (19.1): text, max 100 chars — clamp, never rejected.
  if ("name" in inp) {
    values.name = clampText(inp.name, 100);
  }

  // testDate (19.7): valid calendar date, not earlier than today.
  if ("testDate" in inp) {
    if (isValidFutureDate(inp.testDate, today)) {
      values.testDate = inp.testDate;
    } else {
      errors.testDate = "Test date must be a valid calendar date on or after today.";
    }
  }

  // targetScore (19.6): integer 472–528.
  if ("targetScore" in inp) {
    const r = validateTarget(inp.targetScore);
    if (r.ok) values.targetScore = r.value;
    else errors.targetScore = "Target score must be an integer from 472 to 528.";
  }

  // diagnosticScore (19.1, 19.6): integer 472–528, or explicit unset (null).
  if ("diagnosticScore" in inp) {
    const d = inp.diagnosticScore;
    if (d === null || d === undefined || (typeof d === "string" && d.trim() === "")) {
      values.diagnosticScore = null;
    } else {
      const r = validateTarget(d);
      if (r.ok) values.diagnosticScore = r.value;
      else errors.diagnosticScore = "Diagnostic score must be an integer from 472 to 528.";
    }
  }

  // weeklyAvailability (19.1): integer hours 0–168.
  if ("weeklyAvailability" in inp) {
    const w = inp.weeklyAvailability;
    const candidate = (typeof w === "number" || (typeof w === "string" && w.trim() !== ""))
      ? Number(w)
      : NaN;
    if (Number.isInteger(candidate) && candidate >= 0 && candidate <= 168) {
      values.weeklyAvailability = candidate;
    } else {
      errors.weeklyAvailability = "Weekly availability must be an integer from 0 to 168 hours.";
    }
  }

  // preferredResources (19.1): text, max 1000 chars — clamp, never rejected.
  if ("preferredResources" in inp) {
    values.preferredResources = clampText(inp.preferredResources, 1000);
  }

  // studyPhase (19.2): exactly one of the four allowed values.
  if ("studyPhase" in inp) {
    if (typeof inp.studyPhase === "string" && STUDY_PHASES.includes(inp.studyPhase)) {
      values.studyPhase = inp.studyPhase;
    } else {
      errors.studyPhase = "Study phase must be one of: " + STUDY_PHASES.join(", ") + ".";
    }
  }

  return { ok: Object.keys(errors).length === 0, values, errors };
}

MCAT.STUDY_PHASES = STUDY_PHASES;
MCAT.isValidFutureDate = isValidFutureDate;
MCAT.validateSettings = validateSettings;

/* ---- dual-environment export shim ----
   Browser: no `module`, so this block is skipped and MCAT stays global.
   Node:    exports MCAT for the test harness via require(). */
if (typeof module !== "undefined" && module.exports) {
  module.exports = MCAT;
}
