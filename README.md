# MCAT Command Center

A single-page web app for planning and tracking MCAT prep — study schedule, practice
performance, content review, full-length scores, and test-day readiness, all in one place.

It runs entirely in your browser. There is **no backend, no build step, and no
dependencies** — your data is saved locally in the browser (`localStorage`), and the app
never makes network requests.

---

## Quick start

No installation needed.

**Option A — open the file directly**
Download/clone the repo and double-click `index.html` (or open it in any modern browser).

**Option B — run a local server** (recommended, mirrors a real deployment)

```bash
# from the project folder
python3 -m http.server 8000
# then open http://localhost:8000/index.html
```

Your data persists per browser/origin, so use the same URL each time to keep your entries.

---

## Features

**Planning & focus**
- **Dashboard** — test-day countdown, study heatmap, streak, priority tasks, average
  practice accuracy, reviews due today, weekly-hour goal, and lowest-accuracy topics
- **Calendar** — day/week/month views with a study-schedule auto-fill generator
- **To-Do List** — daily/weekly/monthly tasks that reset automatically
- **Pomodoro** — focus timer that logs time straight into the heatmap
- **Focus Topics** — high-yield concepts to drill

**Performance tracking**
- **Practice Questions** — log sets and see accuracy over time, by topic, by section, and
  timed vs. untimed
- **Wrong Answers** — error log with mistake categories, explanations, takeaways,
  needs-review flags, retest dates, and repeat-miss detection
- **Test Scores** — full-length history with per-section trends, percentiles, testing
  conditions, and lessons learned
- **Analytics** — weakness ranking, mistake frequency, weekly volume/hours, and a
  predicted score range
- **CARS Tracker** — passage accuracy, timing, and accuracy by question type
- **Review** — spaced-repetition queue (1 / 3 / 7 / 21-day) with due counts and retention

**Knowledge & goals**
- **Content Tracker** — review status across every MCAT subject and topic
- **Formulas** — searchable equation sheet with tag filters, memorized toggles, and a
  practice-recall mode
- **Notes** — markdown notes (XSS-safe) with search and links to error-log entries
- **Goals** — target score, weekly-hour / daily-question goals, and milestones
- **Daily Log** — daily study log with reflection prompts
- **Readiness** — test-day checklist
- **Settings** — profile, test date, target, diagnostic, and study phase

**Quality-of-life**
- **Reminder bar** — surfaces countdowns, due reviews, and retests across every view
- **Customizable sidebar** — drag to reorder nav entries and hide the ones you don't use
- **Backup** — export/import your full data as a JSON file
- **Light / dark theme**
- **Safe data migration** — older saved data is upgraded automatically without loss

---

## Project structure

```
index.html   # markup for every view + the sidebar
app.js        # render functions, event handlers, and DOM wiring
core.js       # pure, DOM-free logic (validation, aggregation, migration, markdown, etc.)
styles.css    # all styling (dark + light themes via CSS custom properties)
Resources/    # reference tip sheets and documents
tests/        # dev-only test suite (NOT shipped with the app)
```

The shipped app is just `index.html`, `app.js`, `core.js`, `styles.css`, and `Resources/`.
`core.js` is loaded before `app.js` and exposes a shared `MCAT` namespace; the same module
is reused by the test suite under Node.

---

## Data & privacy

- All data lives in your browser under the `localStorage` key `mcat_command_center_v2`.
- Nothing is uploaded anywhere — the app makes no network calls.
- Use **Export backup** regularly, and **Import backup** to restore or move your data to
  another browser/device.

---

## Development & tests

The app ships dependency-free, but the test suite uses Node's built-in test runner and
[fast-check](https://github.com/dubzzz/fast-check) for property-based testing.

```bash
# install dev dependencies (fast-check)
cd tests && npm install && cd ..

# run the full suite from the project root (Node >= 18)
node --test tests/
```

The suite covers the pure logic in `core.js` with property-based tests plus targeted
example/unit tests. The `tests/` folder is never shipped with the app.

---

## Tech notes

- Vanilla HTML / CSS / JavaScript — no framework, no bundler, no transpiler.
- Charts are hand-drawn SVG (no charting library).
- Markdown rendering is a small, XSS-safe, hand-rolled renderer.
