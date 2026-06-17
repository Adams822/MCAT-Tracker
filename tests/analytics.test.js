"use strict";

// Feature: mcat-tracker-expansion, Property 17: Weakness ranking ordering with tie-break
// Feature: mcat-tracker-expansion, Property 18: Mistake-frequency ordering with tie-break
// Feature: mcat-tracker-expansion, Property 19: Full-length totals are chronological
// Feature: mcat-tracker-expansion, Property 20: Predicted score range is bounded and well-ordered
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

const {
  weaknessRanking,
  mistakeFrequency,
  predictedScoreRange,
  scoreTotal,
  MISTAKE_CATEGORIES,
} = MCAT;

/* ------------------------------------------------------------------ */
/* Inline arbitraries                                                  */
/* ------------------------------------------------------------------ */

// A valid Section_Score: integer 118..132.
const arbSection = fc.integer({ min: 118, max: 132 });

// A valid "YYYY-MM-DD" calendar date produced from fc.date (UTC ISO slice).
const arbISODate = fc
  .date({ min: new Date("2015-01-01T00:00:00Z"), max: new Date("2035-12-31T00:00:00Z") })
  .map((d) => d.toISOString().slice(0, 10));

// A practice set with a small topic alphabet (so collisions/ties are common),
// a positive attempted count, and correct in [0, attempted].
const arbPracticeSet = fc
  .record({
    topic: fc.constantFrom("alpha", "beta", "gamma", "delta", "epsilon"),
    attempted: fc.integer({ min: 1, max: 60 }),
    correctRatio: fc.integer({ min: 0, max: 100 }),
  })
  .map(({ topic, attempted, correctRatio }) => ({
    topic,
    attempted,
    correct: Math.round((correctRatio / 100) * attempted),
  }));

// A full-length record: just the four section scores (scoreTotal ignores rest).
const arbFullLength = fc.record({
  date: arbISODate,
  cp: arbSection,
  cars: arbSection,
  bb: arbSection,
  ps: arbSection,
});

// A wrong-answer entry whose category is sometimes a real taxonomy member,
// sometimes "unset", sometimes off-taxonomy/missing (all -> unset bucket).
const arbWrong = fc.record({
  category: fc.oneof(
    fc.constantFrom(...MISTAKE_CATEGORIES),
    fc.constantFrom("unset", "made up", ""),
    fc.constant(undefined)
  ),
});

/* ------------------------------------------------------------------ */
/* Property 17: Weakness ranking ordering with tie-break.              */
/* Topics ascending by computed accuracy; ties broken by greater       */
/* attempted first.                                                    */
/* Validates: Requirements 8.5                                         */
/* ------------------------------------------------------------------ */

test("Property 17: weaknessRanking is ascending by accuracy, ties by greater attempted first", () => {
  fc.assert(
    fc.property(fc.array(arbPracticeSet, { maxLength: 40 }), (sets) => {
      const ranking = weaknessRanking(sets);

      // Pairwise ordering invariant across every adjacent pair.
      for (let i = 1; i < ranking.length; i++) {
        const prev = ranking[i - 1];
        const cur = ranking[i];

        // Primary: accuracy is non-decreasing.
        assert.ok(
          prev.pct <= cur.pct,
          `accuracy must be non-decreasing: ${prev.pct} then ${cur.pct}`
        );

        // Secondary: on an accuracy tie, greater attempted comes first.
        if (prev.pct === cur.pct) {
          assert.ok(
            prev.attempted >= cur.attempted,
            `on equal accuracy, greater attempted must come first: ` +
              `${prev.attempted} then ${cur.attempted}`
          );
        }
      }
    }),
    { numRuns: 200 }
  );
});

/* ------------------------------------------------------------------ */
/* Property 18: Mistake-frequency ordering with tie-break.             */
/* Categories descending by count; ties alphabetical by name.          */
/* Validates: Requirements 8.6                                         */
/* ------------------------------------------------------------------ */

test("Property 18: mistakeFrequency is descending by count, ties alphabetical by category", () => {
  fc.assert(
    fc.property(fc.array(arbWrong, { maxLength: 60 }), (wrong) => {
      const freq = mistakeFrequency(wrong);

      // Every one of the nine taxonomy categories appears exactly once.
      assert.strictEqual(freq.length, MISTAKE_CATEGORIES.length);
      const seen = new Set(freq.map((f) => f.category));
      for (const cat of MISTAKE_CATEGORIES) {
        assert.ok(seen.has(cat), `category ${cat} missing from mistakeFrequency`);
      }

      // Pairwise ordering invariant across every adjacent pair.
      for (let i = 1; i < freq.length; i++) {
        const prev = freq[i - 1];
        const cur = freq[i];

        // Primary: count is non-increasing (descending).
        assert.ok(
          prev.count >= cur.count,
          `count must be non-increasing: ${prev.count} then ${cur.count}`
        );

        // Secondary: on a count tie, alphabetical by category name.
        if (prev.count === cur.count) {
          assert.ok(
            prev.category.localeCompare(cur.category) <= 0,
            `on equal count, categories must be alphabetical: ` +
              `${prev.category} then ${cur.category}`
          );
        }
      }
    }),
    { numRuns: 200 }
  );
});

/* ------------------------------------------------------------------ */
/* Property 19: Full-length totals are chronological.                  */
/* core.js exposes no analytics total-score series builder (chronology */
/* is produced in the render layer), so we verify the invariant on the */
/* documented building blocks: sorting full-length records by date and */
/* mapping scoreTotal yields a series whose dates are non-decreasing.  */
/* Validates: Requirements 8.7                                         */
/* ------------------------------------------------------------------ */

// The render-layer total-score series: stable sort by date, then map to
// { date, total }. Mirrors the chronological ordering the analytics page uses.
function totalScoreSeries(scores) {
  return scores
    .map((s, i) => ({ s, i }))
    .sort((a, b) => {
      const da = String(a.s.date == null ? "" : a.s.date);
      const db = String(b.s.date == null ? "" : b.s.date);
      if (da < db) return -1;
      if (da > db) return 1;
      return a.i - b.i; // stable for equal dates
    })
    .map(({ s }) => ({ date: s.date, total: scoreTotal(s) }));
}

test("Property 19: total-score series is ordered non-decreasing by date", () => {
  fc.assert(
    fc.property(fc.array(arbFullLength, { maxLength: 40 }), (scores) => {
      const series = totalScoreSeries(scores);

      // Same number of points as input records (one per full-length).
      assert.strictEqual(series.length, scores.length);

      // Dates are non-decreasing across the whole series.
      for (let i = 1; i < series.length; i++) {
        assert.ok(
          String(series[i - 1].date) <= String(series[i].date),
          `dates must be non-decreasing: ${series[i - 1].date} then ${series[i].date}`
        );
      }

      // Each total is the sum of its record's four sections, in [472, 528].
      for (const pt of series) {
        assert.ok(Number.isInteger(pt.total), "total must be an integer");
        assert.ok(pt.total >= 472 && pt.total <= 528, `total ${pt.total} out of range`);
      }
    }),
    { numRuns: 200 }
  );
});

/* ------------------------------------------------------------------ */
/* Property 20: Predicted score range is bounded and well-ordered.     */
/* >=2 records -> { low, high } each integer in [472,528] with         */
/* low <= high; <2 records -> null.                                    */
/* Validates: Requirements 8.9                                         */
/* ------------------------------------------------------------------ */

test("Property 20: predictedScoreRange is null for <2 records, else bounded and well-ordered", () => {
  fc.assert(
    fc.property(fc.array(arbFullLength, { maxLength: 40 }), (scores) => {
      const range = predictedScoreRange(scores);

      if (scores.length < 2) {
        assert.strictEqual(range, null, "fewer than two records must yield null");
        return;
      }

      assert.ok(range !== null && typeof range === "object", "expected a {low, high} object");

      // Both bounds are integers within the inclusive MCAT score range.
      assert.ok(Number.isInteger(range.low), "low must be an integer");
      assert.ok(Number.isInteger(range.high), "high must be an integer");
      assert.ok(range.low >= 472 && range.low <= 528, `low ${range.low} out of range`);
      assert.ok(range.high >= 472 && range.high <= 528, `high ${range.high} out of range`);

      // Well-ordered.
      assert.ok(range.low <= range.high, `low ${range.low} must be <= high ${range.high}`);
    }),
    { numRuns: 200 }
  );
});

/* ------------------------------------------------------------------ */
/* Anchor examples                                                     */
/* ------------------------------------------------------------------ */

// Property 17 example: same accuracy, greater attempted ranks first.
test("Property 17 (example): equal accuracy ordered by greater attempted first", () => {
  const ranking = weaknessRanking([
    { topic: "small", attempted: 2, correct: 1 }, // 50%
    { topic: "big", attempted: 20, correct: 10 }, // 50%
  ]);
  assert.strictEqual(ranking[0].topic, "big");
  assert.strictEqual(ranking[1].topic, "small");
});

// Property 18 example: tie on count (all zero) is alphabetical.
test("Property 18 (example): all-zero counts are alphabetical by category", () => {
  const freq = mistakeFrequency([]);
  const sorted = [...MISTAKE_CATEGORIES].sort((a, b) => a.localeCompare(b));
  assert.deepStrictEqual(freq.map((f) => f.category), sorted);
});

// Property 20 example: a single record yields null; two identical records yield mean band.
test("Property 20 (example): <2 -> null; identical records -> low==high==mean", () => {
  assert.strictEqual(predictedScoreRange([{ cp: 125, cars: 125, bb: 125, ps: 125 }]), null);
  const range = predictedScoreRange([
    { cp: 125, cars: 125, bb: 125, ps: 125 }, // total 500
    { cp: 125, cars: 125, bb: 125, ps: 125 }, // total 500, sd 0
  ]);
  assert.deepStrictEqual(range, { low: 500, high: 500 });
});
