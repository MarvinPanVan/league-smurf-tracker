# Prompt: full inspection and improvement pass

Paste everything below the line into a new Claude Code cloud session that has
this repository checked out.

---

You're doing a full inspection and improvement pass on **league-smurf-tracker**.
Work on your own from start to finish: inspect it, look at the running app
yourself, fix what's wrong, check your own work, then open a draft PR for me to
review. Don't stop to ask me things unless a change would break existing users'
data or needs a product decision only I can make. In that case, write it down as
a proposal and carry on with everything else.

## What this project is

- A local-only tracker for League of Legends smurf accounts. Read `README.md` first.
- `index.html` (~7,900 lines) is the **whole app**: CSS, markup and a single
  `<script>`. There's no build step and no framework, and it has to stay that way.
  It is served live from `main` by GitHub Pages, so anything merged reaches users.
- `cloudflare-worker.js` is the optional backend: op.gg scraping plus an encrypted
  vault sync stored in KV. `sw.js` is the offline cache.
- `tests/` uses Node's test runner with jsdom. It boots the real `index.html`, so
  nothing is mocked. Run it with `cd tests && npm install && npm test`. Expect
  335 passing in about 50 seconds. `fetch` is stubbed to reject in tests.
- Read the last ~30 commit messages (`git log -30`) before writing any. They
  explain *why* things are the way they are, they record decisions you shouldn't
  undo, and they set the commit style you should match.

## Phase 1: baseline

1. Run the test suite and record the pass count.
2. Run `file index.html` and `git ls-files --eol index.html`. The file must stay
   UTF-8 text with LF line endings and **no NUL bytes**. That has gone wrong
   before, and it turns every diff into a full-file rewrite.

## Phase 2: look at the app yourself

This is the important part. Don't only read the code; run the app and look at it.

1. Serve the repo root: `python3 -m http.server 8080` (in the background).
2. Install Playwright in your scratchpad, **not** in the repo. Launch Chromium with
   `executablePath: '/opt/pw-browsers/chromium'` and don't run
   `playwright install`.
3. Get data on screen. Either click `#bDemo` ("Preview with example data") on the
   empty vault, or seed `localStorage["smurf-tracker"]` before load, the way
   `bootApp(seed)` in `tests/app.test.mjs` does. Seeding is the better option:
   it lets you build edge cases such as 0 accounts, 1 account, 60 accounts, very
   long names, unranked accounts, Master+ accounts with no division, accounts
   with no history, and a locked (encrypted) vault.
4. Take screenshots at **1440px, 1024px and 390px** (phone) widths of:
   - all three layouts (cards, list, tiles)
   - the dashboard tiles and the ladder ribbon
   - the LP chart, at rest and with a point hovered, in daily, weekly and monthly views
   - the Add, Rank and Settings windows, the ⋯ menu, the tag drawer and the bulk bar
   - the empty state, the "filters hid everything" state and the preview banner
5. **Open and actually look at every screenshot** with the Read tool. Check for
   overlap, clipping, ellipsis eating the important part, misalignment,
   horizontal scroll on phone, unreadable contrast, and controls that are too
   small to tap.
6. Collect browser console errors and warnings for each scenario. Tab through the
   page with the keyboard and check that focus is visible, the order makes sense,
   Escape closes windows and focus isn't trapped.
7. Don't hit op.gg or any live rank source. Block or stub external requests in
   Playwright. This tool must stay within Riot's and op.gg's terms, and you won't
   have network access to them anyway.

## Phase 3: code audit

Go through `index.html`, `cloudflare-worker.js` and `sw.js` looking for:

- **Correctness:** logic bugs, edge cases, rank, LP and ladder maths, sorting and
  filtering, date and timezone handling, and state that drifts between views.
- **Security:** XSS (every place user or op.gg text reaches the DOM), the AES vault
  encryption and lock/auto-lock, the master password, sync token handling, and
  the worker's CORS, auth, input validation and SSRF surface.
- **Data safety:** loading old saved data, import/export (JSON v2, encrypted,
  CSV, merge vs replace), and anything that could silently lose a user's vault.
- **Performance:** re-render/morph cost on big vaults (60+ accounts), chart
  drawing, and timers that keep running in the background.
- **Accessibility:** labels, roles, keyboard access, contrast and reduced motion.
- **Dead code and duplication** you can remove without changing behaviour.

Write every finding (from Phases 2 and 3) to a ranked list in your scratchpad:
severity, file:line, the concrete failure, and the planned fix. Verify each one
by reproducing it, in a test or in Playwright, before you treat it as real.
Throw out anything you can't reproduce.

## Phase 4: fix, one concern per commit

Work down the list from most to least severe. For each item:

1. Write a test that fails because of the bug. Use the existing helpers in
   `tests/app.test.mjs` (`bootApp`, `addRealAccount`, and so on). For layout-only
   problems that jsdom can't measure, assert on the declaration, the way recent
   tests do, and confirm the fix with a Playwright screenshot.
2. Fix it with the smallest change that does the job.
3. **Mutation-check the test:** undo the fix temporarily, confirm the test fails,
   then restore the fix.
4. Run the full suite until it's green, then re-run `file index.html`.
5. For anything visual, take before and after screenshots and look at both.
6. Commit with a message in the repo's style: a plain-English title sentence,
   then the why, what you measured, and the test count.

Rules:

- Keep the app a single file with no build step and no new runtime dependencies.
- Never change the saved data format in a way that breaks existing data (the
  `localStorage` key `smurf-tracker` and export `version: 2`). If it has to
  change, add a migration and a test that loads old-format data.
- Don't undo a decision that a past commit message explains, unless you can show
  it is still causing a bug.
- Don't touch `LICENSE` or the terms text.
- Big redesigns, new features and anything risky go in the proposals list. Don't
  build them.
- Keep the scope reasonable: a set of solid, verified fixes beats a sweeping
  rewrite.

## Phase 5: check your own work, then look again

1. Run `/code-review` at high effort on your branch's full diff against `main`,
   if that command is available. Otherwise review the diff yourself, as
   adversarially as you can. Fix what's real.
2. Run `/simplify` on the diff if it's available.
3. **Do a second look:** run the full Phase 2 screenshot set again on the final
   code and compare it with the first set. Fix any regressions you introduced.
4. Once, at the end, if anything user-visible changed:
   - bump `APP_VERSION`
   - add an `APP_CHANGELOG` entry in the same style as the existing ones
   - bump the `CACHE` version in `sw.js` so hosted installs pick it up
5. Optional: add `.github/workflows/test.yml`, a GitHub Actions workflow that runs
   `cd tests && npm ci && npm test` on push and pull requests. The repo has no CI
   at the moment.

## Phase 6: hand-off

Push your branch and open a **draft** PR against `main`. Don't merge it. The PR
description should cover:

- what you inspected, with the baseline and final test counts
- every fix, one line each, with its severity
- findings you couldn't reproduce and dropped, with a short reason
- **proposals** for larger changes you didn't make, each with the reason and a
  rough sketch
- anything I should check by hand in a real browser

Finish with a short summary to me in chat that includes the PR link.
