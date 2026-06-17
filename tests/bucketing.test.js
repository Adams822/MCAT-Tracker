"use strict";

// Feature: mcat-tracker-expansion, Property 13: Total score equals the sum of sections and stays in range
// Feature: mcat-tracker-expansion, Property 16: Weekly bucketing is total-preserving and Monday-aligned
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

const { scoreTotal, weeklyBucketKey, weeklyVolume, weeklyHours } = MCAT;

/* ------------------------------------------------------------------ */
/* Inline arbitraries                                                  */
/* ------------------------------------------------------------------ */

// A valid Section_Score: integer 118..132.
const arbSection = fc.integer({ min: 118, max: 132 });

// A valid "YYYY-MM-DD" calendar date produced from fc.date (UTC ISO slice).
const arbISODate = fc
  .date({ min: new Date("2015-01-01T00:00:00Z"), max: new Date("2035-12-31T00:00:00Z") })
  .map((d) => d.toISOString().slice(0, 10));

// A dated practice set whose `attempted` is a positive integer, so every set
// is counted by weeklyVolume (date valid + attempted finite/positive).
const arbDatedSet = fc.record({
  id: fc.nat(),
  date: arbISODate,
  section: fc.constantFrom("C/P", "CARS", "B/B", "P/S"),
  topic: fc.string({ maxLength: 20 }),
  correct: fc.nat({ max: 9999 }),
  attempted: fc.integer({ min: 1, max: 9999 }),
});

// A sessions map "YYYY-MM-DD" -> positive minutes, so every entry is counted by
// weeklyHours (date valid + minutes finite/positive).
const arbSessions = fc.dictionary(arbISODate, fc.integer({ min: 1, max: 1440 }), {
  maxKeys: 12,
});

/* ------------------------------------------------------------------ */
/* Property 13: Total score equals the sum of sections and stays in    */
/* range.                                                              */
/* Validates: Requirements 7.2                                         */
/* ------------------------------------------------------------------ */

test("Property 13: scoreTotal equals the sum of the four sections and lands in 472..528", () => {
  fc.assert(
    fc.property(arbSection, arbSection, arbSection, arbSection, (cp, cars, bb, ps) => {
      const total = scoreTotal({ cp, cars, bb, ps });

      // (a) total is exactly the sum of the four section scores.
      assert.strictEqual(total, cp + cars + bb + ps, "scoreTotal must equal cp+cars+bb+ps");

      // (b) total is an integer in [472, 528].
      assert.ok(Number.isInteger(total), "scoreTotal must be an integer");
      assert.ok(total >= 472 && total <= 528, `scoreTotal ${total} out of range 472..528`);
    }),
    { numRuns: 200 }
  );
});

/* ------------------------------------------------------------------ */
/* Property 16: Weekly bucketing is total-preserving and Monday-       */
/* aligned.                                                            */
/* Validates: Requirements 8.3, 8.4                                    */
/* ------------------------------------------------------------------ */

// A bucket key is a Monday iff its UTC weekday is 1 (0=Sun..6=Sat).
function isMonday(weekStart) {
  return new Date(weekStart + "T00:00:00Z").getUTCDay() === 1;
}

test("Property 16: weeklyVolume preserves total attempted and emits only Monday buckets", () => {
  fc.assert(
    fc.property(fc.array(arbDatedSet, { maxLength: 30 }), (sets) => {
      const buckets = weeklyVolume(sets);

      // total-preserving: Σ bucket attempted === Σ attempted across all
      // valid-dated sets (every generated set is valid-dated + positive).
      const bucketTotal = buckets.reduce((acc, b) => acc + b.attempted, 0);
      const expectedTotal = sets.reduce((acc, s) => acc + s.attempted, 0);
      assert.strictEqual(bucketTotal, expectedTotal, "weeklyVolume must preserve total attempted");

      // Monday-aligned: every returned weekStart is a Monday, and matches the
      // bucket key of every set assigned to it.
      for (const b of buckets) {
        assert.ok(isMonday(b.weekStart), `weekStart ${b.weekStart} is not a Monday`);
      }

      // every set's bucket key must appear in the returned buckets and be a Monday.
      const keys = new Set(buckets.map((b) => b.weekStart));
      for (const s of sets) {
        const key = weeklyBucketKey(s.date);
        assert.ok(keys.has(key), `bucket key ${key} for ${s.date} missing from weeklyVolume output`);
        assert.ok(isMonday(key), `weeklyBucketKey(${s.date}) -> ${key} is not a Monday`);
      }

      // ascending order by weekStart.
      const sorted = [...buckets].map((b) => b.weekStart).sort();
      assert.deepStrictEqual(buckets.map((b) => b.weekStart), sorted, "buckets must be ascending");
    }),
    { numRuns: 150 }
  );
});

test("Property 16: weeklyHours preserves total minutes/60 and emits only Monday buckets", () => {
  fc.assert(
    fc.property(arbSessions, (sessions) => {
      const buckets = weeklyHours(sessions);

      // total-preserving: Σ bucket hours === (Σ all valid-dated minutes)/60.
      // Compare in the minutes domain to avoid floating-point drift.
      const bucketMinutes = buckets.reduce((acc, b) => acc + b.hours * 60, 0);
      const expectedMinutes = Object.values(sessions).reduce((acc, m) => acc + m, 0);
      assert.ok(
        Math.abs(bucketMinutes - expectedMinutes) < 1e-6,
        `weeklyHours must preserve total: got ${bucketMinutes} min, expected ${expectedMinutes} min`
      );

      // Monday-aligned: every returned weekStart is a Monday.
      for (const b of buckets) {
        assert.ok(isMonday(b.weekStart), `weekStart ${b.weekStart} is not a Monday`);
      }

      // every session date's bucket key must appear and be a Monday.
      const keys = new Set(buckets.map((b) => b.weekStart));
      for (const dateKey of Object.keys(sessions)) {
        const key = weeklyBucketKey(dateKey);
        assert.ok(keys.has(key), `bucket key ${key} for ${dateKey} missing from weeklyHours output`);
        assert.ok(isMonday(key), `weeklyBucketKey(${dateKey}) -> ${key} is not a Monday`);
      }

      // ascending order by weekStart.
      const sorted = [...buckets].map((b) => b.weekStart).sort();
      assert.deepStrictEqual(buckets.map((b) => b.weekStart), sorted, "buckets must be ascending");
    }),
    { numRuns: 150 }
  );
});

// Anchor example: a Sunday belongs to the week that began the preceding Monday.
test("Property 16 (example): Sunday buckets to the preceding Monday", () => {
  // 2024-01-07 is a Sunday; its Monday is 2024-01-01.
  assert.strictEqual(weeklyBucketKey("2024-01-07"), "2024-01-01");
  assert.ok(isMonday("2024-01-01"));
  // 2024-01-01 is itself a Monday and buckets to itself.
  assert.strictEqual(weeklyBucketKey("2024-01-01"), "2024-01-01");
});

// Anchor example: scoreTotal of the max/min section scores hits the range bounds.
test("Property 13 (example): boundary section scores hit 472 and 528", () => {
  assert.strictEqual(scoreTotal({ cp: 118, cars: 118, bb: 118, ps: 118 }), 472);
  assert.strictEqual(scoreTotal({ cp: 132, cars: 132, bb: 132, ps: 132 }), 528);
});
