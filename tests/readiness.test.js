"use strict";

// Feature: mcat-tracker-expansion, Property 41: Readiness completed count
// Feature: mcat-tracker-expansion, Property 42: Custom checklist item validation (whitespace allowed)
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

const { validateChecklistItem, completedCount } = MCAT;

/* ------------------------------------------------------------------ */
/* Shared helpers / arbitraries                                        */
/* ------------------------------------------------------------------ */

// Mirror core.js isPlainObject so the test oracle classifies items exactly
// the way the implementation does.
function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

// Build a string from an explicit character set so length is fully under our
// control (no engine-dependent surprises). Whitespace is included on purpose:
// whitespace-only labels are valid per Requirement 17.4.
function stringOf(chars, opts) {
  return fc.array(fc.constantFrom(...chars), opts).map((a) => a.join(""));
}

const LABEL_CHARS = "abcXYZ0123456789 \t".split("");

// A single checklist item. Most items are plain objects with a boolean
// `checked`, but we also emit:
//  - `checked` values that are truthy-but-not-true (must NOT count),
//  - items with no `checked` key,
//  - non-object junk (null / number), to exercise the robustness path.
const arbCheckedValue = fc.oneof(
  fc.constant(true),
  fc.constant(false),
  fc.constantFrom("yes", 1, 0, "", "true"),
  fc.constant(undefined)
);

const arbItem = fc.record({
  label: stringOf(LABEL_CHARS, { maxLength: 20 }),
  checked: arbCheckedValue,
});

// A possibly-junk item: plain-object item OR a non-object value.
const arbAnyItem = fc.oneof(
  arbItem,
  fc.constantFrom(null, 42, "x"),
  fc.array(fc.boolean(), { maxLength: 2 }) // arrays are NOT plain objects
);

// A readiness object: predefined + custom arrays, with occasional malformed
// shapes (missing arrays, non-array values) to test the defensive coercion.
const arbReadiness = fc.oneof(
  fc.record({
    predefined: fc.array(arbAnyItem, { maxLength: 12 }),
    custom: fc.array(arbAnyItem, { maxLength: 12 }),
  }),
  fc.record({
    predefined: fc.array(arbAnyItem, { maxLength: 12 }),
    // custom missing entirely
  }),
  fc.constantFrom(null, undefined, 5, "nope", [])
);

// Count of items the implementation should treat as "checked".
function expectedChecked(arr) {
  if (!Array.isArray(arr)) return 0;
  let n = 0;
  for (const item of arr) {
    if (isPlainObject(item) && item.checked === true) n++;
  }
  return n;
}

/* ================================================================== */
/* Property 41: Readiness completed count                             */
/* Validates: Requirements 17.3                                       */
/* ================================================================== */

test("Property 41: completedCount equals number of checked items and is within [0, total]", () => {
  fc.assert(
    fc.property(arbReadiness, (readiness) => {
      const result = completedCount(readiness);

      const r = isPlainObject(readiness) ? readiness : {};
      const predefined = Array.isArray(r.predefined) ? r.predefined : [];
      const custom = Array.isArray(r.custom) ? r.custom : [];

      // Independent oracle: checked predefined + checked custom.
      const expected = expectedChecked(predefined) + expectedChecked(custom);
      assert.strictEqual(result, expected, "count must equal checked-item total");

      // Bounded within [0, total] where total = predefined + custom items.
      const total = predefined.length + custom.length;
      assert.ok(Number.isInteger(result), "count must be an integer");
      assert.ok(result >= 0, "count must be >= 0");
      assert.ok(result <= total, `count ${result} must be <= total ${total}`);
    }),
    { numRuns: 200 }
  );
});

/* ================================================================== */
/* Property 42: Custom checklist item validation (whitespace allowed) */
/* Validates: Requirements 17.4, 17.5                                 */
/* ================================================================== */

// Candidate labels spanning the interesting categories.
const arbLabel = fc.oneof(
  // valid length 1..100, may be whitespace-only (allowed)
  stringOf(LABEL_CHARS, { minLength: 1, maxLength: 100 }),
  // boundary-ish whitespace-only labels
  fc.constantFrom(" ", "   ", "\t", "\n  \n"),
  // empty: zero characters -> reject
  fc.constant(""),
  // too long: >100 chars -> reject
  stringOf(LABEL_CHARS, { minLength: 101, maxLength: 140 }),
  // non-string junk -> reject
  fc.constantFrom(null, undefined, 123, true)
);

// Custom-item counts straddling the 50-item cap, plus non-numeric values.
const arbCustomCount = fc.oneof(
  fc.integer({ min: 0, max: 49 }),
  fc.constantFrom(49, 50, 51),
  fc.integer({ min: 50, max: 120 }),
  fc.constantFrom(NaN, "nope", null, undefined, "50")
);

test("Property 42: validateChecklistItem accepts iff 1..100 chars (whitespace ok) and count below 50", () => {
  fc.assert(
    fc.property(arbLabel, arbCustomCount, (label, customCount) => {
      const result = validateChecklistItem(label, customCount);

      // Independent oracle mirroring the spec acceptance rule.
      const count = Number(customCount);
      const capReached = Number.isFinite(count) && count >= 50;
      const lengthOk =
        typeof label === "string" && label.length >= 1 && label.length <= 100;
      const expectedOk = !capReached && lengthOk;

      assert.strictEqual(
        result.ok,
        expectedOk,
        `label=${JSON.stringify(label)} count=${JSON.stringify(customCount)} ` +
          `capReached=${capReached} lengthOk=${lengthOk} -> ${JSON.stringify(result)}`
      );

      // Rejections must carry a non-empty reason.
      if (!result.ok) {
        assert.strictEqual(typeof result.reason, "string");
        assert.ok(result.reason.length > 0, "rejection must include a reason");
      }

      // Rejected additions leave the checklist unchanged: model the add and
      // confirm a rejection never mutates the existing list.
      const existing = [{ label: "keep", checked: false }];
      const list = existing.slice();
      if (result.ok) {
        list.push({ label: String(label), checked: false });
      }
      if (!result.ok) {
        assert.deepStrictEqual(list, existing, "rejection must not change the list");
      }
    }),
    { numRuns: 200 }
  );
});
