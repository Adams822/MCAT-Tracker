"use strict";

// Property-based tests for the Daily Study Log pure helpers in core.js (Req 16):
//   - MCAT.validateDailyLog  (Req 16.1, 16.3)
//   - MCAT.upsertDailyLog    (Req 16.2)
//
// Covers design Correctness Properties 38, 39, 40. Local arbitraries only
// (tests/helpers.js is intentionally not edited). Dev-only: part of the test
// harness, never shipped with the app.
//
// NOTE: test titles use plain ASCII only (no em-dash / arrows) to avoid the
// known TAP-lexer issue with non-ASCII characters in test names.

const { test } = require("node:test");
const assert = require("node:assert");
const fc = require("fast-check");
const MCAT = require("../core.js");

const { validateDailyLog, upsertDailyLog, isValidISODate } = MCAT;

// --- Local arbitraries ------------------------------------------------------

// A valid "YYYY-MM-DD" calendar date string.
const arbValidDateStr = fc
  .date({ min: new Date("2000-01-01"), max: new Date("2035-12-31") })
  .map((d) => d.toISOString().slice(0, 10));

// Strings that are not valid ISO calendar dates.
const arbInvalidDateStr = fc.oneof(
  fc.constantFrom(
    "2024-02-30", // Feb 30 does not exist
    "2024-13-01", // month 13
    "2024-00-10", // month 0
    "2023-02-29", // 2023 is not a leap year
    "2024-1-1", // not zero-padded
    "20240101", // missing separators
    "2024/01/01", // wrong separator
    "not-a-date",
    ""
  ),
  fc.string({ maxLength: 12 })
);

// A fully-valid Daily_Log_Entry (all numeric fields in range, valid date).
// hours are restricted to multiples of 0.1 so they satisfy the "<=1 decimal" rule.
const arbValidEntry = fc.record({
  date: arbValidDateStr,
  hours: fc.integer({ min: 0, max: 240 }).map((n) => n / 10),
  questions: fc.integer({ min: 0, max: 9999 }),
  accuracy: fc.integer({ min: 0, max: 100 }),
  subject: fc.string({ maxLength: 60 }),
  energy: fc.integer({ min: 1, max: 5 }),
  confidence: fc.integer({ min: 1, max: 5 }),
  reflection: fc.string({ maxLength: 300 }),
});

// Valid entries drawn from a small date pool so same-date collisions are common.
const arbDatePool = fc.constantFrom(
  "2024-01-01",
  "2024-01-02",
  "2024-01-03",
  "2024-02-15",
  "2024-12-31"
);
const arbPooledEntry = fc.record({
  date: arbDatePool,
  hours: fc.integer({ min: 0, max: 240 }).map((n) => n / 10),
  questions: fc.integer({ min: 0, max: 9999 }),
  accuracy: fc.integer({ min: 0, max: 100 }),
  subject: fc.string({ maxLength: 40 }),
  energy: fc.integer({ min: 1, max: 5 }),
  confidence: fc.integer({ min: 1, max: 5 }),
  reflection: fc.string({ maxLength: 120 }),
});

// Field generators that mix in-range and out-of-range numeric VALUES (numbers
// only, so coercion is the identity and the spec predicate below is exact).
const arbHoursField = fc.oneof(
  { weight: 3, arbitrary: fc.integer({ min: 0, max: 240 }).map((n) => n / 10) }, // valid, <=1dp
  { weight: 1, arbitrary: fc.integer({ min: 241, max: 1000 }) }, // above 24
  { weight: 1, arbitrary: fc.integer({ min: -500, max: -1 }) }, // below 0
  {
    weight: 1,
    arbitrary: fc
      .integer({ min: 1, max: 2400 })
      .map((n) => n / 100)
      .filter((v) => Math.abs(v * 10 - Math.round(v * 10)) >= 1e-9), // 2 decimal places
  }
);
const arbQuestionsField = fc.oneof(
  { weight: 3, arbitrary: fc.integer({ min: 0, max: 9999 }) }, // valid
  { weight: 1, arbitrary: fc.integer({ min: 10000, max: 50000 }) }, // too large
  { weight: 1, arbitrary: fc.integer({ min: -5000, max: -1 }) }, // negative
  { weight: 1, arbitrary: fc.integer({ min: 0, max: 9999 }).map((n) => n + 0.5) } // non-integer
);
const arbAccuracyField = fc.oneof(
  { weight: 3, arbitrary: fc.double({ min: 0, max: 100, noNaN: true }) }, // valid
  { weight: 1, arbitrary: fc.double({ min: 100.0001, max: 1000, noNaN: true }) }, // above 100
  { weight: 1, arbitrary: fc.double({ min: -1000, max: -0.0001, noNaN: true }) } // below 0
);
const arb1to5Field = fc.oneof(
  { weight: 3, arbitrary: fc.integer({ min: 1, max: 5 }) }, // valid
  { weight: 1, arbitrary: fc.integer({ min: 6, max: 100 }) }, // too high
  { weight: 1, arbitrary: fc.integer({ min: -100, max: 0 }) }, // too low
  { weight: 1, arbitrary: fc.integer({ min: 1, max: 5 }).map((n) => n + 0.5) } // non-integer
);
const arbDateField = fc.oneof(
  { weight: 3, arbitrary: arbValidDateStr },
  { weight: 2, arbitrary: arbInvalidDateStr }
);

// A candidate entry that may be valid or invalid along any dimension.
const arbCandidate = fc.record({
  date: arbDateField,
  hours: arbHoursField,
  questions: arbQuestionsField,
  accuracy: arbAccuracyField,
  subject: fc.string({ maxLength: 120 }),
  energy: arb1to5Field,
  confidence: arb1to5Field,
  // reflection length is clamped, never a rejection cause; generate beyond 2000
  // to confirm length does not affect acceptance.
  reflection: fc.string({ maxLength: 2500 }),
});

// Specification-driven acceptance predicate (independent of the implementation).
// Acceptance iff the date is a valid calendar date AND every numeric field is
// within its allowed range. Date validity reuses isValidISODate (its own
// correctness is covered by Property 11); the numeric ranges below are written
// directly from the requirement, not copied from validateDailyLog.
function specAccepts(e) {
  const dateOk = isValidISODate(e.date);

  const h = e.hours;
  const hoursOk =
    typeof h === "number" &&
    isFinite(h) &&
    h >= 0 &&
    h <= 24 &&
    Math.abs(h * 10 - Math.round(h * 10)) < 1e-9; // at most one decimal place

  const q = e.questions;
  const questionsOk = typeof q === "number" && Number.isInteger(q) && q >= 0 && q <= 9999;

  const a = e.accuracy;
  const accuracyOk = typeof a === "number" && isFinite(a) && a >= 0 && a <= 100;

  const en = e.energy;
  const energyOk = typeof en === "number" && Number.isInteger(en) && en >= 1 && en <= 5;

  const cf = e.confidence;
  const confidenceOk = typeof cf === "number" && Number.isInteger(cf) && cf >= 1 && cf <= 5;

  return dateOk && hoursOk && questionsOk && accuracyOk && energyOk && confidenceOk;
}

// --- Property 38 ------------------------------------------------------------

// Feature: mcat-tracker-expansion, Property 38: Daily-log upsert keeps at most
// one entry per date, and the entry for a date equals the most recently
// submitted entry for that date.
// Validates: Requirements 16.2
test("Property 38: upsert keeps at most one entry per date (most recent wins)", () => {
  fc.assert(
    fc.property(fc.array(arbPooledEntry, { maxLength: 40 }), (entriesRaw) => {
      // Tag each submission with its sequence index so we can identify the
      // most recently submitted entry per date.
      const entries = entriesRaw.map((e, i) => ({ ...e, seq: i }));

      let log = [];
      for (const e of entries) {
        log = upsertDailyLog(log, e);
      }

      // At most one entry per date.
      const dates = log.map((e) => e.date);
      assert.strictEqual(new Set(dates).size, dates.length, "dates must be unique");

      // The log contains exactly the distinct submitted dates.
      const distinctSubmitted = new Set(entries.map((e) => e.date));
      assert.strictEqual(log.length, distinctSubmitted.size);

      // Each stored entry equals the most recently submitted one for its date.
      const lastByDate = new Map();
      for (const e of entries) lastByDate.set(e.date, e); // later writes win
      for (const stored of log) {
        assert.deepStrictEqual(stored, lastByDate.get(stored.date));
      }
    }),
    { numRuns: 200 }
  );
});

// --- Property 39 ------------------------------------------------------------

// Feature: mcat-tracker-expansion, Property 39: Daily-log entries are ordered
// most-recent-first; the displayed order is non-increasing by date.
// Validates: Requirements 16.5
test("Property 39: daily-log display order is non-increasing by date", () => {
  fc.assert(
    fc.property(fc.array(arbPooledEntry, { maxLength: 40 }), (entriesRaw) => {
      const entries = entriesRaw.map((e, i) => ({ ...e, seq: i }));

      let log = [];
      for (const e of entries) {
        log = upsertDailyLog(log, e);
      }

      // Canonical "most recent first" display ordering: greatest date first.
      // YYYY-MM-DD compares chronologically under lexicographic string order.
      const ordered = log
        .slice()
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

      // Non-increasing by date.
      for (let i = 1; i < ordered.length; i++) {
        assert.ok(
          ordered[i - 1].date >= ordered[i].date,
          "display order must be non-increasing by date"
        );
      }

      // Ordering is a lossless permutation of the stored log (no drops/dupes).
      assert.strictEqual(ordered.length, log.length);
      const before = log.map((e) => e.date).slice().sort();
      const after = ordered.map((e) => e.date).slice().sort();
      assert.deepStrictEqual(after, before);
    }),
    { numRuns: 200 }
  );
});

// --- Property 40 ------------------------------------------------------------

// Feature: mcat-tracker-expansion, Property 40: validateDailyLog accepts a
// candidate entry if and only if the date is valid and every numeric field is
// within its allowed range; a rejected submission retains any existing entry
// for that date.
// Validates: Requirements 16.3
test("Property 40: daily-log validation accepts exactly valid entries", () => {
  fc.assert(
    fc.property(arbCandidate, (e) => {
      const res = validateDailyLog(e);

      // Acceptance matches the specification predicate exactly (the iff).
      assert.strictEqual(res.ok, specAccepts(e));

      if (res.ok) {
        // On acceptance, the normalized value stays within range.
        const v = res.value;
        assert.strictEqual(v.date, e.date);
        assert.ok(v.hours >= 0 && v.hours <= 24);
        assert.ok(Number.isInteger(v.questions) && v.questions >= 0 && v.questions <= 9999);
        assert.ok(v.accuracy >= 0 && v.accuracy <= 100);
        assert.ok(Number.isInteger(v.energy) && v.energy >= 1 && v.energy <= 5);
        assert.ok(Number.isInteger(v.confidence) && v.confidence >= 1 && v.confidence <= 5);
        assert.ok(v.reflection.length <= 2000, "reflection must be clamped to 2000 chars");
      } else {
        // On rejection, a handler that only upserts on success leaves any
        // existing entry for that date unchanged (Req 16.3).
        const existing = {
          date: e.date,
          hours: 1,
          questions: 1,
          accuracy: 50,
          subject: "prev",
          energy: 3,
          confidence: 3,
          reflection: "prior",
        };
        const log = [existing];
        const after = res.ok ? upsertDailyLog(log, res.value) : log;
        assert.deepStrictEqual(after, [existing], "rejected input must retain existing entry");
      }
    }),
    { numRuns: 300 }
  );
});
