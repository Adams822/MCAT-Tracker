"use strict";

// Property tests for MCAT.validateSections and MCAT.sectionTrendSeries in core.js
// (Full-Length Exam Tracker pure layer).
//
// Dev-only: part of the test harness, never shipped with the app. This file is
// intentionally self-contained — it defines its own fast-check arbitraries and
// does NOT import tests/helpers.js.

const { test } = require("node:test");
const assert = require("node:assert");
const fc = require("fast-check");
const MCAT = require("../core.js");

const { validateSections, sectionTrendSeries } = MCAT;

// Canonical section order used by the validator's `invalid` list.
const SECTION_KEYS = ["cp", "cars", "bb", "ps"];
const SECTION_MIN = 118;
const SECTION_MAX = 132;

// ---------------------------------------------------------------------------
// Oracle: a Section_Score is valid IFF it is (or numerically coerces from a
// non-blank string to) an integer in [118, 132]. Mirrors the documented
// contract: out-of-range values, non-integers, NaN/Infinity, booleans,
// null/undefined, blank/non-numeric strings, and objects are all invalid.
// ---------------------------------------------------------------------------
function isValidSectionScore(v) {
  if (typeof v !== "number" && typeof v !== "string") return false;
  if (typeof v === "string" && v.trim() === "") return false;
  const n = Number(v);
  if (!Number.isInteger(n)) return false;
  return n >= SECTION_MIN && n <= SECTION_MAX;
}

// =============================================================================
// Property 14
// =============================================================================

// A single candidate section value: a mix of valid integers in 118..132 and a
// broad spread of invalids — out-of-range integers, non-integer numbers, and
// non-number values (strings, booleans, null/undefined, objects). Numeric
// strings are included to exercise the documented coercion path.
const arbSectionValue = fc.oneof(
  // valid integers 118..132
  fc.integer({ min: SECTION_MIN, max: SECTION_MAX }),
  // out-of-range integers
  fc.integer({ min: -50, max: SECTION_MIN - 1 }),
  fc.integer({ min: SECTION_MAX + 1, max: 1000 }),
  // non-integer numbers (in and out of range)
  fc.constantFrom(120.5, 118.0001, 131.9, 0.5, -3.2, NaN, Infinity, -Infinity),
  // non-number, non-string
  fc.constantFrom(null, undefined, true, false),
  fc.constant({}),
  // strings: valid numeric, invalid numeric, non-numeric, blank
  fc.constantFrom("120", "118", "132", "125", "120.5", "abc", "", "   ", "133", "117")
);

// Four independently-chosen section values.
const arbSections = fc.record({
  cp: arbSectionValue,
  cars: arbSectionValue,
  bb: arbSectionValue,
  ps: arbSectionValue,
});

// Feature: mcat-tracker-expansion, Property 14: Section validation reports every invalid section independently
// Validates: Requirements 7.8
test("Property 14: validateSections reports exactly the out-of-range sections, independent of the others", () => {
  fc.assert(
    fc.property(arbSections, (input) => {
      const snapshot = JSON.stringify(input);

      // Oracle: the exact set of sections whose value is not a valid score.
      const expectedInvalid = SECTION_KEYS.filter((s) => !isValidSectionScore(input[s]));

      const result = validateSections(input);

      // ok === true IFF all four sections are valid.
      assert.strictEqual(
        result.ok,
        expectedInvalid.length === 0,
        `ok must be true iff every section is a valid integer 118..132 (input=${snapshot})`
      );

      if (expectedInvalid.length === 0) {
        // No `invalid` payload on success.
        assert.ok(!("invalid" in result) || result.invalid === undefined);
      } else {
        assert.strictEqual(result.ok, false);
        assert.ok(Array.isArray(result.invalid), "invalid must be an array when ok is false");

        // The reported set is EXACTLY the oracle's set, in canonical order —
        // every invalid section is reported regardless of the others' validity.
        const reportedSections = result.invalid.map((e) => e.section);
        assert.deepStrictEqual(
          reportedSections,
          expectedInvalid,
          `reported invalid sections must equal the oracle set in canonical order (input=${snapshot})`
        );

        // No valid section is ever reported.
        for (const entry of result.invalid) {
          assert.ok(
            !isValidSectionScore(input[entry.section]),
            `section "${entry.section}" was reported invalid but is actually valid`
          );
          // The original submitted value is echoed back (===, same reference for objects).
          assert.strictEqual(
            entry.value,
            input[entry.section],
            `reported value for "${entry.section}" must be the original submitted value`
          );
        }
      }

      // Purity: validation never mutates the caller's input.
      assert.strictEqual(JSON.stringify(input), snapshot, "input must not be mutated");
    }),
    { numRuns: 200 }
  );
});

// =============================================================================
// Property 15
// =============================================================================

// A section value within a score record: a mix of finite numbers (which must
// produce a trend point), non-finite numbers, strings, and absent values
// (modeled via optional keys / null / undefined) which must be skipped.
const arbRecordSectionValue = fc.oneof(
  fc.integer({ min: SECTION_MIN, max: SECTION_MAX }), // finite int -> counts
  fc.double({ min: 100, max: 140, noNaN: true, noDefaultInfinity: true }), // finite -> counts
  fc.constantFrom(NaN, Infinity, -Infinity), // non-finite number -> skipped
  fc.constantFrom("120", "abc", "", null, undefined) // non-number -> skipped
);

// Arbitrary date for a record: real ISO dates, junk strings, numbers, or null;
// some records omit the date entirely (optional key).
const arbRecordDate = fc.oneof(
  fc
    .date({ min: new Date("2018-01-01"), max: new Date("2030-12-31") })
    .map((d) => d.toISOString().slice(0, 10)),
  fc.string({ maxLength: 12 }),
  fc.integer({ min: 0, max: 99999999 }),
  fc.constant(null)
);

// A score record. Every field is optional (requiredKeys: []), so some records
// are missing the date and/or one or more section values entirely.
const arbScoreRecord = fc.record(
  {
    date: arbRecordDate,
    cp: arbRecordSectionValue,
    cars: arbRecordSectionValue,
    bb: arbRecordSectionValue,
    ps: arbRecordSectionValue,
    name: fc.string({ maxLength: 8 }),
  },
  { requiredKeys: [] }
);

// The scores array may also contain non-object junk entries, which must be
// tolerated (skipped) without throwing.
const arbScoreEntry = fc.oneof(
  arbScoreRecord,
  fc.constantFrom(null, undefined, 42, "not-a-record", true)
);

const arbScores = fc.array(arbScoreEntry, { maxLength: 20 });

function isPlainRecord(e) {
  return typeof e === "object" && e !== null && !Array.isArray(e);
}

// Feature: mcat-tracker-expansion, Property 15: Per-section trend is ordered and tolerant of incomplete data
// Validates: Requirements 7.7
test("Property 15: sectionTrendSeries yields date-ordered series of only finite values, tolerating incomplete data", () => {
  fc.assert(
    fc.property(arbScores, (scores) => {
      const snapshot = JSON.stringify(scores);

      // Must never throw on incomplete/legacy/junk data.
      let result;
      assert.doesNotThrow(() => {
        result = sectionTrendSeries(scores);
      });

      // Always returns all four series.
      assert.ok(result && typeof result === "object");
      for (const section of SECTION_KEYS) {
        const series = result[section];
        assert.ok(Array.isArray(series), `series for "${section}" must be an array`);

        // Oracle: number of records contributing a point = records that are
        // plain objects with a finite numeric value for this section.
        const expectedCount = scores.filter(
          (e) => isPlainRecord(e) && typeof e[section] === "number" && isFinite(e[section])
        ).length;
        assert.strictEqual(
          series.length,
          expectedCount,
          `series for "${section}" must contain exactly one point per finite numeric value`
        );

        // Every point carries a finite value, and the series is ordered
        // non-decreasing by date (string compare, matching the implementation).
        for (let i = 0; i < series.length; i++) {
          assert.strictEqual(
            typeof series[i].v,
            "number",
            `point value for "${section}" must be a number`
          );
          assert.ok(isFinite(series[i].v), `point value for "${section}" must be finite`);
          assert.strictEqual(
            typeof series[i].date,
            "string",
            `point date for "${section}" must be a string`
          );
          if (i > 0) {
            assert.ok(
              series[i - 1].date <= series[i].date,
              `series for "${section}" must be ordered non-decreasing by date`
            );
          }
        }
      }

      // Purity: the function must not mutate its input.
      assert.strictEqual(JSON.stringify(scores), snapshot, "input must not be mutated");
    }),
    { numRuns: 200 }
  );
});
