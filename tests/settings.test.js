"use strict";

// Property test for the Settings_Module pure helper in core.js (Req 19):
//   - isValidFutureDate(s, today)  (Req 19.7)
//
// Dev-only: part of the test harness, never shipped with the app. This file is
// intentionally self-contained: it defines its own fast-check arbitraries and
// an independent date oracle, and does NOT import tests/helpers.js.

const { test } = require("node:test");
const assert = require("node:assert");
const fc = require("fast-check");
const MCAT = require("../core.js");

const { isValidFutureDate } = MCAT;

const RUNS = 200;

// --- Independent oracle (reimplemented, NOT borrowed from core) -------------

function isLeap(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

// Returns the canonical string if `s` is a strict YYYY-MM-DD calendar date,
// otherwise null. Mirrors the spec definition without sharing core's code.
function parseStrictISO(s) {
  if (typeof s !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12) return null;
  const lengths = [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (d < 1 || d > lengths[mo - 1]) return null;
  return s;
}

// True iff `s` is a valid calendar date that is not earlier than `today`.
// A non-valid `today` makes every input unverifiable -> false.
function oracle(s, today) {
  if (parseStrictISO(s) === null) return false;
  if (parseStrictISO(today) === null) return false;
  return s >= today; // same fixed-width format -> lexical compares chronologically
}

// --- Inline arbitraries -----------------------------------------------------

// A strictly valid "YYYY-MM-DD" calendar date string over a wide range.
const arbValidISODate = fc
  .date({ min: new Date("0001-01-01T00:00:00Z"), max: new Date("9999-12-31T00:00:00Z") })
  .map((d) => d.toISOString().slice(0, 10));

// Structurally "YYYY-MM-DD"-shaped but possibly-impossible dates (e.g. month 13,
// day 00, Feb 30). Padded so the regex shape always matches.
const pad = (n, w) => String(n).padStart(w, "0");
const arbShapedDate = fc
  .record({
    y: fc.integer({ min: 0, max: 9999 }),
    mo: fc.integer({ min: 0, max: 19 }),
    d: fc.integer({ min: 0, max: 39 }),
  })
  .map(({ y, mo, d }) => `${pad(y, 4)}-${pad(mo, 2)}-${pad(d, 2)}`);

// Arbitrary junk that should never look like a valid ISO date.
const arbGarbage = fc.oneof(
  fc.string(),
  fc.constantFrom("", "not-a-date", "2024/01/01", "2024-1-1", "20240101", "0000-00-00"),
  fc.integer().map(String),
);

// A mixed input space covering valid dates, shaped-but-bogus dates, and junk.
const arbInput = fc.oneof(
  { weight: 4, arbitrary: arbValidISODate },
  { weight: 3, arbitrary: arbShapedDate },
  { weight: 2, arbitrary: arbGarbage },
);

// --- Property 37: Future-date validation for settings test date -------------

// Feature: mcat-tracker-expansion, Property 37: isValidFutureDate(s, today)
// returns true if and only if s is a valid calendar date not earlier than today.
// Validates: Requirements 19.7
test("Property 37: isValidFutureDate matches oracle (valid date and not before today)", () => {
  fc.assert(
    fc.property(arbInput, arbInput, (s, today) => {
      assert.strictEqual(isValidFutureDate(s, today), oracle(s, today));
    }),
    { numRuns: RUNS },
  );
});

// Feature: mcat-tracker-expansion, Property 37: any valid date on or after today is accepted.
// Validates: Requirements 19.7
test("Property 37: a valid date on or after today is always accepted", () => {
  fc.assert(
    fc.property(arbValidISODate, fc.integer({ min: 0, max: 4000 }), (today, offsetDays) => {
      // Build a future date by advancing `offsetDays` days from today.
      const base = new Date(`${today}T00:00:00Z`);
      base.setUTCDate(base.getUTCDate() + offsetDays);
      const future = base.toISOString().slice(0, 10);
      // Skip cases where advancing overflows the 4-digit ISO year range.
      fc.pre(parseStrictISO(future) !== null);
      assert.strictEqual(isValidFutureDate(future, today), true);
    }),
    { numRuns: RUNS },
  );
});

// Feature: mcat-tracker-expansion, Property 37: any valid date strictly before today is rejected.
// Validates: Requirements 19.7
test("Property 37: a valid date strictly before today is always rejected", () => {
  fc.assert(
    fc.property(arbValidISODate, fc.integer({ min: 1, max: 4000 }), (today, offsetDays) => {
      const base = new Date(`${today}T00:00:00Z`);
      base.setUTCDate(base.getUTCDate() - offsetDays);
      const past = base.toISOString().slice(0, 10);
      // Skip pathological underflow that could leave the ISO range.
      fc.pre(parseStrictISO(past) !== null && past < today);
      assert.strictEqual(isValidFutureDate(past, today), false);
    }),
    { numRuns: RUNS },
  );
});

// Feature: mcat-tracker-expansion, Property 37: non-calendar-date input is always rejected.
// Validates: Requirements 19.7
test("Property 37: input that is not a valid calendar date is always rejected", () => {
  fc.assert(
    fc.property(arbInput, arbValidISODate, (s, today) => {
      fc.pre(parseStrictISO(s) === null);
      assert.strictEqual(isValidFutureDate(s, today), false);
    }),
    { numRuns: RUNS },
  );
});
