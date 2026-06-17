"use strict";

// Trivial smoke test to confirm the harness runs and core.js is importable.
// Dev-only: never shipped with the app.

const { test } = require("node:test");
const assert = require("node:assert");

const MCAT = require("../core.js");

test("harness smoke: MCAT surface is an object", () => {
  assert.strictEqual(typeof MCAT, "object");
  assert.notStrictEqual(MCAT, null);
});
