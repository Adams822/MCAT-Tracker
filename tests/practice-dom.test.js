"use strict";

// [DOM] Example/unit tests for the Practice Question Tracker's delete behavior
// and newest→oldest list ordering (Req 3.7, 3.8), described in the design's
// "Practice Question Tracker" section.
//
// The real renderPractice()/deletePracticeSet() handlers live in app.js and are
// tightly coupled to the DOM (document.createElement, innerHTML, querySelector,
// addEventListener) and the module-global `state`. app.js performs hundreds of
// top-level document.getElementById() calls on load, so it cannot be `require`d
// under node:test (there is no jsdom in the dev harness). Following the same
// approach as storage-errors.test.js, these tests drive FAITHFUL mimics that
// mirror the app.js source line-for-line for the specific behavior under test,
// backed by the REAL pure helper from core.js (MCAT.percentCorrect). This lets
// the ordering, delete, and per-row display contract be asserted
// deterministically. Dev-only: never shipped with the app.

const { test } = require("node:test");
const assert = require("node:assert");

const MCAT = require("../core.js");

// ---------------------------------------------------------------------------
// Faithful mimics of the app.js renderPractice()/deletePracticeSet() logic.
// ---------------------------------------------------------------------------

// Mirrors renderPractice()'s list ordering exactly:
//   const ordered = [...sets].sort((a, b) =>
//     (b.date || "").localeCompare(a.date || "") || String(b.id).localeCompare(String(a.id)));
// Newest→oldest by date (descending), with a stable tie-break on id (descending).
// Returns a NEW array; the input is never mutated (spread before sort).
function orderPracticeSets(sets) {
  return [...sets].sort((a, b) =>
    (b.date || "").localeCompare(a.date || "") ||
    String(b.id).localeCompare(String(a.id)));
}

// Mirrors the per-row cell values built by renderPractice() (Req 3.8). Each row
// shows: date, section, topic, correct, attempted, percent correct, timing.
// Missing date/section/topic fall back to an em dash; percent correct comes from
// the REAL pure helper; timing renders as a "Timed"/"Untimed" label.
function practiceRowCells(s) {
  return {
    date: s.date || "\u2014",
    section: s.section || "\u2014",
    topic: s.topic || "\u2014",
    correct: s.correct,
    attempted: s.attempted,
    pct: MCAT.percentCorrect(s.correct, s.attempted),
    timing: s.timing === "timed" ? "Timed" : "Untimed",
  };
}

// Mirrors deletePracticeSet(id)'s state mutation step exactly:
//   state.practiceSets = (state.practiceSets || []).filter(s => s.id !== id);
function deletePracticeSet(sets, id) {
  return (sets || []).filter((s) => s.id !== id);
}

// ---------------------------------------------------------------------------
// Sample data. Same-length numeric ids keep the string-based id tie-break
// unambiguous ("300" > "200" > "100") regardless of locale collation.
// ---------------------------------------------------------------------------

function sampleSets() {
  return [
    { id: 100, date: "2024-01-10", section: "C/P", topic: "Kinetics", correct: 7, attempted: 10, timing: "timed" },
    { id: 200, date: "2024-03-15", section: "CARS", topic: "Inference", correct: 5, attempted: 8, timing: "untimed" },
    { id: 300, date: "2024-02-01", section: "B/B", topic: "Enzymes", correct: 9, attempted: 9, timing: "timed" },
  ];
}

// ===========================================================================
// Req 3.8 — list ordered most-recent → oldest, with each row showing the
// documented fields.
// ===========================================================================

test("Req 3.8: practice sets are listed newest → oldest by date", () => {
  const ordered = orderPracticeSets(sampleSets());
  assert.deepStrictEqual(
    ordered.map((s) => s.date),
    ["2024-03-15", "2024-02-01", "2024-01-10"]
  );
});

test("Req 3.8: ties on date are broken by id descending (stable)", () => {
  const sameDay = [
    { id: 100, date: "2024-05-01", section: "C/P", topic: "A", correct: 1, attempted: 2, timing: "timed" },
    { id: 300, date: "2024-05-01", section: "B/B", topic: "B", correct: 1, attempted: 2, timing: "timed" },
    { id: 200, date: "2024-05-01", section: "CARS", topic: "C", correct: 1, attempted: 2, timing: "timed" },
  ];
  const ordered = orderPracticeSets(sameDay);
  assert.deepStrictEqual(ordered.map((s) => s.id), [300, 200, 100]);
});

test("Req 3.8: ordering does not mutate the input array", () => {
  const sets = sampleSets();
  const snapshot = JSON.stringify(sets);
  orderPracticeSets(sets);
  assert.strictEqual(JSON.stringify(sets), snapshot, "input order must be preserved");
});

test("Req 3.8: an empty practice list orders to an empty list", () => {
  assert.deepStrictEqual(orderPracticeSets([]), []);
});

test("Req 3.8: each listed row shows date, section, topic, correct, attempted, percent correct, and timing", () => {
  const cells = practiceRowCells(
    { id: 1, date: "2024-04-02", section: "P/S", topic: "Memory", correct: 3, attempted: 4, timing: "timed" }
  );
  assert.deepStrictEqual(cells, {
    date: "2024-04-02",
    section: "P/S",
    topic: "Memory",
    correct: 3,
    attempted: 4,
    pct: 75, // 3/4 * 100, round-half-up
    timing: "Timed",
  });
});

test("Req 3.8: percent correct is rounded half-up and timing falls back to 'Untimed'", () => {
  // 5/8 = 62.5 -> rounds half-up to 63; an unknown timing renders as "Untimed".
  const cells = practiceRowCells(
    { id: 2, date: "2024-04-03", section: "CARS", topic: "Tone", correct: 5, attempted: 8, timing: undefined }
  );
  assert.strictEqual(cells.pct, 63);
  assert.strictEqual(cells.timing, "Untimed");
});

test("Req 3.8: missing date/section/topic fall back to an em dash", () => {
  const cells = practiceRowCells({ id: 3, correct: 0, attempted: 5 });
  assert.strictEqual(cells.date, "\u2014");
  assert.strictEqual(cells.section, "\u2014");
  assert.strictEqual(cells.topic, "\u2014");
  assert.strictEqual(cells.pct, 0);
});

// ===========================================================================
// Req 3.7 — deleting a practice set removes that set from the state.
// ===========================================================================

test("Req 3.7: deleting a set removes only that set and preserves the rest", () => {
  const sets = sampleSets();
  const result = deletePracticeSet(sets, 200);
  assert.deepStrictEqual(result.map((s) => s.id), [100, 300]);
});

test("Req 3.7: the remaining sets keep their order and values after a delete", () => {
  const sets = sampleSets();
  const result = deletePracticeSet(sets, 100);
  assert.deepStrictEqual(result, [
    { id: 200, date: "2024-03-15", section: "CARS", topic: "Inference", correct: 5, attempted: 8, timing: "untimed" },
    { id: 300, date: "2024-02-01", section: "B/B", topic: "Enzymes", correct: 9, attempted: 9, timing: "timed" },
  ]);
});

test("Req 3.7: deleting a non-existent id leaves the list unchanged", () => {
  const sets = sampleSets();
  const result = deletePracticeSet(sets, 999);
  assert.deepStrictEqual(result.map((s) => s.id), [100, 200, 300]);
});

test("Req 3.7: delete is idempotent — deleting the same id twice removes it once", () => {
  const once = deletePracticeSet(sampleSets(), 300);
  const twice = deletePracticeSet(once, 300);
  assert.deepStrictEqual(twice.map((s) => s.id), [100, 200]);
});

test("Req 3.7: deleting the last set yields an empty list", () => {
  const only = [{ id: 1, date: "2024-01-01", section: "C/P", topic: "X", correct: 1, attempted: 1, timing: "timed" }];
  assert.deepStrictEqual(deletePracticeSet(only, 1), []);
});

test("Req 3.7: deleting against an undefined/empty list never throws and yields an empty list", () => {
  assert.deepStrictEqual(deletePracticeSet(undefined, 1), []);
  assert.deepStrictEqual(deletePracticeSet([], 1), []);
});

test("Req 3.7/3.8: after deleting a set, the remaining sets still order newest → oldest", () => {
  const remaining = deletePracticeSet(sampleSets(), 300); // remove the 2024-02-01 entry
  const ordered = orderPracticeSets(remaining);
  assert.deepStrictEqual(ordered.map((s) => s.date), ["2024-03-15", "2024-01-10"]);
});
