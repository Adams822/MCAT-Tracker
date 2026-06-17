"use strict";

// Feature: mcat-tracker-expansion, Property 3: Corrupt or non-object input is rejected safely
//
// Property 3: Corrupt or non-object input is rejected safely
// Validates: Requirements 1.6, 2.5
//
// For any string that is not valid JSON, or any JSON value that is not a plain
// object (number, array, string, null, boolean), parseBackup returns a rejection
// ({ ok: false }) without throwing; for valid JSON plain objects it returns
// { ok: true, value } where value is a plain object. parseBackup must NEVER throw
// for any input, including non-string inputs.
//
// Dev-only: this file is part of the test harness and is never shipped with the app.

const { test } = require("node:test");
const assert = require("node:assert");
const fc = require("fast-check");

const MCAT = require("../core.js");

const NUM_RUNS = 100;

// --- Inline arbitraries -----------------------------------------------------

// (a) Arbitrary strings. Most random strings are not valid JSON; this exercises
// the "not valid JSON" rejection path. (A few may coincidentally be valid JSON
// such as "" being invalid, or "123" being valid — handled by the oracle below.)
const arbAnyString = fc.string();

// (b) JSON texts that parse to NON-objects: numbers, arrays, strings, null,
// booleans. Serialized via JSON.stringify so they are always valid JSON whose
// parsed value is not a plain object.
const arbNonObjectJsonValue = fc.oneof(
  fc.integer(),
  fc.double({ noNaN: true, noDefaultInfinity: true }),
  fc.array(fc.integer(), { maxLength: 8 }),
  fc.string(),
  fc.constant(null),
  fc.boolean()
);
const arbNonObjectJsonText = arbNonObjectJsonValue.map((v) => JSON.stringify(v));

// (c) JSON texts that parse to PLAIN OBJECTS. Keys are strings, values are simple
// JSON-serializable values (including nested objects/arrays).
const arbJsonScalar = fc.oneof(
  fc.integer(),
  fc.string(),
  fc.boolean(),
  fc.constant(null)
);
const arbPlainObject = fc.dictionary(
  fc.string(),
  fc.oneof(
    arbJsonScalar,
    fc.array(arbJsonScalar, { maxLength: 5 }),
    fc.dictionary(fc.string(), arbJsonScalar, { maxKeys: 5 })
  ),
  { maxKeys: 8 }
);
const arbObjectJsonText = arbPlainObject.map((o) => JSON.stringify(o));

// (d) Non-string inputs of arbitrary shape, to confirm parseBackup never throws
// when handed something that is not text.
const arbNonString = fc.oneof(
  fc.integer(),
  fc.double({ noNaN: true }),
  fc.boolean(),
  fc.constant(null),
  fc.constant(undefined),
  fc.array(fc.anything(), { maxLength: 5 }),
  fc.object(),
  fc.anything().filter((v) => typeof v !== "string")
);

// Oracle: what SHOULD parseBackup decide for a given string input?
function expectedOkForString(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return false;
  }
  return (
    parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
  );
}

// --- Property 3 -------------------------------------------------------------

test("Property 3: parseBackup never throws and rejects non-JSON strings", () => {
  fc.assert(
    fc.property(arbAnyString, (text) => {
      let result;
      assert.doesNotThrow(() => {
        result = MCAT.parseBackup(text);
      });
      // Result must agree with the JSON-plain-object oracle.
      const expectedOk = expectedOkForString(text);
      assert.strictEqual(result.ok, expectedOk);
      if (result.ok) {
        assert.ok(
          result.value !== null &&
            typeof result.value === "object" &&
            !Array.isArray(result.value),
          "ok result value must be a plain object"
        );
      } else {
        assert.strictEqual(typeof result.reason, "string");
      }
    }),
    { numRuns: NUM_RUNS }
  );
});

test("Property 3: valid JSON that is not a plain object is rejected (ok:false)", () => {
  fc.assert(
    fc.property(arbNonObjectJsonText, (text) => {
      let result;
      assert.doesNotThrow(() => {
        result = MCAT.parseBackup(text);
      });
      assert.strictEqual(result.ok, false);
      assert.strictEqual(typeof result.reason, "string");
    }),
    { numRuns: NUM_RUNS }
  );
});

test("Property 3: valid JSON plain objects are accepted (ok:true, plain-object value)", () => {
  fc.assert(
    fc.property(arbObjectJsonText, (text) => {
      let result;
      assert.doesNotThrow(() => {
        result = MCAT.parseBackup(text);
      });
      assert.strictEqual(result.ok, true);
      assert.ok(
        result.value !== null &&
          typeof result.value === "object" &&
          !Array.isArray(result.value),
        "accepted value must be a plain object"
      );
      // Round-trip: parsed value deep-equals the original parsed object.
      assert.deepStrictEqual(result.value, JSON.parse(text));
    }),
    { numRuns: NUM_RUNS }
  );
});

test("Property 3: non-string inputs never throw and are rejected (ok:false)", () => {
  fc.assert(
    fc.property(arbNonString, (input) => {
      let result;
      assert.doesNotThrow(() => {
        result = MCAT.parseBackup(input);
      });
      assert.strictEqual(result.ok, false);
      assert.strictEqual(typeof result.reason, "string");
    }),
    { numRuns: NUM_RUNS }
  );
});
