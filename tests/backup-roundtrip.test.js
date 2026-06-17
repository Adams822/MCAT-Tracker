// Feature: mcat-tracker-expansion, Property 2: Backup export/import round-trip
"use strict";

// Self-contained property test for the backup export/import round-trip.
// Validates: Requirements 2.1, 2.2, 2.3
//
// Property 2: For any valid (already-migrated) State_Object, serializing it to
// JSON and then parsing-and-migrating that JSON produces a State_Object deeply
// equal to the original — no key added, removed, or changed in value.
//
// Dev-only: part of the test harness, never shipped with the app. This file is
// intentionally self-contained — it defines its own fast-check arbitraries and
// does NOT import tests/helpers.js.

const { test } = require("node:test");
const assert = require("node:assert");
const fc = require("fast-check");
const MCAT = require("../core.js");

const { migrate, parseBackup, defaultState } = MCAT;

// --- Inline arbitraries -----------------------------------------------------

const SECTIONS = ["C/P", "CARS", "B/B", "P/S"];
const MISTAKE_CATEGORIES = [
  "content gap", "misread question", "misread passage", "calculation error",
  "timing issue", "wrong reasoning", "trap answer", "did not know formula",
  "guessed", "unset"
];
const STUDY_PHASES = ["content review", "practice", "full lengths", "final review"];

// A valid "YYYY-MM-DD" calendar date string.
const arbISODate = fc
  .date({ min: new Date("2020-01-01"), max: new Date("2030-12-31") })
  .map((d) => d.toISOString().slice(0, 10));

const arbId = fc.integer({ min: 1, max: 1e12 });

// Build a JSON-safe object from key/value pairs, skipping prototype-polluting
// keys so the round-trip and deep-equality compare cleanly.
function arbSafeDict(valueArb) {
  return fc
    .array(fc.tuple(fc.string({ minLength: 1, maxLength: 12 }), valueArb), { maxLength: 8 })
    .map((pairs) => {
      const o = {};
      for (const [k, v] of pairs) {
        if (k === "__proto__") continue;
        o[k] = v;
      }
      return o;
    });
}

// PracticeSet — fully formed (migrate does not touch practiceSets).
const arbPracticeSet = fc
  .record({
    id: arbId,
    date: arbISODate,
    resource: fc.string({ maxLength: 100 }),
    section: fc.constantFrom(...SECTIONS),
    topic: fc.string({ maxLength: 100 }),
    attempted: fc.integer({ min: 1, max: 9999 }),
    timing: fc.constantFrom("timed", "untimed"),
    difficulty: fc.constantFrom("easy", "medium", "hard"),
    notes: fc.string({ maxLength: 500 }),
  })
  .chain((s) => fc.integer({ min: 0, max: s.attempted }).map((correct) => ({ ...s, correct })));

// Enhanced `wrong` entry — includes every field migrate() back-fills, so the
// record is already migration-stable.
const arbWrong = fc.record({
  id: arbId,
  date: arbISODate,
  source: fc.string({ maxLength: 100 }),
  topic: fc.string({ maxLength: 100 }),
  section: fc.constantFrom(...SECTIONS),
  why: fc.string({ maxLength: 200 }),
  count: fc.nat({ max: 50 }),
  status: fc.constantFrom("open", "resolved"),
  category: fc.constantFrom(...MISTAKE_CATEGORIES),
  explanation: fc.string({ maxLength: 200 }),
  takeaway: fc.string({ maxLength: 200 }),
  needsReview: fc.boolean(),
  retestDate: fc.oneof(fc.constant(""), arbISODate),
});

const arbPercentile = fc.oneof(fc.constant(null), fc.integer({ min: 0, max: 100 }));

// Enhanced full-length `scores` entry — includes every field migrate() back-fills.
const arbScore = fc.record({
  id: arbId,
  date: fc.oneof(fc.constant(""), arbISODate),
  name: fc.string({ maxLength: 100 }),
  cp: fc.integer({ min: 118, max: 132 }),
  cars: fc.integer({ min: 118, max: 132 }),
  bb: fc.integer({ min: 118, max: 132 }),
  ps: fc.integer({ min: 118, max: 132 }),
  percentiles: fc.record({
    cp: arbPercentile, cars: arbPercentile, bb: arbPercentile,
    ps: arbPercentile, total: arbPercentile,
  }),
  timeTaken: fc.oneof(fc.constant(null), fc.integer({ min: 1, max: 1440 })),
  conditions: fc.record({
    timed: fc.boolean(), singleSitting: fc.boolean(),
    withBreaks: fc.boolean(), realConditions: fc.boolean(),
  }),
  reviewStatus: fc.constantFrom("not reviewed", "reviewed"),
  lessons: fc.string({ maxLength: 200 }),
});

const arbCarsEntry = fc.record({
  id: arbId,
  date: arbISODate,
  passages: fc.integer({ min: 1, max: 99 }),
  accuracy: fc.integer({ min: 0, max: 100 }),
  timePerPassage: fc.integer({ min: 1, max: 600 }),
  difficulty: fc.constantFrom("easy", "medium", "hard"),
  questionTypes: fc.subarray([
    "main idea", "author's tone", "inference", "function", "detail",
    "new information/application",
  ]),
  notes: fc.string({ maxLength: 200 }),
});

const arbReviewItem = fc.record({
  id: arbId,
  topic: fc.string({ minLength: 1, maxLength: 100 }),
  content: fc.string({ minLength: 1, maxLength: 200 }),
  state: fc.constantFrom("new", "due", "reviewed", "mature", "missed"),
  intervalIndex: fc.integer({ min: -1, max: 3 }),
  nextDue: fc.oneof(fc.constant(""), arbISODate),
  reviewedMarks: fc.nat({ max: 100 }),
  missedMarks: fc.nat({ max: 100 }),
});

const arbResourceEntry = fc
  .record({
    id: arbId,
    name: fc.string({ minLength: 1, maxLength: 100 }),
    type: fc.string({ maxLength: 50 }),
    totalQuestions: fc.integer({ min: 0, max: 999999 }),
    accuracy: fc.integer({ min: 0, max: 100 }),
    priority: fc.constantFrom("high", "med", "low"),
    notes: fc.string({ maxLength: 200 }),
  })
  .chain((r) =>
    fc.integer({ min: 0, max: r.totalQuestions }).map((questionsCompleted) => ({
      ...r,
      questionsCompleted,
    }))
  );

const arbFormula = fc.record({
  id: arbId,
  name: fc.string({ minLength: 1, maxLength: 100 }),
  expression: fc.string({ minLength: 1, maxLength: 200 }),
  tags: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { maxLength: 5 }),
  memorized: fc.boolean(),
});

const arbNote = fc.record({
  id: arbId,
  title: fc.string({ minLength: 1, maxLength: 200 }),
  body: fc.string({ maxLength: 500 }),
  tags: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { maxLength: 5 }),
  needsReview: fc.boolean(),
  linkedErrors: fc.array(arbId, { maxLength: 5 }),
});

const arbDailyLog = fc.record({
  date: arbISODate,
  hours: fc.integer({ min: 0, max: 24 }),
  questions: fc.integer({ min: 0, max: 9999 }),
  accuracy: fc.integer({ min: 0, max: 100 }),
  subject: fc.string({ maxLength: 100 }),
  energy: fc.integer({ min: 1, max: 5 }),
  confidence: fc.integer({ min: 1, max: 5 }),
  reflection: fc.string({ maxLength: 200 }),
});

const arbGoals = fc.record({
  targetScore: fc.integer({ min: 472, max: 528 }),
  weeklyHourGoal: fc.nat({ max: 168 }),
  dailyQuestionGoal: fc.nat({ max: 9999 }),
  milestones: fc.array(
    fc.record({ id: arbId, text: fc.string({ maxLength: 100 }), done: fc.boolean() }),
    { maxLength: 5 }
  ),
});

const arbSettings = fc.record({
  name: fc.string({ maxLength: 100 }),
  testDate: fc.oneof(fc.constant(""), arbISODate),
  targetScore: fc.integer({ min: 472, max: 528 }),
  diagnosticScore: fc.oneof(fc.constant(null), fc.integer({ min: 472, max: 528 })),
  weeklyAvailability: fc.nat({ max: 168 }),
  preferredResources: fc.string({ maxLength: 200 }),
  studyPhase: fc.constantFrom(...STUDY_PHASES),
});

// Readiness — keep the 10 predefined items in their default order (so
// mergeReadiness is a no-op) with randomized checked states, plus random
// custom items.
const arbReadiness = fc
  .tuple(
    fc.array(fc.boolean(), { minLength: 10, maxLength: 10 }),
    fc.array(
      fc.record({
        id: arbId,
        label: fc.string({ minLength: 1, maxLength: 100 }),
        checked: fc.boolean(),
      }),
      { maxLength: 5 }
    )
  )
  .map(([checks, custom]) => ({
    predefined: defaultState.readiness.predefined.map((item, i) => ({
      key: item.key,
      label: item.label,
      checked: checks[i],
    })),
    custom,
  }));

// arbState — a valid, already-migrated whole-state object. Start from a deep
// clone of defaultState (so every key + documented default is present) and
// overlay randomized, fully-formed module data. Every overlaid record already
// carries the fields migrate() would otherwise back-fill, so the state is
// migration-stable and round-trip-stable.
const arbState = fc
  .record({
    testDate: fc.oneof(fc.constant(""), arbISODate),
    target: fc.integer({ min: 472, max: 528 }),
    theme: fc.constantFrom("dark", "light"),
    seeded: fc.boolean(),
    sessions: arbSafeDict(fc.integer({ min: 0, max: 1440 })),
    practiceSets: fc.array(arbPracticeSet, { maxLength: 8 }),
    contentStatuses: arbSafeDict(
      fc.constantFrom("not started", "in progress", "reviewed", "needs practice", "mastered")
    ),
    customContentTopics: fc.array(
      fc.record({ section: fc.constantFrom(...SECTIONS), label: fc.string({ minLength: 1, maxLength: 100 }) }),
      { maxLength: 5 }
    ),
    carsPassages: fc.array(arbCarsEntry, { maxLength: 8 }),
    reviewItems: fc.array(arbReviewItem, { maxLength: 8 }),
    resourceTracker: fc.array(arbResourceEntry, { maxLength: 8 }),
    formulas: fc.array(arbFormula, { maxLength: 8 }),
    notes: fc.array(arbNote, { maxLength: 8 }),
    wrong: fc.array(arbWrong, { maxLength: 8 }),
    scores: fc.array(arbScore, { maxLength: 8 }),
    dailyLog: fc.array(arbDailyLog, { maxLength: 8 }),
    goals: arbGoals,
    settings: arbSettings,
    readiness: arbReadiness,
    reminderDismissals: arbSafeDict(arbISODate),
  })
  .map((parts) => {
    const s = structuredClone(defaultState);
    Object.assign(s, parts);
    return s;
  });

// --- Property 2 -------------------------------------------------------------

test("Property 2: migrate(JSON round-trip) deep-equals the original valid state", () => {
  fc.assert(
    fc.property(arbState, (state) => {
      // Serialize and re-import exactly as the backup export/import flow does.
      const reimported = migrate(JSON.parse(JSON.stringify(state)));
      assert.deepStrictEqual(reimported, state);
    }),
    { numRuns: 100 }
  );
});

test("Property 2: parseBackup accepts serialized state and round-trips it", () => {
  fc.assert(
    fc.property(arbState, (state) => {
      const text = JSON.stringify(state);
      const result = parseBackup(text);
      assert.strictEqual(result.ok, true);
      assert.deepStrictEqual(migrate(result.value), state);
    }),
    { numRuns: 100 }
  );
});
