"use strict";

// Property tests for the Resource Tracker pure helpers in core.js:
//   completionPct, validateResourceCounts, sortByPriority (+ PRIORITY_LEVELS).
//
// Dev-only: part of the test harness, never shipped with the app. This file is
// intentionally self-contained — it defines its own fast-check arbitraries and
// does NOT import tests/helpers.js.

const { test } = require("node:test");
const assert = require("node:assert");
const fc = require("fast-check");
const MCAT = require("../core.js");

const { completionPct, validateResourceCounts, sortByPriority, PRIORITY_LEVELS } = MCAT;

// --- Helpers ----------------------------------------------------------------

// Parse the numeric prefix of a "x.x%" completion string.
function parsePct(s) {
  assert.strictEqual(typeof s, "string", "completionPct must return a string");
  assert.ok(s.endsWith("%"), `expected trailing "%" in ${JSON.stringify(s)}`);
  return Number(s.slice(0, -1));
}

// Count of decimal places in a finite number's default string form.
function decimalPlaces(n) {
  if (Number.isInteger(n)) return 0;
  const s = String(n);
  const dot = s.indexOf(".");
  return dot < 0 ? 0 : s.length - dot - 1;
}

// Rank of a priority label: lower = higher priority; unknown sorts last.
function rankOf(priority) {
  const i = PRIORITY_LEVELS.indexOf(priority);
  return i < 0 ? PRIORITY_LEVELS.length : i;
}

// --- Property 29 ------------------------------------------------------------

// Feature: mcat-tracker-expansion, Property 29: Resource completion percentage handles the zero denominator
// Validates: Requirements 12.2, 12.3
test("Property 29: completionPct returns 0% when total is 0, else completed/total*100 to 1 dp in [0,100]", () => {
  fc.assert(
    fc.property(
      // Non-negative integers with completed <= total (total may be 0).
      fc
        .integer({ min: 0, max: 999999 })
        .chain((total) =>
          fc.integer({ min: 0, max: total }).map((completed) => ({ completed, total }))
        ),
      ({ completed, total }) => {
        const out = completionPct(completed, total);

        if (total === 0) {
          // Zero denominator: exactly "0%", no division performed.
          assert.strictEqual(out, "0%");
          return;
        }

        const value = parsePct(out);
        assert.ok(Number.isFinite(value), "numeric value must be finite");
        assert.ok(value >= 0 && value <= 100, `value ${value} must be within [0,100]`);
        assert.ok(decimalPlaces(value) <= 1, `value ${value} exceeds one decimal place`);

        const raw = (completed / total) * 100;
        assert.ok(
          Math.abs(value - raw) <= 0.05 + 1e-9,
          `value ${value} not within 0.05 of raw ${raw}`
        );
      }
    ),
    { numRuns: 100 }
  );
});

// --- Property 30 ------------------------------------------------------------

// Feature: mcat-tracker-expansion, Property 30: Resource count validation
// Validates: Requirements 12.4, 12.5
test("Property 30: validateResourceCounts accepts iff both are integers >= 0 and completed <= total", () => {
  // Candidate values spanning valid integers, non-integers, negatives, and junk.
  const arbCandidate = fc.oneof(
    fc.integer({ min: -50, max: 50 }),
    fc.double({ min: -50, max: 50, noNaN: true, noDefaultInfinity: true }),
    fc.constantFrom(0, 1, 2, 10, 100, -1, -0.5, 1.5, NaN, Infinity, -Infinity),
    fc.constantFrom(null, undefined, "", " ", "5", "5.5", "abc", true, [])
  );

  fc.assert(
    fc.property(arbCandidate, arbCandidate, (completed, total) => {
      const result = validateResourceCounts(completed, total);

      const isWholeNonNeg = (v) =>
        (typeof v === "number" || typeof v === "string") &&
        !(typeof v === "string" && v.trim() === "") &&
        Number.isInteger(Number(v)) &&
        Number(v) >= 0;

      const expectedOk =
        isWholeNonNeg(completed) &&
        isWholeNonNeg(total) &&
        Number(completed) <= Number(total);

      assert.strictEqual(
        result.ok,
        expectedOk,
        `completed=${String(completed)} total=${String(total)} -> ${JSON.stringify(result)}`
      );
      if (!result.ok) {
        assert.strictEqual(typeof result.reason, "string");
        assert.ok(result.reason.length > 0, "rejection must include a reason");
      }
    }),
    { numRuns: 200 }
  );
});

// --- Property 31 ------------------------------------------------------------

// Feature: mcat-tracker-expansion, Property 31: Priority sort ordering
// Validates: Requirements 12.7
test("Property 31: sortByPriority orders resources from highest to lowest priority, stably, without mutating input", () => {
  const arbEntry = fc.record({
    id: fc.integer({ min: 1, max: 1e9 }),
    // Include known levels plus occasional unknown/missing priorities.
    priority: fc.oneof(
      fc.constantFrom(...PRIORITY_LEVELS),
      fc.constantFrom("urgent", "", undefined)
    ),
  });

  fc.assert(
    fc.property(fc.array(arbEntry, { maxLength: 30 }), (resources) => {
      const before = resources.map((r) => ({ ...r }));
      const sorted = sortByPriority(resources);

      // Pure: returns a new array and does not mutate the input.
      assert.notStrictEqual(sorted, resources, "must return a new array");
      assert.deepStrictEqual(resources, before, "input must not be mutated");

      // Same multiset of elements (it's a permutation).
      assert.strictEqual(sorted.length, resources.length);
      const idCount = (arr) => {
        const m = new Map();
        for (const r of arr) m.set(r.id, (m.get(r.id) || 0) + 1);
        return m;
      };
      assert.deepStrictEqual(idCount(sorted), idCount(resources));

      // Ranks are non-decreasing (highest priority first).
      for (let i = 1; i < sorted.length; i++) {
        assert.ok(
          rankOf(sorted[i - 1].priority) <= rankOf(sorted[i].priority),
          `out of order at ${i}: ${sorted[i - 1].priority} then ${sorted[i].priority}`
        );
      }

      // Stable: within each priority rank, original relative order is preserved.
      const origIndex = new Map();
      resources.forEach((r, i) => {
        if (!origIndex.has(r)) origIndex.set(r, i);
      });
      for (let i = 1; i < sorted.length; i++) {
        if (rankOf(sorted[i - 1].priority) === rankOf(sorted[i].priority)) {
          assert.ok(
            origIndex.get(sorted[i - 1]) < origIndex.get(sorted[i]),
            "equal-priority entries must keep original order"
          );
        }
      }
    }),
    { numRuns: 100 }
  );
});
