"use strict";

// Property tests for the core accuracy helpers in core.js:
//   percentCorrect, computeGroupAccuracy, accuracyByTopic, accuracyBySection,
//   timedVsUntimed, accuracyOverTime.
//
// Dev-only: part of the test harness, never shipped with the app. This file is
// intentionally self-contained — it defines its own fast-check arbitraries and
// does NOT import tests/helpers.js.

const { test } = require("node:test");
const assert = require("node:assert");
const fc = require("fast-check");
const MCAT = require("../core.js");

const {
  percentCorrect,
  computeGroupAccuracy,
  accuracyByTopic,
  accuracyBySection,
  timedVsUntimed,
  accuracyOverTime,
} = MCAT;

// --- Inline arbitraries -----------------------------------------------------

const SECTIONS = ["C/P", "CARS", "B/B", "P/S"];
const TOPICS = ["amino acids", "kinematics", "thermo", "ethics", ""];
const TIMINGS = ["timed", "untimed"];

const arbId = fc.integer({ min: 1, max: 1e12 });

// A valid "YYYY-MM-DD" calendar date string.
const arbISODate = fc
  .date({ min: new Date("2020-01-01"), max: new Date("2030-12-31") })
  .map((d) => d.toISOString().slice(0, 10));

// A fully-valid PracticeSet-like record: attempted 1..9999, correct 0..attempted.
const arbValidSet = fc
  .record({
    id: arbId,
    date: arbISODate,
    section: fc.constantFrom(...SECTIONS),
    topic: fc.constantFrom(...TOPICS),
    timing: fc.constantFrom(...TIMINGS),
    attempted: fc.integer({ min: 1, max: 9999 }),
  })
  .chain((s) =>
    fc.integer({ min: 0, max: s.attempted }).map((correct) => ({ ...s, correct }))
  );

// A "mixed" record that ALSO allows attempted === 0 (and therefore correct 0)
// so that empty/zero-attempted groups exercise the omission/null paths.
const arbMixedSet = fc
  .record({
    id: arbId,
    date: arbISODate,
    section: fc.constantFrom(...SECTIONS),
    topic: fc.constantFrom(...TOPICS),
    timing: fc.constantFrom(...TIMINGS),
    attempted: fc.integer({ min: 0, max: 9999 }),
  })
  .chain((s) =>
    fc.integer({ min: 0, max: s.attempted }).map((correct) => ({ ...s, correct }))
  );

// --- Helpers ----------------------------------------------------------------

// Count of decimal places in a finite number's default string form.
function decimalPlaces(n) {
  if (Number.isInteger(n)) return 0;
  const s = String(n);
  const dot = s.indexOf(".");
  return dot < 0 ? 0 : s.length - dot - 1;
}

// Expected Σattempted / Σcorrect over a group. Because every record has
// attempted >= 0 and 0 <= correct <= attempted, summing all values matches the
// implementation's "skip non-positive" sums (zeros contribute nothing).
function sums(group) {
  let attempted = 0;
  let correct = 0;
  for (const s of group) {
    attempted += s.attempted;
    correct += s.correct;
  }
  return { attempted, correct };
}

// --- Property 4 -------------------------------------------------------------

// Feature: mcat-tracker-expansion, Property 4: Percent-correct computation is bounded and correct
// Validates: Requirements 3.3
test("Property 4: percentCorrect is an integer in [0,100] equal to round(correct/attempted*100)", () => {
  fc.assert(
    fc.property(
      fc
        .integer({ min: 1, max: 9999 })
        .chain((attempted) =>
          fc.integer({ min: 0, max: attempted }).map((correct) => ({ attempted, correct }))
        ),
      ({ attempted, correct }) => {
        const pct = percentCorrect(correct, attempted);
        assert.ok(Number.isInteger(pct), "percent must be an integer");
        assert.ok(pct >= 0 && pct <= 100, "percent must be within [0,100]");
        assert.strictEqual(pct, Math.round((correct / attempted) * 100));
      }
    ),
    { numRuns: 100 }
  );
});

// --- Property 6 -------------------------------------------------------------

// Feature: mcat-tracker-expansion, Property 6: Group accuracy is bounded and omits empty groups
// Validates: Requirements 4.5, 4.6, 8.1, 8.2, 9.1, 10.3, 10.4
test("Property 6: computeGroupAccuracy returns null on zero attempted else a bounded value at configured precision", () => {
  fc.assert(
    fc.property(
      fc.array(arbMixedSet, { maxLength: 12 }),
      fc.constantFrom(undefined, { dp: 0 }), // default (1 dp) and whole-number
      (group, opts) => {
        const dp = opts && typeof opts.dp === "number" ? opts.dp : 1;
        const { attempted, correct } = sums(group);
        const result = computeGroupAccuracy(group, opts);

        if (attempted === 0) {
          // No division performed; the group is omitted by callers.
          assert.strictEqual(result, null);
          return;
        }

        assert.strictEqual(typeof result, "number");
        assert.ok(result >= 0 && result <= 100, "accuracy must be within [0,100]");

        // Equal to Σcorrect / Σattempted * 100 rounded to the configured precision.
        const raw = (correct / attempted) * 100;
        const tol = 0.5 / Math.pow(10, dp) + 1e-9;
        assert.ok(
          Math.abs(result - raw) <= tol,
          `result ${result} not within ${tol} of raw ${raw}`
        );
        assert.ok(
          decimalPlaces(result) <= dp,
          `result ${result} exceeds ${dp} decimal places`
        );
      }
    ),
    { numRuns: 100 }
  );
});

// --- Property 7 -------------------------------------------------------------

// Feature: mcat-tracker-expansion, Property 7: Grouped accuracy emits one value per distinct non-empty key
// Validates: Requirements 4.2, 4.3, 4.4
test("Property 7: by-topic/by-section/timed-vs-untimed emit exactly one value per distinct positive-attempted key", () => {
  fc.assert(
    fc.property(fc.array(arbMixedSet, { maxLength: 14 }), (sets) => {
      // Expected distinct keys = those whose summed (positive) attempted > 0.
      const expectedKeys = (keyName) => {
        const totals = new Map();
        for (const s of sets) {
          const a = s.attempted;
          if (a > 0) totals.set(s[keyName], (totals.get(s[keyName]) || 0) + a);
        }
        return new Set([...totals.entries()].filter(([, v]) => v > 0).map(([k]) => k));
      };

      // by-topic
      const byTopic = accuracyByTopic(sets);
      const topicKeys = byTopic.map((e) => e.topic);
      assert.strictEqual(new Set(topicKeys).size, topicKeys.length, "no duplicate topic keys");
      assert.deepStrictEqual(new Set(topicKeys), expectedKeys("topic"));
      for (const e of byTopic) {
        assert.strictEqual(typeof e.pct, "number");
        assert.ok(e.pct >= 0 && e.pct <= 100);
      }

      // by-section
      const bySection = accuracyBySection(sets);
      const sectionKeys = bySection.map((e) => e.section);
      assert.strictEqual(new Set(sectionKeys).size, sectionKeys.length, "no duplicate section keys");
      assert.deepStrictEqual(new Set(sectionKeys), expectedKeys("section"));
      for (const e of bySection) {
        assert.strictEqual(typeof e.pct, "number");
        assert.ok(e.pct >= 0 && e.pct <= 100);
      }

      // timed-vs-untimed: each side null iff that group's attempted sum is zero.
      const tvu = timedVsUntimed(sets);
      const timedAttempted = sets
        .filter((s) => s.timing === "timed")
        .reduce((acc, s) => acc + (s.attempted > 0 ? s.attempted : 0), 0);
      const untimedAttempted = sets
        .filter((s) => s.timing === "untimed")
        .reduce((acc, s) => acc + (s.attempted > 0 ? s.attempted : 0), 0);

      assert.strictEqual(tvu.timed === null, timedAttempted === 0);
      assert.strictEqual(tvu.untimed === null, untimedAttempted === 0);
      if (tvu.timed !== null) assert.ok(tvu.timed >= 0 && tvu.timed <= 100);
      if (tvu.untimed !== null) assert.ok(tvu.untimed >= 0 && tvu.untimed <= 100);
    }),
    { numRuns: 100 }
  );
});

// --- Property 8 -------------------------------------------------------------

// Feature: mcat-tracker-expansion, Property 8: Accuracy-over-time is chronological and bounded
// Validates: Requirements 4.1, 3.8
test("Property 8: accuracyOverTime returns one point per set, non-decreasing by date, each pct an integer in [0,100]", () => {
  fc.assert(
    fc.property(fc.array(arbValidSet, { maxLength: 14 }), (sets) => {
      const points = accuracyOverTime(sets);

      // One point per set.
      assert.strictEqual(points.length, sets.length);

      // Non-decreasing by date string and bounded integer pct.
      for (let i = 0; i < points.length; i++) {
        const pct = points[i].pct;
        assert.ok(Number.isInteger(pct), "pct must be an integer");
        assert.ok(pct >= 0 && pct <= 100, "pct must be within [0,100]");
        if (i > 0) {
          assert.ok(
            String(points[i - 1].date) <= String(points[i].date),
            "points must be ordered non-decreasing by date"
          );
        }
      }
    }),
    { numRuns: 100 }
  );
});
