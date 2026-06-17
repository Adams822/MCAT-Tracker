# MCAT Command Center — Test Harness (dev-only)

This folder holds the **dev-only** test harness for the MCAT Command Center. It is
**never shipped with the app**. The deployed artifact remains the static, dependency-free
files (`index.html`, `app.js`, `styles.css`, `core.js`, plus `Resources/`). Nothing in
this `tests/` folder — including `package.json` and `node_modules/` — is part of that
artifact.

## Requirements

- **Node.js >= 18** (uses the built-in `node:test` runner and `node:assert`).

## Install dev dependencies

Property-based tests use [`fast-check`](https://github.com/dubzzz/fast-check), declared
as a devDependency here. Install it once (from this `tests/` folder):

```
npm install
```

## Running the tests

Run the full suite as a single-shot command **from the repository root**:

```
node --test tests/
```

This uses Node's built-in test runner. There is no watch mode configured (watch modes
block), so re-run the command manually after changes.

## Layout

- `helpers.js` — shared `fast-check` arbitraries and helpers; requires `../core.js`.
- `smoke.test.js` — confirms the harness runs and `core.js` exposes the `MCAT` namespace.
- `*.test.js` — per-module property and example tests (added as modules land).
