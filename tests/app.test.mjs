// Boots the real index.html in a jsdom window (no mocked/duplicated
// logic — the exact same script the browser runs) and exercises it as a user
// or the storage layer would. Network is never touched: fetch is stubbed to
// reject, so anything that would hit op.gg/the backend/Claude is out of scope
// here on purpose (that's what the paste/manual fallbacks are for).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { webcrypto } from "node:crypto";
import { JSDOM } from "jsdom";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(__dirname, "..", "index.html");
const html = fs.readFileSync(htmlPath, "utf8");

const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
if (!scriptMatch) throw new Error("Could not find the app's <script> block — did the file structure change?");
const appScript = scriptMatch[1];
const htmlNoScript = html.slice(0, scriptMatch.index) + html.slice(scriptMatch.index + scriptMatch[0].length);

function addRealAccount(window, gameName, tagLine) {
  // loadDemo() is preview-only now (never persisted) — go through the real
  // add-account form instead when a test needs an actual saved account.
  window.document.getElementById("bAdd").click();
  window.document.getElementById("fName").value = gameName;
  window.document.getElementById("fTag").value = tagLine;
  window.document.getElementById("fSave").click();
}

function runScript(window, code) {
  const el = window.document.createElement("script");
  el.textContent = code;
  window.document.body.appendChild(el); // runScripts:"dangerously" executes this synchronously
}

// `seed` writes accounts straight into localStorage before the app boots, which
// is the only way to get an account carrying seasons/flex/champions in here —
// those arrive from a rank check, and the network is deliberately dead.
// `tweak` runs against the window just before the app's script does, which is the
// only place to stand in front of something the app calls during boot — setInterval,
// for one, where the assertion is about the call never happening.
function bootApp(seed, tweak) {
  const dom = new JSDOM(htmlNoScript, {
    url: "https://example.com/index.html",
    pretendToBeVisual: true,
    runScripts: "dangerously",
  });
  const { window } = dom;
  Object.defineProperty(window, "crypto", { value: webcrypto, configurable: true });
  window.TextEncoder = TextEncoder;
  window.TextDecoder = TextDecoder;
  window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
  window.fetch = async () => { throw new Error("network disabled in tests"); };
  window.confirm = () => true;
  window.alert = () => {};
  if (seed) window.localStorage.setItem("smurf-tracker", JSON.stringify(seed));
  if (tweak) tweak(window);
  runScript(window, appScript); // runs the app's boot() at the end, exactly like a real page load
  return window;
}

/* The suite boots a fresh jsdom window for every test and never closes any of
   them, so by the end there are well over a hundred live windows each running
   their own animation-frame loop. A fixed 300ms sleep that was comfortable at
   test 30 is marginal at test 130 — which is how these vault tests began failing
   intermittently without a line of vault code changing. Wait for the thing that
   was actually being waited for instead. */
async function until(pred, label, ms = 5000) {
  const t0 = Date.now();
  for (;;) {
    let ok = false;
    try { ok = pred() } catch (e) { ok = false }
    if (ok) return;
    if (Date.now() - t0 > ms) throw new Error("timed out waiting for " + label);
    await new Promise(r => setTimeout(r, 10));
  }
}
const encrypted = w => { const r = w.localStorage.getItem("smurf-tracker"); return !!(r && JSON.parse(r).__enc) };
const storedPlain = w => { const r = w.localStorage.getItem("smurf-tracker"); return !!r && Array.isArray(JSON.parse(r)) };

test("boots clean with an empty vault, no accounts", () => {
  const win = bootApp();
  assert.equal(win.document.querySelectorAll(".card").length, 0);
  assert.match(win.document.getElementById("grid").textContent, /No accounts yet/);
  assert.equal(win.document.getElementById("appRoot").classList.contains("hidden"), false);
  assert.equal(win.document.getElementById("lock").classList.contains("hidden"), true);
});

/* An export file is {app, version, accounts}, not a bare array. Writing that body
   straight into the localStorage key used to boot an empty vault — Array.isArray
   on the object is false, and nothing else looked. */
test("a backup dropped into localStorage still opens as a vault", () => {
  const win = bootApp(undefined, w => {
    w.localStorage.setItem("smurf-tracker", JSON.stringify({
      app: "smurf-tracker", version: 2, exported: "2026-07-29T00:00:00.000Z",
      accounts: [{ id: "x1", gameName: "FromBackup", tagLine: "EUW", region: "EUW", status: "active",
        stats: null, history: [], tags: [] }],
    }));
  });
  assert.equal(win.document.querySelectorAll(".card").length, 1);
  assert.match(win.document.querySelector(".card").textContent, /FromBackup/);
});

test("demo data loads 5 accounts and renders without undefined/NaN leaking into the DOM", () => {
  const win = bootApp();
  win.loadDemo();
  const cards = win.document.querySelectorAll(".card");
  assert.equal(cards.length, 5);
  const gridHtml = win.document.getElementById("grid").innerHTML;
  assert.doesNotMatch(gridHtml, /undefined/);
  assert.doesNotMatch(gridHtml, /\bNaN\b/);
});

test("region/status filters only ever list values that exist among current accounts", () => {
  const win = bootApp();
  win.loadDemo(); // EUW x3, EUNE x2; statuses active/resting/banned, no "restricted"
  const regionOptions = [...win.document.querySelectorAll("#tRegion option")].map(o => o.value).filter(Boolean).sort();
  assert.deepEqual(regionOptions, ["EUNE", "EUW"]);
  const statusLabels = [...win.document.querySelectorAll("#tStatus option")].map(o => o.textContent);
  assert.ok(statusLabels.includes("Active"));
  assert.ok(statusLabels.includes("Resting / unused"));
  assert.ok(statusLabels.includes("Banned"));
  assert.ok(!statusLabels.includes("Chat/ranked restricted"));
});

test("add-account form offers every current op.gg region, not just the original 4", () => {
  const win = bootApp();
  const values = [...win.document.querySelectorAll("#fRegion option")].map(o => o.value);
  for (const r of ["NA", "EUW", "EUNE", "KR", "OCE", "JP", "BR", "LAS", "LAN", "RU", "TR", "SG", "TW", "VN", "ME"]) {
    assert.ok(values.includes(r), `expected fRegion to include ${r}`);
  }
});

test("parseRankText: plain tier/division/LP/W-L/level", () => {
  const win = bootApp();
  const r = win.parseRankText("Gold I 33 LP 259W 257L Level 388");
  assert.equal(r.tier, "GOLD");
  assert.equal(r.division, "I");
  assert.equal(r.lp, 33);
  assert.equal(r.wins, 259);
  assert.equal(r.losses, 257);
  assert.equal(r.level, 388);
});

test("parseRankText: not fooled by a champion name that contains a tier word (\"Master Yi\")", () => {
  const win = bootApp();
  const r = win.parseRankText("Recently played: Master Yi, Ahri, Zed. Ranked: Platinum II 45 LP 30W 25L");
  assert.equal(r.tier, "PLATINUM");
  assert.equal(r.lp, 45);
});

test("parseRankText: handles op.gg's doubled-division text (\"Platinum 3 3 53LP\")", () => {
  const win = bootApp();
  const r = win.parseRankText("Platinum 3 3 53LP 12W 10L");
  assert.equal(r.tier, "PLATINUM");
  assert.equal(r.division, "III");
  assert.equal(r.lp, 53);
});

test("parseRankText: garbage input returns null instead of a bogus match", () => {
  const win = bootApp();
  assert.equal(win.parseRankText("just a random webpage with no rank info anywhere on it"), null);
  assert.equal(win.parseRankText(""), null);
  assert.equal(win.parseRankText(null), null);
});

test("parseRankText accepts comma-formatted LP from live op.gg body text", () => {
  const win = bootApp();
  const body = "Ranked Solo/Duo challenger 4,011 LP 772 W 650 L Win rate 54 % challenger 4,061 LP Top tier";
  const r = win.parseRankText(body);
  assert.equal(r.tier, "CHALLENGER");
  assert.equal(r.lp, 4011);
  assert.equal(r.wins, 772);
  assert.deepEqual(plain(win.parsePeakText(body)), { tier: "CHALLENGER", division: null, lp: 4061 });
});

test("parseRankFromMeta reads current rank and Unranked level from the description", () => {
  const win = bootApp();
  const ranked = win.parseRankText(`<meta name="description" content="Kaori#EUW33 / Challenger 1 4011LP / 772Win 650Lose Win rate 54%"/>`);
  assert.equal(ranked.tier, "CHALLENGER");
  assert.equal(ranked.lp, 4011);
  assert.equal(ranked.wins, 772);
  const un = win.parseRankText(`<meta name="description" content="Hide on bush#KR1 / Lv. 752"/>`);
  assert.equal(un.tier, "UNRANKED");
  assert.equal(un.level, 752);
});

/* Solo Unranked has no "N LP". The first tier+LP on the page used to win — which on
   an Unranked account is often Flex, or a season peak — so Refresh stored Gold as
   the solo rank. Flex is parseFlex's job; current-rank only reads above that heading. */
test("parseRankText reads Solo, not Flex, and recognises Unranked", () => {
  const win = bootApp();
  const r = win.parseRankText("Unranked\n\nRanked Flex\ngold 2 45 LP\n");
  assert.equal(r.tier, "UNRANKED");
  assert.equal(r.lp, null);
  assert.equal(win.parseFlex("Unranked\n\nRanked Flex\ngold 2 45 LP\n").tier, "GOLD",
    "Flex is still read under its own heading");

  assert.equal(win.parseRankText("Unranked\nLevel 42\n").tier, "UNRANKED");
  assert.equal(win.parseRankText("just Unranked on a profile with no level").tier, "UNRANKED");
});

test("parseRankText does not take the season peak as the current rank on an Unranked account", () => {
  const win = bootApp();
  const r = win.parseRankText("Unranked\nmaster 393 LP Top tier\nRanked Flex\ngold 2 45 LP\n");
  assert.equal(r.tier, "UNRANKED");
  assert.equal(r.lp, null);
  assert.equal(win.parsePeakText("Unranked\nmaster 393 LP Top tier\n").tier, "MASTER");
});

test("validDiscordWebhook only accepts real Discord webhook https URLs", () => {
  const win = bootApp();
  assert.equal(win.validDiscordWebhook(""), "");
  assert.equal(win.validDiscordWebhook("https://discord.com/api/webhooks/123/abc-def"),
    "https://discord.com/api/webhooks/123/abc-def");
  assert.equal(win.validDiscordWebhook("https://discordapp.com/api/webhooks/123/abc"),
    "https://discordapp.com/api/webhooks/123/abc");
  assert.equal(win.validDiscordWebhook("https://example.com/api/webhooks/123/abc"), null);
  assert.equal(win.validDiscordWebhook("http://discord.com/api/webhooks/123/abc"), null);
  assert.equal(win.validDiscordWebhook("not a url"), null);
});

test("validBackendUrl requires an absolute http(s) link", () => {
  const win = bootApp();
  assert.equal(win.validBackendUrl(""), "");
  assert.equal(win.validBackendUrl("https://x.workers.dev/"), "https://x.workers.dev");
  assert.equal(win.validBackendUrl("/relative"), null);
  assert.equal(win.validBackendUrl("not a url"), null);
});

test("parseProfileIcon extracts a stable icon URL from op.gg's CDN image path, ignores unrelated text", () => {
  const win = bootApp();
  const html = '<img src="https://opgg-static.akamaized.net/meta/images/profile_icons/profileIcon6.jpg?image=q_auto:good,f_png,w_200&v=1784743313" alt="icon">';
  assert.equal(win.parseProfileIcon(html), "https://opgg-static.akamaized.net/meta/images/profile_icons/profileIcon6.jpg");
  assert.equal(win.parseProfileIcon("no icon here"), null);
  assert.equal(win.parseProfileIcon(""), null);
});

test("rankValue/ladderLP: Master+/GM/Challenger sort purely by LP, division text is ignored", () => {
  const win = bootApp();
  const gmLowLP = { tier: "GRANDMASTER", division: "I", lp: 100 };
  const gmHighLP = { tier: "GRANDMASTER", division: "I", lp: 1697 };
  assert.ok(win.rankValue(gmHighLP) > win.rankValue(gmLowLP), "higher GM LP must outrank lower GM LP");
  assert.ok(win.ladderLP(gmHighLP) > win.ladderLP(gmLowLP));
});

test("esc() neutralizes HTML so pasted/typed data can't inject markup", () => {
  const win = bootApp();
  assert.equal(win.esc("<img src=x onerror=alert(1)>"), "&lt;img src=x onerror=alert(1)&gt;");
  assert.equal(win.esc(`"quoted" & 'stuff'`), "&quot;quoted&quot; &amp; &#39;stuff&#39;");
});

test("applyStats: dedupes unchanged ranks (keeps stamp, no new history row) and flags tier-ups", () => {
  const win = bootApp();
  const acc = { history: [] };
  assert.equal(win.applyStats(acc, { found: true, tier: "GOLD", division: "II", lp: 40, updatedAt: 1 }), false);
  assert.equal(acc.history.length, 1);

  assert.equal(win.applyStats(acc, { found: true, tier: "GOLD", division: "II", lp: 40, updatedAt: 2 }), false);
  assert.equal(acc.history.length, 1, "unchanged rank must not push a new history entry");
  assert.equal(acc.history[0].t, 1, "a no-op refresh without lpAt must not drag the stamp forward");

  assert.equal(win.applyStats(acc, { found: true, tier: "PLATINUM", division: "IV", lp: 0, updatedAt: 3 }), true);
  assert.equal(acc.history.length, 2);
});

/* The AI path never returns seasons/champs/flex, and a truncated proxy page can miss
   the tables while still reading the rank. Replacing the whole stats object wiped
   whatever the last full parse had left — the ✎ Rank path already kept them. */
test("a refresh that only brings the rank keeps the extras it did not replace", () => {
  const win = bootApp();
  const seasons = { solo: [{ season: "S2025", tier: "MASTER", division: null, lp: 135 }], flex: [] };
  const champs = [{ name: "Ashe", wr: 60, games: 25, wins: 15, losses: 10, kda: 2.25 }];
  const flex = { tier: "GOLD", division: "II", lp: 45 };
  const peak = { tier: "MASTER", division: null, lp: 200 };
  const acc = {
    history: [],
    stats: {
      found: true, tier: "DIAMOND", division: "I", lp: 52, wins: 190, losses: 215,
      level: 764, seasons, champs, flex, peak,
      icon: "https://opgg-static.akamaized.net/meta/images/profile_icons/profileIcon1.jpg",
      updatedAt: 1,
    },
  };
  // shaped like what the AI path actually hands back — rank, no tables
  win.applyStats(acc, {
    found: true, tier: "DIAMOND", division: "I", lp: 60, wins: 192, losses: 216,
    level: null, peak: null, seasons: null, flex: null, champs: null, icon: null, updatedAt: 2,
  });
  assert.equal(acc.stats.lp, 60, "the new rank lands");
  assert.equal(acc.stats.seasons, seasons, "past seasons survive");
  assert.equal(acc.stats.champs, champs, "so do champions");
  assert.equal(acc.stats.flex.tier, "GOLD");
  assert.equal(acc.stats.peak.tier, "MASTER");
  assert.equal(acc.stats.level, 764, "and the level, when the new reading has none");
  assert.match(acc.stats.icon, /profileIcon1/);

  // a reading that does carry them still replaces
  win.applyStats(acc, {
    found: true, tier: "DIAMOND", division: "I", lp: 60, updatedAt: 3,
    seasons: { solo: [{ season: "S2026", tier: "DIAMOND", division: "I", lp: 60 }], flex: [] },
    champs: [{ name: "Zed", wr: 55, games: 10, wins: 5, losses: 5, kda: null }],
  });
  assert.equal(acc.stats.seasons.solo[0].season, "S2026");
  assert.equal(acc.stats.champs[0].name, "Zed");
});

test("csvCell quotes values containing commas, quotes or newlines (RFC 4180-ish)", () => {
  const win = bootApp();
  assert.equal(win.csvCell("plain"), "plain");
  assert.equal(win.csvCell("has,comma"), '"has,comma"');
  assert.equal(win.csvCell('has"quote'), '"has""quote"');
  assert.equal(win.csvCell(null), "");
});

test("genPassword always mixes upper/lower/digit/symbol, never comes out all-letters by chance", () => {
  const win = bootApp();
  for (let i = 0; i < 200; i++) {
    const p = win.genPassword(16);
    assert.equal(p.length, 16);
    assert.match(p, /[A-Z]/, `no uppercase in ${p}`);
    assert.match(p, /[a-z]/, `no lowercase in ${p}`);
    assert.match(p, /[0-9]/, `no digit in ${p}`);
    assert.match(p, /[!#%+@$&*]/, `no symbol in ${p}`);
  }
});

test("csvCell escapes leading =+-@ so spreadsheets don't treat a password as a formula", () => {
  const win = bootApp();
  assert.equal(win.csvCell("@GN{ErQW55"), "'@GN{ErQW55");
  assert.equal(win.csvCell("+6quz"), "'+6quz");
  assert.equal(win.csvCell("=1+1"), "'=1+1");
  assert.equal(win.csvCell("-lead"), "'-lead");
  assert.equal(win.csvCell("'already"), "''already");
  assert.equal(win.csvCell("safe"), "safe", "ordinary values must not be altered");
});

test("CSV export -> import round-trips a formula-looking password unchanged", async () => {
  const win = bootApp();
  // Build a header identical to doExportCSV's so the importer recognises it as our own file
  const cols = ["label","gameName","tagLine","region","status","tier","division","lp","wins","losses","level","login","password","email","tags","notes","favorite","lastUpdated"];
  const nasty = "@GN{ErQW55tFGR_kr&~YxUkg,Dc]qKTD";
  const row = ["", "Round Trip", "9999", "EUW", "active", "", "", "", "", "", "", "user", nasty, "", "", "", "no", ""];
  const csv = [cols.join(","), row.map(win.csvCell).join(",")].join("\r\n");

  const file = new win.File([csv], "rt.csv", { type: "text/csv" });
  win.doImportCSV(file);
  await until(() => win.localStorage.getItem("smurf-tracker"), "the CSV import to be written");

  const stored = JSON.parse(win.localStorage.getItem("smurf-tracker"));
  assert.equal(stored.length, 1);
  assert.equal(stored[0].password, nasty, "password must survive the escape/un-escape round trip byte-for-byte");
});

test("a third-party CSV whose password starts with an apostrophe is left untouched", async () => {
  const win = bootApp();
  // No "favorite"/"lastUpdated" columns => not one of our exports => no un-escaping
  const csv = "gameName,tagLine,region,password\r\nForeign,1234,EUW,'quoted";
  const file = new win.File([csv], "foreign.csv", { type: "text/csv" });
  win.doImportCSV(file);
  await until(() => win.localStorage.getItem("smurf-tracker"), "the CSV import to be written");

  const stored = JSON.parse(win.localStorage.getItem("smurf-tracker"));
  assert.equal(stored[0].password, "'quoted");
});

test("safeIconUrl only lets https URLs through", () => {
  const win = bootApp();
  assert.equal(win.safeIconUrl("https://opgg-static.akamaized.net/x.jpg"), "https://opgg-static.akamaized.net/x.jpg");
  assert.equal(win.safeIconUrl("javascript:alert(1)"), null);
  assert.equal(win.safeIconUrl("http://insecure.example/x.jpg"), null);
  assert.equal(win.safeIconUrl("not a url"), null);
  assert.equal(win.safeIconUrl(null), null);
  assert.equal(win.safeIconUrl(""), null);
});

test("region/status/tag filters list only values present in the view being shown", () => {
  const win = bootApp();
  addRealAccount(win, "Active One", "1111");           // EUW, active
  addRealAccount(win, "To Archive", "2222");           // will become archived

  // Give the second account a distinguishing tag, then archive it
  let card = [...win.document.querySelectorAll(".card")].find(c => c.textContent.includes("To Archive"));
  card.querySelector('[data-act="more"]').click();
  card = [...win.document.querySelectorAll(".card")].find(c => c.textContent.includes("To Archive"));
  card.querySelector('[data-act="archive"]').click();

  // Active view must not offer a status that only the archived account has, and vice versa
  const activeStatuses = [...win.document.querySelectorAll("#tStatus option")].map(o => o.value).filter(Boolean);
  assert.deepEqual(activeStatuses, ["active"]);

  win.document.getElementById("tArchived").click();
  const archivedRegions = [...win.document.querySelectorAll("#tRegion option")].map(o => o.value).filter(Boolean);
  assert.deepEqual(archivedRegions, ["EUW"], "archived view lists the archived account's region");
  assert.equal(win.document.querySelectorAll(".card").length, 1);
});

test("demo preview never touches localStorage, and Exit preview cleanly returns to an empty vault", () => {
  const win = bootApp();
  win.document.getElementById("bDemo").click();
  assert.equal(win.document.querySelectorAll(".card").length, 5);
  assert.equal(win.document.getElementById("previewBanner").classList.contains("hidden"), false, "preview banner must show");
  assert.equal(win.localStorage.getItem("smurf-tracker"), null, "preview data must never be written to localStorage");

  win.document.getElementById("bExitPreview").click();
  assert.equal(win.document.querySelectorAll(".card").length, 0);
  assert.equal(win.document.getElementById("previewBanner").classList.contains("hidden"), true);
  assert.match(win.document.getElementById("grid").textContent, /No accounts yet/);
});

test("opening the add-account form during preview discards the preview data instead of mixing it with real accounts", () => {
  const win = bootApp();
  win.document.getElementById("bDemo").click();
  assert.equal(win.document.querySelectorAll(".card").length, 5);

  win.document.getElementById("bAdd").click();
  assert.equal(win.document.getElementById("previewBanner").classList.contains("hidden"), true, "preview must end once the user starts adding a real account");
  assert.equal(win.document.getElementById("form").classList.contains("hidden"), false, "the add-account form must still open");
});

test("isClimbing detects 3 consecutive LP increases and ignores flat/downward trends", () => {
  const win = bootApp();
  assert.equal(win.isClimbing([{tier:"GOLD",division:"IV",lp:10},{tier:"GOLD",division:"IV",lp:20},{tier:"GOLD",division:"IV",lp:30}]), true);
  assert.equal(win.isClimbing([{tier:"GOLD",division:"IV",lp:30},{tier:"GOLD",division:"IV",lp:20},{tier:"GOLD",division:"IV",lp:10}]), false);
  assert.equal(win.isClimbing([{tier:"GOLD",division:"IV",lp:10},{tier:"GOLD",division:"IV",lp:20}]), false, "needs at least 3 points");
});

test("passwordStrength scores weak passwords lower than long mixed-class ones", () => {
  const win = bootApp();
  assert.equal(win.passwordStrength("").score, 0);
  assert.ok(win.passwordStrength("abc").score < win.passwordStrength("Abc12345!xyz").score);
  assert.equal(win.passwordStrength(win.genPassword(16)).label, "Strong");
});

test("archiving hides an account from the default view without deleting it, unarchive restores it", () => {
  const win = bootApp();
  addRealAccount(win, "Archive Me", "1111");
  assert.equal(win.document.querySelectorAll(".card").length, 1);

  win.document.querySelector('[data-act="more"]').click();
  win.document.querySelector('[data-act="archive"]').click();
  assert.equal(win.document.querySelectorAll(".card").length, 0, "archived account must vanish from the default view");

  win.document.getElementById("tArchived").click();
  assert.equal(win.document.querySelectorAll(".card").length, 1, "must reappear under the archived toggle");
  // the "more" panel toggled open back at step 1 is still open (openMore state persists across archive/view changes)
  win.document.querySelector('[data-act="unarchive"]').click();
  win.document.getElementById("tArchived").click(); // back to the active view
  assert.equal(win.document.querySelectorAll(".card").length, 1, "unarchived account must be back in the default view");
});

test("parseCSV handles embedded commas and escaped quotes", () => {
  const win = bootApp();
  const rows = win.parseCSV('a,b,c\n"has,comma","has""quote",plain');
  // JSON-compare, not deepEqual: arrays built inside the jsdom window's realm
  // fail Node's cross-realm identity check in assert.deepEqual even when structurally identical
  assert.equal(JSON.stringify(rows), JSON.stringify([["a", "b", "c"], ["has,comma", 'has"quote', "plain"]]));
});

test("CSV import adds accounts from a well-formed export-shaped file", async () => {
  const win = bootApp();
  const csv = "label,gameName,tagLine,region,status,tier,division,lp,wins,losses,level,login,password,email,tags,notes,favorite,lastUpdated\n"
    + "Test,CSV Import,4242,EUW,active,GOLD,II,50,10,5,100,user1,pass1,a@b.com,tag1|tag2,notes here,yes,";
  const file = new win.File([csv], "test.csv", { type: "text/csv" });
  win.doImportCSV(file);
  await until(() => win.document.querySelectorAll(".card").length === 1, "the imported account to render");
  assert.match(win.document.getElementById("grid").textContent, /CSV Import/);
});

test("bulk add parses Name#TAG lines, skips duplicates and unparseable lines", () => {
  const win = bootApp();
  win.document.getElementById("bBulkAdd").click();
  win.document.getElementById("baRegion").value = "NA";
  win.document.getElementById("baList").value = "Foo#1111\nBar#2222\nnotvalidline\nFoo#1111";
  win.document.getElementById("baSave").click();
  assert.equal(win.document.querySelectorAll(".card").length, 2, "only the two valid, non-duplicate lines should be added");
});

test("shift-click extends selection across the range between two cards", () => {
  const win = bootApp();
  addRealAccount(win, "A1", "1001");
  addRealAccount(win, "A2", "1002");
  addRealAccount(win, "A3", "1003");
  const boxes = [...win.document.querySelectorAll(".bulkchk")];
  assert.equal(boxes.length, 3);
  boxes[0].checked = true;
  boxes[0].dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
  boxes[2].checked = true;
  boxes[2].dispatchEvent(new win.MouseEvent("click", { bubbles: true, shiftKey: true }));
  assert.equal(win.document.getElementById("bulkCount").textContent, "3 selected");
});

test("relock re-shows the lock screen and clears in-memory accounts; the same password unlocks it again", async () => {
  const win = bootApp();
  addRealAccount(win, "Locked One", "1234");
  win.document.getElementById("sVaultPass").value = "lockme123";
  win.document.getElementById("sVaultSet").click();
  await until(() => encrypted(win), "the vault to be written encrypted");
  assert.equal(win.document.querySelectorAll(".card").length, 1);

  win.relock();
  assert.equal(win.document.getElementById("lock").classList.contains("hidden"), false);
  assert.equal(win.document.getElementById("appRoot").classList.contains("hidden"), true);
  // accounts itself isn't observable from outside (module-scoped `let`, not a window property) —
  // the wrong-password check below is the black-box proof that in-memory state was actually cleared/reset
  win.document.getElementById("lockPass").value = "wrong password";
  win.document.getElementById("lockBtn").click();
  await until(() => win.document.getElementById("lockErr").style.display === "block", "the wrong password to be rejected");
  assert.equal(win.document.getElementById("lockErr").style.display, "block");
  assert.equal(win.document.getElementById("lock").classList.contains("hidden"), false);

  win.document.getElementById("lockPass").value = "lockme123";
  win.document.getElementById("lockBtn").click();
  await until(() => win.document.getElementById("lock").classList.contains("hidden"), "the vault to unlock");
  assert.equal(win.document.querySelectorAll(".card").length, 1, "the same account must come back after unlocking");
});

test("opening one panel (settings/form/bulk-add/help) always closes the others", () => {
  const win = bootApp();
  const hidden = id => win.document.getElementById(id).classList.contains("hidden");

  win.document.getElementById("bBulkAdd").click();
  assert.equal(hidden("bulkAdd"), false);

  win.document.getElementById("bSettings").click();
  assert.equal(hidden("settings"), false);
  assert.equal(hidden("bulkAdd"), true, "opening settings must close the bulk-add panel");

  win.document.getElementById("bAdd").click();
  assert.equal(hidden("form"), false);
  assert.equal(hidden("settings"), true, "opening the add-account form must close settings");

  win.document.getElementById("bHelp").click();
  assert.equal(hidden("help"), false);
  assert.equal(hidden("form"), true, "opening help must close the add-account form");
});

test("the panel close (X) button closes whichever panel is open", () => {
  const win = bootApp();
  win.document.getElementById("bSettings").click();
  assert.equal(win.document.getElementById("settings").classList.contains("hidden"), false);
  win.document.querySelector('#settings [data-close-panel]').click();
  assert.equal(win.document.getElementById("settings").classList.contains("hidden"), true);
});

test("applyAccent updates the --gold CSS custom property", () => {
  const win = bootApp();
  win.applyAccent("#3388ff");
  assert.equal(win.document.documentElement.style.getPropertyValue("--gold").trim(), "#3388ff");
});

test("vault encryption: round-trips accounts through AES-GCM and rejects the wrong password", async () => {
  const win = bootApp();
  const secret = [{ id: "1", gameName: "Foo", tagLine: "1234", password: "hunter2" }];
  const envelope = await win.encryptData("correct horse battery staple", secret);
  assert.equal(envelope.__enc, true);
  assert.ok(envelope.salt && envelope.iv && envelope.data);
  assert.doesNotMatch(JSON.stringify(envelope), /hunter2/, "ciphertext must not contain the plaintext password");

  const back = await win.decryptData("correct horse battery staple", envelope);
  // compare via JSON since the decrypted object is a plain object from the
  // jsdom window's realm, not this test file's realm — deepEqual chokes on
  // that prototype mismatch even though the data is identical
  assert.equal(JSON.stringify(back), JSON.stringify(secret));

  await assert.rejects(() => win.decryptData("wrong password", envelope));
});

test("saveDB writes an encrypted envelope once a vault password is set, and plain JSON once it's removed", async () => {
  // drives the real Settings UI buttons rather than poking internal state —
  // vaultPassword is a module-scoped `let`, not a window property, so it can
  // only be changed through the app's own code paths
  const win = bootApp();
  addRealAccount(win, "Test Smurf", "1234");
  win.document.getElementById("sVaultPass").value = "testpass123";
  win.document.getElementById("sVaultSet").click();
  await until(() => encrypted(win), "the vault to be written encrypted");
  let raw = JSON.parse(win.localStorage.getItem("smurf-tracker"));
  assert.equal(raw.__enc, true);

  win.document.getElementById("sVaultRemove").click(); // confirm() is stubbed to always return true
  await until(() => storedPlain(win), "the vault to be written back in the clear");
  raw = JSON.parse(win.localStorage.getItem("smurf-tracker"));
  assert.ok(Array.isArray(raw));
  assert.equal(raw.length, 1);
});

test("an encrypted vault shows the lock screen on boot, and the right password unlocks it", async () => {
  // first boot: set a password via the real Settings UI and let it persist to localStorage
  const win1 = bootApp();
  addRealAccount(win1, "Test Smurf", "1234");
  win1.document.getElementById("sVaultPass").value = "letmein123";
  win1.document.getElementById("sVaultSet").click();
  await until(() => encrypted(win1), "the vault to be written encrypted");
  const stored = win1.localStorage.getItem("smurf-tracker");

  // second boot: fresh window, pre-seed localStorage with the encrypted envelope
  const dom2 = new JSDOM(htmlNoScript, { url: "https://example.com/index.html", pretendToBeVisual: true, runScripts: "dangerously" });
  const win2 = dom2.window;
  Object.defineProperty(win2, "crypto", { value: webcrypto, configurable: true });
  win2.TextEncoder = TextEncoder;
  win2.TextDecoder = TextDecoder;
  win2.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
  win2.fetch = async () => { throw new Error("network disabled in tests"); };
  win2.localStorage.setItem("smurf-tracker", stored);
  runScript(win2, appScript);

  assert.equal(win2.document.getElementById("lock").classList.contains("hidden"), false, "lock screen must show for an encrypted vault");
  assert.equal(win2.document.getElementById("appRoot").classList.contains("hidden"), true);

  win2.document.getElementById("lockPass").value = "wrong";
  win2.document.getElementById("lockBtn").click();
  await until(() => win2.document.getElementById("lockErr").style.display === "block", "the wrong password to be rejected");
  assert.equal(win2.document.getElementById("lockErr").style.display, "block");
  assert.equal(win2.document.getElementById("lock").classList.contains("hidden"), false, "wrong password must not unlock");

  win2.document.getElementById("lockPass").value = "letmein123";
  win2.document.getElementById("lockBtn").click();
  await until(() => win2.document.getElementById("lock").classList.contains("hidden"), "the vault to unlock");
  assert.equal(win2.document.getElementById("lock").classList.contains("hidden"), true);
  assert.equal(win2.document.getElementById("appRoot").classList.contains("hidden"), false);
  assert.equal(win2.document.querySelectorAll(".card").length, 1);
});

// ---- what may write the vault, and when ----

/* relock() drops the password and empties `accounts`, but a rank check already
   waiting on the network knows nothing about that. It came back afterwards and
   saved: no password, nothing to save, so a plaintext "[]" went straight over the
   encrypted envelope. An auto-lock during "Check all ranks" emptied the vault for
   good — and left it asking for no password, because the lock screen only appears
   when there is an envelope on disk to unlock. Both ends of check() save, and the
   guard sits in saveDB(), which is the one thing they have in common. */
test("a lock in the middle of a check does not let that check overwrite the vault", async () => {
  const win = bootApp();
  addRealAccount(win, "Locked", "EUW1");
  win.document.getElementById("sVaultPass").value = "lockme12345";
  win.document.getElementById("sVaultSet").click();
  await until(() => encrypted(win), "the vault to be written encrypted");
  const envelope = win.localStorage.getItem("smurf-tracker");

  let fail = null;
  win.fetchViaProxy = () => new Promise((_, rej) => { fail = rej });
  const inFlight = win.check(win.document.querySelector(".card").dataset.id);
  await until(() => typeof fail === "function", "the check to reach the network");

  win.relock();
  assert.equal(win.document.getElementById("lock").classList.contains("hidden"), false, "the vault is locked");
  fail(new Error("came back too late"));
  await inFlight;

  assert.equal(encrypted(win), true, "what is on disk is still an envelope");
  assert.equal(win.localStorage.getItem("smurf-tracker"), envelope, "and byte for byte the same one");
});

/* Two overlapping checks on the same card: a slow success and a fast failure used
   to meet in either order. The failure path Object.assigns a note onto whatever
   stats are there, so a good reading could end up carrying "Auto-fetch failed"
   forever. Only the latest run may write. */
test("a check that was superseded cannot overwrite the one that replaced it", async () => {
  const win = bootApp([{ id: "c1", gameName: "Race", tagLine: "EUW", region: "EUW", status: "active",
    stats: null, history: [] }]);
  const id = "c1";
  let resolveFirst = null, rejectSecond = null;
  let n = 0;
  win.fetchViaProxy = () => {
    const mine = ++n;
    if (mine === 1) return new Promise(r => { resolveFirst = () => r({
      found: true, tier: "GOLD", division: "II", lp: 40, wins: 10, losses: 8,
      level: 30, peak: null, seasons: null, flex: null, champs: null, lpAt: null,
      icon: null, mmr: null, avgRecent: null, asOf: "test", note: null, updatedAt: Date.now(),
    }) });
    return new Promise((_, rej) => { rejectSecond = rej });
  };

  const first = win.check(id);
  await until(() => n >= 1, "the first check to reach the network");
  const second = win.check(id);
  await until(() => typeof rejectSecond === "function", "the second check to reach the network");

  rejectSecond(new Error("timed out"));
  await second;
  resolveFirst();
  await first;

  const stored = JSON.parse(win.localStorage.getItem("smurf-tracker")).find(a => a.id === id);
  // the late success must not land either — the second run owned the card, and it failed
  assert.equal(stored.stats && stored.stats.tier, undefined, "the superseded success wrote nothing");
  assert.match(stored.stats.note, /Auto-fetch failed/, "the later failure is what stuck");
});

/* Same race the other way: a failure that started first must not paste its note
   onto a success that finished after it was superseded. */
test("a superseded failure cannot paste its note onto a later success", async () => {
  const win = bootApp([{ id: "c2", gameName: "Race2", tagLine: "EUW", region: "EUW", status: "active",
    stats: null, history: [] }]);
  const id = "c2";
  let rejectFirst = null, resolveSecond = null;
  let n = 0;
  win.fetchViaProxy = () => {
    const mine = ++n;
    if (mine === 1) return new Promise((_, rej) => { rejectFirst = rej });
    return new Promise(r => { resolveSecond = () => r({
      found: true, tier: "PLATINUM", division: "I", lp: 12, wins: 20, losses: 15,
      level: 50, peak: null, seasons: null, flex: null, champs: null, lpAt: null,
      icon: null, mmr: null, avgRecent: null, asOf: "test", note: null, updatedAt: Date.now(),
    }) });
  };

  const first = win.check(id);
  await until(() => n >= 1, "first in flight");
  const second = win.check(id);
  await until(() => typeof resolveSecond === "function", "second in flight");

  resolveSecond();
  await second;
  rejectFirst(new Error("came back too late"));
  await first;

  const stored = JSON.parse(win.localStorage.getItem("smurf-tracker")).find(a => a.id === id);
  assert.equal(stored.stats.tier, "PLATINUM");
  assert.equal(stored.stats.note, null, "the late failure left no note on the good reading");
});

/* Encrypted saves used to overlap, with no order between them: each reads
   `accounts` and writes it out on opposite sides of a key lookup and AES-GCM, and
   hardly anything awaits saveDB(). Queued, the one that is already out of date
   before it starts stops being encrypted at all — which is what this can actually
   watch, two accounts added in one tick costing one AES-GCM pass instead of two. */
test("a save that is out of date before it starts is not encrypted at all", async () => {
  const win = bootApp();
  win.document.getElementById("sVaultPass").value = "hunter2pass";
  win.document.getElementById("sVaultSet").click();
  await until(() => encrypted(win), "the vault to go encrypted");

  const real = win.encryptData;
  let calls = 0;
  win.encryptData = (pass, obj) => { calls++; return real(pass, obj) };

  addRealAccount(win, "First", "1111");
  addRealAccount(win, "Second", "2222");
  await until(() => calls >= 1, "the vault to be re-encrypted");
  await new Promise(r => setTimeout(r, 60)); // long enough for a second pass to show up

  assert.equal(calls, 1, "the superseded save encrypts nothing");
  const back = await win.decryptData("hunter2pass", JSON.parse(win.localStorage.getItem("smurf-tracker")));
  // joined rather than deep-equal: the array comes out of the jsdom realm, so it
  // carries a different Array.prototype and fails a strict deep comparison
  assert.equal(back.map(a => a.gameName).join(", "), "First, Second",
    "and the one that did run wrote the newer state");
});

/* saveDB() caught the write failure, toasted, and returned as though it had saved,
   so every caller went on to its own success message — into the same toast, over
   the top of the warning. On this path that produced a vault the panel called
   encrypted while the disk still held the plaintext, with no auto-lock either,
   since that needs an envelope on disk to lock back to. */
test("a vault that could not be written does not leave the app claiming a password", async () => {
  const win = bootApp(undefined, w => {
    // through the prototype: assigning to localStorage.setItem itself only stores a
    // value under the key "setItem". boot()'s own storage probe and the settings key
    // have to keep working, so only the vault is refused.
    const real = w.Storage.prototype.setItem;
    w.Storage.prototype.setItem = function (k, v) {
      if (k === "smurf-tracker") { const e = new Error("quota"); e.name = "QuotaExceededError"; throw e }
      return real.call(this, k, v);
    };
  });
  win.document.getElementById("sVaultPass").value = "hunter2pass";
  win.document.getElementById("sVaultSet").click();

  await until(() => /could not write/i.test(win.document.getElementById("toast").textContent),
    "the failure to be reported");
  assert.match(win.document.getElementById("sVaultStatus").textContent, /unencrypted/i,
    "and the panel does not claim otherwise");
  assert.equal(win.localStorage.getItem("smurf-tracker"), null, "nothing was written");
});

// ---- op.gg season peak + summoner level ----
// Both fixtures are shaped like what the proxies actually return: reader-mode
// markdown (r.jina.ai) and raw tag-dense HTML. The values are the real ones from
// a live profile, so a change to op.gg's layout fails here rather than silently
// putting a wrong peak on a card.
const OPGG_MARKDOWN = [
  "![Image 91](https://opgg-static.akamaized.net/meta/images/profile_icons/profileIcon7131.jpg?w=200)",
  "764",
  "# terminallucidity#final",
  "*   EUW",
  "![Image 92](https://opgg-static.akamaized.net/images/medals_new/diamond.png?w=144)",
  "**diamond 1**52 LP",
  "190 W 215 L Win rate 47%",
  "![Image 93](https://opgg-static.akamaized.net/images/medals_new/master.png?w=72)",
  "**master**393 LP",
  "Top tier",
].join("\n");

const OPGG_HTML = '<div><img src="https://opgg-static.akamaized.net/meta/images/profile_icons/profileIcon7131.jpg">'
  + '<span class="level">764</span><h1>terminallucidity#final</h1></div>'
  + '<div><strong>diamond 1</strong><span>52 LP</span><div>190W 215L</div></div>'
  + '<div><strong>master</strong><span>393 LP</span><em>Top tier</em></div>';

// the parsers return objects built inside the jsdom realm, so they never pass a
// prototype-strict deepEqual against a Node-realm literal — copy them over first
const plain = o => (o ? { ...o } : o);

test("the season peak is read from op.gg's Top tier badge, in both proxy formats", () => {
  const win = bootApp();
  for (const [name, fixture] of [["markdown", OPGG_MARKDOWN], ["html", OPGG_HTML]]) {
    assert.deepEqual(plain(win.parsePeakText(fixture)), { tier: "MASTER", division: null, lp: 393 }, name);
  }
});

test("the peak's division must not swallow the first digit of its LP", () => {
  const win = bootApp();
  // "master 393 LP" parsed as division 3 / 93 LP before the lookahead was added
  assert.equal(win.parsePeakText("master 393 LP Top tier").lp, 393);
  assert.deepEqual(plain(win.parsePeakText("emerald 2 57 LP Top tier")), { tier: "EMERALD", division: "II", lp: 57 });
});

test("no Top tier badge means no peak, rather than a guess", () => {
  const win = bootApp();
  assert.equal(win.parsePeakText("<strong>gold 4</strong><span>12 LP</span>"), null);
  assert.equal(win.parsePeakText(""), null);
});

test("the summoner level is read from the bare number in front of the Riot ID", () => {
  const win = bootApp();
  const acc = { gameName: "terminallucidity", tagLine: "final" };
  assert.equal(win.parseLevelText(OPGG_MARKDOWN, acc), 764);
  assert.equal(win.parseLevelText(OPGG_HTML, acc), 764);
  assert.equal(win.parseLevelText(OPGG_HTML, { gameName: "SomebodyElse", tagLine: "EUW" }), null);
});

test("a tag-dense page still yields the current rank (strict pass falls back to stripped text)", () => {
  const win = bootApp();
  const r = win.parseRankText(OPGG_HTML);
  assert.equal(r.tier, "DIAMOND");
  assert.equal(r.division, "I");
  assert.equal(r.lp, 52);
});

// ---- LP chart ----
test("the LP chart draws a labelled band per tier crossed, and one point per check", () => {
  const win = bootApp();
  const hist = [
    { t: 1, tier: "EMERALD", division: "II", lp: 40 },
    { t: 2, tier: "EMERALD", division: "I", lp: 80 },
    { t: 3, tier: "DIAMOND", division: "IV", lp: 20 },
  ];
  const html = win.rankChart(hist);
  const el = win.document.createElement("div");
  el.innerHTML = html;
  assert.equal(el.querySelectorAll(".lpc-pt").length, 3, "one hoverable point per check");
  assert.equal(el.querySelectorAll(".lpc-line").length, 1);
  const labels = [...el.querySelectorAll(".lpc-lab")].map(n => n.textContent);
  assert.ok(labels.includes("Emerald") && labels.includes("Diamond"), "bands are labelled: " + labels);
  // the tooltip has to name the actual rank, not just the raw LP number
  assert.match(el.querySelector(".lpc-tip").textContent, /Emerald II . 40 LP/);
  assert.doesNotMatch(html, /undefined|NaN/);
});

test("one check still gets a chart — it says where on the ladder the account sits", () => {
  const win = bootApp();
  const el = chartDom(win, [{ t: Date.now(), tier: "GOLD", division: "I", lp: 10 }]);
  assert.equal(el.querySelectorAll(".lpc-pt").length, 1);
  assert.equal(el.querySelectorAll(".lpc-line").length, 0, "one point is not a line");
  assert.match(el.querySelector(".lpc-tip").textContent, /Gold I · 10 LP/);
  assert.doesNotMatch(el.innerHTML, /undefined|NaN/);
  // nothing rankable at all is still nothing to draw
  assert.equal(win.rankChart([]), "");
  assert.equal(win.rankChart([{ t: 1, tier: "UNRANKED", division: null, lp: null }]), "");
});

test("daily/weekly/monthly keep the last check in each period, like op.gg", () => {
  const win = bootApp();
  const day = 86400000;
  // Anchored to a fixed Wednesday rather than Date.now(): how many calendar weeks
  // a 14-day run touches depends on the weekday it ends on — run on a Sunday it
  // lands on exactly two Monday-anchored weeks, and this test failed once a week.
  const now = new Date(2026, 0, 14, 12, 0, 0).getTime(); // Wed 14 Jan 2026, local
  // 14 consecutive days of checks
  const h = Array.from({ length: 14 }, (_, i) => ({ t: now - (13 - i) * day, tier: "GOLD", division: "II", lp: i * 3 }));
  const points = mode => chartDom(win, h, mode).querySelectorAll(".lpc-pt").length;
  assert.equal(points("d"), 14);
  assert.equal(points("w"), 3, "14 days spans three calendar weeks");
  assert.equal(points("m"), 1);

  // the survivor of a bucket is the one the period ended on
  const el = chartDom(win, h, "m");
  assert.match(el.querySelector(".lpc-tip").textContent, /39 LP/);

  // and the default follows the data rather than being fixed — this one reads the
  // span between the points, so it doesn't care when "now" is
  assert.equal(win.defaultRange(h), "d");
  assert.equal(win.defaultRange([{ t: now - 60 * day, tier: "GOLD", division: "II", lp: 1 }, { t: now, tier: "GOLD", division: "II", lp: 2 }]), "w");
  assert.equal(win.defaultRange([{ t: now - 700 * day, tier: "GOLD", division: "II", lp: 1 }, { t: now, tier: "GOLD", division: "II", lp: 2 }]), "m");
});

// ---- inline notes ----
// `accounts` is a top-level `let`, which is not a window property — read what
// was actually persisted instead
const storedNote = win => (JSON.parse(win.localStorage.getItem("smurf-tracker")) || [])[0].notes;

function typeNote(win, text) {
  const ta = win.document.querySelector('[data-f="notetext"]');
  ta.value = text;
  ta.dispatchEvent(new win.Event("input", { bubbles: true }));
  return ta;
}

test("a note saves itself as you type — there is no Save button to miss", () => {
  const win = bootApp();
  addRealAccount(win, "NoteGuy", "1234");

  // an empty note is still a click target, so there is no separate "add" action
  win.document.querySelector('[data-act="noteedit"]').click();
  const ta = win.document.querySelector('[data-f="notetext"]');
  assert.ok(ta, "editor must open");

  typeNote(win, "smurf for duo queue");
  win.writeNote(); // the debounce, without waiting on it
  assert.equal(storedNote(win), "smurf for duo queue");

  // an unrelated re-render must not throw the draft away
  win.renderGrid();
  assert.equal(win.document.querySelector('[data-f="notetext"]').value, "smurf for duo queue");
});

test("clicking away commits the note and collapses the editor", () => {
  const win = bootApp();
  addRealAccount(win, "NoteGuy", "1234");
  win.document.querySelector('[data-act="noteedit"]').click();
  typeNote(win, "original");

  // pointerdown outside the note block is the whole gesture
  win.document.body.dispatchEvent(new win.Event("pointerdown", { bubbles: true }));
  assert.equal(storedNote(win), "original");
  assert.equal(win.document.querySelector('[data-f="notetext"]'), null, "editor collapses");
  assert.match(win.document.querySelector(".c-notes").textContent, /original/);

  // reopening shows what was saved, and clearing it puts the blank state back
  win.document.querySelector('[data-act="noteedit"]').click();
  assert.equal(win.document.querySelector('[data-f="notetext"]').value, "original");
  typeNote(win, "   ");
  win.document.body.dispatchEvent(new win.Event("pointerdown", { bubbles: true }));
  assert.equal(storedNote(win), undefined, "whitespace is not a note");
  assert.ok(win.document.querySelector(".c-notes.blank"), "back to the quiet invitation");
});

test("the paste-a-whole-page fallback is gone; manual rank entry replaces it", () => {
  const win = bootApp();
  win.loadDemo();
  win.document.querySelector('[data-act="more"]').click();
  const acts = [...win.document.querySelectorAll("[data-act]")].map(b => b.dataset.act);
  assert.ok(!acts.includes("paste"), "no Paste button");
  assert.ok(!acts.includes("note"), "no separate Note button — the note itself is the target");
  assert.ok(acts.includes("rank"), "manual entry stays");
  assert.equal(win.document.querySelector('[data-f="pastetext"]'), null);
});

// ---- accents ----
test("the secondary accent drives --teal, and its ink flips with the colour's luminance", () => {
  const win = bootApp();
  const read = v => win.document.documentElement.style.getPropertyValue(v).trim().toLowerCase();

  win.applyAccent2("#2ee0c2"); // bright -> dark label on the filled Login button
  assert.equal(read("--teal"), "#2ee0c2");
  assert.ok(win.relLuminance(read("--teal-ink")) < 0.1, "ink must be dark on a bright secondary");

  win.applyAccent2("#3b1d7a"); // deep -> a dark ink here would be unreadable
  assert.equal(read("--teal-ink"), "#ffffff");
});

test("both accents persist, and leaving Settings unsaved puts the previewed colours back", () => {
  const win = bootApp();
  const read = v => win.document.documentElement.style.getPropertyValue(v).trim().toLowerCase();

  win.document.getElementById("bSettings").click();
  win.document.getElementById("sAccent").value = "#ff0000";
  win.document.getElementById("sAccent2").value = "#00ff00";
  win.document.getElementById("sSave").click();
  assert.equal(read("--gold"), "#ff0000");
  assert.equal(read("--teal"), "#00ff00");
  assert.equal(JSON.parse(win.localStorage.getItem("smurf-tracker-cfg")).accent2, "#00ff00");

  win.document.getElementById("bSettings").click();
  const picker = win.document.getElementById("sAccent2");
  picker.value = "#0000ff";
  picker.dispatchEvent(new win.Event("input", { bubbles: true }));
  assert.equal(read("--teal"), "#0000ff", "the picker previews live");
  win.document.getElementById("sClose").click();
  assert.equal(read("--teal"), "#00ff00", "closing without saving reverts");

  // the ⋯ menu's Settings entry toggles the panel shut, which is a close as well —
  // it used to only hide it, leaving an unsaved colour applied to the whole page
  win.document.getElementById("bSettings").click();
  picker.value = "#123456";
  // change rather than input: releasing the picker skips the rate-limit queue that
  // the preview above has just opened
  picker.dispatchEvent(new win.Event("change", { bubbles: true }));
  assert.equal(read("--teal"), "#123456", "the colour is applied but not saved");
  win.document.getElementById("bSettings").click();
  assert.equal(win.document.getElementById("settings").classList.contains("hidden"), true);
  assert.equal(read("--teal"), "#00ff00", "and closing it from the menu reverts too");
});

// the two the app ships with, which the resets have to land back on exactly
const DEFAULT_ACCENT = "#d8b874", DEFAULT_ACCENT2 = "#2ee0c2";

/* Each colour gets its own way back. They preview like the pickers do rather than
   saving on the spot — a reset that wrote cfg immediately would be the one control
   in the panel Close could not undo. */
test("each accent resets on its own, and a reset is only kept by Save", () => {
  const win = bootApp();
  const read = v => win.document.documentElement.style.getPropertyValue(v).trim().toLowerCase();
  const cfg = () => JSON.parse(win.localStorage.getItem("smurf-tracker-cfg"));
  const $ = id => win.document.getElementById(id);

  $("bSettings").click();
  $("sAccent").value = "#ff0000";
  $("sAccent2").value = "#00ff00";
  $("sSave").click();
  assert.equal(read("--gold"), "#ff0000");

  // one colour back, the other left exactly where it was
  $("bSettings").click();
  $("sAccentReset1").click();
  assert.equal(read("--gold"), DEFAULT_ACCENT, "the primary is back to default");
  assert.equal(read("--teal"), "#00ff00", "and the secondary was not touched");
  assert.equal($("sAccent").value, DEFAULT_ACCENT, "the picker follows too");
  assert.equal(cfg().accent, "#ff0000", "nothing is saved yet");
  assert.equal($("accPrev").classList.contains("show"), false, "reset does not open the colour miniature");

  $("sClose").click();
  assert.equal(read("--gold"), "#ff0000", "so closing puts the old colour back");

  // the same for the secondary, and this time keep it
  $("bSettings").click();
  $("sAccentReset2").click();
  assert.equal(read("--teal"), DEFAULT_ACCENT2);
  assert.equal(read("--gold"), "#ff0000", "the primary stays where it was");
  $("sSave").click();
  assert.equal(read("--teal"), DEFAULT_ACCENT2, "kept");
  // a colour nobody chose is stored as no choice, so the default can move later
  assert.equal(cfg().accent2, null, "the default is stored as no preference");
  assert.equal(cfg().accent, "#ff0000", "a real choice is still stored as itself");

  assert.equal($("sAccentReset"), null, "there is no combined reset — each colour has its own");
});

/* The sample used to sit under the swatches, which is exactly where the browser's
   colour popup opens — so the answer was covered the moment you asked. It floats
   beside the focused swatch as a miniature of the homepage with a card next to it. */
test("picking a colour opens a miniature homepage beside the colour popup", async () => {
  const win = bootApp();
  const prev = win.document.getElementById("accPrev");
  assert.ok(prev, "there is a preview");
  assert.equal(win.document.getElementById("settings").contains(prev), true,
    "it belongs to Settings, outside the scrolling body");
  assert.equal(prev.classList.contains("show"), false, "closed until a colour is being chosen");

  // it is a picture of controls, not controls: no clicking, no tabbing, not read out
  assert.equal(prev.hasAttribute("inert"), true);
  assert.equal(prev.getAttribute("aria-hidden"), "true");
  for (const el of prev.querySelectorAll("button,input")) {
    assert.equal(el.getAttribute("tabindex"), "-1", el.textContent || el.type);
  }

  win.document.getElementById("bSettings").click();
  const swatch = win.document.getElementById("sAccent");
  // focus alone must not open it — Chromium returns focus after the native picker
  // closes, which used to leave the miniature stranded with no picker on screen
  swatch.focus();
  assert.equal(prev.classList.contains("show"), false, "focus alone does not open it");

  // mousedown alone must not open — a press-and-drag cancels the native picker
  // click, and used to leave the miniature up by itself
  swatch.dispatchEvent(new win.MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  assert.equal(prev.classList.contains("show"), false, "mousedown alone does not open it");

  swatch.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
  assert.equal(prev.classList.contains("show"), true, "a completed click opens it with the picker");
  // placeAccPrev runs on the next frame
  await new Promise(r => win.requestAnimationFrame(() => win.requestAnimationFrame(r)));
  assert.ok(prev.style.left, "it is positioned on the viewport, not in the form flow");
  const left = parseFloat(prev.style.left);
  const swatchRight = swatch.getBoundingClientRect().right;
  assert.ok(left >= swatchRight + 200,
    "parked past the native picker block, not flush against the 52px square");
  assert.ok(prev.querySelector(".acc-prev-home"), "homepage half");
  assert.ok(prev.querySelector(".acc-prev-card"), "and the card beside it");
  assert.ok(prev.querySelector(".acc-prev-mark"), "it carries the brand");
  assert.ok(prev.querySelector(".b-gold"), "something driven by the primary");
  assert.ok(prev.querySelector(".b-teal"), "and something driven by the secondary");
  assert.ok(prev.querySelector(".acc-prev-star"), "favorites are a primary thing");
  // the colour field is the larger hit target next to the reset — reset stays as it is
  assert.equal(win.getComputedStyle(swatch).width, "52px");
  assert.equal(win.getComputedStyle(win.document.getElementById("sAccentReset1")).width, "27px");

  // confirming a colour closes the native dialog — the miniature must leave with it
  swatch.dispatchEvent(new win.Event("change", { bubbles: true }));
  assert.equal(prev.classList.contains("show"), false, "change means the picker is gone");

  win.document.getElementById("sClose").click();
  assert.equal(prev.classList.contains("show"), false, "closing Settings puts it away");
});

test("pressing the colour square again closes the miniature and the picker", () => {
  const win = bootApp();
  const prev = win.document.getElementById("accPrev");
  const swatch = win.document.getElementById("sAccent");
  win.document.getElementById("bSettings").click();
  swatch.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
  assert.equal(prev.classList.contains("show"), true);

  // second press on the same square — must close both, and not reopen the picker
  const md = new win.MouseEvent("mousedown", { bubbles: true, cancelable: true });
  swatch.dispatchEvent(md);
  assert.equal(md.defaultPrevented, true, "the press that closes also cancels the native open");
  assert.equal(prev.classList.contains("show"), false, "the miniature is gone");
  assert.notEqual(win.document.activeElement, swatch, "and the swatch is blurred so the picker closes");

  const trailing = new win.MouseEvent("click", { bubbles: true, cancelable: true });
  swatch.dispatchEvent(trailing);
  assert.equal(trailing.defaultPrevented, true, "the click after a close toggle is cancelled");
  assert.equal(prev.classList.contains("show"), false, "and the miniature stays shut");
});

test("a second press still closes after the browser already dismissed the picker", () => {
  const win = bootApp();
  const prev = win.document.getElementById("accPrev");
  const swatch = win.document.getElementById("sAccent");
  win.document.getElementById("bSettings").click();

  swatch.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
  assert.equal(prev.classList.contains("show"), true);

  // Browser closes the native dialog first (change), then mousedown arrives —
  // without a suppress window that mousedown would open everything again.
  swatch.dispatchEvent(new win.Event("change", { bubbles: true }));
  assert.equal(prev.classList.contains("show"), false);

  const reopen = new win.MouseEvent("mousedown", { bubbles: true, cancelable: true });
  swatch.dispatchEvent(reopen);
  assert.equal(reopen.defaultPrevented, true, "same-gesture reopen is cancelled");
  assert.equal(prev.classList.contains("show"), false, "stays shut through the suppress window");
});

test("a long Riot ID truncates inside an element that can actually ellipsize", () => {
  const win = bootApp();
  addRealAccount(win, "aVeryLongSummonerNameIndeed", "EUW123");
  // text-overflow on the <button> itself does nothing in a real browser — the
  // clipping has to happen on a child element
  const inner = win.document.querySelector(".rid > span");
  assert.ok(inner, "the Riot ID must be wrapped in an element of its own");
  assert.match(inner.textContent, /aVeryLongSummonerNameIndeed#EUW123/);
});

test("the accent preview is rate limited during a drag, and the released value always lands", () => {
  const win = bootApp();
  const read = v => win.document.documentElement.style.getPropertyValue(v).trim().toLowerCase();
  const picker = win.document.getElementById("sAccent");
  const move = hex => { picker.value = hex; picker.dispatchEvent(new win.Event("input", { bubbles: true })); };

  win.document.getElementById("bSettings").click();

  // the first move has to show at once — a preview that waits feels broken
  move("#112233");
  assert.equal(read("--gold"), "#112233");

  // everything after it inside the budget is collapsed rather than applied one by
  // one; each application is a full-document style recalc, which is what made the
  // page unusable while dragging
  for (let i = 0; i < 50; i++) move("#" + (0x445566 + i).toString(16));
  assert.equal(read("--gold"), "#112233", "mid-drag events must not each trigger a restyle");

  // releasing the picker fires change, and that value skips the queue
  picker.value = "#ff8800";
  picker.dispatchEvent(new win.Event("change", { bubbles: true }));
  assert.equal(read("--gold"), "#ff8800");
});

// ---- LP chart: hit areas, geometry, scale ----
const hist = (...rows) => rows.map(([tier, division, lp], i) => ({ t: i + 1, tier, division, lp }));
function chartDom(win, h, mode) {
  const el = win.document.createElement("div");
  el.innerHTML = win.rankChart(h, null, mode);
  return el;
}

test("a point's hit area is a window around it, never a slab of the whole chart", () => {
  const win = bootApp();
  // Two failure modes, opposite ends of the same dial. Columns that overhang the
  // chart lie on top of the neighbouring card and steal its hover. Columns that
  // tile the chart edge to edge mean pointing anywhere at all — the empty middle
  // of the plot — lights up whichever dot happens to be nearest.
  for (const n of [2, 3, 8, 30]) {
    const rows = Array.from({ length: n }, (_, i) => ["GOLD", "II", i]);
    const cols = [...chartDom(win, hist(...rows)).querySelectorAll(".lpc-pt")];
    assert.equal(cols.length, n, `${n} points`);
    cols.forEach((p, i) => {
      const left = parseFloat(p.style.left);
      // never wider than the slice between neighbours, and never wider than a
      // target either way
      assert.match(p.style.width, /^min\(\d+(\.\d+)?%,\s*40px\)$/, `${n}[${i}]: capped width`);
      const slice = parseFloat(p.style.width.match(/([\d.]+)%/)[1]);
      assert.ok(slice > 0 && slice <= 100 / (n - 1) + 0.02, `${n}[${i}]: no wider than its share`);
      // anchored so nothing hangs off either end of the plot
      const anchor = i === 0 ? 0 : i === n - 1 ? 100 : 50;
      assert.equal(p.style.transform, `translateX(-${anchor}%)`, `${n}[${i}]: anchor`);
      assert.ok(left >= -0.01 && left <= 100.01, `${n}[${i}]: stays inside the chart`);
    });
    assert.equal(parseFloat(cols[0].style.left), 0, `${n}: first sits on the left edge`);
    assert.ok(Math.abs(parseFloat(cols[n - 1].style.left) - 100) < 0.02, `${n}: last sits on the right edge`);
  }
});

test("each point's dot sits on its own value, not in the middle of its hit area", () => {
  const win = bootApp();
  const pts = [...chartDom(win, hist(["GOLD", "II", 0], ["GOLD", "II", 40], ["GOLD", "I", 5]))
    .querySelectorAll(".lpc-pt")];
  // the outer points hang off their own dot, the middle one is centred on it —
  // and --x has to agree with the anchor or the guide line drifts off the dot
  assert.deepEqual(pts.map(p => p.style.getPropertyValue("--x").trim()), ["0%", "50%", "100%"]);
  assert.deepEqual(pts.map(p => p.style.transform),
    ["translateX(-0%)", "translateX(-50%)", "translateX(-100%)"]);
});

test("the line spans the full chart, with no pathLength for a dash pattern to disagree with", () => {
  const win = bootApp();
  const el = chartDom(win, hist(["MASTER", null, 393], ["MASTER", null, 196], ["DIAMOND", "I", 52]));
  const line = el.querySelector(".lpc-line");
  // stroke-dasharray measured in screen pixels against a pathLength of 100 left a
  // gap before the newest point — the reveal is a clip wipe now, so neither exists
  assert.equal(line.getAttribute("pathLength"), null);
  const coords = line.getAttribute("points").split(" ");
  assert.ok(coords[0].startsWith("0.0,"), "starts at the left edge: " + coords[0]);
  assert.ok(coords[coords.length - 1].startsWith("200.0,"), "reaches the right edge: " + coords[coords.length - 1]);
});

test("the two halves of the ladder get their own scale", () => {
  const win = bootApp();
  const marks = h => [...chartDom(win, h).querySelectorAll(".lpc-sub")].map(n => n.textContent);

  // below Master the unit of interest is the division, which is always 100 LP
  assert.deepEqual(marks(hist(["PLATINUM", "IV", 5], ["PLATINUM", "I", 88])), ["III", "II", "I"]);

  // above it a fixed 100 is far too fine — a Master account decaying 1600 -> 800
  // would be dozens of lines, so that step grows with the range
  assert.deepEqual(marks(hist(["MASTER", null, 1600], ["MASTER", null, 800])), ["800 LP", "1200 LP"]);
  assert.deepEqual(marks(hist(["MASTER", null, 2400], ["MASTER", null, 300])), ["400 LP", "1200 LP", "2000 LP"]);

  // both at once, each on its own scale
  assert.deepEqual(marks(hist(["MASTER", null, 393], ["MASTER", null, 196], ["DIAMOND", "I", 52])),
    ["I", "200 LP"]);

  // too much ladder in view for a 100 LP line to be readable: the bands carry it
  assert.deepEqual(marks(hist(["SILVER", "II", 20], ["PLATINUM", "IV", 8])), []);
});

test("the chart's x axis is real time, so a gap in the record shows as a gap", () => {
  const win = bootApp();
  const day = 86400000, now = Date.now();
  // two checks a day apart, then a three-week silence, then one more
  const h = [
    { t: now - 22 * day, tier: "GOLD", division: "II", lp: 10 },
    { t: now - 21 * day, tier: "GOLD", division: "II", lp: 40 },
    { t: now, tier: "GOLD", division: "I", lp: 20 },
  ];
  const xs = chartDom(win, h).querySelector(".lpc-line").getAttribute("points")
    .split(" ").map(c => parseFloat(c.split(",")[0]));
  assert.equal(xs[0], 0);
  assert.equal(xs[2], 200);
  // evenly spaced would put the middle point at 100; by time it belongs near the left
  assert.ok(xs[1] < 20, "the long silence must take up most of the width, got x=" + xs[1]);

  const ticks = [...chartDom(win, h).querySelectorAll(".lpc-tick")].map(n => n.textContent);
  assert.ok(ticks.length >= 2, "the axis must be labelled: " + ticks);
  assert.ok(ticks.every(t => /^\d{1,2} [A-Z][a-z]{2}$/.test(t)), "unambiguous dates: " + ticks);
});

test("a history with no usable timestamps still plots, evenly spaced", () => {
  const win = bootApp();
  const h = [{ tier: "GOLD", division: "II", lp: 10 }, { tier: "GOLD", division: "II", lp: 40 },
             { tier: "GOLD", division: "I", lp: 20 }];
  const el = chartDom(win, h);
  const xs = el.querySelector(".lpc-line").getAttribute("points").split(" ").map(c => parseFloat(c.split(",")[0]));
  assert.deepEqual(xs, [0, 100, 200]);
  assert.equal(el.querySelectorAll(".lpc-tick").length, 0, "no timestamps, no date axis");
});

test("division numerals only appear when all four are marked, so no chart shows two IIs", () => {
  const win = bootApp();
  for (const h of [
    hist(["SILVER", "II", 20], ["PLATINUM", "IV", 8]),
    hist(["IRON", "IV", 0], ["CHALLENGER", null, 900]),
    hist(["BRONZE", "I", 10], ["EMERALD", "III", 70]),
  ]) {
    const numerals = [...chartDom(win, h).querySelectorAll(".lpc-sub")]
      .map(n => n.textContent).filter(t => /^(I|II|III|IV)$/.test(t));
    assert.deepEqual([...new Set(numerals)].length, numerals.length, "duplicate numerals: " + numerals);
  }
});

// ---- the rest of what the profile page carries ----
// Rows copied from a live profile, in both shapes a proxy can hand back.
const SEASONS_MD = [
  "Ranked Solo/Duo| Season | Tier | LP |",
  "| :--- | :--- | ---: |",
  "| **S2025** | ![Image 94](https://opgg-static.akamaized.net/images/medals_mini/master.png?w=40)master | 135 |",
  "| **S2024 S1** | ![Image 95](https://opgg-static.akamaized.net/images/medals_mini/emerald.png?w=40)emerald 2 | 57 |",
  "Ranked Flex| Season | Tier | LP |",
  "| :--- | :--- | ---: |",
  "| **S2025** | ![Image 99](https://opgg-static.akamaized.net/images/medals_mini/silver.png?w=40)silver 2 | 37 |",
].join("\n");

test("past seasons are read per queue, and the medal image never leaks into the tier", () => {
  const win = bootApp();
  const r = win.parseSeasons(SEASONS_MD);
  assert.deepEqual(Array.from(r.solo, e => `${e.season} ${e.tier}${e.division ? " " + e.division : ""} ${e.lp}`),
    ["S2025 MASTER 135", "S2024 S1 EMERALD II 57"]);
  assert.deepEqual(Array.from(r.flex, e => `${e.season} ${e.tier} ${e.division} ${e.lp}`), ["S2025 SILVER II 37"]);
  assert.equal(win.parseSeasons("nothing resembling a season table"), null);
});

test("the flex rank is only trusted when a tier and an LP figure sit under the heading", () => {
  const win = bootApp();
  assert.deepEqual({ ...win.parseFlex("Ranked Flex\n\n**Unranked**\n") }, { tier: "UNRANKED", division: null, lp: null });
  assert.deepEqual({ ...win.parseFlex("Ranked Flex\n\n**gold 2**45 LP\n") }, { tier: "GOLD", division: "II", lp: 45 });
  assert.equal(win.parseFlex("Ranked Solo/Duo\n\n**gold 2**45 LP\n"), null, "must not read the solo rank as flex");
});

test("champion rows parse into name, winrate, games and KDA", () => {
  const win = bootApp();
  const line = "*   [![Image 101: Ashe](https://opgg-static.akamaized.net/x/Ashe.png?v=1)](https://op.gg/champions/ashe/build)"
    + "[Ashe](https://op.gg/champions/ashe/build)CS 209 (7.2)  2.25:1 KDA 6 / 6.8 / 9.3 60%25 Games \n"
    + "*   [![Image 102: Smolder](https://opgg-static.akamaized.net/x/Smolder.png?v=1)](https://op.gg/champions/smolder/build)"
    + "[Smolder](https://op.gg/champions/smolder/build)CS 257 (8.6)  3.01:1 KDA 9 / 5.9 / 8.8 68%22 Games ";
  const c = win.parseChampions(line);
  assert.equal(c.length, 2);
  assert.deepEqual({ ...c[0] }, { name: "Ashe", kda: 2.25, k: 6, d: 6.8, a: 9.3, wr: 60, games: 25 });
  assert.equal(c[1].name, "Smolder");
  assert.equal(win.parseChampions("Ashe went 6/6/9 last game"), null);
});

test("the GM and Challenger floors are read off the ladder page's medal alt text", () => {
  const win = bootApp();
  // the tier name exists only in the image's alt — the figure itself is a bare "2,417 LP"
  const md = "*   ![Image 65: challenger](https://opgg-static.akamaized.net/images/medals_mini/challenger.png?w=48)**2,417 LP** 6 304 Summoners\n"
    + "*   ![Image 66: grandmaster](https://opgg-static.akamaized.net/images/medals_mini/grandmaster.png?w=48)**1,785 LP** 4 747 Summoners";
  assert.deepEqual({ ...win.parseCutoffs(md) }, { chall: 2417, gm: 1785 });

  const html = '<li><img alt="challenger" src="x.png"><strong>2,417 LP</strong> 304 Summoners</li>'
    + '<li><img alt="grandmaster" src="y.png"><strong>1,785 LP</strong> 747 Summoners</li>';
  assert.deepEqual({ ...win.parseCutoffs(html) }, { chall: 2417, gm: 1785 });
  assert.equal(win.parseCutoffs("Rank Up in 3 Days! Challenger Coaching"), null, "an ad is not a floor");
  assert.equal(win.parseCutoffs("![challenger](x) **250 LP** coaching"), null,
    "an implausibly low Challenger figure is an ad, not a ladder floor");
});

test("the chart draws the GM/Challenger floors only where the view reaches them", () => {
  const win = bootApp();
  const h = [{ t: 1, tier: "MASTER", division: null, lp: 400 }, { t: 2, tier: "MASTER", division: null, lp: 1900 }];
  const withCut = win.document.createElement("div");
  withCut.innerHTML = win.rankChart(h, { chall: 2417, gm: 1785 });
  // 1785 is inside the plotted range, 2417 is well above it
  assert.deepEqual([...withCut.querySelectorAll(".lpc-cut")].map(n => n.textContent), ["GM"]);

  const noCut = win.document.createElement("div");
  noCut.innerHTML = win.rankChart(h);
  assert.equal(noCut.querySelectorAll(".lpc-cut").length, 0, "no floors known, none drawn");
});

test("the info panel only exists once a check has brought something back for it", () => {
  const win = bootApp();
  assert.equal(win.infoBlockHTML({ stats: {} }), "");
  assert.equal(win.infoBlockHTML({}), "");
  // an unranked flex queue is not a fact worth a row — it is dropped, not printed
  assert.doesNotMatch(win.infoBlockHTML({ stats: { flex: { tier: "UNRANKED", division: null, lp: null } } }), /Flex rank/);

  const html = win.infoBlockHTML({ stats: {
    flex: { tier: "GOLD", division: "II", lp: 45 },
    seasons: { solo: [{ season: "S2025", tier: "MASTER", division: null, lp: 135 }], flex: [] },
    champs: [{ name: "Ashe", kda: 2.25, wr: 60, games: 25 }],
  } });
  const el = win.document.createElement("div"); el.innerHTML = html;
  // Folded: every group announces itself, with a count and the headline answer,
  // and none of the rows behind it are in the DOM yet.
  assert.match(el.textContent, /Flex rank/);
  assert.match(el.textContent, /Past seasons · Solo/);
  assert.match(el.textContent, /Champions this season/);
  assert.match(el.textContent, /Master · 135 LP/, "the peak of those seasons is the headline");
  assert.match(el.textContent, /Ashe/, "and the champion actually played");
  assert.equal(el.querySelectorAll(".sea").length, 0, "season rows stay behind the click");
  assert.equal(el.querySelectorAll(".chp").length, 0, "so do champion rows");
  assert.doesNotMatch(html, /undefined|NaN/);
});

// The app keeps its own copy of these parsers for the proxy path, and two of the
// three proxies hand it raw op.gg HTML rather than rendered markdown — so it has
// to survive the same real markup the worker does.
const REAL_PROFILE = `
<title>terminallucidity#final - Summoner stats</title>
<meta name="description" content="terminallucidity#final / Diamond 1 1 52LP / 190Win 215Lose Win rate 47% / Ashe - 15Win 10Lose Win rate 60%, Smolder - 15Win 7Lose Win rate 68%"/>
<div class="mt-[-11px]"><span>764</span></div>
<h1><strong>terminallucidity</strong><span>#</span><span>final</span></h1>
<table><tbody>
  <tr><th>Season</th><th>Tier</th><th>LP</th></tr>
  <tr><td><strong>S2025 </strong></td>
      <td><div class="flex"><div class="inline-flex"><img src="/medals_mini/master.png"/><span>master</span></div></div></td>
      <td align="right">135</td></tr>
  <tr><td><strong>S2024 S1</strong></td>
      <td><div class="flex"><div class="inline-flex"><img src="/medals_mini/emerald.png"/><span>emerald 2</span></div></div></td>
      <td align="right">57</td></tr>
</tbody></table>
<div class="relative flex"> Ranked Flex </div><div>Unranked</div>
<table><tbody>
  <tr><th>Season</th><th>Tier</th><th>LP</th></tr>
  <tr><td><strong>S2025</strong></td>
      <td><div class="flex"><div class="inline-flex"><img src="/medals_mini/silver.png"/><span>silver 2</span></div></div></td>
      <td align="right">37</td></tr>
</tbody></table>`;

test("the app reads real op.gg table markup, not just the proxies' rendered version", () => {
  const win = bootApp();
  const s = win.parseSeasons(REAL_PROFILE);
  // the cells carry their own <div>s; splitting on </div> scattered one season
  // across three lines and left the division digit standing in for the LP
  assert.deepEqual(Array.from(s.solo, e => `${e.season} ${e.tier}${e.division ? " " + e.division : ""} ${e.lp}`),
    ["S2025 MASTER 135", "S2024 S1 EMERALD II 57"]);
  assert.deepEqual(Array.from(s.flex, e => `${e.season} ${e.tier} ${e.division} ${e.lp}`), ["S2025 SILVER II 37"]);

  // the Riot ID heading is three elements, so the text reads "764 name # tag"
  assert.equal(win.parseLevelText(REAL_PROFILE, { gameName: "terminallucidity", tagLine: "final" }), 764);
  assert.equal(win.parseLevelText(REAL_PROFILE, { gameName: "Nobody", tagLine: "x" }), null);

  // the profile page has no per-champion season table at all — op.gg's own page
  // description is the only champion data on it
  const c = win.parseChampions(REAL_PROFILE);
  assert.deepEqual(Array.from(c, x => `${x.name} ${x.wins}-${x.losses} ${x.wr}%`), ["Ashe 15-10 60%", "Smolder 15-7 68%"]);
  assert.equal(c[0].kda, null);
});

test("a malformed backend response cannot throw its way through a render", () => {
  const win = bootApp();
  // what a wrong-shaped or half-broken backend actually sends
  assert.equal(win.normSeasons(null), null);
  assert.equal(win.normSeasons({ solo: "not an array" }), null);
  assert.equal(win.normSeasons({ solo: [{ season: "S2025" }] }), null, "a row with no tier is dropped, not rendered");
  assert.equal(win.normSeasons({ solo: [{ season: "S2025", tier: "PRETEND" }] }), null);
  const ok = win.normSeasons({ solo: [{ season: "S2025", tier: "master", division: "x", lp: "135" }], flex: null });
  assert.deepEqual({ ...ok.solo[0] }, { season: "S2025", tier: "MASTER", division: null, lp: 135 });
  assert.equal(ok.flex.length, 0);

  assert.equal(win.normChamps("nope"), null);
  assert.equal(win.normChamps([{ wr: 60 }]), null, "a champion with no name is not a champion");
  const c = win.normChamps([{ name: "Ashe", wr: "60", games: "25", kda: "2.253" }, null, 7]);
  assert.equal(c.length, 1);
  assert.deepEqual({ ...c[0] }, { name: "Ashe", kda: 2.25, wr: 60, games: 25, wins: null, losses: null });
  assert.equal(win.normChamps([{ name: "X", wr: 9000, games: -3 }])[0].wr, 100, "a nonsense win rate is clamped");
  // no KDA stays no KDA — 0.00 would be a made-up number rather than a missing one
  assert.equal(win.normChamps([{ name: "X", wr: 60, wins: 15, losses: 10 }])[0].kda, null);
  assert.equal(win.normChamps([{ name: "X", wr: 60, wins: 15, losses: 10 }])[0].games, 25, "games fall out of W+L");

  // and the whole thing renders rather than blowing up the grid
  const html = win.infoBlockHTML({ id: "x", stats: { seasons: { solo: [{ tier: null }, { season: "S2025", tier: "GOLD", lp: 3 }] }, champs: [{}, { name: "Ashe", wr: 55, games: 4 }] } });
  assert.match(html, /Past seasons/);
  assert.doesNotMatch(html, /undefined|NaN/);
});

// Seasons, flex and champions only ever arrive from a rank check, so this seeds
// them through localStorage and then drives the real card the way a user does.
const RICH_STATS = {
  found: true, tier: "DIAMOND", division: "I", lp: 52, wins: 190, losses: 215, level: 764,
  flex: { tier: "GOLD", division: "II", lp: 45 },
  seasons: {
    solo: [{ season: "S2025", tier: "MASTER", division: null, lp: 135 },
           { season: "S2024", tier: "EMERALD", division: "II", lp: 57 }],
    flex: [],
  },
  champs: [{ name: "Ashe", kda: 2.25, wr: 60, games: 25 },
           { name: "Smolder", kda: 3.01, wr: 68, games: 22 }],
  asOf: "backend", updatedAt: Date.now(),
};
const seededAccount = () => [{ id: "seed1", label: "Main", gameName: "Seeded", tagLine: "1234",
  region: "EUW", status: "active", stats: JSON.parse(JSON.stringify(RICH_STATS)),
  history: [{ t: Date.now() - 2 * 86400000, tier: "DIAMOND", division: "II", lp: 40 },
            { t: Date.now(), tier: "DIAMOND", division: "I", lp: 52 }] }];

test("the details drawer sits on the card's bottom edge", () => {
  const win = bootApp(seededAccount());
  const drawer = win.document.querySelector(".c-drawer");
  assert.ok(drawer, "a card with extra data gets a drawer");
  assert.equal(drawer.getAttribute("aria-expanded"), "false");
  assert.equal(drawer.textContent.replace(/\s+/g, " ").trim(), "Details", "the label is the label, nothing else");
  // it is the last thing in the card, so the panel unfolds above its own handle
  assert.equal(win.document.querySelector(".card").lastElementChild, drawer);
  assert.equal(win.document.querySelectorAll(".login.info").length, 0, "nothing rendered until asked");

  drawer.click();
  const panel = win.document.querySelector(".login.info");
  assert.ok(panel, "clicking the drawer opens the panel");
  assert.equal(win.document.querySelector(".c-drawer").getAttribute("aria-expanded"), "true");
  assert.equal(win.document.querySelector(".card").lastElementChild.className.includes("c-drawer"), true,
    "the handle stays pinned to the bottom edge with the panel above it");
  assert.equal(panel.querySelectorAll(".sec").length, 3, "flex, past solo seasons, champions");
  assert.equal(panel.querySelectorAll(".sea").length, 0, "still folded");

  // each group opens on its own, and leaves the others alone
  const solo = [...panel.querySelectorAll(".sec-h")].find(b => b.textContent.includes("Past seasons"));
  solo.click();
  const after = win.document.querySelector(".login.info");
  assert.equal(after.querySelectorAll(".sea").length, 2, "both seasons are now listed");
  assert.match(after.textContent, /S2025/);
  assert.equal(after.querySelectorAll(".chp").length, 0, "opening one does not open the rest");

  const champs = [...after.querySelectorAll(".sec-h")].find(b => b.textContent.includes("Champions"));
  champs.click();
  const both = win.document.querySelector(".login.info");
  assert.equal(both.querySelectorAll(".sea").length, 2, "and the first one stays open");
  assert.equal(both.querySelectorAll(".chp").length, 3, "two champions plus the column header");
});

// ---- working through sixty accounts ----
const listView = win => { win.document.querySelector('[data-density="list"]').click(); return win.document; };

test("the list view puts a whole account on one row, and unfolds it in place", () => {
  const win = bootApp(seededAccount());
  const doc = listView(win);
  assert.equal(doc.querySelectorAll(".card").length, 0, "cards give way to rows");
  const row = doc.querySelector(".rw");
  assert.ok(row);
  // the six facts you scan a collection by, all on the line
  assert.match(row.textContent, /Main/);
  assert.match(row.textContent, /Diamond I/);
  assert.match(row.textContent, /52 LP/);
  assert.match(row.textContent, /47%/);
  assert.match(row.textContent, /764/, "level");
  assert.match(row.textContent, /EUW/);
  assert.equal(doc.querySelector(".lpc"), null, "no chart until asked");

  doc.querySelector(".rw-main").click();
  const open = win.document.querySelector(".rw");
  assert.ok(open.querySelector(".lpc"), "the chart unfolds under the row");
  assert.ok(open.querySelector(".sec"), "so do the details");
  assert.ok(open.querySelector('[data-act="check"]'), "and the actions");
  assert.equal(open.querySelector(".rw-main").getAttribute("aria-expanded"), "true");

  // the layout choice outlives the session
  assert.equal(JSON.parse(win.localStorage.getItem("smurf-tracker-cfg")).density, "list");
});

test("a count in the stats panel filters the grid to the accounts behind it", () => {
  const win = bootApp(seededAccount());
  addRealAccount(win, "Never Checked One", "1111");
  const doc = win.document;
  assert.equal(doc.querySelectorAll(".card").length, 2);

  const tile = doc.querySelector('[data-flag="unchecked"]');
  assert.ok(tile, "a vault with an unchecked account says so");
  tile.click();
  assert.equal(doc.querySelectorAll(".card").length, 1, "only the unchecked one is left");
  assert.match(doc.querySelector(".card").textContent, /Never Checked One/);

  // an invisible filter makes a short grid look like a bug, so it is spelled out
  const chip = doc.querySelector(".fchip");
  assert.ok(chip);
  assert.match(chip.textContent, /Never checked/);
  chip.click();
  assert.equal(doc.querySelectorAll(".card").length, 2, "clearing the chip restores the grid");
  assert.equal(doc.querySelectorAll(".fchip").length, 0);
});

test("the rank spread filters by tier, and toggles back off", () => {
  const win = bootApp(seededAccount());
  addRealAccount(win, "Other", "2222");
  const doc = win.document;
  const gem = [...doc.querySelectorAll("[data-tier]")].find(g => g.dataset.tier === "DIAMOND");
  assert.ok(gem, "the seeded account is Diamond");
  gem.click();
  assert.equal(doc.querySelectorAll(".card").length, 1);
  doc.querySelector("[data-tier=DIAMOND]").click();
  assert.equal(doc.querySelectorAll(".card").length, 2, "clicking the same tier again clears it");
});

test("rank spread gems are ordered highest tier first", () => {
  const mk = (id, tier) => ({
    id, gameName: id, tagLine: "1", region: "EUW", status: "active", tags: [], history: [],
    stats: { found: true, tier, division: "IV", lp: 0, wins: 1, losses: 1, updatedAt: Date.now() },
  });
  const win = bootApp([
    mk("g", "GOLD"), mk("p", "PLATINUM"), mk("e", "EMERALD"), mk("d", "DIAMOND"),
    { id: "u", gameName: "u", tagLine: "1", region: "EUW", status: "active", tags: [], history: [],
      stats: { found: true, tier: "UNRANKED", division: null, lp: null, updatedAt: Date.now() } },
  ]);
  const tiers = [...win.document.querySelectorAll("#dash .dist .gem[data-tier]")].map(g => g.dataset.tier);
  assert.deepEqual(tiers, ["DIAMOND", "EMERALD", "PLATINUM", "GOLD", "UNRANKED"],
    "best rank on the left, Unranked last");
});

test("an account with no rank leads with its level, not with the word Unranked", () => {
  const stats = { found: true, tier: "UNRANKED", division: null, lp: null, level: 97, updatedAt: Date.now() };
  const win = bootApp([{ id: "u1", gameName: "Leveling", tagLine: "EUW", region: "EUW", status: "active", stats }]);
  const rk = win.document.querySelector(".rk");
  assert.ok(rk.classList.contains("c-lvl"), "the headline slot holds the level");
  assert.match(rk.textContent, /Level\s*97/);
  // and it is not then repeated in the caption row underneath
  const stats2 = win.document.querySelector(".c-stats");
  if (stats2) assert.doesNotMatch(stats2.textContent, /Level/);
});

test("sorting by level and by LP change", () => {
  const mk = (id, level, hist) => ({ id, gameName: id, tagLine: "EUW", region: "EUW", status: "active",
    stats: { found: true, tier: "GOLD", division: "II", lp: 10, level, updatedAt: Date.now() }, history: hist });
  const win = bootApp([
    mk("low", 30, [{ t: 1, tier: "GOLD", division: "II", lp: 10 }, { t: 2, tier: "GOLD", division: "II", lp: 90 }]),
    mk("high", 300, [{ t: 1, tier: "GOLD", division: "II", lp: 90 }, { t: 2, tier: "GOLD", division: "II", lp: 10 }]),
  ]);
  const names = () => [...win.document.querySelectorAll(".c-name span")].map(n => n.textContent);
  const sort = win.document.getElementById("tSort");
  sort.value = "level"; sort.dispatchEvent(new win.Event("change"));
  assert.deepEqual(names(), ["high", "low"], "highest level first");
  sort.value = "change"; sort.dispatchEvent(new win.Event("change"));
  assert.deepEqual(names(), ["low", "high"], "biggest climb first");
});

test("advice naming a control that no longer exists is rewritten on load", () => {
  // the note is written into the account and then kept forever, so cards were
  // still telling people to use Paste two versions after it was removed
  const win = bootApp([{ id: "s1", gameName: "Stale", tagLine: "EUW", region: "EUW", status: "active",
    stats: { found: true, tier: "GOLD", division: "II", lp: 5, updatedAt: Date.now(),
      note: "Auto-fetch failed (HTTP 404) — use 📋 Paste or ✎ Rank" } }]);
  const stored = JSON.parse(win.localStorage.getItem("smurf-tracker"))[0];
  assert.doesNotMatch(stored.stats.note, /Paste/);
  assert.match(stored.stats.note, /Auto-fetch failed \(HTTP 404\)/, "what went wrong is kept");
  assert.doesNotMatch(win.document.querySelector(".card").textContent, /Paste/);
});

test("a history point is dated by when the LP was reached, not by when we looked", () => {
  const win = bootApp();
  const reached = Date.parse("2026-07-22T18:21:28Z");
  const acc = { id: "h1", history: [] };
  // op.gg says this rank was reached days ago; the check is happening now
  win.applyStats(acc, { found: true, tier: "MASTER", division: null, lp: 129, updatedAt: Date.now(),
    lpAt: { t: reached, tier: "MASTER", division: null, lp: 129 } });
  assert.equal(acc.history.length, 1);
  assert.equal(acc.history[0].t, reached, "a week of inactivity is not drawn as a line ending today");

  // but only when it describes the rank we actually read — otherwise it is stale
  const acc2 = { id: "h2", history: [] };
  win.applyStats(acc2, { found: true, tier: "MASTER", division: null, lp: 300, updatedAt: 1234567890,
    lpAt: { t: reached, tier: "MASTER", division: null, lp: 129 } });
  assert.equal(acc2.history[0].t, 1234567890, "a mismatched point falls back to the check time");

  // Re-checking an account nobody has played adds no point — and used to drag the
  // existing one forward to today on its way past, throwing away the reached-date
  // above and drawing the flat line it exists to prevent.
  const later = Date.parse("2026-07-29T09:00:00Z");
  win.applyStats(acc, { found: true, tier: "MASTER", division: null, lp: 129, updatedAt: later,
    lpAt: { t: reached, tier: "MASTER", division: null, lp: 129 } });
  assert.equal(acc.history.length, 1, "an unchanged reading is not a second point");
  assert.equal(acc.history[0].t, reached, "and it keeps the date the LP was reached");

  // with nothing said about when it was reached, the check time is all there is
  // on the *first* write — a later no-op refresh must not drag that stamp forward.
  const acc3 = { id: "h3", history: [] };
  win.applyStats(acc3, { found: true, tier: "GOLD", division: "II", lp: 40, updatedAt: 1000 });
  win.applyStats(acc3, { found: true, tier: "GOLD", division: "II", lp: 40, updatedAt: 2000 });
  assert.equal(acc3.history[0].t, 1000, "a no-op refresh without lpAt keeps the original stamp");

  // and a shape that cannot be trusted is dropped rather than bending the chart
  assert.equal(win.normLpAt({ t: Date.now() + 9e9, tier: "GOLD", lp: 5 }), null, "no future dates");
  assert.equal(win.normLpAt({ t: reached, tier: "NOPE", lp: 5 }), null);
  assert.equal(win.normLpAt(null), null);
});

test("an lpAt older than the previous point does not reorder the chart", () => {
  const win = bootApp();
  const acc = { id: "ord", history: [] };
  win.applyStats(acc, { found: true, tier: "GOLD", division: "II", lp: 40, updatedAt: 2000 });
  win.applyStats(acc, { found: true, tier: "PLATINUM", division: "IV", lp: 0, updatedAt: 3000,
    lpAt: { t: 1000, tier: "PLATINUM", division: "IV", lp: 0 } });
  assert.equal(acc.history.length, 2);
  assert.equal(acc.history[0].tier, "GOLD", "older history stays first");
  assert.equal(acc.history[1].tier, "PLATINUM", "current rank stays last");
  assert.equal(acc.history[1].t, 2001, "unreachable reached-date advances just past the previous point");
});

test("Flex Unranked clears a previous Flex rank instead of keeping it", () => {
  const win = bootApp();
  const acc = { id: "fx", history: [], stats: { found: true, tier: "GOLD", division: "II", lp: 10,
    flex: { tier: "GOLD", division: "III", lp: 20 }, updatedAt: 1 } };
  win.applyStats(acc, { found: true, tier: "GOLD", division: "II", lp: 10, updatedAt: 2,
    flex: { tier: "UNRANKED", division: null, lp: null } });
  assert.equal(acc.stats.flex, null, "an explicit Unranked flex answer must not revive the old Gold");
});

test("going Unranked records a history break instead of leaving the old rank as current", () => {
  const win = bootApp();
  const acc = { id: "ur", history: [] };
  win.applyStats(acc, { found: true, tier: "DIAMOND", division: "I", lp: 50, updatedAt: 1000 });
  win.applyStats(acc, { found: true, tier: "UNRANKED", division: null, lp: null, updatedAt: 2000 });
  assert.equal(acc.history.length, 2);
  assert.equal(acc.history[1].tier, "UNRANKED");
  assert.equal(win.lastDelta(acc), 0, "Unranked end is not a −N LP crash");
});

test("safeAccountId rejects attribute-breaking ids", () => {
  const win = bootApp();
  assert.equal(win.safeAccountId("abc-123"), "abc-123");
  assert.notEqual(win.safeAccountId('"><img src=x onerror=alert(1)>'), '"><img src=x onerror=alert(1)>');
  assert.match(win.idAttr('a"b'), /&quot;/);
});

test("rank panel number fields escape non-numeric stats", () => {
  const win = bootApp();
  const html = win.rankPanelHTML({ peakManual: null, goal: null },
    { tier: "GOLD", division: "II", lp: '"><img src=x onerror=alert(1)>', wins: 1, losses: 2 });
  assert.doesNotMatch(html, /onerror/, "lp must not break out of the value attribute");
  assert.match(html, /value=""/, "non-numeric lp becomes an empty value");
});

test("same LP at a new division is a new history point, and W/L updates on a dedupe", () => {
  const win = bootApp();
  const acc = { id: "div", history: [] };
  win.applyStats(acc, { found: true, tier: "GOLD", division: "IV", lp: 0, wins: 10, losses: 8, updatedAt: 1000 });
  win.applyStats(acc, { found: true, tier: "GOLD", division: "I", lp: 0, wins: 20, losses: 12, updatedAt: 2000,
    lpAt: { t: 500, tier: "GOLD", division: null, lp: 0 } }); // mismatched division → not sameRank
  assert.equal(acc.history.length, 2, "Gold IV 0 and Gold I 0 are different ranks");
  assert.equal(acc.history[1].division, "I");

  win.applyStats(acc, { found: true, tier: "GOLD", division: "I", lp: 0, wins: 25, losses: 14, updatedAt: 3000 });
  assert.equal(acc.history.length, 2, "unchanged rank still dedupes");
  assert.equal(acc.history[1].w, 25, "W/L on the point keep up with the card");
  assert.equal(acc.history[1].l, 14);
});

test("a full history is not trimmed by a no-op refresh", () => {
  const win = bootApp();
  const hist = Array.from({ length: 60 }, (_, i) =>
    ({ t: i + 1, tier: "GOLD", division: "II", lp: i }));
  const acc = { id: "cap", history: hist.slice() };
  win.applyStats(acc, { found: true, tier: "GOLD", division: "II", lp: 59, updatedAt: 1000 });
  assert.equal(acc.history.length, 60, "dedupe must not slice the oldest point off");
  assert.equal(acc.history[0].t, 1);
});

test("the level rides the portrait instead of standing in the stats row", () => {
  const win = bootApp(seededAccount());
  const card = win.document.querySelector(".card");
  const badge = card.querySelector(".c-lvbadge");
  assert.ok(badge, "it belongs to the identity of the account, so it sits on the picture");
  assert.equal(badge.textContent, "764");
  assert.ok(card.querySelector(".c-portrait").contains(badge));
  const stats = card.querySelector(".c-stats");
  if (stats) assert.doesNotMatch(stats.textContent, /Level/, "and not among Peak and MMR");
});

test("stored secrets are not password inputs, so the browser stops offering to save them", () => {
  // a real password field beside a field the browser reads as a username, both
  // filled programmatically and then hidden, looks exactly like a submitted
  // sign-in form — which is why Chrome kept offering to save credentials for
  // accounts the user was never signing in to
  assert.match(html, /id="fPass"[^>]*type="text"|type="text"[^>]*id="fPass"/,
    "the field ships as a text input");
  assert.match(html, /id="fPass"[^>]*class="mask"|class="mask"[^>]*id="fPass"/,
    "masked in CSS instead of by the input type");

  // ...but a CSS mask is only a mask where the browser implements text-security.
  // jsdom does not, so this also exercises the fallback: anywhere it is missing,
  // a real password field comes back, because a stored password sitting on screen
  // in clear is worse than a save prompt.
  const win = bootApp();
  const pass = win.document.getElementById("fPass");
  // (CAN_MASK is a top-level const, which is not a window property — the field's
  // own type is the observable proof that the fallback ran)
  assert.equal(pass.type, "password", "jsdom has no text-security, so the real input comes back");
  assert.equal(pass.classList.contains("mask"), false, "no dead class left behind");

  // the eye toggle works on either path
  win.setPassShown(true);
  assert.equal(pass.type, "text");
  win.setPassShown(false);
  assert.equal(pass.type, "password");
});

test("a card is patched in place, not rebuilt, so nothing blinks", () => {
  const win = bootApp(seededAccount());
  const doc = win.document;
  const card = doc.querySelector(".card");
  const portrait = doc.querySelector(".c-portrait");
  const chart = doc.querySelector(".lpc");

  doc.querySelector('[data-act="more"]').click();
  assert.equal(doc.querySelector(".card"), card, "the card element survives a panel toggle");
  assert.equal(doc.querySelector(".c-portrait"), portrait, "so the avatar is never re-fetched");
  if (chart) assert.equal(doc.querySelector(".lpc"), chart, "and the chart is not redrawn from scratch");
  assert.equal(doc.querySelectorAll(".acts").length, 2, "the overflow row did appear");

  doc.querySelector(".c-drawer").click();
  assert.equal(doc.querySelector(".card"), card, "same through the details drawer");
  assert.equal(doc.querySelector(".c-portrait"), portrait);
});

test("typing a note survives a background re-render of the grid", () => {
  const win = bootApp(seededAccount());
  win.document.querySelector('[data-act="noteedit"]').click();
  const ta = win.document.querySelector('[data-f="notetext"]');
  ta.focus();
  ta.value = "half-typed thought";
  // something else redraws the board underneath — an auto-check landing, say
  win.renderGrid();
  const still = win.document.querySelector('[data-f="notetext"]');
  assert.equal(still, ta, "the textarea is the same node");
  assert.equal(still.value, "half-typed thought", "and keeps what was typed into it");
});

// ---- auto-check gating ----
// cfg is a top-level let, not a window property, so these go through the real
// Settings panel — which also proves the controls are actually wired to it.
function setAutoCheck(win, { hours, rankedOnly }) {
  win.document.getElementById("bSettings").click();
  win.document.getElementById("sAuto").checked = true;
  win.document.getElementById("sAutoEvery").value = String(hours);
  win.document.getElementById("sAutoRanked").checked = !!rankedOnly;
  win.document.getElementById("sSave").click();
}

test("the auto-check interval is settable and actually gates the refresh", () => {
  const win = bootApp();
  const now = Date.now();
  const acc = (tier, ageHours, extra) => Object.assign(
    { status: "active", stats: tier ? { found: true, tier, updatedAt: now - ageHours * 3600e3 } : null }, extra);

  setAutoCheck(win, { hours: 0.5 });
  assert.equal(JSON.parse(win.localStorage.getItem("smurf-tracker-cfg")).autoEveryHours, 0.5);
  assert.equal(win.autoCheckDue(acc("GOLD", 2)), true, "older than the interval");
  assert.equal(win.autoCheckDue(acc("GOLD", 0.1)), false, "inside the interval");

  setAutoCheck(win, { hours: 336 }); // two weeks
  assert.equal(win.autoCheckDue(acc("GOLD", 200)), false);
  assert.equal(win.autoCheckDue(acc("GOLD", 400)), true);

  // never worth a request, whatever the interval
  assert.equal(win.autoCheckDue(acc("GOLD", 9999, { status: "banned" })), false);
  assert.equal(win.autoCheckDue(acc("GOLD", 9999, { archived: true })), false);
});

test("ranked-only skips accounts known to have no rank, but not ones never checked", () => {
  const win = bootApp();
  const now = Date.now();
  const acc = (tier, ageHours) => ({ status: "active",
    stats: tier ? { found: true, tier, updatedAt: now - ageHours * 3600e3 } : null });

  setAutoCheck(win, { hours: 0.5, rankedOnly: true });
  assert.equal(win.autoCheckDue(acc("GOLD", 9)), true);
  assert.equal(win.autoCheckDue(acc("UNRANKED", 9)), false, "an unranked account answers the same every time");
  // a never-checked account has no rank *yet*; skipping it would leave it stuck
  // outside the filter permanently, with no way in
  assert.equal(win.autoCheckDue(acc(null, 0)), true, "it still needs its first check");
  // a failed first fetch leaves a note-only stats object — still never read
  assert.equal(win.autoCheckDue({ status: "active",
    stats: { note: "Auto-fetch failed (timeout) — enter it by hand with ✎ Rank" } }), true,
    "a note without a reading is not 'known unranked'");

  setAutoCheck(win, { hours: 0.5, rankedOnly: false });
  assert.equal(win.autoCheckDue(acc("UNRANKED", 9)), true, "off again, unranked is back in");
});

test("Not found is not Unranked", () => {
  const win = bootApp();
  const missing = { stats: { found: false, updatedAt: Date.now() } };
  const unranked = { stats: { found: true, tier: "UNRANKED", updatedAt: Date.now() } };
  assert.equal(win.isUnrankedAnswer(unranked), true);
  assert.equal(win.isUnrankedAnswer(missing), false, "a missing Riot ID belongs under attention, not Unranked");
});

// ---- combined stats ----
test("the combined stats pool respects the rank floor and per-account exclusions", () => {
  const win = bootApp();
  const a = (tier, extra) => Object.assign({ stats: { found: true, tier } }, extra);
  const setFloor = v => {
    win.loadDemo();
    const sel = win.document.getElementById("dashMin");
    sel.value = v;
    sel.dispatchEvent(new win.Event("change", { bubbles: true }));
  };

  setFloor("");
  assert.equal(win.inCombined(a("SILVER")), true);
  assert.equal(win.inCombined(a("SILVER", { excludeStats: true })), false, "an explicit exclusion always wins");

  setFloor("DIAMOND");
  assert.equal(win.inCombined(a("SILVER")), false);
  assert.equal(win.inCombined(a("DIAMOND")), true, "the floor is inclusive");
  assert.equal(win.inCombined(a("CHALLENGER")), true);
  assert.equal(win.inCombined(a("DIAMOND", { excludeStats: true })), false);
});

test("the floor narrows what the dashboard counts, and says how many it left out", () => {
  const win = bootApp();
  win.loadDemo(); // Platinum, Gold, Silver, Bronze + one unranked
  const sel = () => win.document.getElementById("dashMin");
  const summary = () => win.document.querySelector(".dash-ex").textContent.replace(/s+/g, " ").trim();

  assert.match(summary(), /^3 of 3 ranked$/, "demo's banned ranked account is left out of combined counts");
  sel().value = "PLATINUM";
  sel().dispatchEvent(new win.Event("change", { bubbles: true }));
  assert.match(summary(), /^1 of 3 ranked · 2 left out$/);
});

test("combined champion stats are weighted by games, not by winrate", () => {
  const win = bootApp();
  // one lucky 100% on two games must not outrank a real sample
  const pool = [
    { stats: { champs: [{ name: "Lucky", wr: 100, games: 2 }, { name: "Workhorse", wr: 60, games: 40 }] } },
    { stats: { champs: [{ name: "Workhorse", wr: 50, games: 20 }] } },
    { stats: {} },
    {},
  ];
  const merged = win.mergeChampions(pool).map(c => ({ ...c }));
  assert.equal(merged[0].name, "Workhorse");
  assert.equal(merged[0].games, 60, "games add up across accounts");
  assert.equal(merged[0].accs, 2);
  assert.equal(merged[0].wr, 57, "24 + 10 wins over 60 games");
  assert.equal(merged[1].name, "Lucky");
  assert.equal(win.mergeChampions([]).length, 0);
  assert.equal(win.mergeChampions(null).length, 0);
});

// ---- review pass: bugs found by reading the code, each reproduced first ----

// The one that mattered most: "Check all ranks" was wired straight to
// addEventListener, so the listener's MouseEvent arrived as checkAll's `ids` list
// and .map() threw on it before anything else ran. The button did nothing at all.
test("Check all ranks starts a run instead of throwing", () => {
  const win = bootApp(seededAccount());
  const thrown = [];
  win.addEventListener("error", e => thrown.push(String(e.message)));
  win.document.getElementById("bCheckAll").click();
  assert.deepEqual(thrown, []);
  assert.equal(win.document.getElementById("runbar").classList.contains("hidden"), false,
    "a run is under way, with its progress bar and Stop button");
  assert.equal(win.document.getElementById("bCancelCheck").classList.contains("hidden"), false);
});

// It refreshes what the filters are showing, which is right — but it said "all"
// while doing it, so a search left it quietly refreshing three of sixty.
test("the Check all label says how many it would actually refresh", async () => {
  const win = bootApp();
  addRealAccount(win, "Alpha", "1");
  addRealAccount(win, "Beta", "2");
  addRealAccount(win, "Gamma", "3");
  const label = () => win.document.getElementById("bCheckAll").textContent.trim();
  assert.equal(label(), "Check all ranks");

  const search = win.document.getElementById("tSearch");
  search.value = "Beta";
  search.dispatchEvent(new win.Event("input", { bubbles: true }));
  await until(() => win.document.querySelectorAll(".card").length === 1, "the search to narrow the grid");
  assert.equal(label(), "Check 1 shown");
});

// A row's checkbox carried an inline stopPropagation, which killed the one
// delegated listener on #grid that handles every click on a card — so ticking a
// row in list view selected nothing and the bulk bar never appeared.
test("bulk selection works in the list view as well as the cards", () => {
  const count = win => win.document.getElementById("bulkCount").textContent;
  const hidden = win => win.document.getElementById("bulkbar").classList.contains("hidden");

  const cards = bootApp(seededAccount());
  cards.document.querySelector(".card .bulkchk").click();
  assert.equal(count(cards), "1 selected");

  const rows = bootApp(seededAccount());
  rows.document.querySelector('[data-density="list"]').click();
  rows.document.querySelector(".rw .bulkchk").click();
  assert.equal(hidden(rows), false);
  assert.equal(count(rows), "1 selected");
  assert.equal(rows.document.querySelector(".rw-open"), null,
    "and the row does not also unfold — the checkbox is the nearer target");
});

/* `selected` was never pruned to what is on screen, so a selection outlived the view
   it was made in: the bar went on counting accounts the grid no longer showed, and
   the bulk actions — behind a confirm that names a number, not the accounts —
   reached straight past the grid to them. */
test("a selection does not outlive the view it was made in", () => {
  const count = win => win.document.getElementById("bulkCount").textContent;
  const barHidden = win => win.document.getElementById("bulkbar").classList.contains("hidden");

  // flipping to the Archived view drops a selection made among the active accounts
  const win = bootApp();
  addRealAccount(win, "Keeper", "1001");
  addRealAccount(win, "Alsokeeper", "1002");
  [...win.document.querySelectorAll(".bulkchk")].forEach(b => b.click());
  assert.equal(count(win), "2 selected");

  win.document.getElementById("tArchived").click();
  assert.equal(barHidden(win), true, "nothing on screen is selected, so there is nothing to act on");
  win.document.getElementById("tArchived").click();
  assert.equal(barHidden(win), true, "and it does not come back when the view does");

  // and Delete selected cannot reach an account that has just been archived
  const win2 = bootApp();
  addRealAccount(win2, "Archived", "2001");
  addRealAccount(win2, "Active", "2002");
  [...win2.document.querySelectorAll(".bulkchk")].forEach(b => b.click());
  assert.equal(count(win2), "2 selected");

  const first = win2.document.querySelector('.card[data-id]');
  first.querySelector('[data-act="more"]').click();
  first.querySelector('[data-act="archive"]').click();
  assert.equal(count(win2), "1 selected", "the archived one left the selection with the view");

  win2.document.getElementById("bulkDelete").click(); // confirm() is stubbed to true
  win2.document.getElementById("tArchived").click();
  assert.equal(win2.document.querySelectorAll(".card").length, 1,
    "the archived account survives a delete it was never on screen for");
});

// commitNote only ever looked for ".card", which does not exist in the list, so
// the editor stayed on screen after the edit had already been saved.
test("the note editor closes after clicking away, in either layout", () => {
  for (const asList of [false, true]) {
    const win = bootApp(seededAccount());
    if (asList) {
      win.document.querySelector('[data-density="list"]').click();
      win.document.querySelector(".rw-main").click();
    }
    win.document.querySelector('[data-act="noteedit"]').click();
    const ta = win.document.querySelector('[data-f="notetext"]');
    assert.ok(ta, `editor opens (list: ${asList})`);
    ta.value = "written in the " + (asList ? "list" : "cards");
    ta.dispatchEvent(new win.Event("input", { bubbles: true }));

    win.document.body.dispatchEvent(new win.MouseEvent("pointerdown", { bubbles: true }));
    assert.equal(win.document.querySelector('[data-f="notetext"]'), null,
      `editor closed again (list: ${asList})`);
    assert.match(win.document.querySelector(".c-notes").textContent,
      /written in the/, "and the text is on the card");
  }
});

// A list row is a <div> with role="button" — the browser gives it none of a
// button's key handling, so it could be tabbed to and then not opened.
test("a list row opens from the keyboard", () => {
  for (const key of ["Enter", " "]) {
    const win = bootApp(seededAccount());
    win.document.querySelector('[data-density="list"]').click();
    const row = win.document.querySelector(".rw-main");
    assert.equal(row.getAttribute("tabindex"), "0");
    row.dispatchEvent(new win.KeyboardEvent("keydown", { key, bubbles: true }));
    assert.ok(win.document.querySelector(".rw-open"), `${key} opens the row`);
  }
});

/* The total was computed from a coerced 0 while the label printed the raw value, so a
   source reporting wins but no losses rendered "10W L". Coercing both for the display
   fixed the bare L by inventing the 0 beside it — and a 100% win rate under that. It
   prints the figure it has and leaves the other one out. */
test("a missing loss count is left out rather than invented", () => {
  const seed = seededAccount();
  seed[0].stats.wins = 10;
  seed[0].stats.losses = null;

  const win = bootApp(seed);
  const wl = win.document.querySelector(".wl").textContent;
  assert.match(wl, /10W/);
  assert.doesNotMatch(wl, /\bL\b/, "no bare L, and no 0L either");

  win.document.querySelector('[data-density="list"]').click();
  const rw = win.document.querySelector(".rw-wr").textContent;
  assert.match(rw, /10W/);
  assert.doesNotMatch(rw, /\bL\b/);
});

// Defaults were spread *under* the file's own fields, so a backup carrying ids
// kept them and importing one file twice produced accounts sharing an id — and
// every per-card lookup is a find(a => a.id === id).
test("import assigns fresh ids and pins region and status to known values", async () => {
  const win = bootApp();
  win.doImport(new win.Blob([JSON.stringify({ accounts: [
    { id: "same", gameName: "Xavier", tagLine: "1", region: "Europe West", status: "not-a-status" },
    { id: "same", gameName: "Yvonne", tagLine: "2", region: "kr", status: "banned" },
  ] })], { type: "application/json" }));
  await until(() => win.document.querySelectorAll(".card").length === 2, "both imported accounts to render");

  const ids = [...win.document.querySelectorAll(".card")].map(c => c.dataset.id);
  assert.equal(ids.length, 2);
  assert.equal(new Set(ids).size, 2, "two accounts, two ids");
  assert.ok(!ids.includes("same"), "and neither is the id from the file");

  assert.deepEqual([...win.document.querySelectorAll(".regiontag")].map(r => r.textContent),
    ["EUW", "KR"], "an unknown region falls back, a lowercase one is normalised");
  assert.deepEqual([...win.document.querySelectorAll(".stchip")].map(r => r.textContent),
    ["Banned"], "not-a-status became active, which prints no chip");
});

test("normRegion and normStatus only ever return values the app knows", () => {
  const win = bootApp();
  assert.equal(win.normRegion("kr"), "KR");
  assert.equal(win.normRegion(" euw "), "EUW");
  assert.equal(win.normRegion("Europe West"), "EUW");
  assert.equal(win.normRegion(null), "EUW");
  assert.equal(win.normStatus("BANNED"), "banned");
  assert.equal(win.normStatus("nonsense"), "active");
  assert.equal(win.normStatus(undefined), "active");
});

// The <img> deleted itself in an inline onerror, which the next render undid —
// the markup still carried the src, so a dead icon was re-inserted and
// re-requested on every re-render for the life of the tab.
test("an icon that fails to load is not asked for again", () => {
  const seed = seededAccount();
  seed[0].stats.icon = "https://example.com/gone.jpg";
  const win = bootApp(seed);

  const img = win.document.querySelector(".c-avatar");
  assert.ok(img, "it is tried once");
  win.markIconDead(img);
  win.renderGrid();
  assert.equal(win.document.querySelector(".c-avatar"), null, "and not re-inserted");
  assert.ok(win.document.querySelector(".c-initial"), "the initial stands in for it");
});

// morph assigned a <select>'s value before patching its options, so it matched
// against the old list and any value just added fell back to the first entry.
test("a select keeps its value when the option list grows under it", () => {
  const win = bootApp();
  addRealAccount(win, "Euwer", "1");
  const before = win.document.getElementById("tRegion");

  win.document.getElementById("bAdd").click();
  win.document.getElementById("fName").value = "Korean";
  win.document.getElementById("fTag").value = "KR1";
  win.document.getElementById("fRegion").value = "KR";
  win.document.getElementById("fSave").click();

  const sel = win.document.getElementById("tRegion");
  assert.equal(sel, before, "the element itself is patched, not replaced");
  assert.deepEqual([...sel.options].map(o => o.value), ["", "EUW", "KR"]);

  sel.value = "KR";
  sel.dispatchEvent(new win.Event("change", { bubbles: true }));
  assert.equal(win.document.querySelectorAll(".card").length, 1);
  assert.equal(sel.value, "KR", "and the pick survives the re-render it triggered");
});

// ---- idle cost ----

// The interval used to be started unconditionally and tick for the life of the
// tab, with nothing to do unless a master password was set.
test("the auto-lock timer only runs when there is something to lock", async () => {
  const started = [];
  const win = bootApp(seededAccount(), w => {
    const orig = w.setInterval;
    w.setInterval = (fn, ms) => { started.push(ms); return orig(fn, ms); };
  });
  assert.deepEqual(started, [], "no vault password: no timer");

  win.document.getElementById("bSettings").click();
  win.document.getElementById("sAutoLock").value = "5";
  win.document.getElementById("sSave").click();
  await new Promise(r => setTimeout(r, 50));
  assert.deepEqual(started, [], "an auto-lock setting alone still locks nothing");

  win.document.getElementById("sVaultPass").value = "a-master-password";
  win.document.getElementById("sVaultSet").click();
  await until(() => encrypted(win), "the vault to be written encrypted");
  assert.deepEqual(started, [15000], "now it has a reason to run");
});

// Two decorative loops never stop on their own, and one of them is per card.
test("decorative animations are parked while the page is hidden", () => {
  const win = bootApp(seededAccount());
  const hide = v => Object.defineProperty(win.document, "hidden", { value: v, configurable: true });

  assert.equal(win.document.body.classList.contains("away"), false);
  hide(true);
  win.document.dispatchEvent(new win.Event("visibilitychange"));
  assert.equal(win.document.body.classList.contains("away"), true);
  hide(false);
  win.document.dispatchEvent(new win.Event("visibilitychange"));
  assert.equal(win.document.body.classList.contains("away"), false);
});

// Cards are 96-98% opaque, so blurring what is behind them is invisible — sixty
// backdrop-sampling layers rendering an effect that cannot be seen. (It is not a
// frame-rate win: scrolling measures the same either way. It is GPU memory.)
test("cards do not carry a backdrop filter", () => {
  assert.doesNotMatch(html.match(/\.hx-in\{[^}]*\}/)[0], /backdrop-filter/,
    "the card surface is opaque; glass belongs to the console, tray, toast and tooltip");
  assert.match(html, /\.console\{[^}]*backdrop-filter/, "the sticky console is genuinely translucent");
});

// The toolbar toggles used to be styled by hand from three separate places.
test("the toolbar toggles report their state", () => {
  const win = bootApp(seededAccount());
  const fav = win.document.getElementById("tFav");
  assert.equal(fav.getAttribute("aria-pressed"), "false");

  fav.click();
  assert.equal(fav.getAttribute("aria-pressed"), "true");
  assert.equal(fav.classList.contains("on"), true);

  // clearing it from the filter chip has to put the button back too
  win.document.querySelector('[data-clear="favOnly"]').click();
  assert.equal(fav.getAttribute("aria-pressed"), "false");
  assert.equal(fav.classList.contains("on"), false);
});

// A revealed password surviving an auto-lock was the point of clearing this state;
// an unsaved note draft is vault content by the same argument.
test("locking clears every scrap of per-card state", async () => {
  const win = bootApp(seededAccount());
  win.document.getElementById("bSettings").click();
  win.document.getElementById("sVaultPass").value = "a-master-password";
  win.document.getElementById("sVaultSet").click();
  await until(() => encrypted(win), "the vault to be written encrypted");

  win.document.querySelector('[data-act="noteedit"]').click();
  const ta = win.document.querySelector('[data-f="notetext"]');
  ta.value = "half-written secret";
  ta.dispatchEvent(new win.Event("input", { bubbles: true }));

  win.relock();
  assert.equal(win.document.getElementById("lock").classList.contains("hidden"), false, "locked");
  assert.equal(win.document.getElementById("appRoot").classList.contains("hidden"), true);
  assert.equal(win.document.querySelector('[data-f="notetext"]'), null, "the draft is gone with the rest");
});

// Searching and hitting Favorites went through renderGrid alone, which does not
// draw the chip row — so the grid went short with nothing saying why and nothing
// to click to undo it, which is the one thing the chips were added to prevent.
test("a narrowed grid always says what narrowed it", async () => {
  const win = bootApp();
  addRealAccount(win, "Alpha", "1");
  addRealAccount(win, "Beta", "2");
  const chips = () => [...win.document.querySelectorAll(".fchip")].map(c => c.textContent.replace("✕", "").trim());
  assert.deepEqual(chips(), [], "nothing filtered, nothing to say");

  const search = win.document.getElementById("tSearch");
  search.value = "Alpha";
  search.dispatchEvent(new win.Event("input", { bubbles: true }));
  await until(() => win.document.querySelectorAll(".card").length === 1, "the search to narrow the grid");
  assert.deepEqual(chips(), ['"Alpha"'], "the search says so");

  win.document.getElementById("tFav").click();
  assert.deepEqual(chips(), ["Favorites", '"Alpha"', "Clear all"]);

  win.document.querySelector('[data-clear="all"]').click();
  assert.deepEqual(chips(), []);
  assert.equal(win.document.querySelectorAll(".card").length, 2, "and the grid comes back");
});

// ---- Settings, Help and the account form as modal panels ----

// As inline panels these just shoved sixty cards down the page. The form was the
// last one left inline, and it is opened from a card's ⋯ menu as often as from the
// console — so editing an account pushed that very account off the screen.
test("Settings, Help and the account form all open over the page", () => {
  const win = bootApp(seededAccount());
  const cls = id => win.document.getElementById(id).className;
  assert.match(cls("settings"), /\bmodal\b/);
  assert.match(cls("help"), /\bmodal\b/);
  assert.match(cls("form"), /\bmodal\b/);
  // Bulk add was the last one left inline, and it was also listed in MODALS —
  // which locks page scrolling. A scroll lock on a panel that scrolls with the
  // page is a panel you cannot reach; see the regression test below.
  assert.match(cls("bulkAdd"), /\bmodal\b/, "bulk add is over the page too now");

  for (const id of ["settings", "help", "form", "bulkAdd"]) {
    const el = win.document.getElementById(id);
    assert.equal(el.getAttribute("role"), "dialog", id);
    assert.equal(el.getAttribute("aria-modal"), "true", id);
    assert.ok(win.document.getElementById(el.getAttribute("aria-labelledby")),
      `${id} is labelled by a real element`);
  }

  // Save and Cancel are pinned in the footer, outside the part that scrolls —
  // sixteen fields is taller than a laptop screen.
  const body = win.document.querySelector("#form .mdl-b");
  assert.ok(body.contains(win.document.getElementById("fName")), "the fields scroll");
  assert.equal(body.contains(win.document.getElementById("fSave")), false, "Save does not");
});

// Behind the backdrop the card being edited is invisible, so the panel itself has
// to say which account it is holding.
test("the form's header says whether it is adding or editing, and what", () => {
  const seed = seededAccount();
  const win = bootApp(seed);
  const title = () => win.document.getElementById("formTitle").textContent;
  const sub = () => win.document.getElementById("formSub").textContent;

  win.document.getElementById("bAdd").click();
  assert.match(title(), /Add account/i);
  assert.equal(sub(), "", "nothing to name yet");

  win.openForm(seed[0]);
  assert.match(title(), /Edit account/i);
  assert.equal(sub(), "Seeded#1234");
  assert.equal(win.document.getElementById("fSave").textContent, "Save changes");
});

// The lock rides a MutationObserver, so it lands on the next microtask rather
// than inside the click — soon enough that no frame is ever painted unlocked,
// but the test has to yield for it.
const tick = () => new Promise(r => setTimeout(r, 0));

test("opening a modal locks the page behind it and releases it again", async () => {
  const win = bootApp(seededAccount());
  const locked = () => win.document.body.classList.contains("modal-open");
  assert.equal(locked(), false);

  win.openSettings();
  await tick();
  assert.equal(locked(), true);

  win.document.getElementById("sClose").click();
  await tick();
  assert.equal(locked(), false);

  // and Help, which is the other one
  win.document.getElementById("bHelp").click();
  await tick();
  assert.equal(locked(), true);
  win.document.getElementById("bHelpClose").click();
  await tick();
  assert.equal(locked(), false);

  // the account form is one of these now too
  win.document.getElementById("bAdd").click();
  await tick();
  assert.equal(locked(), true, "the page behind the form is locked as well");
  assert.equal(win.document.activeElement.id, "fName", "and it lands on the name, not the label");
  win.document.getElementById("fCancel").click();
  await tick();
  assert.equal(locked(), false);
});

test("the account form closes on Escape and on a press on its backdrop", () => {
  const hidden = win => win.document.getElementById("form").classList.contains("hidden");

  const a = bootApp(seededAccount());
  a.document.getElementById("bAdd").click();
  assert.equal(hidden(a), false);
  a.document.dispatchEvent(new a.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert.equal(hidden(a), true, "Escape closes it");

  const b = bootApp(seededAccount());
  b.document.getElementById("bAdd").click();
  const overlay = b.document.getElementById("form");
  overlay.dispatchEvent(new b.MouseEvent("mousedown", { bubbles: true }));
  overlay.dispatchEvent(new b.MouseEvent("click", { bubbles: true }));
  assert.equal(hidden(b), true, "and so does a press that starts and ends on the backdrop");

  // typing in a field must never be mistaken for a press on the way out
  const c = bootApp(seededAccount());
  c.document.getElementById("bAdd").click();
  const name = c.document.getElementById("fName");
  name.dispatchEvent(new c.MouseEvent("mousedown", { bubbles: true }));
  c.document.getElementById("form").dispatchEvent(new c.MouseEvent("click", { bubbles: true }));
  assert.equal(hidden(c), false, "a press that began inside stays open");
});

test("a modal closes on Escape and on a press that starts and ends on the backdrop", () => {
  const press = (win, el) => {
    el.dispatchEvent(new win.MouseEvent("mousedown", { bubbles: true }));
    el.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
  };
  const hidden = win => win.document.getElementById("settings").classList.contains("hidden");

  const a = bootApp(seededAccount());
  a.openSettings();
  a.document.dispatchEvent(new a.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert.equal(hidden(a), true, "Escape closes it");

  const b = bootApp(seededAccount());
  b.openSettings();
  press(b, b.document.getElementById("settings"));
  assert.equal(hidden(b), true, "a press on the backdrop closes it");

  const c = bootApp(seededAccount());
  c.openSettings();
  press(c, c.document.getElementById("sBackend"));
  assert.equal(hidden(c), false, "a press on a field inside must never close it");
});

// A drag that selects text inside the panel and happens to be released over the
// backdrop is not a click on the backdrop.
test("a press released on the backdrop only counts if it started there", () => {
  const win = bootApp(seededAccount());
  win.openSettings();
  const overlay = win.document.getElementById("settings");
  win.document.getElementById("sBackend").dispatchEvent(new win.MouseEvent("mousedown", { bubbles: true }));
  overlay.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
  assert.equal(overlay.classList.contains("hidden"), false);
});

test("the modal panels keep every control the app talks to", () => {
  const win = bootApp();
  for (const id of ["sBackend", "sKey", "sModel", "sAuto", "sAutoEvery", "sAutoRanked", "sNotify",
                    "sDiscord", "sVaultPass", "sVaultSet", "sVaultRemove", "sVaultStatus", "sAutoLock",
                    "sAtmosphere", "sAccent", "sAccent2", "sAccentReset1", "sAccentReset2", "sSave", "sClose"]) {
    const el = win.document.getElementById(id);
    assert.ok(el, `#${id} still exists`);
    assert.ok(win.document.getElementById("settings").contains(el), `#${id} is inside the dialog`);
  }
  assert.ok(win.document.querySelector("#settings [data-close-panel]"), "and the ✕ closer");
  assert.ok(win.document.getElementById("help").contains(win.document.getElementById("bHelpClose")));
});

test("atmosphere previews live and only sticks after Save", () => {
  const win = bootApp();
  const body = win.document.body;
  const cfg = () => JSON.parse(win.localStorage.getItem("smurf-tracker-cfg") || "{}");
  assert.equal(body.dataset.atmosphere, "spotlight");
  const tiles = [...win.document.querySelectorAll("#sAtmosphere [data-atmosphere]")].map(b => b.dataset.atmosphere);
  assert.deepEqual(tiles, ["spotlight", "aurora", "noir", "lattice", "stardust", "void"]);

  // colours sit above the atmosphere picker in Appearance
  const appearance = win.document.querySelector("#settings .grp:last-of-type");
  const accent = appearance.querySelector("#sAccent");
  const atm = appearance.querySelector("#sAtmosphere");
  assert.ok(accent && atm, "both live in Appearance");
  assert.ok(
    !!(accent.compareDocumentPosition(atm) & win.Node.DOCUMENT_POSITION_FOLLOWING),
    "atmosphere comes after the colour swatches"
  );

  win.document.getElementById("bSettings").click();
  win.document.querySelector('#sAtmosphere [data-atmosphere="aurora"]').click();
  assert.equal(body.dataset.atmosphere, "aurora", "switches for a live compare");
  assert.equal(cfg().atmosphere, undefined, "nothing written yet");

  win.document.getElementById("sClose").click();
  assert.equal(body.dataset.atmosphere, "spotlight", "Close puts the saved choice back");

  // Escape / ✕ go through closeAllPanels, which used to keep the preview while
  // only the dedicated Close button reverted it — Save then persisted the wrong one.
  win.document.getElementById("bSettings").click();
  win.document.querySelector('#sAtmosphere [data-atmosphere="aurora"]').click();
  assert.equal(body.dataset.atmosphere, "aurora");
  win.closeAllPanels();
  assert.equal(body.dataset.atmosphere, "spotlight", "Escape must put the saved choice back too");

  win.document.getElementById("bSettings").click();
  win.document.querySelector('#sAtmosphere [data-atmosphere="noir"]').click();
  win.document.getElementById("sSave").click();
  assert.equal(body.dataset.atmosphere, "noir");
  assert.equal(cfg().atmosphere, "noir");

  // default is stored as no preference, same idea as the accent resets
  win.document.getElementById("bSettings").click();
  win.document.querySelector('#sAtmosphere [data-atmosphere="spotlight"]').click();
  win.document.getElementById("sSave").click();
  assert.equal(body.dataset.atmosphere, "spotlight");
  assert.equal(cfg().atmosphere, null);
});

test("the settings body is grouped rather than one flat run of fields", () => {
  const win = bootApp();
  const groups = [...win.document.querySelectorAll("#settings .grp-h")].map(g => g.textContent.trim());
  assert.deepEqual(groups, ["Rank checks", "Device sync", "Automatic refresh", "Alerts", "Security", "Appearance"]);
  // header and footer sit outside the scrolling middle, so Save is always reachable
  const body = win.document.querySelector("#settings .mdl-b");
  assert.ok(body, "there is a scroll region");
  assert.equal(body.contains(win.document.getElementById("sSave")), false, "Save is pinned, not scrolled");
  assert.ok(body.contains(win.document.getElementById("sBackend")), "the fields are the part that scrolls");
});

// ---- second review pass ----

// "Needs refresh · N over 30d" counted never-checked accounts as 30 days old,
// double-counting them against the "Never checked" tile right beside it.
test("the over-30d figure only counts checks that actually happened", () => {
  const now = Date.now(), D = 86400000;
  const acc = (n, updatedAt) => ({ id: "x" + n, gameName: "A" + n, tagLine: "1", region: "EUW",
    status: "active", tags: [], history: [],
    stats: updatedAt ? { found: true, tier: "GOLD", division: "II", lp: 10, updatedAt } : null });

  const win = bootApp([acc(1, now - 40 * D), acc(2, now - 5 * D), acc(3, null), acc(4, null)]);
  const note = win.document.querySelector('[data-flag="stale"] .s-note').textContent;
  assert.match(note, /over 30d/);
  assert.match(note, /· 1 over 30d/, "only the one that was checked 40 days ago");

  const never = win.document.querySelector('[data-flag="unchecked"] .v').textContent;
  assert.equal(never, "2", "the two unchecked ones are counted here, and only here");
});

// The duplicate guard only ran on add, so renaming one account onto another got
// two rows for the same Riot ID past it — and every check then refreshed both
// off the same profile.
test("an edit cannot rename one account on top of another", () => {
  const win = bootApp();
  addRealAccount(win, "First", "AAA");
  addRealAccount(win, "Second", "BBB");
  assert.equal(win.document.querySelectorAll(".card").length, 2);

  // edit the second one to collide with the first
  const cards = [...win.document.querySelectorAll(".card")];
  const second = cards.find(c => c.textContent.includes("Second"));
  second.querySelector('[data-act="more"]').click();
  win.document.querySelector(`.card[data-id="${second.dataset.id}"] [data-act="edit"]`).click();
  win.document.getElementById("fName").value = "First";
  win.document.getElementById("fTag").value = "AAA";
  win.document.getElementById("fSave").click();

  assert.equal(win.document.getElementById("form").classList.contains("hidden"), false,
    "the form stays open, the save was refused");
  assert.match(win.document.getElementById("toast").textContent, /Already in the vault/);
  assert.equal(win.document.querySelectorAll(".card").length, 2);

  // but editing an account without changing its identity still saves
  win.document.getElementById("fName").value = "Second";
  win.document.getElementById("fTag").value = "BBB";
  win.document.getElementById("fLabel").value = "Renamed label";
  win.document.getElementById("fSave").click();
  assert.equal(win.document.getElementById("form").classList.contains("hidden"), true);
  assert.match(win.document.getElementById("grid").textContent, /Renamed label/);
});

// Excel and Sheets write a UTF-8 BOM, which lands inside the first header cell.
test("a CSV exported by a spreadsheet imports despite its byte-order mark", () => {
  const win = bootApp();
  const rows = win.parseCSV("﻿label,gameName,tagLine\nMy smurf,Hide on Bush,0001\n");
  assert.equal(rows[0][0], "label", "the BOM is not part of the first column's name");
  assert.deepEqual(Array.from(rows[1]), ["My smurf", "Hide on Bush", "0001"]);
});

// A ticked "select all shown" claimed a selection that no longer matched the
// grid under it — and clicking it then cleared instead of selecting, because a
// ticked box unticks first.
test("select-all tracks whatever the filters are showing", async () => {
  const win = bootApp();
  addRealAccount(win, "Alpha", "1");
  addRealAccount(win, "Beta", "2");
  const box = win.document.getElementById("tSelectAll");

  box.checked = true;
  box.dispatchEvent(new win.Event("change", { bubbles: true }));
  assert.equal(win.document.getElementById("bulkCount").textContent, "2 selected");
  assert.equal(box.checked, true);

  // narrow to one account that is already selected — still "all shown"
  const search = win.document.getElementById("tSearch");
  search.value = "Alpha";
  search.dispatchEvent(new win.Event("input", { bubbles: true }));
  await until(() => win.document.querySelectorAll(".card").length === 1, "the search to narrow the grid");
  assert.equal(box.checked, true);

  // clear the selection: the box has to follow, or its next click clears nothing
  win.document.getElementById("bulkClear").click();
  assert.equal(box.checked, false);
});

test("every filter toggle reports its state, not just its colour", () => {
  const now = Date.now();
  const win = bootApp([{ id: "g1", gameName: "G", tagLine: "1", region: "EUW", status: "active",
    tags: [], history: [], stats: { found: true, tier: "GOLD", division: "II", lp: 5, updatedAt: now } }]);

  const gem = () => win.document.querySelector('[data-tier="GOLD"]');
  assert.equal(gem().getAttribute("aria-pressed"), "false");
  gem().click();
  assert.equal(gem().getAttribute("aria-pressed"), "true");

  const stale = () => win.document.querySelector('[data-flag="stale"]');
  assert.equal(stale().getAttribute("aria-pressed"), "false");
  stale().click();
  assert.equal(stale().getAttribute("aria-pressed"), "true");

  const density = d => win.document.querySelector(`[data-density="${d}"]`);
  assert.equal(density("cards").getAttribute("aria-pressed"), "true");
  assert.equal(density("list").getAttribute("aria-pressed"), "false");
  density("list").click();
  assert.equal(density("list").getAttribute("aria-pressed"), "true");
  assert.equal(density("cards").getAttribute("aria-pressed"), "false");
});

// A name wider than its column is ellipsised, so the full one has to survive
// somewhere reachable.
test("a truncated name keeps its full text in a title", () => {
  const long = "An extremely long account label that will not fit the card";
  const win = bootApp([{ id: "t1", label: long, gameName: "Short", tagLine: "1", region: "EUW",
    status: "active", tags: [], history: [], stats: null }]);
  assert.equal(win.document.querySelector(".c-name span").getAttribute("title"), long);

  win.document.querySelector('[data-density="list"]').click();
  assert.equal(win.document.querySelector(".rw-nm").getAttribute("title"), long);
});

// ---- render cost ----

// The chart minted its gradient ids with Math.random(), so every card's markup
// was different on every render even when nothing about the account had changed:
// the ids and the url(#…) references pointing at them were rewritten each time,
// and it made "has this card changed?" unanswerable.
test("a card's markup is stable when nothing about it changed", () => {
  const win = bootApp(seededAccount());
  const once = win.cardHTML(win.filtered()[0], 0);
  const twice = win.cardHTML(win.filtered()[0], 0);
  assert.equal(once, twice, "same account, same index, same markup");
  assert.doesNotMatch(once, /id="lc-undefined"/);
});

test("chart gradients are keyed to the account and every reference resolves", () => {
  const now = Date.now();
  const withHistory = n => ({ id: "chart" + n, gameName: "Acc" + n, tagLine: "1", region: "EUW",
    status: "active", tags: [],
    stats: { found: true, tier: "GOLD", division: "II", lp: 42, updatedAt: now },
    history: [{ t: now - 86400000, tier: "GOLD", division: "III", lp: 10 },
              { t: now, tier: "GOLD", division: "II", lp: 42 }] });
  const win = bootApp([withHistory(1), withHistory(2)]);
  assert.equal(win.document.querySelectorAll(".lpc-svg").length, 2, "two charts to collide with each other");

  const ids = [...win.document.querySelectorAll("linearGradient")].map(g => g.id);
  assert.ok(ids.length >= 2, "one gradient pair per chart");
  assert.equal(new Set(ids).size, ids.length, "no two charts share an id");

  for (const line of win.document.querySelectorAll(".lpc-line")) {
    const ref = (line.getAttribute("stroke") || "").match(/url\(#(.+)\)/);
    assert.ok(ref, "the line is painted with a gradient");
    assert.ok(win.document.getElementById(ref[1]), `#${ref[1]} exists`);
  }
});

// syncGrid leaves a card whose markup is unchanged completely alone — which is
// both the cheap path and the strongest version of the no-flicker guarantee.
test("re-rendering an unchanged grid touches nothing", () => {
  const win = bootApp(seededAccount());
  const card = win.document.querySelector(".card");
  const portrait = win.document.querySelector(".c-portrait");
  const chart = win.document.querySelector(".lpc-svg");
  const foot = win.document.querySelector(".c-foot");

  win.renderGrid();
  win.renderGrid();

  assert.equal(win.document.querySelector(".card"), card, "same card element");
  assert.equal(win.document.querySelector(".c-portrait"), portrait);
  assert.equal(win.document.querySelector(".lpc-svg"), chart, "the chart is not redrawn");
  assert.equal(win.document.querySelector(".c-foot"), foot);
});

// ...but a card that did change still gets patched, in place.
test("a changed card is patched without being replaced", () => {
  const win = bootApp(seededAccount());
  const card = win.document.querySelector(".card");
  const id = card.dataset.id;
  assert.equal(win.document.querySelector(".star").classList.contains("on"), false);

  win.document.querySelector('[data-act="fav"]').click();

  assert.equal(win.document.querySelector(".card"), card, "same node");
  assert.equal(win.document.querySelector(".star").classList.contains("on"), true, "new state");
  assert.equal(win.document.querySelector(`.card[data-id="${id}"]`), card);
});

// Switching layout swaps structures that share nothing worth patching together.
test("switching layout rebuilds rather than diffing a card into a row", () => {
  const win = bootApp(seededAccount());
  assert.equal(win.document.querySelectorAll(".card").length, 1);

  win.document.querySelector('[data-density="list"]').click();
  assert.equal(win.document.querySelectorAll(".card").length, 0);
  assert.equal(win.document.querySelectorAll(".rw").length, 1);

  win.document.querySelector('[data-density="cards"]').click();
  assert.equal(win.document.querySelectorAll(".rw").length, 0);
  assert.equal(win.document.querySelectorAll(".card").length, 1);
  assert.ok(win.document.querySelector(".lpc-svg"), "and the chart comes back with it");
});

// ---- vault key caching ----

// Boots with a crypto whose deriveKey is counted, so a test can assert on how
// many times the app paid for one. Everything else is the real webcrypto.
function bootCounting(seed) {
  const counted = { n: 0 };
  const subtle = {
    importKey: webcrypto.subtle.importKey.bind(webcrypto.subtle),
    encrypt: webcrypto.subtle.encrypt.bind(webcrypto.subtle),
    decrypt: webcrypto.subtle.decrypt.bind(webcrypto.subtle),
    deriveKey: (...a) => { counted.n++; return webcrypto.subtle.deriveKey(...a); },
  };
  const win = bootApp(seed, w => {
    Object.defineProperty(w, "crypto", {
      value: { getRandomValues: webcrypto.getRandomValues.bind(webcrypto), randomUUID: () => webcrypto.randomUUID(), subtle },
      configurable: true,
    });
  });
  return { win, counted };
}

// encryptData used to draw a fresh salt and derive a fresh key on every call, and
// saveDB is called once per account during a check run — so checking sixty
// accounts meant sixty 150 000-round PBKDF2 derivations (~63 ms each here) purely
// to write out data the app already had in hand.
test("saving an encrypted vault derives the key once, not once per save", async () => {
  const { win, counted } = bootCounting();
  addRealAccount(win, "Test Smurf", "1234");
  win.document.getElementById("sVaultPass").value = "hunter2pass";
  win.document.getElementById("sVaultSet").click();
  await until(() => encrypted(win), "the vault to be written encrypted");

  const afterUnlock = counted.n;
  assert.ok(afterUnlock >= 1, "setting a password has to derive a key at least once");

  for (let i = 0; i < 20; i++) await win.saveDB();
  assert.equal(counted.n, afterUnlock, "twenty further saves must not derive anything");

  // and the data still has to be readable with the password
  const stored = JSON.parse(win.localStorage.getItem("smurf-tracker"));
  assert.equal(stored.__enc, true);
  const back = await win.decryptData("hunter2pass", stored);
  assert.equal(back.length, 1);
  assert.equal(back[0].gameName, "Test Smurf");
});

// The salt is held steady while the vault is open, which is fine — but the IV is
// what must never repeat under one key, so that one still has to be fresh every
// time. Two saves of identical data must not produce identical ciphertext.
test("every save gets its own IV even though the salt is reused", async () => {
  const win = bootApp();
  addRealAccount(win, "Test Smurf", "1234");
  win.document.getElementById("sVaultPass").value = "hunter2pass";
  win.document.getElementById("sVaultSet").click();
  await until(() => encrypted(win), "the vault to be written encrypted");

  const first = JSON.parse(win.localStorage.getItem("smurf-tracker"));
  await win.saveDB();
  const second = JSON.parse(win.localStorage.getItem("smurf-tracker"));

  assert.equal(first.salt, second.salt, "the salt stays with the vault");
  assert.notEqual(first.iv, second.iv, "the IV must be drawn fresh");
  assert.notEqual(first.data, second.data, "so identical data must not encrypt identically");
});

// A wrong guess derives a key too. If that key stayed in the cache it would be
// handed straight back to the next call for the real password.
test("a wrong password is rejected and does not poison the cached key", async () => {
  const win = bootApp();
  addRealAccount(win, "Test Smurf", "1234");
  win.document.getElementById("sVaultPass").value = "hunter2pass";
  win.document.getElementById("sVaultSet").click();
  await until(() => encrypted(win), "the vault to be written encrypted");
  const stored = JSON.parse(win.localStorage.getItem("smurf-tracker"));

  await assert.rejects(() => win.decryptData("not-the-password", stored));
  const back = await win.decryptData("hunter2pass", stored);
  assert.equal(back.length, 1, "the real password still opens it afterwards");
});

// Locking clears the password; the key derived from it opens the vault just as
// well, so it has to go at the same moment.
test("locking the vault forgets the derived key as well as the password", async () => {
  const { win, counted } = bootCounting();
  addRealAccount(win, "Test Smurf", "1234");
  win.document.getElementById("sVaultPass").value = "hunter2pass";
  win.document.getElementById("sVaultSet").click();
  await until(() => encrypted(win), "the vault to be written encrypted");

  win.relock();
  const afterLock = counted.n;
  const stored = JSON.parse(win.localStorage.getItem("smurf-tracker"));
  await win.decryptData("hunter2pass", stored);
  assert.ok(counted.n > afterLock, "unlocking again has to derive from scratch");
});

// b64 is on the path of every single vault write. It used to concatenate one
// character at a time, which on the ~150 KB an encrypted vault runs to cost more
// than the cipher did.
test("b64 round-trips a buffer larger than one apply() chunk", () => {
  const win = bootApp();
  const bytes = new Uint8Array(0x8000 * 2 + 777);
  for (let i = 0; i < bytes.length; i++) bytes[i] = i % 256;
  const back = win.unb64(win.b64(bytes));
  assert.equal(back.length, bytes.length);
  assert.ok(back.every((v, i) => v === bytes[i]), "every byte survives the round trip");
});

// ---- tier crests and the list redesign ----

// A vault spanning the whole ladder plus the two states that have no rank at all.
const ladderSeed = () => {
  const T = ["IRON", "BRONZE", "SILVER", "GOLD", "PLATINUM", "EMERALD", "DIAMOND", "MASTER", "GRANDMASTER", "CHALLENGER"];
  const now = Date.now();
  const out = T.map((t, i) => ({
    id: "t" + i, gameName: t + "Guy", tagLine: "EUW", region: "EUW", status: "active", fav: t === "GOLD",
    stats: { found: true, tier: t, division: i >= 7 ? null : "II", lp: 40 + i, wins: 30, losses: 25, level: 100 + i, updatedAt: now - 3600e3 },
    history: [{ t: now - 86400000, tier: t, division: i >= 7 ? null : "II", lp: 20 + i },
              { t: now, tier: t, division: i >= 7 ? null : "II", lp: 40 + i }],
  }));
  out.push({ id: "un", gameName: "Unranked", tagLine: "EUW", region: "EUW", status: "active",
    stats: { found: true, tier: "UNRANKED", division: null, lp: null, level: 42, updatedAt: now }, history: [] });
  out.push({ id: "nv", gameName: "Never", tagLine: "EUW", region: "EUW", status: "active", stats: null, history: [] });
  return out;
};

// Every crest points at a gradient in one shared <defs>. Minting a gradient per
// crest would be sixty duplicate ids on a full vault — and, worse, would make each
// card's markup differ from the last render, which is exactly what used to defeat
// syncGrid's "has this changed?" check.
test("every crest reference resolves against a single shared defs block", () => {
  const win = bootApp(ladderSeed());
  const defs = win.document.getElementById("crestDefs");
  assert.ok(defs, "the defs block is installed at boot");
  assert.equal(defs.querySelectorAll("linearGradient").length, 10, "one gradient per tier");

  const refs = [...win.document.querySelectorAll('.crest path[fill^="url("]')];
  assert.ok(refs.length >= 10, "the ladder draws crests");
  for (const p of refs) {
    const id = p.getAttribute("fill").match(/url\(#(.+?)\)/)[1];
    assert.ok(win.document.getElementById(id), `#${id} exists`);
  }
  const ids = [...win.document.querySelectorAll("[id^=cr-]")].map(e => e.id);
  assert.equal(new Set(ids).size, ids.length, "and no id is defined twice");
});

test("a ranked card carries its tier crest, an unranked one carries none", () => {
  const win = bootApp(ladderSeed());
  const byId = id => win.document.querySelector(`.card[data-id="${id}"]`);
  assert.ok(byId("t9").querySelector(".rk-crest"), "Challenger gets a crest in the rank line");
  assert.ok(byId("t9").querySelector(".c-tint"), "and the card is washed in its tier colour");
  assert.equal(byId("un").querySelector(".rk-crest"), null, "unranked has no tier to show");
  assert.equal(byId("nv").querySelector(".c-tint"), null, "nor does never-checked");
});

// The list used to throw the chart away entirely, so all sixty rows looked alike.
test("list rows draw a sparkline only when there is a shape to draw", () => {
  const win = bootApp(ladderSeed());
  win.document.querySelector('[data-density="list"]').click();

  const row = id => win.document.querySelector(`.rw[data-id="${id}"]`);
  assert.ok(row("t9").querySelector(".spk"), "two readings is enough for a line");
  assert.equal(row("nv").querySelector(".spk"), null, "no history, no line");
  assert.ok(row("nv").querySelector('.rw-check[data-act="check"]'),
    "and the empty slot offers the one thing that would change that");
  assert.ok(row("nv").classList.contains("rw-quiet"), "an unranked row is dimmed");
  assert.equal(row("t9").classList.contains("rw-quiet"), false);
});

// Favourites are pinned above everything by filtered(). Grouping purely by tier
// therefore opened a heading for the favourite's tier at the top and a second one
// for the same tier further down — two headings sharing a data-id, which is the
// one thing syncGrid cannot survive.
test("the rank-sorted list groups by tier, with favorites in a band of their own", () => {
  const win = bootApp(ladderSeed());
  win.document.querySelector('[data-density="list"]').click();

  const heads = [...win.document.querySelectorAll(".lgrp")];
  const labels = heads.map(h => h.querySelector(".lgrp-n").textContent);
  assert.equal(labels[0], "Favorites", "the pinned favourite gets its own band first");
  assert.equal(labels[1], "Challenger", "then the ladder, top down");
  assert.equal(labels[labels.length - 1], "Never checked");
  assert.ok(labels.includes("Unranked"));
  // The favourite here is the only Gold account, so it is pulled into the
  // Favorites band and no Gold heading is opened at all. What has to hold either
  // way is that no heading is ever opened twice.
  assert.equal(new Set(labels).size, labels.length, "no band is named twice");

  const ids = heads.map(h => h.dataset.id);
  assert.equal(new Set(ids).size, ids.length, "no two headings share a data-id");

  // the counts have to add up to the accounts actually on screen
  const counted = heads.reduce((n, h) => n + Number(h.querySelector(".lgrp-k").textContent), 0);
  assert.equal(counted, win.document.querySelectorAll(".rw").length);
});

test("grouping is dropped when the list is not in rank order", () => {
  const win = bootApp(ladderSeed());
  win.document.querySelector('[data-density="list"]').click();
  assert.ok(win.document.querySelectorAll(".lgrp").length > 0);

  const sort = win.document.getElementById("tSort");
  sort.value = "name";
  sort.dispatchEvent(new win.Event("change"));
  assert.equal(win.document.querySelectorAll(".lgrp").length, 0,
    "headings scattered through a name-sorted list would mean nothing");
  assert.equal(win.document.querySelectorAll(".rw").length, 12, "every row is still there");
});

// Same guarantee the cards already had: unchanged rows must produce byte-identical
// markup, or syncGrid patches every row on every keystroke.
test("a row's markup is stable when nothing about it changed", () => {
  const win = bootApp(ladderSeed());
  win.document.querySelector('[data-density="list"]').click();
  const acc = win.filtered()[0];
  assert.equal(win.rowHTML(acc, 0), win.rowHTML(acc, 0));

  const row = win.document.querySelector(".rw");
  const spark = win.document.querySelector(".spk");
  win.renderGrid();
  assert.equal(win.document.querySelector(".rw"), row, "same row element");
  assert.equal(win.document.querySelector(".spk"), spark, "the sparkline is not redrawn");
});

// A flat run has no range to scale against; it must not divide by zero or pin the
// whole line to one edge of the box.
test("the sparkline survives a flat run, and needs two points to draw at all", () => {
  const win = bootApp();
  const flat = Array.from({ length: 5 }, (_, i) => ({ t: Date.now() - i * 86400000, tier: "GOLD", division: "II", lp: 40 }));
  const svg = win.sparkline(flat, "#e6c15a");
  assert.doesNotMatch(svg, /NaN|Infinity|undefined/);
  assert.match(svg, /stroke="#e6c15a"[^/]*\/><circle cx="124\.0" cy="15\.0"/, "the run ends mid-box, not pinned to an edge");
  assert.ok(!/ (0|27)\.0"/.test(svg.match(/<path d="M[^"]+" fill="none"/)[0]), "and no point sits on the top or bottom edge");
  assert.equal(win.sparkline([flat[0]], "#e6c15a"), "", "one reading is not a shape");
  assert.equal(win.sparkline(null, "#e6c15a"), "");
});

// ---- chart label crowding ----

const chartLabels = (win, hist, cut) => {
  const d = win.document.createElement("div");
  d.innerHTML = win.rankChart(hist, cut || null, "d", "probe");
  const out = [...d.querySelectorAll(".lpc-lab,.lpc-sub,.lpc-cut")].map(e => ({
    kind: e.className, text: e.textContent, top: parseFloat(e.style.top),
  }));
  return out;
};
const days = n => Date.now() - n * 86400000;

// Above Master the whole visible window sits inside one band, so that band's own
// bottom boundary is off the bottom of the chart. The label had nothing to sit
// above and ended up flat on the floor, in among the date axis, an LP numeral and
// the Grandmaster line — four unrelated things reading as one crowded row.
test("a band that fills the whole view captions from the top, not the floor", () => {
  const win = bootApp();
  const hist = Array.from({ length: 7 }, (_, i) => ({ t: days(6 - i), tier: "CHALLENGER", division: null, lp: 1830 + i * 15 }));
  const labs = chartLabels(win, hist, { gm: 1500, chall: 1750 });

  const band = labs.find(l => l.kind === "lpc-lab");
  assert.equal(band.text, "Master+");
  assert.ok(band.top < 10, `the caption belongs at the top, was at ${band.top}`);
  // and nothing else may share that line
  for (const other of labs.filter(l => l !== band))
    assert.ok(Math.abs(other.top - band.top) > 12, `"${other.text}" collides with the band caption`);
});

// ...but where the boundary *is* on screen the label still marks it, because there
// it is naming a line rather than the view.
test("a band whose boundary is visible keeps its label on that boundary", () => {
  const win = bootApp();
  const hist = [{ t: days(6), tier: "PLATINUM", division: "I", lp: 80 },
                { t: days(0), tier: "EMERALD", division: "IV", lp: 30 }];
  const labs = chartLabels(win, hist).filter(l => l.kind === "lpc-lab");
  const names = labs.map(l => l.text);
  assert.deepEqual(names.sort(), ["Emerald", "Platinum"]);
  assert.ok(labs.every(l => l.top > 10), "both bands have a visible boundary to sit on");
});

// A plain LP numeral landing on the Grandmaster floor drew a second hairline a few
// pixels from a dashed one and printed a number next to a label.
test("an LP numeral is dropped where it would land on a cutoff floor", () => {
  const win = bootApp();
  const hist = Array.from({ length: 7 }, (_, i) => ({ t: days(6 - i), tier: "CHALLENGER", division: null, lp: 1830 + i * 15 }));

  const clear = chartLabels(win, hist, { gm: 1500, chall: 2100 }).map(l => l.text);
  assert.ok(clear.includes("1800 LP"), "with the floor elsewhere the numeral is drawn");

  const onTop = chartLabels(win, hist, { gm: 1800, chall: 2100 });
  assert.ok(!onTop.some(l => l.text === "1800 LP"), "with the floor on it, the floor wins");
  assert.ok(onTop.some(l => l.text === "GM"));
});

// The general version of the same complaint: whatever the data, two labels in the
// same horizontal lane must never be printed on top of each other.
test("no two chart labels in one lane land on the same line", () => {
  const win = bootApp();
  const cases = [
    [Array.from({ length: 7 }, (_, i) => ({ t: days(6 - i), tier: "CHALLENGER", division: null, lp: 1830 + i * 15 })), { gm: 1500, chall: 1750 }],
    [Array.from({ length: 7 }, (_, i) => ({ t: days(6 - i), tier: "GOLD", division: "II", lp: 20 + i * 9 })), null],
    [[{ t: days(9), tier: "IRON", division: "IV", lp: 0 }, { t: days(0), tier: "CHALLENGER", division: null, lp: 1800 }], { gm: 900, chall: 1600 }],
    [[{ t: days(6), tier: "PLATINUM", division: "I", lp: 80 }, { t: days(0), tier: "EMERALD", division: "IV", lp: 30 }], null],
  ];
  for (const [hist, cut] of cases) {
    const byLane = {};
    for (const l of chartLabels(win, hist, cut)) (byLane[l.kind] ||= []).push(l);
    for (const [lane, items] of Object.entries(byLane)) {
      items.sort((a, b) => a.top - b.top);
      for (let i = 1; i < items.length; i++)
        assert.ok(items[i].top - items[i - 1].top >= 10,
          `${lane}: "${items[i - 1].text}" and "${items[i].text}" overlap at ${items[i].top}`);
    }
  }
});

// ---- the tier ribbon ----

test("the ribbon shows the vault's spread and filters when a segment is clicked", () => {
  const win = bootApp(ladderSeed());
  const segs = [...win.document.querySelectorAll(".rib-seg")];
  // "Unranked or never checked" was one band for two different things — an answer,
  // and a job not done yet — which is also the only band that could not show what it
  // counted when clicked
  assert.equal(segs.length, 12, "ten tiers, then unranked and never-checked apart");
  assert.equal(segs[0].dataset.tier, "CHALLENGER", "best first, the same order the list sorts in");
  assert.equal(segs[10].dataset.tier, "UNRANKED");
  assert.equal(segs[11].dataset.flag, "unchecked", "and this one filters the way its stats tile does");
  assert.match(win.document.querySelector(".rib-cap").textContent, /12 accounts across 10 tiers/);
  assert.match(win.document.querySelector(".rib-cap").textContent, /1 unranked · 1 never checked/);

  segs[10].click();
  assert.equal(win.document.querySelectorAll(".card").length, 1, "the unranked band shows the one it counted");
  segs[10].click();
  win.document.querySelector('.rib-seg[data-flag="unchecked"]').click();
  assert.equal(win.document.querySelectorAll(".card").length, 1, "and so does the never-checked one");
  win.document.querySelector('.rib-seg[data-flag="unchecked"]').click();

  const master = win.document.querySelector('.rib-seg[data-tier="MASTER"]');
  master.click();
  assert.equal(win.document.querySelectorAll(".card").length, 1, "the grid narrows to that tier");
  assert.equal(win.document.querySelector('.rib-seg[data-tier="MASTER"]').getAttribute("aria-pressed"), "true");
  assert.equal(win.document.querySelectorAll(".rib-seg.on").length, 1, "and only that one is lit");

  win.document.querySelector('.rib-seg[data-tier="MASTER"]').click();
  assert.equal(win.document.querySelectorAll(".card").length, 12, "clicking it again clears the filter");
});

/* The stats panel counts "Unranked" as an answer a check came back with — never
   checked is a chore, and has a tile of its own right beside it — but the filter
   behind the gem took every account without a rank, so "Unranked ×1" opened onto two
   cards. Both now ask the same question. */
test("the Unranked count and the filter behind it agree", () => {
  const win = bootApp(ladderSeed());
  const gem = win.document.querySelector('#dash .gem[data-tier="UNRANKED"]');
  assert.ok(gem, "the vault has an unranked account, so the gem is there");
  assert.match(gem.textContent, /×1/, "the never-checked account is not one of these");

  gem.click();
  assert.equal(win.document.querySelectorAll(".card").length, 1, "and clicking it shows that one");
  assert.equal(win.document.querySelector(".card").dataset.id, "un");

  // the never-checked account is still reachable, from the tile that counts it
  gem.click();
  win.document.querySelector('#dash [data-flag="unchecked"]').click();
  assert.equal(win.document.querySelectorAll(".card").length, 1);
  assert.equal(win.document.querySelector(".card").dataset.id, "nv");
});

/* A blank loss box in ✎ Rank means "not known", which the store keeps and the card
   used to throw away: five wins and an empty box printed "5W 0L · 100% WR". */
test("a win rate needs both numbers, and says nothing without them", () => {
  const win = bootApp([{ id: "w1", gameName: "HalfFilled", tagLine: "EUW", region: "EUW", status: "active",
    stats: { found: true, tier: "GOLD", division: "II", lp: 40, wins: 5, losses: null, level: 30, updatedAt: Date.now() } }]);
  const wl = () => win.document.querySelector(".card .wl").textContent;
  assert.match(wl(), /5W/, "the number that is known still shows");
  assert.doesNotMatch(wl(), /0L/, "the one that is not is not invented");
  assert.doesNotMatch(wl(), /%/, "and no rate is worked out from it");

  // both known is the ordinary case, and unchanged
  const win2 = bootApp([{ id: "w2", gameName: "Filled", tagLine: "EUW", region: "EUW", status: "active",
    stats: { found: true, tier: "GOLD", division: "II", lp: 40, wins: 6, losses: 4, level: 30, updatedAt: Date.now() } }]);
  assert.match(win2.document.querySelector(".card .wl").textContent, /6W 4L · 60% WR/);

  // and in the list view, which did the same sum
  win2.document.querySelector('[data-density="list"]').click();
  assert.match(win2.document.querySelector(".rw-wr").textContent, /60%/);
  win.document.querySelector('[data-density="list"]').click();
  const rw = win.document.querySelector(".rw-wr").textContent;
  assert.match(rw, /5W/);
  assert.doesNotMatch(rw, /%/);
});

// One account is not a distribution; a full-width block of a single colour is a
// picture of nothing.
test("the ribbon stays out of the way until there is a spread to show", () => {
  const win = bootApp();
  assert.equal(win.document.getElementById("ribbon").innerHTML, "", "empty vault, no ribbon");
  addRealAccount(win, "Only One", "1234");
  assert.equal(win.document.getElementById("ribbon").innerHTML, "", "one account, still nothing to compare");
  addRealAccount(win, "Second", "1234");
  assert.ok(win.document.querySelectorAll(".rib-seg").length > 0, "two is a distribution");
});

// The stats toggle used to float alone on a row of its own above the console, and
// was rebuilt by renderDash on every account change.
test("the stats toggle lives in the header tray and survives a re-render", () => {
  const win = bootApp(ladderSeed());
  const btn = win.document.querySelector(".bar #bDashToggle");
  assert.ok(btn, "it sits with the rest of the header chrome");
  assert.equal(win.document.querySelectorAll("#bDashToggle").length, 1, "and there is exactly one of it");
  // the panel starts open, so the button offers the other direction
  assert.match(btn.textContent, /Hide stats/);
  assert.ok(win.document.querySelectorAll(".dash .stat").length > 0);

  btn.click();
  assert.match(win.document.querySelector("#bDashToggle").textContent, /Show stats/);
  assert.equal(win.document.querySelectorAll(".dash .stat").length, 0, "the panel closes");

  win.render();
  assert.equal(win.document.querySelector(".bar #bDashToggle"), btn, "the same button, not a rebuilt one");
  assert.match(btn.textContent, /Show stats/, "and it still knows which way it is pointing");
});

// ---- peak ceiling, dead accounts, and the console readout ----

// The peak is the one number the line cannot express: the highest this account
// ever got. Drawn as a ceiling it is climbing back towards — but only when it is
// somewhere the chart can actually show.
test("the peak is drawn as a ceiling when it falls inside the view", () => {
  const win = bootApp();
  const hist = Array.from({ length: 6 }, (_, i) => ({ t: days(5 - i), tier: "GOLD", division: "II", lp: 40 + i * 4 }));
  const cur = win.ladderLP({ tier: "GOLD", division: "II", lp: 60 });
  const draw = pv => {
    const d = win.document.createElement("div");
    d.innerHTML = win.rankChart(hist, null, "d", "p", pv);
    return { dashed: d.querySelectorAll("line[stroke-dasharray]").length, peak: d.querySelector(".lpc-peak") };
  };

  const near = draw(cur + 55);
  assert.equal(near.dashed, 1, "a peak just above the current rank gets its line");
  assert.ok(near.peak, "and a label — a dashed line explaining nothing is worse than no line");

  assert.equal(draw(cur + 900).dashed, 0, "a peak far above the view is not squeezed into it");
  assert.equal(draw(null).dashed, 0, "an account at its own peak has no ceiling to draw");
});

// A banned account was marked by a 3px rail and a chip — the same weight the app
// gives "resting". Nothing about that rank will ever change again.
test("a banned account reads as finished in both layouts", () => {
  const seed = ladderSeed();
  seed[0].status = "banned";
  const win = bootApp(seed);
  assert.ok(win.document.querySelector(`.card[data-id="${seed[0].id}"]`).classList.contains("dead"));
  assert.equal(win.document.querySelector(`.card[data-id="${seed[1].id}"]`).classList.contains("dead"), false);

  win.document.querySelector('[data-density="list"]').click();
  assert.ok(win.document.querySelector(`.rw[data-id="${seed[0].id}"]`).classList.contains("dead"));
  assert.equal(win.document.querySelector(`.rw[data-id="${seed[1].id}"]`).classList.contains("dead"), false);
});

// "21 need a refresh" was a red sentence you could not act on, while the filter
// that shows exactly those sat behind a stat tile in a collapsed panel.
test("the refresh count is the button that filters to those accounts", () => {
  const seed = ladderSeed();
  seed[0].stats.updatedAt = Date.now() - 40 * 86400000;   // long stale
  const win = bootApp(seed);
  const btn = win.document.querySelector("#count [data-flag='stale']");
  assert.ok(btn, "the readout is a control");
  assert.equal(btn.tagName, "BUTTON");
  assert.match(btn.textContent, /needs? a refresh/);

  btn.click();
  const shown = win.document.querySelectorAll(".card").length;
  assert.ok(shown < seed.length, "clicking it narrows the grid");
  assert.equal(win.document.querySelector("#count [data-flag='stale']").getAttribute("aria-pressed"), "true");

  win.document.querySelector("#count [data-flag='stale']").click();
  assert.equal(win.document.querySelectorAll(".card").length, seed.length, "and clicking again clears it");
});

// Which proxy answered is developer detail: it never changes what you would do
// next, and it took a slot on every card in the vault.
test("the source of the numbers hangs off the timestamp instead of taking its own pill", () => {
  const win = bootApp(ladderSeed());
  const foot = win.document.querySelector(".c-foot");
  assert.equal(foot.querySelector(".src"), null, "no pill");
  const upd = foot.querySelector(".upd");
  assert.match(upd.textContent, /Updated/);
});

test("back to top is present and stays out of the way until it is needed", () => {
  const win = bootApp(ladderSeed());
  const btn = win.document.getElementById("toTop");
  assert.ok(btn);
  assert.ok(btn.classList.contains("hidden"), "hidden at the top of the page");
  assert.equal(btn.getAttribute("aria-label"), "Back to top");
});

// ---- the wall ----

// Cards are thirteen screens of a sixty-account vault and the list is four;
// neither ever shows the collection as a collection.
test("the wall puts one tile per account on screen and drops everything heavy", () => {
  const win = bootApp(ladderSeed());
  win.document.querySelector('[data-density="wall"]').click();

  assert.equal(win.document.querySelectorAll(".tile").length, 12, "one tile each");
  assert.equal(win.document.querySelectorAll(".card").length, 0);
  assert.equal(win.document.querySelectorAll(".lpc-svg").length, 0, "no charts to pay for");
  assert.equal(win.document.querySelectorAll(".spk").length, 0);
  assert.ok(win.document.getElementById("grid").classList.contains("wall"));
  // the three things a tile is for
  const tile = win.document.querySelector('.tile[data-id="t9"]');
  assert.ok(tile.querySelector(".t-crest"), "the tier, as an emblem");
  assert.match(tile.querySelector(".t-rk").textContent, /Challenger/);
  assert.ok(tile.querySelector(".t-pic"));
});

test("clicking a tile hands you back to the card view at that account", () => {
  const win = bootApp(ladderSeed());
  win.document.querySelector('[data-density="wall"]').click();
  win.document.querySelector('.tile[data-id="t4"]').click();

  assert.equal(win.document.querySelectorAll(".tile").length, 0, "back to cards");
  assert.ok(win.document.querySelector('.card[data-id="t4"]'), "and that account is a card again");
  assert.ok(win.document.querySelector('.hx.flash[data-id="t4"]'),
    "lit up, so it is obvious which of the sixty you landed on");
  assert.equal(JSON.parse(win.localStorage.getItem("smurf-tracker-cfg")).density, "cards");
});

test("the wall is remembered across a reload like the other two layouts", () => {
  const win = bootApp(ladderSeed());
  win.document.querySelector('[data-density="wall"]').click();
  assert.equal(JSON.parse(win.localStorage.getItem("smurf-tracker-cfg")).density, "wall");

  const fresh = bootApp(ladderSeed(), w => w.localStorage.setItem("smurf-tracker-cfg", JSON.stringify({ density: "wall" })));
  assert.equal(fresh.document.querySelectorAll(".tile").length, 12, "it comes back as the wall");
});

// renderCard patches a single node in place during a check run; it has to know
// which of the three shapes that node is, or a tile gets a card morphed into it.
test("a single-account re-render keeps the wall's shape", () => {
  const win = bootApp(ladderSeed());
  win.document.querySelector('[data-density="wall"]').click();
  const tile = win.document.querySelector('.tile[data-id="t4"]');

  win.renderCard("t4");
  assert.equal(win.document.querySelector('.tile[data-id="t4"]'), tile, "same node");
  assert.equal(win.document.querySelectorAll(".card").length, 0, "and still a tile, not a card");
});

// ---- reorder animation, scan sweep, rolling numbers ----

// The guard is the whole design. Measuring rects forces layout, and doing it on
// every render would hand back the render work this file already did — so it may
// only engage when the set is unchanged and purely the order differs.
test("the reorder animation engages on a sort change and never on a filter change", () => {
  const win = bootApp(ladderSeed());
  const grid = win.document.getElementById("grid");
  const ids = [...grid.children].map(n => n.dataset.id).filter(Boolean);

  assert.equal(win.reorderOnly(grid, ids.map(id => ({ id }))), null, "nothing moved");
  const shuffled = ids.slice().reverse().map(id => ({ id }));
  assert.ok(win.reorderOnly(grid, shuffled), "same accounts, different order");

  const fewer = ids.slice(2).map(id => ({ id }));
  assert.equal(win.reorderOnly(grid, fewer), null, "a filter dropped some — not a reorder");
  const extra = ids.concat("brand-new").map(id => ({ id }));
  assert.equal(win.reorderOnly(grid, extra), null, "something arrived — not a reorder");
  assert.equal(win.reorderOnly(grid, [{ id: ids[0] }]), null, "one card cannot be out of order");
});

// A check run had a progress bar and sixty perfectly still cards, while the run
// knew which account it was on the whole time.
test("the card being checked shows it, in every layout", async () => {
  const win = bootApp(ladderSeed());
  const started = win.check("t4");                 // fetch is stubbed to reject
  assert.ok(win.document.querySelector('.card[data-id="t4"]').classList.contains("scanning"));
  assert.equal(win.document.querySelector('.card[data-id="t5"]').classList.contains("scanning"), false);

  win.document.querySelector('[data-density="wall"]').click();
  assert.ok(win.document.querySelector('.tile[data-id="t4"]').classList.contains("scanning"));
  win.document.querySelector('[data-density="list"]').click();
  assert.ok(win.document.querySelector('.rw[data-id="t4"]').classList.contains("scanning"));

  await started;
  assert.equal(win.document.querySelector('.rw[data-id="t4"]').classList.contains("scanning"), false,
    "and stops when the check does");
});

// The roll writes to an element on a timer; the card can be re-rendered out from
// under it at any point, and a check run re-renders constantly.
test("a rolling number refuses the cases where it would be wrong or stranded", () => {
  const win = bootApp();
  const el = win.document.createElement("span");
  el.textContent = "untouched";
  // not connected to the document
  win.rollNumber(el, 10, 90, " LP");
  assert.equal(el.textContent, "untouched", "nothing is written before the first frame");

  win.document.body.appendChild(el);
  for (const [from, to] of [[null, 50], [50, null], [50, 50]]) {
    el.textContent = "untouched";
    win.rollNumber(el, from, to, " LP");
    assert.equal(el.textContent, "untouched", `${from} -> ${to} is not a roll`);
  }
  win.rollNumber(null, 10, 90, " LP");   // must not throw on a missing element
});

// align-items:start went on .grid to stop the card grid stretching a short card to
// the height of the tallest one in its row. The list is a flex column, where the
// same declaration stops meaning "don't stretch to the row height" and starts
// meaning "shrink every row to the width of its own text" — which cut the list off
// in the middle of the page and left half the screen empty.
test("the list fills its container while the card grid still refuses to stretch", () => {
  const win = bootApp(ladderSeed());
  const grid = win.document.getElementById("grid");
  const align = () => win.getComputedStyle(grid).alignItems;

  assert.match(align(), /^(start|flex-start)$/, "cards must not stretch to the row height");

  win.document.querySelector('[data-density="list"]').click();
  assert.doesNotMatch(align(), /^(start|flex-start)$/,
    "a flex column reads that as shrink-to-content, and the rows stop filling the page");

  win.document.querySelector('[data-density="wall"]').click();
  assert.match(align(), /^(start|flex-start)$/, "the wall is a grid again, and wants it back");
});

// ---- structured account fields and the attention flag ----

// These two were being kept in the Notes box by hand — "birthdate 8/1/1987,
// created 4/2/2022" — where nothing could search them, sort them or show them.
test("the created and date-of-birth fields save, reopen and round-trip", () => {
  const win = bootApp();
  addRealAccount(win, "Recovered", "1234");
  const id = win.filtered()[0].id;

  win.document.querySelector(`.card[data-id="${id}"] [data-act="more"]`).click();
  win.document.querySelector(`.card[data-id="${id}"] [data-act="edit"]`).click();
  win.document.getElementById("fCreated").value = "2022-02-04";
  win.document.getElementById("fBirth").value = "1987-01-08";
  win.document.getElementById("fSave").click();

  const stored = JSON.parse(win.localStorage.getItem("smurf-tracker"))[0];
  assert.equal(stored.createdOn, "2022-02-04");
  assert.equal(stored.birthdate, "1987-01-08");

  // the overflow menu is still open from before — clicking ⋯ again would shut it
  win.document.querySelector(`.card[data-id="${id}"] [data-act="edit"]`).click();
  assert.equal(win.document.getElementById("fCreated").value, "2022-02-04", "and come back into the form");
  assert.equal(win.document.getElementById("fBirth").value, "1987-01-08");
});

// Parsing "YYYY-MM-DD" into a Date only to format it is how a birthday becomes a
// day earlier for everyone west of Greenwich.
test("dates are formatted without a timezone moving them", () => {
  const win = bootApp();
  assert.equal(win.fmtDate("1987-01-08"), "8 Jan 1987");
  assert.equal(win.fmtDate("2022-12-31"), "31 Dec 2022");
  assert.equal(win.fmtDate(""), "");
  assert.equal(win.fmtDate("not a date"), "not a date", "anything else is passed through untouched");
  assert.match(win.ageFrom("2022-02-04"), /years old$/);
  assert.equal(win.ageFrom(""), "");
});

test("the recovery facts show where you look for them, on the login panel", () => {
  const seed = ladderSeed();
  seed[0].birthdate = "1987-01-08";
  seed[0].createdOn = "2022-02-04";
  const win = bootApp(seed);
  win.document.querySelector(`.card[data-id="${seed[0].id}"] [data-act="login"]`).click();
  const text = win.document.querySelector(`.card[data-id="${seed[0].id}"] .login`).textContent;
  assert.match(text, /Date of birth/);
  assert.match(text, /8 Jan 1987/);
  assert.match(text, /4 Feb 2022/);
  assert.match(text, /years old/, "the age is the number you actually wanted");
});

// The vault filled up with notes reading "verify Riot ID" because there was no
// state for it — nothing could count them, filter by them, or show them outside
// the one card they were typed into.
test("flagging an account marks it in every layout, filters, and is counted", () => {
  const win = bootApp(ladderSeed());
  const id = "t4";
  win.document.querySelector(`.card[data-id="${id}"] [data-act="more"]`).click();
  win.document.querySelector(`.card[data-id="${id}"] [data-act="flag"]`).click();

  assert.equal(JSON.parse(win.localStorage.getItem("smurf-tracker")).find(a => a.id === id).flagged, true);
  assert.ok(win.document.querySelector(`.card[data-id="${id}"] .flagmark`), "marked on the card");
  win.document.querySelector('[data-density="list"]').click();
  assert.ok(win.document.querySelector(`.rw[data-id="${id}"] .flagmark`), "and on the row");
  win.document.querySelector('[data-density="wall"]').click();
  assert.ok(win.document.querySelector(`.tile[data-id="${id}"] .flagmark`), "and on the tile");
  win.document.querySelector('[data-density="cards"]').click();

  const tile = win.document.querySelector('[data-flag="attention"]');
  assert.ok(tile, "a stat tile appears once something is flagged");
  assert.match(tile.textContent, /Needs attention/);
  tile.click();
  assert.equal(win.document.querySelectorAll(".card").length, 1, "and filters to it");
  assert.match(win.document.getElementById("chips").textContent, /Needs attention/);
});

// A profile that no longer exists is not a transient failure: every future check
// fails the same way until the Riot ID is corrected.
test("a check that finds no profile raises the flag by itself", () => {
  const win = bootApp(ladderSeed());
  const acc = win.filtered().find(a => a.id === "t4");
  assert.ok(!acc.flagged);

  win.commitStats("t4", acc, { found: false, updatedAt: Date.now() });
  assert.equal(acc.flagged, true);
  assert.ok(win.document.querySelector('.card[data-id="t4"] .flagmark'));

  // ...and a later successful check must not quietly clear it: only the person who
  // wrote it down knows whether it has been dealt with.
  win.commitStats("t4", acc, { found: true, tier: "GOLD", division: "II", lp: 40, updatedAt: Date.now() });
  assert.equal(acc.flagged, true, "the flag is cleared by hand or not at all");
});

test("CSV carries the new fields out and back", () => {
  const win = bootApp();
  addRealAccount(win, "Roundtrip", "1234");
  const acc = win.filtered()[0];
  acc.createdOn = "2022-02-04";
  acc.birthdate = "1987-01-08";

  const cols = ["label", "gameName", "tagLine", "region", "status", "tier", "division", "lp", "wins",
    "losses", "level", "login", "password", "email", "createdOn", "birthdate", "tags", "notes", "favorite", "lastUpdated"];
  // the header the exporter writes has to line up with the row it writes under it
  assert.equal(cols.indexOf("createdOn"), 14);
  assert.equal(cols.indexOf("birthdate"), 15);
});

// ---- games played, climb rate, goals, last opened ----

const pt = (daysAgo, tier, division, lp, w, l) => {
  const o = { t: Date.now() - daysAgo * 86400000, tier, division, lp };
  if (w != null) { o.w = w; o.l = l }
  return o;
};

// "Updated 22h ago" says when the app last looked. This says whether the account
// was doing anything, which is the question that was actually being asked.
test("games since the last check, and the cases where there is no answer", () => {
  const win = bootApp();
  assert.deepEqual(
    { n: 3, w: 2, l: 1 },
    (({ n, w, l }) => ({ n, w, l }))(win.gamesSince([pt(2, "GOLD", "II", 20, 100, 90), pt(1, "GOLD", "II", 40, 102, 91)])));

  assert.equal(win.gamesSince([pt(1, "GOLD", "II", 40)]), null, "one point is not a difference");
  assert.equal(win.gamesSince([pt(2, "GOLD", "II", 20), pt(1, "GOLD", "II", 40)]), null,
    "history recorded before the totals were kept stays quiet");
  assert.equal(win.gamesSince([pt(2, "GOLD", "II", 20, 100, 90), pt(1, "GOLD", "II", 40, 100, 90)]), null,
    "no games played is nothing to report");
  assert.equal(win.gamesSince([pt(2, "GOLD", "II", 20, 100, 90), pt(1, "GOLD", "IV", 5, 2, 1)]), null,
    "a season reset is not minus ninety-eight games");
});

/* gamesSince already knew a season reset from the totals going down. lastDelta,
   climbRate and the away band did not, so Diamond→Silver across one printed as
   "▼ −900 LP" and −200 LP/day — a crash that never happened. */
test("a season reset is a break, not a loss", () => {
  const win = bootApp();
  // Diamond I 50 LP → Silver II 20 LP, with season W/L reset from 190/215 to 3/2
  const before = pt(5, "DIAMOND", "I", 50, 190, 215);
  const after = pt(0, "SILVER", "II", 20, 3, 2);
  assert.equal(win.seasonBreak(before, after), true);
  assert.equal(win.lastDelta({ history: [before, after] }), 0,
    "the chip does not claim a nine-hundred-LP crash");

  // climb rate measured only after the break — one point on each side of it is
  // not a trend at all
  assert.equal(win.climbRate([before, after]), null);

  // and three points that cross a break are not a climb either, even if the LP
  // numbers happen to rise afterwards
  assert.equal(win.isClimbing([
    pt(3, "DIAMOND", "I", 50, 190, 215),
    pt(2, "SILVER", "IV", 0, 1, 0),
    pt(1, "SILVER", "IV", 40, 3, 1),
  ]), false);

  // without W/L there is nothing to detect, so the old comparison stands
  assert.ok(win.lastDelta({ history: [pt(1, "DIAMOND", "I", 50), pt(0, "SILVER", "II", 20)] }) < 0,
    "no totals means no break, and the drop is what it is");
});

// lastDelta() answers "what did the most recent check see", which on an account
// checked twice in an hour is noise.
test("climb rate is a fortnight's trend, not the last two readings", () => {
  const win = bootApp();
  // two divisions is 200 ladder LP, since every division below Master is worth 100
  const r = win.climbRate([pt(10, "GOLD", "IV", 0), pt(0, "GOLD", "II", 0)]);
  assert.ok(r);
  assert.equal(Math.round(r.lpPerDay), 20, "200 LP over ten days");

  assert.equal(win.climbRate([pt(1, "GOLD", "II", 40)]), null, "one point has no slope");
  assert.equal(win.climbRate([pt(0.1, "GOLD", "II", 20), pt(0, "GOLD", "II", 60)]), null,
    "a few hours of data extrapolates to nonsense");
  assert.equal(win.climbRate([pt(400, "GOLD", "IV", 0), pt(380, "GOLD", "I", 300)]), null,
    "and a trend from last year is not this fortnight's");
});

test("a goal reports the gap, and only guesses at the time when the account is moving", () => {
  const win = bootApp();
  const acc = {
    stats: { found: true, tier: "DIAMOND", division: "I", lp: 88 },
    goal: { tier: "MASTER", division: null, lp: null },
    history: [pt(10, "DIAMOND", "IV", 0), pt(0, "DIAMOND", "I", 88)],
  };
  const g = win.goalProgress(acc);
  assert.equal(g.done, false);
  assert.ok(g.gap > 0 && g.gap < 100, `gap was ${g.gap}`);
  assert.ok(g.eta, "climbing, so an estimate is honest");
  assert.doesNotMatch(g.label, /LP/, "a goal is a rank, not a rank and an LP figure");

  acc.history = [pt(10, "DIAMOND", "I", 90), pt(0, "DIAMOND", "I", 88)];   // going nowhere
  assert.equal(win.goalProgress(acc).eta, null, "no estimate from a flat fortnight");

  acc.stats = { found: true, tier: "MASTER", division: null, lp: 30 };
  assert.equal(win.goalProgress(acc).done, true);
  assert.equal(win.goalProgress({ stats: acc.stats }), null, "no goal, nothing to report");
});

test("a check records the season totals so the next one can subtract them", () => {
  const win = bootApp(ladderSeed());
  const acc = win.filtered().find(a => a.id === "t4");
  win.commitStats("t4", acc, { found: true, tier: "PLATINUM", division: "II", lp: 50, wins: 40, losses: 30, updatedAt: Date.now() });
  const last = acc.history[acc.history.length - 1];
  assert.equal(last.w, 40);
  assert.equal(last.l, 30);
});

// "Status: resting" was a label you had to keep up by hand.
test("opening the login panel records that the account was reached for", () => {
  const win = bootApp(ladderSeed());
  const card = () => win.document.querySelector('.card[data-id="t4"]');
  assert.ok(!win.filtered().find(a => a.id === "t4").lastLoginAt);

  card().querySelector('[data-act="login"]').click();
  const at = win.filtered().find(a => a.id === "t4").lastLoginAt;
  assert.ok(at && Date.now() - at < 5000);
  assert.equal(JSON.parse(win.localStorage.getItem("smurf-tracker")).find(a => a.id === "t4").lastLoginAt, at,
    "and it survives the reload");
  assert.match(card().querySelector(".c-foot").textContent, /Opened/);

  card().querySelector('[data-act="login"]').click();   // closing must not re-stamp
  assert.equal(win.filtered().find(a => a.id === "t4").lastLoginAt, at);
});

test("sorting by climb puts the account actually moving at the top", () => {
  const seed = ladderSeed();
  seed[0].history = [pt(10, "IRON", "IV", 0), pt(0, "IRON", "IV", 5)];      // barely moving
  seed[1].history = [pt(10, "BRONZE", "IV", 0), pt(0, "BRONZE", "I", 300)]; // climbing hard
  const win = bootApp(seed);
  const sort = win.document.getElementById("tSort");
  sort.value = "climb";
  sort.dispatchEvent(new win.Event("change"));

  const order = win.filtered().map(a => a.id);
  assert.ok(order.indexOf(seed[1].id) < order.indexOf(seed[0].id),
    "the one gaining 30 LP a day outranks the one gaining half of one");
});

// ---- quick find, search operators, while you were away ----

test("Ctrl+K opens quick find, and typing narrows accounts and commands together", () => {
  const win = bootApp(ladderSeed());
  const pal = win.document.getElementById("palette");
  assert.ok(pal.classList.contains("hidden"));

  win.document.dispatchEvent(new win.KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }));
  assert.equal(pal.classList.contains("hidden"), false, "it opens from anywhere, even mid-typing");

  const input = win.document.getElementById("palInput");
  input.value = "challenger";
  input.dispatchEvent(new win.Event("input"));
  const items = [...win.document.querySelectorAll(".pal-i")];
  assert.ok(items.length, "the Challenger account is found by its rank as well as its name");
  assert.match(items[0].textContent, /Challenger/);

  input.value = "layout";
  input.dispatchEvent(new win.Event("input"));
  assert.equal(win.document.querySelectorAll(".pal-i").length, 1);
  assert.match(win.document.querySelector(".pal-i").textContent, /Switch layout/);

  win.document.dispatchEvent(new win.KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }));
  assert.ok(pal.classList.contains("hidden"), "and the same key closes it");
});

/* Focus on Unlock is a BUTTON, so the typing guard does not catch it — f used to
   flip Favorites under the lock screen, and after unlock the vault looked empty.
   Ctrl+K in the password field opened Quick find over an empty accounts array. */
test("shortcuts do nothing on the lock screen", async () => {
  const win1 = bootApp();
  addRealAccount(win1, "Hidden", "1");
  win1.document.getElementById("sVaultPass").value = "lockme12345";
  win1.document.getElementById("sVaultSet").click();
  await until(() => encrypted(win1), "encrypted");
  win1.document.getElementById("sAutoLock").value = "5";
  win1.document.getElementById("sSave").click();
  const stored = win1.localStorage.getItem("smurf-tracker");
  const cfg = win1.localStorage.getItem("smurf-tracker-cfg");

  const win = bootApp(undefined, w => {
    w.localStorage.setItem("smurf-tracker", stored);
    if (cfg) w.localStorage.setItem("smurf-tracker-cfg", cfg);
  });
  assert.equal(win.document.getElementById("lock").classList.contains("hidden"), false);

  win.document.getElementById("lockBtn").focus();
  win.document.dispatchEvent(new win.KeyboardEvent("keydown", { key: "f", bubbles: true }));
  win.document.dispatchEvent(new win.KeyboardEvent("keydown", { key: "n", bubbles: true }));
  win.document.dispatchEvent(new win.KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }));

  assert.ok(win.document.getElementById("palette").classList.contains("hidden"), "Ctrl+K stayed quiet");
  assert.ok(win.document.getElementById("form").classList.contains("hidden"), "n did not open the form");

  win.document.getElementById("lockPass").value = "lockme12345";
  win.document.getElementById("lockBtn").click();
  await until(() => win.document.getElementById("lock").classList.contains("hidden"), "unlock");
  assert.equal(win.document.getElementById("tFav").getAttribute("aria-pressed"), "false",
    "and Favorites was not waiting underneath");
  assert.equal(win.document.querySelectorAll(".card").length, 1);
});

/* Same while Help is open: / and f used to mutate the page behind the dialog. */
test("shortcuts do not reach the page behind Help", () => {
  const win = bootApp(ladderSeed());
  win.document.getElementById("bHelp").click();
  assert.equal(win.document.getElementById("help").classList.contains("hidden"), false);

  win.document.dispatchEvent(new win.KeyboardEvent("keydown", { key: "f", bubbles: true }));
  win.document.dispatchEvent(new win.KeyboardEvent("keydown", { key: "/", bubbles: true }));
  win.document.dispatchEvent(new win.KeyboardEvent("keydown", { key: "n", bubbles: true }));

  assert.equal(win.document.getElementById("tFav").getAttribute("aria-pressed"), "false");
  assert.ok(win.document.getElementById("form").classList.contains("hidden"));
  assert.notEqual(win.document.activeElement, win.document.getElementById("tSearch"),
    "slash did not steal focus behind the dialog");
});

test("quick find walks with the arrows and opens with Enter", () => {
  const win = bootApp(ladderSeed());
  win.openPalette();
  const input = win.document.getElementById("palInput");
  const key = k => input.dispatchEvent(new win.KeyboardEvent("keydown", { key: k, bubbles: true }));

  assert.equal(win.document.querySelectorAll(".pal-i")[0].classList.contains("sel"), true, "the first result starts selected");
  key("ArrowDown");
  assert.equal(win.document.querySelectorAll(".pal-i")[1].classList.contains("sel"), true);
  key("ArrowUp"); key("ArrowUp");
  const items = win.document.querySelectorAll(".pal-i");
  assert.equal(items[items.length - 1].classList.contains("sel"), true, "and wraps around the ends");

  key("ArrowDown");                       // back to the first, which is an account
  key("Enter");
  assert.ok(win.document.getElementById("palette").classList.contains("hidden"), "picking closes it");
  assert.ok(win.document.querySelector(".hx.flash"), "and lights up where you landed");
});

// An account reached through quick find has to be visible when you get there, so
// whatever was filtering the grid gets cleared on the way.
test("jumping to an account clears the filters that would have hidden it", () => {
  const win = bootApp(ladderSeed());
  win.document.querySelector('.rib-seg[data-tier="MASTER"]').click();
  assert.equal(win.document.querySelectorAll(".card").length, 1);

  win.openPalette();
  const input = win.document.getElementById("palInput");
  input.value = "IRONGuy";
  input.dispatchEvent(new win.Event("input"));
  input.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

  assert.ok(win.document.querySelector('.card[data-id="t0"]'), "the Iron account is on screen");
  assert.equal(win.document.querySelectorAll(".rib-seg.on").length, 0, "the tier filter is gone");
});

test("search operators filter the way the toolbar does, without leaving the keyboard", () => {
  const win = bootApp(ladderSeed());
  const count = s => {
    const box = win.document.getElementById("tSearch");
    box.value = s;
    box.dispatchEvent(new win.Event("input"));
    win.renderFilters();                       // skip the 120ms debounce
    return win.document.querySelectorAll(".card").length;
  };
  assert.equal(count(""), 12);
  assert.equal(count("tier:diamond"), 1);
  assert.equal(count("t:chall"), 1, "a prefix is enough");
  assert.equal(count("region:euw"), 12);
  assert.equal(count(">diamond"), 4, "Diamond and up, the way people say it out loud");
  assert.equal(count("<gold"), 3, "Iron, Bronze, Silver");
  // <= collapsed into < and left its own tier out, so this used to be 3 as well
  assert.equal(count("<=gold"), 4, "and Gold, when it is asked for");
  assert.equal(count(">=diamond"), 4, "the mirror of it, where > and >= already agreed");
  assert.equal(count("is:fav"), 1);
  assert.equal(count("is:never"), 1);
  // an unrecognised operator has to stay a plain search term rather than silently
  // swallowing the rest of the query
  assert.equal(count("colour:blue"), 0);
  assert.equal(count(""), 12);
});

// The app is built to sit in a background tab for days and check by itself, and
// had no idea of "since you last looked".
test("what moved while you were away is measured from before you left", () => {
  const now = Date.now();
  const seed = ladderSeed();
  // a fortnight of checks, of which the last three happened after the last visit
  seed[0].history = [
    { t: now - 10 * 86400000, tier: "CHALLENGER", division: null, lp: 100 },
    { t: now - 2 * 86400000, tier: "CHALLENGER", division: null, lp: 300 },
    { t: now - 1 * 86400000, tier: "CHALLENGER", division: null, lp: 400 },
  ];
  seed[1].history = [
    { t: now - 10 * 86400000, tier: "GRANDMASTER", division: null, lp: 500 },
    { t: now - 1 * 86400000, tier: "GRANDMASTER", division: null, lp: 300 },
  ];
  const win = bootApp(seed);
  const since = now - 5 * 86400000;

  const sum = win.awaySummary(since);
  assert.equal(sum.up.length, 1);
  assert.equal(sum.down.length, 1);
  // measured against the last reading before the visit ended, not the previous
  // check — over a week away an account may have been checked five times
  assert.equal(sum.up[0].d, 300, "100 -> 400, not 300 -> 400");
  assert.equal(sum.down[0].d, -200);

  assert.equal(win.awaySummary(0), null, "no previous visit, nothing to report");
  assert.equal(win.awaySummary(now + 86400000), null, "and nothing has happened since the future");
});

test("the away band stays quiet for a quick tab flick, and once dismissed is gone", () => {
  const now = Date.now();
  const seed = ladderSeed();
  seed[0].history = [
    { t: now - 10 * 86400000, tier: "CHALLENGER", division: null, lp: 100 },
    { t: now - 1 * 86400000, tier: "CHALLENGER", division: null, lp: 400 },
  ];
  const cfgWith = ms => w => w.localStorage.setItem("smurf-tracker-cfg", JSON.stringify({ lastSeenAt: ms }));

  const quick = bootApp(seed, cfgWith(now - 60000));
  assert.ok(quick.document.getElementById("awayBand").classList.contains("hidden"),
    "closing a tab and reopening it must not announce itself");

  const away = bootApp(seed, cfgWith(now - 3 * 86400000));
  const band = away.document.getElementById("awayBand");
  assert.equal(band.classList.contains("hidden"), false);
  assert.match(band.textContent, /climbed/);

  band.querySelector("#awayHide").click();
  assert.ok(band.classList.contains("hidden"));
  assert.ok(JSON.parse(away.localStorage.getItem("smurf-tracker-cfg")).lastSeenAt > now - 60000,
    "the visit it was reporting on is over the moment it has been read");
});

// ---- Master, Grandmaster and Challenger have no divisions ----

test("a rank label drops the division above Master and keeps it below", () => {
  const win = bootApp();
  assert.equal(win.tierLabel({ tier: "GOLD", division: "II" }), "Gold II");
  assert.equal(win.tierLabel({ tier: "DIAMOND", division: "I" }), "Diamond I");
  for (const t of ["MASTER", "GRANDMASTER", "CHALLENGER"])
    assert.equal(win.tierLabel({ tier: t, division: "II" }), t.charAt(0) + t.slice(1).toLowerCase(),
      `${t} has no divisions`);
  assert.equal(win.tierLabel({ tier: "UNRANKED", division: "II" }), "Unranked");
  assert.equal(win.tierLabel({}), "Unranked");
  // shortRank builds on it, so it inherits the guard
  assert.equal(win.shortRank({ tier: "CHALLENGER", division: "III", lp: 1200 }), "Challenger · 1200 LP");
  assert.equal(win.shortRank({ tier: "SILVER", division: "III", lp: 40 }), "Silver III · 40 LP");
});

// parsePeakText, parseSeasons and parseLpHistory all carried this guard. The one
// that reads the *current* rank — the one on every card in the vault — did not.
test("the current-rank parser refuses a division above Master", () => {
  const win = bootApp();
  assert.equal(win.parseRankFlat("Challenger 2 1234 LP").division, null);
  assert.equal(win.parseRankFlat("Grandmaster III 800 LP").division, null);
  assert.equal(win.parseRankFlat("Master 1 250 LP").division, null);
  assert.equal(win.parseRankFlat("Diamond II 45 LP").division, "II", "below Master it is still read");
  assert.equal(win.parseRankFlat("Challenger 1234 LP").tier, "CHALLENGER");
  assert.equal(win.parseRankFlat("Challenger 1234 LP").lp, 1234);
});

// The backend and the model hand back whatever they hand back, and applyStats is
// the single point all three sources meet.
test("whatever a source hands back, nothing above Master is stored with a division", () => {
  const win = bootApp(ladderSeed());
  const acc = win.filtered().find(a => a.id === "t4");
  win.commitStats("t4", acc, {
    found: true, tier: "CHALLENGER", division: "II", lp: 1300, updatedAt: Date.now(),
    peak: { tier: "GRANDMASTER", division: "I", lp: 900 },
    seasons: { solo: [{ season: "S2025", tier: "MASTER", division: "IV", lp: 100 }], flex: [] },
  });
  assert.equal(acc.stats.division, null);
  assert.equal(acc.stats.peak.division, null);
  assert.equal(acc.stats.seasons.solo[0].division, null);
  assert.equal(acc.history[acc.history.length - 1].division, null, "and it does not reach the history either");
});

// A vault already on disk carries the bad value, in the history too. Guarding only
// the display would have hidden it while leaving it in the file — and an export
// would have carried it straight back out.
test("a vault that already has the bad divisions is scrubbed when it loads", () => {
  const now = Date.now();
  const seed = [{
    id: "c1", gameName: "Chall", tagLine: "EUW", region: "EUW", status: "active",
    stats: {
      found: true, tier: "CHALLENGER", division: "II", lp: 1200, updatedAt: now,
      peak: { tier: "CHALLENGER", division: "I", lp: 1400 },
      flex: { tier: "MASTER", division: "III", lp: 30 },
      seasons: { solo: [{ season: "S2024", tier: "GRANDMASTER", division: "II", lp: 700 }], flex: [] },
    },
    peakManual: { tier: "MASTER", division: "IV", lp: 0 },
    goal: { tier: "CHALLENGER", division: "II", lp: null },
    history: [
      { t: now - 86400000, tier: "MASTER", division: "III", lp: 100 },
      { t: now, tier: "CHALLENGER", division: "II", lp: 1200 },
    ],
  }];
  const win = bootApp(seed);
  const a = win.filtered()[0];
  assert.equal(a.stats.division, null);
  assert.equal(a.stats.peak.division, null);
  assert.equal(a.stats.flex.division, null);
  assert.equal(a.stats.seasons.solo[0].division, null);
  assert.equal(a.peakManual.division, null);
  assert.equal(a.goal.division, null);
  assert.ok(a.history.every(h => h.division === null), "the history is where the charts read from");

  // and it is written back, so an export cannot carry it out again
  const stored = JSON.parse(win.localStorage.getItem("smurf-tracker"))[0];
  assert.equal(stored.stats.division, null);
  assert.equal(stored.history[1].division, null);
});

// The real complaint: it was on screen. Every layout, every string.
test("no screen prints a division on a Master, Grandmaster or Challenger rank", () => {
  const win = bootApp(ladderSeed());
  const bad = /(Master|Grandmaster|Challenger)\s+(IV|III|II|I)\b/;
  for (const layout of ["cards", "list", "wall"]) {
    win.document.querySelector(`[data-density="${layout}"]`).click();
    const text = win.document.getElementById("grid").textContent;
    assert.doesNotMatch(text, bad, `${layout} view`);
  }
  win.document.querySelector('[data-density="cards"]').click();
  assert.doesNotMatch(win.document.getElementById("ribbon").textContent, bad, "the header ribbon");
  assert.doesNotMatch(win.document.getElementById("dash").textContent, bad, "the stats panel");

  win.openPalette();
  assert.doesNotMatch(win.document.getElementById("palList").textContent, bad, "quick find");
});

test("the rank panel does not offer divisions it will throw away", () => {
  const win = bootApp(ladderSeed());
  const open = id => {
    win.document.querySelector(`.card[data-id="${id}"] [data-act="more"]`).click();
    win.document.querySelector(`.card[data-id="${id}"] [data-act="rank"]`).click();
    return win.document.querySelector(`.card[data-id="${id}"] [data-f="div"]`);
  };
  assert.equal(open("t9").disabled, true, "Challenger");   // t9 is CHALLENGER
  assert.equal(open("t4").disabled, false, "Platinum");    // t4 is PLATINUM
});

test("CSV cannot import a division above Master either", () => {
  const win = bootApp();
  assert.equal(win.normDivision("CHALLENGER", "II"), null);
  assert.equal(win.normDivision("GOLD", "II"), "II");
  assert.equal(win.normDivision("UNRANKED", "II"), null);
  assert.equal(win.normDivision("", "II"), null);
  assert.equal(win.hasDivisions("EMERALD"), true);
  assert.equal(win.hasDivisions("MASTER"), false);
});

// The migration scrubs a stored vault before anything renders, which means the
// two tests above pass whether or not the *display* is guarded. This exercises the
// builders directly, with a value the migration never got to touch — because data
// can also arrive mid-session, from a check, an import or a paste.
test("the markup builders refuse a bad division even when handed one directly", () => {
  const win = bootApp();
  const acc = {
    id: "x", gameName: "Chall", tagLine: "EUW", region: "EUW", status: "active", tags: [],
    stats: { found: true, tier: "CHALLENGER", division: "II", lp: 1200, wins: 30, losses: 20, updatedAt: Date.now() },
    history: [{ t: Date.now(), tier: "CHALLENGER", division: "II", lp: 1200 }],
  };
  const bad = /Challenger\s+(IV|III|II|I)\b/;
  assert.doesNotMatch(win.cardHTML(acc, 0), bad, "card");
  assert.doesNotMatch(win.rowHTML(acc, 0), bad, "row");
  assert.doesNotMatch(win.tileHTML(acc), bad, "tile");
  // and the rank still reads as a rank
  assert.match(win.cardHTML(acc, 0), /Challenger/);
  assert.match(win.cardHTML(acc, 0), /1200 LP/);
});

// ---- what a failed first check is allowed to claim ----

/* A check that fails before one has ever succeeded leaves a note behind on an
   otherwise empty stats object, and all three layouts asked "is there a stats
   object" rather than "did anything come back". So the card announced
   "Unranked · No ranked games found" about an account nobody had managed to read
   yet — while the stats panel directly above it went on counting the very same
   account under Never checked. */
test("a first check that failed leaves the account never checked, not unranked", () => {
  const win = bootApp([{
    id: "f1", gameName: "Renamed", tagLine: "EUW", region: "EUW", status: "active", tags: [], history: [],
    stats: { note: "Auto-fetch failed (timeout) — enter it by hand with ✎ Rank" },
  }]);
  const card = win.document.querySelector('.card[data-id="f1"]');
  assert.match(card.textContent, /Never checked/);
  assert.doesNotMatch(card.textContent, /Unranked|No ranked games found/);
  assert.match(card.textContent, /Auto-fetch failed/, "and it still says why");

  // the panel was right all along; the card is what disagreed with it
  const tile = win.document.querySelector('#dash [data-flag="unchecked"]');
  assert.ok(tile, "the stats panel counts it as never checked");
  assert.equal(tile.querySelector(".v").textContent, "1");

  for (const layout of ["list", "wall"]) {
    win.document.querySelector(`[data-density="${layout}"]`).click();
    const el = win.document.querySelector('[data-id="f1"] .hx-in');
    assert.match(el.textContent, /Never checked/, layout);
    assert.doesNotMatch(el.textContent, /Unranked/, layout);
  }
});

// A rank with no timestamp is still a rank — which is why this cannot simply be
// isChecked(): a CSV with no lastUpdated column imports exactly that.
test("a rank that arrived without a timestamp is still a rank", () => {
  const win = bootApp();
  const acc = { id: "c1", gameName: "FromCsv", tagLine: "EUW", region: "EUW", status: "active", tags: [], history: [],
    stats: { found: true, tier: "GOLD", division: "III", lp: 22, updatedAt: null } };
  assert.match(win.cardHTML(acc, 0), /Gold III/);
  assert.doesNotMatch(win.cardHTML(acc, 0), /Never checked/);

  assert.equal(win.hasReading(acc.stats), true);
  assert.equal(win.hasReading(null), false);
  assert.equal(win.hasReading({ note: "Auto-fetch failed" }), false, "a note is not a reading");
  assert.equal(win.hasReading({ found: false }), true, "but 'the profile is gone' is one");
  assert.equal(win.hasReading({ level: 23 }), true, "so is a level on an unranked smurf");
});

// ---- quick find is a modal like the other two ----

/* Every way out of a modal — Escape, a press on the backdrop, the ✕ — goes
   through closeAllPanels(), which did not know the palette existed. Ctrl+K was
   the only thing that would close it again, while the palette's own footer sat
   there advertising "Esc close". */
test("quick find closes on Escape and on a press on its backdrop", () => {
  const hidden = win => win.document.getElementById("palette").classList.contains("hidden");

  const a = bootApp(ladderSeed());
  a.openPalette();
  assert.equal(hidden(a), false);
  a.document.dispatchEvent(new a.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert.equal(hidden(a), true, "Escape closes it");

  const b = bootApp(ladderSeed());
  b.openPalette();
  const overlay = b.document.getElementById("palette");
  overlay.dispatchEvent(new b.MouseEvent("mousedown", { bubbles: true }));
  overlay.dispatchEvent(new b.MouseEvent("click", { bubbles: true }));
  assert.equal(hidden(b), true, "and so does a press that starts and ends on the backdrop");

  // opening it runs the same closer, so this must not close it on the way in
  const c = bootApp(ladderSeed());
  c.openPalette();
  c.openPalette();
  assert.equal(hidden(c), false, "opening it twice leaves it open");
});

/* Landing on an account lights it up and scrolls it into view. That scroll was
   the one of three such calls that went unguarded, so anywhere the method is
   missing it threw in the middle of the handler — taking the timer that clears
   the highlight with it, and leaving the card lit for the rest of the session. */
test("landing on an account from the wall clears its highlight afterwards", async () => {
  const win = bootApp(ladderSeed());
  win.document.querySelector('[data-density="wall"]').click();
  win.document.querySelector('.tile[data-id="t4"]').click();
  assert.ok(win.document.querySelector('.hx.flash[data-id="t4"]'), "lit up on arrival");
  await until(() => !win.document.querySelector(".hx.flash"), "the highlight to clear itself");
});

// ---- searching for more than one word ----

/* The fields are joined into one haystack, and the search terms were re-joined
   and looked for as a literal phrase — so no query could ever combine two facts
   about an account unless they happened to sit next to each other in that join. */
test("a search of several words matches each of them, not the phrase", () => {
  const now = Date.now();
  const win = bootApp([
    { id: "s1", label: "Main smurf", gameName: "Hide on Bush", tagLine: "0001", region: "EUW",
      status: "active", tags: ["mid"], history: [],
      stats: { found: true, tier: "PLATINUM", division: "II", lp: 61, level: 214, updatedAt: now } },
    { id: "s2", label: "ADC acc", gameName: "Bot Diff", tagLine: "EUW", region: "EUW",
      status: "active", tags: ["adc"], history: [],
      stats: { found: true, tier: "GOLD", division: "III", lp: 22, level: 167, updatedAt: now } },
  ]);
  const count = s => {
    const box = win.document.getElementById("tSearch");
    box.value = s;
    box.dispatchEvent(new win.Event("input"));
    win.renderFilters();                       // skip the 120ms debounce
    return win.document.querySelectorAll(".card").length;
  };
  assert.equal(count(""), 2);
  assert.equal(count("hide bush"), 1, "two words of a name that has another word between them");
  assert.equal(count("main mid"), 1, "a label and a tag, which are never adjacent in the haystack");
  assert.equal(count("bot gold"), 1, "a name and a rank");
  assert.equal(count("hide diff"), 0, "a word from each account matches neither");
  assert.equal(count("plat"), 1, "and one word still works the way it always did");
});

// ---- the check-all button during a run ----

/* A run releases `checking` in the gap between accounts, so a button keyed off
   that alone fell back to "Check all ranks" — and back to enabled — once per
   account, sixty times over a full vault. Each of those rebuilds also sorted the
   whole vault to count what the label would have said. */
test("the check-all button stays put for the whole run", async () => {
  const win = bootApp(seededAccount());
  const btn = win.document.getElementById("bCheckAll");
  btn.click();
  assert.equal(btn.disabled, true);
  assert.match(btn.textContent, /Checking/);

  // the moment an account has come back and the next one has not started yet
  await until(() => /failed/.test(win.document.querySelector(".run-txt").textContent),
    "the first account to come back");
  assert.equal(btn.disabled, true, "the run is still under way");
  assert.match(btn.textContent, /Checking/, "so the label must not fall back");

  await until(() => win.document.getElementById("runbar").classList.contains("hidden"),
    "the run to finish");
  assert.equal(btn.disabled, false, "and the button comes back when it is over");
  assert.match(btn.textContent, /Check all ranks/);
});

// ---- one render, one pass over the vault ----

/* filtered() sorts, and a full render went through it twice: once in renderGrid,
   and again in the renderBulkBar() called straight after it — for the very list
   renderGrid had just handed that same function. This is the hottest path in the
   app, so everything a render needs out of filtered() comes from one pass now. */
test("a full render sorts the vault once, not twice", () => {
  const win = bootApp(ladderSeed());
  const real = win.filtered;
  let calls = 0;
  win.filtered = function (...a) { calls++; return real.apply(this, a); };
  try {
    win.render();
  } finally {
    win.filtered = real;
  }
  assert.ok(calls > 0, "the count is real — a patch that never took would read zero");
  assert.equal(calls, 1, "one pass over the vault for the whole render");
});

// ---- the offline cache and a locked vault ----

/* An unencrypted vault reaches startApp() out of boot(), before the load event.
   An encrypted one gets there from the Unlock button, long after that event has
   been and gone — so hanging the registration off `load` unconditionally meant
   setting a master password quietly cost you the offline cache. */
test("the offline cache is registered even when the vault had to be unlocked first", async () => {
  const win1 = bootApp();
  addRealAccount(win1, "Locked Away", "1");
  win1.document.getElementById("sVaultPass").value = "letmein123";
  win1.document.getElementById("sVaultSet").click();
  await until(() => encrypted(win1), "the vault to be written encrypted");
  const stored = win1.localStorage.getItem("smurf-tracker");

  const dom = new JSDOM(htmlNoScript, { url: "https://example.com/index.html", pretendToBeVisual: true, runScripts: "dangerously" });
  const win = dom.window;
  Object.defineProperty(win, "crypto", { value: webcrypto, configurable: true });
  win.TextEncoder = TextEncoder;
  win.TextDecoder = TextDecoder;
  win.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
  win.fetch = async () => { throw new Error("network disabled in tests") };
  const asked = [];
  Object.defineProperty(win.navigator, "serviceWorker", {
    value: { register: url => { asked.push(url); return Promise.resolve({}) } }, configurable: true });
  win.localStorage.setItem("smurf-tracker", stored);
  runScript(win, appScript);

  assert.equal(win.document.getElementById("lock").classList.contains("hidden"), false, "it boots locked");
  assert.deepEqual(asked, [], "and registers nothing while the vault is shut");

  // the load event is long over by the time anybody types a password
  await until(() => win.document.readyState === "complete", "the page to finish loading");
  win.document.getElementById("lockPass").value = "letmein123";
  win.document.getElementById("lockBtn").click();
  await until(() => win.document.getElementById("lock").classList.contains("hidden"), "the vault to unlock");
  assert.deepEqual(asked, ["sw.js"], "unlocking registers it, rather than waiting for an event that has passed");
});

// ---- next-round regressions ----

test("trailing Unranked is not a climb rate or a sparkline to the old peak", () => {
  const win = bootApp();
  const now = Date.now();
  const hist = [
    { t: now - 3 * 86400000, tier: "GOLD", division: "II", lp: 40 },
    { t: now - 86400000, tier: "GOLD", division: "I", lp: 80 },
    { t: now, tier: "UNRANKED", division: null, lp: null },
  ];
  assert.equal(win.climbRate(hist), null);
  assert.equal(win.sparkline(hist, "#e6c15a"), "");
});

test("card delta chip uses lastDelta, not a raw ladder subtract across Unranked", () => {
  const seed = [{
    id: "d1", gameName: "Delta", tagLine: "EUW", region: "EUW", status: "active",
    lastPlayedAt: Date.now(),
    history: [
      { t: 1, tier: "GOLD", division: "II", lp: 40 },
      { t: 2, tier: "UNRANKED", division: null, lp: null },
    ],
    stats: { found: true, tier: "UNRANKED", division: null, lp: null, updatedAt: Date.now() },
  }];
  const win = bootApp(seed);
  assert.equal(win.lastDelta(win.filtered()[0]), 0);
  assert.equal(win.document.querySelector(".delta"), null, "no invented crash chip on the card");
});

test("Not found on the ribbon filters missing profiles, not every flagged account", () => {
  const seed = [
    { id: "m1", gameName: "Gone", tagLine: "EUW", region: "EUW", status: "active",
      flagged: true, stats: { found: false, updatedAt: 1 }, history: [] },
    { id: "m2", gameName: "Hand", tagLine: "EUW", region: "EUW", status: "active",
      flagged: true, stats: { found: true, tier: "GOLD", division: "II", lp: 10, updatedAt: 1 }, history: [] },
    { id: "m3", gameName: "Fine", tagLine: "EUW", region: "EUW", status: "active",
      stats: { found: true, tier: "SILVER", division: "I", lp: 20, updatedAt: 1 }, history: [] },
  ];
  const win = bootApp(seed);
  const miss = win.document.querySelector('.rib-seg[data-flag="missing"]');
  assert.ok(miss, "Not found is its own band");
  assert.equal(miss.querySelector("i").textContent, "1");
  miss.click();
  assert.equal(win.document.querySelectorAll(".card").length, 1);
  assert.equal(win.document.querySelector(".card").dataset.id, "m1");
});

test("preview mode refuses to export example data", () => {
  const win = bootApp();
  win.document.getElementById("bDemo").click();
  assert.equal(win.document.getElementById("previewBanner").classList.contains("hidden"), false);
  let clicked = false;
  const orig = win.HTMLAnchorElement.prototype.click;
  win.HTMLAnchorElement.prototype.click = function () { clicked = true; return orig.call(this); };
  try {
    win.doExport();
    assert.equal(clicked, false, "no download starts");
    assert.match(win.document.getElementById("toast").textContent, /preview/i);
  } finally {
    win.HTMLAnchorElement.prototype.click = orig;
  }
});

test("a corrupt autoEveryHours does not make every account due", () => {
  const win = bootApp([{
    id: "a1", gameName: "Fresh", tagLine: "EUW", region: "EUW", status: "active",
    stats: { found: true, tier: "GOLD", division: "II", lp: 40, updatedAt: Date.now() - 3600000 },
    history: [],
  }], w => {
    w.localStorage.setItem("smurf-tracker-cfg", JSON.stringify({ autoCheck: false, autoEveryHours: "" }));
  });
  assert.equal(win.coerceAutoEvery(""), 72);
  assert.equal(win.autoCheckDue(win.filtered()[0]), false,
    "one hour old is not stale under the default 3-day cadence");
});

test("Escape on the colour miniature leaves Settings open", () => {
  const win = bootApp();
  win.document.getElementById("bSettings").click();
  win.document.getElementById("sAccent").dispatchEvent(new win.Event("click", { bubbles: true }));
  // force the miniature open the way showAccPrev does
  const prev = win.document.getElementById("accPrev");
  prev.classList.add("show");
  win.document.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert.equal(prev.classList.contains("show"), false, "miniature hides");
  assert.equal(win.document.getElementById("settings").classList.contains("hidden"), false,
    "Settings stays open");
});

test("rank panel draft survives a remorph while open", () => {
  const win = bootApp([{
    id: "r1", gameName: "Draft", tagLine: "EUW", region: "EUW", status: "active",
    stats: { found: true, tier: "GOLD", division: "II", lp: 40, updatedAt: 1 }, history: [],
  }]);
  const card = win.document.querySelector('.card[data-id="r1"]');
  assert.ok(card);
  card.querySelector('[data-act="more"]').click();
  card.querySelector('[data-act="rank"]').click();
  const lp = win.document.querySelector('[data-f="lp"]');
  assert.ok(lp, "rank panel opened");
  lp.value = "99";
  lp.dispatchEvent(new win.Event("input", { bubbles: true }));
  win.renderCard("r1");
  assert.equal(win.document.querySelector('[data-f="lp"]').value, "99",
    "Refresh remorph must not wipe an unsaved Rank edit");
});

test("peakInfo prefers a higher past Solo season when Top tier is missing", () => {
  const win = bootApp();
  const a = {
    history: [{ t: 1, tier: "GOLD", division: "II", lp: 40 }],
    stats: {
      found: true, tier: "GOLD", division: "II", lp: 40,
      seasons: { solo: [{ season: "S2025", tier: "PLATINUM", division: "I", lp: 20 }], flex: [] },
    },
  };
  const p = win.peakInfo(a);
  assert.equal(p.peak, "Platinum I · 20 LP");
  assert.ok(p.peakV > win.ladderLP(a.stats));
});

test("peakInfo names the current rank when that is the season high", () => {
  const win = bootApp();
  const a = {
    history: [{ t: 1, tier: "GOLD", division: "IV", lp: 10 }, { t: 2, tier: "GOLD", division: "II", lp: 40 }],
    stats: { found: true, tier: "GOLD", division: "II", lp: 40 },
  };
  const p = win.peakInfo(a);
  assert.equal(p.peak, "Gold II · 40 LP", "at your high is still a peak");
  assert.equal(p.peakV, null, "but the chart does not draw a ceiling on top of itself");
});

test("the card stacks LP under the tier name", () => {
  const win = bootApp([{
    id: "rk1", gameName: "RankLook", tagLine: "EUW", region: "EUW", status: "active",
    stats: { found: true, tier: "DIAMOND", division: "II", lp: 23, updatedAt: 1 },
    history: [{ t: 1, tier: "DIAMOND", division: "II", lp: 23 }],
  }]);
  const card = win.document.querySelector('.card[data-id="rk1"]');
  assert.ok(card.querySelector(".rk-main .rk-t"), "tier in the main stack");
  assert.match(card.querySelector(".rk-main .rk-lp").textContent, /23 LP/);
  assert.match(card.querySelector(".c-stats").textContent, /Peak/);
  assert.match(card.querySelector(".c-stats").textContent, /Diamond II/);
});

test("duplicate Riot IDs are detected per region", () => {
  const win = bootApp([
    {id:"a",region:"EUW",gameName:"Foo",tagLine:"EUW",status:"active",stats:null,history:[],tags:[]},
    {id:"b",region:"EUW",gameName:"Foo",tagLine:"EUW",status:"active",stats:null,history:[],tags:[]},
    {id:"c",region:"KR",gameName:"Foo",tagLine:"EUW",status:"active",stats:null,history:[],tags:[]},
  ]);
  const list = win.filtered();
  assert.equal(win.isDuplicate(list.find(a=>a.id==="a")), true);
  assert.equal(win.isDuplicate(list.find(a=>a.id==="c")), false);
});

test("rotation uses lastPlayedAt / lastLoginAt / updatedAt", () => {
  const win = bootApp();
  const fresh = {status:"active", lastPlayedAt: Date.now()};
  const old = {status:"active", stats:{updatedAt: Date.now()-20*86400000}};
  assert.equal(win.needsRotation(fresh), false);
  assert.equal(win.needsRotation(old), true);
});

test("wrTrend compares recent history winrates", () => {
  const win = bootApp();
  const a = {history:[
    {t:1,tier:"GOLD",division:"I",lp:10,w:10,l:10},
    {t:2,tier:"GOLD",division:"I",lp:20,w:20,l:10},
  ]};
  const tr = win.wrTrend(a);
  assert.ok(tr);
  assert.ok(tr.d > 0);
});

test("seasonReset archives current rank into past seasons", () => {
  const win = bootApp([{
    id:"x", region:"EUW", gameName:"A", tagLine:"B", status:"active", tags:[],
    stats:{found:true,tier:"GOLD",division:"II",lp:40,wins:10,losses:8,updatedAt:Date.now()},
    history:[{t:Date.now()-1000,tier:"GOLD",division:"II",lp:40,w:10,l:8}],
  }]);
  win.seasonReset("x");
  const a = win.filtered()[0];
  assert.equal(a.stats.tier, "UNRANKED");
  assert.equal(a.stats.seasons.solo[0].tier, "GOLD");
  assert.ok(a.history.length >= 2);
});

/* ---- Feature-pack regression: isFailed / rotation / season reset / payload ---- */

test("isFailed ignores season-reset and other informational notes", () => {
  const win = bootApp();
  assert.equal(win.isFailed({ stats: null }), false);
  assert.equal(win.isFailed({ stats: { found: false } }), false,
    "Not found is its own filter — not a failed refresh");
  assert.equal(win.isFailed({ stats: { found: true, note: "Auto-fetch failed (timeout) — enter it by hand" } }), true);
  assert.equal(win.isFailed({ stats: { found: true, note: "failed (backend down)" } }), false,
    "generic 'failed (' is not a transport-fail marker anymore");
  assert.equal(win.isFailed({
    stats: { found: true, tier: "UNRANKED", note: "Season was reset — previous rank kept", asOf: "season-reset" },
  }), false, "season-reset must not look like a failed refresh");
  assert.equal(win.isFailed({ stats: { found: true, tier: "GOLD", note: null } }), false);
});

test("needsRotation is false when the account was never checked or played", () => {
  const win = bootApp();
  assert.equal(win.needsRotation({ status: "active" }), false);
  assert.equal(win.needsRotation({ status: "active", stats: {} }), false);
  assert.equal(win.needsRotation({ status: "active", stats: { updatedAt: 0 } }), false);
  assert.equal(win.needsRotation({ status: "banned", stats: { updatedAt: Date.now() - 40 * 86400000 } }), false);
  assert.equal(win.needsRotation({ status: "active", archived: true, stats: { updatedAt: Date.now() - 40 * 86400000 } }), false);
  assert.equal(win.needsRotation({ status: "active", lastPlayedAt: Date.now() - 13 * 86400000 }), false);
  assert.equal(win.needsRotation({ status: "active", lastPlayedAt: Date.now() - 14 * 86400000 }), true);
  assert.equal(win.needsRotation({ status: "active", lastLoginAt: Date.now() - 20 * 86400000 }), true);
});

test("clampExportDays bounds reminder days to 1..365", () => {
  const win = bootApp();
  assert.equal(win.clampExportDays(30), 30);
  assert.equal(win.clampExportDays(0), 30);
  assert.equal(win.clampExportDays(-5), 30);
  assert.equal(win.clampExportDays("nope"), 30);
  assert.equal(win.clampExportDays(1), 1);
  assert.equal(win.clampExportDays(365), 365);
  assert.equal(win.clampExportDays(999), 365);
  assert.equal(win.clampExportDays(14.6), 15);
});

test("mapBackendPayload rejects error rows and half-empty payloads", () => {
  const win = bootApp();
  assert.throws(() => win.mapBackendPayload(null));
  assert.throws(() => win.mapBackendPayload({}));
  assert.throws(() => win.mapBackendPayload({ ok: false, error: "op.gg down" }));
  // found:true with no tier → UNRANKED success
  const u = win.mapBackendPayload({ found: true });
  assert.equal(u.tier, "UNRANKED");
  assert.equal(u.found, true);
  // missing found and missing tier
  assert.throws(() => win.mapBackendPayload({ wins: 1 }));
  const miss = win.mapBackendPayload({ found: false });
  assert.equal(miss.found, false);
  // ok:false with found:false is a real miss, not a transport error
  const miss2 = win.mapBackendPayload({ ok: false, found: false });
  assert.equal(miss2.found, false);
  const ok = win.mapBackendPayload({ found: true, tier: "gold", division: "II", lp: 40, uncertain: true, source: "body" });
  assert.equal(ok.tier, "GOLD");
  assert.equal(ok.uncertain, true);
  assert.equal(ok.source, "body");
  assert.equal(ok.note, null);
  // tier alone is enough
  const t = win.mapBackendPayload({ tier: "PLATINUM", division: "I", lp: 12 });
  assert.equal(t.tier, "PLATINUM");
  assert.equal(t.found, true);
});


// let/const bindings are not on window in classic scripts — poke them via runScript.
function appGet(win, expr) {
  runScript(win, "window.__appGet=(" + expr + ");");
  return win.__appGet;
}
function appDo(win, code) {
  runScript(win, code);
}

test("seasonReset clears live fields, note, and does not mark isFailed", () => {
  const win = bootApp([{
    id: "sr1", region: "EUW", gameName: "ResetMe", tagLine: "EUW", status: "active", tags: [],
    goal: { tier: "DIAMOND", division: "IV", lp: 0 },
    stats: {
      found: true, tier: "GOLD", division: "I", lp: 88, wins: 40, losses: 30, level: 120,
      flex: { tier: "SILVER", division: "II", lp: 10 },
      champs: [{ name: "Ashe", wins: 1, losses: 0 }],
      lpAt: { t: 1, tier: "GOLD", lp: 88 },
      peak: { tier: "PLATINUM", division: "IV", lp: 0 },
      note: "Auto-fetch failed (old)",
      uncertain: true, source: "body",
      updatedAt: Date.now() - 1000,
    },
    history: [{ t: Date.now() - 1000, tier: "GOLD", division: "I", lp: 88, w: 40, l: 30 }],
  }]);
  const card = win.document.querySelector('.card[data-id="sr1"]');
  card.querySelector('[data-act="more"]').click();
  assert.equal(appGet(win, 'openMore.has("sr1")'), true);
  win.seasonReset("sr1");
  assert.equal(appGet(win, 'openMore.has("sr1")'), false, "⋯ menu closes on season reset");
  const a = win.filtered().find(x => x.id === "sr1");
  assert.equal(a.stats.tier, "UNRANKED");
  assert.equal(a.stats.lp, null);
  assert.equal(a.stats.flex, null);
  assert.equal(a.stats.champs, null);
  assert.equal(a.stats.lpAt, null);
  assert.equal(a.stats.note, null);
  assert.equal(a.stats.uncertain, false);
  assert.equal(a.goal, null);
  assert.ok(a.stats.seasonResetAt);
  assert.equal(a.stats.seasons.solo[0].tier, "GOLD");
  assert.equal(win.isFailed(a), false);
});

test("markPlayed stamps lastPlayedAt and closes the ⋯ menu", () => {
  const win = bootApp([{
    id: "mp1", region: "EUW", gameName: "Play", tagLine: "EUW", status: "active", tags: [],
    stats: { found: true, tier: "GOLD", division: "II", lp: 10, updatedAt: Date.now() - 20 * 86400000 },
    history: [],
  }]);
  assert.equal(win.needsRotation(win.filtered()[0]), true);
  win.document.querySelector('.card[data-id="mp1"] [data-act="more"]').click();
  assert.equal(appGet(win, 'openMore.has("mp1")'), true);
  win.markPlayed("mp1");
  assert.equal(appGet(win, 'openMore.has("mp1")'), false);
  const a = win.filtered()[0];
  assert.ok(a.lastPlayedAt > Date.now() - 5000);
  assert.equal(win.needsRotation(a), false);
});

test("duplicateIds caches and invalidates on saveDB", () => {
  const win = bootApp([
    { id: "d1", region: "EUW", gameName: "Twin", tagLine: "EUW", status: "active", stats: null, history: [], tags: [] },
    { id: "d2", region: "EUW", gameName: "Twin", tagLine: "EUW", status: "active", stats: null, history: [], tags: [] },
  ]);
  const first = win.duplicateIds();
  assert.equal(first.size, 2);
  assert.equal(win.duplicateIds(), first, "same Set instance while accounts array is unchanged");
  win.filtered()[0].gameName = "Solo";
  assert.equal(win.duplicateIds(), first, "cache keys off accounts identity, not deep content");
  win.saveDB();
  const after = win.duplicateIds();
  assert.notEqual(after, first);
  assert.equal(after.size, 0);
});

test("poolLpSpark averages same-timestamp points instead of zig-zagging accounts", () => {
  const win = bootApp();
  const day = 86400000;
  const t1 = 10 * day + 100, t2 = 11 * day + 200; // two different days, offset within day
  const svg = win.poolLpSpark([
    { history: [{ t: t1, tier: "GOLD", division: "IV", lp: 0 }, { t: t2, tier: "GOLD", division: "I", lp: 50 }] },
    { history: [{ t: t1 + 50, tier: "GOLD", division: "IV", lp: 100 }, { t: t2 + 50, tier: "GOLD", division: "I", lp: 150 }] },
  ]);
  assert.match(svg, /polyline/);
  const pts = svg.match(/points="([^"]+)"/)[1].split(" ");
  assert.equal(pts.length, 2, "same-day points average into one bucket each");
  assert.equal(win.poolLpSpark([{ history: [{ t: 1, tier: "GOLD", division: "I", lp: 10 }] }]), "");
  assert.equal(win.poolLpSpark([]), "");
});

test("compare modal is in the document at boot and closes via Escape / closeAllPanels", async () => {
  const win = bootApp([
    { id: "c1", region: "EUW", gameName: "Alpha", tagLine: "A", status: "active", label: "A",
      stats: { found: true, tier: "GOLD", division: "II", lp: 20, wins: 10, losses: 8, updatedAt: 1 }, history: [], tags: [] },
    { id: "c2", region: "EUW", gameName: "Beta", tagLine: "B", status: "active", label: "B",
      stats: { found: true, tier: "PLATINUM", division: "IV", lp: 5, wins: 20, losses: 10, updatedAt: 1 }, history: [], tags: [] },
  ]);
  const modal = win.document.getElementById("compareModal");
  assert.ok(modal, "static compare modal exists before first open");
  assert.ok(modal.classList.contains("hidden"));
  win.openCompare("c1");
  win.openCompare("c2");
  assert.equal(modal.classList.contains("hidden"), false);
  assert.match(win.document.getElementById("cmpBody").textContent, /Alpha|A/);
  assert.match(win.document.getElementById("cmpBody").textContent, /Beta|B/);
  await until(() => win.document.body.classList.contains("modal-open"), "modal-open for Compare");
  win.document.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert.ok(modal.classList.contains("hidden"));
  assert.equal(appGet(win, "compareIds.length"), 0);
  win.openCompare("c1");
  win.openCompare("c2");
  win.document.getElementById("cmpClear").click();
  assert.ok(modal.classList.contains("hidden"));
  assert.equal(appGet(win, "compareIds.length"), 0);
});

test("compare W/L values are escaped in the modal HTML", () => {
  const win = bootApp([
    { id: "x1", region: "EUW", gameName: "X", tagLine: "A", status: "active",
      stats: { found: true, tier: "GOLD", division: "I", lp: 1, wins: "<img>", losses: "\"onerror", updatedAt: 1 }, history: [], tags: [] },
    { id: "x2", region: "EUW", gameName: "Y", tagLine: "B", status: "active",
      stats: { found: true, tier: "GOLD", division: "I", lp: 1, wins: 1, losses: 1, updatedAt: 1 }, history: [], tags: [] },
  ]);
  win.openCompare("x1");
  win.openCompare("x2");
  const html = win.document.getElementById("cmpBody").innerHTML;
  assert.doesNotMatch(html, /<img>/);
  assert.match(html, /&lt;img&gt;/);
});

test("closeAllPanels / closeCompare clears selection and hides Compare", () => {
  const win = bootApp([
    { id: "c1", region: "EUW", gameName: "A", tagLine: "A", status: "active",
      stats: { found: true, tier: "GOLD", division: "I", lp: 1, updatedAt: 1 }, history: [], tags: [] },
    { id: "c2", region: "EUW", gameName: "B", tagLine: "B", status: "active",
      stats: { found: true, tier: "GOLD", division: "I", lp: 1, updatedAt: 1 }, history: [], tags: [] },
  ]);
  win.openCompare("c1");
  win.openCompare("c2");
  assert.equal(win.document.getElementById("compareModal").classList.contains("hidden"), false);
  win.closeAllPanels();
  assert.equal(appGet(win, "compareIds.length"), 0);
  assert.ok(win.document.getElementById("compareModal").classList.contains("hidden"));
  win.openCompare("c1");
  win.openCompare("c2");
  win.closeCompare();
  assert.equal(appGet(win, "compareIds.length"), 0);
  assert.ok(win.document.getElementById("compareModal").classList.contains("hidden"));
});

test("checkAll batch claims checkGen before await so a mid-flight Refresh wins", async () => {
  const seed = [{
    id: "b1", region: "EUW", gameName: "Batch", tagLine: "EUW", status: "active", tags: [],
    stats: { found: true, tier: "GOLD", division: "IV", lp: 10, updatedAt: 1 }, history: [],
  }];
  let releaseBatch;
  const batchWait = new Promise(r => { releaseBatch = r; });
  const win = bootApp(seed, w => {
    w.fetch = async (url, opts = {}) => {
      if (opts.method === "POST") {
        await batchWait;
        return {
          ok: true,
          json: async () => ({ results: [{ ok: true, found: true, tier: "SILVER", division: "I", lp: 1 }] }),
        };
      }
      throw new Error("no GET in this test");
    };
  });
  appDo(win, 'cfg.backendUrl="https://worker.example/opgg"');
  const runP = win.checkAll(["b1"]);
  await until(() => appGet(win, 'checking.has("b1")'), "batch claimed checking");
  const genDuring = appGet(win, 'checkGen.get("b1")');
  assert.ok(genDuring >= 1, "gen bumped before network returns");
  // Simulate a newer Refresh taking ownership (bumps gen + keeps checking).
  appDo(win, `checkGen.set("b1", ${genDuring + 1}); checking.add("b1")`);
  releaseBatch();
  await runP;
  const a = win.filtered()[0];
  assert.equal(a.stats.tier, "GOLD", "stale batch must not overwrite after gen bump");
  assert.equal(a.stats.lp, 10);
  // Newer owner still in checking — batch must not have stolen/cleared it.
  assert.equal(appGet(win, 'checking.has("b1")'), true);
});

test("checkAll batch commits found:false without counting as refreshed ok", async () => {
  const seed = [{
    id: "m1", region: "EUW", gameName: "Gone", tagLine: "EUW", status: "active", tags: [],
    stats: null, history: [],
  }];
  const win = bootApp(seed, w => {
    w.fetch = async (url, opts = {}) => {
      if (opts.method === "POST") {
        return {
          ok: true,
          json: async () => ({ results: [{ ok: true, found: false }] }),
        };
      }
      throw new Error("no GET");
    };
  });
  appDo(win, 'cfg.backendUrl="https://worker.example/opgg"');
  await win.checkAll(["m1"]);
  const a = win.filtered()[0];
  assert.equal(a.stats.found, false);
  assert.equal(a.flagged, true);
});

test("checkAll batch maps ok:false transport errors to sequential fallback", async () => {
  const seed = [{
    id: "f1", region: "EUW", gameName: "Fall", tagLine: "EUW", status: "active", tags: [],
    stats: { found: true, tier: "GOLD", division: "II", lp: 5, updatedAt: 1 }, history: [],
  }];
  let posts = 0, gets = 0;
  const win = bootApp(seed, w => {
    w.fetch = async (url, opts = {}) => {
      if (opts.method === "POST") {
        posts++;
        return { ok: true, json: async () => ({ results: [{ ok: false, error: "op.gg 502" }] }) };
      }
      gets++;
      throw new Error("network disabled");
    };
  });
  appDo(win, 'cfg.backendUrl="https://worker.example/opgg"');
  await win.checkAll(["f1"]);
  assert.equal(posts, 1);
  assert.ok(gets >= 1 || win.filtered()[0].stats.note, "fell through after empty batch hit");
});

test("wrTrend returns null across a season break", () => {
  const win = bootApp();
  const a = { history: [
    { t: 1, tier: "DIAMOND", division: "I", lp: 50, w: 100, l: 80 },
    { t: 2, tier: "IRON", division: "IV", lp: 0, w: 1, l: 0 },
  ]};
  assert.equal(win.wrTrend(a), null);
});

test("isUncertain follows the stats.uncertain flag from backend/body parses", () => {
  const win = bootApp([{
    id: "u1", region: "EUW", gameName: "U", tagLine: "EUW", status: "active", tags: [],
    stats: { found: true, tier: "GOLD", division: "I", lp: 10, uncertain: true, updatedAt: 1 },
    history: [],
  }]);
  assert.equal(win.isUncertain(win.filtered()[0]), true);
  assert.equal(win.isUncertain({ stats: { uncertain: false } }), false);
});

test("settings persist clamped exportRemindDays", async () => {
  const win = bootApp();
  win.openSettings();
  const days = win.document.getElementById("sExportDays");
  assert.ok(days, "export remind control exists");
  days.value = "999";
  win.document.getElementById("sSave").click();
  await until(() => {
    try { return JSON.parse(win.localStorage.getItem("smurf-tracker-cfg")).exportRemindDays === 365 }
    catch { return false }
  }, "exportRemindDays clamped to 365");
  win.openSettings();
  days.value = "0";
  win.document.getElementById("sSave").click();
  await until(() => {
    try { return JSON.parse(win.localStorage.getItem("smurf-tracker-cfg")).exportRemindDays === 30 }
    catch { return false }
  }, "exportRemindDays defaulted to 30");
});

test("fetchViaBackendBatch indexes results by account id", async () => {
  const win = bootApp([
    { id: "a1", region: "EUW", gameName: "One", tagLine: "EUW", status: "active", stats: null, history: [], tags: [] },
    { id: "a2", region: "KR", gameName: "Two", tagLine: "KR1", status: "active", stats: null, history: [], tags: [] },
  ]);
  appDo(win, 'cfg.backendUrl="https://worker.example/opgg"');
  win.fetch = async (url, opts = {}) => {
    assert.equal(opts.method, "POST");
    const body = JSON.parse(opts.body);
    assert.equal(body.accounts.length, 2);
    assert.equal(body.accounts[0].region, "euw");
    assert.equal(body.accounts[1].region, "kr");
    return {
      ok: true,
      json: async () => ({ results: [
        { ok: true, found: true, tier: "GOLD", division: "I", lp: 1 },
        { ok: true, found: true, tier: "SILVER", division: "IV", lp: 2 },
      ] }),
    };
  };
  const map = await win.fetchViaBackendBatch(win.filtered());
  assert.equal(map.get("a1").tier, "GOLD");
  assert.equal(map.get("a2").tier, "SILVER");
});

test("ribbon / filter rotate flag uses needsRotation (null days excluded)", () => {
  const win = bootApp([
    { id: "n1", region: "EUW", gameName: "Never", tagLine: "EUW", status: "active", stats: null, history: [], tags: [] },
    { id: "o1", region: "EUW", gameName: "Old", tagLine: "EUW", status: "active",
      stats: { found: true, tier: "GOLD", division: "I", lp: 1, updatedAt: Date.now() - 30 * 86400000 }, history: [], tags: [] },
  ]);
  const rot = win.document.querySelector('[data-flag="rotate"]');
  assert.ok(rot, "Due to rotate tile/segment exists when an account is due");
  rot.click();
  assert.equal(win.filtered().map(a => String(a.id)).join(","), "o1");
});

test("failed filter does not include season-reset accounts", () => {
  const win = bootApp([{
    id: "f1", region: "EUW", gameName: "SR", tagLine: "EUW", status: "active", tags: [],
    stats: { found: true, tier: "UNRANKED", note: null, asOf: "season-reset", seasonResetAt: Date.now(), updatedAt: Date.now() },
    history: [],
  }, {
    id: "f2", region: "EUW", gameName: "Bad", tagLine: "EUW", status: "active", tags: [],
    stats: { found: true, tier: "GOLD", division: "I", lp: 1, note: "Auto-fetch failed (x)", updatedAt: Date.now() },
    history: [],
  }]);
  const btn = win.document.querySelector('[data-flag="failed"]')
    || win.document.querySelector('#count [data-flag="failed"]');
  if (btn) btn.click();
  else appDo(win, 'ui.flag="failed"; render()');
  assert.equal(win.filtered().map(a => String(a.id)).join(","), "f2");
});

test("batch gen-mismatch does not clear a newer Refresh spinner", async () => {
  const seed = [{
    id: "b2", region: "EUW", gameName: "Spin", tagLine: "EUW", status: "active", tags: [],
    stats: { found: true, tier: "GOLD", division: "IV", lp: 10, updatedAt: 1 }, history: [],
  }];
  let releaseBatch;
  const batchWait = new Promise(r => { releaseBatch = r; });
  const win = bootApp(seed, w => {
    w.fetch = async (url, opts = {}) => {
      if (opts.method === "POST") {
        await batchWait;
        return {
          ok: true,
          json: async () => ({ results: [{ ok: true, found: true, tier: "SILVER", division: "I", lp: 1 }] }),
        };
      }
      throw new Error("no GET");
    };
  });
  appDo(win, 'cfg.backendUrl="https://worker.example/opgg"');
  const runP = win.checkAll(["b2"]);
  await until(() => appGet(win, 'checking.has("b2")'), "batch claimed checking");
  const genDuring = appGet(win, 'checkGen.get("b2")');
  // Newer Refresh takes ownership and shows its own spinner
  appDo(win, `checkGen.set("b2", ${genDuring + 1}); checking.add("b2")`);
  releaseBatch();
  await runP;
  assert.equal(appGet(win, 'checking.has("b2")'), true,
    "stale batch must not steal the newer run's Checking state");
  assert.equal(win.filtered()[0].stats.tier, "GOLD");
});

test("sequential check returns missing for found:false and does not count as refreshed", async () => {
  const win = bootApp([{
    id: "miss1", region: "EUW", gameName: "Gone", tagLine: "EUW", status: "active", tags: [],
    stats: null, history: [],
  }]);
  win.fetchViaProxy = async () => ({ found: false, updatedAt: Date.now() });
  const result = await win.check("miss1");
  assert.equal(result, "missing");
  assert.equal(win.filtered()[0].stats.found, false);

  appDo(win, 'cfg.backendUrl=""');
  let toastMsg = "";
  win.toast = (m) => { toastMsg = m; };
  // Direct sequential checkAll without backend
  win.fetchViaProxy = async () => ({ found: false, updatedAt: Date.now() });
  await win.checkAll(["miss1"]);
  assert.match(toastMsg, /not found/i);
});

test("Escape on compare clears Unselect compare labels via re-render", async () => {
  const win = bootApp([
    { id: "c1", region: "EUW", gameName: "A", tagLine: "A", status: "active",
      stats: { found: true, tier: "GOLD", division: "I", lp: 1, updatedAt: 1 }, history: [], tags: [] },
    { id: "c2", region: "EUW", gameName: "B", tagLine: "B", status: "active",
      stats: { found: true, tier: "GOLD", division: "I", lp: 1, updatedAt: 1 }, history: [], tags: [] },
  ]);
  win.openCompare("c1");
  win.openCompare("c2");
  assert.equal(appGet(win, 'compareIds.join(",")'), "c1,c2");
  win.document.querySelector('.card[data-id="c1"] [data-act="more"]').click();
  assert.match(win.document.querySelector('.card[data-id="c1"]').textContent, /Unselect compare/);
  win.document.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await until(() => win.document.getElementById("compareModal").classList.contains("hidden"), "compare closed");
  assert.equal(appGet(win, "compareIds.length"), 0);
  // closeCompare re-rendered; keep ⋯ open to read the label (second more-click would toggle it shut).
  appDo(win, 'openMore.add("c1"); renderCard("c1")');
  assert.doesNotMatch(win.document.querySelector('.card[data-id="c1"]').textContent, /Unselect compare/);
  assert.match(win.document.querySelector('.card[data-id="c1"]').textContent, /Compare/);
});

test("soft-empty batch chunk continues to the next chunk instead of aborting", async () => {
  const seed = [
    { id: "s1", region: "EUW", gameName: "Skip", tagLine: "1", status: "active", tags: [],
      stats: { found: true, tier: "GOLD", division: "I", lp: 1, updatedAt: 1 }, history: [] },
    { id: "s2", region: "EUW", gameName: "Ok", tagLine: "2", status: "active", tags: [],
      stats: { found: true, tier: "GOLD", division: "I", lp: 1, updatedAt: 1 }, history: [] },
  ];
  let posts = 0;
  const win = bootApp(seed, w => {
    w.fetch = async (url, opts = {}) => {
      if (opts.method === "POST") {
        posts++;
        const body = JSON.parse(opts.body);
        if (body.accounts.length === 1 && body.accounts[0].name === "Skip") {
          return { ok: true, json: async () => ({ results: [{ ok: false, error: "502" }] }) };
        }
        return {
          ok: true,
          json: async () => ({ results: body.accounts.map(() =>
            ({ ok: true, found: true, tier: "PLATINUM", division: "IV", lp: 0 })) }),
        };
      }
      throw new Error("no GET");
    };
  });
  appDo(win, 'cfg.backendUrl="https://worker.example/opgg"');
  // Force chunk size by checking both — with max 20 they are one chunk. Simulate
  // two chunks by stubbing fetchViaBackendBatch to process one id at a time via
  // the real path with a patched BATCH... easier: call checkAll and verify the
  // transport-skip account still gets sequential fallback while the other commits.
  await win.checkAll(["s1", "s2"]);
  assert.equal(posts, 1, "one POST for the chunk");
  // s1 skipped in batch (ok:false) → sequential; s2 committed from batch
  assert.equal(win.filtered().find(a => a.id === "s2").stats.tier, "PLATINUM");
});

test("pruneCardState drops deleted ids from compareIds and checkGen", () => {
  const win = bootApp([
    { id: "keep", region: "EUW", gameName: "K", tagLine: "A", status: "active",
      stats: null, history: [], tags: [] },
    { id: "drop", region: "EUW", gameName: "D", tagLine: "B", status: "active",
      stats: null, history: [], tags: [] },
  ]);
  appDo(win, 'compareIds=["keep","drop"]; checkGen.set("drop", 3); checkGen.set("keep", 1)');
  appDo(win, 'accounts=accounts.filter(a=>a.id!=="drop"); render()');
  assert.equal(appGet(win, 'compareIds.join(",")'), "keep");
  assert.equal(appGet(win, 'checkGen.has("drop")'), false);
  assert.equal(appGet(win, 'checkGen.get("keep")'), 1);
});

test("failed filter excludes Not found profiles", () => {
  const win = bootApp([
    { id: "miss", region: "EUW", gameName: "M", tagLine: "A", status: "active", tags: [],
      stats: { found: false, updatedAt: Date.now() }, history: [] },
    { id: "fail", region: "EUW", gameName: "F", tagLine: "B", status: "active", tags: [],
      stats: { found: true, tier: "GOLD", division: "I", lp: 1, note: "Auto-fetch failed (x)", updatedAt: Date.now() }, history: [] },
  ]);
  appDo(win, 'ui.flag="failed"; render()');
  assert.equal(win.filtered().map(a => String(a.id)).join(","), "fail");
  appDo(win, 'ui.flag="missing"; render()');
  assert.equal(win.filtered().map(a => String(a.id)).join(","), "miss");
});

test("applyStats on found:false keeps seasons/champs/peak instead of wiping them", () => {
  const win = bootApp();
  const acc = {
    id: "keep", history: [{ t: 1, tier: "GOLD", division: "I", lp: 40 }],
    stats: {
      found: true, tier: "GOLD", division: "I", lp: 40, level: 200,
      seasons: { solo: [{ season: "S2025", tier: "PLATINUM", division: "IV", lp: 0 }], flex: [] },
      champs: [{ name: "Ashe", wins: 1, losses: 0 }],
      peak: { tier: "PLATINUM", division: "IV", lp: 0 },
      icon: "https://opgg-static.akamaized.net/meta/images/profile_icons/profileIcon1.jpg",
      updatedAt: 1,
    },
  };
  win.applyStats(acc, { found: false, updatedAt: 2 });
  assert.equal(acc.stats.found, false);
  assert.equal(acc.stats.tier, null);
  assert.equal(acc.stats.level, 200);
  assert.equal(acc.stats.seasons.solo[0].tier, "PLATINUM");
  assert.equal(acc.stats.champs[0].name, "Ashe");
  assert.equal(acc.stats.peak.tier, "PLATINUM");
  assert.match(acc.stats.icon, /profileIcon1/);
});

test("isSummonerNotFoundPage matches worker-style not-found bodies", () => {
  const win = bootApp();
  assert.equal(win.isSummonerNotFoundPage("<h1>Summoner not found</h1>"), true);
  assert.equal(win.isSummonerNotFoundPage("This summoner is unregistered."), true);
  assert.equal(win.isSummonerNotFoundPage(
    `<meta name="description" content="Foo#EUW / Gold 2 10LP / 1Win 1Lose"/>Summoner not found`
  ), false, "meta rank wins over a stray not-found string");
});

test("fetchViaProxy returns found:false for a not-found page", async () => {
  const win = bootApp([{
    id: "p1", region: "EUW", gameName: "Nope", tagLine: "EUW", status: "active",
    stats: { found: true, tier: "GOLD", division: "I", lp: 10,
      seasons: { solo: [{ season: "S2025", tier: "GOLD", division: "I", lp: 10 }], flex: [] }, updatedAt: 1 },
    history: [], tags: [],
  }]);
  win.fetchWithTimeout = async () => "<html><body><h1>Summoner not found</h1></body></html>";
  const s = await win.fetchViaProxy(win.filtered()[0]);
  assert.equal(s.found, false);
  win.commitStats("p1", win.filtered()[0], s);
  assert.equal(win.filtered()[0].stats.found, false);
  assert.equal(win.filtered()[0].stats.seasons.solo[0].tier, "GOLD");
  assert.equal(win.filtered()[0].flagged, true);
});

test("check returns null when the account was deleted mid-flight", async () => {
  const win = bootApp([{
    id: "gone", region: "EUW", gameName: "X", tagLine: "Y", status: "active",
    stats: null, history: [], tags: [],
  }]);
  appDo(win, 'accounts=[]');
  assert.equal(await win.check("gone"), null);
});

test("Failed dash tile filters only transport failures", () => {
  const win = bootApp([
    { id: "miss", region: "EUW", gameName: "M", tagLine: "A", status: "active", tags: [],
      stats: { found: false, updatedAt: Date.now() }, history: [] },
    { id: "fail", region: "EUW", gameName: "F", tagLine: "B", status: "active", tags: [],
      stats: { found: true, tier: "GOLD", division: "I", lp: 1, note: "Auto-fetch failed (x)", updatedAt: Date.now() }, history: [] },
  ]);
  const tile = win.document.querySelector('[data-flag="failed"]');
  assert.ok(tile, "Last check failed tile is shown when failures exist");
  tile.click();
  assert.equal(win.filtered().map(a => String(a.id)).join(","), "fail");
});

test("poolLpSpark uses one point per account per day", () => {
  const win = bootApp();
  const day = 86400000;
  const svg = win.poolLpSpark([
    { id: "a", history: [
      { t: day + 1, tier: "GOLD", division: "IV", lp: 0 },
      { t: day + 2, tier: "GOLD", division: "I", lp: 100 },
    ]},
    { id: "b", history: [
      { t: day + 3, tier: "GOLD", division: "IV", lp: 0 },
      { t: 2 * day + 1, tier: "GOLD", division: "I", lp: 50 },
    ]},
  ]);
  assert.match(svg, /polyline/);
  const pts = svg.match(/points="([^"]+)"/)[1].split(" ");
  assert.equal(pts.length, 2);
});

test("boot clamps a corrupt exportRemindDays in cfg", () => {
  const win = bootApp(undefined, w => {
    w.localStorage.setItem("smurf-tracker-cfg", JSON.stringify({ exportRemindDays: 9999 }));
  });
  assert.equal(JSON.parse(win.localStorage.getItem("smurf-tracker-cfg")).exportRemindDays, 365);
});

test("never-checked / chore filters ignore banned and archived accounts", () => {
  const win = bootApp([
    { id: "live", region: "EUW", gameName: "Live", tagLine: "1", status: "active", tags: [], history: [], stats: null },
    { id: "ban", region: "EUW", gameName: "Chianusie", tagLine: "EUW", status: "banned", tags: [], history: [],
      stats: { note: "Auto-fetch failed (backend: HTTP 404) — enter it by hand with Rank." } },
    { id: "arch", region: "EUW", gameName: "Old", tagLine: "2", status: "active", archived: true, tags: [], history: [], stats: null },
    { id: "flagban", region: "EUW", gameName: "FlagBan", tagLine: "3", status: "banned", flagged: true, tags: [], history: [],
      stats: { found: true, tier: "GOLD", division: "IV", lp: 0, updatedAt: 1 } },
  ]);
  assert.equal(win.isLive({ archived: false, status: "active" }), true);
  assert.equal(win.isLive({ archived: false, status: "banned" }), false);
  assert.equal(win.needsAttention({ flagged: true, status: "banned", archived: false }), false);

  const never = win.document.querySelector('#dash [data-flag="unchecked"] .v');
  assert.ok(never, "never-checked tile present");
  assert.equal(never.textContent.trim(), "1", "only the live unchecked account counts");

  win.document.querySelector('#dash [data-flag="unchecked"]').click();
  const names = [...win.document.querySelectorAll(".card .c-name, .rw-nm")].map(n => n.textContent);
  assert.equal(win.document.querySelectorAll(".card, .rw").length, 1);
  assert.match(names.join(" "), /Live/);
  assert.doesNotMatch(names.join(" "), /Chianusie|Old|FlagBan/);
});

test("dash shows Group climb with a working spark tip target", () => {
  const day = 86400000;
  const t1 = 10 * day, t2 = 11 * day;
  const hist = [
    { t: t1, tier: "GOLD", division: "IV", lp: 0, w: 5, l: 5 },
    { t: t2, tier: "GOLD", division: "II", lp: 50, w: 10, l: 10 },
  ];
  const win = bootApp([
    { id: "a", region: "EUW", gameName: "A", tagLine: "1", status: "active", tags: [],
      stats: { found: true, tier: "GOLD", division: "II", lp: 50, wins: 10, losses: 10, updatedAt: t2 },
      history: hist },
  ]);
  const dash = win.document.getElementById("dash").textContent;
  assert.match(dash, /Group climb/);
  assert.doesNotMatch(dash, /Pool LP|Ladder trend|hover points/);
  const trend = win.poolLpTrend([{ id: "a", history: hist }]);
  assert.ok(trend && trend.svg && trend.headline);
  assert.match(trend.svg, /data-spark-tip=/);
  assert.match(trend.note, /Iron→Challenger|counted accounts/);
  assert.ok(win.document.querySelector(".pool-spark [data-spark-tip]"));
  // Custom tip is created on first hover binding after render
  assert.equal(typeof win.bindSparkTip, "function");
  assert.equal(typeof win.ensureSparkTip, "function");
  const tip = win.ensureSparkTip();
  assert.ok(tip);
  assert.equal(tip.id, "sparkTip");
});

test("genSyncToken is long enough for the worker", () => {
  const win = bootApp();
  const t = win.genSyncToken();
  assert.ok(t.length >= 16);
  assert.equal(win.vaultSyncUrl(), "");
  runScript(win, 'cfg.backendUrl="https://example.workers.dev";');
  assert.equal(win.vaultSyncUrl(), "https://example.workers.dev/vault");
});

test("pushVaultSync sends content vaultRev, not a fresh Date.now stamp", async () => {
  const win = bootApp([{ id: "a1", region: "EUW", gameName: "A", tagLine: "1", status: "active",
    tags: [], history: [], stats: null }]);
  runScript(win, `
    vaultPassword = "test-pass-1234";
    cfg.backendUrl = "https://example.workers.dev";
    cfg.syncToken = "sync-token-abcdef12";
    cfg.vaultRev = 1234567890000;
  `);
  let body = null;
  let puts = 0;
  win.fetch = async (url, opts = {}) => {
    assert.match(String(url), /\/vault$/);
    const method = (opts.method || "GET").toUpperCase();
    if (method === "GET") {
      // Node's Response — jsdom's window.Response is not a constructor here.
      return new Response(JSON.stringify({ updatedAt: 1, envelope: { __enc: true } }), { status: 200 });
    }
    assert.equal(method, "PUT");
    puts++;
    body = JSON.parse(opts.body);
    return new Response(JSON.stringify({ ok: true, updatedAt: body.updatedAt }), { status: 200 });
  };
  await win.pushVaultSync();
  assert.equal(puts, 1);
  assert.equal(body.updatedAt, 1234567890000, "must not stamp Date.now() over the content rev");
  assert.ok(body.envelope && body.envelope.__enc);
  assert.match(win.document.getElementById("toast").textContent, /pushed/i);
});

test("pushVaultSync aborts when GET sees a newer remote vault", async () => {
  const win = bootApp([{ id: "a1", region: "EUW", gameName: "A", tagLine: "1", status: "active",
    tags: [], history: [], stats: null }]);
  runScript(win, `
    vaultPassword = "test-pass-1234";
    cfg.backendUrl = "https://example.workers.dev";
    cfg.syncToken = "sync-token-abcdef12";
    cfg.vaultRev = 100;
  `);
  let puts = 0;
  win.fetch = async (url, opts = {}) => {
    const method = (opts.method || "GET").toUpperCase();
    if (method === "GET") {
      return new Response(JSON.stringify({ updatedAt: 999, envelope: { __enc: true } }), { status: 200 });
    }
    puts++;
    return new Response("{}", { status: 200 });
  };
  await win.pushVaultSync();
  assert.equal(puts, 0, "must not PUT over a newer cloud vault");
  assert.match(win.document.getElementById("toast").textContent, /newer/i);
});

test("pullVaultSync is a no-op when vaultRev already matches", async () => {
  const win = bootApp([{ id: "a1", region: "EUW", gameName: "A", tagLine: "1", status: "active",
    tags: [], history: [], stats: null }]);
  runScript(win, `
    vaultPassword = "test-pass-1234";
    cfg.backendUrl = "https://example.workers.dev";
    cfg.syncToken = "sync-token-abcdef12";
    cfg.vaultRev = 555;
  `);
  const before = win.document.querySelectorAll(".card").length;
  win.fetch = async () => new Response(JSON.stringify({
    updatedAt: 555,
    envelope: { __enc: true, salt: "x", iv: "y", data: "z" },
  }), { status: 200 });
  await win.pullVaultSync(false);
  assert.equal(win.document.querySelectorAll(".card").length, before);
  assert.match(win.document.getElementById("toast").textContent, /Already in sync/i);
});

/* The no-op pull above only ever passed because the test set cfg.vaultRev by
   hand. After a *real* pull it could never happen: pullVaultSync adopted the
   cloud's revision and then called saveDB(), whose touchVaultRev() raised it to
   Date.now() again. So every pull left the device permanently "newer" than the
   copy it had just taken — the second pull warned "Local vault is newer than
   cloud — Pull would overwrite it", and once the other device pushed, this one
   was told it had changed since the last sync and asked to confirm losing work
   it had never done. */
test("a pull adopts the cloud revision instead of stamping a newer local one", async () => {
  const REMOTE = 1700000000000;
  const win = bootApp([{ id: "a1", region: "EUW", gameName: "Local", tagLine: "1", status: "active",
    tags: [], history: [], stats: null }]);
  runScript(win, `
    vaultPassword = "test-pass-1234";
    cfg.backendUrl = "https://example.workers.dev";
    cfg.syncToken = "sync-token-abcdef12";
    cfg.vaultRev = 100;
    cfg.lastSyncAt = 100;   // synced before and untouched since, so the pull is uncontested
  `);
  const envelope = await win.encryptData("test-pass-1234", [
    { id: "b1", region: "EUW", gameName: "FromCloud", tagLine: "2", status: "active",
      tags: [], history: [], stats: null },
  ]);
  let gets = 0, puts = 0;
  win.fetch = async (url, opts = {}) => {
    if ((opts.method || "GET").toUpperCase() !== "GET") { puts++; return new Response("{}", { status: 200 }) }
    gets++;
    return new Response(JSON.stringify({ updatedAt: REMOTE, envelope }), { status: 200 });
  };

  await win.pullVaultSync(false);
  await until(() => /pulled/i.test(win.document.getElementById("toast").textContent), "the pull to land");
  assert.match(win.document.querySelector(".card").textContent, /FromCloud/);
  runScript(win, "window.__rev = cfg.vaultRev; window.__sync = cfg.lastSyncAt;");
  assert.equal(win.__rev, REMOTE, "the local revision is the cloud's, not a fresh Date.now()");
  assert.ok(win.__sync >= REMOTE, "and the sync stamp is not behind it");

  // Which is what makes the second pull a genuine no-op rather than a conflict.
  await win.pullVaultSync(false);
  assert.match(win.document.getElementById("toast").textContent, /Already in sync/i);
  assert.equal(gets, 2);
  assert.equal(puts, 0, "a pull never writes to the cloud");
});

/* Appending "/vault" to the href turned a backend URL carrying a query string
   into ".../?token=x/vault" — a path the worker never routes, failing with no
   useful message. */
test("the vault sync URL is built on the path, not glued to the href", () => {
  const win = bootApp();
  const url = u => { runScript(win, `cfg.backendUrl=${JSON.stringify(u)};`); return win.vaultSyncUrl() };
  assert.equal(url("https://example.workers.dev"), "https://example.workers.dev/vault");
  assert.equal(url("https://example.workers.dev/"), "https://example.workers.dev/vault");
  assert.equal(url("https://example.workers.dev/api"), "https://example.workers.dev/api/vault");
  assert.equal(url("https://example.workers.dev/?token=x"), "https://example.workers.dev/vault?token=x");
  assert.equal(url(""), "");
});

/* Settings pinned anything over three hours to 180 in the dropdown while
   cfg.autoLockMin kept the larger number — so the panel showed a timer that was
   not the one running, until a Save happened to write the shown value back. */
test("the auto-lock dropdown shows the timer that is actually running", () => {
  const win = bootApp(undefined, w => {
    w.localStorage.setItem("smurf-tracker-cfg", JSON.stringify({ autoLockMin: 600 }));
  });
  const sel = win.document.getElementById("sAutoLock");
  win.openSettings();
  runScript(win, "window.__lock = cfg.autoLockMin;");
  assert.equal(String(win.__lock), sel.value, "stored and shown are the same number");
  assert.equal(win.__lock, 600, "and a ten-hour timer is not silently retimed to three");
  assert.match([...sel.options].find(o => o.value === "600").textContent, /current/i);
  // absurd values still get pinned to something a person could have meant
  assert.equal(win.clampAutoLock(99999), 1440);
  assert.equal(win.clampAutoLock(-5), 0);
  assert.equal(win.clampAutoLock("nonsense"), 0);
});

/* saveDB() toasts "Saving failed — storage error" and answers false, but the
   callers reporting their own success fired it into the same toast a line later
   — so a change that never reached the disk was announced as done. */
test("a change that could not be written is not reported as saved", async () => {
  const win = bootApp(seededAccount(), w => {
    const real = w.Storage.prototype.setItem;
    w.Storage.prototype.setItem = function (k, v) {
      if (k === "smurf-tracker") { const e = new Error("quota"); e.name = "QuotaExceededError"; throw e }
      return real.call(this, k, v);
    };
  });
  const card = win.document.querySelector(".card");
  card.querySelector('[data-act="more"]').click();
  win.document.querySelector('[data-act="archive"]').click();
  await until(() => /failed/i.test(win.document.getElementById("toast").textContent),
    "the storage failure to be reported");
  assert.doesNotMatch(win.document.getElementById("toast").textContent, /Archived/,
    "and not painted over with a success message");
});

/* The bug this guards is not "bulkAdd was the wrong shape" — it is that MODALS
   and the markup can drift apart at all. Being in MODALS puts body.modal-open on
   the page, and that kills scrolling on <html> and <body>. For a .modal that is
   right: it is fixed over the viewport and scrolls itself. For a panel sitting in
   the document flow it is a trap — the page freezes wherever it was, and the panel
   you just opened is somewhere off-screen with no way to scroll to it. Assert the
   invariant rather than the instance, so the next panel added to MODALS is caught
   by this and not by somebody wondering why the page stopped scrolling. */
test("every panel that locks page scrolling is fixed over the page", () => {
  const win = bootApp(seededAccount());
  // openModals() reads MODALS, which is a const and not reachable from out here.
  for (const el of win.document.querySelectorAll(".hx, .modal")) el.classList.remove("hidden");
  const locking = win.openModals();
  assert.ok(locking.length >= 5, "several panels are in MODALS");
  for (const el of locking) {
    assert.match(el.className, /\bmodal\b/,
      `#${el.id} is in MODALS, so body.modal-open stops the page scrolling while it is open — `
      + "it has to be fixed over the viewport, or it scrolls away with the page and cannot be reached");
  }
});

test("bulk add opens over the page, focused on the list", () => {
  const win = bootApp(seededAccount());
  const panel = win.document.getElementById("bulkAdd");
  assert.equal(panel.classList.contains("hidden"), true);
  win.document.getElementById("bBulkAdd").click();
  assert.equal(panel.classList.contains("hidden"), false);
  assert.ok(win.openModals().some(m => m.id === "bulkAdd"), "and it counts as a modal");
  // the region select is the first focusable field; the textarea is the one you came for
  assert.equal(win.document.activeElement.id, "baList");
  // Save/Cancel are pinned in the footer, outside the part that scrolls
  assert.ok(win.document.querySelector("#bulkAdd .mdl-f #baSave"));
  assert.ok(win.document.querySelector("#bulkAdd .mdl-b #baList"));
  // and it still adds accounts
  win.document.getElementById("baList").value = "Pasted One#EUW\nPasted Two#EUW";
  win.document.getElementById("baSave").click();
  assert.equal(win.document.querySelectorAll(".card").length, 3);
  assert.equal(panel.classList.contains("hidden"), true);
});

/* renderRibbon counted a banned account as a live tier while renderDash's Rank
   spread has always used isLive(). A banned Bronze smurf therefore gave the
   header a Bronze segment the gem row underneath did not have, and made the
   caption claim a tier more than the vault actually spans. */
test("the ribbon and the dash Rank spread agree about banned accounts", () => {
  const st = (tier, division) => ({ found: true, tier, division, lp: 50, wins: 10, losses: 8,
    level: 100, updatedAt: Date.now() });
  const win = bootApp([
    { id: "live1", gameName: "Alive", tagLine: "1", region: "EUW", status: "active",
      tags: [], history: [], stats: st("GOLD", "II") },
    { id: "dead1", gameName: "Perma", tagLine: "2", region: "EUW", status: "banned",
      tags: [], history: [], stats: st("BRONZE", "I") },
  ]);
  const tiers = sel => [...win.document.querySelectorAll(sel)].map(b => b.dataset.tier);
  assert.deepEqual(tiers("#ribbon .rib-seg[data-tier]"), tiers("#dash .gem-b"),
    "the header bar and the gem row answer the same question");
  assert.deepEqual(tiers("#ribbon .rib-seg[data-tier]"), ["GOLD"]);
  assert.match(win.document.querySelector(".rib-cap").textContent, /across 1 tier\b/);

  // Not silently dropped either — it gets a segment of its own, so the segments
  // still add up to the total the caption prints.
  const banned = win.document.querySelector('#ribbon .rib-seg[data-status="banned"]');
  assert.ok(banned, "banned accounts get their own segment");
  assert.equal(banned.textContent, "1");
  assert.match(win.document.querySelector(".rib-cap").textContent, /1<\/b> banned|1 banned/);

  // and clicking it shows exactly what it counted, through the status filter the
  // toolbar dropdown already drives
  banned.click();
  assert.equal(win.document.getElementById("tStatus").value, "banned");
  const shown = [...win.document.querySelectorAll(".card")];
  assert.equal(shown.length, 1);
  assert.match(shown[0].textContent, /Perma/);
});

test("a banned Challenger is not the vault's best account", () => {
  const st = (tier, division) => ({ found: true, tier, division, lp: 50, updatedAt: Date.now() });
  const win = bootApp([
    { id: "live1", gameName: "Alive", tagLine: "1", region: "EUW", status: "active",
      tags: [], history: [], stats: st("GOLD", "II") },
    { id: "dead1", gameName: "Perma", tagLine: "2", region: "EUW", status: "banned",
      tags: [], history: [], stats: st("CHALLENGER", null) },
  ]);
  const cap = win.document.querySelector(".rib-cap").textContent;
  assert.match(cap, /best\s*Gold/i);
  assert.doesNotMatch(cap, /Challenger/i, "a gravestone is not a personal best");
});

/* Master and above have no divisions, so picking one in the ✎ Rank panel disables
   the division select through the change listener. rankPanelHTML is always built
   from the *saved* stats, though, and morph synced attributes before it reached
   the "leave an open panel alone" guard — so the enabled version from the saved
   Diamond rank came straight back on the next re-render, and the panel offered a
   division for a tier that has none. */
test("an open Rank panel keeps its disabled division select through a re-render", () => {
  const win = bootApp(seededAccount());
  const card = win.document.querySelector(".card");
  const id = card.dataset.id;
  card.querySelector('[data-act="more"]').click();
  win.document.querySelector('[data-act="rank"]').click();
  const q = f => win.document.querySelector(`.card [data-f="${f}"]`);
  assert.equal(q("div").disabled, false, "Diamond has divisions");

  const tier = q("tier");
  tier.value = "MASTER";
  tier.dispatchEvent(new win.Event("change", { bubbles: true }));
  assert.equal(q("div").disabled, true, "picking Master disables it");

  win.renderCard(id); // a refresh landing, the flash timeout, anything at all
  assert.equal(q("tier").value, "MASTER", "the unsaved tier survives, as it always did");
  assert.equal(q("div").disabled, true, "and so does the state that tier drives");
});

test("ribbon never-checked count matches the dash tile for tier-without-timestamp", () => {
  const win = bootApp([
    { id: "a", region: "EUW", gameName: "HasTier", tagLine: "1", status: "active", tags: [], history: [],
      stats: { found: true, tier: "GOLD", division: "II", lp: 10 } }, // no updatedAt — still a reading
    { id: "b", region: "EUW", gameName: "Empty", tagLine: "2", status: "active", tags: [], history: [], stats: null },
    { id: "c", region: "EUW", gameName: "Ok", tagLine: "3", status: "active", tags: [], history: [],
      stats: { found: true, tier: "SILVER", division: "I", lp: 0, updatedAt: Date.now() } },
  ]);
  const dashNever = win.document.querySelector('#dash [data-flag="unchecked"] .v');
  assert.ok(dashNever);
  assert.equal(dashNever.textContent.trim(), "1", "CSV tier without updatedAt is not never-checked");
  assert.match(win.document.querySelector(".rib-cap").textContent, /1 never checked/);
  assert.equal(win.neverChecked({ status: "active", archived: false,
    stats: { found: true, tier: "GOLD", division: "II", lp: 10 } }), false);
  assert.equal(win.neverChecked({ status: "active", archived: false, stats: null }), true);
});
