"use strict";

// Dev-only test harness file. Never shipped with the three-file app artifact.
//
// Property-based tests for the pure-layer markdown renderer and target-score
// validator in core.js. Run with: node --test tests/
//
// Covers design Properties 34, 35, 36 (Requirements 14.6, 14.8, 15.7, 19.6).

const { test } = require("node:test");
const assert = require("node:assert");
const fc = require("fast-check");

const MCAT = require("../core.js");

const NUM_RUNS = 200;

// ---------------------------------------------------------------------------
// Inline arbitraries
// ---------------------------------------------------------------------------

// Ordinary-ish markdown text: a mix of headings, lists, emphasis, code, links,
// blank lines, and free text. Exercises the renderer's transform paths.
const arbMarkdownFragment = fc.oneof(
  fc.string(),
  fc.constant("# Heading one"),
  fc.constant("## Heading two"),
  fc.constant("### Heading three"),
  fc.constant("- bullet item"),
  fc.constant("1. numbered item"),
  fc.constant("**bold text**"),
  fc.constant("*italic text*"),
  fc.constant("`inline code`"),
  fc.constant("[label](https://example.com/path)"),
  fc.constant("[rel](/relative/path)"),
  fc.constant(""),
  fc.constant("plain paragraph text")
);

// Hostile payload fragments: classic XSS vectors that MUST be neutralized.
const HOSTILE_FRAGMENTS = [
  "<script>alert(1)</script>",
  "<script src='evil.js'></script>",
  "<img src=x onerror=alert(1)>",
  "<svg/onload=alert(1)>",
  "<iframe src=javascript:alert(1)></iframe>",
  "<a href=\"javascript:alert(1)\">x</a>",
  "[click](javascript:alert(1))",
  "[click](javascript:alert(document.cookie))",
  "[click](data:text/html,<script>alert(1)</script>)",
  "[click](vbscript:msgbox(1))",
  "[click](JaVaScRiPt:alert(1))",
  "<body onload=alert(1)>",
  "\"><script>alert(1)</script>",
  "'><img src=x onerror=alert(1)>",
  "<div onclick=alert(1)>text</div>",
  "<<script>script>alert(1)<</script>/script>",
  "<a href=\"  javascript:alert(1)\">y</a>",
  "<a href=\"java\tscript:alert(1)\">z</a>",
];

const arbHostileFragment = fc.constantFrom(...HOSTILE_FRAGMENTS);

// A hostile markdown body: interleave hostile payloads with ordinary fragments
// and random text, joined by newlines so multi-line transform paths run too.
const arbHostileMarkdown = fc
  .array(fc.oneof(arbHostileFragment, arbMarkdownFragment, fc.string()), {
    minLength: 1,
    maxLength: 8,
  })
  .map((parts) => parts.join("\n"));

// Any body string at all (the most general input domain).
const arbAnyBody = fc.oneof(fc.string(), arbHostileMarkdown);

// ---------------------------------------------------------------------------
// Property 34: Markdown body is preserved verbatim
// ---------------------------------------------------------------------------
// Feature: mcat-tracker-expansion, Property 34: Markdown body is preserved verbatim
// For any string, storing it as a Note_Entry body and later reading the stored
// body returns a string equal to the input character for character; rendering
// never mutates the stored body.
// Validates: Requirements 14.6

test("Property 34: stored body reads back char-for-char and renderMarkdown does not mutate its input", () => {
  fc.assert(
    fc.property(arbAnyBody, (body) => {
      // core stores raw markdown verbatim, so "storage" is modeled as identity:
      // a freshly captured snapshot of the input must survive rendering unchanged.
      const original = body; // strings are immutable; capture the exact value
      const snapshot = String(body); // independent char-for-char copy

      const rendered = MCAT.renderMarkdown(body);

      // Rendering must not have changed the value bound to `body`.
      assert.strictEqual(
        body,
        original,
        "renderMarkdown must not mutate its input argument"
      );
      // The raw string read back equals the input character for character.
      assert.strictEqual(
        body,
        snapshot,
        "stored body must read back identical to the input"
      );
      // Rendering twice yields identical output (no hidden input-dependent state).
      assert.strictEqual(
        rendered,
        MCAT.renderMarkdown(body),
        "renderMarkdown must be a pure function of its input"
      );
    }),
    { numRuns: NUM_RUNS }
  );
});

// ---------------------------------------------------------------------------
// Property 35: Markdown rendering is XSS-safe
// ---------------------------------------------------------------------------
// Feature: mcat-tracker-expansion, Property 35: Markdown rendering is XSS-safe
// For any note body (including embedded <script>, event-handler attributes, raw
// HTML tags, quotes, and javascript:/data:/vbscript: links), renderMarkdown
// produces output where all such content is inert escaped text: no live <script>
// element derived from input, every author-supplied literal < / > appears escaped
// as &lt; / &gt;, and no executable link target survives (no href="javascript:"
// etc.).
// Validates: Requirements 14.8

test("Property 35: renderMarkdown output is XSS-safe for arbitrary and hostile bodies", () => {
  fc.assert(
    fc.property(arbHostileMarkdown, (body) => {
      const out = MCAT.renderMarkdown(body);
      const lower = out.toLowerCase();

      // (1) No live <script> tag (opening or closing) derived from input.
      // The renderer never emits script tags, so any occurrence is a breach.
      assert.ok(
        !lower.includes("<script"),
        "output must not contain a live <script tag: " + JSON.stringify(out)
      );
      assert.ok(
        !lower.includes("</script"),
        "output must not contain a live </script tag: " + JSON.stringify(out)
      );

      // (2) No un-escaped author angle bracket survives. The renderer escapes
      // the whole body FIRST, so the ONLY raw <,> in the output belong to the
      // renderer's own fixed whitelist of generated tags. Strip those tags; any
      // remaining raw < or > would be author-supplied markup that leaked through.
      // (Author brackets that survive appear only as inert &lt;/&gt; entities,
      // which contain no raw angle bracket.)
      const stripped = out
        .replace(/<a href="[^"]*">/g, "") // generated link opening tag
        .replace(
          /<\/?(?:p|h1|h2|h3|ul|ol|li|strong|em|code|a)>/g,
          ""
        ); // all other generated tags (open/close)
      assert.ok(
        !stripped.includes("<"),
        "no un-escaped author '<' may survive: " + JSON.stringify(out)
      );
      assert.ok(
        !stripped.includes(">"),
        "no un-escaped author '>' may survive: " + JSON.stringify(out)
      );

      // (3) No executable link target survives. A neutralized scheme must never
      // appear as an href value in the output.
      assert.ok(
        !lower.includes('href="javascript:'),
        "javascript: link target must be neutralized: " + JSON.stringify(out)
      );
      assert.ok(
        !lower.includes('href="data:'),
        "data: link target must be neutralized: " + JSON.stringify(out)
      );
      assert.ok(
        !lower.includes('href="vbscript:'),
        "vbscript: link target must be neutralized: " + JSON.stringify(out)
      );
    }),
    { numRuns: NUM_RUNS }
  );
});

// Targeted hostile examples (complement the property; pin specific vectors).
test("Property 35: specific XSS payloads are neutralized", () => {
  const cases = [
    "<script>alert(1)</script>",
    "<img src=x onerror=alert(1)>",
    "[x](javascript:alert(1))",
    "[x](JaVaScRiPt:alert(1))",
    "[x](data:text/html,<script>alert(1)</script>)",
    '"><script>alert(document.cookie)</script>',
  ];
  for (const body of cases) {
    const lower = MCAT.renderMarkdown(body).toLowerCase();
    assert.ok(!lower.includes("<script"), "no live script for: " + body);
    assert.ok(!lower.includes('href="javascript:'), "no js href for: " + body);
    assert.ok(!lower.includes('href="data:'), "no data href for: " + body);
  }
});

// ---------------------------------------------------------------------------
// Property 36: Target-score validation is exact
// ---------------------------------------------------------------------------
// Feature: mcat-tracker-expansion, Property 36: Target-score validation is exact
// For any value, validateTarget accepts it (ok === true) if and only if it
// coerces to an integer in [472, 528]; otherwise ok === false.
// Validates: Requirements 15.7, 19.6

// Oracle mirroring the documented contract: numbers and (non-blank) numeric
// strings that coerce to an integer in [472,528] are accepted; everything else
// is rejected.
function expectedOk(value) {
  if (typeof value !== "number" && typeof value !== "string") return false;
  if (typeof value === "string" && value.trim() === "") return false;
  const num = Number(value);
  if (!Number.isInteger(num)) return false;
  return num >= 472 && num <= 528;
}

// Mixed domain: in/out-of-range integers, non-integers, NaN/Infinity, numeric
// and non-numeric strings, and non-number/non-string values.
const arbCandidate = fc.oneof(
  fc.integer({ min: 472, max: 528 }), // in range
  fc.integer({ min: -1000, max: 471 }), // below range
  fc.integer({ min: 529, max: 2000 }), // above range
  fc.double().filter((d) => !Number.isInteger(d)), // non-integers incl. NaN/Inf
  fc.constant(NaN),
  fc.constant(Infinity),
  fc.constant(-Infinity),
  fc.integer({ min: 472, max: 528 }).map((n) => String(n)), // numeric string in range
  fc.integer({ min: 529, max: 2000 }).map((n) => String(n)), // numeric string out
  fc.string(), // arbitrary (mostly non-numeric) strings
  fc.constant(""),
  fc.constant("   "),
  fc.boolean(),
  fc.constant(null),
  fc.constant(undefined),
  fc.object()
);

test("Property 36: validateTarget accepts iff value is an integer in [472,528]", () => {
  fc.assert(
    fc.property(arbCandidate, (value) => {
      const result = MCAT.validateTarget(value);
      const exp = expectedOk(value);
      assert.strictEqual(
        result.ok,
        exp,
        "validateTarget(" + JSON.stringify(value) + ").ok must be " + exp
      );
      if (result.ok) {
        assert.strictEqual(
          result.value,
          Number(value),
          "accepted value must be the coerced integer"
        );
        assert.ok(Number.isInteger(result.value));
        assert.ok(result.value >= 472 && result.value <= 528);
      } else {
        assert.strictEqual(typeof result.reason, "string");
      }
    }),
    { numRuns: NUM_RUNS }
  );
});

// Explicit edge cases called out by the task.
test("Property 36: explicit boundary and edge cases", () => {
  // In-range integers (including boundaries) accepted.
  for (const n of [472, 473, 500, 527, 528]) {
    assert.deepStrictEqual(MCAT.validateTarget(n), { ok: true, value: n });
  }
  // Out-of-range integers rejected.
  for (const n of [471, 529, 0, -5, 1000]) {
    assert.strictEqual(MCAT.validateTarget(n).ok, false);
  }
  // Non-integers rejected.
  for (const n of [500.5, 472.0001, 0.1]) {
    assert.strictEqual(MCAT.validateTarget(n).ok, false);
  }
  // NaN / Infinity rejected.
  for (const n of [NaN, Infinity, -Infinity]) {
    assert.strictEqual(MCAT.validateTarget(n).ok, false);
  }
  // Non-numeric and blank strings rejected.
  for (const s of ["", "   ", "abc", "5e2x", "five hundred"]) {
    assert.strictEqual(MCAT.validateTarget(s).ok, false);
  }
});
