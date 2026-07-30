// Smurf Tracker — Cloudflare Worker backend
// Deploy this, paste the worker's URL into the app's Settings > "Backend URL".
//
// GET /?name=<gameName>&tag=<tagLine>&region=<euw|eune|na|kr|...>
// -> {"found":true,"tier":"GOLD","division":"II","lp":45,"wins":30,"losses":25,
//     "level":247,"peak":{"tier":"PLATINUM","division":"IV","lp":12},
//     "seasons":{"solo":[{"season":"S2025","tier":"MASTER","division":null,"lp":135}],"flex":[]},
//     "flex":{"tier":"UNRANKED","division":null,"lp":null},
//     "champs":[{"name":"Ashe","wr":60,"games":25,"kda":2.25,"k":6,"d":6.8,"a":9.3}],
//     "icon":"https://opgg-static.akamaized.net/meta/images/profile_icons/profileIcon123.jpg",
//     "mmr":null,"avgRecent":null}
// -> {"found":false}  (summoner genuinely doesn't exist)
// -> HTTP 4xx/5xx on transient failures (missing params, op.gg unreachable, page didn't parse) —
//    the app falls back to the free proxy chain / manual entry on any non-2xx response.
//
// The parsers below are ported from the app's client-side ones and are exported so
// tests/worker.test.mjs can run them against real op.gg fixtures. Cloudflare only
// ever uses the default export, so the extra named exports cost nothing.

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    // Browser callers only ever GET. Anything else used to still scrape op.gg,
    // and an uncaught throw below became Cloudflare's default 500 with no CORS
    // headers — which the app then misread as a CORS failure on the fallback path.
    if (request.method !== "GET") return json({ error: "method not allowed" }, 405);

    try {
      const url = new URL(request.url);
      const name = url.searchParams.get("name");
      const tag = url.searchParams.get("tag");
      const region = (url.searchParams.get("region") || "euw").toLowerCase();

      if (!name || !tag) return json({ error: "missing name/tag" }, 400);

      const base = `https://op.gg/lol/summoners/${encodeURIComponent(region)}/${encodeURIComponent(name)}-${encodeURIComponent(tag)}`;
      // Bound every op.gg fetch — a hung upstream used to pin the whole Worker
      // isolate until the platform's own limit, with the client waiting on us.
      const get = u => {
        const c = new AbortController();
        const t = setTimeout(() => c.abort(), 12000);
        return fetch(u, {
          headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
          signal: c.signal,
        }).finally(() => clearTimeout(t));
      };

      // The per-champion season totals are not on the profile page — they live on
      // /champions. Both are requested at once, so the extra data costs no extra
      // wall time, and a failure on the second one is not allowed to sink the check.
      let res, champHtml = null;
      try {
        const [main, champs] = await Promise.allSettled([get(base), get(base + "/champions")]);
        if (main.status === "rejected") throw main.reason || new Error("unreachable");
        res = main.value;
        if (champs.status === "fulfilled" && champs.value.ok) champHtml = await champs.value.text();
      } catch (e) {
        return json({ error: "fetch failed: " + (e && e.message) }, 502);
      }

      if (res.status === 404) return json({ found: false }, 200);
      if (!res.ok) return json({ error: "op.gg HTTP " + res.status }, 502);

      const html = await res.text();
      const parsed = parseRankText(htmlToText(html));

      if (!parsed) return json({ error: "no rank data parsed from page" }, 502);

      return json({
        found: true,
        tier: parsed.tier || "UNRANKED",
        division: parsed.division || null,
        lp: parsed.lp,
        wins: parsed.wins,
        losses: parsed.losses,
        level: parsed.level != null ? parsed.level : parseLevelText(html, name, tag),
        peak: parsePeakText(html),
        seasons: parseSeasons(html),
        flex: parseFlex(html),
        // full table with KDA when /champions came back, the profile's own top five
        // (wins/losses/win rate, no KDA) when it didn't
        champs: (champHtml && parseChampionTable(champHtml)) || parseChampionsMeta(html) || parseChampions(html),
        lpAt: parseLpHistory(html), // when this LP was actually reached, per op.gg
        icon: parseProfileIcon(html), // needs the raw HTML — htmlToText() already stripped the <img> tags out
        mmr: null,
        avgRecent: null,
      }, 200);
    } catch (e) {
      return json({ error: "worker error: " + (e && e.message) }, 500);
    }
  },
};

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

const TIER_WORD = "challenger|grandmaster|master|diamond|emerald|platinum|gold|silver|bronze|iron";
const MASTER_PLUS = ["MASTER", "GRANDMASTER", "CHALLENGER"];
const DIV_MAP = { "1": "I", "2": "II", "3": "III", "4": "IV" };

// Flattens a page to one line of plain words. Everything that keys off word order
// rather than page structure reads from this.
export function htmlToText(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

// Same idea, but row boundaries survive: the season tables and the champion list
// are only readable as rows, so block tags become newlines instead of spaces.
// The markdown rules are no-ops on the raw HTML op.gg serves, and are kept only so
// this behaves identically to the app's copy on any input.
export function stripRows(raw) {
  return String(raw)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(tr|li|div|p|h[1-6]|section|article)\s*>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")      // markdown images: their URLs carry tier names
    .replace(/\[([^\]]*)\]\([^)]*\)/g, " $1 ")  // markdown links: keep the label, drop the URL
    .replace(/[*`_]+/g, " ")
    .replace(/[ \t]+/g, " ")
    .split("\n").map(l => l.trim()).filter(Boolean);
}

// The current rank. Solo and Flex share the page — everything from "Ranked Flex"
// onwards belongs to parseFlex. Two passes on the Solo half: the strict pattern
// on the flattened text, then — only if that found no tier — the same pattern on
// the row-stripped version, for pages dense enough that the tier and its LP end
// up further apart than the pattern tolerates. Never a downgrade, since pass two
// only runs after a miss.
export function parseRankText(raw) {
  if (!raw) return null;
  const soloRaw = String(raw).split(/\bRanked\s*Flex\b/i)[0];
  const flat = soloRaw.replace(/\s+/g, " ");
  // "Unranked" before any "tier N LP" means Solo is Unranked — a later LP figure
  // is the season peak (Top tier), not the current rank.
  const unIdx = flat.search(/\bUnranked\b/i);
  const rankAt = flat.search(new RegExp("\\b(" + TIER_WORD + ")\\b[^\\dA-Za-z]{0,6}([1-4]|IV|III|II|I)?(?!\\d)(?:\\s\\2(?!\\d))?[^\\d]{0,6}(\\d{1,4})\\s*LP\\b", "i"));
  if (unIdx >= 0 && (rankAt < 0 || unIdx < rankAt)) {
    const lv = flat.match(/\bLv(?:l)?\.?\s*(\d{1,4})\b/i) || flat.match(/\bLevel\s*(\d{1,4})\b/i);
    return { tier: "UNRANKED", division: null, lp: null, wins: null, losses: null, level: lv ? +lv[1] : null };
  }
  const first = parseRankFlat(flat);
  if (first && first.tier) return first;
  const second = parseRankFlat(stripRows(soloRaw).join(" "));
  if (second && second.tier) return second;
  const hit = first || second;
  if (hit && hit.level != null) { hit.tier = hit.tier || "UNRANKED"; return hit; }
  if (/\bUnranked\b/i.test(soloRaw)) return { tier: "UNRANKED", division: null, lp: null, wins: null, losses: null, level: null };
  return hit;
}

function parseRankFlat(text) {
  const strict = /\b(challenger|grandmaster|master|diamond|emerald|platinum|gold|silver|bronze|iron)\b[^\dA-Za-z]{0,6}([1-4]|IV|III|II|I)?(?!\d)(?:\s\2(?!\d))?[^\d]{0,6}(\d{1,4})\s*LP\b/i;
  const m = text.match(strict);
  const out = { tier: null, division: null, lp: null, wins: null, losses: null, level: null };
  if (m) {
    out.tier = m[1].toUpperCase();
    // Above Master there are no divisions — same guard the peak/season parsers carry.
    if (m[2] && !MASTER_PLUS.includes(out.tier)) out.division = DIV_MAP[m[2]] || m[2].toUpperCase();
    out.lp = +m[3];
    const after = text.slice(m.index);
    const wl = after.match(/(\d{1,4})\s*W(?:in)?s?\b\s*[,\/]?\s*(\d{1,4})\s*L(?:ose|oss(?:es)?)?\b/i);
    if (wl) { out.wins = +wl[1]; out.losses = +wl[2]; }
  }
  const lv = text.match(/\bLv(?:l)?\.?\s*(\d{1,4})\b/i) || text.match(/\bLevel\s*(\d{1,4})\b/i);
  if (lv) out.level = +lv[1];
  if (!out.tier && out.level == null) return null;
  return out;
}

function reEsc(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

// op.gg stacks the summoner level on the profile icon as a bare number with no
// label anywhere near it, so the "Lv." patterns above never find it. The only
// anchor is position — it is the number printed immediately before the Riot ID
// heading. The heading itself is two separate elements, so once the tags are
// stripped the text reads "764 terminallucidity # final": matching the literal
// "name#tag" only ever hit the <title>, where no number precedes it, and every
// backend check came back with level: null because of it.
// Deliberately a tight window and a sane range — a wrong number here would render
// as a confident, wrong "Level".
export function parseLevelText(raw, name, tag) {
  if (!raw || !name) return null;
  const text = htmlToText(raw);
  // Same window as the app: reader-mode proxies leave a markdown heading marker
  // between the level and the Riot ID ("764 # name#tag"), and the "#" around the
  // tag is optional once the tags are gone.
  const re = new RegExp("(\\d{1,4})[\\s#>]{0,4}" + reEsc(name) + "\\s*#?\\s*" + reEsc(tag || "") + "\\b", "i");
  const m = text.match(re);
  if (!m) return null;
  const lv = +m[1];
  return lv >= 1 && lv <= 5000 ? lv : null;
}

// op.gg's season history and champion list are real <table>s, and the cells only
// line up when the row is read as a row. stripRows breaks on </div>, which lands
// mid-cell and scattered one season across three lines — that is why past seasons
// came back with the division digit parsed as the LP ("Emerald · 2 LP").
function tableRows(html) {
  return [...String(html).matchAll(/<table[\s\S]*?<\/table>/gi)].map(m => ({
    at: m.index,
    rows: (m[0].match(/<tr[\s\S]*?<\/tr>/gi) || []).map(r => htmlToText(r)),
  }));
}

// The season peak: op.gg prints the highest rank reached under the current one and
// badges it "Top tier", so the peak is the last rank printed before that badge.
// The division must not be allowed to eat the first digit of the LP — without the
// lookahead, "master 393 LP" parses as division 3, 93 LP.
export function parsePeakText(raw) {
  if (!raw) return null;
  const text = htmlToText(raw);
  const i = text.search(/Top\s*tier/i);
  if (i < 0) return null;
  const before = text.slice(Math.max(0, i - 140), i);
  const re = new RegExp("\\b(" + TIER_WORD + ")\\b(?:\\s+([1-4]|IV|III|II|I)(?![\\dA-Za-z]))?\\s*(\\d{1,4})\\s*LP\\b", "ig");
  let m, last = null;
  while ((m = re.exec(before))) last = m;
  if (!last) return null;
  const tier = last[1].toUpperCase();
  return {
    tier,
    division: (MASTER_PLUS.includes(tier) || !last[2]) ? null : (DIV_MAP[last[2]] || last[2].toUpperCase()),
    lp: +last[3],
  };
}

// One row per past season, for both queues. Two shapes have to work: the real
// <table> op.gg serves, and the pipe-table markdown the r.jina.ai proxy returns.
export function parseSeasons(raw) {
  return parseSeasonTables(raw) || parseSeasonLines(raw);
}
// The <table> shape. Which queue a table belongs to is decided by the heading
// immediately above it — "Ranked Flex" sits right on top of the flex one — with
// document order as the fallback, since op.gg always prints solo first.
function parseSeasonTables(raw) {
  if (!raw) return null;
  const html = String(raw);
  const rowRe = new RegExp("^(S\\d{4}(?:\\s*S\\d)?)\\s+(" + TIER_WORD + ")(?:\\s+([1-4])(?!\\d))?\\s+(\\d{1,4})$", "i");
  const out = { solo: [], flex: [] };
  let n = 0;
  for (const t of tableRows(html)) {
    if (!t.rows.some(r => /^season\s+tier\s+lp$/i.test(r))) continue; // not a season table
    const above = htmlToText(html.slice(Math.max(0, t.at - 400), t.at));
    const bucket = /ranked\s*flex\s*[^<]{0,30}$/i.test(above) ? "flex" : (n === 0 ? "solo" : "flex");
    n++;
    for (const r of t.rows) {
      const m = r.trim().match(rowRe);
      if (!m) continue;
      const tier = m[2].toUpperCase();
      out[bucket].push({
        season: m[1].replace(/\s+/g, " "),
        tier,
        division: (MASTER_PLUS.includes(tier) || !m[3]) ? null : DIV_MAP[m[3]],
        lp: +m[4],
      });
    }
  }
  return (out.solo.length || out.flex.length) ? out : null;
}
function parseSeasonLines(raw) {
  if (!raw) return null;
  // The division is optional and must not be allowed to eat the first digit of the
  // LP: without the lookahead, "S2025 master 135" reads as division 1, 35 LP. The
  // markdown shape hides this because its pipes separate the cells; raw table HTML
  // does not, and raw HTML is what op.gg serves this worker.
  const rowRe = new RegExp("(S\\d{4}(?:\\s*S\\d)?)\\s*\\|?\\s*(?:\\|\\s*)?(" + TIER_WORD + ")(?:\\s+([1-4])(?!\\d))?\\s*\\|?\\s*(\\d{1,4})\\s*\\|?\\s*$", "i");
  const out = { solo: [], flex: [] };
  let bucket = null;
  for (const line of stripRows(raw)) {
    if (/ranked\s*solo/i.test(line) && /season/i.test(line) && /\bLP\b/i.test(line)) { bucket = "solo"; continue; }
    if (/ranked\s*flex/i.test(line) && /season/i.test(line) && /\bLP\b/i.test(line)) { bucket = "flex"; continue; }
    if (!bucket) continue;
    const m = line.match(rowRe);
    if (!m) {
      if (/^\|?\s*:?-{2,}/.test(line) || /season/i.test(line)) continue;
      if (out[bucket].length) bucket = null;
      continue;
    }
    const tier = m[2].toUpperCase();
    out[bucket].push({
      season: m[1].replace(/\s+/g, " "),
      tier,
      division: (MASTER_PLUS.includes(tier) || !m[3]) ? null : DIV_MAP[m[3]],
      lp: +m[4],
    });
  }
  return (out.solo.length || out.flex.length) ? out : null;
}

// The flex rank sits under its own heading and is usually just "Unranked". Only
// trusted when a tier and an LP figure appear together right after that heading.
export function parseFlex(raw) {
  if (!raw) return null;
  const lines = stripRows(raw);
  for (let i = 0; i < lines.length; i++) {
    if (!/^ranked\s*flex$/i.test(lines[i])) continue;
    const near = lines.slice(i + 1, i + 4).join(" ");
    if (/^\s*unranked/i.test(near)) return { tier: "UNRANKED", division: null, lp: null };
    const m = near.match(new RegExp("\\b(" + TIER_WORD + ")\\b(?:\\s+([1-4]|IV|III|II|I)(?![\\dA-Za-z]))?\\s*(\\d{1,4})\\s*LP\\b", "i"));
    if (m) {
      const tier = m[1].toUpperCase();
      return {
        tier,
        division: (MASTER_PLUS.includes(tier) || !m[2]) ? null : (DIV_MAP[m[2]] || m[2].toUpperCase()),
        lp: +m[3],
      };
    }
  }
  return null;
}

// The season champion table lives on the /champions sub-page, not the profile —
// the profile page carries no per-champion season totals at all, which is why
// this came back null however the regex was written. Rows read:
// "1 Ashe 15 W 10 L 60% 2.25:1 6 / 6.8 / 9.3 (48%) ..."
// The rank number at the front is what separates a real row from the "All
// champions" summary and the "vs <champion>" matchup rows folded underneath.
export function parseChampionTable(raw) {
  if (!raw) return null;
  // Every champion's matchup breakdown is its own <table> nested inside the row,
  // so a non-greedy <table>…</table> match closes on the inner one and loses all
  // but the first champion. Scanning <tr> across the whole document sidesteps the
  // nesting entirely — the leading rank number is already what identifies a real
  // row, against the "All champions" summary and the "vs <champion>" sub-rows.
  const re = /^(\d{1,3})\s+(.{2,26}?)\s+(\d{1,4})\s*W\s+(\d{1,4})\s*L\s+(\d{1,3})%\s+([\d.]+):1\s+([\d.]+)\s*\/\s*([\d.]+)\s*\/\s*([\d.]+)/i;
  const out = [];
  for (const m0 of String(raw).matchAll(/<tr[\s\S]*?<\/tr>/gi)) {
    const m = htmlToText(m0[0]).trim().match(re);
    if (!m) continue;
    const name = m[2].replace(/\s+/g, " ").trim();
    if (!name || out.some(c => c.name === name)) continue;
    out.push({ name, wins: +m[3], losses: +m[4], games: +m[3] + +m[4],
      wr: +m[5], kda: +m[6], k: +m[7], d: +m[8], a: +m[9] });
  }
  return out.length ? out.slice(0, 10) : null;
}

// Fallback, and the only champion data the profile page itself carries: op.gg
// puts the season's top five in the page description, with wins and losses but
// no KDA. Worth having — five champions with real win rates beat none.
export function parseChampionsMeta(raw) {
  if (!raw) return null;
  const m = String(raw).match(/<meta\s+name="description"\s+content="([^"]*)"/i);
  // Reader-mode proxies print the description as plain text with no <meta> tag —
  // same fallback the app uses, so the backend path does not go quiet where the
  // proxy path would still find five champions.
  const src = m ? m[1] : String(raw).slice(0, 4000);
  const out = [];
  const re = /([A-Za-z0-9'.\- ]{2,26}?)\s*-\s*(\d{1,4})Win\s+(\d{1,4})Lose\s+Win rate\s+(\d{1,3})%/gi;
  let r;
  while ((r = re.exec(src))) {
    const name = r[1].replace(/\s+/g, " ").trim();
    if (!name || out.some(c => c.name === name)) continue;
    out.push({ name, wins: +r[2], losses: +r[3], games: +r[2] + +r[3], wr: +r[4], kda: null });
  }
  return out.length ? out.slice(0, 10) : null;
}

// Kept for the markdown a rendering proxy returns, where the champion list comes
// through as "Ashe CS 209 (7.2) 2.25:1 KDA 6 / 6.8 / 9.3 60%25 Games".
export function parseChampions(raw) {
  if (!raw) return null;
  const re = /^(.{2,26}?)\s+CS\s+[\d.,]+\s*\([\d.]+\)\s+([\d.]+):1\s+KDA\s+([\d.]+)\s*\/\s*([\d.]+)\s*\/\s*([\d.]+)\s+(\d{1,3})%\s*(\d{1,3})\s+Games\b/i;
  const out = [];
  for (const line of stripRows(raw)) {
    const m = line.match(re);
    if (!m) continue;
    const name = m[1].replace(/\s+/g, " ").trim();
    if (!name || out.some(c => c.name === name)) continue;
    out.push({ name, kda: +m[2], k: +m[3], d: +m[4], a: +m[5], wr: +m[6], games: +m[7] });
  }
  return out.length ? out.slice(0, 10) : null;
}

// op.gg's tier graph runs off an lpHistories array; exactly one entry of it is
// server-rendered into the page and the rest arrives over an internal RPC keyed
// to their build, which is not something to depend on. The one entry still beats
// nothing: it carries the moment the LP actually changed, so a check made a week
// later dates the point correctly instead of stamping it "now".
export function parseLpHistory(raw) {
  if (!raw) return null;
  const text = String(raw).replace(/\\"/g, '"');
  const m = text.match(/"created_at"\s*:\s*"([^"]+)"\s*,\s*"tier_info"\s*:\s*\{([^}]*)\}\s*(?:,\s*"elo_point"\s*:\s*(\d+))?/);
  if (!m) return null;
  const t = Date.parse(m[1]);
  if (!t || t > Date.now() + 86400000) return null;
  const tier = m[2].match(/"tier"\s*:\s*"([A-Z]+)"/i);
  // the name has to be a real tier, or a typo upstream becomes a point on a chart
  if (!tier || !new RegExp("^(" + TIER_WORD + ")$", "i").test(tier[1])) return null;
  const T = tier[1].toUpperCase();
  const lp = m[2].match(/"lp"\s*:\s*(\d+)/);
  const label = m[2].match(/"label"\s*:\s*"([^"]*)"/);
  const div = label && label[1].match(/\b([1-4])\b/);
  return {
    t, tier: T,
    division: (MASTER_PLUS.includes(T) || !div) ? null : DIV_MAP[div[1]],
    lp: lp ? +lp[1] : 0,
    elo: m[3] ? +m[3] : null,
  };
}

export function parseProfileIcon(raw) {
  if (!raw) return null;
  const m = String(raw).match(/profile_icons?\/profileicon(\d+)/i);
  return m ? `https://opgg-static.akamaized.net/meta/images/profile_icons/profileIcon${m[1]}.jpg` : null;
}
