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

function bootApp() {
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

test("a single check is not a chart", () => {
  const win = bootApp();
  assert.equal(win.rankChart([{ t: 1, tier: "GOLD", division: "I", lp: 10 }]), "");
  assert.equal(win.rankChart([]), "");
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

test("a card's note can be written in place and survives an unrelated re-render", () => {
  const win = bootApp();
  addRealAccount(win, "NoteGuy", "1234");

  win.document.querySelector('[data-act="more"]').click();
  win.document.querySelector('[data-act="note"]').click();
  assert.ok(win.document.querySelector('[data-f="notetext"]'), "editor must render");

  typeNote(win, "smurf for duo queue");
  win.renderGrid(); // must not throw the draft away
  assert.equal(win.document.querySelector('[data-f="notetext"]').value, "smurf for duo queue");

  win.document.querySelector('[data-act="notesave"]').click();
  assert.equal(storedNote(win), "smurf for duo queue");
  assert.match(win.document.querySelector(".c-notes").textContent, /smurf for duo queue/);
  assert.equal(win.document.querySelector('[data-f="notetext"]'), null, "editor closes after save");
});

test("clicking a rendered note reopens it, and cancel leaves the saved text untouched", () => {
  const win = bootApp();
  addRealAccount(win, "NoteGuy", "1234");
  win.document.querySelector('[data-act="more"]').click();
  win.document.querySelector('[data-act="note"]').click();
  typeNote(win, "original");
  win.document.querySelector('[data-act="notesave"]').click();

  win.document.querySelector('[data-act="noteedit"]').click();
  assert.equal(win.document.querySelector('[data-f="notetext"]').value, "original");
  typeNote(win, "throw this away");
  win.document.querySelector('[data-act="notecancel"]').click();
  assert.equal(storedNote(win), "original");
  assert.match(win.document.querySelector(".c-notes").textContent, /original/);
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
