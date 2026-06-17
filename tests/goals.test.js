"use strict";

// Unit tests for the Goals_Module pure helpers in core.js (Req 15):
//   - completedFullLengthCount  (Req 15.4)
//   - validateMilestone         (Req 15.1)
//   - toggleMilestone           (Req 15.5)
//
// Dev-only: part of the test harness, never shipped with the app.

const { test } = require("node:test");
const assert = require("node:assert");
const MCAT = require("../core.js");

const { completedFullLengthCount, validateMilestone, toggleMilestone, MAX_MILESTONES } = MCAT;

// --- completedFullLengthCount (Req 15.4) ------------------------------------

const fullRecord = (over = {}) => ({ cp: 125, cars: 125, bb: 125, ps: 125, ...over });

test("completedFullLengthCount returns 0 for non-array / empty input", () => {
  assert.strictEqual(completedFullLengthCount(undefined), 0);
  assert.strictEqual(completedFullLengthCount(null), 0);
  assert.strictEqual(completedFullLengthCount("nope"), 0);
  assert.strictEqual(completedFullLengthCount([]), 0);
});

test("completedFullLengthCount counts only records with all four valid sections", () => {
  const scores = [
    fullRecord(),                          // complete
    fullRecord({ ps: 117 }),               // ps below range -> incomplete
    fullRecord({ cars: undefined }),       // missing section -> incomplete
    fullRecord({ bb: 132, cp: 118 }),      // boundary values, valid -> complete
    { cp: 125, cars: 125, bb: 125 },       // missing ps -> incomplete
  ];
  assert.strictEqual(completedFullLengthCount(scores), 2);
});

test("completedFullLengthCount rejects non-integer and out-of-range sections", () => {
  assert.strictEqual(completedFullLengthCount([fullRecord({ cp: 125.5 })]), 0);
  assert.strictEqual(completedFullLengthCount([fullRecord({ cp: 133 })]), 0);
  // non-numeric strings are not valid sections
  assert.strictEqual(completedFullLengthCount([fullRecord({ cp: "abc" })]), 0);
  // numeric strings ARE accepted (reused validateSections coerces "125" -> 125)
  assert.strictEqual(completedFullLengthCount([fullRecord({ cp: "125" })]), 1);
  // result is always a non-negative integer
  const n = completedFullLengthCount([fullRecord(), fullRecord()]);
  assert.ok(Number.isInteger(n) && n >= 0);
  assert.strictEqual(n, 2);
});

// --- validateMilestone (Req 15.1) -------------------------------------------

test("validateMilestone accepts non-empty text and returns the trimmed value", () => {
  const r = validateMilestone("  finish CARS book  ", 0);
  assert.deepStrictEqual(r, { ok: true, value: "finish CARS book" });
});

test("validateMilestone rejects empty / whitespace-only / non-string text", () => {
  for (const bad of ["", "   ", "\t\n", 5, null, undefined, {}, []]) {
    assert.strictEqual(validateMilestone(bad, 0).ok, false, `should reject ${JSON.stringify(bad)}`);
  }
});

test("validateMilestone rejects text longer than 200 characters", () => {
  assert.strictEqual(validateMilestone("a".repeat(200), 0).ok, true);
  assert.strictEqual(validateMilestone("a".repeat(201), 0).ok, false);
});

test("validateMilestone enforces the 100-item cap (Req 15.1)", () => {
  assert.strictEqual(MAX_MILESTONES, 100);
  assert.strictEqual(validateMilestone("ok", 99).ok, true);
  assert.strictEqual(validateMilestone("too many", 100).ok, false);
  assert.strictEqual(validateMilestone("too many", 250).ok, false);
});

// --- toggleMilestone (Req 15.5) ---------------------------------------------

test("toggleMilestone flips done on the matching id without mutating input", () => {
  const ms = [
    { id: 1, text: "a", done: false },
    { id: 2, text: "b", done: true },
  ];
  const snapshot = JSON.stringify(ms);
  const out = toggleMilestone(ms, 2);
  assert.deepStrictEqual(out, [
    { id: 1, text: "a", done: false },
    { id: 2, text: "b", done: false },
  ]);
  assert.notStrictEqual(out, ms, "must return a new array");
  assert.notStrictEqual(out[1], ms[1], "must return a new object for the toggled item");
  assert.strictEqual(JSON.stringify(ms), snapshot, "input must not be mutated");
});

test("toggleMilestone tolerates string/number id mismatch and missing done", () => {
  const ms = [{ id: "7", text: "c" }]; // done absent -> treated as not done
  assert.deepStrictEqual(toggleMilestone(ms, 7), [{ id: "7", text: "c", done: true }]);
});

test("toggleMilestone leaves the list unchanged when no id matches and handles non-array", () => {
  const ms = [{ id: 1, text: "a", done: false }];
  assert.deepStrictEqual(toggleMilestone(ms, 999), ms);
  assert.deepStrictEqual(toggleMilestone(undefined, 1), []);
});
