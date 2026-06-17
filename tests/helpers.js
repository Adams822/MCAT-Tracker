"use strict";

// Single import point for all module test files.
//
// Re-exports the MCAT pure-logic surface (from ../core.js) plus a scaffold of shared
// fast-check arbitraries. The arbitraries below are intentionally minimal stubs/
// placeholders; they will be fleshed out as the corresponding modules land (see the
// design's "Custom arbitraries" list). Keeping them here means each module test file
// has exactly one place to import from.
//
// Dev-only: this file is part of the test harness and is never shipped with the app.

const fc = require("fast-check");
const MCAT = require("../core.js");

// --- Shared generators ------------------------------------------------------
// A valid "YYYY-MM-DD" calendar date string (placeholder range; refine as needed).
const arbISODate = fc
  .date({ min: new Date("2020-01-01"), max: new Date("2030-12-31") })
  .map((d) => d.toISOString().slice(0, 10));

// --- Module arbitraries (stubs to be filled in as modules land) -------------

// arbPracticeSet — valid section/timing/difficulty, attempted 1..9999, correct 0..attempted.
const arbPracticeSet = fc
  .record({
    section: fc.constantFrom("C/P", "CARS", "B/B", "P/S"),
    attempted: fc.integer({ min: 1, max: 9999 }),
    timing: fc.constantFrom("timed", "untimed"),
    difficulty: fc.constantFrom("easy", "medium", "hard"),
    topic: fc.string({ maxLength: 100 }),
    resource: fc.string({ maxLength: 100 }),
    notes: fc.string({ maxLength: 500 }),
    date: arbISODate,
  })
  .chain((s) =>
    fc.integer({ min: 0, max: s.attempted }).map((correct) => ({ ...s, correct }))
  );

// arbInvalidPracticeSet — deliberately violates one constraint (placeholder).
const arbInvalidPracticeSet = fc.record({
  section: fc.constantFrom("C/P", "CARS", "B/B", "P/S", "BOGUS"),
  attempted: fc.integer({ min: -10, max: 20000 }),
  correct: fc.integer({ min: -10, max: 20000 }),
  timing: fc.constantFrom("timed", "untimed"),
  difficulty: fc.constantFrom("easy", "medium", "hard"),
});

// arbFullLength — sections 118..132, optionally incomplete (placeholder).
const arbFullLength = fc.record({
  date: arbISODate,
  name: fc.string({ maxLength: 100 }),
  cp: fc.integer({ min: 118, max: 132 }),
  cars: fc.integer({ min: 118, max: 132 }),
  bb: fc.integer({ min: 118, max: 132 }),
  ps: fc.integer({ min: 118, max: 132 }),
});

// arbReviewItem — interval in {1,3,7,21}, arbitrary nextDue and mark histories (placeholder).
const arbReviewItem = fc.record({
  topic: fc.string({ minLength: 1, maxLength: 100 }),
  content: fc.string({ minLength: 1, maxLength: 2000 }),
  intervalIndex: fc.integer({ min: -1, max: 3 }),
  nextDue: arbISODate,
  reviewedMarks: fc.nat({ max: 100 }),
  missedMarks: fc.nat({ max: 100 }),
});

// arbCarsEntry — placeholder.
const arbCarsEntry = fc.record({
  date: arbISODate,
  passages: fc.integer({ min: 1, max: 99 }),
  accuracy: fc.integer({ min: 0, max: 100 }),
  timePerPassage: fc.integer({ min: 1, max: 600 }),
  difficulty: fc.constantFrom("easy", "medium", "hard"),
  notes: fc.string({ maxLength: 2000 }),
});

// arbDailyLog — placeholder.
const arbDailyLog = fc.record({
  date: arbISODate,
  hours: fc.integer({ min: 0, max: 24 }),
  questions: fc.integer({ min: 0, max: 9999 }),
  accuracy: fc.integer({ min: 0, max: 100 }),
  subject: fc.string({ maxLength: 100 }),
  energy: fc.integer({ min: 1, max: 5 }),
  confidence: fc.integer({ min: 1, max: 5 }),
  reflection: fc.string({ maxLength: 2000 }),
});

// arbMarkdown / arbHostileMarkdown — placeholders for the renderMarkdown property.
const arbMarkdown = fc.string({ maxLength: 2000 });
const arbHostileMarkdown = fc.string({ maxLength: 2000 });

// arbState — composes module arbitraries into whole-state objects (placeholder skeleton).
const arbState = fc.record({
  practiceSets: fc.array(arbPracticeSet, { maxLength: 10 }),
  scores: fc.array(arbFullLength, { maxLength: 10 }),
  reviewItems: fc.array(arbReviewItem, { maxLength: 10 }),
  carsPassages: fc.array(arbCarsEntry, { maxLength: 10 }),
  dailyLog: fc.array(arbDailyLog, { maxLength: 10 }),
});

module.exports = {
  fc,
  MCAT,
  // shared
  arbISODate,
  // module arbitraries
  arbPracticeSet,
  arbInvalidPracticeSet,
  arbFullLength,
  arbReviewItem,
  arbCarsEntry,
  arbDailyLog,
  arbMarkdown,
  arbHostileMarkdown,
  arbState,
};
