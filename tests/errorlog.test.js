"use strict";

// Feature: mcat-tracker-expansion, Property 11: ISO date validation is exact
// Feature: mcat-tracker-expansion, Property 12: Mistake-category counts are complete and total-preserving
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

const { isValidISODate, categoryCounts, MISTAKE_CATEGORIES } = MCAT;

/* ------------------------------------------------------------------ */
/* Oracle: an independent, deliberately different implementation of    */
/* "is this string a real YYYY-MM-DD calendar date?" used to cross-    */
/* check isValidISODate. It mirrors the SPEC, not the implementation:  */
/* strict shape, month 1..12, day within the actual month length       */
/* (leap-year aware), no trimming.                                     */
/* ------------------------------------------------------------------ */
function isLeapYear(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function daysInMonth(year, month /* 1..12 */) {
  return [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

function oracleIsValidISODate(s) {
  if (typeof s !== "string") return false;
  // Strict shape: exactly 4 digits, dash, 2 digits, dash, 2 digits.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const year = Number(s.slice(0, 4));
  const month = Number(s.slice(5, 7));
  const day = Number(s.slice(8, 10));
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > daysInMonth(year, month)) return false;
  return true;
}

/* ------------------------------------------------------------------ */
/* Inline arbitraries for Property 11                                  */
/* ------------------------------------------------------------------ */

// Real calendar dates, produced from fc.date -> UTC ISO date slice. These
// MUST validate true.
const arbValidISODate = fc
  .date({ min: new Date("0001-01-01T00:00:00Z"), max: new Date("9999-12-31T00:00:00Z") })
  .map((d) => d.toISOString().slice(0, 10))
  // fc.date can yield dates whose year < 1000 (e.g. "0042-..."); the ISO
  // slice still pads to 4 digits, which matches the YYYY-MM-DD shape.
  .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s));

// Impossible-but-well-shaped dates: correct YYYY-MM-DD shape, but the day
// exceeds the real length of that month (e.g. 2024-02-30, 2023-02-29,
// 2025-04-31, 2025-06-31, 2025-13-01). These MUST validate false.
const arbImpossibleDate = fc
  .record({
    year: fc.integer({ min: 1, max: 9999 }),
    month: fc.integer({ min: 1, max: 13 }), // 13 = impossible month
    day: fc.integer({ min: 1, max: 31 }),
  })
  .filter(({ year, month, day }) =>
    month === 13 ? true : day > daysInMonth(year, month)
  )
  .map(({ year, month, day }) => {
    const y = String(year).padStart(4, "0");
    const mo = String(month).padStart(2, "0");
    const d = String(day).padStart(2, "0");
    return `${y}-${mo}-${d}`;
  });

// Wrongly-shaped strings: missing zero-padding, wrong separators, extra
// whitespace, truncated, etc. We build them from a real date then mangle.
const arbMisformattedDate = fc.oneof(
  // single-digit month/day ("2024-1-1")
  fc.tuple(fc.integer({ min: 1, max: 9999 }), fc.integer({ min: 1, max: 9 }), fc.integer({ min: 1, max: 9 }))
    .map(([y, m, d]) => `${y}-${m}-${d}`),
  // slash separators
  arbValidISODate.map((s) => s.replace(/-/g, "/")),
  // surrounding whitespace (strictness: not trimmed)
  arbValidISODate.map((s) => ` ${s} `),
  // trailing time component
  arbValidISODate.map((s) => `${s}T00:00:00`),
  // two-digit year
  arbValidISODate.map((s) => s.slice(2)),
  // empty / junk
  fc.constantFrom("", "not-a-date", "20240101", "2024-13", "----", "yyyy-mm-dd")
);

// Non-string inputs that MUST validate false.
const arbNonString = fc.oneof(
  fc.integer(),
  fc.float(),
  fc.boolean(),
  fc.constant(null),
  fc.constant(undefined),
  fc.array(fc.integer()),
  fc.record({ y: fc.integer() }),
  fc.date()
);

/* ------------------------------------------------------------------ */
/* Property 11: ISO date validation is exact                          */
/* Validates: Requirements 6.5                                         */
/* ------------------------------------------------------------------ */

test("Property 11: isValidISODate agrees with the calendar oracle for arbitrary strings", () => {
  fc.assert(
    fc.property(fc.string(), (s) => {
      assert.strictEqual(
        isValidISODate(s),
        oracleIsValidISODate(s),
        `isValidISODate(${JSON.stringify(s)}) disagreed with oracle`
      );
    }),
    { numRuns: 300 }
  );
});

test("Property 11: real calendar dates validate true", () => {
  fc.assert(
    fc.property(arbValidISODate, (s) => {
      assert.strictEqual(isValidISODate(s), true, `expected ${s} to be valid`);
      // cross-check the oracle agrees these are genuinely valid.
      assert.strictEqual(oracleIsValidISODate(s), true, `oracle disagreed on ${s}`);
    }),
    { numRuns: 200 }
  );
});

test("Property 11: impossible dates (bad day/month) validate false", () => {
  fc.assert(
    fc.property(arbImpossibleDate, (s) => {
      assert.strictEqual(isValidISODate(s), false, `expected impossible date ${s} to be rejected`);
    }),
    { numRuns: 200 }
  );
});

test("Property 11: misformatted strings validate false", () => {
  fc.assert(
    fc.property(arbMisformattedDate, (s) => {
      // Only assert false for inputs the oracle also rejects: this guards
      // against a generator accidentally producing a coincidentally-valid
      // string (e.g. ` 2024-01-01 ` is rejected, but a mangle could be a
      // no-op for some shapes).
      if (!oracleIsValidISODate(s)) {
        assert.strictEqual(isValidISODate(s), false, `expected malformed ${JSON.stringify(s)} to be rejected`);
      }
    }),
    { numRuns: 200 }
  );
});

test("Property 11: non-string inputs validate false", () => {
  fc.assert(
    fc.property(arbNonString, (v) => {
      assert.strictEqual(isValidISODate(v), false, `expected non-string ${typeof v} to be rejected`);
    }),
    { numRuns: 200 }
  );
});

// Anchor examples named explicitly in the spec.
test("Property 11 (examples): named impossible/valid dates", () => {
  assert.strictEqual(isValidISODate("2024-02-30"), false);
  assert.strictEqual(isValidISODate("2023-02-29"), false); // 2023 not a leap year
  assert.strictEqual(isValidISODate("2024-02-29"), true); // 2024 is a leap year
  assert.strictEqual(isValidISODate("2024-01-01"), true);
  assert.strictEqual(isValidISODate("2024/01/01"), false);
  assert.strictEqual(isValidISODate("2024-1-1"), false);
});

/* ------------------------------------------------------------------ */
/* Inline arbitraries for Property 12                                  */
/* ------------------------------------------------------------------ */

// A wrong-entry whose `category` is a real taxonomy value.
const arbValidCategoryEntry = fc.record({
  id: fc.nat(),
  category: fc.constantFrom(...MISTAKE_CATEGORIES),
});

// A wrong-entry whose category is "unset", missing, or garbage -> counts as unset.
const arbUnsetEntry = fc.oneof(
  fc.record({ id: fc.nat(), category: fc.constant("unset") }),
  fc.record({ id: fc.nat() }), // category missing
  fc.record({ id: fc.nat(), category: fc.constant(null) }),
  fc.record({ id: fc.nat(), category: fc.string() }), // arbitrary string (usually not a real category)
  fc.record({ id: fc.nat(), category: fc.integer() }), // non-string
  fc.constant({}), // empty object
  fc.constant(null), // non-object entry
  fc.integer() // non-object entry
);

// A mixed wrong array.
const arbWrongArray = fc.array(fc.oneof(arbValidCategoryEntry, arbUnsetEntry), { maxLength: 60 });

/* ------------------------------------------------------------------ */
/* Property 12: Mistake-category counts are complete and total-        */
/* preserving.                                                         */
/* Validates: Requirements 6.1, 6.7                                    */
/* ------------------------------------------------------------------ */

test("Property 12: categoryCounts contains all 9 categories + unset and sums to entry count", () => {
  fc.assert(
    fc.property(arbWrongArray, (wrong) => {
      const counts = categoryCounts(wrong);

      // (a) all nine category keys plus "unset" are present.
      const keys = Object.keys(counts);
      for (const cat of MISTAKE_CATEGORIES) {
        assert.ok(Object.prototype.hasOwnProperty.call(counts, cat), `missing category key: ${cat}`);
      }
      assert.ok(Object.prototype.hasOwnProperty.call(counts, "unset"), "missing 'unset' key");
      assert.strictEqual(keys.length, MISTAKE_CATEGORIES.length + 1, "exactly 9 categories + unset expected");

      // (b) every count is a non-negative integer.
      for (const k of keys) {
        assert.ok(Number.isInteger(counts[k]) && counts[k] >= 0, `count for ${k} must be a non-negative integer`);
      }

      // (c) total-preserving: counts sum to the number of array entries.
      const sum = keys.reduce((acc, k) => acc + counts[k], 0);
      assert.strictEqual(sum, wrong.length, "counts must sum to number of entries");

      // (d) cross-check: each valid-category entry is tallied under its own key.
      const expected = { unset: 0 };
      for (const cat of MISTAKE_CATEGORIES) expected[cat] = 0;
      for (const e of wrong) {
        const cat = e !== null && typeof e === "object" && !Array.isArray(e) ? e.category : undefined;
        if (typeof cat === "string" && MISTAKE_CATEGORIES.includes(cat)) expected[cat] += 1;
        else expected.unset += 1;
      }
      assert.deepStrictEqual(counts, expected, "counts must match the oracle tally");
    }),
    { numRuns: 200 }
  );
});

// Anchor examples.
test("Property 12 (examples): empty, all-unset, and known tallies", () => {
  const empty = categoryCounts([]);
  assert.strictEqual(Object.keys(empty).length, MISTAKE_CATEGORIES.length + 1);
  assert.strictEqual(Object.values(empty).reduce((a, b) => a + b, 0), 0);

  // non-array -> treated as empty.
  const nonArray = categoryCounts(null);
  assert.strictEqual(Object.values(nonArray).reduce((a, b) => a + b, 0), 0);

  const mixed = categoryCounts([
    { category: "content gap" },
    { category: "content gap" },
    { category: "guessed" },
    { category: "unset" },
    {}, // missing -> unset
    { category: "not-a-real-category" }, // garbage -> unset
  ]);
  assert.strictEqual(mixed["content gap"], 2);
  assert.strictEqual(mixed["guessed"], 1);
  assert.strictEqual(mixed.unset, 3);
  assert.strictEqual(Object.values(mixed).reduce((a, b) => a + b, 0), 6);
});
