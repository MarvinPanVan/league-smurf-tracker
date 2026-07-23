# Smurf Tracker

A single-file, local-only tracker for League of Legends smurf accounts: rank, W/L, login, notes, skins, tags, status. No backend, no account, no build step — open the HTML file (or host it) and it just works.

## Features

- **Rank tracking**: current tier/division/LP, W/L, level, sparkline history, peak rank, climbing streak badge, tier-up celebration (toast, browser notification, optional Discord webhook).
- **Login vault**: username/password/email per account, hidden by default, with a strength meter and safe password generator (always mixes upper/lower/digit/symbol) when adding one. Optional AES-256 master-password encryption with auto-lock after idle time.
- **Organize**: favorites, tags, search, region/status filters, sort by rank/name/last updated, archive accounts you're not using without deleting them, bulk actions (multi-select with shift-click range, set status/tag/delete for several at once).
- **Automatic rank checks**: pulls from op.gg for free, no API key needed. Falls back to pasting a profile page or entering the rank by hand if auto-fetch is ever blocked.
- **Backup**: Export/Import as JSON or CSV, merge or replace, plus a bulk-paste importer for adding a list of `Name#TAG` accounts at once.
- **Personalize**: pick your own accent color instead of the default gold.

## Your data

Everything lives in this browser's `localStorage`, on your device only — nothing is uploaded anywhere. **Clearing browser data wipes it**, so use **Export** for backups. Login passwords are stored in plain text in `localStorage` (labeled as such in the UI) — fine for a personal single-user tool on your own machine, but don't put this on a shared/public computer without being aware of that.

## Getting started

Just open `index.html` in a browser. Or host it (e.g. GitHub Pages — it's already named `index.html` so it'll just work at the repo root) and bookmark it — your data still only lives in *your* browser, hosting just saves you from double-clicking a local file.

Empty vault? Hit **Load demo data** to preview the layout with example accounts — it's a preview only, nothing is saved, and there's a one-click **Exit preview** banner the whole time. If you ever end up with real example/test accounts saved by mistake, **⋯ → Delete all accounts** clears the vault in one shot.

## Optional: your own rank-check backend

By default rank checks go through free public CORS proxies scraping op.gg — reliable most of the time, but not guaranteed. For something you control:

1. Deploy [`cloudflare-worker.js`](cloudflare-worker.js) as a Cloudflare Worker (free tier, no credit card needed):
   - [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Create Worker** → give it a name → **Deploy**.
   - **Edit code** → paste in the full contents of `cloudflare-worker.js` → **Deploy**.
   - Copy the resulting `https://<name>.<you>.workers.dev` URL.
2. In the app: **Settings** → paste the URL into **Backend URL** → **Save settings**.

The app tries your backend URL first, then an optional Anthropic API key (power-user option), then the free proxy chain, then falls back to manual paste/entry.

## Development

There's a small test suite (parser edge cases, rank sorting, XSS escaping, vault encryption round-trip, boot/demo-data rendering) in [`tests/`](tests/) using jsdom + Node's built-in test runner. It boots the actual `index.html` in a simulated browser — no logic is duplicated into the tests.

```bash
cd tests
npm install
npm test
```

## Credits

Made by **MarvinPanVan** · Discord: `marvinpanvan`. MIT-licensed, use it however you like.

## Not affiliated with Riot Games.
