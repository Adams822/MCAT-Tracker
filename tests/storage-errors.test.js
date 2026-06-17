"use strict";

// [DOM] Example/unit tests for the DOM-coupled storage & import error paths
// (Req 1.6, 1.7, 2.6, 2.7) described in the design's "Error Handling" /
// "Storage & Migration" / "Backup" sections. Verified by example/unit tests
// only — never property tests.
//
// The real load()/save()/showSaveError()/import handlers live in app.js and
// are tightly coupled to the DOM + localStorage, and app.js performs hundreds
// of top-level document.getElementById() calls on import, so it cannot be
// `require`d under node:test (there is no jsdom in the dev harness). Instead,
// these tests drive FAITHFUL mimics that mirror the app.js source line-for-line
// for the specific branches under test, backed by the REAL pure helpers from
// core.js (MCAT.parseBackup / MCAT.migrate / MCAT.defaultState) and tiny
// fake `localStorage` / `document` stubs. This lets every branch be asserted
// deterministically. Dev-only: never shipped with the app.

const { test } = require("node:test");
const assert = require("node:assert");

const MCAT = require("../core.js");

// ---------------------------------------------------------------------------
// Tiny fakes for the DOM-ish globals the real handlers touch.
// ---------------------------------------------------------------------------

// Minimal Web Storage shim. Tracks the raw stored string so we can assert it
// is RETAINED (never overwritten) on a load failure (Req 1.6). setItem can be
// configured to throw to exercise the write-failure path (Req 1.7).
function makeLocalStorage(initialRaw, opts = {}) {
  const store = new Map();
  if (initialRaw !== undefined) store.set(MCAT.STORE_KEY, String(initialRaw));
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      if (opts.throwOnSet) throw new Error("QuotaExceededError");
      store.set(key, String(value));
    },
    // test-only inspector
    _peek(key) {
      return store.has(key) ? store.get(key) : null;
    },
  };
}

// Minimal DOM element + document stubs — just enough surface for the real
// showSaveError() body (createElement, setAttribute, style.cssText, appendChild,
// addEventListener, textContent, id lookup).
function makeFakeDocument() {
  const byId = new Map();

  function makeEl(tag) {
    const children = [];
    const el = {
      tagName: String(tag).toUpperCase(),
      style: {},
      attributes: {},
      children,
      _id: "",
      get id() {
        return this._id;
      },
      set id(v) {
        this._id = v;
        byId.set(v, this);
      },
      setAttribute(name, value) {
        this.attributes[name] = value;
      },
      getAttribute(name) {
        return this.attributes[name];
      },
      addEventListener() {
        /* no-op for tests */
      },
      appendChild(child) {
        children.push(child);
        return child;
      },
      remove() {
        /* no-op for tests */
      },
    };
    return el;
  }

  const body = makeEl("body");

  return {
    body,
    documentElement: makeEl("html"),
    createElement: (tag) => makeEl(tag),
    getElementById: (id) => (byId.has(id) ? byId.get(id) : null),
  };
}

// ---------------------------------------------------------------------------
// Faithful mimics of the app.js handlers under test.
// ---------------------------------------------------------------------------

// Mirrors app.js load() exactly (lines under "function load()"): try/catch
// around getItem+JSON.parse; success path shallow-merges over a fresh
// defaultState then migrates; failure path sets __loadFailed (on the provided
// window stub) and returns migrate(structuredClone(defaultState)) WITHOUT
// writing anything back, so the unparseable value survives in storage.
function load(ls, win) {
  try {
    const raw = ls.getItem(MCAT.STORE_KEY);
    if (!raw) return MCAT.migrate(structuredClone(MCAT.defaultState));
    const parsed = JSON.parse(raw);
    return MCAT.migrate({ ...structuredClone(MCAT.defaultState), ...parsed });
  } catch (e) {
    win.__loadFailed = true;
    return MCAT.migrate(structuredClone(MCAT.defaultState));
  }
}

// Mirrors app.js showSaveError(e): lazily creates a fixed-position, role="alert"
// banner with a dismissible close button and a non-blocking message. Wrapped so
// it can never throw back into save().
function showSaveError(doc, e) {
  try {
    if (!doc) return;
    let banner = doc.getElementById("saveErrorBanner");
    if (!banner) {
      banner = doc.createElement("div");
      banner.id = "saveErrorBanner";
      banner.setAttribute("role", "alert");

      const msg = doc.createElement("span");
      msg.id = "saveErrorBannerMsg";

      const close = doc.createElement("button");
      close.type = "button";
      close.textContent = "\u2715";
      close.setAttribute("aria-label", "Dismiss");
      close.addEventListener("click", () => banner.remove());

      banner.appendChild(msg);
      banner.appendChild(close);
      (doc.body || doc.documentElement).appendChild(banner);
    }
    const msgEl = doc.getElementById("saveErrorBannerMsg");
    if (msgEl) {
      msgEl.textContent =
        "Couldn't save your changes — browser storage may be full or blocked. " +
        "Your latest edits are kept on screen but won't persist until a save succeeds.";
    }
  } catch (_) {
    /* never let the error-surface path throw back into save() */
  }
}

// Mirrors app.js save(): writes the whole state; on a setItem throw it leaves
// the in-memory state untouched, surfaces the error via showSaveError, and
// returns false. Never throws.
function save(state, ls, doc) {
  try {
    ls.setItem(MCAT.STORE_KEY, JSON.stringify(state));
    return true;
  } catch (e) {
    showSaveError(doc, e);
    return false;
  }
}

// Mirrors the import handler's apply step after a successful parse:
//   parse fail        -> reject (handled by parseBackup, tested below)
//   confirm === false -> state unchanged, imported values NOT applied (Req 2.7)
//   confirm === true  -> migrate({ ...clone(defaults), ...value })       (Req 2.6, 2.4)
function applyImport(currentState, parsed, confirmed) {
  if (parsed.ok !== true) return currentState;
  if (!confirmed) return currentState;
  return MCAT.migrate({ ...structuredClone(MCAT.defaultState), ...parsed.value });
}

// ===========================================================================
// Req 1.6 — corrupt localStorage: load() returns defaults, never throws,
// sets __loadFailed, and RETAINS the unparseable stored value.
// ===========================================================================

test("Req 1.6: corrupt localStorage -> load() returns a fully-shaped default state without throwing", () => {
  const corruptRaw = "<<<not valid json>>>";
  const ls = makeLocalStorage(corruptRaw);
  const win = {};

  let state;
  assert.doesNotThrow(() => {
    state = load(ls, win);
  });

  // Fully shaped: every documented top-level key is present.
  for (const key of Object.keys(MCAT.defaultState)) {
    assert.ok(key in state, `fallback state is missing key "${key}"`);
  }
  // Nested defaults present and the schema version was stamped by migrate().
  assert.strictEqual(state.schemaVersion, MCAT.defaultState.schemaVersion);
  assert.strictEqual(typeof state.goals, "object");
  assert.strictEqual(state.goals.targetScore, MCAT.defaultState.goals.targetScore);
  assert.ok(Array.isArray(state.practiceSets));
});

test("Req 1.6: corrupt localStorage -> load() sets __loadFailed", () => {
  const ls = makeLocalStorage("{ broken json");
  const win = {};

  load(ls, win);

  assert.strictEqual(win.__loadFailed, true, "__loadFailed must be set on parse failure");
});

test("Req 1.6: corrupt localStorage -> the unparseable stored value is retained (load never overwrites it)", () => {
  const corruptRaw = "{ definitely not json ]";
  const ls = makeLocalStorage(corruptRaw);
  const win = {};

  load(ls, win);

  // load() must NOT call save()/setItem on the failure path; the original
  // corrupt value stays in storage until the next successful save.
  assert.strictEqual(ls._peek(MCAT.STORE_KEY), corruptRaw);
});

test("Req 1.6: a valid stored state still loads (control) and does not flag __loadFailed", () => {
  const valid = MCAT.migrate(structuredClone(MCAT.defaultState));
  valid.target = 521;
  const ls = makeLocalStorage(JSON.stringify(valid));
  const win = {};

  const state = load(ls, win);

  assert.strictEqual(state.target, 521);
  assert.notStrictEqual(win.__loadFailed, true);
});

// ===========================================================================
// Req 1.7 — write failure: save() leaves in-memory state unchanged AND
// surfaces an error indication (showSaveError), without prioritizing one.
// ===========================================================================

test("Req 1.7: setItem throwing -> save() returns false and leaves the in-memory state unchanged", () => {
  const state = MCAT.migrate(structuredClone(MCAT.defaultState));
  state.target = 517;
  const before = structuredClone(state);

  const ls = makeLocalStorage(undefined, { throwOnSet: true });
  const doc = makeFakeDocument();

  let saved;
  assert.doesNotThrow(() => {
    saved = save(state, ls, doc);
  });

  assert.strictEqual(saved, false, "save must report failure on a setItem throw");
  assert.deepStrictEqual(state, before, "in-memory state must be untouched on write failure");
});

test("Req 1.7: setItem throwing -> an error indication is surfaced (showSaveError banner)", () => {
  const state = MCAT.migrate(structuredClone(MCAT.defaultState));
  const ls = makeLocalStorage(undefined, { throwOnSet: true });
  const doc = makeFakeDocument();

  save(state, ls, doc);

  // The non-blocking banner must exist, be an alert, and carry a message.
  const banner = doc.getElementById("saveErrorBanner");
  assert.ok(banner, "a save-error banner must be created to surface the failure");
  assert.strictEqual(banner.getAttribute("role"), "alert");

  const msgEl = doc.getElementById("saveErrorBannerMsg");
  assert.ok(msgEl, "the banner must contain a message element");
  assert.match(msgEl.textContent, /save/i);
  assert.ok(msgEl.textContent.length > 0, "the surfaced message must be non-empty");
});

test("Req 1.7: a successful write returns true, surfaces no error, and leaves state unchanged", () => {
  const state = MCAT.migrate(structuredClone(MCAT.defaultState));
  const before = structuredClone(state);
  const ls = makeLocalStorage(undefined);
  const doc = makeFakeDocument();

  const saved = save(state, ls, doc);

  assert.strictEqual(saved, true);
  assert.strictEqual(doc.getElementById("saveErrorBanner"), null, "no error banner on success");
  assert.deepStrictEqual(state, before, "save does not mutate the in-memory state");
  // The serialized state was actually persisted.
  assert.strictEqual(ls._peek(MCAT.STORE_KEY), JSON.stringify(before));
});

// ===========================================================================
// Req 2.5 / 2.6 — parseBackup rejects invalid/non-object payloads (import
// reject path) without throwing.
// ===========================================================================

test("Req 2.5: parseBackup on invalid JSON returns {ok:false} and does not throw", () => {
  let result;
  assert.doesNotThrow(() => {
    result = MCAT.parseBackup("{ this is not valid json ]");
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(typeof result.reason, "string");
});

test("Req 2.5: parseBackup rejects valid JSON that is not a plain object (array)", () => {
  let result;
  assert.doesNotThrow(() => {
    result = MCAT.parseBackup("[1, 2, 3]");
  });
  assert.strictEqual(result.ok, false);
});

// ===========================================================================
// Req 2.6 / 2.7 — import confirm/cancel branches.
//   confirm = false (cancel) -> state unchanged, imported values NOT applied
//   confirm = true           -> state replaced with migrated imported values
// ===========================================================================

test("Req 2.7: import cancel branch leaves the current state unchanged", () => {
  const current = MCAT.migrate(structuredClone(MCAT.defaultState));
  current.target = 515; // a distinguishing existing value
  const snapshot = structuredClone(current);

  const parsed = MCAT.parseBackup(JSON.stringify({ target: 999, practiceSets: [{ id: 1 }] }));
  assert.strictEqual(parsed.ok, true);

  const result = applyImport(current, parsed, /* confirmed */ false);

  assert.strictEqual(result, current, "cancel must return the same state reference");
  assert.deepStrictEqual(result, snapshot, "cancel must not apply any imported values");
});

test("Req 2.6: import confirm branch replaces state with migrated imported values", () => {
  const current = MCAT.migrate(structuredClone(MCAT.defaultState));

  const importedValue = {
    target: 528,
    practiceSets: [{ id: 42, section: "C/P", correct: 5, attempted: 10 }],
  };
  const parsed = MCAT.parseBackup(JSON.stringify(importedValue));
  assert.strictEqual(parsed.ok, true);

  const result = applyImport(current, parsed, /* confirmed */ true);

  // Imported values are reflected.
  assert.strictEqual(result.target, 528);
  assert.deepStrictEqual(result.practiceSets, importedValue.practiceSets);

  // Missing new-module keys are backfilled with documented defaults (Req 2.4).
  for (const key of Object.keys(MCAT.defaultState)) {
    assert.ok(key in result, `imported+migrated state is missing key "${key}"`);
  }
  assert.strictEqual(result.schemaVersion, MCAT.defaultState.schemaVersion);
});

test("Req 2.6/2.7: a rejected parse never reaches the confirm step (state unchanged)", () => {
  const current = MCAT.migrate(structuredClone(MCAT.defaultState));
  const snapshot = structuredClone(current);

  const parsed = MCAT.parseBackup("not json at all");
  assert.strictEqual(parsed.ok, false);

  // Even if "confirmed" were somehow true, a failed parse applies nothing.
  const result = applyImport(current, parsed, /* confirmed */ true);
  assert.strictEqual(result, current);
  assert.deepStrictEqual(result, snapshot);
});
