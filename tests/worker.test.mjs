// The worker parses op.gg itself, so the app's test suite never touched it — and a
// broken regex there is invisible: the file still parses, the worker still returns
// 200, the fields just come back null. These run its parsers against real op.gg
// output in both shapes a page can arrive in.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseRankText, parseLevelText, parsePeakText, parseSeasons, parseFlex,
  parseChampions, parseChampionTable, parseChampionsMeta, parseProfileIcon,
  parseLpHistory, stripRows,
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
