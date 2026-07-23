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
