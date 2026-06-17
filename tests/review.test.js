"use strict";

// Property tests for the spaced-repetition / Review_Tracker math in core.js:
//   nextInterval, markReviewed, markMissed, reviewState, dueCount,
//   retentionRate, topicsByRetention.
//
// Dev-only: part of the test harness, never shipped with the app. This file is
// intentionally self-contained — it defines its own fast-check arbitraries and
// does NOT import tests/helpers.js.

const { test } = require("node:test");
const assert = require("node:assert");
const fc = require("fast-check");
const MCAT = require("../core.js");

const {
  REVIEW_INTERVALS,
  addDaysISO,
  markReviewed,
  markMissed,
  reviewState,
  dueCount,
  retentionRate,
  topicsByRetention,
} = MCAT;

// Fixed reference "today" for determinism across all properties.
const TODAY = "2024-06-15";

// --- Shared arbitraries -----------------------------------------------------

const arbId = fc.integer({ min: 1, max: 1e12 });
const arbTopic = fc.constantFrom("Kinetics", "Acids", "Genetics", "Optics", "Hormones", "");

// A fresh ("new") review item: never reviewed or missed, interval not advanced.
const arbNewItem = fc.record({
  id: arbId,
  topic: arbTopic,
  content: fc.string({ maxLength: 30 }),
  state: fc.constant("new"),
  intervalIndex: fc.constant(-1),
  nextDue: fc.constant(""),
  reviewedMarks: fc.constant(0),
  missedMarks: fc.constant(0),
});

// --- Property 24 ------------------------------------------------------------

// Feature: mcat-tracker-expansion, Property 24: Spaced-repetition interval progression
// Validates: Requirements 11.4, 11.5
test("Property 24: repeated markReviewed advances 1->3->7->21 then caps at 21, with nextDue and state correct", () => {
  fc.assert(
    fc.property(arbNewItem, fc.integer({ min: 1, max: 12 }), (item, reviews) => {
      // The interval after the k-th consecutive review (1-indexed), capped at 21.
      const expectedIntervalAfter = (k) =>
        REVIEW_INTERVALS[Math.min(k - 1, REVIEW_INTERVALS.length - 1)];

      let cur = item;
      for (let k = 1; k <= reviews; k++) {
        cur = markReviewed(cur, TODAY);
        const interval = expectedIntervalAfter(k);

        // Interval progresses through the sequence then caps at 21.
        assert.strictEqual(
          REVIEW_INTERVALS[cur.intervalIndex],
          interval,
          `after ${k} reviews interval should be ${interval}`
        );

        // nextDue == today + interval.
        assert.strictEqual(cur.nextDue, addDaysISO(TODAY, interval));

        // reviewedMarks counts every review.
        assert.strictEqual(cur.reviewedMarks, k);

        // State is "reviewed" until the interval reaches 21, then "mature".
        assert.strictEqual(cur.state, interval >= 21 ? "mature" : "reviewed");
      }

      // Final interval never exceeds the 21-day cap.
      assert.ok(REVIEW_INTERVALS[cur.intervalIndex] <= 21);
    }),
    { numRuns: 200 }
  );
});

// --- Property 25 ------------------------------------------------------------

// Feature: mcat-tracker-expansion, Property 25: Marking missed resets the interval
// Validates: Requirements 11.6
test("Property 25: markMissed resets interval to 1 day, nextDue to today+1, and state to 'missed'", () => {
  fc.assert(
    fc.property(
      // Any item, regardless of how far its interval had advanced.
      fc.record({
        id: arbId,
        topic: arbTopic,
        content: fc.string({ maxLength: 30 }),
        state: fc.constantFrom("new", "reviewed", "mature", "due", "missed"),
        intervalIndex: fc.integer({ min: -1, max: REVIEW_INTERVALS.length - 1 }),
        nextDue: fc.constantFrom("", "2024-06-01", "2024-12-31"),
        reviewedMarks: fc.integer({ min: 0, max: 20 }),
        missedMarks: fc.integer({ min: 0, max: 20 }),
      }),
      (item) => {
        const before = item.missedMarks;
        const result = markMissed(item, TODAY);

        // Interval reset to 1 day (intervalIndex 0).
        assert.strictEqual(result.intervalIndex, 0);
        assert.strictEqual(REVIEW_INTERVALS[result.intervalIndex], 1);

        // nextDue == today + 1.
        assert.strictEqual(result.nextDue, addDaysISO(TODAY, 1));

        // State is "missed" and the missed counter increments.
        assert.strictEqual(result.state, "missed");
        assert.strictEqual(result.missedMarks, before + 1);
      }
    ),
    { numRuns: 200 }
  );
});

// --- Property 26 ------------------------------------------------------------

// Feature: mcat-tracker-expansion, Property 26: Review state classification and due count
// Validates: Requirements 11.2, 11.3, 11.7, 9.3
test("Property 26: reviewState reports 'new'/'due' correctly and dueCount counts nextDue <= today", () => {
  // An item generator that may be brand-new or have a date-based nextDue around today.
  const arbDatedItem = fc.record({
    id: arbId,
    topic: arbTopic,
    reviewedMarks: fc.integer({ min: 0, max: 10 }),
    missedMarks: fc.integer({ min: 0, max: 10 }),
    intervalIndex: fc.integer({ min: -1, max: REVIEW_INTERVALS.length - 1 }),
    // nextDue spread before, on, and after today.
    nextDue: fc.integer({ min: -30, max: 30 }).map((off) => addDaysISO(TODAY, off)),
  });

  fc.assert(
    fc.property(fc.array(arbDatedItem, { maxLength: 25 }), (items) => {
      // dueCount: items with a valid nextDue on or before today.
      const expectedDue = items.filter((it) => it.nextDue !== "" && it.nextDue <= TODAY).length;
      assert.strictEqual(dueCount(items, TODAY), expectedDue);

      for (const it of items) {
        const st = reviewState(it, TODAY);
        const noMarks = it.reviewedMarks + it.missedMarks === 0;
        const due = it.nextDue !== "" && it.nextDue <= TODAY;

        if (noMarks) {
          // Never reviewed or missed => "new".
          assert.strictEqual(st, "new");
        } else if (due) {
          // nextDue on or before today => "due" (overrides reviewed/mature).
          assert.strictEqual(st, "due");
        } else {
          // Otherwise it must be one of the non-new, non-due states.
          assert.ok(["reviewed", "mature", "missed"].includes(st));
        }
      }
    }),
    { numRuns: 200 }
  );
});

// --- Property 27 ------------------------------------------------------------

// Feature: mcat-tracker-expansion, Property 27: Retention rate handles the zero denominator
// Validates: Requirements 11.8, 11.9
test("Property 27: retentionRate is 'N/A' on zero denominator, else round(reviewed/(reviewed+missed)*100) in [0,100]", () => {
  const arbMarkItem = fc.record({
    id: arbId,
    topic: arbTopic,
    reviewedMarks: fc.integer({ min: 0, max: 1000 }),
    missedMarks: fc.integer({ min: 0, max: 1000 }),
  });

  fc.assert(
    fc.property(fc.array(arbMarkItem, { maxLength: 30 }), (items) => {
      const reviewed = items.reduce((s, it) => s + it.reviewedMarks, 0);
      const missed = items.reduce((s, it) => s + it.missedMarks, 0);
      const total = reviewed + missed;

      const result = retentionRate(items);

      if (total === 0) {
        assert.strictEqual(result, "N/A");
      } else {
        assert.strictEqual(result, Math.round((reviewed / total) * 100));
        assert.ok(Number.isInteger(result));
        assert.ok(result >= 0 && result <= 100);
      }
    }),
    { numRuns: 200 }
  );
});

// --- Property 28 ------------------------------------------------------------

// Feature: mcat-tracker-expansion, Property 28: Topics ordered by ascending retention with tie-break
// Validates: Requirements 11.10
test("Property 28: topicsByRetention is sorted ascending by rate, ties broken alphabetically by topic", () => {
  // Items carrying a topic and marks, so distinct topics produce distinct rates.
  const arbTopicItem = fc.record({
    id: arbId,
    topic: fc.constantFrom("alpha", "beta", "gamma", "delta", "epsilon"),
    reviewedMarks: fc.integer({ min: 0, max: 50 }),
    missedMarks: fc.integer({ min: 0, max: 50 }),
  });

  fc.assert(
    fc.property(fc.array(arbTopicItem, { maxLength: 40 }), (items) => {
      const out = topicsByRetention(items);

      // Recompute the expected per-topic rates (omitting zero-denominator topics).
      const agg = new Map();
      for (const it of items) {
        const cur = agg.get(it.topic) || { reviewed: 0, missed: 0 };
        cur.reviewed += it.reviewedMarks;
        cur.missed += it.missedMarks;
        agg.set(it.topic, cur);
      }
      let expectedTopics = 0;
      for (const [, m] of agg) {
        if (m.reviewed + m.missed > 0) expectedTopics++;
      }

      // One entry per non-empty topic.
      assert.strictEqual(out.length, expectedTopics);

      // Sorted ascending by rate; ties broken alphabetically by topic.
      for (let i = 1; i < out.length; i++) {
        const prev = out[i - 1];
        const cur = out[i];
        const ordered =
          prev.rate < cur.rate ||
          (prev.rate === cur.rate && prev.topic <= cur.topic);
        assert.ok(
          ordered,
          `ordering violated at ${i}: ${JSON.stringify(prev)} before ${JSON.stringify(cur)}`
        );
      }

      // Every emitted rate is a bounded integer percentage.
      for (const { rate } of out) {
        assert.ok(Number.isInteger(rate) && rate >= 0 && rate <= 100);
      }
    }),
    { numRuns: 200 }
  );
});
