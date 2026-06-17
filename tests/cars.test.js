"use strict";

// Property test for MCAT.validateCarsEntry in core.js.
//
// Dev-only: part of the test harness, never shipped with the app. This file is
// intentionally self-contained — it defines its own fast-check arbitraries and
// does NOT import tests/helpers.js.

const { test } = require("node:test");
const assert = require("node:assert");
const fc = require("fast-check");
const MCAT = require("../core.js");

const { validateCarsEntry, CARS_QUESTION_TYPES } = MCAT;

// --- Constants mirroring the validation contract ----------------------------

const DIFFICULTIES = ["easy", "medium", "hard"];

// "Today" computed exactly as the validator computes it (UTC ISO date), so the
// "not after today" boundary lines up with core.js's todayStr().
const TODAY = new Date().toISOString().slice(0, 10);

// --- Inline arbitraries -----------------------------------------------------

const arbId = fc.integer({ min: 1, max: 1e12 });

// A valid ISO calendar date string that is <= today. Generate from an early
// floor up to today, then keep only strings not after today (the slice/UTC
// boundary makes the upper edge safe to filter rather than assume).
const arbValidDate = fc
  .date({ min: new Date("2000-01-01T00:00:00.000Z"), max: new Date() })
  .map((d) => d.toISOString().slice(0, 10))
  .filter((s) => s <= TODAY);

// A non-empty subarray (subset) of the six allowed question types.
const arbQuestionTypes = fc
  .subarray(CARS_QUESTION_TYPES, { minLength: 0, maxLength: CARS_QUESTION_TYPES.length });

// A fully-valid CARS entry input.
const arbValidInput = fc.record({
  id: arbId,
  date: arbValidDate,
  accuracy: fc.double({ min: 0, max: 100, noNaN: true }),
  // timePerPassage in (0, 600]: use a small positive floor to stay > 0.
  timePerPassage: fc.double({ min: 0.001, max: 600, noNaN: true }),
  passages: fc.integer({ min: 1, max: 99 }),
  difficulty: fc.constantFrom(...DIFFICULTIES),
  questionTypes: arbQuestionTypes,
  notes: fc.string({ maxLength: 50 }),
});

// --- Invalid-input arbitraries (each targets exactly one rule) --------------

// Future date strictly after today (still a valid calendar date).
const arbFutureDate = fc
  .integer({ min: 1, max: 5000 })
  .map((daysAhead) => {
    const base = new Date(TODAY + "T00:00:00.000Z");
    base.setUTCDate(base.getUTCDate() + daysAhead);
    return base.toISOString().slice(0, 10);
  })
  .filter((s) => s > TODAY);

const arbBadDate = arbValidInput.chain((base) =>
  fc
    .oneof(
      arbFutureDate, // after today
      fc.constantFrom("2024-02-30", "2023-13-01", "2021-00-10", "not-a-date", "2020/01/01", "", "   "),
      fc.constantFrom(0, 20240101, true, null, undefined, {})
    )
    .map((date) => ({ input: { ...base, date }, field: "date" }))
);

// accuracy outside [0, 100] or non-numeric.
const arbBadAccuracy = arbValidInput.chain((base) =>
  fc
    .oneof(
      fc.double({ min: -1e6, max: -0.0001, noNaN: true }),
      fc.double({ min: 100.0001, max: 1e6, noNaN: true }),
      fc.constantFrom("abc", true, null, NaN, Infinity, {})
    )
    .map((accuracy) => ({ input: { ...base, accuracy }, field: "accuracy" }))
);

// timePerPassage <= 0 or > 600 or non-numeric.
const arbBadTime = arbValidInput.chain((base) =>
  fc
    .oneof(
      fc.double({ min: -1e6, max: 0, noNaN: true }), // includes 0 (invalid, must be > 0)
      fc.double({ min: 600.0001, max: 1e6, noNaN: true }),
      fc.constantFrom("abc", true, null, NaN, Infinity, {})
    )
    .map((timePerPassage) => ({ input: { ...base, timePerPassage }, field: "timePerPassage" }))
);

// passages not an integer in [1, 99] (out of range, non-integer, non-numeric).
const arbBadPassages = arbValidInput.chain((base) =>
  fc
    .oneof(
      fc.constantFrom(0, 100, -1, 1.5, 50.0001),
      fc.integer({ min: 100, max: 1e5 }),
      fc.constantFrom("abc", true, null, undefined, {})
    )
    .map((passages) => ({ input: { ...base, passages }, field: "passages" }))
);

// difficulty not one of easy | medium | hard.
const arbBadDifficulty = arbValidInput.chain((base) =>
  fc
    .oneof(
      fc.constantFrom("Easy", "EASY", "extreme", "", "med", 1, null, undefined),
      fc.string({ maxLength: 6 }).filter((s) => !DIFFICULTIES.includes(s))
    )
    .map((difficulty) => ({ input: { ...base, difficulty }, field: "difficulty" }))
);

// questionTypes containing at least one value outside the allowed set.
const arbBadQuestionTypes = arbValidInput.chain((base) =>
  fc
    .tuple(
      arbQuestionTypes,
      fc.constantFrom("vocabulary", "scope", "MAIN IDEA", "", "tone", "random-type")
    )
    .map(([valid, bogus]) => ({
      input: { ...base, questionTypes: [...valid, bogus] },
      field: "questionTypes",
    }))
);

const arbInvalidCase = fc.oneof(
  arbBadDate,
  arbBadAccuracy,
  arbBadTime,
  arbBadPassages,
  arbBadDifficulty,
  arbBadQuestionTypes
);

// --- Property 23 ------------------------------------------------------------

// Feature: mcat-tracker-expansion, Property 23: CARS entry validation accepts exactly valid inputs
// Validates: Requirements 10.1, 10.5, 10.6
test("Property 23: validateCarsEntry accepts every valid input and preserves the fields in a normalized value", () => {
  fc.assert(
    fc.property(arbValidInput, (input) => {
      const snapshot = JSON.stringify(input);
      const result = validateCarsEntry(input);

      // Accepted.
      assert.strictEqual(result.ok, true, "valid input must be accepted");
      assert.ok(result.value && typeof result.value === "object");

      // Fields preserved (numbers exact, date verbatim).
      assert.strictEqual(result.value.date, input.date);
      assert.strictEqual(result.value.accuracy, input.accuracy);
      assert.strictEqual(result.value.timePerPassage, input.timePerPassage);
      assert.strictEqual(result.value.passages, input.passages);
      assert.strictEqual(result.value.difficulty, input.difficulty);

      // questionTypes normalized: a subset of the allowed set, de-duplicated,
      // emitted in canonical order, and containing exactly the selected types.
      assert.ok(Array.isArray(result.value.questionTypes));
      assert.ok(result.value.questionTypes.every((t) => CARS_QUESTION_TYPES.includes(t)));
      const expectedTypes = CARS_QUESTION_TYPES.filter((t) => input.questionTypes.includes(t));
      assert.deepStrictEqual(result.value.questionTypes, expectedTypes);

      // notes trimmed and capped at 2000 chars.
      assert.ok(result.value.notes.length <= 2000);
      assert.strictEqual(result.value.notes, String(input.notes).trim().slice(0, 2000));

      // Purity: validation does not mutate the caller's input.
      assert.strictEqual(JSON.stringify(input), snapshot, "input must not be mutated");
    }),
    { numRuns: 150 }
  );
});

// Feature: mcat-tracker-expansion, Property 23: CARS entry validation accepts exactly valid inputs
// Validates: Requirements 10.1, 10.5, 10.6
test("Property 23: validateCarsEntry rejects each single-rule violation with a field error and stores nothing", () => {
  fc.assert(
    fc.property(arbInvalidCase, ({ input, field }) => {
      const snapshot = JSON.stringify(input);
      const result = validateCarsEntry(input);

      // Rejected, no stored value.
      assert.strictEqual(result.ok, false, "invalid input must be rejected");
      assert.strictEqual(result.value, undefined, "rejected input must not produce a value");
      assert.ok(result.errors && typeof result.errors === "object");
      assert.ok(
        Object.prototype.hasOwnProperty.call(result.errors, field),
        `expected an error for field "${field}", got ${JSON.stringify(result.errors)}`
      );
      assert.strictEqual(typeof result.errors[field], "string");

      // Purity: validation does not mutate the caller's input (nothing "stored").
      assert.strictEqual(JSON.stringify(input), snapshot, "input must not be mutated");
    }),
    { numRuns: 150 }
  );
});
