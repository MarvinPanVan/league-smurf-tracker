// The worker parses op.gg itself, so the app's test suite never touched it — and a
// broken regex there is invisible: the file still parses, the worker still returns
// 200, the fields just come back null. These run its parsers against real op.gg
// output in both shapes a page can arrive in.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseRankText, parseLevelText, parsePeakText, parseSeasons, parseFlex,
  parseChampions, parseChampionTable, parseChampionsMeta, parseProfileIcon,
  parseLpHistory, stripRows, riotOne, lookupOne, handleBatch, riotForm, resetChampNames, runWatch, carryBank,
} from "../cloudflare-worker.js";

// The shape op.gg actually serves, reduced but structurally faithful — this is
// what every one of these parsers was getting wrong. Three things matter here and
// none of them survive a naive flatten:
//   * cells carry their own <div>s, so splitting on </div> lands mid-row and
//     scatters one season across three lines
//   * the Riot ID heading is two elements, so the text reads "764 name # tag"
//   * each champion's matchup breakdown is a <table> nested inside its own row
const REAL_PROFILE = `
<title>terminallucidity#final - Summoner stats</title>
<meta name="description" content="terminallucidity#final / Diamond 1 1 52LP / 190Win 215Lose Win rate 47% / Ashe - 15Win 10Lose Win rate 60%, Smolder - 15Win 7Lose Win rate 68%, Ezreal - 8Win 11Lose Win rate 42%"/>
<img src="https://opgg-static.akamaized.net/meta/images/profile_icons/profileIcon7131.jpg?image=q_auto"/>
<div class="mt-[-11px] text-center"><span class="inline-flex h-5">764</span></div>
<h1><strong>terminallucidity</strong><span>#</span><span>final</span></h1>
<div><strong>diamond 1</strong><span>52 LP</span><div>190W 215L Win rate 47%</div></div>
<div><img alt="master" src="/images/medals_new/master.png?w=72"/> master 393 LP <span>Top tier</span></div>
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

// The /champions sub-page, where the season totals actually live.
const REAL_CHAMPIONS = `
<table><tbody>
  <tr><th>#</th><th>Champion</th><th>Played</th><th>KDA</th></tr>
  <tr><td>-</td><td>All champions</td><td>193 W 215 L 47%</td><td>2.13:1</td><td>6.6 / 6.4 / 7 (45%)</td></tr>
  <tr><td>1</td><td>Ashe</td><td>15 W 10 L 60%</td><td>2.25:1</td><td>6 / 6.8 / 9.3 (48%)</td>
    <td><table><tbody>
      <tr><td>vs Ezreal</td><td>3 W 3 L 50%</td><td>1.63:1</td><td>4.8 / 9.0 / 9.8</td></tr>
      <tr><td>vs Draven</td><td>1 W 1 L 50%</td><td>2.40:1</td><td>8.5 / 7.5 / 9.5</td></tr>
    </tbody></table></td></tr>
  <tr><td>2</td><td>Smolder</td><td>15 W 7 L 68%</td><td>3.01:1</td><td>9 / 5.9 / 8.8 (51%)</td></tr>
</tbody></table>`;

test("past seasons come off the real table, with the LP intact", () => {
  const s = parseSeasons(REAL_PROFILE);
  // "Emerald · 2 LP" was the division digit being read as the LP, because the
  // cells had been scattered onto separate lines before the pattern ever ran
  assert.deepEqual(Array.from(s.solo, e => `${e.season} ${e.tier}${e.division ? " " + e.division : ""} ${e.lp}`),
    ["S2025 MASTER 135", "S2024 S1 EMERALD II 57"]);
  assert.deepEqual(Array.from(s.flex, e => `${e.season} ${e.tier} ${e.division} ${e.lp}`), ["S2025 SILVER II 37"]);
});

test("the level is found even though the Riot ID is split across elements", () => {
  // the flattened text reads "764 terminallucidity # final" — matching the literal
  // "name#tag" only ever hit the <title>, where no number precedes it
  assert.equal(parseLevelText(REAL_PROFILE, "terminallucidity", "final"), 764);
  assert.equal(parseLevelText(REAL_PROFILE, "SomebodyElse", "EUW"), null);
});

test("champions come off the sub-page table, nested matchup rows and all", () => {
  const c = parseChampionTable(REAL_CHAMPIONS);
  // a non-greedy <table>…</table> closes on the inner matchup table and loses
  // everything after the first champion
  assert.deepEqual(Array.from(c, x => x.name), ["Ashe", "Smolder"]);
  assert.deepEqual({ ...c[0] },
    { name: "Ashe", wins: 15, losses: 10, games: 25, wr: 60, kda: 2.25, k: 6, d: 6.8, a: 9.3 });
  assert.equal(parseChampionTable("<p>no rows</p>"), null);
});

test("the profile's own description is the champion fallback when the sub-page fails", () => {
  const c = parseChampionsMeta(REAL_PROFILE);
  assert.deepEqual(Array.from(c, x => `${x.name} ${x.wins}-${x.losses} ${x.wr}%`),
    ["Ashe 15-10 60%", "Smolder 15-7 68%", "Ezreal 8-11 42%"]);
  assert.equal(c[0].kda, null, "the description carries no KDA, and none is invented");
  assert.equal(parseChampionsMeta("<p>nothing</p>"), null);
});

test("the one LP-history point op.gg server-renders is read, with its own date", () => {
  // the rest of the tier graph arrives over an internal RPC; this entry is in the
  // page and carries when the LP was actually reached rather than when we looked
  const page = `<div>{"lpHistories":[{"created_at":"2026-07-23T03:21:28+09:00","tier_info":{"lp":129,"tier":"MASTER","label":"M 1"},"elo_point":2570}]}</div>`;
  const p = parseLpHistory(page);
  assert.equal(p.tier, "MASTER");
  assert.equal(p.lp, 129);
  assert.equal(p.division, null, "Master has no division");
  assert.equal(p.elo, 2570);
  assert.equal(new Date(p.t).toISOString().slice(0, 10), "2026-07-22");

  assert.equal(parseLpHistory(`{"created_at":"2026-07-23T03:21:28+09:00","tier_info":{"lp":57,"tier":"EMERALD","label":"E 2"}}`).division, "II");
  assert.equal(parseLpHistory("<p>nothing</p>"), null);
  // a date in the future would drag the chart somewhere the account never was
  assert.equal(parseLpHistory(`{"created_at":"2099-01-01T00:00:00+09:00","tier_info":{"lp":1,"tier":"GOLD","label":"G 1"}}`), null);
  assert.equal(parseLpHistory(`{"created_at":"2026-07-23T03:21:28+09:00","tier_info":{"lp":1,"tier":"WOOD","label":"W 1"}}`), null);
});

test("the peak and current rank still read off the real markup", () => {
  const r = parseRankText(REAL_PROFILE);
  assert.equal(r.tier, "DIAMOND");
  assert.equal(r.lp, 52);
  assert.deepEqual({ ...parsePeakText(REAL_PROFILE) }, { tier: "MASTER", division: null, lp: 393 });
  assert.deepEqual({ ...parseFlex(REAL_PROFILE) }, { tier: "UNRANKED", division: null, lp: null });
  assert.equal(parseProfileIcon(REAL_PROFILE),
    "https://opgg-static.akamaized.net/meta/images/profile_icons/profileIcon7131.jpg");
});

// Trimmed from a live profile, keeping op.gg's real markup shape.
const PROFILE_HTML = `
<div class="profile">
  <img src="https://opgg-static.akamaized.net/meta/images/profile_icons/profileIcon7131.jpg?image=q_auto&amp;v=1784841908" alt="">
  <span class="level">764</span>
  <h1>terminallucidity#final</h1>
  <ul><li>EUW</li><li><a href="/lol/leaderboards/tier">Ladder Rank 23,862 (0.7712% of top)</a></li></ul>
</div>
<div class="rank">
  <img alt="diamond" src="https://opgg-static.akamaized.net/images/medals_new/diamond.png?w=144">
  <strong>diamond 1</strong><span>52 LP</span>
  <div>190W 215L Win rate 47%</div>
</div>
<div class="peak">
  <img alt="master" src="https://opgg-static.akamaized.net/images/medals_new/master.png?w=72">
  <strong>master</strong><span>393 LP</span><em>Top tier</em>
</div>
<table><caption>Ranked Solo/Duo Season Tier LP</caption><tbody>
  <tr><td>S2025</td><td><img src="medals_mini/master.png">master</td><td>135</td></tr>
  <tr><td>S2024 S1</td><td><img src="medals_mini/emerald.png">emerald 2</td><td>57</td></tr>
</tbody></table>
<div>Ranked Flex</div>
<div>Unranked</div>
<table><caption>Ranked Flex Season Tier LP</caption><tbody>
  <tr><td>S2025</td><td><img src="medals_mini/silver.png">silver 2</td><td>37</td></tr>
</tbody></table>
<ul>
  <li><a href="/champions/ashe/build"><img alt="Ashe" src="Ashe.png"></a><a href="/champions/ashe/build">Ashe</a>CS 209 (7.2)  2.25:1 KDA 6 / 6.8 / 9.3 60%25 Games</li>
  <li><a href="/champions/smolder/build"><img alt="Smolder" src="Smolder.png"></a><a href="/champions/smolder/build">Smolder</a>CS 257 (8.6)  3.01:1 KDA 9 / 5.9 / 8.8 68%22 Games</li>
</ul>`;

test("the current rank, W/L and profile icon come off a real page", () => {
  const r = parseRankText(PROFILE_HTML);
  assert.equal(r.tier, "DIAMOND");
  assert.equal(r.division, "I");
  assert.equal(r.lp, 52);
  assert.equal(r.wins, 190);
  assert.equal(r.losses, 215);
  assert.equal(parseProfileIcon(PROFILE_HTML),
    "https://opgg-static.akamaized.net/meta/images/profile_icons/profileIcon7131.jpg");
});

test("the summoner level is found, which is the whole reason this file changed", () => {
  // op.gg prints it as a bare number with no label; the anchor is the Riot ID
  // heading right after it. This is what came back null on every backend check.
  assert.equal(parseLevelText(PROFILE_HTML, "terminallucidity", "final"), 764);
  assert.equal(parseLevelText(PROFILE_HTML, "SomebodyElse", "EUW"), null);
  assert.equal(parseLevelText("", "x", "y"), null);
});

test("the season peak comes off the Top tier badge, LP intact", () => {
  assert.deepEqual({ ...parsePeakText(PROFILE_HTML) }, { tier: "MASTER", division: null, lp: 393 });
  // the division must not swallow the first digit: this used to read 93 LP
  assert.equal(parsePeakText("master 393 LP Top tier").lp, 393);
  assert.deepEqual({ ...parsePeakText("emerald 2 57 LP Top tier") }, { tier: "EMERALD", division: "II", lp: 57 });
  assert.equal(parsePeakText("<strong>gold 4</strong><span>12 LP</span>"), null);
});

test("past seasons are split by queue", () => {
  const s = parseSeasons(PROFILE_HTML);
  assert.deepEqual(Array.from(s.solo, e => `${e.season} ${e.tier}${e.division ? " " + e.division : ""} ${e.lp}`),
    ["S2025 MASTER 135", "S2024 S1 EMERALD II 57"]);
  assert.deepEqual(Array.from(s.flex, e => `${e.season} ${e.tier} ${e.division} ${e.lp}`), ["S2025 SILVER II 37"]);
  assert.equal(parseSeasons("<p>no tables here</p>"), null);
});

test("the flex rank is read, and not confused with the solo one", () => {
  assert.deepEqual({ ...parseFlex(PROFILE_HTML) }, { tier: "UNRANKED", division: null, lp: null });
  assert.deepEqual({ ...parseFlex("<div>Ranked Flex</div><div><strong>gold 2</strong>45 LP</div>") },
    { tier: "GOLD", division: "II", lp: 45 });
  assert.equal(parseFlex("<div>Ranked Solo/Duo</div><div><strong>gold 2</strong>45 LP</div>"), null);
});

test("Solo Unranked is not replaced by Flex or by the season peak", () => {
  // The same trap the app's parser already closed: the first "tier N LP" on the
  // page used to be Flex (or the Top tier peak) on an account with no Solo rank.
  const page = "Unranked\nmaster 393 LP Top tier\nRanked Flex\ngold 2 45 LP\n";
  const r = parseRankText(page);
  assert.equal(r.tier, "UNRANKED");
  assert.equal(r.lp, null);
  assert.equal(parseFlex(page).tier, "GOLD");
  assert.equal(parsePeakText(page).tier, "MASTER");
});

test("Master+ current ranks do not keep a division", () => {
  const r = parseRankText("master 1 250 LP 10W 5L");
  assert.equal(r.tier, "MASTER");
  assert.equal(r.division, null);
  assert.equal(r.lp, 250);
});

// Live op.gg body text inserts thousands separators once LP ≥ 1000 ("4,011 LP").
// Flattening the page used to leave only that form, so Master+ checks 502'd.
test("comma-formatted LP in body text still parses (live op.gg shape)", () => {
  const body = "Ranked Solo/Duo challenger 4,011 LP 772 W 650 L Win rate 54 % challenger 4,061 LP Top tier Ranked Flex Unranked";
  const r = parseRankText(body);
  assert.equal(r.tier, "CHALLENGER");
  assert.equal(r.division, null);
  assert.equal(r.lp, 4011);
  assert.equal(r.wins, 772);
  assert.equal(r.losses, 650);
  assert.deepEqual({ ...parsePeakText(body) }, { tier: "CHALLENGER", division: null, lp: 4061 });
});

test("meta description rank is preferred and handles doubled divisions", () => {
  const html = `<meta name="description" content="Kaori#EUW33 / Challenger 1 4011LP / 772Win 650Lose Win rate 54% / Ezreal - 73Win 55Lose Win rate 57%"/>
<strong>challenger</strong><span>4,011 LP</span>`;
  const r = parseRankText(html);
  assert.equal(r.tier, "CHALLENGER");
  assert.equal(r.lp, 4011);
  assert.equal(r.wins, 772);
  assert.equal(r.losses, 650);
  assert.equal(r.division, null);

  const un = parseRankText(`<meta name="description" content="Hide on bush#KR1 / Lv. 752"/>Unranked Ranked Flex Unranked`);
  assert.equal(un.tier, "UNRANKED");
  assert.equal(un.level, 752);
});

test("season rows tolerate comma LP", () => {
  const html = `<table><tbody>
  <tr><th>Season</th><th>Tier</th><th>LP</th></tr>
  <tr><td><strong>S2025</strong></td><td><span>challenger</span></td><td>1,205</td></tr>
  <tr><td><strong>S2024 S3</strong></td><td><span>master</span></td><td>513</td></tr>
</tbody></table>`;
  const s = parseSeasons(html);
  assert.equal(s.solo[0].season, "S2025");
  assert.equal(s.solo[0].tier, "CHALLENGER");
  assert.equal(s.solo[0].lp, 1205);
  assert.equal(s.solo[1].lp, 513);
});

test("level and champion-meta fallbacks match the shapes the app already handles", () => {
  assert.equal(parseLevelText("764 # terminallucidity # final", "terminallucidity", "final"), 764);
  const plain = "Ashe - 15Win 10Lose Win rate 60%, Smolder - 15Win 7Lose Win rate 68%";
  const c = parseChampionsMeta(plain);
  assert.equal(c.length, 2);
  assert.equal(c[0].name, "Ashe");
  assert.equal(c[0].kda, null);
});

test("champion rows parse into name, winrate, games and KDA", () => {
  const c = parseChampions(PROFILE_HTML);
  assert.equal(c.length, 2);
  assert.deepEqual({ ...c[0] }, { name: "Ashe", kda: 2.25, k: 6, d: 6.8, a: 9.3, wr: 60, games: 25 });
  assert.equal(c[1].name, "Smolder");
  assert.equal(parseChampions("<p>Ashe went 6/6/9 last game</p>"), null);
});

// A backslash lost in an editing pass turns \s into a literal "s" and \d into "d".
// The regex still compiles, the file still loads, and every field quietly returns
// null — which is exactly what shipped twice. This catches it directly.
test("the parsers' regexes still contain their escapes", () => {
  const src = [stripRows, parseRankText, parseLevelText, parsePeakText,
    parseSeasons, parseFlex, parseChampions].map(f => f.toString()).join("\n");
  assert.doesNotMatch(src, /\[sS\]/, "[\\s\\S] lost its backslashes");
  assert.doesNotMatch(src, /\(d\{1,4\}\)/, "(\\d{1,4}) lost its backslash");
  assert.doesNotMatch(src, /Tops\*tier/, "Top\\s*tier lost its backslash");
  assert.match(stripRows("<div>a</div><div>b</div>").join("|"), /^a\|b$/, "rows must still split");
});

import worker from "../cloudflare-worker.js";

test("OPTIONS preflight returns CORS allowing GET and POST", async () => {
  const res = await worker.fetch(new Request("https://worker.example/", { method: "OPTIONS" }));
  assert.ok(res.status === 200 || res.status === 204);
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), "*");
  assert.match(res.headers.get("Access-Control-Allow-Methods") || "", /POST/);
  assert.match(res.headers.get("Access-Control-Allow-Methods") || "", /GET/);
});

test("POST batch rejects empty body, oversized lists, and non-JSON", async () => {
  const bad = await worker.fetch(new Request("https://worker.example/", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: "{",
  }));
  assert.equal(bad.status, 400);

  const empty = await worker.fetch(new Request("https://worker.example/", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accounts: [] }),
  }));
  assert.equal(empty.status, 400);

  const tooMany = await worker.fetch(new Request("https://worker.example/", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accounts: Array.from({ length: 21 }, () => ({ name: "a", tag: "b", region: "euw" })) }),
  }));
  assert.equal(tooMany.status, 400);
  const err = await tooMany.json();
  assert.match(err.error, /max 20/i);
});

test("POST batch scrapes in parallel and preserves result order / ids", async () => {
  const orig = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (url) => {
    seen.push(String(url));
    if (String(url).includes("Missing-EUW")) {
      return new Response("nope", { status: 404 });
    }
    if (String(url).includes("/champions")) {
      return new Response("<html></html>", { status: 200 });
    }
    const html = `<meta name="description" content="One#EUW / Gold 2 45LP / 10Win 5Lose Win rate 66%"/>
<strong>gold 2</strong><span>45 LP</span>`;
    return new Response(html, { status: 200 });
  };
  try {
    const res = await worker.fetch(new Request("https://worker.example/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accounts: [
          { name: "One", tag: "EUW", region: "euw" },
          { name: "Missing", tag: "EUW", region: "euw" },
          { name: "", tag: "EUW", region: "euw" },
        ],
      }),
    }));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("Access-Control-Allow-Origin"), "*");
    const data = await res.json();
    assert.equal(data.results.length, 3);
    assert.equal(data.results[0].ok, true);
    assert.equal(data.results[0].tier, "GOLD");
    assert.equal(data.results[0].uncertain, false);
    assert.equal(data.results[0].source, "meta");
    assert.equal(data.results[1].ok, true);
    assert.equal(data.results[1].found, false);
    assert.equal(data.results[2].ok, false);
    assert.match(data.results[2].error, /missing name\/tag/);
    assert.ok(seen.some(u => u.includes("op.gg")));
  } finally {
    globalThis.fetch = orig;
  }
});

test("GET still returns a single scrape with uncertain/source fields", async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes("/champions")) return new Response("", { status: 200 });
    // body-only rank (no meta) → uncertain
    return new Response(`<strong>platinum 1</strong><span>12 LP</span><div>5W 5L</div>`, { status: 200 });
  };
  try {
    const res = await worker.fetch(new Request("https://worker.example/?name=Body&tag=Only&region=euw"));
    assert.equal(res.status, 200);
    const d = await res.json();
    assert.equal(d.found, true);
    assert.equal(d.tier, "PLATINUM");
    assert.equal(d.uncertain, true);
    assert.equal(d.source, "body");
  } finally {
    globalThis.fetch = orig;
  }
});

test("unsupported methods return 405 with CORS", async () => {
  const res = await worker.fetch(new Request("https://worker.example/", { method: "PUT" }));
  assert.equal(res.status, 405);
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), "*");
});

test("200 summoner-not-found page returns found:false instead of 502", async () => {
  const orig = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (url) => {
    seen.push(String(url));
    if (String(url).includes("/champions")) return new Response("", { status: 200 });
    return new Response(`<html><body><h1>Summoner not found</h1><p>This summoner is unregistered.</p></body></html>`, { status: 200 });
  };
  try {
    const res = await worker.fetch(new Request("https://worker.example/?name=Nope&tag=EUW&region=euw"));
    assert.equal(res.status, 200);
    const d = await res.json();
    assert.equal(d.found, false);
    assert.equal(seen.some(u => u.includes("/champions")), false,
      "champions subrequest must not run for a missing summoner");
  } finally {
    globalThis.fetch = orig;
  }
});

test("404 skips champions subrequest", async () => {
  const orig = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (url) => {
    seen.push(String(url));
    return new Response("missing", { status: 404 });
  };
  try {
    const res = await worker.fetch(new Request("https://worker.example/?name=Nope&tag=EUW&region=euw"));
    assert.equal(res.status, 200);
    assert.equal((await res.json()).found, false);
    assert.equal(seen.length, 1);
    assert.equal(seen[0].includes("/champions"), false);
  } finally {
    globalThis.fetch = orig;
  }
});

function mockKv() {
  const map = new Map();
  return {
    async get(k) { return map.has(k) ? map.get(k) : null; },
    async put(k, v) { map.set(k, v); },
    async delete(k) { map.delete(k); },
    _map: map,
  };
}

test("vault sync requires KV binding", async () => {
  const res = await worker.fetch(new Request("https://worker.example/vault", {
    method: "GET",
    headers: { Authorization: "Bearer " + "x".repeat(20) },
  }), {});
  assert.equal(res.status, 503);
  assert.equal((await res.json()).code, "no_kv");
});

test("vault sync PUT/GET last-write-wins and rejects plaintext", async () => {
  const kv = mockKv();
  const env = { VAULT: kv };
  const token = "sync-token-abcdef12";
  const envelope = { __enc: true, salt: "s", iv: "i", data: "d" };

  const bad = await worker.fetch(new Request("https://worker.example/vault", {
    method: "PUT",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ updatedAt: 100, envelope: { accounts: [] } }),
  }), env);
  assert.equal(bad.status, 400);

  const put1 = await worker.fetch(new Request("https://worker.example/vault", {
    method: "PUT",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ updatedAt: 1000, envelope }),
  }), env);
  assert.equal(put1.status, 200);

  const get1 = await worker.fetch(new Request("https://worker.example/vault", {
    headers: { Authorization: "Bearer " + token },
  }), env);
  assert.equal(get1.status, 200);
  assert.equal((await get1.json()).updatedAt, 1000);

  const older = await worker.fetch(new Request("https://worker.example/vault", {
    method: "PUT",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ updatedAt: 500, envelope: { ...envelope, data: "older" } }),
  }), env);
  assert.equal(older.status, 409);
  const conflict = await older.json();
  assert.equal(conflict.code, "conflict");
  assert.equal(conflict.remote.updatedAt, 1000);

  const newer = await worker.fetch(new Request("https://worker.example/vault", {
    method: "PUT",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ updatedAt: 2000, envelope: { ...envelope, data: "newer" } }),
  }), env);
  assert.equal(newer.status, 200);
  const get2 = await (await worker.fetch(new Request("https://worker.example/vault", {
    headers: { Authorization: "Bearer " + token },
  }), env)).json();
  assert.equal(get2.updatedAt, 2000);
  assert.equal(get2.envelope.data, "newer");
});

test("OPTIONS preflight allows PUT and Authorization for vault sync", async () => {
  const res = await worker.fetch(new Request("https://worker.example/", { method: "OPTIONS" }));
  assert.equal(res.status, 200);
  assert.match(res.headers.get("Access-Control-Allow-Methods") || "", /PUT/);
  assert.match(res.headers.get("Access-Control-Allow-Headers") || "", /Authorization/i);
});

/* ---- Riot API mode ----
   A fake Riot: routes by URL, counts calls, and can be told to refuse the key or to
   reject a puuid minted under another key. op.gg is answered with a 404 page unless
   a test says otherwise. */
const KEY = "RGAPI-12345678-abcd-ef01-2345-6789abcdef01";
const PUUID = "p".repeat(78), OLD_PUUID = "o".repeat(78);
function fakeRiot({ keyRejected = false, staleOld = true, tier = "DIAMOND", entries } = {}) {
  const calls = [];
  const res = (status, body) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
  globalThis.fetch = async (u, init) => {
    const url = String(u); calls.push(url);
    if (url.includes("op.gg")) return res(404, "not found");
    // Data Dragon is public and must never be sent the key
    if (url.includes("ddragon")) assert.equal(init && init.headers && init.headers["X-Riot-Token"], undefined, "no key to Data Dragon");
    if (url === "https://ddragon.leagueoflegends.com/api/versions.json") return res(200, ["15.19.1", "15.18.1"]);
    if (url.startsWith("https://ddragon.leagueoflegends.com/cdn/15.19.1/data/en_US/champion.json"))
      return res(200, { data: { Ahri: { key: "103", name: "Ahri" }, Yasuo: { key: "157", name: "Yasuo" } } });
    if (keyRejected) return res(403, { status: { message: "Forbidden" } });
    assert.equal(init.headers["X-Riot-Token"], KEY, "the key goes in the header, never the URL");
    if (url.includes("/accounts/by-puuid/" + OLD_PUUID) && staleOld) return res(400, { status: { message: "Exception decrypting" } });
    if (url.includes("/accounts/by-puuid/")) return res(200, { puuid: PUUID, gameName: "Renamed", tagLine: "NEW" });
    if (url.includes("/accounts/by-riot-id/Nobody/")) return res(404, {});
    if (url.includes("/accounts/by-riot-id/")) return res(200, { puuid: PUUID, gameName: "Hide on Bush", tagLine: "KR1" });
    if (url.includes("/summoner/v4/summoners/by-puuid/")) return res(200, { profileIconId: 6, summonerLevel: 812 });
    if (url.includes("/champion-mastery/v4/champion-masteries/by-puuid/")) return res(200, [
      { championId: 103, championLevel: 7, championPoints: 312045 }, { championId: 157, championLevel: 5, championPoints: 40211 },
      { championId: 99999, championLevel: 1, championPoints: 10 }]);
    if (url.includes("/league/v4/entries/by-puuid/")) return res(200, entries || [
      { queueType: "RANKED_SOLO_5x5", tier, rank: "II", leaguePoints: 45, wins: 120, losses: 100 },
      { queueType: "RANKED_FLEX_SR", tier: "GOLD", rank: "I", leaguePoints: 3, wins: 4, losses: 2 }]);
    return res(500, "unexpected " + url);
  };
  return calls;
}

test("Riot mode: Riot ID → puuid → summoner and league, shaped like an op.gg reading", async () => {
  const calls = fakeRiot();
  const r = await riotOne("Hide on Bush", "KR1", "kr", KEY, null, true);
  assert.deepEqual({ tier: r.body.tier, division: r.body.division, lp: r.body.lp, wins: r.body.wins, losses: r.body.losses, level: r.body.level },
    { tier: "DIAMOND", division: "II", lp: 45, wins: 120, losses: 100, level: 812 });
  assert.deepEqual(r.body.flex, { tier: "GOLD", division: "I", lp: 3 });
  assert.equal(r.body.puuid, PUUID);
  assert.match(r.body.icon, /profileIcon6\.jpg$/);
  assert.equal(r.body.source, "riot");
  assert.ok(calls[0].startsWith("https://asia.api.riotgames.com/riot/account/v1/accounts/by-riot-id/Hide%20on%20Bush/KR1"));
  assert.ok(calls.some(c => c.startsWith("https://kr.api.riotgames.com/lol/league/v4/entries/by-puuid/" + PUUID)));
  assert.equal(calls.length, 3);
});

test("Riot mode: Master and up have no division; no solo entry is Unranked; a known puuid saves a call", async () => {
  fakeRiot({ tier: "MASTER" });
  assert.equal((await riotOne("a", "b", "euw", KEY, null)).body.division, null);
  fakeRiot({ entries: [] });
  const un = await riotOne("a", "b", "euw", KEY, null);
  assert.equal(un.body.tier, "UNRANKED");
  assert.equal(un.body.wins, null);
  const calls = fakeRiot();
  await riotOne("a", "b", "euw", KEY, PUUID, false);
  assert.equal(calls.length, 2, "batch with a known puuid: summoner + league only");
});

test("Riot mode: a puuid from another key is found again by Riot ID; a rename comes back with it", async () => {
  fakeRiot();
  const stale = await riotOne("Hide on Bush", "KR1", "kr", KEY, OLD_PUUID, true);
  assert.equal(stale.body.puuid, PUUID, "re-resolved under this key");
  fakeRiot({ staleOld: false });
  const renamed = await riotOne("Old Name", "OLD", "euw", KEY, OLD_PUUID, true);
  assert.deepEqual(renamed.body.riotId, { name: "Renamed", tag: "NEW" }, "the current Riot ID, so the app can follow a rename");
  fakeRiot();
  assert.equal((await riotOne("Nobody", "X", "euw", KEY, null)).body.found, false);
});

test("Riot mode: a rejected key falls back to op.gg on a single lookup and says why", async () => {
  fakeRiot({ keyRejected: true });
  const r = await riotOne("a", "b", "euw", KEY, null);
  assert.equal(r.riotError, "key");
  const env = { RIOT_API_KEY: KEY };
  const one = await lookupOne("a", "b", "euw", env, null);
  // op.gg answers 404 in this fake, which is "not found" — what matters is that it was asked
  assert.equal(one.body.found, false);
  const noKey = await lookupOne("a", "b", "euw", { RIOT_API_KEY: "not-a-key" }, null);
  assert.equal(noKey.body.source, undefined, "a malformed key is no key: straight to op.gg");
});

test("Riot mode: a batch stays inside the worker's subrequest budget and hands the rest back", async () => {
  const calls = fakeRiot();
  const accounts = Array.from({ length: 20 }, (_, i) => ({ name: "n" + i, tag: "t", region: "euw" }));
  const req = new Request("https://w.example/", { method: "POST", body: JSON.stringify({ accounts }) });
  const out = await (await handleBatch(req, { RIOT_API_KEY: KEY })).json();
  const ok = out.results.filter(r => r.ok).length, deferred = out.results.filter(r => /deferred/.test(r.error || "")).length;
  assert.equal(ok, 16, "16 × 3 = 48 subrequests");
  assert.equal(deferred, 4, "the rest come back to be retried one at a time");
  assert.ok(calls.length <= 50, `made ${calls.length} subrequests`);
  fakeRiot();
  const known = accounts.map(a => ({ ...a, puuid: PUUID }));
  const out2 = await (await handleBatch(new Request("https://w.example/", { method: "POST", body: JSON.stringify({ accounts: known }) }), { RIOT_API_KEY: KEY })).json();
  assert.equal(out2.results.filter(r => r.ok).length, 20, "with puuids known, all twenty fit");
});

test("/status says what the worker has set up, without revealing it", async () => {
  const st = async env => (await worker.fetch(new Request("https://w.example/status"), env)).json();
  assert.deepEqual(await st({}), { ok: true, riot: false, vault: false });
  const full = await st({ RIOT_API_KEY: KEY, VAULT: {} });
  assert.deepEqual(full, { ok: true, riot: true, vault: true });
  assert.doesNotMatch(JSON.stringify(full), /RGAPI/);
});

/* The deploy button builds the worker from wrangler.jsonc and asks for the secrets in
   .dev.vars.example. Both have to name what the worker actually reads. */
test("the one-click deploy config matches what the worker reads", async () => {
  const fs = await import("node:fs"), path = await import("node:path"), { fileURLToPath } = await import("node:url");
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
  const cfg = JSON.parse(fs.readFileSync(path.join(root, "wrangler.jsonc"), "utf8").replace(/^\s*\/\/.*$/gm, ""));
  assert.ok(fs.existsSync(path.join(root, cfg.main)), "main points at the worker");
  const src = fs.readFileSync(path.join(root, cfg.main), "utf8");
  for (const kv of cfg.kv_namespaces) assert.match(src, new RegExp("env\\." + kv.binding + "\\b"), `the worker reads env.${kv.binding}`);
  assert.ok(!cfg.kv_namespaces.some(k => k.id), "no namespace id: the deploy creates one in the deployer's account");
  const vars = fs.readFileSync(path.join(root, ".dev.vars.example"), "utf8").match(/^[A-Z_]+(?==)/gm);
  for (const v of vars) assert.match(src, new RegExp("env\\." + v + "\\b"), `the worker reads env.${v}`);
  assert.deepEqual(vars, ["RIOT_API_KEY"]);
});

test("mastery: top champions by name, only when asked, and counted in the batch budget", async () => {
  resetChampNames();
  let calls = fakeRiot();
  const r = await riotOne("a", "b", "euw", KEY, PUUID, false, true);
  assert.deepEqual(r.body.mastery, [{ name: "Ahri", level: 7, points: 312045 }, { name: "Yasuo", level: 5, points: 40211 }],
    "names from Data Dragon; a champion it does not know yet is left out");
  assert.ok(calls.some(u => u.startsWith("https://euw1.api.riotgames.com/lol/champion-mastery/v4/champion-masteries/by-puuid/" + PUUID + "/top?count=5")));
  calls = fakeRiot();
  await riotOne("a", "b", "euw", KEY, PUUID, false, true);
  assert.equal(calls.filter(u => u.includes("ddragon")).length, 0, "the champion list is kept, not fetched every time");
  calls = fakeRiot();
  const plain = await riotOne("a", "b", "euw", KEY, PUUID, false);
  assert.equal(plain.body.mastery, undefined);
  assert.equal(calls.filter(u => u.includes("mastery")).length, 0, "not asked, not fetched");
  // the batch budget counts the extra call: 16 rows with a puuid at 2 each fit in 48, at 3 each only 16 of them do
  resetChampNames();
  fakeRiot();
  const rows = n => Array.from({ length: n }, (_, i) => ({ name: "n" + i, tag: "t", region: "euw", puuid: PUUID, mastery: true }));
  const res = await handleBatch(new Request("https://w.example/", { method: "POST", body: JSON.stringify({ accounts: rows(20) }) }), { RIOT_API_KEY: KEY });
  const out = (await res.json()).results;
  assert.equal(out.filter(r => r.ok).length, 15, "(48 - 2 for the champion list) / 3 a row");
  assert.ok(out[0].mastery && out[0].mastery[0].name === "Ahri");
});

const HOOK = "https://discord.com/api/webhooks/123456/abc-DEF_9";
const watchReq = (method, token, body) => new Request("https://w.example/watch", { method,
  headers: Object.assign({ "Content-Type": "application/json" }, token ? { Authorization: "Bearer " + token } : {}),
  body: body ? JSON.stringify(body) : undefined });
test("/watch: one list per worker, owned by the token that set it up, checked on the way in", async () => {
  const env = { VAULT: mockKv() }, mine = "m".repeat(32), theirs = "t".repeat(32);
  const acc = { name: "Main", tag: "EUW", region: "euw", puuid: PUUID, label: "Diamond main", tier: "DIAMOND", division: "II", lp: 40, games: 200, bank: 5, at: Date.now() };
  assert.equal((await worker.fetch(watchReq("GET"), env)).status, 401, "no token, no answer");
  assert.equal((await worker.fetch(watchReq("PUT", mine, { webhook: "https://evil.example/hook", accounts: [acc] }), env)).status, 400, "only a Discord webhook");
  const put = await worker.fetch(watchReq("PUT", mine, { webhook: HOOK, accounts: [acc, { name: "Plat", tag: "1", region: "euw", tier: "PLATINUM", games: 1, bank: 1, at: 1 }, "junk"] }), env);
  assert.deepEqual(await put.json(), { ok: true, accounts: 1 }, "below Diamond nothing decays, and junk is dropped");
  const stored = JSON.parse(env.VAULT._map.get("watch:slot"));
  assert.equal(stored.owner.length, 64, "the token is kept only as a hash");
  assert.ok(!JSON.stringify(stored).includes(mine));
  const status = await (await worker.fetch(watchReq("GET", mine), env)).json();
  assert.equal(status.accounts, 1);
  const taken = await worker.fetch(watchReq("PUT", theirs, { webhook: HOOK, accounts: [] }), env);
  assert.equal(taken.status, 409, "someone else who finds the URL cannot take it over");
  assert.equal((await taken.json()).code, "taken");
  assert.equal((await worker.fetch(watchReq("DELETE", theirs), env)).status, 409, "nor stop it");
  assert.equal((await worker.fetch(watchReq("DELETE", mine), env)).status, 200);
  assert.equal((await worker.fetch(watchReq("GET", mine), env)).status, 404, "stopped");
});

test("the daily run carries each estimate forward and posts once when an account is about to decay, or decaying", async () => {
  assert.equal(carryBank(5, { cap: 28, per: 7 }, 2, 1), 10, "half the gap, a game's seven days, the other half");
  const D = 86400000, now = Date.UTC(2026, 9, 2, 9, 17);
  const kv = mockKv(), env = { VAULT: kv, RIOT_API_KEY: KEY };
  const row = (name, puuid, bank, games) => ({ name, tag: "EUW", region: "euw", puuid, label: name + " acc", tier: "DIAMOND", division: "II", lp: 40, games, bank, at: now - D, alerted: null });
  const P1 = "a".repeat(78), P2 = "b".repeat(78), P3 = "c".repeat(78);
  kv._map.set("watch:slot", JSON.stringify({ owner: "x", webhook: HOOK, accounts: [row("Soon", P1, 3.4, 100), row("Gone", P2, 0.4, 50), row("Busy", P3, 1.2, 80)] }));
  let games = { [P1]: 100, [P2]: 50, [P3]: 82 }; const posted = [];
  globalThis.fetch = async (u, init) => {
    const url = String(u);
    if (url === HOOK) { posted.push(JSON.parse(init.body)); return new Response(null, { status: 204 }); }
    const p = url.match(/by-puuid\/(\w+)/)[1];
    return new Response(JSON.stringify([{ queueType: "RANKED_SOLO_5x5", tier: "DIAMOND", rank: "II", leaguePoints: 40, wins: games[p], losses: 0 }]), { status: 200 });
  };
  const first = await runWatch(env, now);
  assert.equal(first.sent, 2);
  assert.match(posted[0].content, /⏳ \*\*Soon acc\*\* \(Diamond II · 40 LP\) decays in ~2 days/);
  assert.match(posted[1].content, /📉 \*\*Gone acc\*\* .* is decaying: −50 LP a day/);
  assert.deepEqual(posted[0].allowed_mentions, { parse: [] }, "a label can never ping anyone");
  const slot = JSON.parse(kv._map.get("watch:slot"));
  assert.equal(slot.accounts.find(a => a.name === "Busy").bank > 14, true, "two games banked fourteen days");
  assert.equal(slot.lastRun, now);
  posted.length = 0;
  await runWatch(env, now + D);
  assert.equal(posted.length, 0, "the same state is not posted again the next day");
  games[P1] = 101;
  await runWatch(env, now + 2 * D);
  assert.equal(posted.length, 0, "a game banks days again");
  await runWatch(env, now + 9 * D);
  assert.equal(posted.length, 1, "and when it runs low again, that is news again");
});

test("the daily run without a Riot key reads one op.gg page an account, so twenty fit in a run", async () => {
  const D = 86400000, now = Date.UTC(2026, 9, 3, 9, 17);
  const kv = mockKv(), env = { VAULT: kv };
  const rows = Array.from({ length: 20 }, (_, i) => ({ name: "Acc" + i, tag: "EUW", region: "euw", puuid: null, label: null,
    tier: "DIAMOND", division: "I", lp: 10, games: 100, bank: 20, at: now - D, alerted: null }));
  kv._map.set("watch:slot", JSON.stringify({ owner: "x", webhook: HOOK, accounts: rows }));
  const urls = [];
  globalThis.fetch = async u => {
    const url = String(u); urls.push(url);
    if (url === HOOK) return new Response(null, { status: 204 });
    return new Response(`<meta name="description" content="Acc#EUW / Diamond 1 10LP / 60Win 40Lose Win rate 60%"/>`, { status: 200 });
  };
  const r = await runWatch(env, now);
  assert.equal(r.ran, true);
  assert.equal(urls.filter(u => u.includes("op.gg")).length, 20, "one request an account");
  assert.equal(urls.filter(u => u.endsWith("/champions")).length, 0, "the champions page is not needed to count games");
  assert.ok(urls.length <= 50, "inside a free-plan run's 50 subrequests");
});

test("the one-click deploy also schedules the daily run", async () => {
  const fs = await import("node:fs"), path = await import("node:path"), { fileURLToPath } = await import("node:url");
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
  const cfg = JSON.parse(fs.readFileSync(path.join(root, "wrangler.jsonc"), "utf8").replace(/^\s*\/\/.*$/gm, ""));
  assert.equal(cfg.triggers.crons.length, 1);
  assert.equal(typeof worker.scheduled, "function", "the worker answers the cron");
});

test("recent form: the last five ranked games, reduced to this player's line", async () => {
  const calls = [];
  globalThis.fetch = async u => {
    const url = String(u); calls.push(url);
    const res = b => new Response(JSON.stringify(b), { status: 200 });
    if (url.includes("/ids?")) return res(["EUW1_1", "EUW1_2"]);
    const n = url.endsWith("EUW1_1") ? 1 : 2;
    return res({ info: { gameDuration: 1800, gameEndTimestamp: 1700000000000 + n, participants: [
      { puuid: "x".repeat(78), win: n === 2, championName: "Zed", kills: 1, deaths: 1, assists: 1 },
      { puuid: PUUID, win: n === 1, championName: n === 1 ? "Ahri" : "Lux", teamPosition: n === 1 ? "MIDDLE" : "UTILITY", kills: 7, deaths: 2, assists: 9 }] } });
  };
  const r = await riotForm(PUUID, "euw", KEY);
  assert.ok(calls[0].startsWith("https://europe.api.riotgames.com/lol/match/v5/matches/by-puuid/" + PUUID + "/ids?queue=420&count=5"));
  assert.deepEqual(r.body.games.map(g => [g.win, g.champ, g.role, g.k, g.d, g.a, g.min]), [[true, "Ahri", "Mid", 7, 2, 9, 30], [false, "Lux", "Support", 7, 2, 9, 30]]);
  assert.equal((await riotForm("not-a-puuid", "euw", KEY)).status, 400);
  const sea = []; globalThis.fetch = async u => { sea.push(String(u)); return new Response("[]", { status: 200 }); };
  await riotForm(PUUID, "oce", KEY);
  assert.match(sea[0], /^https:\/\/sea\.api\.riotgames\.com\//, "match-v5 routes Oceania through sea, not asia");
});
