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

test("boots clean with an empty vault, no accounts", () => {
  const win = bootApp();
  assert.equal(win.document.querySelectorAll(".card").length, 0);
  assert.match(win.document.getElementById("grid").textContent, /No accounts yet/);
  assert.equal(win.document.getElementById("appRoot").classList.contains("hidden"), false);
  assert.equal(win.document.getElementById("lock").classList.contains("hidden"), true);
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

test("applyStats: dedupes unchanged ranks (refreshes timestamp, no new history row) and flags tier-ups", () => {
  const win = bootApp();
  const acc = { history: [] };
  assert.equal(win.applyStats(acc, { found: true, tier: "GOLD", division: "II", lp: 40, updatedAt: 1 }), false);
  assert.equal(acc.history.length, 1);

  assert.equal(win.applyStats(acc, { found: true, tier: "GOLD", division: "II", lp: 40, updatedAt: 2 }), false);
  assert.equal(acc.history.length, 1, "unchanged rank must not push a new history entry");
  assert.equal(acc.history[0].t, 2, "unchanged rank must still refresh the timestamp");

  assert.equal(win.applyStats(acc, { found: true, tier: "PLATINUM", division: "IV", lp: 0, updatedAt: 3 }), true);
  assert.equal(acc.history.length, 2);
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
  await new Promise(r => setTimeout(r, 150));

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
  await new Promise(r => setTimeout(r, 150));

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
  await new Promise(r => setTimeout(r, 100));
  assert.equal(win.document.querySelectorAll(".card").length, 1);
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
  await new Promise(r => setTimeout(r, 300));
  assert.equal(win.document.querySelectorAll(".card").length, 1);

  win.relock();
  assert.equal(win.document.getElementById("lock").classList.contains("hidden"), false);
  assert.equal(win.document.getElementById("appRoot").classList.contains("hidden"), true);
  // accounts itself isn't observable from outside (module-scoped `let`, not a window property) —
  // the wrong-password check below is the black-box proof that in-memory state was actually cleared/reset
  win.document.getElementById("lockPass").value = "wrong password";
  win.document.getElementById("lockBtn").click();
  await new Promise(r => setTimeout(r, 300));
  assert.equal(win.document.getElementById("lockErr").style.display, "block");
  assert.equal(win.document.getElementById("lock").classList.contains("hidden"), false);

  win.document.getElementById("lockPass").value = "lockme123";
  win.document.getElementById("lockBtn").click();
  await new Promise(r => setTimeout(r, 300));
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
  await new Promise(r => setTimeout(r, 300));
  let raw = JSON.parse(win.localStorage.getItem("smurf-tracker"));
  assert.equal(raw.__enc, true);

  win.document.getElementById("sVaultRemove").click(); // confirm() is stubbed to always return true
  await new Promise(r => setTimeout(r, 300));
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
  await new Promise(r => setTimeout(r, 300));
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
  await new Promise(r => setTimeout(r, 300));
  assert.equal(win2.document.getElementById("lockErr").style.display, "block");
  assert.equal(win2.document.getElementById("lock").classList.contains("hidden"), false, "wrong password must not unlock");

  win2.document.getElementById("lockPass").value = "letmein123";
  win2.document.getElementById("lockBtn").click();
  await new Promise(r => setTimeout(r, 300));
  assert.equal(win2.document.getElementById("lock").classList.contains("hidden"), true);
  assert.equal(win2.document.getElementById("appRoot").classList.contains("hidden"), false);
  assert.equal(win2.document.querySelectorAll(".card").length, 1);
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

  // and a shape that cannot be trusted is dropped rather than bending the chart
  assert.equal(win.normLpAt({ t: Date.now() + 9e9, tier: "GOLD", lp: 5 }), null, "no future dates");
  assert.equal(win.normLpAt({ t: reached, tier: "NOPE", lp: 5 }), null);
  assert.equal(win.normLpAt(null), null);
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

  setAutoCheck(win, { hours: 1, rankedOnly: true });
  assert.equal(win.autoCheckDue(acc("GOLD", 9)), true);
  assert.equal(win.autoCheckDue(acc("UNRANKED", 9)), false, "an unranked account answers the same every time");
  // a never-checked account has no rank *yet*; skipping it would leave it stuck
  // outside the filter permanently, with no way in
  assert.equal(win.autoCheckDue(acc(null, 0)), true, "it still needs its first check");

  setAutoCheck(win, { hours: 1, rankedOnly: false });
  assert.equal(win.autoCheckDue(acc("UNRANKED", 9)), true, "off again, unranked is back in");
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

  assert.match(summary(), /^4 of 4 ranked$/);
  sel().value = "PLATINUM";
  sel().dispatchEvent(new win.Event("change", { bubbles: true }));
  assert.match(summary(), /^1 of 4 ranked · 3 left out$/);
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
  await new Promise(r => setTimeout(r, 200));
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

// The total was computed from a coerced 0 while the label printed the raw value,
// so a source reporting wins but no losses rendered "10W L".
test("a missing loss count renders as 0, not as a bare L", () => {
  const seed = seededAccount();
  seed[0].stats.wins = 10;
  seed[0].stats.losses = null;

  const win = bootApp(seed);
  assert.match(win.document.querySelector(".wl").textContent, /10W 0L/);

  win.document.querySelector('[data-density="list"]').click();
  assert.match(win.document.querySelector(".rw-wr").textContent, /10W 0L/);
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
  await new Promise(r => setTimeout(r, 150));

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
  await new Promise(r => setTimeout(r, 400));
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
  await new Promise(r => setTimeout(r, 400));

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
  await new Promise(r => setTimeout(r, 200));
  assert.equal(win.document.querySelectorAll(".card").length, 1);
  assert.deepEqual(chips(), ['"Alpha"'], "the search says so");

  win.document.getElementById("tFav").click();
  assert.deepEqual(chips(), ["Favorites", '"Alpha"', "Clear all"]);

  win.document.querySelector('[data-clear="all"]').click();
  assert.deepEqual(chips(), []);
  assert.equal(win.document.querySelectorAll(".card").length, 2, "and the grid comes back");
});

// ---- Settings and Help as modal panels ----

// They are launched from the header tray and have nothing to do with the grid, so
// as inline panels they just shoved sixty cards down the page.
test("Settings and Help open over the page, the account form still opens in it", () => {
  const win = bootApp(seededAccount());
  const cls = id => win.document.getElementById(id).className;
  assert.match(cls("settings"), /\bmodal\b/);
  assert.match(cls("help"), /\bmodal\b/);
  // the console's own panels act on the collection right below them and stay put
  assert.doesNotMatch(cls("form"), /\bmodal\b/);
  assert.doesNotMatch(cls("bulkAdd"), /\bmodal\b/);

  const s = win.document.getElementById("settings");
  assert.equal(s.getAttribute("role"), "dialog");
  assert.equal(s.getAttribute("aria-modal"), "true");
  assert.ok(win.document.getElementById(s.getAttribute("aria-labelledby")), "labelled by a real element");
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
                    "sAccent", "sAccent2", "sAccentReset", "sSave", "sClose"]) {
    const el = win.document.getElementById(id);
    assert.ok(el, `#${id} still exists`);
    assert.ok(win.document.getElementById("settings").contains(el), `#${id} is inside the dialog`);
  }
  assert.ok(win.document.querySelector("#settings [data-close-panel]"), "and the ✕ closer");
  assert.ok(win.document.getElementById("help").contains(win.document.getElementById("bHelpClose")));
});

test("the settings body is grouped rather than one flat run of fields", () => {
  const win = bootApp();
  const groups = [...win.document.querySelectorAll("#settings .grp-h")].map(g => g.textContent.trim());
  assert.deepEqual(groups, ["Rank checks", "Automatic refresh", "Alerts", "Security", "Appearance"]);
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
  await new Promise(r => setTimeout(r, 200));
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
