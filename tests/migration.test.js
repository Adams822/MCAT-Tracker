"use strict";

// Feature: mcat-tracker-expansion, Property 1: State migration is idempotent and default-preserving
//
// Property 1: State migration is idempotent and default-preserving.
// Validates: Requirements 1.2, 1.3, 1.4, 2.4, 6.3, 7.5.
//
// For any stored State_Object (including older states missing arbitrary new
// top-level keys, missing nested sub-keys in goals/settings/readiness, and
// wrong/scores records missing the enhanced fields), applying migrate():
//   (a) adds every missing key/sub-key/record-field with exactly its
//       documented default,
//   (b) leaves every already-present key, sub-key, and value deeply unchanged,
//   (c) is idempotent: migrate(deepClone(migrate(s))) deep-equals migrate(s).
//
// This file is SELF-CONTAINED on purpose: it defines its own fast-check
// arbitraries inline rather than importing tests/helpers.js, so it never
// conflicts with the shared-arbitrary scaffold edited by sibling test tasks.
//
// Dev-only: part of the test harness, never shipped with the app.

const { test } = require("node:test");
const assert = require("node:assert");
const fc = require("fast-check");
const MCAT = require("../core.js");

const { migrate, defaultState } = MCAT;

/* ------------------------------------------------------------------ */
/* Oracle helpers                                                      */
/* ------------------------------------------------------------------ */

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function clone(v) {
  return structuredClone(v);
}

// The canonical fully-migrated default. Using migrate(defaultState) rather than
// the raw defaultState matters because migrate() back-fills the seeded `scores`
// record with the new full-length fields, so the post-migration default for an
// ABSENT key is not always identical to the literal in defaultState.
const MIGRATED_DEFAULT = migrate(clone(defaultState));

// Documented per-record back-fill templates (mirror core.js migrate()).
const WRONG_TEMPLATE = {
  category: "unset",
  explanation: "",
  takeaway: "",
  needsReview: false,
  retestDate: "",
};
const SCORES_TEMPLATE = {
  percentiles: { cp: null, cars: null, bb: null, ps: null, total: null },
  timeTaken: null,
  conditions: { timed: false, singleSitting: false, withBreaks: false, realConditions: false },
  reviewStatus: "not reviewed",
  lessons: "",
};

// migrate() intentionally (re)stamps this meta field, so it is exempt from the
// "present values are preserved" clause.
const STAMPED_KEYS = new Set(["schemaVersion"]);

/* ------------------------------------------------------------------ */
/* Clause (b): every present value is preserved deeply and unchanged.  */
/* ------------------------------------------------------------------ */

function assertPreserved(orig, migrated, path) {
  if (Array.isArray(orig)) {
    assert.ok(Array.isArray(migrated), `expected array preserved at ${path}`);
    assert.strictEqual(
      migrated.length,
      orig.length,
      `array length changed at ${path} (migrate must not add/remove elements)`
    );
    for (let i = 0; i < orig.length; i++) {
      assertPreserved(orig[i], migrated[i], `${path}[${i}]`);
    }
    return;
  }
  if (isPlainObject(orig)) {
    for (const key of Object.keys(orig)) {
      assert.ok(key in migrated, `key "${key}" lost during migration at ${path}`);
      assertPreserved(orig[key], migrated[key], `${path}.${key}`);
    }
    return;
  }
  // Primitive: must be byte-for-byte identical.
  assert.deepStrictEqual(migrated, orig, `value changed at ${path}`);
}

function assertTopLevelPreserved(orig, migrated) {
  for (const key of Object.keys(orig)) {
    if (STAMPED_KEYS.has(key)) continue; // schemaVersion is restamped by design
    assert.ok(key in migrated, `top-level key "${key}" lost during migration`);
    assertPreserved(orig[key], migrated[key], key);
  }
}

/* ------------------------------------------------------------------ */
/* Clause (a): every missing default key/sub-key/field is filled with  */
/* exactly its documented default.                                     */
/* ------------------------------------------------------------------ */

// For a template of documented defaults `tmpl`, assert that `migrated` contains
// every template key, that keys ABSENT in `orig` carry the exact default, and
// recurse into nested plain-object defaults.
function assertTemplateFilled(migrated, tmpl, orig, path) {
  for (const key of Object.keys(tmpl)) {
    assert.ok(migrated && key in migrated, `default sub-key "${key}" missing at ${path}`);
    const origHas = isPlainObject(orig) && key in orig;
    if (!origHas) {
      assert.deepStrictEqual(
        migrated[key],
        tmpl[key],
        `absent sub-key "${key}" at ${path} not filled with documented default`
      );
    } else if (isPlainObject(tmpl[key]) && isPlainObject(orig[key])) {
      assertTemplateFilled(migrated[key], tmpl[key], orig[key], `${path}.${key}`);
    }
    // else: present non-object sub-key -> existing wins (covered by clause (b)).
  }
}

function assertReadinessDefaults(migrated, orig) {
  const def = MIGRATED_DEFAULT.readiness;
  assert.ok(Array.isArray(migrated.predefined), "readiness.predefined must be an array");
  // Every documented predefined item must be present after migration.
  for (const d of def.predefined) {
    assert.ok(
      migrated.predefined.some((it) => it && it.key === d.key),
      `readiness predefined item "${d.key}" missing after migration`
    );
  }
  assert.ok(Array.isArray(migrated.custom), "readiness.custom must be an array");
  const origReadiness = isPlainObject(orig) ? orig : {};
  if (!Array.isArray(origReadiness.predefined)) {
    assert.deepStrictEqual(
      migrated.predefined,
      def.predefined,
      "absent readiness.predefined not filled with documented default"
    );
  }
  if (!Array.isArray(origReadiness.custom)) {
    assert.deepStrictEqual(
      migrated.custom,
      def.custom,
      "absent readiness.custom not filled with documented default"
    );
  }
}

function assertDefaultsFilled(orig, migrated) {
  for (const key of Object.keys(defaultState)) {
    assert.ok(key in migrated, `default top-level key "${key}" missing after migration`);
    if (!(key in orig)) {
      // Whole subtree absent -> must equal the canonical migrated default.
      assert.deepStrictEqual(
        migrated[key],
        MIGRATED_DEFAULT[key],
        `absent top-level key "${key}" not filled with documented default`
      );
      continue;
    }
    // Present: check nested fills for the deep-merged objects.
    if (key === "goals" || key === "settings") {
      assertTemplateFilled(migrated[key], MIGRATED_DEFAULT[key], orig[key], key);
    } else if (key === "readiness") {
      assertReadinessDefaults(migrated[key], orig[key]);
    }
  }
  // Per-record back-fill on existing arrays.
  if (Array.isArray(orig.wrong)) {
    orig.wrong.forEach((w, i) =>
      assertTemplateFilled(migrated.wrong[i], WRONG_TEMPLATE, w, `wrong[${i}]`)
    );
  }
  if (Array.isArray(orig.scores)) {
    orig.scores.forEach((s, i) =>
      assertTemplateFilled(migrated.scores[i], SCORES_TEMPLATE, s, `scores[${i}]`)
    );
  }
  // schemaVersion is always stamped to the current version.
  assert.strictEqual(
    migrated.schemaVersion,
    defaultState.schemaVersion,
    "schemaVersion not stamped to current version"
  );
}

/* ------------------------------------------------------------------ */
/* Inline arbitraries for partial / older states                      */
/* ------------------------------------------------------------------ */

const arbISODate = fc
  .date({ min: new Date("2020-01-01"), max: new Date("2030-12-31") })
  .map((d) => d.toISOString().slice(0, 10));

const MISTAKE_CATEGORIES = [
  "unset",
  "content gap",
  "misread question",
  "misread passage",
  "calculation error",
  "timing issue",
  "wrong reasoning",
  "trap answer",
  "did not know formula",
  "guessed",
];

// Older `wrong` record: existing fields always present, enhanced fields each
// independently present or ABSENT (the migration back-fill target).
const arbWrongRecord = fc.record(
  {
    id: fc.nat(),
    date: arbISODate,
    source: fc.string({ maxLength: 30 }),
    topic: fc.string({ maxLength: 30 }),
    section: fc.constantFrom("C/P", "CARS", "B/B", "P/S"),
    why: fc.string({ maxLength: 30 }),
    count: fc.nat({ max: 20 }),
    status: fc.constantFrom("open", "resolved"),
    // enhanced fields (optional)
    category: fc.constantFrom(...MISTAKE_CATEGORIES),
    explanation: fc.string({ maxLength: 40 }),
    takeaway: fc.string({ maxLength: 40 }),
    needsReview: fc.boolean(),
    retestDate: fc.oneof(fc.constant(""), arbISODate),
  },
  { requiredKeys: ["id", "date", "source", "topic", "section", "why", "count", "status"] }
);

// Partial percentiles / conditions objects exercise nested applyDefaults().
const arbPercentiles = fc.record(
  {
    cp: fc.integer({ min: 0, max: 100 }),
    cars: fc.integer({ min: 0, max: 100 }),
    bb: fc.integer({ min: 0, max: 100 }),
    ps: fc.integer({ min: 0, max: 100 }),
    total: fc.integer({ min: 0, max: 100 }),
  },
  { requiredKeys: [] }
);
const arbConditions = fc.record(
  {
    timed: fc.boolean(),
    singleSitting: fc.boolean(),
    withBreaks: fc.boolean(),
    realConditions: fc.boolean(),
  },
  { requiredKeys: [] }
);

// Older `scores` record: existing section fields always present, enhanced
// fields each independently present or ABSENT.
const arbScoreRecord = fc.record(
  {
    id: fc.nat(),
    date: fc.oneof(fc.constant(""), arbISODate),
    name: fc.string({ maxLength: 30 }),
    cp: fc.integer({ min: 118, max: 132 }),
    cars: fc.integer({ min: 118, max: 132 }),
    bb: fc.integer({ min: 118, max: 132 }),
    ps: fc.integer({ min: 118, max: 132 }),
    // enhanced fields (optional)
    percentiles: arbPercentiles,
    timeTaken: fc.oneof(fc.constant(null), fc.integer({ min: 1, max: 1440 })),
    conditions: arbConditions,
    reviewStatus: fc.constantFrom("not reviewed", "reviewed"),
    lessons: fc.string({ maxLength: 40 }),
  },
  { requiredKeys: ["id", "date", "name", "cp", "cars", "bb", "ps"] }
);

// goals / settings with nested sub-keys independently present or absent.
// Note: targetScore is never generated as null, matching the legacy-bridge
// contract (the bridge only fires for a null targetScore, an unset sentinel).
const arbGoals = fc.record(
  {
    targetScore: fc.integer({ min: 472, max: 528 }),
    weeklyHourGoal: fc.nat({ max: 80 }),
    dailyQuestionGoal: fc.nat({ max: 500 }),
    milestones: fc.array(
      fc.record({ id: fc.nat(), text: fc.string({ maxLength: 20 }), done: fc.boolean() }),
      { maxLength: 4 }
    ),
  },
  { requiredKeys: [] }
);

const arbSettings = fc.record(
  {
    name: fc.string({ maxLength: 20 }),
    testDate: fc.oneof(fc.constant(""), arbISODate),
    targetScore: fc.integer({ min: 472, max: 528 }),
    diagnosticScore: fc.oneof(fc.constant(null), fc.integer({ min: 472, max: 528 })),
    weeklyAvailability: fc.nat({ max: 80 }),
    preferredResources: fc.string({ maxLength: 20 }),
    studyPhase: fc.constantFrom("content review", "practice", "review", "final prep"),
  },
  { requiredKeys: [] }
);

// readiness: predefined (when present) is generated as the FULL default list in
// default order with randomized `checked` flags, so its rebuild preserves order
// and the index-based preservation check stays valid. custom and predefined
// sub-keys are independently present or absent.
const arbFullPredefined = fc
  .array(fc.boolean(), { minLength: defaultState.readiness.predefined.length, maxLength: defaultState.readiness.predefined.length })
  .map((bools) =>
    defaultState.readiness.predefined.map((d, i) => ({ key: d.key, label: d.label, checked: bools[i] }))
  );
const arbCustomItems = fc.array(
  fc.record({ id: fc.nat(), label: fc.string({ maxLength: 20 }), checked: fc.boolean() }),
  { maxLength: 4 }
);
const arbReadinessPresent = fc.oneof(
  fc.constant({}),
  arbCustomItems.map((custom) => ({ custom })),
  arbFullPredefined.map((predefined) => ({ predefined })),
  fc.tuple(arbFullPredefined, arbCustomItems).map(([predefined, custom]) => ({ predefined, custom }))
);

const arbPomo = fc.record({
  work: fc.nat({ max: 90 }),
  break: fc.nat({ max: 30 }),
  long: fc.nat({ max: 60 }),
  rounds: fc.nat({ max: 10 }),
});

// Top-level partial/older state: every key is independently present or absent
// (requiredKeys: []), so fast-check explores random subsets of keys.
const arbOldState = fc.record(
  {
    // existing keys
    testDate: fc.oneof(fc.constant(""), arbISODate),
    target: fc.integer({ min: 472, max: 528 }),
    tasks: fc.array(fc.record({ id: fc.nat(), text: fc.string({ maxLength: 20 }), done: fc.boolean() }), { maxLength: 3 }),
    topics: fc.array(fc.string({ maxLength: 20 }), { maxLength: 3 }),
    scores: fc.array(arbScoreRecord, { maxLength: 4 }),
    appItems: fc.array(fc.string({ maxLength: 12 }), { maxLength: 3 }),
    wrong: fc.array(arbWrongRecord, { maxLength: 4 }),
    events: fc.array(fc.record({ id: fc.nat(), date: arbISODate, title: fc.string({ maxLength: 20 }) }), { maxLength: 3 }),
    sessions: fc.dictionary(arbISODate, fc.nat({ max: 600 }), { maxKeys: 4 }),
    pomo: arbPomo,
    theme: fc.constantFrom("dark", "light"),
    seeded: fc.boolean(),
    lastDailyReset: fc.oneof(fc.constant(""), arbISODate),
    lastWeeklyReset: fc.oneof(fc.constant(""), arbISODate),
    lastMonthlyReset: fc.oneof(fc.constant(""), arbISODate),
    // new keys
    schemaVersion: fc.constantFrom(1, 2),
    practiceSets: fc.array(fc.record({ id: fc.nat(), section: fc.constantFrom("C/P", "CARS", "B/B", "P/S"), correct: fc.nat({ max: 50 }), attempted: fc.integer({ min: 1, max: 50 }) }), { maxLength: 3 }),
    contentStatuses: fc.dictionary(fc.string({ maxLength: 12 }), fc.constantFrom("not started", "in progress", "reviewed", "needs practice", "mastered"), { maxKeys: 4 }),
    customContentTopics: fc.array(fc.record({ section: fc.constantFrom("C/P", "CARS", "B/B", "P/S"), label: fc.string({ maxLength: 20 }) }), { maxLength: 3 }),
    carsPassages: fc.array(fc.record({ id: fc.nat(), passages: fc.integer({ min: 1, max: 99 }), accuracy: fc.integer({ min: 0, max: 100 }) }), { maxLength: 3 }),
    reviewItems: fc.array(fc.record({ id: fc.nat(), topic: fc.string({ maxLength: 20 }), intervalIndex: fc.integer({ min: -1, max: 3 }) }), { maxLength: 3 }),
    resourceTracker: fc.array(fc.record({ id: fc.nat(), name: fc.string({ maxLength: 20 }), priority: fc.constantFrom("high", "med", "low") }), { maxLength: 3 }),
    formulas: fc.array(fc.record({ id: fc.nat(), name: fc.string({ maxLength: 20 }), memorized: fc.boolean() }), { maxLength: 3 }),
    notes: fc.array(fc.record({ id: fc.nat(), title: fc.string({ maxLength: 20 }), body: fc.string({ maxLength: 40 }) }), { maxLength: 3 }),
    goals: arbGoals,
    dailyLog: fc.array(fc.record({ date: arbISODate, hours: fc.nat({ max: 24 }), questions: fc.nat({ max: 9999 }) }), { maxLength: 3 }),
    readiness: arbReadinessPresent,
    reminderDismissals: fc.dictionary(fc.string({ maxLength: 12 }), arbISODate, { maxKeys: 4 }),
    settings: arbSettings,
  },
  { requiredKeys: [] }
);

/* ------------------------------------------------------------------ */
/* The property test                                                   */
/* ------------------------------------------------------------------ */

test("Property 1: migration is idempotent and default-preserving", () => {
  fc.assert(
    fc.property(arbOldState, (generated) => {
      // migrate() mutates in place; clone inputs to compare against the original.
      const orig = clone(generated);
      const migrated = migrate(clone(generated));

      // (b) every present key/sub-key/value is preserved deeply and unchanged.
      assertTopLevelPreserved(orig, migrated);

      // (a) every missing key/sub-key/record-field is filled with its default.
      assertDefaultsFilled(orig, migrated);

      // (c) idempotence: re-migrating a migrated state changes nothing.
      const again = migrate(clone(migrated));
      assert.deepStrictEqual(again, migrated, "migrate is not idempotent");
    }),
    { numRuns: 100 }
  );
});

// Anchor example: an empty stored object migrates to the canonical default.
test("Property 1 (example): empty state migrates to the canonical default", () => {
  const migrated = migrate({});
  assert.deepStrictEqual(migrated, MIGRATED_DEFAULT);
});
