# Smurf Tracker

A single-file, local-only tracker for League of Legends smurf accounts: rank, W/L, login, notes, skins, tags, status. No backend, no account, no build step — open the HTML file (or host it) and it just works.

**[Try it live](https://marvinpanvan.github.io/league-smurf-tracker/)** — runs entirely in your browser, nothing you enter there ever reaches a server.

## Features

- **Rank tracking**: current tier/division/LP, W/L, summoner level, peak rank, climbing streak badge, tier-up celebration (toast, browser notification, optional Discord webhook).
- **A real LP chart, not a sparkline**: the ladder is drawn as a coloured band per tier, so a promotion reads as leaving the green rather than as a line that went up a bit. X is real time with a date axis — a week's break is a gap, not another evenly spaced dot — and the Grandmaster/Challenger floors are drawn in where the view reaches them. Switch it between daily, weekly and monthly points.
- **Details per account**: past seasons (solo and flex), flex rank and the champions played this season, each folded behind a heading so the card stays readable. Notes edit in place on the card.
- **Two layouts**: cards for browsing, or a one-line-per-account list for working through a big vault — click a row to unfold the same chart and details under it.
- **Login vault**: username/password/email per account, hidden by default, with a strength meter and safe password generator (always mixes upper/lower/digit/symbol) when adding one. Optional AES-256 master-password encryption with auto-lock after idle time.
- **Organize**: favorites, tags, search, filters for region/status/tier/"never checked"/"needs refresh", sort by rank, name, level, LP change or last updated, archive accounts you're not using without deleting them, bulk actions (multi-select with shift-click range, set status/tag/delete for several at once).
- **Automatic rank checks**: pulls from op.gg for free, no API key needed. Refresh everything at once with progress, a Stop button and a list of anything that failed, or let it auto-check stale accounts on open at an interval you set. If auto-fetch is ever blocked, enter the rank by hand and the history, chart and stats all work the same.
- **Combined stats**: total W/L, best account, rank spread and best champions across a pool you control — set a tier floor or exclude individual accounts, so one silver account you never play doesn't drag the summary down.
- **Backup**: Export/Import as JSON or CSV, merge or replace, plus a bulk-paste importer for adding a list of `Name#TAG` accounts at once.
- **Personalize**: pick your own primary and secondary accent colors instead of the default gold and teal.

## Your data

Everything lives in this browser's `localStorage`, on your device only — nothing is uploaded anywhere. **Clearing browser data wipes it**, so use **Export** for backups. Login passwords are stored in plain text in `localStorage` (labeled as such in the UI) — fine for a personal single-user tool on your own machine, but don't put this on a shared/public computer without being aware of that.

## Getting started

Just open `index.html` in a browser, or use the [live version](https://marvinpanvan.github.io/league-smurf-tracker/) and bookmark it — your data still only lives in *your* browser either way, hosting just saves you from double-clicking a local file. Want your own copy instead of sharing the one above? Fork the repo, GitHub Pages picks it up automatically since it's already named `index.html` at the repo root.

Empty vault? Hit **👁 Preview with example data** to see the layout with example accounts — it's a preview only, nothing is saved, and there's a one-click **Exit preview** banner the whole time. If you ever end up with real example/test accounts saved by mistake, **⋯ → Delete all accounts** clears the vault in one shot.

## Optional: your own rank-check backend

By default rank checks go through free public CORS proxies scraping op.gg — reliable most of the time, but not guaranteed. For something you control:

1. Deploy [`cloudflare-worker.js`](cloudflare-worker.js) as a Cloudflare Worker (free tier, no credit card needed):
   - [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Create Worker** → give it a name → **Deploy**.
   - **Edit code** → paste in the full contents of `cloudflare-worker.js` → **Deploy**.
   - Copy the resulting `https://<name>.<you>.workers.dev` URL.
2. In the app: **Settings** → paste the URL into **Backend URL** → **Save settings**.

The app tries your backend URL first, then an optional Anthropic API key (power-user option), then the free proxy chain, and falls back to entering the rank by hand.

A worker also gets you the things the free proxies can't reach reliably: the per-champion season table (it lives on op.gg's `/champions` sub-page, which the worker fetches in parallel) and the timestamp op.gg records for when your current LP was actually reached, so a check made a week later dates the point correctly instead of stamping it "now".

## Development

The test suite in [`tests/`](tests/) uses jsdom + Node's built-in test runner and boots the actual `index.html` in a simulated browser — no logic is duplicated into the tests, so a test failing means the shipped file is wrong. It covers the op.gg parsers against real page markup, rank sorting and the ladder maths, XSS escaping, the vault encryption round-trip, DOM patching identity, the filter/stats interplay, and a regression test for every bug that has been found and fixed.

```bash
cd tests
npm install
npm test
```

## Terms of use

This project is **source-available, not open source** — see [LICENSE](LICENSE) for the full text. In short:

**You may** use it for free for your own personal use, share it by linking to this repo or the hosted version, and keep a private copy or fork for yourself and your friends.

**You may not** use it for anything malicious or unlawful (including accessing accounts you don't own, or breaking Riot's terms of service), publish a modified/rebranded/rewritten version of it, sell it or bundle it into anything paid, or present it as your own work.

Found a bug or want a feature? Open an issue — contributions and suggestions are welcome.

## Credits

Made by **MarvinPanVan** · Discord: `marvinpanvan`

## Not affiliated with Riot Games.
