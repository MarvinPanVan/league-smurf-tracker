# Security

Smurf Tracker keeps account logins, so this page says plainly what is protected,
what is not, and what ever leaves your browser.

## Where your data lives

Everything is stored in your browser's `localStorage`, on the device you are using.
There is no Smurf Tracker server and no account.

| You have set…              | What is on disk                                                        |
|----------------------------|------------------------------------------------------------------------|
| **No master password**     | Everything, logins and passwords included, as **plain text**. Anyone or anything that can read this browser's storage on this device can read them. |
| **A master password**      | One encrypted blob. **AES-256-GCM**, with the key derived from your password by **PBKDF2-SHA256 at 600 000 rounds** and a random salt. A fresh random IV for every save. |

With a master password set:

- **There is no recovery.** Lose the password and the vault cannot be opened, by you
  or anyone else.
- The derived key stays in memory only while the vault is unlocked, and is created
  non-extractable, so page scripts cannot read it back out. **Auto-lock** (Settings →
  Security) forgets it after the idle time you choose. **Lock now** forgets it at once.
- A vault saved by an older version (150 000 rounds) is rewritten at 600 000 the
  first time you unlock it.

**Copied passwords** are cleared from the clipboard after 30 seconds, and when the
vault locks.

**Storage persistence.** Browsers may delete `localStorage`: when space runs low, or
in Safari after 7 days without a visit. The app asks the browser to keep the vault
(Settings → Security → Storage shows whether it agreed). Keep a backup either way.

## What leaves your browser

| When                                   | What is sent                                | Where to |
|----------------------------------------|---------------------------------------------|----------|
| A rank check (Refresh / Check all)     | The Riot ID and region, never logins        | Your own worker if you set a Backend URL, which asks Riot's API (with your key) or op.gg; otherwise a public CORS proxy (corsproxy.io, allorigins) fetching the op.gg profile |
| Opening Details, with a Riot key on your worker | The account's Riot id (puuid) and region | Your worker, which asks Riot for the last five ranked games |
| A rank check with an Anthropic API key set | The Riot ID and region                  | api.anthropic.com |
| Tier-up alerts, if you set a Discord webhook | The account label and the tiers        | Your Discord webhook |
| **Device sync**, if you set it up      | The **encrypted** vault only (ciphertext)   | Your own Cloudflare worker's KV |
| **Discord decay alerts**, if you turn them on | Your Diamond+ accounts' Riot IDs, labels and decay estimates, and your Discord webhook URL, in plain text | Your own Cloudflare worker's KV; the worker posts to your webhook |
| Loading the page                       | Ordinary requests for fonts, rank icons and, unless you turn it off, champion art (the request names the champion) | Google Fonts, op.gg's image CDN, Riot's Data Dragon |
| Opening **Card art…**                  | Requests for the champion list, one champion's skin list and their pictures. Nothing about you or the account | Riot's Data Dragon |

Logins, passwords and emails are never sent anywhere, except inside the encrypted
blob when you use device sync.

**Shared snapshots.** *Share a snapshot* puts a read-only page of your ranks into a
link. Nothing is uploaded: the data is in the part of the link after `#`, which
browsers do not send to any server, not even the one hosting the page. It contains
only what the share window lists: labels (Riot IDs only if you tick the box), ranks,
win/loss, level, peak, and optionally LP history, card art, honor and skins. It never
contains logins, passwords, emails, notes or your other note fields. Anyone who has
the link can read it, and a link cannot be taken back, so share it the way you would
share a screenshot.

Opening a snapshot link shows only that page. It never reads or writes the vault or
settings stored in that browser, and the page treats everything in the link as
untrusted input: each value is checked before it is shown.

**Exports.** *Export backup (JSON, plaintext)* writes every password into the file
in plain text, and the app asks before it does. *Export encrypted backup* needs your
master password to open. Treat a plaintext export like the passwords themselves.

## What this does not protect against

- **Malware, keyloggers or a malicious browser extension** on your device. They can
  read what you type and what the page shows.
- **Someone at your unlocked computer.** Use auto-lock.
- **No master password.** As above: plain text on disk.
- **The hosted page changing.** The [live version](https://marvinpanvan.github.io/league-smurf-tracker/)
  is served from this repository's `main` branch. If you would rather trust a copy
  you control, run your own (open `index.html` from a download, or host a private
  copy for yourself, as the [licence](LICENSE) allows).
- **Public CORS proxies.** Without your own worker, rank checks go through third-party
  proxies, which see which Riot IDs you look up. Deploy the worker to avoid that.

## Reporting a vulnerability

Please do not post details of a security problem in a public issue. Message
**MarvinPanVan** on Discord (`marvinpanvan`), or open an issue that says only that
you have found something and how to reach you.
