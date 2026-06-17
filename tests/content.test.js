"use strict";

// Feature: mcat-tracker-expansion, Property 9: Content status counts are total-preserving and complete
// Feature: mcat-tracker-expansion, Property 10: Custom content topic validation
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

const {
  buildSubjectTree,
  statusCounts,
  validateCustomTopic,
  contentTopicKey,
  CONTENT_STATUSES,
  CONTENT_SUBJECT_TREE,
} = MCAT;

/* ------------------------------------------------------------------ */
/* Shared helpers / arbitraries                                        */
/* ------------------------------------------------------------------ */

// The four real MCAT sections plus some unknown ones, so buildSubjectTree's
// "skip unknown section" path is exercised by the custom-topic generator.
const KNOWN_SECTIONS = ["C/P", "CARS", "B/B", "P/S"];
const arbKnownSection = fc.constantFrom(...KNOWN_SECTIONS);
const arbAnySection = fc.constantFrom(...KNOWN_SECTIONS, "XX", "", "Unknown");

// Predefined { section, label } pairs derived from the source-of-truth tree.
const PREDEFINED_PAIRS = [];
for (const node of CONTENT_SUBJECT_TREE) {
  for (const group of node.groups) {
    for (const label of group.topics) {
      PREDEFINED_PAIRS.push({ section: node.section, label });
    }
  }
}

// Build a string out of an explicit character set so length is fully under
// our control (no engine-dependent whitespace surprises).
function stringOf(chars, opts) {
  return fc
    .array(fc.constantFrom(...chars), opts)
    .map((a) => a.join(""));
}

const LETTERS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".split("");

// Enumerate every { section, label } topic entry in a built tree, in order.
function enumerateTopics(tree) {
  const out = [];
  for (const node of tree) {
    for (const group of node.groups) {
      for (const label of group.topics) {
        out.push({ section: node.section, label });
      }
    }
  }
  return out;
}

/* ================================================================== */
/* Property 9: Content status counts are total-preserving and complete */
/* Validates: Requirements 5.2, 5.4, 5.5                               */
/* ================================================================== */

// A custom topic; labels may be blank/whitespace so buildSubjectTree's
// skip-invalid path is exercised alongside good entries.
const arbCustomTopic = fc.record({
  section: arbAnySection,
  label: fc.oneof(
    stringOf(LETTERS, { minLength: 1, maxLength: 12 }),
    fc.constantFrom("", "   ", "Physics", "physics", "  Biology  ")
  ),
});

// A per-topic status choice: a valid status, an invalid string (wrong case
// counts as invalid since matching is case-sensitive), a non-string, or
// null meaning "leave this topic's key out of the map entirely".
const arbStatusChoice = fc.oneof(
  fc.constantFrom(...CONTENT_STATUSES),
  fc.constantFrom("MASTERED", "Reviewed", "done", "unknown", ""),
  fc.integer(),
  fc.constant(null)
);

test("Property 9: statusCounts is complete (all 5 keys, >=0) and total-preserving", () => {
  fc.assert(
    fc.property(
      fc.array(arbCustomTopic, { maxLength: 8 }),
      fc.array(arbStatusChoice, { maxLength: 12 }),
      (customTopics, choices) => {
        const tree = buildSubjectTree(customTopics);
        const topics = enumerateTopics(tree);

        // Assign statuses by cycling through the generated choices; null means
        // "no stored status for this key".
        const contentStatuses = {};
        topics.forEach((t, i) => {
          const choice = choices.length ? choices[i % choices.length] : null;
          if (choice !== null) {
            contentStatuses[contentTopicKey(t.section, t.label)] = choice;
          }
        });

        const counts = statusCounts(tree, contentStatuses);

        // Completeness: every status key present, each a non-negative integer.
        for (const status of CONTENT_STATUSES) {
          assert.ok(
            Object.prototype.hasOwnProperty.call(counts, status),
            `missing status key: ${status}`
          );
          assert.ok(
            Number.isInteger(counts[status]) && counts[status] >= 0,
            `count for ${status} must be a non-negative integer, got ${counts[status]}`
          );
        }
        // No extra keys beyond the five statuses.
        assert.strictEqual(Object.keys(counts).length, CONTENT_STATUSES.length);

        // Total-preserving: the five counts sum to the number of topic entries.
        const sum = CONTENT_STATUSES.reduce((acc, s) => acc + counts[s], 0);
        assert.strictEqual(sum, topics.length);

        // Independent oracle: a valid stored status counts toward itself;
        // any missing/invalid status falls through to "not started" (Req 5.4).
        const expected = {};
        for (const status of CONTENT_STATUSES) expected[status] = 0;
        for (const t of topics) {
          const stored = contentStatuses[contentTopicKey(t.section, t.label)];
          if (typeof stored === "string" && CONTENT_STATUSES.includes(stored)) {
            expected[stored] += 1;
          } else {
            expected["not started"] += 1;
          }
        }
        assert.deepStrictEqual(counts, expected);
      }
    ),
    { numRuns: 200 }
  );
});

/* ================================================================== */
/* Property 10: Custom content topic validation                       */
/* Validates: Requirements 5.6, 5.7                                    */
/* ================================================================== */

// Randomly re-case a string, character by character.
function caseVariantArb(str) {
  return fc.array(fc.boolean(), { minLength: str.length, maxLength: str.length }).map((flags) =>
    str
      .split("")
      .map((ch, i) => (flags[i] ? ch.toUpperCase() : ch.toLowerCase()))
      .join("")
  );
}

// A duplicate candidate: pick a predefined pair, re-case + optionally pad its
// label, and aim it at that pair's section so it actually collides.
const arbDuplicateCandidate = fc
  .constantFrom(...PREDEFINED_PAIRS)
  .chain((pair) =>
    fc.record({
      section: fc.constant(pair.section),
      label: caseVariantArb(pair.label).chain((cased) =>
        fc.constantFrom("", " ", "   ").map((pad) => pad + cased + pad)
      ),
    })
  );

// A { section, label } candidate spanning the four interesting categories.
const arbCandidate = fc.oneof(
  // valid: 1..100 non-whitespace chars after trim
  fc.record({
    section: arbKnownSection,
    label: stringOf(LETTERS, { minLength: 1, maxLength: 100 }),
  }),
  // empty / whitespace-only
  fc.record({
    section: arbKnownSection,
    label: fc.constantFrom("", " ", "   ", "\t", "\n  \n"),
  }),
  // too long: >100 chars after trim
  fc.record({
    section: arbKnownSection,
    label: stringOf(LETTERS, { minLength: 101, maxLength: 160 }),
  }),
  // case-insensitive duplicate of a predefined topic
  arbDuplicateCandidate
);

test("Property 10: validateCustomTopic accepts iff length 1..100 and not a case-insensitive duplicate", () => {
  fc.assert(
    fc.property(
      fc.array(arbCustomTopic, { maxLength: 6 }),
      arbCandidate,
      (customTopics, candidate) => {
        const tree = buildSubjectTree(customTopics);
        const result = validateCustomTopic(candidate.section, candidate.label, tree);

        // Independent oracle for the accept condition.
        const trimmed = String(candidate.label == null ? "" : candidate.label).trim();
        const lengthOk = trimmed.length >= 1 && trimmed.length <= 100;

        const needle = trimmed.toLowerCase();
        let isDuplicate = false;
        for (const node of tree) {
          if (node.section !== candidate.section) continue;
          for (const group of node.groups) {
            for (const existing of group.topics) {
              if (String(existing).trim().toLowerCase() === needle) {
                isDuplicate = true;
              }
            }
          }
        }

        const expectedOk = lengthOk && !isDuplicate;
        assert.strictEqual(
          result.ok,
          expectedOk,
          `section=${candidate.section} label=${JSON.stringify(candidate.label)} ` +
            `lengthOk=${lengthOk} isDuplicate=${isDuplicate} -> ${JSON.stringify(result)}`
        );
        // Rejections must carry a reason; acceptances must not pretend to fail.
        if (!result.ok) {
          assert.strictEqual(typeof result.reason, "string");
          assert.ok(result.reason.length > 0);
        }
      }
    ),
    { numRuns: 200 }
  );
});

/* ================================================================== */
/* Smoke test (task 9.6): subject tree renders the four sections      */
/* and their groupings                                                */
/* Validates: Requirements 5.1                                        */
/* ================================================================== */

// Expected blueprint structure: section -> group name -> topic labels.
// Mirrors CONTENT_SUBJECT_TREE so a drift in core.js is caught here.
const EXPECTED_TREE = [
  {
    section: "C/P",
    groups: [
      {
        name: "Chemical and Physical Foundations",
        topics: ["General Chemistry", "Organic Chemistry", "Physics", "Biochemistry"],
      },
    ],
  },
  {
    section: "CARS",
    groups: [
      {
        name: "Critical Analysis and Reasoning Skills",
        topics: ["Passage practice", "Timing", "Question type review"],
      },
    ],
  },
  {
    section: "B/B",
    groups: [
      {
        name: "Biological and Biochemical Foundations",
        topics: ["Biology", "Biochemistry", "Experimental design"],
      },
    ],
  },
  {
    section: "P/S",
    groups: [
      {
        name: "Psychological, Social, and Biological Foundations",
        topics: ["Psychology", "Sociology", "Research methods/statistics"],
      },
    ],
  },
];

test("smoke: buildSubjectTree exposes exactly the four MCAT sections in order", () => {
  const tree = buildSubjectTree([]);
  assert.ok(Array.isArray(tree), "tree must be an array");
  assert.strictEqual(tree.length, 4, "tree must have four sections");
  assert.deepStrictEqual(
    tree.map((node) => node.section),
    ["C/P", "CARS", "B/B", "P/S"]
  );
});

test("smoke: each section exposes its blueprint groupings and topics", () => {
  const tree = buildSubjectTree([]);
  for (const expected of EXPECTED_TREE) {
    const node = tree.find((n) => n.section === expected.section);
    assert.ok(node, `section missing: ${expected.section}`);
    assert.deepStrictEqual(
      node.groups,
      expected.groups,
      `groupings/topics mismatch for section ${expected.section}`
    );
  }
});

test("smoke: custom topics merge under a Custom group without dropping predefined groups", () => {
  const tree = buildSubjectTree([{ section: "C/P", label: "Thermodynamics" }]);

  // All four sections still present.
  assert.strictEqual(tree.length, 4);

  const cp = tree.find((n) => n.section === "C/P");
  assert.ok(cp, "C/P section must be present");

  // The predefined group is untouched.
  const predefined = cp.groups.find(
    (g) => g.name === "Chemical and Physical Foundations"
  );
  assert.ok(predefined, "predefined C/P group must remain");
  assert.deepStrictEqual(predefined.topics, [
    "General Chemistry",
    "Organic Chemistry",
    "Physics",
    "Biochemistry",
  ]);

  // The custom topic attaches under a trailing Custom group.
  const custom = cp.groups.find((g) => g.name === "Custom");
  assert.ok(custom, "Custom group must be created for the custom topic");
  assert.deepStrictEqual(custom.topics, ["Thermodynamics"]);
});
