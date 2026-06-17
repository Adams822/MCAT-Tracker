"use strict";

// Property test for MCAT.validatePracticeSet in core.js.
//
// Dev-only: part of the test harness, never shipped with the app. This file is
// intentionally self-contained — it defines its own fast-check arbitraries and
// does NOT import tests/helpers.js.

const { test } = require("node:test");
const assert = require("node:assert");
const fc = require("fast-check");
const MCAT = require("../core.js");

const { validatePracticeSet } = MCAT;

// --- Constants mirroring the validation contract ----------------------------

const SECTIONS = ["C/P", "CARS", "B/B", "P/S"];
const TIMINGS = ["timed", "untimed"];
const DIFFICULTIES = ["easy", "medium", "hard"];

// --- Inline arbitraries -----------------------------------------------------

const arbId = fc.integer({ min: 1, max: 1e12 });

// A non-empty (after trim) date string. The validator only requires a
// non-blank string; it stores the value verbatim.
const arbNonBlankDate = fc
  .oneof(
    fc
      .date({ min: new Date("2020-01-01"), max: new Date("2030-12-31") })
      .map((d) => d.toISOString().slice(0, 10)),
    fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim() !== "")
  );

// Optional timing: either an allowed value or some invalid junk that must be
// normalized to the "untimed" default.
const arbTimingMaybe = fc.oneof(
  fc.constantFrom(...TIMINGS),
  fc.constantFrom("TIMED", "", "fast", 1, null, undefined)
);

// Optional difficulty: allowed value or junk normalized to the "medium" default.
const arbDifficultyMaybe = fc.oneof(
  fc.constantFrom(...DIFFICULTIES),
  fc.constantFrom("Easy", "", "extreme", 2, null, undefined)
);

// A fully-valid PracticeSet input: valid section, attempted 1..9999,
// correct 0..attempted, a non-blank date, plus optional timing/difficulty.
const arbValidInput = fc
  .record({
    id: arbId,
    date: arbNonBlankDate,
    section: fc.constantFrom(...SECTIONS),
    topic: fc.string({ maxLength: 30 }),
    resource: fc.string({ maxLength: 30 }),
    notes: fc.string({ maxLength: 30 }),
    timing: arbTimingMaybe,
    difficulty: arbDifficultyMaybe,
    attempted: fc.integer({ min: 1, max: 9999 }),
  })
  .chain((s) =>
    fc.integer({ min: 0, max: s.attempted }).map((correct) => ({ ...s, correct }))
  );

// --- Invalid-input arbitraries (each targets one field) ---------------------

// section absent or not one of the four valid codes.
const arbBadSection = arbValidInput.chain((base) =>
  fc
    .oneof(
      fc.constant(undefined),
      fc.constant(null),
      fc.constant(""),
      fc.constantFrom("cp", "C-P", "Bio", "psych", "  C/P  "),
      fc.string({ maxLength: 6 }).filter((s) => !SECTIONS.includes(s))
    )
    .map((section) => ({ input: { ...base, section }, field: "section" }))
);

// attempted not an integer in 1..9999 (out of range, non-integer, or non-numeric).
const arbBadAttempted = arbValidInput.chain((base) =>
  fc
    .oneof(
      fc.constantFrom(0, -1, 10000, 99999, 1.5, 2.0001),
      fc.constantFrom("", "abc", true, false, null, undefined, {}),
      fc.integer({ min: 10000, max: 1e6 })
    )
    // keep correct valid (0) so only the attempted rule is exercised
    .map((attempted) => ({ input: { ...base, attempted, correct: 0 }, field: "attempted" }))
);

// correct negative or non-integer.
const arbBadCorrect = arbValidInput.chain((base) =>
  fc
    .oneof(
      fc.constantFrom(-1, -5, 0.5, 3.2),
      fc.integer({ min: -1e6, max: -1 }),
      fc.constantFrom("abc", true, null, undefined, {})
    )
    .map((correct) => ({ input: { ...base, correct }, field: "correct" }))
);

// correct strictly greater than a valid attempted.
const arbCorrectExceedsAttempted = fc
  .record({
    id: arbId,
    date: arbNonBlankDate,
    section: fc.constantFrom(...SECTIONS),
    attempted: fc.integer({ min: 1, max: 9998 }),
  })
  .chain((s) =>
    fc
      .integer({ min: s.attempted + 1, max: s.attempted + 5000 })
      .map((correct) => ({ input: { ...s, correct }, field: "correct" }))
  );

// date missing / blank / non-string.
const arbBadDate = arbValidInput.chain((base) =>
  fc
    .oneof(
      fc.constant(""),
      fc.constant("   "),
      fc.constant(undefined),
      fc.constant(null),
      fc.constantFrom(0, 20240101, true, {})
    )
    .map((date) => ({ input: { ...base, date }, field: "date" }))
);

const arbInvalidCase = fc.oneof(
  arbBadSection,
  arbBadAttempted,
  arbBadCorrect,
  arbCorrectExceedsAttempted,
  arbBadDate
);

// --- Property 5 -------------------------------------------------------------

// Feature: mcat-tracker-expansion, Property 5: PracticeSet validation accepts exactly valid inputs
// Validates: Requirements 3.1, 3.4, 3.5, 3.6
test("Property 5: validatePracticeSet accepts every valid input, preserves core fields, and normalizes timing/difficulty", () => {
  fc.assert(
    fc.property(arbValidInput, (input) => {
      const snapshot = JSON.stringify(input);
      const result = validatePracticeSet(input);

      // Accepted.
      assert.strictEqual(result.ok, true, "valid input must be accepted");
      assert.ok(result.value && typeof result.value === "object");

      // Core fields preserved exactly.
      assert.strictEqual(result.value.section, input.section);
      assert.strictEqual(result.value.attempted, input.attempted);
      assert.strictEqual(result.value.correct, input.correct);
      assert.strictEqual(result.value.date, input.date);

      // timing/difficulty normalized to an allowed value, defaulting when invalid.
      assert.ok(TIMINGS.includes(result.value.timing));
      assert.ok(DIFFICULTIES.includes(result.value.difficulty));
      const expectedTiming = TIMINGS.includes(input.timing) ? input.timing : "untimed";
      const expectedDifficulty = DIFFICULTIES.includes(input.difficulty)
        ? input.difficulty
        : "medium";
      assert.strictEqual(result.value.timing, expectedTiming);
      assert.strictEqual(result.value.difficulty, expectedDifficulty);

      // Purity: validation does not mutate the caller's input.
      assert.strictEqual(JSON.stringify(input), snapshot, "input must not be mutated");
    }),
    { numRuns: 150 }
  );
});

// Feature: mcat-tracker-expansion, Property 5: PracticeSet validation accepts exactly valid inputs
// Validates: Requirements 3.1, 3.4, 3.5, 3.6
test("Property 5: validatePracticeSet rejects invalid inputs with a field-specific error and stores nothing", () => {
  fc.assert(
    fc.property(arbInvalidCase, ({ input, field }) => {
      const snapshot = JSON.stringify(input);
      const result = validatePracticeSet(input);

      // Rejected with a field-specific error key, and no stored value.
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
