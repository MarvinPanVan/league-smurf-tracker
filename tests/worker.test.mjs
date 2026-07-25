// The worker parses op.gg itself, so the app's test suite never touched it — and a
// broken regex there is invisible: the file still parses, the worker still returns
// 200, the fields just come back null. These run its parsers against real op.gg
// output in both shapes a page can arrive in.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseRankText, parseLevelText, parsePeakText,
  parseSeasons, parseFlex, parseChampions, parseProfileIcon, stripRows,
} from "../cloudflare-worker.js";

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
