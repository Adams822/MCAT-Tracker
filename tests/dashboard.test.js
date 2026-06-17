"use strict";

// Feature: mcat-tracker-expansion, Property 21: Dashboard weakness preview is a bounded prefix of the ranking
// Feature: mcat-tracker-expansion, Property 22: Goal progress percentages are correct
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
  dashboardWeaknessPreview,
  weaknessRanking,
  weeklyHourProgress,
  dailyQuestionProgress,
} = MCAT;

/* ------------------------------------------------------------------ */
/* Inline arbitraries                                                  */
/* ------------------------------------------------------------------ */

// A valid "YYYY-MM-DD" calendar date produced from fc.date (UTC ISO slice).
const arbISODate = fc
  .date({ min: new Date("2015-01-01T00:00:00Z"), max: new Date("2035-12-31T00:00:00Z") })
  .map((d) => d.toISOString().slice(0, 10));

// A practice set with a small topic alphabet (so collisions/ties are common),
// a positive attempted count, and correct in [0, attempted]. Small alphabet
// keeps the number of distinct topics frequently above 3 so the min(3, n)
// prefix bound is meaningfully exercised.
const arbPracticeSet = fc
  .record({
    topic: fc.constantFrom("alpha", "beta", "gamma", "delta", "epsilon", "zeta"),
    attempted: fc.integer({ min: 1, max: 60 }),
    correctRatio: fc.integer({ min: 0, max: 100 }),
    date: arbISODate,
  })
  .map(({ topic, attempted, correctRatio, date }) => ({
    topic,
    attempted,
    correct: Math.round((correctRatio / 100) * attempted),
    date,
  }));

// A study-sessions map: { "YYYY-MM-DD": minutes }. Dictionary keys are valid
// ISO dates; values are positive minute counts.
const arbSessions = fc.dictionary(arbISODate, fc.integer({ min: 1, max: 600 }), {
  maxKeys: 12,
});

/* ------------------------------------------------------------------ */
/* Independent helpers (do NOT reuse the implementation's internals)   */
/* ------------------------------------------------------------------ */

// Monday (ISO week start) for a valid YYYY-MM-DD string, computed in UTC.
function mondayKey(dateStr) {
  const d = new Date(dateStr + "T00:00:00Z");
  const dow = d.getUTCDay(); // 0=Sun .. 6=Sat
  const offsetToMonday = (dow + 6) % 7; // Mon->0 .. Sun->6
  d.setUTCDate(d.getUTCDate() - offsetToMonday);
  return d.toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ */
/* Property 21: Dashboard weakness preview is a bounded prefix of the  */
/* ranking. Length == min(3, distinct ranked topics) and equals the    */
/* first elements of weaknessRanking.                                  */
/* Validates: Requirements 9.2                                         */
/* ------------------------------------------------------------------ */

test("Property 21: dashboard weakness preview is the min(3, n)-length prefix of weaknessRanking", () => {
  fc.assert(
    fc.property(fc.array(arbPracticeSet, { maxLength: 40 }), (sets) => {
      const ranking = weaknessRanking(sets);
      const preview = dashboardWeaknessPreview(sets);

      // Bounded length: exactly min(3, distinct ranked topics).
      assert.strictEqual(
        preview.length,
        Math.min(3, ranking.length),
        `preview length must be min(3, ${ranking.length})`
      );

      // It is the prefix of the ranking: element-for-element equal.
      for (let i = 0; i < preview.length; i++) {
        assert.deepStrictEqual(
          preview[i],
          ranking[i],
          `preview[${i}] must equal ranking[${i}]`
        );
      }
    }),
    { numRuns: 200 }
  );
});

/* ------------------------------------------------------------------ */
/* Property 22: Goal progress percentages are correct.                 */
/* weeklyHourProgress.pct == round(currentWeekHours / goal * 100);     */
/* dailyQuestionProgress.count == sum of today's attempted questions.  */
/* Validates: Requirements 9.4, 15.2, 15.3                             */
/* ------------------------------------------------------------------ */

test("Property 22a: weeklyHourProgress pct equals round(currentWeekHours / goal * 100)", () => {
  fc.assert(
    fc.property(
      arbSessions,
      fc.integer({ min: 1, max: 100 }),
      arbISODate,
      (sessions, goalHours, today) => {
        // Independently compute the current week's hours from the raw sessions.
        const targetWeek = mondayKey(today);
        let minutes = 0;
        for (const [date, val] of Object.entries(sessions)) {
          if (mondayKey(date) === targetWeek) {
            const m = Number(val);
            if (isFinite(m) && m > 0) minutes += m;
          }
        }
        const expectedHours = minutes / 60;

        const result = weeklyHourProgress(sessions, goalHours, today);

        // Reported hours match the independently computed current-week hours.
        assert.ok(
          Math.abs(result.hours - expectedHours) < 1e-9,
          `hours ${result.hours} must equal current-week hours ${expectedHours}`
        );

        // Percent equals round(hours / goal * 100).
        assert.strictEqual(
          result.pct,
          Math.round((expectedHours / goalHours) * 100),
          `pct must equal round(${expectedHours} / ${goalHours} * 100)`
        );
      }
    ),
    { numRuns: 200 }
  );
});

test("Property 22b: dailyQuestionProgress count equals the sum of today's attempted questions", () => {
  fc.assert(
    fc.property(
      fc.array(arbPracticeSet, { maxLength: 40 }),
      fc.integer({ min: 1, max: 500 }),
      arbISODate,
      (sets, goalQ, today) => {
        // Independently sum today's attempted questions.
        let expectedCount = 0;
        for (const s of sets) {
          if (s.date === today) {
            const a = Number(s.attempted);
            if (isFinite(a) && a > 0) expectedCount += a;
          }
        }

        const result = dailyQuestionProgress(sets, goalQ, today);

        assert.strictEqual(
          result.count,
          expectedCount,
          `count must equal sum of today's attempted (${expectedCount})`
        );

        // Percent equals round(count / goal * 100).
        assert.strictEqual(
          result.pct,
          Math.round((expectedCount / goalQ) * 100),
          `pct must equal round(${expectedCount} / ${goalQ} * 100)`
        );
      }
    ),
    { numRuns: 200 }
  );
});

/* ------------------------------------------------------------------ */
/* Anchor examples                                                     */
/* ------------------------------------------------------------------ */

// Property 21 example: more than three distinct topics -> exactly three previewed.
test("Property 21 (example): preview caps at three lowest-accuracy topics", () => {
  const sets = [
    { topic: "a", attempted: 10, correct: 1 }, // 10%
    { topic: "b", attempted: 10, correct: 2 }, // 20%
    { topic: "c", attempted: 10, correct: 3 }, // 30%
    { topic: "d", attempted: 10, correct: 4 }, // 40%
  ];
  const preview = dashboardWeaknessPreview(sets);
  assert.strictEqual(preview.length, 3);
  assert.deepStrictEqual(preview.map((p) => p.topic), ["a", "b", "c"]);
});

// Property 21 example: fewer than three topics -> preview length equals topic count.
test("Property 21 (example): preview length never exceeds the number of ranked topics", () => {
  const preview = dashboardWeaknessPreview([{ topic: "solo", attempted: 5, correct: 2 }]);
  assert.strictEqual(preview.length, 1);
  assert.strictEqual(preview[0].topic, "solo");
  assert.deepStrictEqual(dashboardWeaknessPreview([]), []);
});

// Property 22 example: a half-met weekly hour goal reports 50%.
test("Property 22 (example): 5 hours toward a 10-hour goal in the current week is 50%", () => {
  // 2024-06-10 is a Monday; 300 minutes = 5 hours.
  const result = weeklyHourProgress({ "2024-06-10": 300 }, 10, "2024-06-12");
  assert.strictEqual(result.hours, 5);
  assert.strictEqual(result.pct, 50);
});

// Property 22 example: today's attempted questions sum across sets.
test("Property 22 (example): daily question count sums only today's sets", () => {
  const sets = [
    { topic: "x", attempted: 20, correct: 10, date: "2024-06-12" },
    { topic: "y", attempted: 30, correct: 15, date: "2024-06-12" },
    { topic: "z", attempted: 99, correct: 1, date: "2024-06-11" },
  ];
  const result = dailyQuestionProgress(sets, 100, "2024-06-12");
  assert.strictEqual(result.count, 50);
  assert.strictEqual(result.pct, 50);
});
