// Smurf Tracker — Cloudflare Worker backend
// Deploy this, paste the worker's URL into the app's Settings > "Backend URL".
// GET /?name=<gameName>&tag=<tagLine>&region=<euw|eune|na|kr>
// -> {"found":true,"tier":"GOLD","division":"II","lp":45,"wins":30,"losses":25,"level":247,"peak":{"tier":"PLATINUM","division":"IV","lp":12},"seasons":{"solo":[...],"flex":[...]},"flex":{"tier":"UNRANKED"},"champs":[{"name":"Ashe","wr":60,"games":25,"kda":2.25}],"icon":"https://opgg-static.akamaized.net/meta/images/profile_icons/profileIcon123.jpg","mmr":null,"avgRecent":null}
// -> {"found":false}  (summoner genuinely doesn't exist)
// -> HTTP 4xx/5xx on transient failures (missing params, op.gg unreachable, page didn't parse) —
//    the app falls back to the free proxy chain / paste / manual entry on any non-2xx response.

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });

    const url = new URL(request.url);
    const name = url.searchParams.get("name");
    const tag = url.searchParams.get("tag");
    const region = (url.searchParams.get("region") || "euw").toLowerCase();

    if (!name || !tag) return json({ error: "missing name/tag" }, 400);

    const target = `https://op.gg/lol/summoners/${encodeURIComponent(region)}/${encodeURIComponent(name)}-${encodeURIComponent(tag)}`;

    let res;
    try {
      res = await fetch(target, {
        headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
      });
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
      champs: parseChampions(html),
      icon: parseProfileIcon(html), // needs the raw HTML — htmlToText() already stripped the <img> tags out
      mmr: null,
      avgRecent: null,
    }, 200);
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

// The season tables and the champion list are only readable as rows, so block tags
// become newlines instead of spaces here. Ported from the app's stripRows.
function stripRows(raw) {
  return String(raw)
    .replace(/<script[sS]*?</script>/gi, " ")
    .replace(/<style[sS]*?</style>/gi, " ")
    .replace(/</(tr|li|div|p|h[1-6]|section|article)s*>/gi, "
")
    .replace(/<brs*/?>/gi, "
")
    .replace(/<[^>]*>/g, " ")
    .replace(/[ 	]+/g, " ")
    .split("
").map(l => l.trim()).filter(Boolean);
}

// One row per past season, for both queues. The caption above the rows is what
// says which queue they belong to.
function parseSeasons(raw) {
  if (!raw) return null;
  const rowRe = new RegExp("(S\d{4}(?:\s*S\d)?)\s*\|?\s*(?:\|\s*)?(" + TIER_WORD + ")\s*([1-4])?\s*\|?\s*(\d{1,4})\s*\|?\s*$", "i");
  const out = { solo: [], flex: [] };
  let bucket = null;
  for (const line of stripRows(raw)) {
    if (/rankeds*solo/i.test(line) && /season/i.test(line) && /LP/i.test(line)) { bucket = "solo"; continue; }
    if (/rankeds*flex/i.test(line) && /season/i.test(line) && /LP/i.test(line)) { bucket = "flex"; continue; }
    if (!bucket) continue;
    const m = line.match(rowRe);
    if (!m) { if (/^|?s*:?-{2,}/.test(line) || /season/i.test(line)) continue; if (out[bucket].length) bucket = null; continue; }
    const tier = m[2].toUpperCase();
    out[bucket].push({
      season: m[1].replace(/s+/g, " "), tier,
      division: (MASTER_PLUS.includes(tier) || !m[3]) ? null : DIV_MAP[m[3]],
      lp: +m[4],
    });
  }
  return (out.solo.length || out.flex.length) ? out : null;
}

// Only trusted when a tier and an LP figure sit together right under the heading.
function parseFlex(raw) {
  if (!raw) return null;
  const lines = stripRows(raw);
  for (let i = 0; i < lines.length; i++) {
    if (!/^rankeds*flex$/i.test(lines[i])) continue;
    const near = lines.slice(i + 1, i + 4).join(" ");
    if (/^s*unranked/i.test(near)) return { tier: "UNRANKED", division: null, lp: null };
    const m = near.match(new RegExp("\b(" + TIER_WORD + ")\b(?:\s+([1-4]|IV|III|II|I)(?![\dA-Za-z]))?\s*(\d{1,4})\s*LP\b", "i"));
    if (m) {
      const tier = m[1].toUpperCase();
      return { tier, division: (MASTER_PLUS.includes(tier) || !m[2]) ? null : (DIV_MAP[m[2]] || m[2].toUpperCase()), lp: +m[3] };
    }
  }
  return null;
}

// "Ashe CS 209 (7.2) 2.25:1 KDA 6 / 6.8 / 9.3 60%25 Games"
function parseChampions(raw) {
  if (!raw) return null;
  const re = /^(.{2,26}?)s+CSs+[d.,]+s*([d.]+)s+([d.]+):1s+KDAs+([d.]+)s*/s*([d.]+)s*/s*([d.]+)s+(d{1,3})%s*(d{1,3})s+Games/i;
  const out = [];
  for (const line of stripRows(raw)) {
    const m = line.match(re);
    if (!m) continue;
    const name = m[1].replace(/s+/g, " ").trim();
    if (!name || out.some(c => c.name === name)) continue;
    out.push({ name, kda: +m[2], k: +m[3], d: +m[4], a: +m[5], wr: +m[6], games: +m[7] });
  }
  return out.length ? out.slice(0, 10) : null;
}

function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

// op.gg stacks the summoner level on the profile icon as a bare number with no
// label anywhere near it, which is why the "Lv." patterns below never found it and
// every backend check came back with level: null. The only anchor is position — it
// is the number printed immediately before the Riot ID heading.
// Ported from the app's client-side parseLevelText; keep the two in sync.
function parseLevelText(raw, name, tag) {
  if (!raw || !name) return null;
  const text = htmlToText(raw);
  const needle = (name + "#" + tag).toLowerCase();
  const hay = text.toLowerCase();
  for (let from = 0; ; ) {
    const i = hay.indexOf(needle, from);
    if (i < 0) return null;
    const m = text.slice(Math.max(0, i - 14), i).match(/(d{1,4})[s#>]*$/);
    if (m) { const lv = +m[1]; if (lv >= 1 && lv <= 5000) return lv; }
    from = i + 1;
  }
}

// The season peak: op.gg prints the highest rank reached under the current one and
// badges it "Top tier". The division must not be allowed to eat the first digit of
// the LP — without the lookahead, "master 393 LP" parses as division 3, 93 LP.
// Ported from the app's client-side parsePeakText; keep the two in sync.
function parsePeakText(raw) {
  if (!raw) return null;
  const text = htmlToText(raw);
  const i = text.search(/Tops*tier/i);
  if (i < 0) return null;
  const before = text.slice(Math.max(0, i - 140), i);
  const re = /(challenger|grandmaster|master|diamond|emerald|platinum|gold|silver|bronze|iron)(?:s+([1-4]|IV|III|II|I)(?![dA-Za-z]))?s*(d{1,4})s*LP/ig;
  let m, last = null;
  while ((m = re.exec(before))) last = m;
  if (!last) return null;
  const tier = last[1].toUpperCase();
  const mPlus = ["MASTER", "GRANDMASTER", "CHALLENGER"].includes(tier);
  const map = { "1": "I", "2": "II", "3": "III", "4": "IV" };
  return { tier, division: (mPlus || !last[2]) ? null : (map[last[2]] || last[2].toUpperCase()), lp: +last[3] };
}

// Ported 1:1 from the app's client-side parseRankText — keep in sync if that one changes.
function parseRankText(raw) {
  if (!raw) return null;
  const text = String(raw).replace(/\s+/g, " ");
  const strict = /\b(challenger|grandmaster|master|diamond|emerald|platinum|gold|silver|bronze|iron)\b[^\dA-Za-z]{0,6}([1-4]|IV|III|II|I)?(?!\d)(?:\s\2(?!\d))?[^\d]{0,6}(\d{1,4})\s*LP\b/i;
  const m = text.match(strict);
  const out = { tier: null, division: null, lp: null, wins: null, losses: null, level: null };
  if (m) {
    out.tier = m[1].toUpperCase();
    if (m[2]) {
      const map = { "1": "I", "2": "II", "3": "III", "4": "IV" };
      out.division = map[m[2]] || m[2].toUpperCase();
    }
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

// Ported 1:1 from the app's client-side parseProfileIcon.
function parseProfileIcon(raw) {
  if (!raw) return null;
  const m = String(raw).match(/profile_icons?\/profileicon(\d+)/i);
  return m ? `https://opgg-static.akamaized.net/meta/images/profile_icons/profileIcon${m[1]}.jpg` : null;
}
