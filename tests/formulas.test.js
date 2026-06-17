"use strict";

// Feature: mcat-tracker-expansion, Property 32: Formula and note search is a correct case-insensitive substring filter
// Feature: mcat-tracker-expansion, Property 33: Tag filter returns entries with at least one selected tag
//
// Exercises the pure formula helpers in core.js:
//   - searchFormulas(formulas, term)  (case-insensitive substring filter)
//   - filterByTags(formulas, selectedTags)  (>=1 selected tag)
//
// This file is SELF-CONTAINED on purpose: it defines its own fast-check
// arbitraries inline rather than importing tests/helpers.js, mirroring the
// convention used by sibling property-test files.
//
// Dev-only: part of the test harness, never shipped with the app.

const { test } = require("node:test");
const assert = require("node:assert");
const fc = require("fast-check");
const MCAT = require("../core.js");

const { searchFormulas, filterByTags, SEED_FORMULAS } = MCAT;

/* ------------------------------------------------------------------ */
/* Shared helpers / arbitraries                                        */
/* ------------------------------------------------------------------ */

// Mirror core.js's plain-object test (rejects null and arrays) so the oracle
// classifies entries exactly as the implementation does.
function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

// Independent re-implementation of containsCI: empty term matches all; null
// fields are treated as empty strings; comparison is case-insensitive.
function containsCIOracle(haystack, term) {
  const t = String(term == null ? "" : term).toLowerCase();
  if (t === "") return true;
  return String(haystack == null ? "" : haystack).toLowerCase().includes(t);
}

function stringOf(chars, opts) {
  return fc.array(fc.constantFrom(...chars), opts).map((a) => a.join(""));
}

const LETTERS = "abcdefghijklmnopqrstuvwxyz".split("");

// A small, shared token pool so generated terms/tags actually collide with
// generated field values often enough to exercise the match path.
const TOKENS = ["force", "Force", "FORCE", "energy", "pH", "velocity", "Optics", "x", ""];
const TAG_POOL = ["Physics", "physics", "Optics", "Fluids", "Circuits", "Acid", "ACID", ""];

// A field value: a random short letter string, or a token (with case
// variation), or empty — covers matches, near-misses, and empties.
const arbField = fc.oneof(
  stringOf(LETTERS, { minLength: 0, maxLength: 10 }),
  fc.constantFrom(...TOKENS)
);

const arbTags = fc.array(fc.constantFrom(...TAG_POOL), { maxLength: 4 });

const arbFormula = fc.record({
  id: stringOf(LETTERS, { minLength: 1, maxLength: 6 }),
  name: arbField,
  expression: arbField,
  tags: arbTags,
  memorized: fc.boolean(),
});

// Mix in a few real seed formulas to make the inputs realistic, plus some
// non-object junk entries so the "skip non-object" branch is exercised.
const arbSeedFormula = fc.constantFrom(...SEED_FORMULAS).map((f) => ({ ...f, tags: [...f.tags] }));
const arbJunkEntry = fc.constantFrom(null, 42, "string", undefined);

const arbEntry = fc.oneof(
  { weight: 6, arbitrary: arbFormula },
  { weight: 2, arbitrary: arbSeedFormula },
  { weight: 1, arbitrary: arbJunkEntry }
);

const arbFormulaList = fc.array(arbEntry, { maxLength: 12 });

/* ================================================================== */
/* Property 32: search is a correct case-insensitive substring filter  */
/* Validates: Requirements 13.2, 13.4, 14.3                            */
/* ================================================================== */

// A search term: a re-cased token, a short random fragment, or empty.
const arbTerm = fc.oneof(
  fc.constantFrom(...TOKENS, "PH", "ph", "OPT", "zzz", "Force"),
  stringOf(LETTERS, { minLength: 0, maxLength: 4 })
);

test("Property 32: searchFormulas returns exactly the entries whose name/expression/tag contains the term (case-insensitive)", () => {
  fc.assert(
    fc.property(arbFormulaList, arbTerm, (formulas, term) => {
      const result = searchFormulas(formulas, term);

      // Independent oracle mirroring searchFormulas: skip non-objects, then
      // case-insensitive substring over name | expression | any tag.
      const expected = formulas.filter((f) => {
        if (!isPlainObject(f)) return false;
        if (containsCIOracle(f.name, term)) return true;
        if (containsCIOracle(f.expression, term)) return true;
        const tags = Array.isArray(f.tags) ? f.tags : [];
        return tags.some((tag) => containsCIOracle(tag, term));
      });

      // Exact match: same entries, same order, same references.
      assert.deepStrictEqual(result, expected);

      // Every returned entry genuinely matches the term somewhere.
      const lower = String(term == null ? "" : term).toLowerCase();
      if (lower !== "") {
        for (const f of result) {
          const tags = Array.isArray(f.tags) ? f.tags : [];
          const hit =
            String(f.name == null ? "" : f.name).toLowerCase().includes(lower) ||
            String(f.expression == null ? "" : f.expression).toLowerCase().includes(lower) ||
            tags.some((t) => String(t == null ? "" : t).toLowerCase().includes(lower));
          assert.ok(hit, `returned entry does not match term ${JSON.stringify(term)}`);
        }
      }
    }),
    { numRuns: 200 }
  );
});

test("Property 32: clearing the term returns all (plain-object) entries", () => {
  fc.assert(
    fc.property(arbFormulaList, fc.constantFrom("", null, undefined), (formulas, emptyTerm) => {
      const result = searchFormulas(formulas, emptyTerm);
      const expected = formulas.filter(isPlainObject);
      assert.deepStrictEqual(result, expected);
    }),
    { numRuns: 100 }
  );
});

/* ================================================================== */
/* Property 33: tag filter returns entries with >=1 selected tag       */
/* Validates: Requirements 13.9                                        */
/* ================================================================== */

// A non-empty set of selected tags drawn from the same pool the entries use,
// so intersections are common.
const arbSelectedTags = fc.array(fc.constantFrom(...TAG_POOL, "Thermodynamics", "Unused"), {
  minLength: 1,
  maxLength: 4,
});

test("Property 33: filterByTags returns exactly the entries sharing at least one selected tag", () => {
  fc.assert(
    fc.property(arbFormulaList, arbSelectedTags, (formulas, selectedTags) => {
      const result = filterByTags(formulas, selectedTags);

      const wanted = new Set(selectedTags.map((t) => String(t == null ? "" : t)));
      const expected = formulas.filter((f) => {
        if (!isPlainObject(f)) return false;
        const tags = Array.isArray(f.tags) ? f.tags : [];
        return tags.some((tag) => wanted.has(String(tag == null ? "" : tag)));
      });

      // Exact match: same entries, same order, same references.
      assert.deepStrictEqual(result, expected);

      // Every returned entry shares at least one selected tag.
      for (const f of result) {
        const tags = Array.isArray(f.tags) ? f.tags : [];
        assert.ok(
          tags.some((tag) => wanted.has(String(tag == null ? "" : tag))),
          "returned entry shares no selected tag"
        );
      }
    }),
    { numRuns: 200 }
  );
});

test("Property 33: an empty tag selection shows all (plain-object) entries", () => {
  fc.assert(
    fc.property(arbFormulaList, (formulas) => {
      const result = filterByTags(formulas, []);
      const expected = formulas.filter(isPlainObject);
      assert.deepStrictEqual(result, expected);
    }),
    { numRuns: 100 }
  );
});
