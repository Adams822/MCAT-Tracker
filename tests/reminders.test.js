"use strict";

// Property tests for the In-App Reminders pure logic in core.js:
//   computeReminders(state, today), isDismissedToday(dismissals, key, today).
//
// Dev-only: part of the test harness, never shipped with the app. This file is
// intentionally self-contained — it defines its own fast-check arbitraries and
// does NOT import tests/helpers.js.
//
// NOTE: keep test TITLES ASCII-only (no em-dash/arrows) to avoid the known
// TAP-lexer issue with non-ASCII characters in test names.

const { test } = require("node:test");
const assert = require("node:assert");
const fc = require("fast-check");
const MCAT = require("../core.js");

const { computeReminders, isDismissedToday, isValidISODate, addDaysISO } = MCAT;

// Fixed reference "today" for determinism across all properties.
const TODAY = "2024-06-15";

// --- Local helpers mirroring the spec (NOT the implementation) --------------

// A date is "due on or before today" when it is a valid ISO calendar date and
// lexically (==chronologically for zero-padded YYYY-MM-DD) at or before today.
function dueOnOrBefore(d, today) {
  return typeof d === "string" && isValidISODate(d) && d <= today;
}

// Whole-day difference (target - today), computed in UTC over clean ISO dates.
function daysUntilExpected(today, target) {
  const utc = (s) => {
    const [y, m, d] = s.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((utc(target) - utc(today)) / 86400000);
}

// --- Shared arbitraries -----------------------------------------------------

// A clean, valid ISO date in a window around today (sometimes exactly today).
const arbDateAround = fc.integer({ min: -40, max: 40 }).map((off) => addDaysISO(TODAY, off));

// A date field that may be empty, a clean valid date, or clearly invalid.
const arbMaybeDate = fc.oneof(
  fc.constant(""),
  arbDateAround,
  fc.constantFrom("bad", "2024-13-01", "2024-02-30", "20240615", "2024/06/15")
);

const arbTopic = fc.constantFrom("Kinetics", "Acids", "Genetics", "Optics", "");

// --- Property 43 ------------------------------------------------------------

// Feature: mcat-tracker-expansion, Property 43: Reminder computation matches qualifying data
// Validates: Requirements 18.1
test("Property 43: computeReminders returns exactly the countdown, due reviews, today's full-lengths, and due retests", () => {
  const arbReview = fc.record({ topic: arbTopic, nextDue: arbMaybeDate });
  const arbEvent = fc.record({
    title: fc.string({ maxLength: 20 }),
    type: fc.constantFrom("test", "study", "other"),
    date: arbMaybeDate,
  });
  const arbWrong = fc.record({ topic: arbTopic, retestDate: arbMaybeDate });

  fc.assert(
    fc.property(
      arbTestDate(),
      fc.array(arbReview, { maxLength: 12 }),
      fc.array(arbEvent, { maxLength: 12 }),
      fc.array(arbWrong, { maxLength: 12 }),
      (testDate, reviews, events, wrongs) => {
        // Assign unique ids per category so dismissal keys never collide.
        const reviewItems = reviews.map((it, i) => ({ ...it, id: "r" + i }));
        const eventItems = events.map((e, i) => ({ ...e, id: "e" + i }));
        const wrongItems = wrongs.map((w, i) => ({ ...w, id: "w" + i }));

        const state = {
          testDate,
          reviewItems,
          events: eventItems,
          wrong: wrongItems,
        };

        const actual = computeReminders(state, TODAY);

        // Independently derive the expected reminder set, in the documented order:
        // countdown, then due reviews, then today's full-lengths, then due retests.
        const expected = [];
        if (isValidISODate(testDate)) {
          expected.push({
            kind: "countdown",
            key: "countdown",
            date: testDate,
            daysUntil: daysUntilExpected(TODAY, testDate),
          });
        }
        for (const it of reviewItems) {
          if (dueOnOrBefore(it.nextDue, TODAY)) {
            expected.push({
              kind: "review",
              key: "review:" + it.id,
              date: it.nextDue,
              id: it.id,
              topic: it.topic,
            });
          }
        }
        for (const e of eventItems) {
          if (e.type === "test" && e.date === TODAY) {
            expected.push({
              kind: "fulllength",
              key: "event:" + e.id,
              date: e.date,
              id: e.id,
              title: e.title,
            });
          }
        }
        for (const w of wrongItems) {
          if (dueOnOrBefore(w.retestDate, TODAY)) {
            expected.push({
              kind: "retest",
              key: "retest:" + w.id,
              date: w.retestDate,
              id: w.id,
              topic: w.topic,
            });
          }
        }

        assert.deepStrictEqual(actual, expected);
      }
    ),
    { numRuns: 200 }
  );
});

// --- Property 44 ------------------------------------------------------------

// Feature: mcat-tracker-expansion, Property 44: Reminder dismissal is scoped to the calendar day
// Validates: Requirements 18.4
test("Property 44: isDismissedToday excludes a reminder only on its dismissal day and never on later days", () => {
  const arbKey = fc.constantFrom("countdown", "review:r0", "event:e0", "retest:w0", "review:r1");

  fc.assert(
    fc.property(
      arbKey,
      // The day the reminder was dismissed.
      fc.integer({ min: -30, max: 30 }).map((off) => addDaysISO(TODAY, off)),
      // A strictly positive offset to a later calendar day.
      fc.integer({ min: 1, max: 60 }),
      // Some unrelated dismissals to ensure other keys do not leak.
      fc.dictionary(
        fc.constantFrom("other:1", "other:2", "review:rX"),
        arbDateAround,
        { maxKeys: 3 }
      ),
      (key, dismissDay, laterOffset, otherDismissals) => {
        // Record the dismissal for `key` on `dismissDay`.
        const dismissals = { ...otherDismissals, [key]: dismissDay };

        // On the dismissal day the reminder is suppressed...
        assert.strictEqual(isDismissedToday(dismissals, key, dismissDay), true);

        // ...and re-checking with the same persisted map (a "reload") still suppresses it.
        assert.strictEqual(
          isDismissedToday({ ...dismissals }, key, dismissDay),
          true
        );

        // On any strictly later calendar day it is no longer dismissed.
        const laterDay = addDaysISO(dismissDay, laterOffset);
        assert.strictEqual(isDismissedToday(dismissals, key, laterDay), false);

        // A key that was never dismissed is never suppressed for that day.
        assert.strictEqual(isDismissedToday(dismissals, "never:dismissed", dismissDay), false);

        // isDismissedToday also accepts a full state object carrying the map.
        assert.strictEqual(
          isDismissedToday({ reminderDismissals: dismissals }, key, dismissDay),
          true
        );
      }
    ),
    { numRuns: 200 }
  );
});

// --- Property 44 (integration): dismissal hides an active reminder for the day only ---

// Feature: mcat-tracker-expansion, Property 44: Reminder dismissal is scoped to the calendar day
// Validates: Requirements 18.4
test("Property 44: an active reminder dismissed today is filtered out today but reappears the next day", () => {
  // A review item due on or before today is active across today and tomorrow.
  const arbDueOffset = fc.integer({ min: -30, max: 0 });

  fc.assert(
    fc.property(arbDueOffset, arbTopic, (off, topic) => {
      const nextDue = addDaysISO(TODAY, off);
      const item = { id: "r0", topic, nextDue };
      const state = { testDate: "", reviewItems: [item], events: [], wrong: [] };

      const key = "review:r0";

      // The reminder is active today.
      const todayReminders = computeReminders(state, TODAY);
      assert.ok(todayReminders.some((r) => r.key === key));

      // User dismisses it for today.
      const dismissals = { [key]: TODAY };

      // Display = active AND not dismissed-today. It is filtered out today.
      const shownToday = todayReminders.filter(
        (r) => !isDismissedToday(dismissals, r.key, TODAY)
      );
      assert.ok(!shownToday.some((r) => r.key === key));

      // The next day it is still active (nextDue <= tomorrow) and no longer dismissed.
      const tomorrow = addDaysISO(TODAY, 1);
      const tomorrowReminders = computeReminders(state, tomorrow);
      assert.ok(tomorrowReminders.some((r) => r.key === key));

      const shownTomorrow = tomorrowReminders.filter(
        (r) => !isDismissedToday(dismissals, r.key, tomorrow)
      );
      assert.ok(shownTomorrow.some((r) => r.key === key));
    }),
    { numRuns: 200 }
  );
});

// arbTestDate is defined as a thunk so it can sit below its use in Property 43.
function arbTestDate() {
  return fc.oneof(
    fc.constant(""),
    arbDateAround,
    fc.constantFrom("bad", "2024-13-01", "2024-02-30", "20240615")
  );
}
