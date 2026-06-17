# Implementation Plan: MCAT Command Center Expansion

## Overview

This plan converts the design into incremental coding steps for the existing static, dependency-free vanilla JS/HTML/CSS single-page app. Work proceeds in two layers:

- **Pure layer** — validation, aggregation, migration, spaced-repetition math, markdown, weekly bucketing, and SVG helpers, extracted into a new `core.js` and attached to a global `MCAT` namespace with a dual-environment export shim (browser `<script>` + Node `require`).
- **Render/handler layer** — `render*()` functions and form/event handlers in `app.js` that read inputs, call the pure layer, mutate the global `state`, call `save()`, and write DOM.

Tests are a **dev-only** concern (a `tests/` folder with its own `package.json`, fast-check, and Node's built-in `node:test` runner). They are NEVER shipped with the three-file app artifact (`index.html`, `app.js`, `styles.css`, plus `core.js` and `Resources/`).

Task conventions:
- Sub-tasks marked with `*` are optional tests and can be skipped for a faster MVP.
- **[PURE]** sub-tasks implement DOM-free logic in `core.js` and receive full property-based tests (fast-check, ≥100 runs, tagged `// Feature: mcat-tracker-expansion, Property N: ...`).
- **[DOM]** sub-tasks wire markup/handlers/styles and are verified only by smoke/jsdom example tests, never property tests.
- Modules are ordered by the design's "Build First" priority, then remaining modules, then navigation wiring and a final regression pass.

## Tasks

- [x] 1. Set up pure-layer boundary and dev-only test harness
  - [x] 1.1 Create `core.js` with the `MCAT` namespace and dual-environment export shim
    - Create `core.js`; declare `const MCAT = {}` and the shared constants (`STORE_KEY`, `REVIEW_INTERVALS = [1,3,7,21]`)
    - Add the bottom-of-file shim: `if (typeof module !== "undefined" && module.exports) { module.exports = MCAT; }`
    - Add `<script src="core.js"></script>` BEFORE `<script src="app.js"></script>` in `index.html`
    - Move `uid()`, `todayStr()`, `escapeHtml()` into `core.js` on `MCAT` while keeping browser-global access for `app.js`
    - _Requirements: design "Two-layer module structure", design "Testing Strategy" dual-environment shim_
  - [x] 1.2 Stand up the dev-only test harness (not shipped with the app)
    - Create `tests/package.json` declaring `fast-check` as a devDependency and Node ≥18
    - Create `tests/README.md` documenting the single-shot command `node --test tests/` and the Node ≥18 requirement
    - Create `tests/helpers.js` exporting shared fast-check arbitraries scaffold (`arbPracticeSet`, `arbState`, etc., filled in as modules land) requiring `../core.js`
    - Add a trivial smoke test `tests/smoke.test.js` that requires `../core.js` and asserts `MCAT` is an object, to confirm the harness runs
    - _Requirements: design "Testing Strategy" constraints/approach, test execution_

- [x] 2. Data model and migration foundation
  - [x] 2.1 [PURE] Extend `defaultState` with all new module keys and documented defaults
    - In `core.js`, add `schemaVersion`, `practiceSets`, `contentStatuses`, `customContentTopics`, `carsPassages`, `reviewItems`, `resourceTracker`, `formulas`, `notes`, `goals`, `dailyLog`, `readiness` (10 predefined items), `reminderDismissals`, `settings` with exact defaults from the Data Models section
    - Keep all existing keys unchanged; export `defaultState` on `MCAT`
    - _Requirements: 1.1, design "Extended defaultState"_
  - [x] 2.2 [PURE] Implement `migrate()`, `applyDefaults()`, and `mergeReadiness()`
    - `applyDefaults(target, defaults)` adds absent keys only; existing values win; idempotent
    - `mergeReadiness()` keeps existing checked states and adds any missing predefined items
    - `migrate()` adds missing top-level keys, deep-merges `goals`/`settings`/`readiness`, back-fills new fields on existing `wrong` and `scores` records, bridges legacy `target` → `goals.targetScore`, and sets `schemaVersion`
    - _Requirements: 1.2, 1.3, 1.4, 6.3, 7.5_
  - [x] 2.3 [PURE/DOM] Harden `load()`/`parseBackup()` and wrap `save()` for write failures
    - `parseBackup(text)` returns `{ok:true,value}` only for valid JSON plain objects, else `{ok:false,reason}`; never throws
    - `load()` wraps `JSON.parse` in try/catch, returns a deep clone of `defaultState` on failure, sets `__loadFailed`, and does not overwrite the stored value; calls `migrate()` after the shallow merge
    - Wrap `save()` in try/catch; on failure leave in-memory `state` unchanged and show a non-blocking error banner (`showSaveError`)
    - _Requirements: 1.5, 1.6, 1.7, 2.5_
  - [x] 2.4 [PURE] Property test: migration idempotence and default preservation
    - **Property 1: State migration is idempotent and default-preserving**
    - **Validates: Requirements 1.2, 1.3, 1.4, 2.4, 6.3, 7.5**
  - [x] 2.5 [PURE] Property test: backup export/import round-trip
    - **Property 2: Backup export/import round-trip**
    - **Validates: Requirements 2.1, 2.2, 2.3**
  - [x] 2.6 [PURE] Property test: corrupt/non-object input rejected safely
    - **Property 3: Corrupt or non-object input is rejected safely**
    - **Validates: Requirements 1.6, 2.5**
  - [x] 2.7 [DOM] Unit tests for storage/import error paths and confirm/cancel
    - Corrupt `localStorage` → defaults with no throw; `setItem` throwing → state retained + error surfaced; import confirm/cancel branches
    - _Requirements: 1.6, 1.7, 2.6, 2.7_

- [x] 3. Shared pure helpers, SVG chart helpers, and markdown
  - [x] 3.1 [PURE] Implement core accuracy helpers
    - `percentCorrect(correct, attempted)` (round-half-up, integer 0–100)
    - `computeGroupAccuracy(sets)` (returns `null` when Σattempted===0, else 0–100 at configured precision)
    - `accuracyByTopic`, `accuracyBySection`, `timedVsUntimed`, `accuracyOverTime` (chronological, one point per set)
    - _Requirements: 3.3, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_
  - [x] 3.2 [PURE] Implement bucketing, totals, and rounding helpers
    - `weeklyBucketKey(dateStr)` (Monday of ISO week), `weeklyVolume(sets)`, `weeklyHours(sessions)` (ascending, total-preserving)
    - `scoreTotal(record)` (sum of four sections, 472–528) and a shared round-to-N-decimals helper
    - _Requirements: 7.2, 8.3, 8.4_
  - [x] 3.3 [DOM] Build the shared SVG chart helper set
    - In `app.js`, add `svgLine`, `svgText`, `svgRect`, `svgPath` helpers using `document.createElementNS`, mirroring the existing `drawChart()` idiom
    - Provide a reusable line-chart and bar-chart drawing routine consumed by practice, analytics, and full-length trend charts
    - _Requirements: 4.1, design "Components and Interfaces" graphs_
  - [x] 3.4 [PURE] Implement XSS-safe `renderMarkdown` and `validateTarget`
    - `renderMarkdown(body)`: escape entire input first, then apply transforms (h1–h3, bold, italic, ordered/unordered lists, links with `http/https/relative` href sanitization neutralizing `javascript:`/`data:`, inline code)
    - `searchNotes`/`searchFormulas` substring helper and `validateTarget(n)` (integer 472–528)
    - _Requirements: 14.2, 14.6, 14.8, 15.7, 19.6_
  - [x] 3.5 [PURE] Property tests: percent-correct and grouped accuracy
    - **Property 4: Percent-correct computation is bounded and correct** — **Validates: Requirements 3.3**
    - **Property 6: Group accuracy is bounded and omits empty groups** — **Validates: Requirements 4.5, 4.6, 8.1, 8.2, 9.1, 10.3, 10.4**
    - **Property 7: Grouped accuracy emits one value per distinct non-empty key** — **Validates: Requirements 4.2, 4.3, 4.4**
    - **Property 8: Accuracy-over-time is chronological and bounded** — **Validates: Requirements 4.1, 3.8**
  - [x] 3.6 [PURE] Property tests: totals and weekly bucketing
    - **Property 13: Total score equals the sum of sections and stays in range** — **Validates: Requirements 7.2**
    - **Property 16: Weekly bucketing is total-preserving and Monday-aligned** — **Validates: Requirements 8.3, 8.4**
  - [x] 3.7 [PURE] Property tests: markdown and target validation
    - **Property 34: Markdown body is preserved verbatim** — **Validates: Requirements 14.6**
    - **Property 35: Markdown rendering is XSS-safe** — **Validates: Requirements 14.8**
    - **Property 36: Target-score validation is exact** — **Validates: Requirements 15.7, 19.6**

- [ ] 4. Checkpoint — foundation
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Practice Question Tracker and accuracy graphs (Req 3, 4)
  - [x] 5.1 [PURE] Implement `validatePracticeSet` and practice aggregations
    - Validate section ∈ {C/P,CARS,B/B,P/S}, attempted int 1–9999, correct int 0–attempted, trimmed/length-capped text
    - Reuse `accuracyByTopic`/`accuracyBySection`/`timedVsUntimed`/`accuracyOverTime` from task 3.1
    - _Requirements: 3.1, 3.2, 3.4, 3.5, 3.6_
  - [x]* 5.2 [PURE] Property test: practice set validation
    - **Property 5: PracticeSet validation accepts exactly valid inputs**
    - **Validates: Requirements 3.1, 3.4, 3.5, 3.6**
  - [x] 5.3 [DOM] Add Practice Questions view markup and nav entry
    - Add `<button class="nav-btn" data-view="practice">` and `<section class="view" id="view-practice">` with entry form, list table, and four chart containers (over-time, by-topic, by-section, timed-vs-untimed)
    - _Requirements: 3.8, 20.1_
  - [x] 5.4 [DOM] Implement `renderPractice` and form/delete handlers in `app.js`
    - Submit handler calls `validatePracticeSet`, stores on success, shows field error on failure; delete removes the set; list ordered newest→oldest showing percent-correct via `percentCorrect`
    - Draw the four charts via the SVG helpers; show per-chart empty-state when no data (immediately on load)
    - _Requirements: 3.7, 3.8, 4.1, 4.2, 4.3, 4.4, 4.7_
  - [x] 5.5 [DOM] Add Practice Questions styles in `styles.css`
    - Reuse existing CSS custom properties (`html[data-theme]`); style form, list table, chart panels, empty states
    - _Requirements: 4.7_
  - [ ]* 5.6 [DOM] Unit tests for practice delete and list ordering
    - _Requirements: 3.7, 3.8_

- [x] 6. Error Log enhancements (Req 6)
  - [x] 6.1 [PURE] Implement `isValidISODate`, `categoryCounts`, and `clampText`
    - `isValidISODate` strict calendar validity (rejects 2024-02-30); `categoryCounts` returns all 9 categories + `unset` (zeros included); `clampText(s, max)` returns last-valid truncation
    - _Requirements: 6.1, 6.5, 6.6, 6.7_
  - [x]* 6.2 [PURE] Property tests: ISO date and category counts
    - **Property 11: ISO date validation is exact** — **Validates: Requirements 6.5**
    - **Property 12: Mistake-category counts are complete and total-preserving** — **Validates: Requirements 6.1, 6.7**
  - [x] 6.3 [DOM] Extend Wrong Answers view markup for new fields
    - Add category `<select>` (9 categories + unset), explanation/takeaway textareas (`maxlength="2000"`), needs-review checkbox, and retest `<input type="date">`; add a category-count summary panel
    - _Requirements: 6.1, 6.2, 6.7_
  - [x] 6.4 [DOM] Update `renderWrong` and handlers in `app.js`
    - Save retest date on `change` via `isValidISODate` (reject invalid, retain prior); enforce 2000-char cap with `clampText`; render category counts; preserve existing repeat-detection and open/resolved behavior; show "unset" for legacy entries
    - _Requirements: 6.3, 6.4, 6.5, 6.6, 6.8_
  - [x] 6.5 [DOM] Add Error Log enhancement styles in `styles.css`
    - _Requirements: 6.7_

- [x] 7. Full-Length Exam Tracker enhancements (Req 7)
  - [x] 7.1 [PURE] Implement `validateSections` and `sectionTrendSeries`
    - `validateSections` reports EVERY section outside 118–132 independently; `sectionTrendSeries` returns four date-ordered series tolerant of missing/incomplete new fields; reuse `scoreTotal`
    - _Requirements: 7.1, 7.2, 7.7, 7.8_
  - [x]* 7.2 [PURE] Property tests: section validation and trend series
    - **Property 14: Section validation reports every invalid section independently** — **Validates: Requirements 7.8**
    - **Property 15: Per-section trend is ordered and tolerant of incomplete data** — **Validates: Requirements 7.7**
  - [x] 7.3 [DOM] Extend Test Scores view markup for new fields and section-trend charts
    - Add percentiles, time taken, testing-conditions checkboxes, review-status toggle, lessons textarea (`maxlength="2000"`); add four small-multiple section-trend chart containers
    - _Requirements: 7.1, 7.3, 7.4_
  - [x] 7.4 [DOM] Update `renderScores`/`drawChart` and add `drawSectionTrends` in `app.js`
    - On submit, validate sections (report each invalid independently, retain prior values); compute/display total; back-fill new fields as "unset" for legacy records; preserve total-score chart using `goals.targetScore` as the target line; draw per-section trends with empty-state when none
    - _Requirements: 7.2, 7.5, 7.6, 7.7, 7.8, 7.9_
  - [x] 7.5 [DOM] Add full-length enhancement styles in `styles.css`
    - _Requirements: 7.9_

- [x] 8. Analytics page (Req 8)
  - [x] 8.1 [PURE] Implement analytics aggregations
    - `weaknessRanking` (ascending pct, ties by greater attempted), `mistakeFrequency` (descending count, ties alphabetical), `predictedScoreRange` (null when <2 records, else sd-band clamped 472–528 with low≤high); reuse `weeklyVolume`/`weeklyHours` and whole-number `computeGroupAccuracy`
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.9_
  - [x]* 8.2 [PURE] Property tests: ranking, frequency, chronology, prediction
    - **Property 17: Weakness ranking ordering with tie-break** — **Validates: Requirements 8.5**
    - **Property 18: Mistake-frequency ordering with tie-break** — **Validates: Requirements 8.6**
    - **Property 19: Full-length totals are chronological** — **Validates: Requirements 8.7**
    - **Property 20: Predicted score range is bounded and well-ordered** — **Validates: Requirements 8.9**
  - [x] 8.3 [DOM] Add Analytics view markup and nav entry
    - Add nav entry + `<section id="view-analytics">` with containers for by-section, by-topic, weekly volume, weekly hours, weakness ranking, mistake frequency, total-score series, and predicted range
    - _Requirements: 8.8, 20.1_
  - [x] 8.4 [DOM] Implement `renderAnalytics` in `app.js`
    - Render each metric via SVG/list helpers with an independent per-metric empty-state so a missing metric never blanks a populated one
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9_
  - [x] 8.5 [DOM] Add Analytics styles in `styles.css`
    - _Requirements: 8.8_

- [x] 9. Content Review Tracker (Req 5)
  - [x] 9.1 [PURE] Implement `buildSubjectTree`, `statusCounts`, `validateCustomTopic`
    - Predefined tree from blueprint §3 merged with custom topics; `statusCounts` returns all five statuses (zeros included, unkeyed = "not started", total-preserving); `validateCustomTopic` rejects empty/whitespace-only/>100/case-insensitive duplicate within section
    - _Requirements: 5.1, 5.2, 5.4, 5.5, 5.6, 5.7_
  - [x]* 9.2 [PURE] Property tests: status counts and custom-topic validation
    - **Property 9: Content status counts are total-preserving and complete** — **Validates: Requirements 5.2, 5.4, 5.5**
    - **Property 10: Custom content topic validation** — **Validates: Requirements 5.6, 5.7**
  - [x] 9.3 [DOM] Add Content Tracker view markup and nav entry
    - Nav entry + `<section id="view-content">` with the subject tree, per-topic status `<select>`, status-count summary, and add-custom-topic form
    - _Requirements: 5.1, 20.1_
  - [x] 9.4 [DOM] Implement `renderContent` and handlers in `app.js`
    - Status change persists under key `"{section}::{label}"` and refreshes counts; add-custom-topic uses `validateCustomTopic` (reject + reason, default status "not started"); unkeyed topics show "not started"
    - _Requirements: 5.3, 5.4, 5.5, 5.6, 5.7_
  - [x] 9.5 [DOM] Add Content Tracker styles in `styles.css`
    - _Requirements: 5.1_
  - [ ]* 9.6 [DOM] Smoke test: subject tree renders the four sections and groupings
    - _Requirements: 5.1_

- [ ] 10. Dashboard enhancements (Req 9)
  - [ ] 10.1 [PURE] Implement dashboard preview and goal-progress helpers
    - Dashboard lowest-accuracy preview = first `min(3, distinct topics)` of `weaknessRanking`; `weeklyHourProgress(sessions, goalHours, today)` and `dailyQuestionProgress(practiceSets, goalQ, today)`; reuse `dueCount` (from task 13.1) for due review count
    - _Requirements: 9.1, 9.2, 9.4_
  - [ ]* 10.2 [PURE] Property tests: weakness preview and goal progress
    - **Property 21: Dashboard weakness preview is a bounded prefix of the ranking** — **Validates: Requirements 9.2**
    - **Property 22: Goal progress percentages are correct** — **Validates: Requirements 9.4, 15.2, 15.3**
  - [ ] 10.3 [DOM] Add new dashboard metric cards to the dashboard view markup
    - Add cards for average practice accuracy, three lowest-accuracy topics, due review count, and weekly-hour goal progress
    - _Requirements: 9.1, 9.2, 9.3, 9.4_
  - [ ] 10.4 [DOM] Extend `renderDashboard` in `app.js`
    - Populate the new metrics; render an independent per-metric empty-state so a missing metric never blanks a populated one; preserve countdown, heatmap, streak, priority tasks, and repeat-misses panels
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_
  - [ ] 10.5 [DOM] Add dashboard enhancement styles in `styles.css`
    - _Requirements: 9.6_

- [ ] 11. Checkpoint — high-priority modules
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 12. CARS Practice Tracker (Req 10)
  - [x] 12.1 [PURE] Implement `validateCarsEntry`, `avgMinutesPerPassage`, `accuracyByQuestionType`
    - Validate date ≤ today, accuracy 0–100, time (0,600], passages int 1–99, difficulty/question-types within allowed sets; aggregates 1-dp; types with no entries omitted
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_
  - [x]* 12.2 [PURE] Property test: CARS entry validation
    - **Property 23: CARS entry validation accepts exactly valid inputs**
    - **Validates: Requirements 10.1, 10.5, 10.6**
  - [x] 12.3 [DOM] Add CARS Tracker view markup and nav entry
    - Nav entry + `<section id="view-cars">` with entry form, entry list, avg-minutes display, and accuracy-by-question-type display
    - _Requirements: 10.2, 20.1_
  - [ ] 12.4 [DOM] Implement `renderCars` and handlers in `app.js`
    - Validate on submit (reject + message, state unchanged); list within 1s; show empty-state hiding aggregates when no entries
    - _Requirements: 10.1, 10.3, 10.4, 10.5, 10.6, 10.7_
  - [x] 12.5 [DOM] Add CARS Tracker styles in `styles.css`
    - _Requirements: 10.7_

- [ ] 13. Review and Spaced-Repetition Tracker (Req 11)
  - [x] 13.1 [PURE] Implement spaced-repetition math
    - `nextInterval`, `markReviewed`, `markMissed`, `reviewState`, `dueCount`, `retentionRate` ("N/A" on zero denominator), `topicsByRetention` (ascending, ties alphabetical) using `REVIEW_INTERVALS=[1,3,7,21]`
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8, 11.9, 11.10_
  - [x]* 13.2 [PURE] Property tests: interval progression, missed reset, state/due, retention, ordering
    - **Property 24: Spaced-repetition interval progression** — **Validates: Requirements 11.4, 11.5**
    - **Property 25: Marking missed resets the interval** — **Validates: Requirements 11.6**
    - **Property 26: Review state classification and due count** — **Validates: Requirements 11.2, 11.3, 11.7, 9.3**
    - **Property 27: Retention rate handles the zero denominator** — **Validates: Requirements 11.8, 11.9**
    - **Property 28: Topics ordered by ascending retention with tie-break** — **Validates: Requirements 11.10**
  - [x] 13.3 [DOM] Add Review view markup and nav entry
    - Nav entry + `<section id="view-review">` with add-item form, item list with reviewed/missed buttons, due count, and retention/topics display
    - _Requirements: 11.1, 20.1_
  - [ ] 13.4 [DOM] Implement `renderReview` and handlers in `app.js`
    - Create item (state "new"); reviewed/missed buttons call pure helpers and persist; derive `reviewState`/`dueCount` per current date; show retention rate and topics-by-retention
    - _Requirements: 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8, 11.9, 11.10_
  - [ ] 13.5 [DOM] Add Review styles in `styles.css`
    - _Requirements: 11.1_

- [ ] 14. Resource Tracker enhancements (Req 12)
  - [x] 14.1 [PURE] Implement `validateResourceCounts`, `completionPct`, `sortByPriority`
    - Integers ≥0 with completed≤total; `completionPct` returns "0%" when total===0 (no division) else 1-dp "x.x%"; `sortByPriority` high→low (errors surfaced, no fallback)
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.7, 12.8_
  - [ ]* 14.2 [PURE] Property tests: completion percentage, count validation, priority sort
    - **Property 29: Resource completion percentage handles the zero denominator** — **Validates: Requirements 12.2, 12.3**
    - **Property 30: Resource count validation** — **Validates: Requirements 12.4, 12.5**
    - **Property 31: Priority sort ordering** — **Validates: Requirements 12.7**
  - [ ] 14.3 [DOM] Extend Resources view markup with the editable tracker
    - Add a tracker list/form (name, type, totals, completed, accuracy, priority, notes) and an order-by-priority control ABOVE/BELOW the existing static resource links, leaving those links untouched
    - _Requirements: 12.1, 12.6_
  - [ ] 14.4 [DOM] Implement `renderResources` tracker logic and handlers in `app.js`
    - Validate counts on entry (reject + retain prior); display `completionPct`; priority sorting via `sortByPriority` (error + unchanged view on failure); preserve existing static links exactly
    - _Requirements: 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8_
  - [ ] 14.5 [DOM] Add Resource Tracker styles in `styles.css`
    - _Requirements: 12.1_

- [ ] 15. Formula and Equation Sheet (Req 13)
  - [x] 15.1 [PURE] Implement `searchFormulas` and `filterByTags`; seed formulas
    - Case-insensitive substring on name|expression|any tag; `filterByTags` returns entries with ≥1 selected tag; one-time seed of `formulas` from blueprint §11
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.9_
  - [ ]* 15.2 [PURE] Property tests: search filter and tag filter
    - **Property 32: Formula and note search is a correct case-insensitive substring filter** — **Validates: Requirements 13.2, 13.4, 14.3**
    - **Property 33: Tag filter returns entries with at least one selected tag** — **Validates: Requirements 13.9**
  - [ ] 15.3 [DOM] Add Formulas view markup and nav entry
    - Nav entry + `<section id="view-formulas">` with search box, tag-filter chips, entry list, per-entry memorized toggle, and practice-recall reveal control
    - _Requirements: 13.1, 20.1_
  - [ ] 15.4 [DOM] Implement `renderFormulas` and handlers in `app.js`
    - Search/tag filtering via pure helpers; no-match message; clear-term restores all (or active tag filter); memorized toggle persists; practice-recall hides expression and reveal un-hides
    - _Requirements: 13.2, 13.3, 13.4, 13.5, 13.6, 13.7, 13.8, 13.9_
  - [ ] 15.5 [DOM] Add Formula sheet styles in `styles.css`
    - _Requirements: 13.1_

- [ ] 16. High-Yield Notes (Req 14)
  - [x] 16.1 [PURE] Implement `searchNotes` and linked-error existence check
    - Case-insensitive substring on title|body|any tag; helper to check whether a linked error id still exists in `state.wrong`; reuse `renderMarkdown` from task 3.4
    - _Requirements: 14.1, 14.3, 14.9_
  - [ ] 16.2 [DOM] Add Notes view markup and nav entry
    - Nav entry + `<section id="view-notes">` with note editor (title, body textarea `maxlength="50000"`, tags, needs-review), search box, note list, and rendered-markdown preview area
    - _Requirements: 14.1, 14.2, 20.1_
  - [ ] 16.3 [DOM] Implement `renderNotes` and handlers in `app.js`
    - Store raw markdown verbatim; render via `renderMarkdown` at display time; search with empty-state; link to error-log entries with existence check ("linked entry unavailable", suppress navigation); persist needs-review
    - _Requirements: 14.4, 14.5, 14.6, 14.7, 14.8, 14.9_
  - [ ] 16.4 [DOM] Add Notes styles in `styles.css`
    - _Requirements: 14.7_
  - [ ]* 16.5 [DOM] Unit tests: each markdown construct renders; targeted XSS examples
    - Headings, bold, italic, ordered/unordered lists, links, inline code; complement Property 35
    - _Requirements: 14.2_

- [ ] 17. Goals and Milestones (Req 15)
  - [ ] 17.1 [PURE] Implement goal-progress helpers and milestone validation
    - Reuse `validateTarget` (task 3.4), `weeklyHourProgress`, `dailyQuestionProgress` (task 10.1); completed full-length count; milestone list capped at 100
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.7_
  - [ ] 17.2 [DOM] Add Goals view markup and nav entry
    - Nav entry + `<section id="view-goals">` with target/weekly-hour/daily-question inputs, progress displays, completed-FL count, and milestone checklist
    - _Requirements: 15.1, 20.1_
  - [ ] 17.3 [DOM] Implement `renderGoals` and handlers in `app.js`
    - Validate target via `validateTarget` (reject + retain prior); `goals.targetScore` is the single source of truth for Dashboard and FL chart; milestone done-state persists across reloads
    - _Requirements: 15.2, 15.3, 15.4, 15.5, 15.6, 15.7_
  - [ ] 17.4 [DOM] Add Goals styles in `styles.css`
    - _Requirements: 15.1_

- [ ] 18. Daily Study Log (Req 16)
  - [x] 18.1 [PURE] Implement `validateDailyLog` and `upsertDailyLog`
    - Validate date + numeric ranges (hours 0–24 ≤1dp, questions 0–9999, accuracy 0–100, energy/confidence 1–5, reflection ≤2000); `upsertDailyLog` replaces same-date entry else appends
    - _Requirements: 16.1, 16.2, 16.3_
  - [ ]* 18.2 [PURE] Property tests: upsert uniqueness, ordering, validation
    - **Property 38: Daily-log upsert keeps at most one entry per date** — **Validates: Requirements 16.2**
    - **Property 39: Daily-log entries are ordered most-recent-first** — **Validates: Requirements 16.5**
    - **Property 40: Daily-log validation** — **Validates: Requirements 16.3**
  - [ ] 18.3 [DOM] Add Daily Log view markup and nav entry
    - Nav entry + `<section id="view-dailylog">` with entry form, the four reflection prompts, and the always-visible entry display area
    - _Requirements: 16.1, 16.4, 20.1_
  - [ ] 18.4 [DOM] Implement `renderDailyLog` and handlers in `app.js`
    - Validate + upsert on submit (reject + reason, retain existing date entry); display newest-first; keep display area visible with empty-state when none
    - _Requirements: 16.2, 16.3, 16.5, 16.6_
  - [ ] 18.5 [DOM] Add Daily Log styles in `styles.css`
    - _Requirements: 16.6_

- [ ] 19. Test-Day Readiness Checklist (Req 17)
  - [x] 19.1 [PURE] Implement `validateChecklistItem` and `completedCount`
    - Accept 1–100 chars (whitespace-only ALLOWED) while custom count <50; reject zero-length/>100/at-50-cap; `completedCount` counts checked predefined + custom
    - _Requirements: 17.3, 17.4, 17.5_
  - [ ]* 19.2 [PURE] Property tests: completed count and custom-item validation
    - **Property 41: Readiness completed count** — **Validates: Requirements 17.3**
    - **Property 42: Custom checklist item validation (whitespace allowed)** — **Validates: Requirements 17.4, 17.5**
  - [ ] 19.3 [DOM] Add Readiness Checklist view markup and nav entry
    - Nav entry + `<section id="view-readiness">` rendering the 10 predefined items, custom-item form, and completed-count display
    - _Requirements: 17.1, 20.1_
  - [ ] 19.4 [DOM] Implement `renderReadiness` and handlers in `app.js`
    - Check/uncheck persists across reloads; add-custom via `validateChecklistItem` (reject + reason); update completed count on change
    - _Requirements: 17.2, 17.3, 17.4, 17.5_
  - [ ] 19.5 [DOM] Add Readiness styles in `styles.css`
    - _Requirements: 17.1_

- [ ] 20. In-App Reminders (Req 18)
  - [x] 20.1 [PURE] Implement `computeReminders` and `isDismissedToday`
    - `computeReminders(state, today)` returns test-date countdown, each due Review_Item, each full-length event dated today, each Error_Log entry with retest date ≤ today; `isDismissedToday` checks `reminderDismissals[key]===today`; no network access
    - _Requirements: 18.1, 18.4, 18.5_
  - [ ]* 20.2 [PURE] Property tests: reminder computation and day-scoped dismissal
    - **Property 43: Reminder computation matches qualifying data** — **Validates: Requirements 18.1**
    - **Property 44: Reminder dismissal is scoped to the calendar day** — **Validates: Requirements 18.4**
  - [ ] 20.3 [DOM] Add the persistent reminder bar markup
    - Add `<div id="reminderBar">` inside `.main` before the views so it shows on every view
    - _Requirements: 18.2_
  - [ ] 20.4 [DOM] Implement `renderReminders` and dismissal handlers in `app.js`
    - Recompute on load and after changes to test date, review items, events, or retest dates; filter dismissed-today; hide bar when none; persist dismissal for the day across reloads
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5_
  - [ ] 20.5 [DOM] Add reminder bar styles in `styles.css`
    - _Requirements: 18.2_

- [ ] 21. User Settings and Profile (Req 19)
  - [x] 21.1 [PURE] Implement `isValidFutureDate` and settings field validation
    - `isValidFutureDate(s, today)` (valid calendar date not earlier than today); reuse `validateTarget` for target and diagnostic; constrain study phase to the four allowed values
    - _Requirements: 19.1, 19.2, 19.6, 19.7_
  - [ ]* 21.2 [PURE] Property test: future-date validation
    - **Property 37: Future-date validation for settings test date**
    - **Validates: Requirements 19.7**
  - [ ] 21.3 [DOM] Add Settings view markup and nav entry
    - Nav entry + `<section id="view-settings">` with name, test date, target, diagnostic, weekly availability, preferred resources, study-phase select; reference existing theme/export/import controls
    - _Requirements: 19.1, 19.2, 19.5, 20.1_
  - [ ] 21.4 [DOM] Implement `renderSettings` and handlers in `app.js`
    - Validate target/diagnostic independently (reject only invalid field, retain prior, accept valid normally); validate test date via `isValidFutureDate`; mirror `settings.testDate`→`state.testDate` (updates countdown) and `settings.targetScore`→`goals.targetScore` with independent partial-update re-renders of Goals and FL chart; persist all fields
    - _Requirements: 19.3, 19.4, 19.6, 19.7, 19.8_
  - [ ] 21.5 [DOM] Add Settings styles in `styles.css`
    - _Requirements: 19.1_

- [ ] 22. Navigation integration (Req 20)
  - [ ] 22.1 [DOM] Introduce the `VIEW_RENDERERS` dispatch map and update the nav handler
    - Replace the growing `if` ladder with `VIEW_RENDERERS` mapping each view id to its renderer; call `(VIEW_RENDERERS[view] || (()=>{}))()` before the view becomes visible; ensure exactly one active nav entry and one visible view; preserve existing views' behavior
    - _Requirements: 20.2, 20.3, 20.4, 20.5, 20.6, 20.7_
  - [ ]* 22.2 [DOM] Property/smoke test: navigation invariant
    - **Property 45: Navigation maintains exactly one active entry and one visible view**
    - **Validates: Requirements 20.2, 20.3, 20.4**
  - [ ]* 22.3 [DOM] Smoke tests: all ten new nav entries/views exist and recompute on select
    - _Requirements: 20.1, 20.5, 20.7_

- [ ] 23. Final integration and regression checkpoint
  - [ ] 23.1 [DOM] Wire initial paint and verify no-`fetch`/`XMLHttpRequest` usage
    - Ensure all new `render*()` run on load via the migrated state; add a dev assertion/code-review check that no network APIs are used (Req 18.5)
    - _Requirements: 18.5, 20.5_
  - [ ] 23.2 Checkpoint — Ensure all tests pass, ask the user if questions arise.
    - Run `node --test tests/`; confirm all property and example tests pass and the app still loads cleanly with legacy and fresh state

## Notes

- Tasks marked with `*` are optional tests and can be skipped for a faster MVP.
- **[PURE]** tasks live in `core.js`, are DOM-free, and are covered by fast-check property tests (≥100 runs each, tagged with their design Property number). **[DOM]** tasks wire markup/handlers/styles and are verified only by smoke/jsdom example tests.
- Each task references specific requirement sub-clauses and, where applicable, the design Correctness Property it validates (Properties 1–45) for traceability.
- The shipped artifact stays dependency-free (`index.html`, `app.js`, `styles.css`, `core.js`, `Resources/`). The `tests/` folder and its `package.json` are dev-only and never shipped.
- Tests run as the single-shot command `node --test tests/` (Node ≥18); no watch mode is configured.
- Checkpoints (tasks 4, 11, 23.2) provide incremental validation at the foundation, high-priority-module, and final-integration boundaries.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["2.2", "2.3"] },
    { "id": 3, "tasks": ["2.4", "2.5", "2.6", "2.7", "3.1", "3.4"] },
    { "id": 4, "tasks": ["3.2", "3.3", "3.5", "3.7"] },
    { "id": 5, "tasks": ["3.6", "5.1", "6.1", "7.1", "9.1", "12.1", "13.1", "14.1", "15.1", "16.1", "18.1", "19.1", "20.1", "21.1"] },
    { "id": 6, "tasks": ["5.2", "6.2", "7.2", "8.1", "9.2", "12.2", "13.2", "14.2", "15.2", "18.2", "19.2", "20.2", "21.2", "10.1", "17.1"] },
    { "id": 7, "tasks": ["5.3", "6.3", "7.3", "8.3", "9.3", "12.3", "13.3", "15.3", "16.2", "17.2", "18.3", "19.3", "20.3", "21.3", "8.2", "10.2"] },
    { "id": 8, "tasks": ["5.4", "6.4", "7.4", "8.4", "9.4", "12.4", "13.4", "14.3", "15.4", "16.3", "17.3", "18.4", "19.4", "20.4", "21.4", "10.3"] },
    { "id": 9, "tasks": ["5.5", "6.5", "7.5", "8.5", "9.5", "12.5", "13.5", "14.4", "15.5", "16.4", "17.4", "18.5", "19.5", "20.5", "21.5", "10.4"] },
    { "id": 10, "tasks": ["5.6", "9.6", "14.5", "16.5", "10.5", "22.1"] },
    { "id": 11, "tasks": ["22.2", "22.3", "23.1"] }
  ]
}
```
