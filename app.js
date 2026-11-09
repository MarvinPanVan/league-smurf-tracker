"use strict";
// ---------- constants ----------
const DB_KEY="smurf-tracker", CFG_KEY="smurf-tracker-cfg";
const REGIONS={
  NA:{opgg:"na",full:"North America"},ME:{opgg:"me",full:"Middle East"},
  EUW:{opgg:"euw",full:"Europe West"},EUNE:{opgg:"eune",full:"Europe Nordic & East"},
  OCE:{opgg:"oce",full:"Oceania"},KR:{opgg:"kr",full:"Korea"},JP:{opgg:"jp",full:"Japan"},
  BR:{opgg:"br",full:"Brazil"},LAS:{opgg:"las",full:"Latin America South"},LAN:{opgg:"lan",full:"Latin America North"},
  RU:{opgg:"ru",full:"Russia"},TR:{opgg:"tr",full:"Türkiye"},
  SG:{opgg:"sg",full:"Southeast Asia"},TW:{opgg:"tw",full:"Taiwan"},VN:{opgg:"vn",full:"Vietnam"}
};
const TIER_ORDER=["IRON","BRONZE","SILVER","GOLD","PLATINUM","EMERALD","DIAMOND","MASTER","GRANDMASTER","CHALLENGER"];
const TIER_COLORS={IRON:"#8a8a8a",BRONZE:"#b0765a",SILVER:"#a8bdd0",GOLD:"#e6c15a",PLATINUM:"#4fd1c5",EMERALD:"#3ddc84",DIAMOND:"#7ea6f0",MASTER:"#b16ce8",GRANDMASTER:"#e05656",CHALLENGER:"#f4d688",UNRANKED:"#7090b0"};
/* ---- tier crests ----
   Ten emblems, one per tier, drawn here rather than fetched. The app is a single
   file that has to keep working offline, and Riot's own rank art is neither ours
   to ship nor reachable without a network — so this is an original set that only
   borrows the idea of a rank emblem.
   They are built to be told apart by silhouette alone, because at the 13px the
   list rows use no interior detail survives at all: plates for Iron through
   Silver, cut gems for Gold through Diamond, crowned gems with escalating wings
   above that. `d` is the body, `c` a crown behind it, `w` wings, `s` a star,
   `f` facet lines scored over the top. */
/* Every crest is cut like a gem: flat facets in three tones of its tier colour,
   lit from the top left on all ten, so the ladder reads as one family. It used to
   be one white-to-colour gloss gradient laid over each silhouette — the same
   shine on everything, which is what made them read as blobs at 16px. The
   silhouettes are unchanged; only the cut is new. Each facet is [tone, path]:
   L light, T table (the top face of a cut stone), M the tier colour, D shadow,
   W white. */
const crestPoly=pts=>"M"+pts.map(p=>p.join(" ")).join("L")+"Z";
const crestScale=(pts,f)=>pts.map(([x,y])=>[+(12+(x-12)*f).toFixed(2),+(12+(y-12)*f).toFixed(2)]);
// a bevelled stone: one facet per edge between the outline and a smaller table
const crestRing=(outer,f,tones)=>{const inner=crestScale(outer,f);
  return [...outer.map((o,k)=>{const n=(k+1)%outer.length;return [tones[k],crestPoly([o,outer[n],inner[n],inner[k]])]}),["T",crestPoly(inner)]]};
// the apex body: a hexagon cut into six facets from its centre
const crestHex=(cy,r,tones=["L","M","D","D","M","L"])=>{const h=r*.866,c=[12,cy],pts=[[12,cy-r],[12+h,cy-r/2],[12+h,cy+r/2],[12,cy+r],[12-h,cy+r/2],[12-h,cy-r/2]];
  return pts.map((p,k)=>[tones[k],crestPoly([c,p,pts[(k+1)%6]])])};
// Challenger's gem is ice blue (the lower-case tones), so beside Gold it is not
// one more yellow crest; its crown and wings stay gold.
const CREST_ICE="#a9dcf5", ICE=["l","m","d","d","m","l"];
const crestStar=(cx,cy,R,r)=>"M"+Array.from({length:10},(_,k)=>{const a=-Math.PI/2+k*Math.PI/5,q=k%2?r:R;
  return (+(cx+q*Math.cos(a)).toFixed(2))+" "+(+(cy+q*Math.sin(a)).toFixed(2))}).join("L")+"Z";
const CREST_HEX=[[12,2.5],[20,7.1],[20,16.9],[12,21.5],[4,16.9],[4,7.1]];
const CREST_OCT=[[8.4,3],[15.6,3],[20,7.4],[20,16.6],[15.6,21],[8.4,21],[4,16.6],[4,7.4]];
const CRESTS={
  IRON:[["L","M7 6.5h10l.6 3.5H6.4z"],["M","M6.4 10h11.2l3.2 8H3.2z"],["D","M3.2 18h17.6l-.8 1.6H4z"]],
  BRONZE:[["L","M12 4.5H4.5V11c0 4.3 3.4 7.1 7.5 9.7z"],["M","M12 4.5h7.5V11c0 4.3-3.4 7.1-7.5 9.7z"],
    ["T","M12 8.2l3.6 2.1v3.9L12 16.4l-3.6-2.2v-3.9z"]],
  SILVER:[["L","M4.5 4.5h6L12 6.4V20.6C7.9 18.1 4.5 15.3 4.5 11z"],["M","M19.5 4.5h-6L12 6.4V20.6c4.1-2.5 7.5-5.3 7.5-9.6z"],
    ["T","M4.5 9l7.5 4.2L19.5 9v2.6l-7.5 4.2-7.5-4.2z"]],
  GOLD:crestRing(CREST_HEX,.55,["L","M","D","D","M","L"]),
  PLATINUM:crestRing(CREST_OCT,.5,["L","L","M","D","D","D","M","L"]),
  EMERALD:(()=>{const A=[8,3],B=[16,3],C=[20,7],D=[20,17],E=[16,21],F=[8,21],G=[4,17],H=[4,7],
    p=[8.6,7.4],q=[15.4,7.4],r=[15.4,16.6],s=[8.6,16.6];
    return [["L",crestPoly([A,B,q,p])],["L",crestPoly([B,C,q])],["M",crestPoly([C,D,r,q])],["D",crestPoly([D,E,r])],
      ["D",crestPoly([E,F,s,r])],["D",crestPoly([F,G,s])],["M",crestPoly([G,H,p,s])],["L",crestPoly([H,A,p])],["T",crestPoly([p,q,r,s])]]})(),
  DIAMOND:[["L","M6.8 3.5L2.5 9.5h6.3z"],["T","M6.8 3.5h10.4l-2 6H8.8z"],["M","M17.2 3.5l4.3 6h-6.3z"],
    ["M","M2.5 9.5h6.3L12 21z"],["L","M8.8 9.5h6.4L12 21z"],["D","M15.2 9.5h6.3L12 21z"]],
  MASTER:[["L","M4.6 9.4 3.4 3.2l4 3L12 1v8.4z"],["M","M19.4 9.4l1.2-6.2-4 3L12 1v8.4z"],...crestHex(15.3,6.9)],
  GRANDMASTER:[["M","M6 12.6L.5 9.4l.4 6.4z"],["D","M18 12.6l5.5-3.2-.4 6.4z"],
    ["L","M5.2 10 4 4.2l3.9 2.9L12 2.2V10z"],["M","M18.8 10 20 4.2l-3.9 2.9L12 2.2V10z"],...crestHex(15.5,6.3)],
  CHALLENGER:[["M","M5.8 13 0 9.6l.4 6.8z"],["D","M18.2 13 24 9.6l-.4 6.8z"],
    ["L","M5.4 10.6 4.2 5.2 7.9 8 12 3.4v7.2z"],["M","M18.6 10.6l1.2-5.4L16.1 8 12 3.4v7.2z"],...crestHex(15.6,5.8,ICE),
    ["W","M12 0l.9 2 2.1.3-1.55 1.5.4 2.1L12 4.9l-1.85 1 .4-2.1L9 2.3l2.1-.3z"]]
};
const DIV_ORDER={IV:0,III:1,II:2,I:3};
const STALE_MS=3*24*3600*1000;
// How often an auto-check may re-run, shortest to longest. The label is what the
// dropdown shows; the value is what actually gates a refresh.
const AUTO_EVERY=[
  {v:0.5,label:"every 30 minutes"},{v:2,label:"every 2 hours"},{v:6,label:"every 6 hours"},
  {v:12,label:"every 12 hours"},{v:24,label:"once a day"},{v:72,label:"every 3 days"},
  {v:168,label:"once a week"},{v:336,label:"every 2 weeks"}
];
const DEFAULT_AUTO_HOURS=72;
/* Idle minutes before an encrypted vault locks itself. A free number field looked
   like a spreadsheet cell in Settings and stretched across the panel; presets
   read as a sentence the way "Refresh at most" does. */
const AUTO_LOCK=[
  {v:0,label:"Never"},
  {v:5,label:"5 minutes"},
  {v:15,label:"15 minutes"},
  {v:30,label:"30 minutes"},
  {v:60,label:"1 hour"},
  {v:120,label:"2 hours"},
  {v:180,label:"3 hours"}
];
/* One clamp for the dropdown and for what is stored. They used to differ: the
   dropdown pinned anything over three hours to 180 while cfg.autoLockMin kept the
   larger number, so Settings showed a timer that was not the one running — until
   a Save happened to write the shown value back over it. A day is the ceiling; a
   longer "auto"-lock is the Off setting with extra steps. */
const AUTO_LOCK_MAX=1440;
function clampAutoLock(v){
  const n=Math.round(Number(v));
  return Number.isFinite(n)&&n>0?Math.min(n,AUTO_LOCK_MAX):0;
}
function fillAutoLock(sel,current){
  const mins=clampAutoLock(current);
  const opts=AUTO_LOCK.slice();
  if(!opts.some(o=>o.v===mins))opts.push({v:mins,label:mins+" minutes (current)"});
  opts.sort((a,b)=>a.v-b.v);
  sel.innerHTML=opts.map(o=>`<option value="${o.v}">${esc(o.label)}</option>`).join("");
  sel.value=String(mins);
}
// label is the full wording — dropdowns, search text, toasts. short is what fits
// on a card next to the account name.
const STATUS={active:{label:"Active",short:"Active",color:"#3ddc84"},resting:{label:"Resting / unused",short:"Resting",color:"#7a94ab"},restricted:{label:"Chat/ranked restricted",short:"Restricted",color:"#f4d688"},banned:{label:"Banned",short:"Banned",color:"#e47474"}};

// ---------- state ----------
let accounts=[];
const APP_VERSION="2.28.1";
const APP_CHANGELOG=[
  {v:"2.28.1",items:[
    "The buttons at the top right are one set of icons, and Stats is a simple on/off switch",
  ]},
  {v:"2.28.0",items:[
    "After a new season, accounts say \"Not placed yet this season\" with last season's rank under it, and the header counts them",
    "The chart and Peak show this season only, and \"Ranked accounts only\" auto-check still checks accounts waiting on placements",
    "CSV export says the LP history isn't in it, and the Label field no longer offers to fill in a contact",
  ]},
  {v:"2.27.2",items:[
    "More details and Settings' Advanced sections open more gently, so they glide instead of jumping at the start",
  ]},
  {v:"2.27.1",items:[
    "Windows open straight away: + Add account no longer waits a tenth of a second before it shows",
    "Opening a window is smoother: the page behind is darkened instead of blurred",
    "More details and Settings' Advanced sections glide open and closed, and a tap on More details no longer brings up the iPad keyboard",
  ]},
  {v:"2.27.0",items:[
    "Play next is now Suggested game, and says why first: \"Decays in 3 days\", then the account",
    "On a phone, Check all ranks and + Add account share one row, and the status line no longer ends in a stray dot",
    "Cards opened from \"+N more\" can be closed, never-checked cards have a Check rank button, and a picture that won't load leaves the initial",
  ]},
  {v:"2.26.1",items:[
    "On a phone, the header's status line wraps instead of making the whole page wider",
    "A new account is scrolled into view, not only lit up",
    "A banned account's copy buttons are muted in the list, Quick find leaves out key hints on touch screens, and tags say \"+5 more\" like the notes",
  ]},
  {v:"2.26.0",items:[
    "Calmer cards: no win bar under the win rate, no \"Updated\" line until a rank is a day old, no empty note prompts, and tags on one row",
    "Refresh rank and Add note are in each card's ⋯ menu, and the LP-per-day pace is on the chart's newest point",
    "Cards no longer lift under the pointer, the stats panel closes as smoothly as it opens, and switching layout fades in",
  ]},
  {v:"2.25.0",items:[
    "On a phone the app opens in the list view, so more accounts fit on a screen, each with its copy buttons",
    "The search box shows Ctrl K: open Quick find, type a name, and copy the login",
    "\"Need a refresh\" sits in the header with the other account states, and Check all ranks is the one button for it",
  ]},
  {v:"2.24.0",items:[
    "Calmer cards: the Login button is tinted instead of bright, so the ranks stand out",
    "The chart's D/W/M switch sits in the date row instead of on your newest point",
    "Master, Grandmaster and Challenger emblems are clearer at small sizes, Challenger is ice blue, and the tab icon is easy to spot",
  ]},
  {v:"2.23.0",items:[
    "Closing the account form or Settings asks before it throws away what you typed, and search finds a full Riot ID like Name#EUW",
    "A new account scrolls into view, Undo covers archiving and bulk delete, and phones get the selection bar at the bottom of the screen",
    "Dates, times, numbers and records read the same everywhere: 8 Nov, 12 hours ago, 1,234 LP, 15W 9L",
  ]},
  {v:"2.22.0",items:[
    "Questions like \"Delete all?\" open in the app's own window, and the back button closes windows instead of leaving",
    "On iPhone, Safari's 7-day deletion is explained once, with how to keep your vault",
    "Compare by ticking two accounts, Backup and Sync share one tab, and the example data stays until you save",
  ]},
  {v:"2.21.0",items:[
    "A check that fails is said once on the card, with the reason in plain words",
    "List rows show \"Last check failed\" too",
    "Charts no longer show division numbers. Point at a dot to see its rank",
  ]},
  {v:"2.20.0",items:[
    "Login in the list says it copied, the same way the card does",
    "A copy the browser refuses no longer moves Login on to the password",
    "CSV import reads tiers and divisions however a spreadsheet wrote them, and a banned account's chart is grey again",
  ]},
  {v:"2.19.0",items:[
    "Turning a filter on no longer moves the page: its chip sits beside the count it explains",
    "Copying says so on the button you pressed, not in a message over the next card",
    "Calmer charts, theme dots, a shorter card menu, Sync in plain words, and Level 23 in the list",
  ]},
  {v:"2.18.0",items:[
    "Play next gives a reason to play: about to decay, a game or two from the next division, or not played in a week or more",
    "The stats end with \"Figures from all 3 ranked accounts\" instead of opening on a Counting control",
    "The Average climb line keeps its shape instead of lying flat",
  ]},
  {v:"2.17.0",items:[
    "Details opens straight onto its contents, and each card's corner keeps the LP change and one signal",
    "Charts leave out a label that would sit on the line, say \"One check so far\" instead of drawing one dot, and have a bigger D/W/M switch",
    "Plainer words on cards: Last login, Idle 54 days, 1,762 LP to go, a real flag icon, and small text that stays readable over champion art",
  ]},
  {v:"2.16.0",items:[
    "Login copies the username, then the password, one click each; the eye beside it shows the saved login",
    "A shorter Add account form: Riot ID, region and login first, the rest under More details, and a missing field marked where it is",
    "Calmer type, only the search row pinned as you scroll, failed checks shown on the card, and a tidier Settings, Help and phone layout",
  ]},
  {v:"2.15.0",items:[
    "Flat buttons in three kinds, and every control in a toolbar row is the same height",
    "The header shows your ranks as small emblems with counts; accounts not found are one warning with Show",
    "A one-line footer, a plain bar to level 30 on levelling cards, and a count that leaves archived accounts out",
  ]},
  {v:"2.14.0",items:[
    "Smurf Tracker now lives at smurf-tracker.pages.dev, an address of its own",
    "The old address moves your vault over in one click: Move my vault there",
    "Stricter security headers at the new address: no other site can show the app in a frame",
  ]},
  {v:"2.13.0",items:[
    "The fonts come with the app: opening it no longer asks Google Fonts for anything",
    "A security policy lets only the app's own script run on the page",
    "The app is now index.html, app.css, app.js and a fonts folder: a downloaded copy needs all of them",
  ]},
  {v:"2.12.0",items:[
    "Cards in a row end closer together: notes show two chips and \"+N more\", and Details has the rest",
    "A levelling account shows its way to ranked as 30 steps, with how fast it is going once checks see the level move",
    "Plainer wording across Help, Settings, tooltips and messages",
  ]},
  {v:"2.11.0",items:[
    "Every main button is one colour now, the one Settings calls Secondary",
    "The list keeps favourites in their own tier, shows tier headings only when tiers hold several, and spreads out on a laptop",
    "Tags is a button in the toolbar; chart labels keep clear of the line; favourite cards lose the \"selected\" frame",
  ]},
  {v:"2.10.0",items:[
    "On a phone your accounts are on the first screen: stats fold away, one ranks button, a one-line preview banner",
    "The phone list copies a login in one tap; checkboxes come with Select",
    "\"+87 LP\" says it's since the last check, with the pace beside it; banned accounts stay quiet everywhere",
    "The app says truthfully what leaves your browser: only the Riot ID, to look up a rank",
  ]},
  {v:"2.9.1",items:[
    "Saved passwords in plain text? The app now asks you to set a master password, with Not now and Don't ask again",
    "Riot's own disclaimer replaces \"not affiliated\", in the footer, on shared snapshots and in the README",
  ]},
  {v:"2.9.0",items:[
    "Cards say each thing once: Peak only when it's above today, no flame chip, and no notch splitting the win bar",
    "Login has the row to itself, with a key; Refresh is an icon beside \"Updated 2 h ago\"",
    "Charts keep their end dots inside the frame, and marks from two tiers say which (P II, G I)",
    "The stats say what they measure: a week's total, an average climb, Most played champions, days since a check",
    "A banned card stays quiet (no LP chips, no Refresh); the preview uses invented names",
  ]},
  {v:"2.8.1",items:[
    "Wide screens use their width: six cards to a row at 2560px, and the list spreads out like a table",
    "List rows are two lines instead of three, and hovering a row shows its select box",
    "An empty vault opens on the welcome alone; a banned card no longer warns that it is out of date",
  ]},
  {v:"2.8.0",items:[
    "A new account's rank is checked right away, and a list row or Quick find (Ctrl+K) copies a login in one click",
    "Cleaner screens: the stats say each thing once, the list reads as a table, and a phone shows accounts on the first screen",
    "A first visit opens on a short welcome; the region follows the tag (Name#KR1 → Korea); out of date is amber, not red",
    "Settings says when closing would drop a change; the ⋯ menu starts with Settings; bigger touch targets and a skip link",
  ]},
  {v:"2.7.0",items:[
    "Copy buttons say Copied right where you clicked, and windows and menus fade out instead of vanishing",
    "On is green and a warning amber in every theme — 2-step on and No 2-step no longer look the same",
    "A card's status (Resting, Restricted) sits whole under the name instead of being cut short",
    "Four card stats sit two by two, and an empty vault shows how the app works in three steps",
  ]},
  {v:"2.6.1",items:[
    "Buttons have a soft satin finish, so anything you can press looks pressable",
    "Tags, chips and panels stay flat, so a button never looks like a label",
  ]},
  {v:"2.6.0",items:[
    "A cleaner look: graphite background, one soft light from above, colour only where it means something",
    "One material: flat buttons, a solid wordmark, no chrome next to matte",
    "The header buttons' frame is the same on every side at any display scale",
  ]},
  {v:"2.5.1",items:[
    "A locked tab opens what another tab saved, instead of an older copy",
    "Chart labels move off the line where there's room",
    "Backup file names and dates use your own day, not UTC",
    "Help covers the password check-up and Face ID / fingerprint unlock",
  ]},
  {v:"2.5.0",items:[
    "Unlock with Face ID, fingerprint or Windows Hello: Settings › Security",
    "The master password still works, and is what you need if the passkey is lost",
  ]},
  {v:"2.4.0",items:[
    "Password check-up (Settings › Security): passwords used twice, weak ones, and data leaks",
    "Sort: Last opened puts the account you were just on first",
    "The leak check sends only 5 characters of a scrambled copy, never a password",
  ]},
  {v:"2.3.5",items:[
    "Card art… opens again for accounts with no champion yet",
    "Card art: the strength preview matches the card, and phones get a full row of skins",
    "Dashboard lists and chart labels read cleanly: no stray dots, no line through a label",
    "A shared snapshot opens at its top, and leaves out art its card hides",
    "A saved skin that no longer exists opens ready to save another",
  ]},
  {v:"2.3.4",items:[
    "Card art… has a Strength slider: for this card, or for all cards",
    "A preview shows the art behind the card's name and rank as you slide",
  ]},
  {v:"2.3.3",items:[
    "Easier to read everywhere: buttons, fields and dividers have visible edges",
    "Faint labels, chart labels and the Notes box are brighter",
  ]},
  {v:"2.3.2",items:[
    "Card art: picking a skin shows it at once, the full splash fades in",
    "The ⋯ menu is solid and its items are easier to read",
  ]},
  {v:"2.3.1",items:[
    "iPad and iPhone: one tap on a card's buttons is enough again",
    "Card art is as visible as in 2.2 again; the skin picker skips chromas",
    "Note fields are brighter and a size larger, easier to read",
    "On touch screens the select box shows faintly instead of on hover",
  ]},
  {v:"2.3.0",items:[
    "Share a snapshot: a read-only page of your ranks in one link (⋯ menu)",
    "Card art… picks any champion and skin for a card; the art is subtler",
    "Notes get fields: honor, skins, Blue Essence, 2-step, penalties, your own",
    "Snapshots never carry logins, emails or notes, and nothing is uploaded",
  ]},
  {v:"2.2.1",items:[
    "Theme swatches and the header tray draw cleanly on every theme",
    "Leaving Settings by Escape or ✕ now undoes every unsaved preview",
    "iPhones no longer zoom into fields when Text size is Small",
    "Escape closes Quick find first; Settings shows its open tab on a phone",
    "Streamer mode covers tier-up notifications too",
    "Phones: set-up steps and Best account wrap instead of spilling",
    "Worker: a lighter daily alert check (redeploy to get it)",
  ]},
  {v:"2.2.0",items:[
    "Themes: a whole look in one click, or colours that follow your best rank",
    "Streamer mode (H) hides Riot IDs, logins, emails and notes",
    "Settings in tabs; Effects and Text size; choose what each card shows",
    "Champion art: each account's most-played champion, faded into its card",
    "This week on the dashboard; New season resets every rank at once, with Undo",
    "Bulk add reads op.gg multi-search links and the lobby chat",
    "With a Riot key: mastery, win streaks and roles; search champ: and role:",
    "Decay alerts on Discord, even with the app closed (redeploy your worker)",
    "App icon shortcuts: Check all ranks, Add account",
  ]},
  {v:"2.1.0",items:[
    "Play next picks the account that needs a game; Diamond+ warns before decay",
    "Stronger vault encryption — update every device you sync before pushing",
    "Get set up walks a new vault through add, check, lock and back up",
    "Paste Name#TAG into the name field; Copy username, then password",
    "Your own worker in one click, and Riot's API with your key: renames followed, last 5 ranked games",
    "Levelling accounts count down to 30; search is:decay, is:ready, is:leveling",
    "Compact cards option; the browser is asked to keep your vault",
    "Group climb no longer drops when you add a lower account",
  ]},
  {v:"2.0.0",items:[
    "A new look from the League client: hextech gold on blue-black, gem-cut rank crests",
    "Cleaner type: ranks, buttons and titles in one clear face",
    "Refresh stale skips accounts never checked or not found",
    "Compare is a versus screen; win rate reads as wins against losses",
    "Busy charts are a clean line, and an axis over two seasons names the year",
    "The backup reminder has its own Back up now button",
    "Settings opens on Appearance; Help is a list you can scan; the lock screen is branded",
    "Phones: the console squares up, and the ⋯ menu opens on screen",
  ]},
  {v:"1.9.4",items:[
    "Saved data that can't be read is set aside, never saved over",
    "A setting saved in one tab survives a save in another",
    "Sync: every edit is a newer revision; a fast clock elsewhere no longer fakes a conflict",
    "Locking empties the windows too — no login left behind in a hidden form",
    "The card's ⋯ menu works from the keyboard, and Tab stays inside Settings",
    "Phones: list rows and toasts fit the screen; long names ellipsise, flag in view",
  ]},
  {v:"1.9.3",items:[
    "Tag handle: gold means a tag is filtering, and nothing else — the count is grey until one is",
  ]},
  {v:"1.9.2",items:[
    "Dashboard: all seven tiles share one baseline again, and no W/L figure orphans its WR",
    "A status chip no longer takes the room the account name needs",
    "A grid emptied by the filters offers a way back out of them",
    "On a phone the rank window says whose rank it is",
  ]},
  {v:"1.9.1",items:[
    "Ribbon: the ladder keeps the bar — Not found and Banned stop scaling with their count",
    "Chart: the D/W/M switcher waits to be asked for, so it stops covering the marks",
    "An empty note is a quiet line, not an outlined box on every card",
  ]},
  {v:"1.9.0",items:[
    "Rank opens a window, like Account — the two sit together in the ⋯ menu",
    "Tag handle carries a mark and the gold filters already speak in",
    "Rank fields are named and roomy — no clipped digits, no stepper arrows",
    "Above Master the division field says —, instead of a greyed-out I",
  ]},
  {v:"1.8.9",items:[
    "Card footer is a full-width bar — Login and Refresh share it, ⋯ closes it",
  ]},
  {v:"1.8.8",items:[
    "Tags fold into a tab on the console's bottom edge — a handle, not a band",
    "Folded it costs ~17px; the handle lights up while a tag is filtering",
    "No tags in the view, no tag band at all",
    "Chart points are hovered from a band around the dot, not the whole column",
  ]},
  {v:"1.8.7",items:[
    "op.gg joins dpm.lol under Look up — one kind of thing, one place",
    "A chart point too near the top opens its tip downward, clear of D/W/M",
    "Chart tip is opaque, so the line no longer shows through the text",
  ]},
  {v:"1.8.6",items:[
    "Sort by rank: Unranked-but-checked now ranks above never-checked",
    "⋯ menu: named groups and an icon per item instead of ten lines of text",
    "⋯ menu fits without scrolling; the clipped account-name row is gone",
  ]},
  {v:"1.8.5",items:[
    "The card's ⋯ is a real menu now — it floats, and the card no longer reflows",
    "Picking from it closes it, so one missclick costs one click to undo",
    "Login and Rank are alternatives instead of stacking up on the same card",
    "Rank opens on Current only; season peak and goal fold away with their prose",
    "Escape clears what a card unfolded; every panel has a ✕",
    "Card footer is four buttons, all at a 32px target; dpm.lol moved into the menu",
  ]},
  {v:"1.8.4",items:[
    "Bulk add opens over the page — inline, it locked scrolling and hid itself",
    "Sync: a pull adopts the cloud revision instead of stamping a newer local one",
    "Ribbon matches the dash Rank spread on banned accounts, with its own segment",
    "Open Rank panel keeps the disabled division select through a re-render",
    "Auto-lock dropdown shows the timer that is running; /vault URL built on the path",
    "Changes that could not be written are no longer reported as saved",
  ]},
  {v:"1.8.3",items:[
    "Archived view + chore tiles: exit Archive so filters are not empty",
    "Dash tile counts follow toolbar filters; Never checked uses hasReading",
    "Sync: GET-before-PUT, equal-rev no-op pull, password-change cloud warning",
    "Manual Lock now; plaintext export labeling + encrypted export option",
    "Multi-tab storage lock; lighter flag/compare updates; SW/fonts polish",
  ]},
  {v:"1.8.2",items:[
    "Sync LWW fix: Push uses content rev (no Date.now overwrite of newer cloud)",
    "Pull conflict confirms; sanitize + save-failure handling",
    "Dash: banned out of Season W/L; ribbon never-checked matches filter",
    "Check-all: one disk write at end; fail path refreshes dash tiles",
    "Wall scroll height, Group climb forward-fill, rib-seg hover isolation",
  ]},
  {v:"1.8.1",items:[
    "Group climb: real hover tip + plain-language note (was broken SVG title)",
  ]},
  {v:"1.8.0",items:[
    "Encrypted vault sync between devices via worker + sync token (KV)",
    "Dashboard: Ladder trend (was Pool LP) — clipped, labeled, hoverable points",
    "Never checked / chore filters ignore banned and archived accounts",
    "Mobile thumb-friendly list and tap targets",
    "Real PWA PNG icons",
  ]},
  {v:"1.7.0",items:[
    "Worker batch refresh (one round-trip for Check-all)",
    "Uncertain parse warning when op.gg meta is missing",
    "Duplicate Riot ID detection",
    "Rotation reminder + Played today check-in",
    "Season reset per account",
    "Winrate trend, pool LP sparkline, compare two accounts",
    "Export reminder days + worker deploy help in Settings",
  ]},
];
function clampExportDays(v){const n=Math.round(Number(v));return Math.max(1,Math.min(365,(n>0&&isFinite(n))?n:30))}
let cfg={apiKey:"",model:"claude-sonnet-5",autoCheck:false,backendUrl:"",exportRemindDays:30,syncToken:"",vaultRev:0,lastSyncAt:0};
// Older releases stored retired model IDs; map them forward so a saved setting
// doesn't keep sending a model the API no longer serves.
const MODEL_ALIASES={"claude-sonnet-4-6":"claude-sonnet-5","claude-sonnet-4-5":"claude-sonnet-5","claude-3-5-sonnet":"claude-sonnet-5"};
// Only Sonnet 5 supports the newer dynamic-filtering web search; Haiku needs the basic one.
const WEB_SEARCH_TOOL={"claude-sonnet-5":"web_search_20260209","claude-haiku-4-5":"web_search_20250305"};
let ui={search:"",region:"",tag:null,favOnly:false,sort:"rank",status:"",showArchived:false,
  flag:"",   // "" | "stale" | "unchecked" | "failed" | "attention" | "missing" | "dup" | "rotate" | "decay"
  tier:"",   // a single tier, or "UNRANKED"; set by clicking the rank spread
  density:"cards"};
// The three questions a vault of sixty accounts raises, as functions, because the
// filters, the stats panel and the check runner all need to agree on the answers.
function isChecked(a){return !!(a.stats&&a.stats.updatedAt)}
/* Stale is a reading that has gone old: a profile that was found, last read more
   than three days ago. It used to include every account with no reading at all —
   never checked, or checked and not found — so "Refresh N stale" re-tried, on every
   run, accounts whose Riot side is not set up yet and can only answer "not found"
   again. Those have their own tiles (Never checked, Needs attention) and their own
   way to be checked: filter to them and Check N shown. */
function isStale(a){
  const s=a.stats;
  return a.status!=="banned"&&isChecked(a)&&s.found!==false&&!!(s.tier||s.level!=null)&&Date.now()-s.updatedAt>STALE_MS;
}
function isRanked(a){const t=a.stats&&a.stats.found!==false&&(a.stats.tier||"").toUpperCase();return !!(t&&t!=="UNRANKED")}
/* An account with no rank yet. "Never checked" is right until a check has been
   tried; after one that failed it sat over "Last check failed" on the same card,
   one line saying the check never happened and the next that it did. */
function noRankLabel(a){return isFailed(a)?"No rank yet":"Never checked"}
function isFailed(a){
  if(!a.stats||a.stats.found===false)return false;
  // Transport failure note only — "failed (" alone matched too many informational notes.
  return /auto-fetch failed/i.test(String(a.stats.note||""));
}
/* Why the last check failed, in words a player can act on. The note keeps the
   browser's own error ("Failed to fetch", "HTTP 503", "backend: timeout"), which
   says something to whoever debugs it and nothing to anyone else. */
function failReason(note){
  const m=/auto-fetch failed \((.*)\)/i.exec(String(note||"")), e=(m?m[1]:"").toLowerCase();
  const why=/timeout|abort/.test(e)?"The rank source took too long to answer."
    :/\b429\b/.test(e)?"The rank source had too many requests at once."
    :/no rank found|missing rank|incomplete/.test(e)?"The profile page had no rank on it. Check the Riot ID and region."
    :/^backend:/.test(e)?"Your own worker (Backend URL) did not answer."
    :/^api:/.test(e)?"The AI lookup did not work."
    :"Could not reach the rank source. Your connection or the free lookup service may be down.";
  return why+" Refresh to try again, or enter the rank by hand under ⋯ → Rank…";
}
/* "Never checked" = no reading yet. A CSV tier without updatedAt is a reading
   (hasReading), not a chore — isChecked alone wrongly counted those as never. */
function neverChecked(a){return isLive(a)&&!hasReading(a.stats)}
// Shared with the worker: op.gg sometimes serves a 200 "not found" page.
function isSummonerNotFoundPage(html){
  return /summoner\s+not\s+found|this\s+summoner\s+is\s+unregistered/i.test(String(html||""))
    && !parseRankFromMeta(html);
}
function isUncertain(a){return !!(a.stats&&a.stats.uncertain)}
function riotKey(a){
  return ((a.region||"")+"|"+String(a.gameName||"").trim().toLowerCase()+"|"+String(a.tagLine||"").trim().toLowerCase());
}
let _dupCache=null,_dupSrc=null;
function duplicateIds(){
  if(_dupCache&&_dupSrc===accounts)return _dupCache;
  const map=new Map();
  for(const a of accounts){
    if(a.archived)continue;
    const k=riotKey(a); if(!k||k==="||")continue;
    if(!map.has(k))map.set(k,[]);
    map.get(k).push(a.id);
  }
  const dups=new Set();
  for(const ids of map.values())if(ids.length>1)ids.forEach(id=>dups.add(id));
  _dupCache=dups;_dupSrc=accounts;
  return dups;
}
function isDuplicate(a){return duplicateIds().has(a.id)}
function invalidateDupCache(){_dupCache=null;_dupSrc=null}
function rotationDays(a){
  const t=a.lastPlayedAt||a.lastLoginAt||(a.stats&&a.stats.updatedAt)||0;
  if(!t)return null;
  return Math.floor((Date.now()-t)/86400000);
}
/* Ranked decay, Diamond and up. Each tier has a bank of days: Diamond starts with
   28 and banks 7 more per ranked game, up to 28; Master, Grandmaster and
   Challenger start with 14 and bank 1 per game, up to 14. One day drains each
   night, and once the bank is empty the account loses LP every day (50 in
   Diamond, 75 above). Riot does not publish the bank, so this is an estimate from
   what the app has seen: the season's game count at every check. It walks the
   checks since the account reached Diamond (or since the season began), adds the
   games played between two checks at the midpoint of that gap — the app knows how
   many, not when — and drains a day per day. The more often an account is
   checked, the closer it gets. Returns whole days left, below 0 when decaying. */
const DECAY_RULES={DIAMOND:{cap:28,per:7,lp:50},MASTER:{cap:14,per:1,lp:75},GRANDMASTER:{cap:14,per:1,lp:75},CHALLENGER:{cap:14,per:1,lp:75}};
function decayDays(a){
  const st=decayState(a);
  return st?Math.floor(st.bank-(Date.now()-st.at)/86400000):null;
}
// The bank of decay protection as of the latest reading — what decayDays counts
// down from, and what the worker's daily alert check carries forward.
function decayState(a){
  if(!isRanked(a)||a.status==="banned")return null;
  const s=a.stats, tier=(s.tier||"").toUpperCase();
  if(!DECAY_RULES[tier]||s.wins==null||s.losses==null||!s.updatedAt)return null;
  const D=86400000;
  const pts=(a.history||[]).filter(h=>+h.t&&h.w!=null&&h.l!=null&&+h.t<=+s.updatedAt)
    .map(h=>({t:+h.t,tier:(h.tier||"").toUpperCase(),g:(Number(h.w)||0)+(Number(h.l)||0)}));
  pts.push({t:+s.updatedAt,tier,g:(Number(s.wins)||0)+(Number(s.losses)||0)});
  pts.sort((x,y)=>x.t-y.t);
  // back to where this stretch at Diamond and up began (a lower tier, or a new season)
  let i=pts.length-1;
  while(i>0&&DECAY_RULES[pts[i-1].tier]&&pts[i-1].g<=pts[i].g)i--;
  let rule=DECAY_RULES[pts[i].tier], bank=rule.cap;
  for(let k=i+1;k<pts.length;k++){
    const r=DECAY_RULES[pts[k].tier];
    if(r.cap!==rule.cap){rule=r;bank=r.cap}   // promoted to Master or dropped to Diamond: that tier's own start
    const half=(pts[k].t-pts[k-1].t)/D/2, games=Math.max(0,pts[k].g-pts[k-1].g);
    bank=Math.max(0,bank-half);
    if(games)bank=Math.min(rule.cap,bank+games*rule.per);
    bank=Math.max(0,bank-half);
  }
  const last=pts[pts.length-1];
  return{bank,at:last.t,games:last.g,tier:last.tier};
}
/* Building an account: ranked opens at level 30 (and 20 champions owned, which no
   source shows). Until then the level is the account's progress; at 30 and still
   unranked it is ready to place. */
function isLeveling(a){const s=a.stats;return isLive(a)&&!!s&&s.found!==false&&!isRanked(a)&&s.level!=null&&Number(s.level)<30}
// "about 2 levels a day" from the levels seen at checks, once there is a day of them
function levelPace(a){
  const L=Array.isArray(a.lvls)?a.lvls:[];if(L.length<2)return"";
  const f=L[0],l=L[L.length-1],days=(l.t-f.t)/86400000,gain=l.v-f.v;
  if(days<1||gain<=0)return"";
  const perDay=gain/days;
  return perDay>=1?"about "+Math.round(perDay)+" level"+(Math.round(perDay)===1?"":"s")+" a day"
    :"about "+Math.max(1,Math.round(perDay*7))+" level"+(Math.max(1,Math.round(perDay*7))===1?"":"s")+" a week";
}
/* The way to ranked. A ranked card has its chart; a levelling one shows the one
   number that matters, the level against 30, as one bar: ticks at 10 and 20, how
   many levels are left and, once checks have seen the level move, how fast. (2.12
   drew thirty separate steps, taller at every tenth and at the current one, which
   read like a chart of something and said no more than the bar does.) */
function levelTrackHTML(a){
  const lv=Math.max(0,Math.min(30,Math.floor(Number(a.stats.level)||0))), left=30-lv, pace=levelPace(a);
  const pct=n=>(n/30*100).toFixed(1)+"%";
  return`<div class="lvt" title="Ranked opens at level 30 (and 20 champions owned)">`
    +`<div class="lvt-h"><span class="lvt-r">${left} level${left===1?"":"s"} to ranked</span>${pace?`<span class="lvt-pace">${esc(pace)}</span>`:""}</div>`
    +`<div class="lvt-bar" role="img" aria-label="Level ${lv} of 30"><i style="width:${pct(lv)}"></i><b style="left:${pct(10)}"></b><b style="left:${pct(20)}"></b></div>`
    +`<div class="lvt-ax"><span>1</span><span style="left:${pct(10)}">10</span><span style="left:${pct(20)}">20</span><span>30</span></div></div>`;
}
function isReadyForRanked(a){const s=a.stats;return isLive(a)&&!!s&&s.found!==false&&!isRanked(a)&&Number(s.level)>=30&&!lastSeasonRank(a)}
// days are floored, so 0 is "less than one left" — "~0d" read as already gone
function decayIn(d){return d<1?"<1d":"~"+d+"d"}
function decayRisk(a){const d=decayDays(a);return isLive(a)&&d!==null&&d<=7}
/* Which account to play next. One about to decay comes first — the soonest of
   them — because that is LP to lose; after that, the active account left longest
   without being played or opened. Resting, banned and archived accounts are out
   by definition, and so is anything never read. Nothing is suggested until some
   account has sat for 3 days: "play the one you played yesterday" is not advice. */
/* When an account was last played, from what the app can actually see: a game
   counted between two checks (its wins and losses went up), the last five games
   a worker brought back, or Mark played. A check alone is not a game. */
function lastPlayedOf(a){
  let t=Number(a.lastPlayedAt)||0;
  const r=normRecent(a.recent);if(r)for(const g of r.games)if(g.at>t)t=g.at;
  const h=(a.history||[]).filter(p=>p.w!=null&&p.l!=null);
  for(let i=1;i<h.length;i++)if((+h[i].w)+(+h[i].l)>(+h[i-1].w)+(+h[i-1].l)&&+h[i].t>t)t=+h[i].t;
  return t||null;
}
// "Gold I" for a Gold II account, "Platinum" for a Gold I one
function nextStep(s){
  const t=(s.tier||"").toUpperCase(), D=["IV","III","II","I"], i=D.indexOf(normDivision(t,s.division));
  return i<3?tierLabel({tier:t,division:D[i+1]}):tierLabel({tier:TIER_ORDER[TIER_ORDER.indexOf(t)+1],division:null});
}
/* What to play, and a reason that is a reason to play. It used to fall back on
   "4 days since its last check", which counts days since the app looked, not since
   anyone played. In order: an account about to decay; one a game or two from going
   up a division; the one left longest, counted from a game or its login, and only
   once that is a week. Nothing qualifies, nothing is suggested. */
function playNext(pool){
  const live=(pool||accounts).filter(a=>isLive(a)&&(a.status||"active")==="active"&&isChecked(a)&&a.stats.found!==false);
  const urgent=live.filter(decayRisk).sort((x,y)=>decayDays(x)-decayDays(y));
  // the reason is the tile's headline now, so it is a sentence, not a note
  if(urgent.length){const a=urgent[0],d=decayDays(a);
    return{a,why:d<0?"Decaying now, play a ranked game":d<1?"Decays in under a day":"Decays in "+d+" day"+(d===1?"":"s")}}
  const MI=TIER_ORDER.indexOf("MASTER");
  const near=live.filter(a=>{const s=a.stats,lp=Number(s.lp),t=TIER_ORDER.indexOf((s.tier||"").toUpperCase());
    return isRanked(a)&&t>=0&&t<MI&&normDivision(s.tier.toUpperCase(),s.division)&&lp>=75&&lp<100})
    .sort((x,y)=>y.stats.lp-x.stats.lp);
  if(near.length){const a=near[0];return{a,why:(100-a.stats.lp)+" LP to "+nextStep(a.stats)}}
  let best=null,days=-1,played=false;
  for(const a of live){
    const p=lastPlayedOf(a)||0, l=Number(a.lastLoginAt)||0, t=Math.max(p,l);
    if(!t)continue;
    const d=Math.floor((Date.now()-t)/86400000);
    if(d>days){best=a;days=d;played=p>=l}
  }
  if(!best||days<7)return null;
  return{a:best,why:played?"Not played in "+days+" days":"Login last used "+days+" days ago"};
}
// Said in words on hover and to a screen reader: unexplained, it was a mystery mark
function flagMark(){return `<span class="flagmark" role="img" aria-label="Flagged for attention" title="Flagged for attention. Clear it in the ⋯ menu.">${icon("flag")}</span>`}
function needsRotation(a){
  if(a.status==="banned"||a.archived)return false;
  const d=rotationDays(a);
  return d!=null&&d>=14;
}
function wrTrend(a){
  const h=(a.history||[]).filter(p=>p.w!=null&&p.l!=null);
  if(h.length<2)return null;
  const a0=h[Math.max(0,h.length-4)], a1=h[h.length-1];
  if(seasonBreak(a0,a1))return null;
  const wr=p=>{const t=(+p.w||0)+(+p.l||0);return t?((+p.w||0)/t)*100:null};
  const x=wr(a0), y=wr(a1);
  if(x==null||y==null)return null;
  const d=Math.round(y-x);
  return {d, wr:Math.round(y)};
}
/* "Unranked" is an answer a check came back with, not the absence of one. The stats
   panel counts it that way on purpose — never-checked accounts are a chore waiting to
   be done and have a tile of their own — but the filter behind that tile took every
   account without a rank, never-checked ones included. So "Unranked ×3" filtered the
   grid down to eight cards, and the two numbers sat one line apart. */
function isUnrankedAnswer(a){return isChecked(a)&&a.stats.found!==false&&!isRanked(a)}
/* ---- seasons ----
   A season ends in an account's history one of two ways: a reading that comes back
   unranked after a ranked one (New season here, or Riot's reset in January, when
   every check comes back unranked), or season totals that go down (seasonBreak).
   This season is what comes after the last such end; what is before it is last
   season's, and the card, the chart and Peak leave it there. */
function isRankedPoint(h){const t=h&&(h.tier||"").toUpperCase();return !!t&&t!=="UNRANKED"&&h.found!==false}
function seasonStartIdx(hist){
  let start=0,prevRanked=false,lastWL=null;
  (hist||[]).forEach((h,i)=>{
    const r=isRankedPoint(h), wl=h&&h.w!=null&&h.l!=null;
    if((!r&&prevRanked)||(wl&&lastWL&&seasonBreak(lastWL,h)))start=i;
    if(wl)lastWL=h;
    prevRanked=r;
  });
  return start;
}
function thisSeason(hist){hist=hist||[];return hist.slice(seasonStartIdx(hist))}
/* The rank an account finished an earlier season on: its last ranked reading before
   this season began, or else the latest of its Past seasons (the one New season
   files, or op.gg's list). */
function lastSeasonRank(a){
  const hist=(a&&a.history)||[], i=seasonStartIdx(hist);
  for(let k=i-1;k>=0;k--)if(isRankedPoint(hist[k]))return{e:hist[k],label:"Last season"};
  const past=normSeasons(a&&a.stats&&a.stats.seasons), solo=past?past.solo.filter(isRankedPoint):[];
  if(!solo.length)return null;
  const p=solo.find(e=>e.season==="prev")||solo.slice().sort((x,y)=>String(y.season).localeCompare(String(x.season)))[0];
  return{e:p,label:p.season==="prev"?"Last season":"Last ranked in "+p.season};
}
/* Unranked this season after a rank in an earlier one: placements still to play.
   After a reset that was every account in the vault, and each one looked like a
   fresh smurf ("Level 1203 · Ready for ranked") under a Peak from last season. */
function notPlaced(a){return isUnrankedAnswer(a)&&!!lastSeasonRank(a)}
// the Unranked tier, its count and its filter: never had a rank to place from
function unrankedTier(a){return isUnrankedAnswer(a)&&!notPlaced(a)}
function lastSeasonText(a){
  const r=lastSeasonRank(a);if(!r)return"";
  return r.label+": "+tierLabel(r.e)+(r.e.lp!=null?" · "+fmtN(r.e.lp)+" LP":"");
}
// the same, with the rank in its tier's colour
function lastSeasonHTML(a){
  const r=lastSeasonRank(a);if(!r)return"";
  return esc(r.label)+`: <span style="color:${tierColor(r.e.tier)}">${esc(tierLabel(r.e)+(r.e.lp!=null?" · "+fmtN(r.e.lp)+" LP":""))}</span>`;
}
/* Whether a check has ever brought a reading back. A check that fails before one
   has ever succeeded leaves a note behind on an otherwise empty stats object, and
   all three layouts asked "is there a stats object" instead — so the card claimed
   "Unranked · No ranked games found" about an account nobody had managed to read
   yet, while the stats panel beside it went on counting the same account under
   Never checked. Not isChecked(): a CSV import carries a tier with no timestamp,
   and that is a rank we know. */
function hasReading(s){return !!(s&&(s.tier||s.level!=null||s.found===false))}
/* Something about this account needs a human. Set by hand from the card menu, and
   set automatically when a check comes back saying the profile does not exist —
   which almost always means the Riot ID has been changed and nothing about this
   account will work again until it is corrected. Never cleared automatically:
   only the person who wrote it down knows whether it has been dealt with.
   This exists because the vault filled up with notes reading "verify Riot ID",
   typed by hand into a freetext box where nothing could count them, filter by
   them, or show them anywhere but inside that one card. */
/* Flagged by you. A check that finds no profile raises the flag by itself, but
   those are the header's "not found" warning already, and counting them here too
   said the same thing twice. */
function needsAttention(a){return !!a.flagged&&a.status!=="banned"&&!a.archived&&!(a.stats&&a.stats.found===false)}
/* Active vault accounts — chore counts (never checked, failed, …) ignore banned
   and archived, which are already dealt with and only clutter those tiles. */
function isLive(a){return !a.archived&&a.status!=="banned"}
let checking=new Set(), checkGen=new Map(), openInfo=new Set(), openSec=new Set(), shutSec=new Set(), openLogin=new Set(), shownPw=new Set(), openRank=new Set(), selected=new Set(), openMore=new Set(), armedDelete=null, editingId=null, flashId=null;
// Which card has its note open, plus the live text. The draft is kept out here
// on purpose: the grid re-renders wholesale, so a textarea rendered from a.notes
// would throw away whatever was typed the moment an unrelated card updated.
let chartRange=new Map(); // accountId -> "d" | "w" | "m", defaulted from the data
let editingNote=null, noteDraft="";
// "<accountId>:<block>" for the one card section that was *just* opened. The grid
// re-renders wholesale on any change, so without this every open section would
// replay its entrance animation whenever an unrelated card updated.
let reveal=null;
let dashJustOpened=false; // same one-shot idea, for the stats panel
let hasStorage=true;
let vaultPassword=null;
let previewMode=false;
let lastSelectedId=null;
let lastActivity=Date.now();
let currentEnvelope=null;

// ---------- storage ----------
// A banned account is never worth a request. Beyond that, "active" here means the
// account has a rank to track — an unranked or never-placed smurf produces the
// same empty answer every time, so refreshing it on a timer is pure noise. Both
// the age gate and the ranked-only gate are user settings.
function autoCheckDue(a){
  if(a.status==="banned"||a.archived)return false;
  // Ranked-only skips accounts *known* to have no rank. An account that has never
  // been checked is not one of those — it still needs its first check to find out,
  // and skipping it would leave it stuck outside the filter forever. A failed
  // first fetch leaves a note-only stats object with no tier; that is still "never
  // read", not "known unranked", so hasReading() gates the skip rather than the
  // bare presence of a stats object.
  /* Nor is one waiting on its placements: after a reset that is every account in
     the vault, and skipping them all meant no new rank was ever found on its own. */
  if(cfg.autoRankedOnly&&hasReading(a.stats)){
    const t=(a.stats.tier||"").toUpperCase();
    if(a.stats.found===false||!t||(t==="UNRANKED"&&!notPlaced(a)))return false;
  }
  const hrs=coerceAutoEvery(cfg.autoEveryHours);
  if(!a.stats||!a.stats.updatedAt)return true;
  return Date.now()-a.stats.updatedAt>hrs*3600*1000;
}
/* A corrupt or hand-edited cfg can leave autoEveryHours as "" / NaN / 0.
   `+"" === 0`, so every open would fire a check-all. Require a positive finite
   interval; anything else falls back to the default. */
function coerceAutoEvery(h){
  const n=Number(h);
  // Reject 0 / NaN / negative — `+"" === 0` used to make every open fire a check-all.
  // Any positive finite value is fine (presets in the UI; tests may use others).
  return Number.isFinite(n)&&n>0?n:DEFAULT_AUTO_HOURS;
}
function storageOK(){try{localStorage.setItem("__t","1");localStorage.removeItem("__t");return true}catch(e){return false}}
/* Everything that changes the vault ends in a call to this, and hardly any of the
   forty callers await it. All three guards below belong here for that reason.

   Locked, because relock() drops the password and empties `accounts` while a rank
   check may still be waiting on the network. That check resolves afterwards and
   saves — with no password and nothing left to save — which wrote a plaintext "[]"
   straight over the encrypted envelope. An auto-lock that landed during "Check all
   ranks" destroyed the vault, and the app then asked for no password at all,
   because relock() looks for an envelope on disk and there was none left.

   Serialised, because an encrypted save reads `accounts` and writes it out on
   opposite sides of a key lookup and AES-GCM. Two of them overlapping have no
   order between them, so the one that started first can reach setItem last and put
   its own older snapshot back. Queued end to end there is only one order — and the
   part that pays for itself, a save that a newer one has already superseded drops
   out instead of encrypting a state known to be out of date, so two changes in one
   tick cost one encryption rather than two.

   And it answers, because it used to swallow the error and toast about it, while
   the caller went on to its own "saved" message — into the same toast, over the
   top of the warning. */
/* `keepRev` is for the one caller whose write is not a new revision: a Pull has
   just adopted the cloud's revision, and bumping it here would leave this device
   permanently "newer" than the copy it just took — which is exactly what made the
   equal-rev no-op pull unreachable and had an untouched device warning about
   losing local changes on its next pull. Every other write is a real change and
   stamps a real revision. */
let saveSeq=0, saveChain=Promise.resolve();
/* The whole vault is localStorage, and by default a browser treats that as
   disposable: Chrome and Firefox may clear it when the disk runs low, and Safari
   clears it after seven days without a visit. Asking for persistent storage turns
   it into data only the user can delete. Asked once, when the first account is
   saved; Settings shows the answer and can ask again. Firefox asks the user; Chrome
   and Safari decide by themselves (an installed or often-used site usually gets it). */
async function storageState(){
  try{
    if(!navigator.storage||!navigator.storage.persisted)return"unknown";
    return(await navigator.storage.persisted())?"protected":"open";
  }catch(e){return"unknown"}
}
async function protectStorage(){
  try{return !!(navigator.storage&&navigator.storage.persist&&await navigator.storage.persist())}catch(e){return false}
}
/* What the worker at the Backend URL has set up, so that a deploy can be checked
   from here rather than by guesswork: a Riot API key, and storage for sync. An
   older worker without /status answers with an error, which is reported as such. */
async function updateBackendStatus(){
  const el=$("sBackendStatus");if(!el)return;
  const raw=($("sBackend").value||"").trim();
  if(!raw){el.textContent="";return}
  let u;try{u=new URL(raw)}catch(e){el.textContent="That is not a URL.";el.style.color="var(--danger)";return}
  u.pathname=u.pathname.replace(/\/?$/,"/status");u.search="";
  el.style.color="";el.textContent="Checking the worker…";
  try{
    const c=new AbortController();const t=setTimeout(()=>c.abort(),8000);
    const res=await fetch(u.href,{signal:c.signal}).finally(()=>clearTimeout(t));
    const d=await res.json().catch(()=>null);
    if(d&&d.ok===true){
      el.textContent=(d.riot?"Riot API key: set. Ranks come from Riot.":"Riot API key: not set. Ranks come from op.gg (the guide below adds one).")
        +" · "+(d.vault?"Sync storage: ready":"Sync storage: not bound");
    }else el.textContent="Worker reached, but it is an older version. Redeploy it for Riot API support and this status line.";
  }catch(e){el.textContent="Could not reach the worker at that URL.";el.style.color="var(--danger)"}
}
async function updateStorageStatus(){
  const el=$("sStorageStatus"),btn=$("sStorageProtect");
  if(!el)return;
  const st=await storageState();
  el.textContent=st==="protected"?"Protected. This browser will not clear the vault on its own."
    :st==="open"?"Not protected. The browser may clear it when space runs low, and Safari does after 7 days without a visit. Protect it, install the app, and keep a backup."
    :"This browser does not say whether it keeps the vault, so keep a backup.";
  // a warning, not an error: nothing has been lost, and one click fixes it
  el.style.color=st==="open"?"var(--warn-txt)":"";
  btn.classList.toggle("hidden",st!=="open");
}
function saveDB(opts){invalidateDupCache();
  if(accounts.length&&!previewMode&&hasStorage&&!cfg.persistAsked){cfg.persistAsked=true;saveCfg();protectStorage()}
  const keepRev=!!(opts&&opts.keepRev);
  const stampRev=()=>{if(!keepRev)touchVaultRev()};
  // Locked is a hard no — not a silent success. Import (and anything else that
  // awaits this) used to toast "imported" while the disk never moved, because
  // the lock guard shared the same early-return-true as preview / no-storage.
  if(vaultLocked())return Promise.resolve(false);
  if(!hasStorage||previewMode)return Promise.resolve(true);
  // Counted for both kinds of save, so that a plaintext one — removing the password
  // — also supersedes any encrypted save still queued behind it, which would
  // otherwise put the envelope back afterwards.
  const seq=++saveSeq;
  // Without a password there is nothing to await, so there is nothing to queue
  // either: this stays written by the time it returns, the way the rest of the app
  // has always been able to assume of an unencrypted vault.
  if(!vaultPassword){
    try{localStorage.setItem(DB_KEY,JSON.stringify(accounts));stampRev();return Promise.resolve(true)}
    catch(e){toast("Saving failed (storage error)");return Promise.resolve(false)}
  }
  saveChain=saveChain.then(async()=>{
    if(seq!==saveSeq)return true; // superseded while queued; the newer one is next
    try{
      const envelope=await encryptData(vaultPassword,accounts);
      // Asked again on the far side: encrypting is the slow part, and both a lock
      // and a newer save can land inside it.
      if(vaultLocked()||seq!==saveSeq)return true;
      localStorage.setItem(DB_KEY,JSON.stringify(envelope));
      currentEnvelope=envelope;
      stampRev();
      return true;
    }catch(e){toast("Saving failed (storage error)");return false}
  });
  return saveChain;
}
/* Report a change only once it is actually on disk. saveDB() answers, and it
   toasts its own "Saving failed (storage error)" — but a caller that fires its
   own "Archived" into the same toast a line later paints straight over that
   warning, and the user is told a change was kept when it was not. Set / remove
   master password already awaited the answer; this is the same discipline for
   the fifteen other callers that report success. */
function saveThen(msg,action,fn){
  const p=saveDB();
  p.then(ok=>{if(ok&&msg)toast(msg,action,fn)});
  return p;
}
function touchVaultRev(){
  // Monotonic local revision for LWW device sync — bumped on every successful save.
  // Strictly bumped: a revision pulled from a device whose clock runs ahead is in
  // this one's future, and max(rev, now) then stamped an edit with the very number
  // it was pulled at — which the other device reads as "already in sync".
  cfg.vaultRev=Math.max((Number(cfg.vaultRev)||0)+1,Date.now());
  saveCfg();
}
function saveCfg(){if(!hasStorage)return;try{localStorage.setItem(CFG_KEY,JSON.stringify(cfg))}catch(e){}}

// ---------- vault encryption (Web Crypto, AES-256-GCM) ----------
/* Built one character at a time this re-allocated the string on every byte, and
   an encrypted sixty-account vault is around 150 000 of them — which made this
   line, not the cipher, the most expensive part of writing the vault out.
   Chunked so the joining happens inside the engine, with a chunk small enough to
   stay well under the argument limit on apply(). */
function b64(bytes){
  let s="";
  for(let i=0;i<bytes.length;i+=0x8000)s+=String.fromCharCode.apply(null,bytes.subarray(i,i+0x8000));
  return btoa(s);
}
function unb64(str){return Uint8Array.from(atob(str),c=>c.charCodeAt(0))}
/* Key stretching: what a stolen vault costs per password guess. 150 000 rounds of
   PBKDF2-SHA256 was the figure when the vault was written; OWASP's current advice is
   600 000. New saves use 600 000 and say so in the envelope, and a vault saved
   before that (no count recorded) is read at 150 000 and rewritten at 600 000 on
   its next save — so it upgrades itself the first time it is opened.
   The count rides in the salt field ("600000$<salt>") rather than a field of its
   own: a sync worker deployed from an older copy rebuilds the envelope from exactly
   {__enc, salt, iv, data}, and would have dropped a new field on the floor —
   leaving a vault that the next pull could not open. */
const KDF_ITER=600000, KDF_ITER_LEGACY=150000;
function saltField(salt,iter){return iter+"$"+b64(salt)}
function readSaltField(f){
  const i=String(f).indexOf("$");
  return i<0?{salt:unb64(f),iter:KDF_ITER_LEGACY}:{salt:unb64(f.slice(i+1)),iter:parseInt(f.slice(0,i),10)||KDF_ITER_LEGACY};
}
async function deriveKey(password,salt,iter){
  const km=await crypto.subtle.importKey("raw",new TextEncoder().encode(password),"PBKDF2",false,["deriveKey"]);
  return crypto.subtle.deriveKey({name:"PBKDF2",salt,iterations:iter||KDF_ITER,hash:"SHA-256"},km,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
}
/* The derived key, held for as long as the vault stays open.
   Deriving it is 600 000 PBKDF2 rounds, and encryptData used to do that on every
   single save — with a save committed after each account, one "Check all ranks"
   over sixty accounts paid for sixty full derivations on top of the network work.
   The salt is what stops a precomputed table from attacking the password, so it
   has to be random per *vault*, not per *write*; holding it steady while the vault
   is open takes nothing away from that. What must never repeat under one key is
   the IV, and that is still drawn fresh for every single encryption below.
   The key itself is created non-extractable, so unlike the password beside it,
   it cannot be read back out of memory by script. */
let vaultKey=null;   // {password, salt:Uint8Array, iter, key:CryptoKey}
// With no salt this is the key new saves are written with, so a key cached from
// reading an older, weaker envelope is not reused for writing.
async function keyFor(password,salt,iter){
  const it=iter||KDF_ITER;
  if(vaultKey&&vaultKey.password===password&&vaultKey.iter===it&&(!salt||b64(salt)===b64(vaultKey.salt)))return vaultKey;
  const s=salt||crypto.getRandomValues(new Uint8Array(16));
  vaultKey={password,salt:s,iter:it,key:await deriveKey(password,s,it)};
  return vaultKey;
}
function forgetVaultKey(){vaultKey=null}
async function encryptData(password,obj){
  const {salt,key,iter}=await keyFor(password);
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const ct=await crypto.subtle.encrypt({name:"AES-GCM",iv},key,new TextEncoder().encode(JSON.stringify(obj)));
  return {__enc:true,salt:saltField(salt,iter),iv:b64(iv),data:b64(new Uint8Array(ct))};
}
async function decryptData(password,envelope){
  const {salt,iter}=readSaltField(envelope.salt),iv=unb64(envelope.iv),data=unb64(envelope.data);
  // Derived against the envelope's own salt and cached under it, so unlocking is
  // the last derivation that happens until the vault is locked again.
  const {key}=await keyFor(password,salt,iter);
  let pt;
  try{pt=await crypto.subtle.decrypt({name:"AES-GCM",iv},key,data)}
  catch(e){forgetVaultKey();throw e}   // a key derived from a wrong guess must not linger
  return JSON.parse(new TextDecoder().decode(pt));
}
/* ---- unlock with a passkey ----
   Face ID, a fingerprint or Windows Hello instead of typing the master password.
   A passkey's PRF extension gives back the same 32 secret bytes each time it is
   asked with the same input, and only once the person at the device has been
   checked. Those bytes make a key that wraps the master password, and the wrapped
   password is all this browser keeps: on unlock the passkey unwraps it and the
   vault opens exactly as if the password had been typed. The vault, its format and
   the password are unchanged, the password still opens it anywhere, and this is
   per browser: nothing about it is synced or exported. */
const PK_KEY="smurf-tracker-passkey";
const PK_INFO="smurf-tracker passkey unlock v1";
function pkRecord(){
  if(!hasStorage)return null;
  try{
    const r=JSON.parse(localStorage.getItem(PK_KEY)||"null");
    return r&&r.v===1&&["id","salt","iv","ct"].every(k=>typeof r[k]==="string"&&r[k])?r:null;
  }catch(e){return null}
}
function pkForget(){try{if(hasStorage)localStorage.removeItem(PK_KEY)}catch(e){}}
function pkAvailable(){
  return !!(window.PublicKeyCredential&&navigator.credentials&&navigator.credentials.create
    &&(window.isSecureContext??location.protocol==="https:"));
}
async function pkWrapKey(prf){
  const base=await crypto.subtle.importKey("raw",prf,"HKDF",false,["deriveKey"]);
  return crypto.subtle.deriveKey({name:"HKDF",hash:"SHA-256",salt:new Uint8Array(32),info:new TextEncoder().encode(PK_INFO)},
    base,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
}
function pkNoPrf(){const e=new Error("This device's passkeys can't unlock a vault");e.name="NoPrf";return e}
// one use of the passkey: the person is checked, and the PRF bytes for this salt come back
async function pkEval(id,salt){
  const cred=await navigator.credentials.get({publicKey:{challenge:crypto.getRandomValues(new Uint8Array(32)),
    allowCredentials:[{type:"public-key",id}],userVerification:"required",timeout:120000,
    extensions:{prf:{eval:{first:salt}}}}});
  const r=cred&&cred.getClientExtensionResults&&cred.getClientExtensionResults().prf;
  const out=r&&r.results&&r.results.first;
  if(!out)throw pkNoPrf();
  return new Uint8Array(out);
}
async function pkSetup(password){
  // asked first where the browser can say, so a passkey that can't do this is never made
  try{
    const caps=PublicKeyCredential.getClientCapabilities&&await PublicKeyCredential.getClientCapabilities();
    if(caps&&caps["extension:prf"]===false)throw pkNoPrf();
  }catch(e){if(e.name==="NoPrf")throw e}
  const salt=crypto.getRandomValues(new Uint8Array(32));
  const cred=await navigator.credentials.create({publicKey:{
    rp:{name:"Smurf Tracker"},
    user:{id:crypto.getRandomValues(new Uint8Array(16)),name:"Smurf Tracker vault",displayName:"Smurf Tracker vault"},
    challenge:crypto.getRandomValues(new Uint8Array(32)),
    pubKeyCredParams:[{type:"public-key",alg:-7},{type:"public-key",alg:-257}],
    authenticatorSelection:{userVerification:"required",residentKey:"preferred"},
    timeout:120000,extensions:{prf:{eval:{first:salt}}}}});
  const id=new Uint8Array(cred.rawId);
  // from here the passkey exists: if this goes no further it is of no use, and the
  // browser is told so, so it can take it out of the password manager
  try{
    const ext=(cred.getClientExtensionResults&&cred.getClientExtensionResults().prf)||{};
    if(ext.enabled===false)throw pkNoPrf();
    if(ext.results&&ext.results.first){await pkStore(id,salt,new Uint8Array(ext.results.first),password);return true}
  }catch(e){pkSignalGone(id);throw e}
  // The rest answer the PRF only when the passkey is used, and Safari allows that
  // only from a tap of its own, not straight on from this one: the next tap on the
  // button finishes it.
  pkPending={id,salt};
  return false;
}
let pkPending=null;   // {id, salt}: a passkey made, waiting for the tap that reads its PRF
async function pkFinish(password){
  const p=pkPending;if(!p)return;
  try{await pkStore(p.id,p.salt,await pkEval(p.id,p.salt),password)}
  catch(e){
    if(e.name==="NotAllowedError")throw e;   // cancelled: still waiting, and the button can be tapped again
    pkDropPending();throw e;
  }
  pkPending=null;
}
function pkDropPending(){if(pkPending){pkSignalGone(pkPending.id);pkPending=null}}
async function pkStore(id,salt,prf,password){
  const key=await pkWrapKey(prf), iv=crypto.getRandomValues(new Uint8Array(12));
  const ct=await crypto.subtle.encrypt({name:"AES-GCM",iv},key,new TextEncoder().encode(password));
  localStorage.setItem(PK_KEY,JSON.stringify({v:1,id:b64(id),salt:b64(salt),iv:b64(iv),ct:b64(new Uint8Array(ct)),at:Date.now()}));
}
async function pkOpen(r){
  const key=await pkWrapKey(await pkEval(unb64(r.id),unb64(r.salt)));
  return new TextDecoder().decode(await crypto.subtle.decrypt({name:"AES-GCM",iv:unb64(r.iv)},key,unb64(r.ct)));
}
// a passkey that turned out useless, or was turned off: where the browser can, it is
// told so, and may take it out of the password manager
function pkSignalGone(id){
  try{
    if(PublicKeyCredential.signalUnknownCredential)PublicKeyCredential.signalUnknownCredential({rpId:location.hostname,
      credentialId:b64(id).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")}).catch(()=>{});
  }catch(e){}
}

// ---------- helpers ----------
const $=id=>document.getElementById(id);
const ICON={
  refresh:'<path d="M21 12a9 9 0 1 1-3-6.7"/><polyline points="21 3 21 9 15 9"/>',
  pencil:'<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>',
  clipboard:'<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/>',
  star:'<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  chevron:'<polyline points="6 9 12 15 18 9"/>',
  // close and remove: drawn, as ✕ was a typed character a size and weight of its own
  x:'<line x1="6.5" y1="6.5" x2="17.5" y2="17.5"/><line x1="17.5" y1="6.5" x2="6.5" y2="17.5"/>',
  // Rank…: a rank's chevrons, so it no longer shares Account…'s pencil
  rank:'<polyline points="6 13.5 12 8 18 13.5"/><polyline points="6 19 12 13.5 18 19"/><line x1="12" y1="3" x2="12" y2="5"/>',
  // the header menu's files: out of the app, into it, and a link to share
  download:'<path d="M12 4v11"/><polyline points="7.5 10.5 12 15 16.5 10.5"/><path d="M5 20h14"/>',
  upload:'<path d="M12 20V9"/><polyline points="7.5 13.5 12 9 16.5 13.5"/><path d="M5 4h14"/>',
  link:'<path d="M10 13.5a4.5 4.5 0 0 0 6.8.5l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.6 1.6"/><path d="M14 10.5a4.5 4.5 0 0 0-6.8-.5l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.6-1.6"/>',
  // Settings, as the header's ⋯ menu draws it
  gear:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  /* The header's set, drawn on the same grid and stroke as the magnifier beside them:
     the stats switch, and ⋯ and ? which were typed characters, smaller than the
     drawn icon, at another height and in another weight. */
  bars:'<line x1="4" y1="20" x2="20" y2="20"/><line x1="7.5" y1="16.5" x2="7.5" y2="11"/><line x1="12" y1="16.5" x2="12" y2="5.5"/><line x1="16.5" y1="16.5" x2="16.5" y2="13"/>',
  dots:'<circle cx="5" cy="12" r="1.1"/><circle cx="12" cy="12" r="1.1"/><circle cx="19" cy="12" r="1.1"/>',
  help:'<circle cx="12" cy="12" r="9.5"/><path d="M9.4 9.3a2.7 2.7 0 0 1 5.2.9c0 1.8-2.6 2.5-2.6 2.5"/><line x1="12" y1="16.8" x2="12.01" y2="16.8"/>',
  // a cloth on a pole: the pennant before it, small and red after a name, read as a "P"
  flag:'<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>',
  plus:'<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  eye:'<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff:'<path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><path d="M1 1l22 22"/><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/>',
  // a person, not a door: the button reveals the stored credentials, it doesn't sign you in anywhere
  user:'<path d="M20 21v-1.5a4.5 4.5 0 0 0-4.5-4.5h-7A4.5 4.5 0 0 0 4 19.5V21"/><circle cx="12" cy="8" r="4"/>',
  note:'<path d="M6.5 3H18a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6.5A2.5 2.5 0 0 1 4 18.5v-13A2.5 2.5 0 0 1 6.5 3z"/><line x1="8" y1="8.5" x2="16" y2="8.5"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="15.5" x2="13" y2="15.5"/>',
  // the stale timestamp's warning, drawn so it looks the same on every system
  alert:'<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  /* A hot streak. It was a 🔥 emoji, and the flame is the right picture — it is the
     emoji part that was wrong: a cartoon on one phone, a flat glyph on another. Same
     flame, drawn, so it looks one way everywhere and still runs warm. */
  chart:'<line x1="3" y1="21" x2="21" y2="21"/><rect x="5" y="11" width="4" height="7" rx="1"/><rect x="11" y="6" width="4" height="12" rx="1"/><rect x="17" y="14" width="4" height="4" rx="1"/>',
  /* The ⋯ menu's own set. Ten identical lines of grey text is a wall you read
     word by word; a mark in front of each one is what lets the eye group them
     and land on the right row without reading all of them. */
  external:'<path d="M14 3h7v7"/><line x1="21" y1="3" x2="11.5" y2="12.5"/><path d="M19 14.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4.5"/>',
  tag:'<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L2.5 12.5V2.5h10l8.1 8.1a2 2 0 0 1 0 2.8z"/><circle cx="7" cy="7" r="1.3"/>',
  check:'<polyline points="20 6 9 17 4 12"/>',
  image:'<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16.5l-5-5L5.5 20"/>',
  compare:'<rect x="3" y="5" width="7" height="14" rx="1.5"/><rect x="14" y="5" width="7" height="14" rx="1.5"/>',
  archive:'<rect x="3" y="4" width="18" height="4.5" rx="1"/><path d="M5 8.5V19a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5"/><line x1="10" y1="13" x2="14" y2="13"/>',
  reset:'<path d="M3.5 12a8.5 8.5 0 1 0 2.9-6.4"/><polyline points="3 4 3 9.5 8.5 9.5"/>',
  // a list row's copy-password button
  key:'<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 9.3-9.3"/><path d="m15.5 7.5 3 3"/><path d="m13 10 2 2"/>',
  // the welcome's privacy line: a padlock, for "stays here"
  lock:'<rect x="4.5" y="11" width="15" height="10" rx="2"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/>',
  trash:'<line x1="3.5" y1="6" x2="20.5" y2="6"/><path d="M18.5 6l-.9 13.1A2 2 0 0 1 15.6 21H8.4a2 2 0 0 1-2-1.9L5.5 6"/><line x1="10" y1="10.5" x2="10" y2="17"/><line x1="14" y1="10.5" x2="14" y2="17"/><path d="M9 6V4.2A1.2 1.2 0 0 1 10.2 3h3.6A1.2 1.2 0 0 1 15 4.2V6"/>'
};
function icon(name,cls){return `<svg class="ico${cls?" "+cls:""}" viewBox="0 0 24 24">${ICON[name]}</svg>`}
/* The header's ⋯ menu marks every entry the way a card's ⋯ menu does. Settings had
   the only mark, over ten lines of plain words: two menus, two styles. */
function setMenuItem(b,ic,label){setHTML(b,icon(ic)+`<span>${esc(label)}</span>`)}
const MORE_MENU_ICONS={bSettings:"gear",bBulkAdd:"plus",bShare:"link",bNewSeason:"reset",bStreamer:"eyeOff",
  bExportEnc:"lock",bExport:"download",bExportCsv:"download",bImport:"upload",bImportCsv:"upload",bDeleteAll:"trash"};
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
// data-id and querySelector both need the id to be inert. esc() for attributes;
// CSS.escape for selectors — a poisoned id in localStorage used to break out of
// data-id="…" on first paint, and a quote in an id made querySelector throw.
function idAttr(id){return esc(id)}
function idSel(id){
  try{return CSS.escape(String(id))}catch(e){return String(id).replace(/\\/g,"\\\\").replace(/"/g,'\\"')}
}
// Boot/import can land any id string. Anything that is not a plain token gets a
// fresh uid() so attributes and selectors stay safe without relying on esc alone.
function safeAccountId(id){return typeof id==="string"&&/^[A-Za-z0-9._:-]+$/.test(id)?id:uid()}
/* Boot, unlock and import all used to trust tags/history were arrays. A corrupt
   backup with those fields as objects survived into migrateStats / render and
   threw mid-grid. Same normalisation everywhere an account enters memory. */
function sanitizeAccount(a){
  if(!a||typeof a!=="object")return null;
  a.id=safeAccountId(a.id);
  if(typeof a.gameName==="string")a.gameName=a.gameName.trim();
  if(typeof a.tagLine==="string")a.tagLine=a.tagLine.trim();
  if(!Array.isArray(a.tags))a.tags=[];
  if(!Array.isArray(a.history))a.history=[];
  if(a.puuid!=null&&!validPuuid(a.puuid))delete a.puuid;
  if(a.mastery!=null){a.mastery=normMastery(a.mastery);if(!a.mastery)delete a.mastery}
  if(a.masteryAt!=null&&!(Number(a.masteryAt)>0))delete a.masteryAt;
  if(a.recent!=null){a.recent=normRecent(a.recent);if(!a.recent)delete a.recent}
  if(a.art!=null){a.art=normArt(a.art);if(!a.art)delete a.art}
  if("artOp" in a){const n=normArtOp(a.artOp);if(n==null)delete a.artOp;else a.artOp=n}
  if("info" in a){a.info=normInfo(a.info);if(!a.info)delete a.info}
  if("lvls" in a){
    a.lvls=(Array.isArray(a.lvls)?a.lvls:[]).filter(p=>p&&Number.isFinite(+p.t)&&+p.t>0&&Number.isFinite(+p.v)).map(p=>({t:+p.t,v:+p.v})).slice(-30);
    if(!a.lvls.length)delete a.lvls;
  }
  if(a.stats&&a.stats.seasons&&typeof a.stats.seasons==="object"){
    if(!Array.isArray(a.stats.seasons.solo))a.stats.seasons.solo=[];
    if(!Array.isArray(a.stats.seasons.flex))a.stats.seasons.flex=[];
  }
  return a;
}
// Asked in three places now, and jsdom has no matchMedia unless a test supplies one
function prefersReducedMotion(){return !!(window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches)}
function toast(msg,action,fn){const t=$("toast");t.innerHTML=esc(msg)+(action?' <button id="toastBtn">'+esc(action)+"</button>":"");if(action)document.getElementById("toastBtn").onclick=()=>{dismissToast();fn()};t.style.animation="none";void t.offsetWidth;t.style.animation="";t.style.opacity="";t.style.display="block";clearTimeout(t._h);t._h=setTimeout(()=>dismissToast(),action?6000:2200)}
function dismissToast(){
  const t=$("toast");if(!t)return;
  // opacity first, so a browser that can hold display back fades it out (see #toast)
  t.style.opacity="0";t.style.display="none";clearTimeout(t._h);
  const b=document.getElementById("toastBtn");if(b)b.onclick=null;
}
/* Both dates are stored as the plain "YYYY-MM-DD" the date input hands over, and
   they are read back the same way. Parsing them into a Date only to format them is
   how a birthday becomes a day earlier for anyone west of Greenwich. */
function fmtDate(iso){
  const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso||""));
  if(!m)return String(iso||"");
  const MON=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return +m[3]+" "+MON[+m[2]-1]+" "+m[1];
}
// "created 4/2/2022" on its own means arithmetic; this is the number you wanted.
function ageFrom(iso){
  const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso||""));
  if(!m)return "";
  const days=Math.floor((Date.now()-Date.UTC(+m[1],+m[2]-1,+m[3]))/86400000);
  if(!isFinite(days)||days<0)return "";
  if(days<31)return days+(days===1?" day old":" days old");
  const mo=Math.floor(days/30.44);
  if(mo<24)return mo+(mo===1?" month old":" months old");
  const yr=Math.floor(days/365.25);
  return yr+(yr===1?" year old":" years old");
}
// Whole words for every unit: "12 h ago" in one row and "4 days ago" in the next
// read as two styles in one column.
function timeAgo(ts){
  if(!ts)return null;
  const s=Math.floor((Date.now()-ts)/1000);
  if(s<60)return"just now";
  const ago=(n,u)=>n+" "+u+(n===1?"":"s")+" ago";
  const m=Math.floor(s/60);if(m<60)return ago(m,"minute");
  const h=Math.floor(m/60);if(h<24)return ago(h,"hour");
  return ago(Math.floor(h/24),"day");
}
function tierColor(t){return TIER_COLORS[(t||"UNRANKED").toUpperCase()]||TIER_COLORS.UNRANKED}
// Sized by CSS through `cls`, never by attributes. `cls` also picks the drawing:
// the top three tiers have a chunkier one for 24px and under (CRESTS_SMALL).
function crestMix(hex,to,amt){
  const n=parseInt(hex.slice(1),16),t=to==="w"?255:0;
  return "#"+[16,8,0].map(sh=>Math.round(((n>>sh)&255)*(1-amt)+t*amt).toString(16).padStart(2,"0")).join("");
}
/* At 24px and under (a list row, a tile, the header's row, Quick find) the top three
   crests' thin spikes and wing tips turned to crumbs: there they are drawn chunkier.
   Master keeps its crown with blunter points; Grandmaster is a broad gem with wings;
   Challenger a gem with wings under a big star. The other seven read at any size. */
const CRESTS_SMALL={
  MASTER:[["L","M4 10.4 2.8 2.4l4.9 3.4L12 .4v10z"],["M","M20 10.4l1.2-8-4.9 3.4L12 .4v10z"],...crestHex(15.6,7.6)],
  GRANDMASTER:[["M","M5.6 12.5 0 7.2v10.6z"],["D","M18.4 12.5 24 7.2v10.6z"],...crestHex(12.5,8.4)],
  CHALLENGER:[["M","M6 15.8 0 10.8v10z"],["D","M18 15.8 24 10.8v10z"],...crestHex(15.9,6.9,ICE),
    ["W",crestStar(12,4.7,4.7,2.05)]],
};
// the sizes that keep the full drawing: the card's 28px crest and the share page's
const CREST_FULL=new Set(["rk-crest","sn-crest-i","sn-best-c"]);
// Built once per tier and size and reused: the same tier is the same markup on every
// render, which is what lets the grid's "has this card changed?" check skip it.
const crestCache={};
function crest(tier,cls){
  const t=(tier||"").toUpperCase(), small=!CREST_FULL.has(cls)&&CRESTS_SMALL[t], c=small||CRESTS[t];
  if(!c)return "";
  const key=t+(small?"/s":"");
  if(!crestCache[key]){
    const col=TIER_COLORS[t];
    const tone={L:crestMix(col,"w",.38),T:crestMix(col,"w",.2),M:col,D:crestMix(col,"k",.34),W:"#fff",
      l:crestMix(CREST_ICE,"w",.42),m:CREST_ICE,d:crestMix(CREST_ICE,"k",.3)};
    crestCache[key]=c.map(([k,d])=>`<path d="${d}" fill="${tone[k]}"/>`).join("");
  }
  return `<svg class="crest${cls?" "+cls:""}" viewBox="0 0 24 24" aria-hidden="true">${crestCache[key]}</svg>`;
}
/* Below the ladder there are three more states, and they all used to tie at -1 —
   so an account that came back Unranked sat mixed in with ones nobody had ever
   checked, in whatever order the array happened to hold them.
   They are not the same thing. "Unranked" is an answer: the profile was read, it
   simply has no rank this season. "Not found" is also an answer, just a bad one.
   "Never checked" is the absence of one. Sorting by rank should put what we know
   above what we don't, in that order. */
const RANK_UNRANKED=-1, RANK_MISSING=-2, RANK_NEVER=-3;
function rankValue(s){ // sortable number, higher = better
  if(!s)return RANK_NEVER;
  if(s.found===false)return RANK_MISSING;
  const t=TIER_ORDER.indexOf((s.tier||"").toUpperCase());
  if(t>=0){
    if(t>=TIER_ORDER.indexOf("MASTER"))return t*10000+(Number(s.lp)||0);
    const d=DIV_ORDER[(s.division||"").toUpperCase()]??0;
    return t*10000+d*1000+(Number(s.lp)||0);
  }
  // No tier on the ladder. An explicit UNRANKED is a reading; so is a CSV row that
  // carried a level and nothing else. Anything with no reading at all is last.
  if((s.tier||"").toUpperCase()==="UNRANKED")return RANK_UNRANKED;
  return hasReading(s)?RANK_UNRANKED:RANK_NEVER;
}
function shortRank(s){
  if(!s||!s.tier)return null;
  const t=s.tier.toUpperCase();
  if(t==="UNRANKED")return"Unranked";
  return tierLabel(s)+((s.lp!==null&&s.lp!==undefined)?" · "+fmtN(s.lp)+" LP":"");
}
/* Master, Grandmaster and Challenger have no divisions: above Master the ladder is
   only LP. Every parser that reads a *peak* or a *past season* already knew that
   and nulled the division — the one that reads the current rank did not, and
   neither did the backend path, the model's JSON or the CSV importer. So a
   Challenger account could arrive carrying a numeral picked up from whatever
   happened to sit near its name on the page, and five separate places built the
   rank label by hand and printed it back faithfully. Now there is one. */
function hasDivisions(tier){
  const i=TIER_ORDER.indexOf(String(tier||"").toUpperCase());
  return i>=0&&i<TIER_ORDER.indexOf("MASTER");
}
function normDivision(tier,division){return hasDivisions(tier)?(division||null):null}
function tierLabel(s){
  const t=String((s&&s.tier)||"").toUpperCase();
  if(!t||t==="UNRANKED")return "Unranked";
  const nice=t.charAt(0)+t.slice(1).toLowerCase();
  const d=normDivision(t,s.division);
  return nice+(d?" "+d:"");
}
function ladderLP(s){ // absolute position on the ladder, in LP
  if(!s||!s.tier)return null;
  const t=TIER_ORDER.indexOf((s.tier||"").toUpperCase());
  if(t<0)return null;
  const m=TIER_ORDER.indexOf("MASTER");
  if(t>=m)return m*400+(Number(s.lp)||0);
  const d=DIV_ORDER[(s.division||"").toUpperCase()]??0;
  return t*400+d*100+(Number(s.lp)||0);
}
// ladderLP() gives every tier below Master exactly 400 LP of room (4 divisions
// × 100), which is what makes a fixed tier band possible at all.
const TIER_SPAN=400;
const LPC_W=200, LPC_H=88;
/* Past this many checks a dot on every one stops being information and becomes a
   string of beads — 25 dark-ringed dots over a line that already says where it
   went, with the band captions hidden behind them. A dense chart is drawn as the
   line and the latest reading; each dot still appears under the pointer. */
const LPC_DENSE=12;
// Which check stands for a day / week / month, op.gg-style: the last one in each
// bucket, because that is the value the account actually ended the period on.
// Needs timestamps; without them there are no periods to bucket into.
function bucketHistory(pts,mode){
  if(!mode||mode==="all"||pts.length<2)return pts;
  if(!pts.every(p=>+p.h.t))return pts;
  const key=t=>{
    const d=new Date(+t);
    if(mode==="m")return d.getFullYear()+"-"+d.getMonth();
    d.setHours(0,0,0,0);
    if(mode==="w")d.setDate(d.getDate()-((d.getDay()+6)%7)); // back to Monday
    return d.getTime();
  };
  const seen=new Map();
  for(const p of pts)seen.set(key(p.h.t),p);
  return[...seen.values()];
}
// A default that matches the data rather than a fixed one: a fortnight of checks
// wants days, two years wants months.
function defaultRange(hist){
  const ts=(hist||[]).map(h=>+h.t).filter(Boolean);
  if(ts.length<2)return"d";
  const days=(Math.max(...ts)-Math.min(...ts))/86400000;
  return days<=21?"d":days<=150?"w":"m";
}
const RANGES=[["d","Daily"],["w","Weekly"],["m","Monthly"]];
/* The list row's chart. rankChart() below is the real one — bands, division
   hairlines, hoverable points, a range switcher — and none of that fits in a
   40 px slot, so the list simply threw the shape away and every row looked like
   every other row. This keeps only the shape: the last sixteen readings, scaled
   to themselves, in the tier's colour.
   No gradients and so no ids, which matters more here than anywhere: sixty rows
   minting sixty gradient definitions is exactly what made a re-render expensive
   the last time. Flat fills keep the markup identical between renders, which is
   what lets syncGrid leave an unchanged row alone. */
const SPK_W=124, SPK_H=30;
function sparkline(hist,col){
  // An Unranked end is a break, not another LP point — drawing the old climb up
  // to the last ranked check would look like the account is still there.
  if(hist&&hist.length&&(hist[hist.length-1].tier||"").toUpperCase()==="UNRANKED")return"";
  const vals=(hist||[]).map(ladderLP).filter(v=>v!==null).slice(-16);
  if(vals.length<2)return "";
  const lo=Math.min(...vals), hi=Math.max(...vals), span=hi-lo;
  // A flat run has no range to scale against; centring it says "steady" instead
  // of pinning the whole line to the top or the bottom of the box.
  const px=i=>(i/(vals.length-1))*SPK_W;
  const py=v=>span?SPK_H-3-((v-lo)/span)*(SPK_H-6):SPK_H/2;
  const pts=vals.map((v,i)=>px(i).toFixed(1)+" "+py(v).toFixed(1));
  const line="M"+pts.join(" L");
  const area="M0 "+SPK_H+" L"+pts.join(" L")+" L"+SPK_W+" "+SPK_H+"Z";
  const last=pts[pts.length-1].split(" ");
  return `<svg class="spk" viewBox="0 0 ${SPK_W} ${SPK_H}" preserveAspectRatio="none" aria-hidden="true">`
    +`<path d="${area}" fill="${col}" opacity=".14"/>`
    +`<path d="${line}" fill="none" stroke="${col}" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`
    +`<circle cx="${last[0]}" cy="${last[1]}" r="2.4" fill="${col}" vector-effect="non-scaling-stroke"/></svg>`;
}
// Which band a row belongs under when the list is grouped. Never-checked is kept
// apart from unranked: one is a fact about the account, the other about us.
function listGroup(a){
  if(isRanked(a))return (a.stats.tier||"").toUpperCase();
  if(notPlaced(a))return"UNPLACED";
  if(isUnrankedAnswer(a))return"UNRANKED";
  // A missing Riot ID is checked (found:false + updatedAt) but is not Unranked —
  // dumping it under that heading made the list disagree with the Unranked filter.
  if(a.stats&&a.stats.found===false)return"MISSING";
  return"UNCHECKED";
}
function groupLabel(k){
  if(k==="UNCHECKED")return "Never checked";
  if(k==="UNRANKED")return "Unranked";
  if(k==="UNPLACED")return "Not placed yet";
  if(k==="MISSING")return "Not found";
  return k.charAt(0)+k.slice(1).toLowerCase();
}
function groupColor(k){
  if(k==="MISSING")return"var(--danger)";
  if(k==="UNRANKED"||k==="UNPLACED")return"var(--muted)"; // grey: in the unranked tier's blue it read as a link
  return k==="UNCHECKED"?"#5d6577":tierColor(k);
}
// The old sparkline plotted LP with no scale at all: it showed the number moving
// but never how far, or through which ranks. This draws the ladder itself —
// a coloured band per tier, division hairlines when the view is tight enough for
// them to mean anything, and every check as its own hoverable point.
function rankChart(hist,cut,mode,key,peakV,peakLabel){
  const pace=paceText(hist);
  let pts=(hist||[]).map(h=>({h,v:ladderLP(h)})).filter(p=>p.v!==null);
  if(!pts.length)return"";
  // One check was drawn as a whole chart frame with a single dot in it, saying
  // where on the ladder the account sits, which the card already says above it in
  // large type. A line saying when the chart comes is more use, and smaller.
  if(pts.length===1)return`<p class="lpc-one">One check so far. The chart starts after the next one.</p>`;
  pts=bucketHistory(pts,mode);
  const vals=pts.map(p=>p.v);
  let lo=Math.min(...vals), hi=Math.max(...vals);
  // A flat run would otherwise be stretched to fill the frame and read as a
  // knife edge. Showing it against a fixed minimum of ladder keeps "barely
  // moved" looking like barely moved.
  const MIN_SPAN=260;
  if(hi-lo<MIN_SPAN){const mid=(hi+lo)/2;lo=mid-MIN_SPAN/2;hi=mid+MIN_SPAN/2}
  else{const pad=(hi-lo)*.2;lo-=pad;hi+=pad}
  if(lo<0){hi-=lo;lo=0}
  const span=(hi-lo)||1;
  const py=v=>LPC_H-((v-lo)/span)*LPC_H;
  const mIdx=TIER_ORDER.indexOf("MASTER");
  // X is real time, not check number. Spacing checks evenly implies they were
  // evenly spaced, which they never are — a week-long break looked identical to
  // two games back to back. Now a gap in the line is a gap in the record, and the
  // dates underneath mean something. Falls back to even spacing only when the
  // history carries no usable timestamps at all.
  const last=pts.length-1;
  const ts=pts.map(p=>+p.h.t||0);
  const t0=ts[0], t1=ts[last];
  const timed=t1>t0&&ts.every(t=>t>0);
  // one point has no span to spread across, so it sits in the middle
  const fx=i=>last===0?.5:(timed?(ts[i]-t0)/(t1-t0):i/last); // 0..1
  /* Where a point is drawn: the same, held a little in from both edges. At 0 and 1
     the first and last dots sat on the frame, half of each outside it. The line's
     colour stops still use fx, since a gradient runs across the line's own box. */
  const X_IN=.016, fxi=i=>X_IN+(1-2*X_IN)*fx(i);

  /* The band captions sit at the left edge, which is also where the line starts,
     and a caption the line or its first point ran through read "DIAM●ND". Where
     the line is across a caption's width is known here: the caption takes the top
     of its band when the bottom is taken, and stays put when both are. */
  const LAB_W=.22;   // a caption's share of the plot's width: "Grandmaster" on the narrowest card
  const leftYs=[];
  for(let i=0;i<=last;i++){
    const a=fx(i);if(a<=LAB_W)leftYs.push(py(pts[i].v));
    if(i<last){const b=fx(i+1);
      // the line between two points, sampled where it passes under the caption
      for(let k=1;k<6;k++){const f=a+(b-a)*k/6;if(f<=LAB_W)leftYs.push(py(pts[i].v+(pts[i+1].v-pts[i].v)*k/6))}}
  }
  const labFree=y=>!leftYs.some(v=>v>=y-5&&v<=y+14);   // 9px of caption, and a point's own radius around it

  let bands="",lines="",labels="";
  for(let t=0;t<=mIdx;t++){
    // Master and above share one band: ladderLP() can't separate GM from
    // Challenger, since above Master the ladder is just LP.
    const bot=t*TIER_SPAN, top=t===mIdx?Infinity:(t+1)*TIER_SPAN;
    if(top<=lo||bot>=hi)continue;
    const name=TIER_ORDER[t], c=TIER_COLORS[name];
    const yTop=py(Math.min(top,hi)), yBot=py(Math.max(bot,lo));
    bands+=`<rect x="0" y="${yTop.toFixed(1)}" width="${LPC_W}" height="${Math.max(yBot-yTop,0).toFixed(1)}" fill="${c}" opacity=".085"/>`;
    if(bot>lo)lines+=`<line x1="0" x2="${LPC_W}" y1="${py(bot).toFixed(1)}" y2="${py(bot).toFixed(1)}" stroke="${c}" stroke-opacity=".36" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
    /* The label normally sits just above the band's own bottom boundary, which is
       what it names. When one band fills the entire view — every Master+ account,
       which is exactly where the cutoff lines and the LP marks also live — that
       boundary is off the bottom of the chart and the label was landing flat on
       the floor, stacked in with the date axis, an LP numeral and the GM line.
       Four unrelated things reading as one crowded row. With no boundary left to
       mark it is a caption for the whole view, so it goes to the top instead. */
    const fillsView=bot<=lo&&top>=hi;
    const spots=fillsView?[2]:yBot-yTop>=26?[yBot-11,yTop+3]:[yBot-11];
    /* With no spot clear of the line and the dots, the caption is left out rather
       than printed across them ("DIAM●ND"): the band's colour still says the tier,
       and the tip on any point names it. */
    const labY=spots.find(labFree);
    if(labY!=null&&yBot-yTop>=14)labels+=`<span class="lpc-lab" style="top:${labY.toFixed(1)}px;color:${c}">${t===mIdx?"Master+":name.charAt(0)+name.slice(1).toLowerCase()}</span>`;
  }
  /* Steps inside the bands, as faint hairlines. Below Master a step of 100 LP is
     exactly one division, but a fixed 100 stops working the moment the view is
     wide (a Master account sliding 1600 -> 800 LP would draw dozens of lines), so
     the step grows with the range instead.
     They used to be labelled at the right edge: "II", "P III", "1200 LP". That is
     where the newest point is, so a numeral kept landing beside or under it, and
     later they showed only while the pointer was on the chart, which read as a
     leftover on whichever chart the pointer happened to rest on. A point's tip
     names its rank and LP, and the band's colour and caption say the tier. */
  const M_BASE=mIdx*TIER_SPAN;
  const room=v=>{const y=py(v);return y>=22&&y<=LPC_H-3};
  const rule=v=>{const y=py(v).toFixed(1);
    lines+=`<line x1="0" x2="${LPC_W}" y1="${y}" y2="${y}" stroke="#ffffff" stroke-opacity=".07" stroke-width="1" vector-effect="non-scaling-stroke"/>`};

  // Two scales, because the two halves of the ladder want opposite things.
  // Below Master the interesting unit is the division, which is always 100 LP,
  // so that step is fixed and only disappears when there is genuinely no room.
  if(LPC_H*100/span>=13){
    for(let v=Math.ceil(lo/100)*100;v<Math.min(hi,M_BASE);v+=100){
      if(v%TIER_SPAN===0)continue;        // already drawn as a tier boundary
      if(room(v))rule(v);
    }
  }

  // The Grandmaster and Challenger floors, where the view reaches them. These are
  // the current floors, so they are drawn as a reference against today's ladder —
  // not applied backwards to old points, whose floors were different numbers.
  const cutYs=[];
  if(cut){
    // Challenger first, so that when the two floors are too close to label twice
    // it is the higher one that keeps its name.
    // `which`, not `key`: the chart's own `key` parameter is the account id the
    // gradient ids are built from, further down, and shadowing it here read as a
    // bug every time somebody followed that thread.
    for(const[which,label]of[["chall","CHALL"],["gm","GM"]]){
      const lp=cut[which];
      if(!lp)continue;
      const v=M_BASE+lp;
      if(v<=lo||v>=hi)continue;
      const yv=py(v), y=yv.toFixed(1);
      const c=TIER_COLORS[which==="gm"?"GRANDMASTER":"CHALLENGER"];
      lines+=`<line x1="0" x2="${LPC_W}" y1="${y}" y2="${y}" stroke="${c}" stroke-opacity=".75" stroke-width="1" stroke-dasharray="3 3" vector-effect="non-scaling-stroke"/>`;
      // Zoomed far enough out — an Iron-to-Challenger history spans the entire
      // ladder — the two floors sit a couple of pixels apart. Both lines are still
      // drawn and their colours tell them apart; only the second label is dropped,
      // because two words printed over each other say less than one.
      if(!cutYs.some(cy=>Math.abs(yv-cy)<11))
        labels+=`<span class="lpc-cut" style="top:${(yv-9.5).toFixed(1)}px;color:${c}">${label}</span>`;
      cutYs.push(yv);
    }
  }

  /* The peak, where it is above everything the chart is currently showing. It is
     the one number on the card the line cannot express — the highest this account
     ever got, from op.gg's badge, this app's own record or a manual override,
     whichever is genuinely highest. Drawn as a ceiling the line is climbing back
     towards. Skipped if a band caption is already sitting there. */
  if(peakV!=null&&peakV>lo&&peakV<hi){
    const y=py(peakV);
    lines+=`<line x1="0" x2="${LPC_W}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="var(--gold)" stroke-opacity=".6" stroke-width="1" stroke-dasharray="2 4" vector-effect="non-scaling-stroke"/>`;
    // Centre lane, with the floors — the other horizontal threshold on this chart —
    // rather than the left, where the band captions live. A peak just above the
    // current rank is the common case, and there the caption is right at the top
    // and swallowed the label every time, leaving a dashed line explaining nothing.
    // ...and where the line is not: dead centre, the line ran straight through it
    // on any chart that was still near its peak halfway along.
    const xs=pts.map((p,i)=>fxi(i)), ys=pts.map(p=>py(p.v));
    const lineAt=f=>{if(xs.length<2)return ys[0];let i=1;while(i<xs.length-1&&xs[i]<f)i++;
      const a=xs[i-1],b=xs[i],t=b>a?Math.min(1,Math.max(0,(f-a)/(b-a))):0;return ys[i-1]+(ys[i]-ys[i-1])*t};
    const lanes=[.5,.3,.7,.18,.82], clear=f=>Math.min(...[-.04,0,.04].map(o=>Math.abs(lineAt(f+o)-(y-5))));
    // and with no stretch clear of the line, the dashed line goes unlabelled; the
    // card's own Peak figure, under the chart, still says it
    const lane=lanes.find(f=>clear(f)>=11);
    if(lane!=null&&!cutYs.some(cy=>Math.abs(y-cy)<11))
      labels+=`<span class="lpc-peak" style="top:${(y-9.5).toFixed(1)}px;left:${(lane*100).toFixed(1)}%" title="${esc(peakLabel||"Season peak")}">Peak</span>`;
    cutYs.push(y);   // and an LP hairline must not land on it either
  }

  // Above Master there are no divisions, only LP, and a fixed 100 there is far
  // too fine, so this step grows with the range: at least 22px apart at any
  // chart height.
  if(hi>M_BASE){
    const lpStep=[100,200,400,800,1600,3200,6400].find(s=>LPC_H*s/span>=22)||span/3;
    for(let v=Math.max(Math.ceil(lo/lpStep)*lpStep,M_BASE);v<hi;v+=lpStep){
      if(v===M_BASE||!room(v))continue;   // M_BASE is the "Master+" band boundary
      // A hairline landing on the Grandmaster or Challenger floor is a second line
      // a few pixels from a dashed one. The floor is the more useful of the two.
      if(cutYs.some(cy=>Math.abs(py(v)-cy)<11))continue;
      rule(v);
    }
  }

  const coords=pts.map((p,i)=>(fxi(i)*LPC_W).toFixed(1)+","+py(p.v).toFixed(1)).join(" ");
  // Unique per chart, and — importantly — *stable* across renders. These used to
  // be Math.random(), which made every card's markup different on every single
  // render: the gradient ids and the url(#…) references pointing at them had to be
  // rewritten each time, and it defeated the "has this card changed?" check in
  // syncGrid outright, because the answer was always yes. Only one chart exists
  // per account at a time, so the account is all the uniqueness needed.
  const uniq=key!=null?String(key):"x"+Math.random().toString(36).slice(2,9);
  const gid="lc-"+uniq, aid="la-"+uniq;
  const cur=tierColor(pts[last].h.tier);
  // the line is its own legend: it takes the colour of whatever tier it is
  // passing through, so a promotion reads as a colour change, not just a step up
  const stops=(last?pts:[pts[0],pts[0]]).map((p,i)=>`<stop offset="${(last?fx(i)*100:i*100).toFixed(2)}%" stop-color="${tierColor(p.h.tier)}"/>`).join("");
  const overlay=pts.map((p,i)=>{
    const xp=fxi(i)*100;
    // A point claims at most the ground nearer to it than to its neighbours — but
    // no more than a target's width either way. Letting the columns tile the full
    // chart meant a handful of points split it into slabs, so pointing anywhere at
    // all lit up whichever dot happened to be nearest, including from the far side
    // of the plot. The 40 px cap wins when points are sparse, the tiling wins when
    // they are dense, and neither ever overhangs onto the next card: the outermost
    // columns hang off their own dot instead of straddling it.
    const cl=i===0?0:(fxi(i-1)+fxi(i))/2*100, cr=i===last?100:(fxi(i)+fxi(i+1))/2*100;
    // tooltips at the edges would hang off the card, so they anchor inwards there
    const side=xp<26?" l":xp>74?" r":"";
    // A two-line tip is about 42px plus its 10px gap. A dot higher than that has
    // no room above it, so the tip goes underneath instead of over the chart's
    // top edge — and out of the range switcher's corner.
    const paceHere=i===last?pace:"";
    const hi=py(p.v)<(paceHere?66:52)?" hi":"";
    const when=p.h.t?timeAgo(p.h.t):null;
    const w=cr-cl;
    const anchor=last===0?50:(i===0?0:i===last?100:50); // where the dot sits in its column
    /* --y is the dot's own height, which is what the hit area is built around.
       The column used to *be* the target: full plot height and up to 40px wide,
       so a point lit up from right across the chart and from anywhere above or
       below it. The band is a little larger than the dot and nothing more. */
    /* The outermost columns are anchored flush to their own dot so nothing hangs
       off the ends of the plot — which leaves that dot sitting on the very edge
       of its own target, with its outer half unreachable. Those two get a small
       outward reach back; the card clips, so it still cannot touch a neighbour. */
    const hl=anchor===0?-10:0, hr=anchor===100?-10:0;
    return `<div class="lpc-pt${i===last?" now":""}" style="left:${xp.toFixed(2)}%;width:min(${w.toFixed(2)}%,28px);transform:translateX(-${anchor}%);--x:${anchor}%;--y:${py(p.v).toFixed(1)}px;--hl:${hl}px;--hr:${hr}px">`
      +`<span class="lpc-hit"></span>`
      +`<b style="top:${py(p.v).toFixed(1)}px"><i style="background:${tierColor(p.h.tier)}"></i>`
      +`<span class="lpc-tip${side}${hi}">${esc(shortRank(p.h)||"—")}${when?`<em>${esc(dateLabel(p.h.t,"year"))} · ${esc(when)}</em>`:""}`
      +`${paceHere?`<em>${esc(paceHere)} lately</em>`:""}</span></b></div>`;
  }).join("");

  // Date axis. Ticks sit at the ends and at even time fractions between them, and
  // a tick whose label repeats the one before it is dropped rather than printed
  // twice — a short history can easily be all one day.
  let axis="";
  if(timed){
    const n=Math.min(4,Math.max(2,Math.round(LPC_W/60)));
    const span=t1-t0>300*86400000?"month":"";
    let prev=null;
    for(let k=0;k<n;k++){
      const f=k/(n-1), txt=dateLabel(t0+(t1-t0)*f,span);
      if(txt===prev)continue;
      prev=txt;
      const align=k===0?" l":k===n-1?" r":"";
      axis+=`<span class="lpc-tick${align}" style="left:${((X_IN+(1-2*X_IN)*f)*100).toFixed(2)}%">${esc(txt)}</span>`;
    }
  }

  return `<div class="lpc${pts.length>LPC_DENSE?" dense":""}"><div class="lpc-plot">`
    +`<svg class="lpc-svg" viewBox="0 0 ${LPC_W} ${LPC_H}" preserveAspectRatio="none" role="img" aria-label="LP over the last ${pts.length} checks">`
    +`<defs><linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="0">${stops}</linearGradient>`
    +`<linearGradient id="${aid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${cur}" stop-opacity=".3"/><stop offset="1" stop-color="${cur}" stop-opacity="0"/></linearGradient></defs>`
    +bands+lines
    // the fill runs on flat to both edges, so the inset leaves no bare strip
    +(last?`<polygon points="0,${LPC_H} 0,${py(pts[0].v).toFixed(1)} ${coords} ${LPC_W},${py(pts[last].v).toFixed(1)} ${LPC_W},${LPC_H}" fill="url(#${aid})"/>`
        +`<polyline class="lpc-line" points="${coords}" fill="none" stroke="url(#${gid})" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>`:"")
    +`</svg>${labels}${overlay}`
    +`</div>`
    // D/W/M at the end of the date row, off the line. Without dates there is no
    // time to cut by, so there is no row and no switch.
    +(axis?`<div class="lpc-axis">${axis}`
      +`<div class="lpc-range">${RANGES.map(([v,label])=>`<button data-act="range" data-r="${v}" class="${mode===v?"on":""}" title="${label}">${v.toUpperCase()}</button>`).join("")}</div>`
      +`</div>`:"")
    +`</div>`;
}
// Compact and unambiguous: "22 Jul" rather than 22/07 or 07/22, which mean
// different days depending on where the reader lives.
const MONTHS=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
/* "31 Oct" carries no year, which is fine inside one — but an axis over two
   seasons read "31 Oct · 16 Oct · 1 Oct", left to right, which looks like time
   running backwards. Past a year's span the axis counts months with their year
   ("Oct '24"), and a point's tip names the year whenever it is not this one. */
function dateLabel(t,mode){
  const d=new Date(+t);
  if(isNaN(d))return"";
  if(mode==="month")return MONTHS[d.getMonth()]+" ’"+String(d.getFullYear()).slice(2);
  return d.getDate()+" "+MONTHS[d.getMonth()]+(mode==="year"&&d.getFullYear()!==new Date().getFullYear()?" "+d.getFullYear():"");
}
/* ---- Discord alerts while the app is closed ----
   The app keeps the worker's watch list current: Diamond+ accounts, each with the
   decay estimate as of its latest reading. The worker's daily cron does the rest.
   A token of this browser's own owns the list on the worker (see /watch). */
function watchUrl(){
  try{const u=new URL(cfg.backendUrl);u.pathname=u.pathname.replace(/\/?$/,"/watch");u.search="";return u.href}catch(e){return""}
}
function watchList(){
  return accounts.filter(a=>isLive(a)&&isRanked(a)).map(a=>{const st=decayState(a);return st?{a,st}:null}).filter(Boolean)
    .sort((x,y)=>(x.st.bank-(Date.now()-x.st.at)/864e5)-(y.st.bank-(Date.now()-y.st.at)/864e5)).slice(0,20)
    .map(({a,st})=>({name:a.gameName,tag:a.tagLine,region:(REGIONS[a.region]||REGIONS.EUW).opgg,puuid:validPuuid(a.puuid)?a.puuid:undefined,
      label:a.label||undefined,tier:st.tier,division:a.stats.division||null,lp:a.stats.lp??null,games:st.games,bank:Math.round(st.bank*100)/100,at:st.at}));
}
let watchTakenSaid=false, watchSyncT=0;
async function syncWatch(force){
  if(!cfg.watch||!cfg.backendUrl||!cfg.discordWebhook||!cfg.watchToken||previewMode||vaultLocked())return false;
  if(!force&&Date.now()-(cfg.watchSyncedAt||0)<10*60000)return false;
  try{
    const res=await fetch(watchUrl(),{method:"PUT",headers:{"Content-Type":"application/json",Authorization:"Bearer "+cfg.watchToken},
      body:JSON.stringify({webhook:cfg.discordWebhook,accounts:watchList()})});
    const d=await res.json().catch(()=>null);
    if(res.ok){cfg.watchSyncedAt=Date.now();saveCfg();return true}
    if(res.status===409&&!watchTakenSaid){watchTakenSaid=true;toast("Your worker already sends decay alerts for another browser. Turn them off there first")}
    else if((res.status===405||res.status===404&&!d)&&!watchTakenSaid){watchTakenSaid=true;toast("Your worker is an older version without decay alerts. Redeploy it (Settings → Rank checks → Advanced)")}
    else if(d&&d.code==="no_kv")toast("Decay alerts need sync storage on your worker (a KV namespace bound as VAULT)");
  }catch(e){}
  return false;
}
// after a check the estimates move; a few seconds' wait lets a whole Check all land first
function syncWatchSoon(){clearTimeout(watchSyncT);watchSyncT=setTimeout(()=>syncWatch(true),4000)}
async function stopWatch(){
  if(!cfg.watchToken||!cfg.backendUrl)return;
  try{await fetch(watchUrl(),{method:"DELETE",headers:{Authorization:"Bearer "+cfg.watchToken}})}catch(e){}
}
async function updateWatchStatus(){
  const el=$("sWatchStatus");if(!el)return;
  if(!cfg.watch){el.textContent="";return}
  try{
    const res=await fetch(watchUrl(),{headers:{Authorization:"Bearer "+cfg.watchToken}});
    const d=await res.json().catch(()=>null);
    el.textContent=res.ok&&d?"On, watching "+d.accounts+" account"+(d.accounts===1?"":"s")
      +(d.lastRun?" · last checked "+timeAgo(d.lastRun):" · first check at the next daily run")+(d.lastSent?" · last alert "+timeAgo(d.lastSent):"")
      :res.status===409?"Another browser owns the alerts on this worker."
      :res.status===405?"Your worker is an older version without decay alerts. Redeploy it, then save here again."
      :"On, but the worker does not have the list yet. It gets it after your next check.";
  }catch(e){el.textContent="On, but the worker could not be reached to check."}
}
function postDiscord(content){
  if(!cfg.discordWebhook)return;
  fetch(cfg.discordWebhook,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({content})}).catch(()=>{});
}
// Tier-up posts go to whatever URL is in Settings. Accepting any string meant a
// typo — or a paste of the wrong kind of link — quietly POSTed the account name
// somewhere that was not Discord. https + discord's webhook path only.
function validDiscordWebhook(u){
  if(!u)return"";
  try{
    const url=new URL(u);
    if(url.protocol!=="https:")return null;
    if(!/^(?:canary\.|ptb\.)?discord(?:app)?\.com$/i.test(url.hostname))return null;
    if(!/^\/api\/webhooks\/\d+\/[\w-]+\/?$/.test(url.pathname))return null;
    return url.origin+url.pathname.replace(/\/$/,"");
  }catch(e){return null}
}
// Same idea for the backend: a relative path or a garbage string used to build a
// request against the Pages host itself. Absolute http(s) only; query params are
// added via URLSearchParams so a URL that already has some is not broken by a
// second "?".
function validBackendUrl(u){
  if(!u)return"";
  try{
    const url=new URL(u);
    if(url.protocol!=="https:"&&url.protocol!=="http:")return null;
    return url.href.replace(/\/+$/,"");
  }catch(e){return null}
}
/* validBackendUrl hands back a full href, so gluing "/vault" onto the end of it
   turns "https://w.workers.dev/?token=x" into ".../?token=x/vault" — a path the
   worker never sees and a sync that fails with no useful message. Append to the
   path, and keep any query the user put there. */
function vaultSyncUrl(){
  const base=validBackendUrl(cfg.backendUrl);
  if(!base)return"";
  try{
    const u=new URL(base);
    u.pathname=u.pathname.replace(/\/+$/,"")+"/vault";
    u.hash="";
    return u.href;
  }catch(e){return""}
}
/* Both ends of a sync agree on `rev` now. Every path that completes one — push,
   pull, and the pull that finds nothing to do — records the same two facts, and a
   path that recorded only the time is what made a later pull compare the other
   device's clock against this one's. */
function markSynced(rev){cfg.lastSyncAt=Date.now();cfg.syncedRev=rev;saveCfg()}
function genSyncToken(){
  const b=crypto.getRandomValues(new Uint8Array(24));
  return b64(b).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
let syncBusy=false;
/* What sync still needs, in the order it needs it, with a link to where that is set */
function updateSyncStatus(){
  const el=$("sSyncStatus"); if(!el)return;
  const go=(tab,label)=>`<button type="button" class="link-btn" data-sync-go="${tab}">${label}</button>`;
  const need=!cfg.backendUrl?`It needs your own worker first: ${go("checks","set one up")}.`
    :!vaultPassword?`It needs a master password first, since only the encrypted copy is sent: ${go("security","set one")}.`
    :!cfg.syncToken?"Generate a sync key, then paste the same key on your other devices."
    :"Ready.";
  setHTML(el,need+(cfg.lastSyncAt?" Last synced "+esc(timeAgo(cfg.lastSyncAt))+".":""));
}
async function pushVaultSync(){
  if(syncBusy){toast("Sync already in progress");return}
  const token=($("sSyncToken")&&$("sSyncToken").value.trim())||cfg.syncToken||"";
  if(token)cfg.syncToken=token;
  const url=vaultSyncUrl();
  if(!url){toast("Set up your own worker first: Settings, Rank checks, Advanced");return}
  if(!cfg.syncToken||cfg.syncToken.length<16){toast("The sync key needs at least 16 characters");return}
  if(!vaultPassword){toast("Set a master password first: only the encrypted copy is sent");return}
  if(vaultLocked()){toast("Unlock the vault first");return}
  syncBusy=true;
  try{
    // Content revision only — stamping Date.now() here let a stale device overwrite
    // a newer cloud vault because "now" always beat the remote timestamp.
    if(!(Number(cfg.vaultRev)>0))touchVaultRev();
    const updatedAt=Number(cfg.vaultRev);
    // GET-before-PUT: catch a newer cloud copy before encrypt+upload (and before
    // the worker's 409), so two devices racing don't burn a round-trip for nothing.
    try{
      const peek=await fetch(url,{headers:{"Authorization":"Bearer "+cfg.syncToken}});
      if(peek.ok){
        let remote=null; try{remote=await peek.json()}catch(e){}
        const remoteAt=Number(remote&&remote.updatedAt)||0;
        if(remoteAt>updatedAt){
          toast("The synced copy is newer. Download it first, or upload again once you have sorted it out","Download…",()=>{
            ask({title:"Replace this device's vault with the newer synced copy?",body:"Changes made here since your last sync may be lost.",ok:"Download and replace",danger:true})
              .then(ok=>{if(ok)pullVaultSync(true)});
          });
          return;
        }
      }
    }catch(e){/* network blip — fall through to PUT; worker still enforces LWW */}
    const envelope=await encryptData(vaultPassword,accounts);
    if(vaultLocked())return;
    const res=await fetch(url,{
      method:"PUT",
      headers:{"Content-Type":"application/json","Authorization":"Bearer "+cfg.syncToken},
      body:JSON.stringify({updatedAt,envelope})
    });
    const text=await res.text();
    let data=null; try{data=JSON.parse(text)}catch(e){}
    if(res.status===409){
      toast("The synced copy is newer. Download it first, or upload again once you have sorted it out","Download…",()=>{
        ask({title:"Replace this device's vault with the newer synced copy?",body:"Changes made here since your last sync may be lost.",ok:"Download and replace",danger:true})
          .then(ok=>{if(ok)pullVaultSync(true)});
      });
      return;
    }
    if(res.status===503&&data&&data.code==="no_kv"){
      toast("Worker has no KV. Bind a namespace as VAULT and redeploy");
      return;
    }
    if(!res.ok){toast("Upload failed"+(data&&data.error?": "+data.error:(" (HTTP "+res.status+")")));return}
    currentEnvelope=envelope;
    markSynced(updatedAt);
    updateSyncStatus();
    toast("Vault uploaded");
  }catch(e){toast("Upload failed: "+(e.message||"network"))}
  finally{syncBusy=false;updateSyncStatus()}
}
async function pullVaultSync(force){
  if(syncBusy){toast("Sync already in progress");return}
  const token=($("sSyncToken")&&$("sSyncToken").value.trim())||cfg.syncToken||"";
  if(token)cfg.syncToken=token;
  const url=vaultSyncUrl();
  if(!url){toast("Set up your own worker first: Settings, Rank checks, Advanced");return}
  if(!cfg.syncToken||cfg.syncToken.length<16){toast("The sync key needs at least 16 characters");return}
  if(!vaultPassword){toast("Set a master password first: it unlocks the synced copy");return}
  if(vaultLocked()){toast("Unlock the vault first");return}
  syncBusy=true;
  try{
    const res=await fetch(url,{headers:{"Authorization":"Bearer "+cfg.syncToken}});
    const text=await res.text();
    let data=null; try{data=JSON.parse(text)}catch(e){}
    if(res.status===404){toast("Nothing synced with this key yet. Upload from a device first");return}
    if(res.status===503&&data&&data.code==="no_kv"){
      toast("Worker has no KV. Bind a namespace as VAULT and redeploy");
      return;
    }
    if(!res.ok){toast("Download failed"+(data&&data.error?": "+data.error:(" (HTTP "+res.status+")")));return}
    if(!data||!data.envelope||!data.envelope.__enc){toast("Cloud record is not an encrypted vault");return}
    const remoteAt=Number(data.updatedAt)||0;
    const localAt=Number(cfg.vaultRev)||0;
    /* The revision both sides last agreed on. This used to be lastSyncAt, which is
       this device's clock, while a pulled revision is the clock of whichever device
       pushed it — so a pull from one running ahead left this device looking edited
       for good, and the next pull asked to throw away changes nobody made. Settings
       from before syncedRev existed fall back to the old comparison. */
    const lastSync=Number(cfg.syncedRev)||Number(cfg.lastSyncAt)||0;
    // Same revision already on disk — nothing to apply (avoids a rewrite + rev bump).
    if(!force&&remoteAt>0&&remoteAt===localAt&&accounts.length){
      markSynced(remoteAt);
      updateSyncStatus();
      toast("Already in sync");
      return;
    }
    if(!force&&accounts.length){
      if(localAt>remoteAt){
        toast("This vault is newer than the synced copy. Downloading would replace it","Download…",()=>{
          ask({title:"Replace this device's vault with the older synced copy?",body:"This cannot be undone from here. Export a backup first if you're not sure.",ok:"Download and replace",danger:true})
            .then(ok=>{if(ok)pullVaultSync(true)});
        });
        return;
      }
      // Remote newer, but this device also saved after the last successful sync.
      if(remoteAt>localAt&&localAt>lastSync){
        toast("The synced copy is newer, but this device changed since the last sync","Download…",()=>{
          ask({title:"Replace this device's vault with the synced copy?",body:"Changes made here since the last sync will be lost.",ok:"Download and replace",danger:true})
            .then(ok=>{if(ok)pullVaultSync(true)});
        });
        return;
      }
    }
    let next;
    try{next=await decryptData(vaultPassword,data.envelope)}
    catch(e){toast("Wrong master password for the synced copy (or it is damaged)");return}
    if(vaultLocked())return;
    if(!Array.isArray(next)){toast("Cloud vault did not contain an account list");return}
    accounts=next.map(sanitizeAccount).filter(Boolean);
    currentEnvelope=data.envelope;
    cfg.vaultRev=remoteAt||Date.now();
    markSynced(cfg.vaultRev);
    // keepRev: this vault *is* the cloud's revision now. Stamping a fresh one
    // would make the next pull think this device had changed since the sync it
    // just performed.
    const ok=await saveDB({keepRev:true});
    if(vaultLocked())return;
    if(!ok){toast("Downloaded, but could not save it in this browser");render();updateSyncStatus();return}
    render();
    updateSyncStatus();
    toast("Vault downloaded ("+accounts.length+" accounts)");
  }catch(e){toast("Download failed: "+(e.message||"network"))}
  finally{syncBusy=false;updateSyncStatus()}
}
function celebrate(id,acc){
  const prev=acc.history[acc.history.length-2]||{};
  toast("Tier up: "+(prev.tier||"?")+" → "+acc.stats.tier);
  // a system notification shows on screen like the page does, so streamer mode applies
  notify("Tier up: "+plainName(acc),(prev.tier||"?")+" → "+acc.stats.tier);
  postDiscord("🎉 **"+(acc.label||acc.gameName)+"** tiered up: "+(prev.tier||"?")+" → "+acc.stats.tier);
  if(prefersReducedMotion())return;
  // The crest is now a different emblem than it was a second ago, which is the
  // most literal statement of what just happened this app can make. Worth half a
  // second of everyone's attention.
  for(const c of $("grid").querySelectorAll(`[data-id="${idSel(id)}"] .rk-crest,[data-id="${idSel(id)}"] .rw-crest,[data-id="${idSel(id)}"] .t-crest`)){
    if(c.animate)c.animate(
      [{transform:"scale(.4) rotate(-25deg)",opacity:0},
       {transform:"scale(1.35) rotate(6deg)",opacity:1,offset:.55},
       {transform:"none",opacity:1}],
      {duration:620,easing:"cubic-bezier(.34,1.56,.64,1)"});
  }
  // ".card" only exists in the card layout, so a tier-up reached in list view got
  // the toast and the notification but never the confetti
  const card=[...$("grid").querySelectorAll(".card,.rw,.tile")].find(c=>c.dataset.id===id);
  if(!card)return;
  const r=card.getBoundingClientRect();
  const c=document.createElement("div");c.className="confetti";
  c.style.left=r.left+"px";c.style.top=r.top+"px";c.style.width=r.width+"px";c.style.height=r.height+"px";
  const cols=["#c8aa6e","#f4d688","#0ac8b9","#f0e6d2","#3ddc84"];
  for(let k=0;k<26;k++){
    const p=document.createElement("i");
    p.style.background=cols[k%cols.length];
    p.style.setProperty("--tx",(Math.random()*260-130).toFixed(0)+"px");
    p.style.setProperty("--ty",(Math.random()*-180-30).toFixed(0)+"px");
    p.style.setProperty("--rz",(Math.random()*720-360).toFixed(0)+"deg");
    p.style.animationDelay=(Math.random()*120).toFixed(0)+"ms";
    c.appendChild(p);
  }
  document.body.appendChild(c);
  setTimeout(()=>c.remove(),1400);
}
/* A copy made from a button says so on that button (flashCopied, or the card's
   Login turning into "Username copied"), so it does not also put a toast at the
   bottom of the screen, where it sat over the next card's buttons or a chart. A
   screen reader still hears it, and a failed copy is still a toast. */
async function copyText(v,label,sensitive,quiet){
  let ok=false;
  try{await navigator.clipboard.writeText(v);ok=true}
  catch(e){
    try{
      const ta=document.createElement("textarea");ta.value=v;ta.style.position="fixed";ta.style.opacity="0";
      document.body.appendChild(ta);ta.select();
      ok=!!document.execCommand("copy");
      document.body.removeChild(ta);
    }catch(e2){}
  }
  const said=ok?label+" copied"+(sensitive?". Clears from the clipboard in 30s":""):"Copy failed. Copy it by hand";
  if(ok&&quiet){const sr=$("srSay");if(sr){sr.textContent="";requestAnimationFrame(()=>{sr.textContent=said})}}
  else toast(said);
  if(!ok)return false;
  if(ok&&sensitive){
    lastCopiedSecret=v;
    setTimeout(async()=>{
      try{
        if(lastCopiedSecret!==v)return;
        // Write empty directly — requiring a successful readText first failed on
        // browsers that allow write but not read, and left the password sitting.
        await navigator.clipboard.writeText("");
        if(lastCopiedSecret===v)lastCopiedSecret=null;
      }catch(e){}
    },30000);
  }
  return true;
}
/* The toast says "copied" at the bottom of the screen; this says it where you
   clicked, the way a password manager's copy button does: "Copy" turns into a
   green "Copied" with a check for a moment, then comes back. A card re-rendered
   meanwhile has a fresh button, and the old one is simply gone. */
function flashCopied(btn){
  if(!btn||!btn.isConnected)return;
  if(btn._copied)clearTimeout(btn._copied);else btn._copyHTML=btn.innerHTML;
  btn.innerHTML=icon("check")+(btn.classList.contains("rw-key")?"":"Copied");btn.classList.add("copied");
  btn._copied=setTimeout(()=>{btn._copied=null;if(!btn.isConnected)return;btn.innerHTML=btn._copyHTML;btn.classList.remove("copied")},1400);
}
let lastCopiedSecret=null;
const loginSeq=new Set();   // cards whose username is copied and whose password is next
const loginFlash=new Map(); // card id -> what its Login button just copied, for a moment
function flashLogin(id,pw){
  const token={pw};loginFlash.set(id,token);renderCard(id);
  setTimeout(()=>{if(loginFlash.get(id)===token){loginFlash.delete(id);renderCard(id)}},1400);
}
/* A card's main button logs you in: it copies the username, then turns into
   "Copy password" and copies that (cleared from the clipboard after 30s), then
   starts over. It used to open a panel showing the login, whose own button then
   had to be pressed for the copying, the thing you came for. The panel (to see the
   password, the email, the date of birth) is the eye beside it. With one of the
   two saved it copies that one; with neither it offers to add them. */
/* One mark for one thing, everywhere: the person is the username and the key is the
   password, on a card, in a list row and in Quick find. The card's main button wore
   the key while it said "Copy username", the key a list row uses for the password. */
const LOGIN_ICON={"Copy username":"user","Copy password":"key","Add login":"plus"};
function loginButtonsHTML(a,open){
  const both=a.login&&a.password, next=both&&loginSeq.has(a.id), fl=loginFlash.get(a.id);
  const label=next||(!a.login&&a.password)?"Copy password":a.login?"Copy username":"Add login";
  const main=a.login||a.password
    ?`<button data-act="copyseq" class="a-login${fl?" copied":""}" title="${both?"Copies the username, then the password":"Copies it to paste into the Riot client"}">${fl?icon("check")+(fl.pw?" Copied, clears in 30s":" Username copied"):icon(LOGIN_ICON[label])+" "+label}</button>`
    :`<button data-act="addlogin" class="a-login" title="Save the username and password for this account">${icon(LOGIN_ICON[label])} ${label}</button>`;
  const eye=a.login||a.password||a.email||a.birthdate
    ?`<button data-act="login" class="c-lgn${open?" on":""}" aria-pressed="${open}" title="${open?"Hide":"Show"} the saved login" aria-label="${open?"Hide":"Show"} the saved login">${icon(open?"eyeOff":"eye")}</button>`:"";
  return main+eye;
}

/* The saved login, unfolded by the eye beside Copy username: the same panel on a
   card and in an opened list row. */
function loginPanelHTML(a,rev){
  return `<div class="login${rev||""}">
      <div class="lrow"><span class="val ${a.login?"":"none"}">${a.login?esc(a.login):"no username saved"}</span><span class="lbtns">${a.login?`<button data-act="copylogin">Copy</button>`:""}</span></div>
      <div class="lrow"><span class="val mono ${a.password?"":"none"}" style="font-family:${a.password?"":"inherit"}">${a.password?(shownPw.has(a.id)?esc(a.password):"••••••••••"):"no password saved"}</span><span class="lbtns">${a.password?`<button data-act="togglepw">${shownPw.has(a.id)?"Hide":"Show"}</button><button data-act="copypw">Copy</button>`:""}</span></div>
      ${pwWarnHTML(a)}
      ${a.email?`<div class="lrow"><span class="val">${esc(a.email)}</span><span class="lbtns"><button data-act="copymail">Copy</button></span></div>`:""}
      <!-- The two facts Riot asks for when an account has to be recovered, which is
           exactly the moment you are looking at this panel. -->
      ${a.birthdate?`<div class="lrow"><span class="val"><span class="lk">Date of birth</span>${esc(fmtDate(a.birthdate))}</span><span class="lbtns"><button data-act="copybirth">Copy</button></span></div>`:""}
      ${a.createdOn?`<div class="lrow"><span class="val"><span class="lk">Created</span>${esc(fmtDate(a.createdOn))}<em class="lage">${esc(ageFrom(a.createdOn))}</em></span></div>`:""}
    </div>`;
}
// The ⋯ that opens an account's menu, on a card and in an opened list row
function moreButtonHTML(a){
  const on=openMore.has(a.id);
  return`<button data-act="more" class="c-more${on?" on":""}" aria-haspopup="menu" aria-expanded="${on}" title="More actions" aria-label="More actions">${icon("dots")}</button>`;
}
function uid(){return Date.now()+"-"+Math.random().toString(36).slice(2,7)}
function cryptoInt(max){
  // Rejection sampling — a raw `% max` is slightly biased whenever max does not
  // divide 2^32, and the password generator was described as fully crypto-random.
  if(max<=0)return 0;
  const a=new Uint32Array(1);
  const limit=Math.floor(0x100000000/max)*max;
  do{crypto.getRandomValues(a)}while(a[0]>=limit);
  return a[0]%max;
}
function genPassword(len){
  // guarantees at least one upper/lower/digit/symbol so it can never come out as "just letters" by chance,
  // then fills the rest and shuffles — still fully crypto-random, just never in a weak shape
  const groups=["ABCDEFGHJKLMNPQRSTUVWXYZ","abcdefghjkmnpqrstuvwxyz","23456789","!#%+@$&*"];
  const all=groups.join("");
  const chars=groups.map(g=>g[cryptoInt(g.length)]);
  while(chars.length<len)chars.push(all[cryptoInt(all.length)]);
  for(let i=chars.length-1;i>0;i--){const j=cryptoInt(i+1);[chars[i],chars[j]]=[chars[j],chars[i]]}
  return chars.join("");
}
function parseTags(str){return String(str||"").split(",").map(t=>t.trim()).filter(Boolean)}
// Imports are the one place an account can arrive with a region this app has
// never heard of. Everything downstream falls back to EUW when it looks the code
// up, so an unknown one only survives as a wrong label on the card and a filter
// entry that matches nothing — pin it to something real on the way in.
function normRegion(r){const k=String(r||"").toUpperCase().trim();return REGIONS[k]?k:"EUW"}
/* Where a new account most likely lives: where most of this vault does. Every add
   used to start on EUW, so someone with a vault of NA accounts changed the region
   by hand on every single one. */
function usualRegion(){
  const n={};for(const a of accounts)if(a.region)n[a.region]=(n[a.region]||0)+1;
  let best="EUW",most=0;for(const r of Object.keys(n))if(n[r]>most){most=n[r];best=r}
  return normRegion(best);
}
/* A tag nobody chose is the server's own id: KR1, NA1, EUW, BR1, OC1… so
   "Faker#KR1" is almost certainly Korea. Only a guess — a tag survives a server
   transfer — so it fills a region the user has not picked, on the form where the
   change is in plain sight, and never decides one on its own anywhere else. */
const TAG_REGION={NA:"NA",NA1:"NA",EUW:"EUW",EUW1:"EUW",EUNE:"EUNE",EUN1:"EUNE",KR:"KR",KR1:"KR",JP:"JP",JP1:"JP",
  BR:"BR",BR1:"BR",LAN:"LAN",LA1:"LAN",LAS:"LAS",LA2:"LAS",OCE:"OCE",OC1:"OCE",TR:"TR",TR1:"TR",RU:"RU",RU1:"RU",
  ME:"ME",ME1:"ME",SG:"SG",SG2:"SG",PH2:"SG",TH2:"SG",TW:"TW",TW2:"TW",VN:"VN",VN2:"VN"};
function regionFromTag(tag){const r=TAG_REGION[String(tag||"").trim().toUpperCase()];return r&&REGIONS[r]?r:null}
// Same for the status: an unrecognised one renders as "Active" everywhere while
// still filtering as its own value, so the status dropdown grows a second entry
// reading "Active" that matches a different set of accounts.
function normStatus(s){const k=String(s||"").toLowerCase().trim();return STATUS[k]?k:"active"}
/* What happened between the last two checks. "Updated 22h ago" tells you when the
   app last looked; this tells you whether the account was doing anything, which is
   the question you were actually asking. Only reads points that carry the totals,
   so it stays quiet on history recorded before those were kept. */
/* Season totals go with every history point so the next check can subtract them.
   When they go down, that is not "minus ninety-eight games" — Riot zeroed the
   counters for a new season, and everything that compares two points has to know
   the comparison is across that break rather than through it. Detected here once;
   gamesSince, lastDelta, climbRate, isClimbing and the away summary all ask. */
function seasonBreak(a,b){
  if(!a||!b||a.w==null||a.l==null||b.w==null||b.l==null)return false;
  return b.w<a.w||b.l<a.l;
}
function gamesSince(hist){
  if(!hist||hist.length<2)return null;
  const withWL=hist.filter(h=>h.w!=null&&h.l!=null);
  if(withWL.length<2)return null;
  const a=withWL[withWL.length-2], b=withWL[withWL.length-1];
  if(seasonBreak(a,b))return null;
  const w=b.w-a.w, l=b.l-a.l;
  if(w===0&&l===0)return null;
  return {w,l,n:w+l,from:a.t,to:b.t};
}
/* LP a day over the last fortnight. lastDelta() answers "what did the most recent
   check see", which on an account checked twice in an hour is noise; this answers
   "which way is this account actually going", which is the one you sort by.
   A season break inside the window is a new baseline: measuring Diamond→Silver
   across one would call a reset "−200 LP/day". */
// "+20 LP/day", or "" when the account is not really moving (under 1 LP a day)
function paceText(hist){const r=climbRate(hist);return r&&Math.abs(r.lpPerDay)>=1?(r.lpPerDay>0?"+":"")+Math.round(r.lpPerDay)+" LP/day":""}
function climbRate(hist){
  if(!hist||hist.length<2)return null;
  // Trailing Unranked means the account is off the ladder — a rate built on the
  // ranked points before that would still look like a climb.
  if((hist[hist.length-1].tier||"").toUpperCase()==="UNRANKED")return null;
  const cut=Date.now()-14*86400000;
  let from=0;
  for(let i=1;i<hist.length;i++)if(seasonBreak(hist[i-1],hist[i]))from=i;
  const pts=hist.slice(from).map(h=>({t:+h.t||0,v:ladderLP(h)})).filter(p=>p.t&&p.v!==null&&p.t>=cut);
  if(pts.length<2)return null;
  const first=pts[0], last=pts[pts.length-1];
  const days=(last.t-first.t)/86400000;
  if(days<0.5)return null;   // a few hours of data extrapolates to nonsense
  return {lpPerDay:(last.v-first.v)/days,days,total:last.v-first.v};
}
/* How far to the target, and — only when the account is actually moving towards it
   — roughly how long at the current rate. Deliberately vague past a month: an
   estimate built on a fortnight of LP does not deserve a date. */
function goalProgress(a){
  const goal=a.goal;
  if(!goal||!goal.tier)return null;
  const target=ladderLP(goal), cur=ladderLP(a.stats);
  if(target===null||cur===null)return null;
  const rate=climbRate(a.history);
  const gap=target-cur;
  let eta=null;
  if(gap>0&&rate&&rate.lpPerDay>0.5){
    const d=gap/rate.lpPerDay;
    eta=d<=1?"about a day":d<=31?Math.round(d)+" days":d<=120?"a month or two":"a long way";
  }
  return {target,cur,gap,eta,done:gap<=0,label:shortRank(goal)};
}
function isClimbing(hist){
  if(!hist||hist.length<3)return false;
  const last3=hist.slice(-3);
  // three consecutive increases across a season break would be Diamond → Silver →
  // Silver+1, which is not a climb
  if(seasonBreak(last3[0],last3[1])||seasonBreak(last3[1],last3[2]))return false;
  const vals=last3.map(ladderLP);
  return vals.every(v=>v!==null)&&vals[0]<vals[1]&&vals[1]<vals[2];
}
function passwordStrength(p){
  if(!p)return{score:0,label:""};
  let score=0;
  if(p.length>=8)score++;
  if(p.length>=12)score++;
  if(/[A-Z]/.test(p)&&/[a-z]/.test(p))score++;
  if(/[0-9]/.test(p))score++;
  if(/[^A-Za-z0-9]/.test(p))score++;
  const labels=["Very weak","Weak","Fair","Good","Strong"];
  return{score,label:labels[Math.min(score,5)-1]||"Very weak"};
}
/* ---- password check-up ----
   A password manager's security check, done in this browser: the same password
   on more than one account, where one leak opens every one of them, and weak
   ones, by the form meter's measure or with the username or Riot name in them. */
function pwWeak(a){
  const p=a&&a.password;if(!p)return null;
  const low=p.toLowerCase();
  for(const [v,what] of [[a.login,"the username"],[a.gameName,"the Riot name"]]){
    const s=String(v||"").toLowerCase();
    if(s.length>=4&&low.includes(s))return"Has "+what+" in it";
  }
  if(passwordStrength(p).score>2)return null;
  return p.length<8?"Only "+p.length+" character"+(p.length===1?"":"s"):"Easy to guess";
}
function pwShared(a){return a&&a.password?accounts.filter(b=>b!==a&&b.password===a.password):[]}
function pwFindings(){
  const by=new Map();
  for(const a of accounts)if(a.password)by.set(a.password,(by.get(a.password)||[]).concat(a));
  const out=[];
  // the accounts sharing a password next to each other, then the weak ones on their own
  for(const g of by.values())if(g.length>1)for(const a of g)out.push({a,same:g.filter(b=>b!==a),weak:pwWeak(a),leak:pwLeakOf(a)});
  for(const g of by.values())if(g.length===1){
    const a=g[0], w=pwWeak(a), l=pwLeakOf(a);
    if(w||l)out.push({a,same:[],weak:w,leak:l});
  }
  // a leaked one first: that password is in the lists people try first
  return out.sort((x,y)=>(y.leak>0)-(x.leak>0));
}
/* Leaks: Have I Been Pwned's Pwned Passwords, searched by range. Only the first
   five characters of the password's SHA-1 leave this browser. The reply is every
   leaked hash that starts with them, padded with dummies so its size says nothing
   either, and the match is made here. Only when asked, and kept for this session
   only, for the password it was checked against: a changed password is unchecked
   again. */
const pwLeaks=new Map();   // account id -> {pw, n}
let pwLeakState=null;      // null, "busy", {at, n, err}
let pwLeakGen=0;           // a lock while a check is out bumps it, and the check drops what it found
const PWNED_RANGE="https://api.pwnedpasswords.com/range/";
function pwLeakOf(a){const r=a&&pwLeaks.get(a.id);return r&&r.pw===a.password?r.n:null}
async function sha1Hex(str){
  const b=await crypto.subtle.digest("SHA-1",new TextEncoder().encode(str));
  return[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("").toUpperCase();
}
async function pwnedRange(prefix){
  const o={referrerPolicy:"no-referrer",cache:"no-store",credentials:"omit"};
  let r;
  // a browser or network that won't send the padding header cross-origin still gets
  // the check: the five characters are all that is sent either way
  try{r=await fetch(PWNED_RANGE+prefix,{...o,headers:{"Add-Padding":"true"}})}
  catch(e){r=await fetch(PWNED_RANGE+prefix,o)}
  if(!r.ok)throw new Error("HTTP "+r.status);
  const out=new Map();
  for(const line of (await r.text()).split(/\r?\n/)){
    const i=line.indexOf(":");if(i<0)continue;
    // the padding rows have a count of 0, which reads as not leaked
    out.set(line.slice(0,i).trim().toUpperCase(),parseInt(line.slice(i+1),10)||0);
  }
  return out;
}
async function checkPwLeaks(){
  if(pwLeakState==="busy")return;
  const list=accounts.filter(a=>a.password);
  if(!list.length){toast("No passwords saved yet");return}
  const gen=++pwLeakGen;
  pwLeakState="busy";renderPwCheck();
  let found=null;
  try{
    const hashes=new Map(), ranges=new Map();
    for(const a of list)if(!hashes.has(a.password))hashes.set(a.password,await sha1Hex(a.password));
    for(const h of hashes.values()){const p=h.slice(0,5);if(!ranges.has(p))ranges.set(p,await pwnedRange(p))}
    found=list.map(a=>{const h=hashes.get(a.password);return[a.id,{pw:a.password,n:ranges.get(h.slice(0,5)).get(h.slice(5))||0}]});
  }catch(e){}
  // locked while the requests were out: these accounts and their passwords are gone
  // from memory, and the results must not bring them back
  if(gen!==pwLeakGen)return;
  if(found)for(const [id,r] of found)pwLeaks.set(id,r);
  pwLeakState=found?{at:Date.now(),n:list.length}:{at:Date.now(),err:true};
  renderPwCheck();
  for(const a of list)if(openLogin.has(a.id))renderCard(a.id);
}
function pwLeakText(n){return"Found in data leaks "+(n===1?"once":fmtN(n)+" times")}
function pwSameText(same){
  const names=same.slice(0,2).map(b=>esc(plainName(b)));
  return"Same password as "+names.join(", ")+(same.length>2?" and "+(same.length-2)+" more":"");
}
// under the password in a card's login: what the check-up found, where you'd change it
function pwWarnHTML(a){
  if(!a.password)return"";
  const same=pwShared(a), weak=pwWeak(a), leak=pwLeakOf(a);
  const bits=[leak&&pwLeakText(leak),same.length&&pwSameText(same),weak&&esc(weak)].filter(Boolean);
  return bits.length?`<div class="lwarn${leak?" bad":""}">${icon("alert")}<span>${bits.join(" · ")}</span></div>`:"";
}

// ---------- rank data: parser + fetch cascade ----------
// Body text uses thousands separators ("4,011 LP"); meta keeps bare digits ("4011LP").
const LP_NUM=String.raw`(\d{1,3}(?:,\d{3})+|\d{1,5})`;
function lpNum(s){return +String(s).replace(/,/g,"")}
function parseRankFromMeta(raw){
  if(!raw)return null;
  const m=String(raw).match(/<meta\s+name="description"\s+content="([^"]*)"/i);
  if(!m)return null;
  const d=m[1];
  // "Diamond 1 1 52LP" doubles the division; "Challenger 1 4011LP" uses a decorative 1.
  // (?!\d) on the repeat stops it eating the leading 1 of LP values like 1530.
  const ranked=d.match(new RegExp("\\/\\s*("+TIER_WORD+")(?:\\s+([1-4]))?(?:\\s+\\2(?!\\d))?\\s*"+LP_NUM+"\\s*LP\\b(?:\\s*\\/\\s*(\\d{1,4})Win\\s+(\\d{1,4})Lose)?","i"));
  if(ranked){
    const tier=ranked[1].toUpperCase();
    const mPlus=TIER_ORDER.indexOf(tier)>=TIER_ORDER.indexOf("MASTER");
    return{tier,division:(mPlus||!ranked[2])?null:{"1":"I","2":"II","3":"III","4":"IV"}[ranked[2]],
      lp:lpNum(ranked[3]),wins:ranked[4]!=null?+ranked[4]:null,losses:ranked[5]!=null?+ranked[5]:null,level:null};
  }
  const lv=d.match(/\/\s*Lv(?:l)?\.?\s*(\d{1,4})\b/i);
  if(lv)return{tier:"UNRANKED",division:null,lp:null,wins:null,losses:null,level:+lv[1]};
  return null;
}
function soloHalf(raw){
  // Queue-filter chips also say "Ranked Flex" next to Solo/Duo / ARAM — only cut
  // when what follows looks like the flex rank block, not another queue name.
  const s=String(raw);
  const re=/\bRanked\s*Flex\b/gi;
  let m;
  while((m=re.exec(s))){
    const after=s.slice(m.index+m[0].length,m.index+m[0].length+100).replace(/\s+/g," ").trim();
    if(/^(ARAM|Normal|All|Ranked\s*Solo)\b/i.test(after))continue;
    if(/^Unranked\b/i.test(after)||new RegExp("^("+TIER_WORD+")\\b","i").test(after))return s.slice(0,m.index);
  }
  return s;
}
function parseRankText(raw){
  if(!raw)return null;
  // Meta still carries "4011LP" without commas — prefer it before body scraping.
  const fromMeta=parseRankFromMeta(raw);
  if(fromMeta)return fromMeta;
  // Solo and Flex share the same page. Matching the first "tier N LP" anywhere used
  // to pick up a Flex rank — or a peak — on an account that is Unranked in Solo.
  // Everything from the real "Ranked Flex" rank block onwards belongs to parseFlex.
  const soloRaw=soloHalf(raw);
  // Search Unranked / tier-LP on stripped text — raw markup can say "unranked" in
  // an img alt or meta description while the Solo rank is Diamond (worker already
  // flattens via htmlToText before this check).
  const flat=stripMarkup(soloRaw);
  // "Unranked" before any "tier N LP" means Solo is Unranked — a later LP figure
  // is the season peak (Top tier), not the current rank. Flex is already cut away
  // above; this closes the same trap for the peak badge.
  const unIdx=flat.search(/\bUnranked\b/i);
  const rankAt=flat.search(new RegExp("\\b("+TIER_WORD+")\\b(?:\\s+([1-4]|IV|III|II|I)(?![\\dA-Za-z,]))?(?:\\s+\\2(?![\\dA-Za-z,]))?\\s*"+LP_NUM+"\\s*LP\\b","i"));
  if(unIdx>=0&&(rankAt<0||unIdx<rankAt)){
    const lv=flat.match(/\bLv(?:l)?\.?\s*(\d{1,4})\b/i)||flat.match(/\bLevel\s*(\d{1,4})\b/i);
    return{tier:"UNRANKED",division:null,lp:null,wins:null,losses:null,level:lv?+lv[1]:null};
  }
  const first=parseRankFlat(flat);
  if(first&&first.tier)return first;
  // Some proxies hand back markup dense enough that the tier and its LP end up
  // further apart than the strict pattern tolerates. Flattening via stripRows
  // (word order with row joins) is a second chance — stripMarkup alone is the
  // same as `flat` above and used to be a no-op.
  const second=parseRankFlat(stripRows(soloRaw).join(" "));
  if(second&&second.tier)return second;
  const hit=first||second;
  // Solo Unranked has no "N LP" for the strict pattern to catch. A level alone
  // used to be enough to return success with no tier, and fetchViaProxy then
  // filled in UNRANKED — but only when no Flex/peak LP had already matched above.
  // With Flex cut away, an explicit Unranked (or a level with no rank) is the answer.
  if(hit&&hit.level!=null){hit.tier=hit.tier||"UNRANKED";return hit}
  if(/\bUnranked\b/i.test(soloRaw))return{tier:"UNRANKED",division:null,lp:null,wins:null,losses:null,level:null};
  return hit;
}
function parseRankFlat(text){
  // Division must not eat the leading digit of "4,011 LP" (comma as thousands sep).
  const strict=new RegExp("\\b(challenger|grandmaster|master|diamond|emerald|platinum|gold|silver|bronze|iron)\\b(?:\\s+([1-4]|IV|III|II|I)(?![\\dA-Za-z,]))?(?:\\s+\\2(?![\\dA-Za-z,]))?\\s*"+LP_NUM+"\\s*LP\\b","i");
  const m=text.match(strict);
  const out={tier:null,division:null,lp:null,wins:null,losses:null,level:null};
  if(m){
    out.tier=m[1].toUpperCase();
    // The one parser that was missing this. parsePeakText, parseSeasons and
    // parseLpHistory all carry the same guard; this reads the *current* rank,
    // which is the one on every card in the vault.
    if(m[2]){const map={"1":"I","2":"II","3":"III","4":"IV"};
      out.division=normDivision(out.tier,map[m[2]]||m[2].toUpperCase())}
    out.lp=lpNum(m[3]);
    const after=text.slice(m.index);
    const wl=after.match(/(\d{1,4})\s*W(?:in)?s?\b\s*[,\/]?\s*(\d{1,4})\s*L(?:ose|oss(?:es)?)?\b/i);
    if(wl){out.wins=+wl[1];out.losses=+wl[2]}
  }
  const lv=text.match(/\bLv(?:l)?\.?\s*(\d{1,4})\b/i)||text.match(/\bLevel\s*(\d{1,4})\b/i);
  if(lv)out.level=+lv[1];
  if(!out.tier&&out.level==null)return null;
  return out;
}
// Flatten a fetched page to plain words. The proxies return three different
// things — raw HTML, reader-mode markdown, or something in between — and the two
// parsers below key off word order, so they need one shape to work on.
function stripMarkup(raw){
  return String(raw)
    .replace(/<script[\s\S]*?<\/script>/gi," ")
    .replace(/<style[\s\S]*?<\/style>/gi," ")
    .replace(/<[^>]*>/g," ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g," ")      // markdown images: the URLs contain tier names
    .replace(/\[([^\]]*)\]\([^)]*\)/g," $1 ")  // markdown links: keep the label, drop the URL
    .replace(/[*_`|]+/g," ")
    // Same entity decode the worker already does — proxy HTML often keeps &nbsp;
    // between tier and LP, which used to make the strict pattern miss entirely.
    .replace(/&nbsp;/gi," ")
    .replace(/&lt;/gi,"<")
    .replace(/&gt;/gi,">")
    .replace(/&quot;/gi,'"')
    .replace(/&#39;/gi,"'")
    .replace(/&amp;/gi,"&")
    .replace(/\s+/g," ");
}
// Same idea as stripMarkup, but row boundaries survive — the season tables and the
// champion list are only readable as rows. Raw HTML gets its block tags turned into
// newlines first so it lands in the same shape as the reader-mode markdown.
function stripRows(raw){
  return String(raw)
    .replace(/<script[\s\S]*?<\/script>/gi," ")
    .replace(/<style[\s\S]*?<\/style>/gi," ")
    .replace(/<\/(tr|li|div|p|h[1-6]|section|article)\s*>/gi,"\n")
    .replace(/<br\s*\/?>/gi,"\n")
    .replace(/<[^>]*>/g," ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g," ")      // images: their URLs carry tier names
    .replace(/\[([^\]]*)\]\([^)]*\)/g," $1 ")  // links: keep the label, drop the URL
    .replace(/[*`_]+/g," ")
    .replace(/&nbsp;/gi," ")
    .replace(/&lt;/gi,"<")
    .replace(/&gt;/gi,">")
    .replace(/&quot;/gi,'"')
    .replace(/&#39;/gi,"'")
    .replace(/&amp;/gi,"&")
    .replace(/[ \t ]+/g," ")
    .split("\n").map(l=>l.trim()).filter(Boolean);
}
const TIER_WORD="challenger|grandmaster|master|diamond|emerald|platinum|gold|silver|bronze|iron";
// op.gg lists one row per past season, for both queues. Verified against a live
// profile: "| S2025 | master | 135 |" in reader mode, the same cells without the
// pipes once raw table HTML has been through stripRows.
// Rows read as rows only if the row markup survives, and stripRows breaks on
// </div> — which lands mid-cell in op.gg's real tables and scattered one season
// across three lines. That is where "Emerald · 2 LP" came from: the LP cell ended
// up on its own line, so the division digit was the last number the pattern saw.
// Checked against a live profile.
function seasonTables(html){
  return[...String(html).matchAll(/<table[\s\S]*?<\/table>/gi)].map(m=>({
    at:m.index,rows:(m[0].match(/<tr[\s\S]*?<\/tr>/gi)||[]).map(r=>stripMarkup(r).trim())
  }));
}
function parseSeasonTables(raw){
  const html=String(raw);
  if(!/<table/i.test(html))return null;
  const rowRe=new RegExp("^(S\\d{4}(?:\\s*S\\d)?)\\s+("+TIER_WORD+")(?:\\s+([1-4])(?!\\d))?\\s+"+LP_NUM+"$","i");
  const map={"1":"I","2":"II","3":"III","4":"IV"};
  const out={solo:[],flex:[]};
  let n=0;
  for(const t of seasonTables(html)){
    if(!t.rows.some(r=>/^season\s+tier\s+lp$/i.test(r)))continue; // not a season table
    // "Ranked Flex" is the heading sitting directly on top of the flex table;
    // document order decides it otherwise, since op.gg always prints solo first
    const above=stripMarkup(html.slice(Math.max(0,t.at-400),t.at));
    const bucket=/ranked\s*flex[^<]{0,30}$/i.test(above)?"flex":(n===0?"solo":"flex");
    n++;
    for(const r of t.rows){
      const m=r.match(rowRe);
      if(!m)continue;
      const tier=m[2].toUpperCase();
      const mPlus=TIER_ORDER.indexOf(tier)>=TIER_ORDER.indexOf("MASTER");
      out[bucket].push({season:m[1].replace(/\s+/g," "),tier,division:(mPlus||!m[3])?null:map[m[3]],lp:lpNum(m[4])});
    }
  }
  return(out.solo.length||out.flex.length)?out:null;
}
function parseSeasons(raw){
  return parseSeasonTables(raw)||parseSeasonLines(raw);
}
// The reader-mode proxy returns pipe-table markdown instead of HTML, which has no
// <tr> to read — this is the shape that handles it.
function parseSeasonLines(raw){
  if(!raw)return null;
  // The division is optional and must not be allowed to eat the first digit of the
  // LP: without the lookahead, "S2025 master 135" reads as division 1, 35 LP.
  const rowRe=new RegExp("(S\\d{4}(?:\\s*S\\d)?)\\s*\\|?\\s*(?:\\|\\s*)?("+TIER_WORD+")(?:\\s+([1-4])(?!\\d))?\\s*\\|?\\s*"+LP_NUM+"\\s*\\|?\\s*$","i");
  const out={solo:[],flex:[]};
  let bucket=null;
  for(const line of stripRows(raw)){
    // the table's own caption is what says which queue the rows below belong to
    if(/ranked\s*solo/i.test(line)&&/season/i.test(line)&&/\bLP\b/i.test(line)){bucket="solo";continue}
    if(/ranked\s*flex/i.test(line)&&/season/i.test(line)&&/\bLP\b/i.test(line)){bucket="flex";continue}
    if(!bucket)continue;
    const m=line.match(rowRe);
    if(!m){if(/^\|?\s*:?-{2,}/.test(line)||/season/i.test(line))continue;if(out[bucket].length)bucket=null;continue}
    const map={"1":"I","2":"II","3":"III","4":"IV"};
    const tier=m[2].toUpperCase();
    const mPlus=TIER_ORDER.indexOf(tier)>=TIER_ORDER.indexOf("MASTER");
    out[bucket].push({season:m[1].replace(/\s+/g," "),tier,division:(mPlus||!m[3])?null:map[m[3]],lp:lpNum(m[4])});
  }
  return(out.solo.length||out.flex.length)?out:null;
}
// The flex rank sits under its own heading and is usually just "Unranked". Only
// trusted when a tier and an LP figure appear together right after the heading.
function parseFlex(raw){
  if(!raw)return null;
  const lines=stripRows(raw);
  for(let i=0;i<lines.length;i++){
    if(!/^ranked\s*flex$/i.test(lines[i]))continue;
    const near=lines.slice(i+1,i+4).join(" ");
    if(/^\s*unranked/i.test(near))return{tier:"UNRANKED",division:null,lp:null};
    const m=near.match(new RegExp("\\b("+TIER_WORD+")\\b(?:\\s+([1-4]|IV|III|II|I)(?![\\dA-Za-z,]))?\\s*"+LP_NUM+"\\s*LP\\b","i"));
    if(m){
      const map={"1":"I","2":"II","3":"III","4":"IV"};
      const tier=m[1].toUpperCase();
      const mPlus=TIER_ORDER.indexOf(tier)>=TIER_ORDER.indexOf("MASTER");
      return{tier,division:(mPlus||!m[2])?null:(map[m[2]]||m[2].toUpperCase()),lp:lpNum(m[3])};
    }
  }
  return null;
}
// The profile page carries no per-champion season totals at all — they live on
// the /champions sub-page, which is why this kept coming back with nothing no
// matter how the pattern was written. What the profile does carry is op.gg's own
// page description, listing the season's top five with wins, losses and win rate.
// No KDA, but five champions with real numbers beat none, and it costs no second
// request through the proxy chain.
function parseChampionsMeta(raw){
  if(!raw)return null;
  const meta=String(raw).match(/<meta\s+name="description"\s+content="([^"]*)"/i);
  const src=meta?meta[1]:String(raw).slice(0,4000); // reader mode prints it as plain text
  const re=/([A-Za-z0-9'.\- ]{2,26}?)\s*-\s*(\d{1,4})Win\s+(\d{1,4})Lose\s+Win rate\s+(\d{1,3})%/gi;
  const out=[];
  let m;
  while((m=re.exec(src))){
    const name=m[1].replace(/\s+/g," ").trim();
    if(!name||out.some(c=>c.name===name))continue;
    out.push({name,wins:+m[2],losses:+m[3],games:+m[2]+ +m[3],wr:+m[4],kda:null});
  }
  return out.length?out.slice(0,10):null;
}
// The rendered shape a reader-mode proxy returns:
// "Ashe CS 209 (7.2) 2.25:1 KDA 6 / 6.8 / 9.3 60%25 Games"
function parseChampionRows(raw){
  if(!raw)return null;
  const re=/^(.{2,26}?)\s+CS\s+[\d.,]+\s*\([\d.]+\)\s+([\d.]+):1\s+KDA\s+([\d.]+)\s*\/\s*([\d.]+)\s*\/\s*([\d.]+)\s+(\d{1,3})%\s*(\d{1,3})\s+Games\b/i;
  const out=[];
  for(const line of stripRows(raw)){
    const m=line.match(re);
    if(!m)continue;
    const name=m[1].replace(/\s+/g," ").trim();
    if(!name||out.some(c=>c.name===name))continue;
    out.push({name,kda:+m[2],k:+m[3],d:+m[4],a:+m[5],wr:+m[6],games:+m[7]});
  }
  return out.length?out.slice(0,10):null;
}
function parseChampions(raw){
  return parseChampionRows(raw)||parseChampionsMeta(raw);
}
// The Grandmaster and Challenger floors, from op.gg's ladder page:
// "challenger 2,417 LP 6 304 Summoners". They move a couple of times a day.
function parseCutoffs(raw){
  if(!raw)return null;
  // Unlike everywhere else, the alt text has to survive here: the page prints the
  // floors as a bare "2,417 LP" and only the medal image says which tier that is.
  const text=String(raw)
    .replace(/<script[\s\S]*?<\/script>/gi," ")
    .replace(/<img[^>]*\balt\s*=\s*["']([^"']*)["'][^>]*>/gi," $1 ")
    .replace(/<\/(tr|li|div|p|h[1-6])\s*>/gi,"\n")
    .replace(/<[^>]*>/g," ")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g," $1 ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g," $1 ")
    .replace(/[*`_]+/g," ")
    .replace(/[ \t ]+/g," ");
  const grab=(w,min)=>{
    const m=text.match(new RegExp(w+"[^\\n]{0,40}?([\\d][\\d,. ]{2,8})\\s*LP","i"));
    if(!m)return null;
    const n=+m[1].replace(/[,. ]/g,"");
    // Floors below these are almost always an ad ("Challenger Coaching · 250 LP")
    // or a table cell — real GM/Challenger cuts sit well above.
    return n>=min&&n<=20000?n:null;
  };
  const chall=grab("challenger",800), gm=grab("grandmaster",400);
  return(chall||gm)?{chall,gm}:null;
}
// op.gg does publish a season peak after all: it prints the highest rank reached
// right under the current one and badges it "Top tier". Verified against a live
// profile, which flattens to "… diamond 1 52 LP 190 W 215 L Win rate 47%
// master 393 LP Top tier". The peak is the last rank printed before the badge.
function parsePeakText(raw){
  if(!raw)return null;
  const text=stripMarkup(raw);
  const i=text.search(/Top\s*tier/i);
  if(i<0)return null;
  const before=text.slice(Math.max(0,i-160),i);
  // The division is optional, and it must not be allowed to eat the first digit of
  // the LP: without the lookahead, "master 393 LP" parses as division 3, 93 LP.
  // Thousands separators ("4,061 LP") are real on live op.gg pages.
  const re=new RegExp("\\b(challenger|grandmaster|master|diamond|emerald|platinum|gold|silver|bronze|iron)\\b(?:\\s+([1-4]|IV|III|II|I)(?![\\dA-Za-z,]))?\\s*"+LP_NUM+"\\s*LP\\b","ig");
  let m,last=null;
  while((m=re.exec(before)))last=m;
  if(!last)return null;
  const tier=last[1].toUpperCase();
  const mPlus=TIER_ORDER.indexOf(tier)>=TIER_ORDER.indexOf("MASTER");
  const map={"1":"I","2":"II","3":"III","4":"IV"};
  return{tier,division:(mPlus||!last[2])?null:(map[last[2]]||last[2].toUpperCase()),lp:lpNum(last[3])};
}
// The summoner level is stacked on the profile icon as a bare number with no
// label anywhere near it, which is why the "Lv." patterns never found it. There
// is nothing to match on except position: it is the number printed immediately
// before the Riot ID heading. Deliberately a tight window and a sane range —
// a wrong number here would show up as a confident, wrong "Level".
function reEsc(s){return String(s).replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}
function parseLevelText(raw,acc){
  if(!raw||!acc||!acc.gameName)return null;
  const text=stripMarkup(raw);
  // op.gg renders the Riot ID as two separate elements, so once the tags are gone
  // the text reads "764 terminallucidity # final". Matching the literal "name#tag"
  // only ever hit the <title>, where nothing precedes it — which is exactly why
  // every check came back with no level at all. The "#" is optional and may carry
  // spaces, and the reader-mode proxies also leave a markdown heading marker in
  // between: "764 # name#tag".
  const re=new RegExp("(\\d{1,4})[\\s#>]{0,4}"+reEsc(acc.gameName)+"\\s*#?\\s*"+reEsc(acc.tagLine||"")+"\\b","i");
  const m=text.match(re);
  if(!m)return null;
  const lv=+m[1];
  return lv>=1&&lv<=5000?lv:null;
}
// op.gg's own tier graph is built from an lpHistories array, and exactly one
// entry of it is server-rendered into the page — the rest arrives over an
// internal RPC this app has no business replaying. That one entry is still worth
// having: it is dated by when the LP actually changed, rather than by when
// Refresh happened to be pressed, so a check after a week away lands the point on
// the right day instead of today. elo_point is op.gg's own flat ladder number.
function parseLpHistory(raw){
  if(!raw)return null;
  const text=String(raw).replace(/\\"/g,'"');
  const m=text.match(/"created_at"\s*:\s*"([^"]+)"\s*,\s*"tier_info"\s*:\s*\{([^}]*)\}\s*(?:,\s*"elo_point"\s*:\s*(\d+))?/);
  if(!m)return null;
  const t=Date.parse(m[1]);
  if(!t||t>Date.now()+86400000)return null;
  const lp=m[2].match(/"lp"\s*:\s*(\d+)/), tier=m[2].match(/"tier"\s*:\s*"([A-Z]+)"/i);
  if(!tier||TIER_ORDER.indexOf(tier[1].toUpperCase())<0)return null;
  const label=m[2].match(/"label"\s*:\s*"([^"]*)"/);
  const div=label&&label[1].match(/\b([1-4])\b/);
  const T=tier[1].toUpperCase();
  const mPlus=TIER_ORDER.indexOf(T)>=TIER_ORDER.indexOf("MASTER");
  return{t,tier:T,division:mPlus||!div?null:{"1":"I","2":"II","3":"III","4":"IV"}[div[1]],
    lp:lp?+lp[1]:0,elo:m[3]?+m[3]:null};
}
// Icon URLs that 404ed. The <img> used to delete itself in an inline onerror,
// which the next render undid — the markup still carried the src, so a dead icon
// was re-inserted and re-requested on every single re-render, forever. Remembering
// the URL instead means it is asked for once per session.
const deadIcons=new Set();
function iconUrl(s){
  // Backend / AI / paste paths already go through safeIconUrl on write; history
  // and older vaults may still carry a non-https icon into <img src>.
  const u=safeIconUrl(s&&s.icon);
  return u&&!deadIcons.has(u)?u:null;
}
/* The picture goes and whatever is under it shows. A card's portrait always drew
   its initial under the picture; list rows, wall tiles, Quick find and Compare
   drew one or the other, so a dead picture left an empty circle until something
   redrew the page. All of them draw the initial under the picture now. */
function markIconDead(img){
  const u=img.getAttribute("src");
  if(u)deadIcons.add(u);
  img.remove();
}
// A profile icon that fails to load reports it here. An inline onerror attribute is
// script, which the page's security policy does not run; error does not bubble, so
// one listener on the document catches it on the way down instead.
document.addEventListener("error",e=>{const t=e.target;if(t&&t.tagName==="IMG"&&t.hasAttribute("data-ico"))markIconDead(t)},true);
function parseProfileIcon(raw){
  if(!raw)return null;
  const m=String(raw).match(/profile_icons?\/profileicon(\d+)/i);
  return m?`https://opgg-static.akamaized.net/meta/images/profile_icons/profileIcon${m[1]}.jpg`:null;
}
// The backend and the AI path both hand us an icon URL we didn't build ourselves,
// and it ends up in an <img src>. Only let plain https URLs through.
function safeIconUrl(u){
  if(!u)return null;
  try{return new URL(u).protocol==="https:"?u:null}catch(e){return null}
}
async function fetchWithTimeout(url,ms){
  const c=new AbortController();const t=setTimeout(()=>c.abort(),ms);
  try{const r=await fetch(url,{signal:c.signal});if(!r.ok)throw new Error("HTTP "+r.status);return await r.text()}
  finally{clearTimeout(t)}
}
let lastGoodProxy=0;
const PROXIES=[
  {name:"corsproxy",make:u=>"https://corsproxy.io/?url="+encodeURIComponent(u)},
  {name:"allorigins",make:u=>"https://api.allorigins.win/raw?url="+encodeURIComponent(u)},
  {name:"jina reader",make:u=>"https://r.jina.ai/"+u} // reader-mode text extraction — may strip the <img> the profile icon needs
];
async function fetchViaProxy(acc){
  const r=REGIONS[acc.region]||REGIONS.EUW;
  const target="https://op.gg/lol/summoners/"+r.opgg+"/"+encodeURIComponent(acc.gameName)+"-"+encodeURIComponent(acc.tagLine);
  const proxies=PROXIES;
  let lastErr="no proxy reachable";
  for(let k=0;k<proxies.length;k++){
    const idx=(lastGoodProxy+k)%proxies.length;
    try{
      const text=await fetchWithTimeout(proxies[idx].make(target),10000);
      // Same contract as the worker: a missing Riot ID is found:false, not a failed parse.
      if(isSummonerNotFoundPage(text)){
        lastGoodProxy=idx;
        return {found:false,updatedAt:Date.now(),asOf:"auto-fetch (op.gg via "+proxies[idx].name+")"};
      }
      const parsed=parseRankText(text);
      if(parsed){
        lastGoodProxy=idx; // start here next time — skips dead proxies on bulk checks
        const uncertain=!parseRankFromMeta(text);
        return {found:true,tier:parsed.tier||"UNRANKED",division:parsed.division||null,lp:parsed.lp,wins:parsed.wins,losses:parsed.losses,
          level:parsed.level!=null?parsed.level:parseLevelText(text,acc),
          peak:parsePeakText(text),
          seasons:parseSeasons(text),flex:parseFlex(text),champs:parseChampions(text),
          lpAt:parseLpHistory(text),
          icon:parseProfileIcon(text),mmr:null,avgRecent:null,uncertain,source:uncertain?"body":"meta",
          asOf:"auto-fetch (op.gg via "+proxies[idx].name+")",note:null,updatedAt:Date.now()};
      }
      lastErr="page loaded but no rank found; check the name, tag and region";
    }catch(e){lastErr=e.name==="AbortError"?"timeout":(e.message||"fetch blocked")}
  }
  throw new Error(lastErr);
}
// Grandmaster and Challenger have no fixed LP: the floor is wherever the last
// qualifying player sits, and Riot re-cuts it a couple of times a day. op.gg
// prints both on its ladder page, so they get fetched once per region per half
// day and cached — a stale floor is still far better than pretending 2800 LP is
// the line, and refetching on every render would hammer the proxies.
const CUTOFF_TTL=12*3600*1000;
function cutoffsFor(region){
  const r=(REGIONS[region]||REGIONS.EUW).opgg;
  return(cfg.cutoffs&&cfg.cutoffs[r])||null;
}
async function ensureCutoffs(region){
  const r=(REGIONS[region]||REGIONS.EUW).opgg;
  cfg.cutoffs=cfg.cutoffs||{};
  const have=cfg.cutoffs[r];
  if(have&&Date.now()-have.at<CUTOFF_TTL)return false;
  const target="https://op.gg/lol/leaderboards/tier?region="+encodeURIComponent(r);
  for(let k=0;k<PROXIES.length;k++){
    const idx=(lastGoodProxy+k)%PROXIES.length;
    try{
      const c=parseCutoffs(await fetchWithTimeout(PROXIES[idx].make(target),12000));
      if(c){cfg.cutoffs[r]={chall:c.chall,gm:c.gm,at:Date.now()};saveCfg();return true}
    }catch(e){}
  }
  return false;
}
// Only for regions that actually have a Master+ account in the vault — nobody
// else's card can use the number, so nobody else's region is worth a request.
function refreshCutoffs(){
  const mIdx=TIER_ORDER.indexOf("MASTER");
  const regions=[...new Set(accounts.filter(a=>a.stats&&a.stats.found!==false
    &&TIER_ORDER.indexOf((a.stats.tier||"").toUpperCase())>=mIdx).map(a=>a.region))];
  if(!regions.length)return;
  Promise.all(regions.map(r=>ensureCutoffs(r).catch(()=>false)))
    .then(res=>{if(res.some(Boolean))renderGrid()});
}
function mapBackendPayload(d){
  if(!d||typeof d!=="object")throw new Error("empty backend payload");
  if(d.ok===false&&d.found!==false)throw new Error(d.error||"backend row failed");
  if(d.found===false)return {found:false,updatedAt:Date.now(),riotError:d.riotError||null};
  // Require an explicit found:true (or a tier) so a half-empty error object is not
  // promoted to UNRANKED success.
  if(d.found!==true&&!d.tier)throw new Error("backend row missing rank");
  const uncertain=!!d.uncertain;
  return {found:true,tier:(d.tier||"UNRANKED").toUpperCase(),division:d.division||null,lp:d.lp??null,wins:d.wins??null,losses:d.losses??null,level:d.level??null,peak:normPeak(d.peak),seasons:d.seasons||null,flex:normPeak(d.flex),champs:Array.isArray(d.champs)?d.champs.slice(0,10):null,lpAt:normLpAt(d.lpAt),icon:safeIconUrl(d.icon),mmr:d.mmr||null,avgRecent:d.avgRecent||null,asOf:"backend",note:null,uncertain,source:d.source||null,updatedAt:Date.now(),
    puuid:validPuuid(d.puuid)?d.puuid:null,
    riotId:d.riotId&&typeof d.riotId==="object"&&d.riotId.name&&d.riotId.tag?{name:String(d.riotId.name).slice(0,32),tag:String(d.riotId.tag).slice(0,8)}:null,
    riotError:d.riotError||null,mastery:normMastery(d.mastery)};
}
async function fetchViaBackend(acc){
  const r=REGIONS[acc.region]||REGIONS.EUW;
  let url;
  try{url=new URL(cfg.backendUrl)}catch(e){throw new Error("invalid backend URL")}
  url.searchParams.set("name",acc.gameName);
  url.searchParams.set("tag",acc.tagLine);
  url.searchParams.set("region",r.opgg);
  if(validPuuid(acc.puuid))url.searchParams.set("puuid",acc.puuid);
  if(wantsMastery(acc))url.searchParams.set("mastery","1");
  const text=await fetchWithTimeout(url.href,12000);
  return mapBackendPayload(JSON.parse(text));
}
// One POST for up to 20 accounts — Check-all used to wait ~1s × N on sequential GETs.
async function fetchViaBackendBatch(list){
  if(!cfg.backendUrl||!list.length)return null;
  let url;
  try{url=new URL(cfg.backendUrl)}catch(e){return null}
  const accounts=list.map(a=>{
    const r=REGIONS[a.region]||REGIONS.EUW;
    return{name:a.gameName,tag:a.tagLine,region:r.opgg,id:a.id,puuid:validPuuid(a.puuid)?a.puuid:undefined,mastery:wantsMastery(a)||undefined};
  });
  const c=new AbortController();const t=setTimeout(()=>c.abort(),45000);
  try{
    const res=await fetch(url.href,{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({accounts:accounts.map(({name,tag,region,puuid,mastery})=>({name,tag,region,puuid,mastery}))}),signal:c.signal});
    if(!res.ok)throw new Error("HTTP "+res.status);
    const data=await res.json();
    if(!data||!Array.isArray(data.results))throw new Error("bad batch response");
    const byKey=new Map();
    data.results.forEach((r,i)=>{
      const a=accounts[i];
      if(!a)return;
      byKey.set(a.id,r);
    });
    return byKey;
  }finally{clearTimeout(t)}
}
// the backend and the AI path hand us a peak we didn't build ourselves, and it
// goes straight into a rank comparison — normalise it or drop it
function normPeak(p){
  if(!p||typeof p!=="object")return null;
  const tier=String(p.tier||"").toUpperCase();
  if(TIER_ORDER.indexOf(tier)<0)return null;
  const div=String(p.division||"").toUpperCase();
  return{tier,division:normDivision(tier,DIV_ORDER[div]!==undefined?div:null),
    lp:p.lp==null||p.lp===""?null:(Number(p.lp)||0)};
}
// Same reasoning for the two lists. A season row with no tier used to reach
// `e.tier.charAt(0)` inside the render and throw, which takes the whole grid down
// — one malformed backend response and the app shows nothing.
function normSeasonRow(e){
  if(!e||typeof e!=="object")return null;
  const tier=String(e.tier||"").toUpperCase();
  if(tier!=="UNRANKED"&&TIER_ORDER.indexOf(tier)<0)return null;
  const div=String(e.division||"").toUpperCase();
  return{season:String(e.season||"—").slice(0,16),tier,
    division:normDivision(e.tier,DIV_ORDER[div]!==undefined?div:null),
    lp:e.lp==null?null:(Number(e.lp)||0)};
}
function normSeasons(s){
  if(!s||typeof s!=="object")return null;
  const pick=k=>(Array.isArray(s[k])?s[k]:[]).map(normSeasonRow).filter(Boolean).slice(0,20);
  const solo=pick("solo"), flex=pick("flex");
  return solo.length||flex.length?{solo,flex}:null;
}
// This one decides the date a history point is filed under, so a wrong value
// would bend the chart rather than just show a wrong figure.
function normLpAt(p){
  if(!p||typeof p!=="object")return null;
  const t=Number(p.t);
  const tier=String(p.tier||"").toUpperCase();
  if(!t||!isFinite(t)||t>Date.now()+86400000||TIER_ORDER.indexOf(tier)<0)return null;
  const div=String(p.division||"").toUpperCase();
  return{t,tier,division:normDivision(tier,DIV_ORDER[div]!==undefined?div:null),
    lp:p.lp==null||p.lp===""?null:(Number(p.lp)||0)};
}
/* Champion mastery, from a worker with a Riot key: the account's top five, kept on
   the account (not on a reading) because it changes over weeks, not games. It is
   asked for at most every three days per account — one more Riot call a lookup. */
const MASTERY_EVERY=3*86400000;
function normMastery(list){
  if(!Array.isArray(list))return null;
  const out=list.slice(0,5).map(m=>m&&typeof m==="object"&&typeof m.name==="string"&&/^[A-Za-z0-9 '.&-]{1,24}$/.test(m.name)?{
    name:m.name,level:Number.isFinite(m.level)?Math.max(0,Math.min(1000,Math.round(m.level))):null,
    points:Number.isFinite(m.points)?Math.max(0,Math.round(m.points)):null}:null).filter(Boolean);
  return out.length?out:null;
}
/* The last five ranked games, kept on the account from the latest /form answer
   (Details opened, or a single Refresh), so a card can say "3W streak" and which
   role the account has been played in without asking Riot again. */
const ROLES=["Top","Jungle","Mid","Bot","Support"];
function normRecent(r){
  if(!r||typeof r!=="object"||!(Number(r.at)>0)||!Array.isArray(r.games))return null;
  const games=r.games.slice(0,5).filter(g=>g&&typeof g==="object").map(g=>({win:g.win===true,
    champ:typeof g.champ==="string"&&/^[A-Za-z0-9 '.&-]{1,24}$/.test(g.champ)?g.champ:null,
    role:ROLES.includes(g.role)?g.role:null,at:Number.isFinite(g.at)?g.at:null}));
  return games.length?{at:Number(r.at),games}:null;
}
const RECENT_FOR=7*86400000; // older than a week, a streak is history, not form
function streakOf(a){
  const r=normRecent(a.recent);if(!r||Date.now()-r.at>RECENT_FOR)return null;
  const g=r.games.slice().sort((x,y)=>(y.at||0)-(x.at||0));
  let n=0;while(n<g.length&&g[n].win===g[0].win)n++;
  return n>=3?{win:g[0].win,n}:null;
}
function mainRole(a){
  const r=normRecent(a.recent);if(!r)return null;
  const count={};for(const g of r.games)if(g.role)count[g.role]=(count[g.role]||0)+1;
  const best=Object.entries(count).sort((x,y)=>y[1]-x[1])[0];
  return best&&best[1]>=3?best[0]:null;
}
function wantsMastery(a){return !!cfg.backendUrl&&!(Number(a.masteryAt)>Date.now()-MASTERY_EVERY)}
function fmtPoints(n){return n==null?"":n>=1e6?(n/1e6).toFixed(n>=1e7?0:1).replace(/\.0$/,"")+"M":n>=1e3?Math.round(n/1e3)+"k":String(n)}
function normChamps(list){
  if(!Array.isArray(list))return null;
  const num=(v,d)=>v==null||v===""||isNaN(Number(v))?d:Number(v);
  const out=list.map(c=>{
    if(!c||typeof c!=="object"||!c.name)return null;
    const wins=num(c.wins,null), losses=num(c.losses,null);
    return{name:String(c.name).slice(0,40),
      // null rather than 0 — the profile page's own champion list has no KDA, and
      // printing "0.00 KDA" would be a made-up number rather than a missing one
      kda:c.kda==null?null:Math.round(num(c.kda,0)*100)/100,
      wr:Math.max(0,Math.min(100,Math.round(num(c.wr,0)))),
      games:Math.max(0,Math.round(num(c.games,(wins||0)+(losses||0)))),
      wins:wins==null?null:Math.max(0,Math.round(wins)),
      losses:losses==null?null:Math.max(0,Math.round(losses))};
  }).filter(Boolean).slice(0,10);
  return out.length?out:null;
}
async function fetchViaClaude(acc){
  if(!cfg.apiKey)throw new Error("No API key. Add one in Settings");
  const r=REGIONS[acc.region]||REGIONS.EUW;
  const prompt=`Search the web for the current League of Legends ranked Solo/Duo stats of the player "${acc.gameName}#${acc.tagLine}" on the ${r.full} (${acc.region}) server.
Preferred sources: dpm.lol first, then op.gg, leagueofgraphs, u.gg. Try queries like: dpm.lol ${acc.gameName} ${acc.tagLine} | op.gg ${acc.gameName} ${acc.tagLine} ${r.opgg}.
Find: current tier, division and LP; this season's wins and losses; the summoner level; the highest rank reached this season (op.gg prints it under the current rank with a "Top tier" badge); the profile icon image URL if visible (op.gg shows it as opgg-static.akamaized.net/.../profileIcon<number>.jpg); an estimated MMR if any site shows one (dpm.lol often does); and the average rank/tier of the last ~5 games if visible.
Respond with ONLY a raw JSON object, no markdown fences, no explanation, exactly this shape:
{"found":true,"tier":"GOLD","division":"II","lp":45,"wins":30,"losses":25,"level":247,"peak":{"tier":"PLATINUM","division":"IV","lp":12},"icon":"https://opgg-static.akamaized.net/meta/images/profile_icons/profileIcon123.jpg","mmr":"~2100","avgRecent":"Gold I","asOf":"how fresh the data looks","note":"one short remark only if something is off"}
Rules: use null for any value you cannot find. If unranked this season, tier "UNRANKED" and division null. If you cannot find the player at all, found=false. Numbers must be plain numbers, not strings.`;
  const res=await fetch("https://api.anthropic.com/v1/messages",{
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      "x-api-key":cfg.apiKey,
      "anthropic-version":"2023-06-01",
      "anthropic-dangerous-direct-browser-access":"true"
    },
    body:JSON.stringify({model:cfg.model,max_tokens:1000,messages:[{role:"user",content:prompt}],tools:[{type:WEB_SEARCH_TOOL[cfg.model]||"web_search_20250305",name:"web_search"}]})
  });
  const data=await res.json();
  if(data.error)throw new Error(data.error.message||"API error");
  const text=(data.content||[]).map(b=>b.type==="text"?b.text:"").filter(Boolean).join("\n");
  const a=text.indexOf("{"),b=text.lastIndexOf("}");
  if(a===-1||b===-1)throw new Error("No JSON in response");
  const parsed=JSON.parse(text.slice(a,b+1));
  const modelName=cfg.model.includes("haiku")?"Haiku":"Sonnet";
  const asOf=(parsed.asOf?parsed.asOf+" · ":"")+"AI ("+modelName+")";
  // Same gate as the worker payload — half-empty model JSON must not become a
  // silent UNRANKED success.
  if(parsed.found===false)return {found:false,updatedAt:Date.now(),asOf};
  if(parsed.found!==true&&!parsed.tier)throw new Error("AI returned incomplete rank data");
  parsed.found=true;
  parsed.icon=safeIconUrl(parsed.icon);
  parsed.peak=normPeak(parsed.peak);
  parsed.updatedAt=Date.now();
  parsed.asOf=asOf;
  parsed.uncertain=false;
  parsed.source="ai";
  parsed.note=parsed.note||null;
  return parsed;
}
function applyStats(acc,s){
  // Three sources feed this: the local op.gg parsers, a backend URL the user
  // configures, and a model's JSON. Only the first is guaranteed to be shaped the
  // way the card reads it, and this is the one point all three meet — so the
  // shaping happens here rather than three times over, differently.
  if(s&&s.found===false){
    // A miss is an answer about the Riot ID, not a wipe of the vault's memory of
    // seasons/champs/peak. Replacing the whole stats object used to blank the
    // details drawer the moment a name was mistyped.
    const old=acc.stats||{};
    s={
      found:false,updatedAt:s.updatedAt||Date.now(),
      tier:null,division:null,lp:null,wins:null,losses:null,lpAt:null,
      mmr:null,avgRecent:null,uncertain:false,source:null,note:null,
      level:old.level!=null?old.level:null,
      peak:old.peak||null,seasons:old.seasons||null,flex:old.flex||null,
      champs:old.champs||null,icon:old.icon||null,
      asOf:s.asOf||null,
    };
  }else if(s&&s.found!==false){
    // Above Master there are no divisions. The peak and season parsers already
    // knew that; the current-rank parser did not, and the backend and the model
    // are simply whatever they hand back.
    s.division=normDivision(s.tier,s.division);
    // Hostile/corrupt JSON (import, backend, AI) used to land non-numbers in
    // `value="${s.lp}"` and break out of the attribute. Coerce here, once.
    const numOrNull=v=>{if(v==null||v==="")return null;const n=Number(v);return Number.isFinite(n)?n:null};
    if(s.lp!=null)s.lp=numOrNull(s.lp);
    if(s.wins!=null)s.wins=numOrNull(s.wins);
    if(s.losses!=null)s.losses=numOrNull(s.losses);
    if(s.level!=null)s.level=numOrNull(s.level);
    s.seasons=normSeasons(s.seasons);
    s.champs=normChamps(s.champs);
    // Flex Unranked is an answer, not "missing". normPeak drops UNRANKED to null,
    // and the keep-old fallback below used to revive the previous Gold as if Flex
    // had never been read. Only keep the previous flex when this reading said
    // nothing about flex at all.
    const flexRaw=s.flex;
    s.flex=normPeak(s.flex);
    s.peak=normPeak(s.peak);
    s.lpAt=normLpAt(s.lpAt);
    /* The AI path never asks for seasons, champs or flex, and a truncated proxy
       page can miss the tables while still reading the current rank. Assigning the
       whole object used to wipe whatever the last full parse had left — the manual
       ✎ Rank path already knew to keep them. Same rule here: a reading that has
       nothing to put in those slots leaves the previous ones standing. */
    const old=acc.stats||{};
    if(!s.seasons&&old.seasons)s.seasons=old.seasons;
    if(!s.champs&&old.champs)s.champs=old.champs;
    if(!s.flex&&old.flex){
      const said=flexRaw&&typeof flexRaw==="object";
      if(!said)s.flex=old.flex;
    }
    if(!s.peak&&old.peak)s.peak=old.peak;
    if(!s.icon&&old.icon)s.icon=old.icon;
    if(s.level==null&&old.level!=null)s.level=old.level;
  }
  acc.stats=s;
  let rankedUp=false;
  if(s.found!==false&&ladderLP(s)!==null){
    const hist=acc.history=acc.history||[];
    const prev=hist[hist.length-1];
    // When op.gg told us when this LP was actually reached, that is the date the
    // point belongs under. A point dated by the day you happened to press Refresh
    // puts a week of inactivity on the chart as a flat line ending today, which is a
    // shape the account never had. Only trusted while it still agrees with the rank
    // we just read (tier, division and LP), and never in the future of the check itself.
    const at=s.lpAt;
    const sameRank=at&&at.tier===(s.tier||"").toUpperCase()&&at.lp===s.lp
      &&(at.division||null)===(s.division||null);
    let when=(sameRank&&at.t<=s.updatedAt)?at.t:s.updatedAt;
    if(prev&&prev.tier===s.tier&&prev.division===s.division&&prev.lp===s.lp){
      // Only slide the stamp *earlier* when lpAt corrected a reached-date. A later
      // refresh without lpAt used to drag the point forward to "now" and undo it.
      const floor=hist.length>=2?(+hist[hist.length-2].t||0):0;
      if(sameRank&&when<(+prev.t||0)&&when>floor)prev.t=when;
      // Same reading can still gain games: keep W/L in step so "Since last check"
      // and season-break detection see the totals the card is showing.
      if(s.wins!=null)prev.w=Number(s.wins)||0;
      if(s.losses!=null)prev.l=Number(s.losses)||0;
    }else{
      // A reached-date older than the previous distinct point cannot be filed
      // under that day without putting the new rank behind history. Advance one
      // millisecond past the previous stamp so order is preserved even when
      // updatedAt itself is also somehow earlier (manual entry mid-flight).
      if(prev&&when<=(+prev.t||0))when=(+prev.t||0)+1;
      // The tier stored here is the one op.gg reported at that moment, and it is
      // never recomputed — an account that was Challenger in March stays
      // Challenger on the chart even though today's floor is somewhere else.
      // The floors of the day go in beside it so a future reading of this point
      // can judge it against its own ladder rather than against a later one.
      const row={t:when,tier:s.tier,division:s.division,lp:s.lp};
      // The season win/loss totals ride along with the point. On their own they are
      // the same two numbers already on the card, but the difference between two
      // consecutive points is something the app could not answer at all before:
      // how many games were actually played between one check and the next.
      if(s.wins!=null)row.w=Number(s.wins)||0;
      if(s.losses!=null)row.l=Number(s.losses)||0;
      const cut=cutoffsFor(acc.region);
      if(cut&&(cut.gm||cut.chall))row.cut={gm:cut.gm,chall:cut.chall};
      hist.push(row);
      // Trim only when something was actually added — a no-op refresh used to
      // slice the oldest point off a full history for no reason.
      if(hist.length>60)hist.splice(0,hist.length-60);
      if(prev&&TIER_ORDER.indexOf((s.tier||"").toUpperCase())>TIER_ORDER.indexOf((prev.tier||"").toUpperCase()))rankedUp=true;
    }
    // Reached-dates can still correct a stamp slightly earlier within its slot;
    // keep the array ordered so everything downstream can trust the last entry.
    hist.sort((x,y)=>(+x.t||0)-(+y.t||0));
  }else if(s&&s.found!==false&&(s.tier||"").toUpperCase()==="UNRANKED"){
    // Unranked has no ladder LP, so the ranked branch above never ran — and the
    // chart kept ending on the old Diamond point as if the account were still
    // there. Record the Unranked reading so lastDelta/away/sparklines see the break.
    const hist=acc.history=acc.history||[];
    const prev=hist[hist.length-1];
    let when=s.updatedAt||Date.now();
    if(prev&&(prev.tier||"").toUpperCase()==="UNRANKED"){
      if(when>(+prev.t||0)||hist.length<2)prev.t=when;
      if(s.wins!=null)prev.w=Number(s.wins)||0;
      if(s.losses!=null)prev.l=Number(s.losses)||0;
    }else{
      if(prev&&when<=(+prev.t||0))when=(+prev.t||0)+1;
      const row={t:when,tier:"UNRANKED",division:null,lp:null};
      if(s.wins!=null)row.w=Number(s.wins)||0;
      if(s.losses!=null)row.l=Number(s.losses)||0;
      hist.push(row);
      if(hist.length>60)hist.splice(0,hist.length-60);
    }
  }
  // A levelling account has no LP to chart, but its level moves: kept as its own
  // short series (lvls, additive and optional), so its card can say the pace.
  if(s&&s.found!==false&&!isRanked(acc)&&s.level!=null&&Number(s.level)<=30){
    const L=acc.lvls=Array.isArray(acc.lvls)?acc.lvls:[], v=Number(s.level), last=L[L.length-1];
    if(!last||last.v!==v){L.push({t:s.updatedAt||Date.now(),v});if(L.length>30)L.splice(0,L.length-30)}
  }
  return rankedUp;
}
/* The LP figure is the one number on the card that a check exists to change, and
   it changed by snapping. Rolled instead, from the old value to the new, so the
   size of the move is something you see rather than something you work out.
   Only ever fires on an actual change, so it costs nothing at rest. */
function rollNumber(el,from,to,suffix){
  if(!el||from==null||to==null||from===to||prefersReducedMotion())return;
  if(!window.requestAnimationFrame)return;
  const t0=performance.now(), dur=Math.min(220+Math.abs(to-from)*7,900);
  const step=now=>{
    if(!el.isConnected)return;   // the card was re-rendered under us; let it stand
    const p=Math.min((now-t0)/dur,1);
    const e=1-Math.pow(1-p,3);
    el.textContent=fmtN(Math.round(from+(to-from)*e))+suffix;
    if(p<1)requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
/* Riot's account id, from a worker that has a Riot API key. It does not change
   when the Riot ID does, so a renamed account keeps its card and history instead
   of turning into "not found". A rename the worker reports is followed: the name
   and tag on the card become the new ones (a change of letter case alone, quietly). */
const PUUID_RE=/^[A-Za-z0-9_-]{30,100}$/;
function validPuuid(p){return typeof p==="string"&&PUUID_RE.test(p)}
let riotKeyWarned=false;
function takeIdentity(acc,s){
  if(!s)return;
  if(validPuuid(s.puuid))acc.puuid=s.puuid;
  const r=s.riotId;
  if(r&&r.name&&r.tag&&(r.name!==acc.gameName||r.tag!==acc.tagLine)){
    const was=acc.gameName+"#"+acc.tagLine, same=was.toLowerCase()===(r.name+"#"+r.tag).toLowerCase();
    acc.gameName=r.name;acc.tagLine=r.tag;
    if(!same)toast(streamerOn()?"Renamed on Riot: "+plainName(acc)+" follows its new Riot ID":"Renamed on Riot: "+was+" is now "+r.name+"#"+r.tag);
  }
  // Once a session, not once per account: sixty toasts about one expired key help nobody.
  if(s.riotError==="key"&&!riotKeyWarned){
    riotKeyWarned=true;
    toast("Your worker's Riot API key was refused, so this check used op.gg. Development keys expire after 24 hours.");
  }
  if(s.mastery){acc.mastery=s.mastery;acc.masteryAt=Date.now()}
  delete s.puuid;delete s.riotId;delete s.riotError;delete s.mastery;
}
function commitStats(id,acc,s){
  takeIdentity(acc,s);
  if(cfg.watch&&s&&DECAY_RULES[String(s.tier||"").toUpperCase()])syncWatchSoon();
  // a fresh read may mean fresh games — an open drawer fetches them again
  if(formCache.has(id)){formCache.delete(id);if(openInfo.has(id))loadForm(id)}
  // A profile that does not exist is not a failed request to be retried later —
  // it means the Riot ID has moved, and every future check on this account will
  // fail the same way until somebody corrects it. Raise the flag once.
  if(s&&s.found===false&&!acc.flagged)acc.flagged=true;
  const beforeLP=acc.stats&&acc.stats.found!==false&&acc.stats.lp!=null?Number(acc.stats.lp):null;
  const beforeTier=acc.stats&&(acc.stats.tier||"").toUpperCase();
  const up=applyStats(acc,s);
  openRank.delete(id);
  flashId=id;
  // Check-all used to rewrite the whole vault to disk once per account. Defer
  // while a run is in flight; checkAll flushes once at the end.
  if(run)run.dirty=true; else saveDB();
  // Only this card changed. Going through render() re-sorted the grid after every
  // single check, so during Check all ranks the whole board reshuffled once per
  // account — the order settles on the next full render instead.
  renderCard(id);
  // Ribbon + dash rebuild the whole vault — skip both while Check-all is in flight;
  // the final render() after the run refreshes them.
  if(!run){renderRibbon();renderDash()}
  {
    // Within a tier the LP number is comparable end to end; across a tier it is
    // not — 90 LP to 12 LP is a promotion, and counting down through it would
    // read as a loss. So the roll is only for a move inside one tier.
    const afterTier=acc.stats&&(acc.stats.tier||"").toUpperCase();
    const afterLP=acc.stats&&acc.stats.lp!=null?Number(acc.stats.lp):null;
    if(beforeTier&&afterTier===beforeTier){
      const el=$("grid").querySelector(`[data-id="${idSel(id)}"] .rk-lp`);
      rollNumber(el,beforeLP,afterLP," LP");
    }
  }
  if(up)celebrate(id,acc);
  setTimeout(()=>{if(flashId===id){flashId=null;renderCard(id)}},1500);
}
async function check(id){
  // Deleted mid-run is neither a refresh nor a failure — null matches "superseded".
  const acc=accounts.find(a=>a.id===id);if(!acc)return null;
  /* Two clicks, or Refresh while a check-all is already on this card, used to leave
     both fetches in flight with no idea which finished last. A slow success and a
     fast failure then met in either order: the failure path Object.assigns a note
     onto whatever stats are there, so a good reading could end up carrying
     "Auto-fetch failed" forever. Numbered per account; only the latest run may write. */
  const gen=(checkGen.get(id)||0)+1;checkGen.set(id,gen);
  checking.add(id);renderCard(id);syncCheckAll();
  let s=null,err="";
  if(cfg.backendUrl){try{s=await fetchViaBackend(acc)}catch(e){err="backend: "+(e.message||"failed")}}
  if(!s&&cfg.apiKey){try{s=await fetchViaClaude(acc)}catch(e){err=err||("api: "+(e.message||"failed"))}}
  if(!s){try{s=await fetchViaProxy(acc)}catch(e){err=err||e.message||"auto-fetch failed"}}
  // Only the owner may clear the spinner — a newer Refresh already put itself in
  // `checking`, and deleting blindly would steal its "Checking…" state.
  if(checkGen.get(id)!==gen)return null;
  checking.delete(id);
  syncCheckAll();
  if(checkGen.get(id)!==gen)return null;
  if(s){
    commitStats(id,acc,s);
    // found:false is a finished answer, not a successful refresh and not a retryable fail.
    return s.found===false?"missing":true;
  }
  if(checkGen.get(id)!==gen)return null;
  acc.stats=Object.assign({},acc.stats||{},{note:"Auto-fetch failed ("+err+"). Enter it by hand with ✎ Rank"});
  if(run)run.dirty=true; else saveDB();
  renderCard(id);
  if(!run){renderDash();renderRibbon()}
  return false;
}
// Sixty accounts at roughly a second each is minutes of waiting, and the only
// sign of life used to be the word "Checking…" on a button — no idea how far it
// had got, which account it was on, how many had failed, or any way to stop it.
let run=null;
function renderRun(){
  const bar=$("runbar"), cancel=$("bCancelCheck");
  bar.classList.toggle("hidden",!run);
  cancel.classList.toggle("hidden",!run);
  document.querySelector(".console").classList.toggle("running",!!run);   // Stop stays pinned
  if(!run)return;
  const pct=run.total?Math.round(run.done/run.total*100):0;
  bar.querySelector(".run-fill").style.width=pct+"%";
  bar.querySelector(".run-txt").textContent=
    `${run.done} of ${run.total}${run.failed.length?" · "+run.failed.length+" failed":""}${run.current?" · "+run.current:""}`;
}
function renderFailbar(){
  const el=$("failbar");
  const fails=(run&&run.failed)||lastFails;
  if(!fails||!fails.length||run){el.classList.add("hidden");return}
  el.classList.remove("hidden");
  setHTML(el,`<span class="fb-n">${fails.length} account${fails.length===1?"":"s"} failed to refresh</span>`
    +`<span class="fb-l">${fails.slice(0,6).map(f=>esc(f.name)).join(", ")}${fails.length>6?" +"+(fails.length-6)+" more":""}</span>`
    +`<button id="bShowFails">Show</button><button id="bRetryFails">Try again</button><button id="bDismissFails" class="fb-x" aria-label="Dismiss">${icon("x")}</button>`);
}
let lastFails=null;
/* With no connection Check all went through every account in turn and failed
   each one ("5 of 18 · 5 failed"), leaving a failure on every card for a network
   that was simply off. Not starting is the honest answer. */
const OFFLINE_SAY="You're offline. Ranks can be checked once you're back online";
function isOffline(){try{return navigator.onLine===false}catch(e){return false}}
async function checkAll(ids){
  if(run)return;
  if(isOffline()){toast(OFFLINE_SAY);return}
  // Array.isArray rather than a truthiness test: this used to be wired straight to
  // a click listener, which passes an Event — truthy, and with no .map on it.
  const list=(Array.isArray(ids)?ids.map(id=>accounts.find(a=>a.id===id)).filter(Boolean):filtered()).filter(a=>a.status!=="banned");
  if(!list.length){toast("Nothing to refresh");return}
  run={total:list.length,done:0,ok:0,missing:0,failed:[],current:null,stop:false,dirty:false};
  lastFails=null;renderFailbar();renderRun();syncCheckAll();
  const done=new Set();
  // Worker batch when a backend is set — chunks of 20, then sequential for misses.
  if(cfg.backendUrl){
    for(let i=0;i<list.length;i+=20){
      if(run.stop)break;
      const chunk=list.slice(i,i+20).filter(a=>!done.has(a.id));
      if(!chunk.length)continue;
      run.current="batch "+(i+1)+"–"+(i+chunk.length);renderRun();
      // Claim ownership before the network wait — bumping only at commit let a
      // finished Refresh be overwritten by a slower batch response.
      const gens=new Map();
      for(const acc of chunk){
        const gen=(checkGen.get(acc.id)||0)+1;checkGen.set(acc.id,gen);gens.set(acc.id,gen);
        checking.add(acc.id);renderCard(acc.id);
      }
      let map=null;
      try{map=await fetchViaBackendBatch(chunk)}catch(e){map=null}
      const release=(id,gen)=>{if(checkGen.get(id)===gen)checking.delete(id)};
      if(!map){
        // POST dead / old worker — drop only claims we still own, then sequential.
        for(const [id,gen] of gens)release(id,gen);
        break;
      }
      const batchNow=Date.now();
      for(const acc of chunk){
        if(run.stop)break;
        const gen=gens.get(acc.id);
        // A newer Refresh owns this card — leave it alone, and do not sequential-retry.
        // Still advance the progress bar so a mid-run Refresh cannot leave it short.
        if(checkGen.get(acc.id)!==gen){done.add(acc.id);run.done++;renderRun();continue}
        const row=map.get(acc.id);
        if(!row){release(acc.id,gen);continue}
        if(row.ok===false&&row.found!==false){release(acc.id,gen);continue}
        let s=null;
        try{s=mapBackendPayload(row)}catch(e){release(acc.id,gen);continue}
        if(checkGen.get(acc.id)!==gen){done.add(acc.id);run.done++;renderRun();continue}
        s.updatedAt=batchNow; // one stamp per chunk so pool sparkline can bucket
        commitStats(acc.id,acc,s);
        release(acc.id,gen);
        done.add(acc.id);
        if(s.found===false)run.missing++;
        else run.ok++;
        run.done++;renderRun();
      }
      for(const [id,gen] of gens)release(id,gen);
      // Soft-empty chunk (all transport skips / superseded): try the next POST chunk.
      // Only a dead POST (`!map`) aborts batching entirely.
    }
  }
  for(const acc of list){
    if(run.stop)break;
    if(done.has(acc.id))continue;
    run.current=plainName(acc);renderRun();
    // null = superseded/deleted; "missing" = found:false; false = transport fail; true = refreshed.
    const result=await check(acc.id);
    if(result===false)run.failed.push({id:acc.id,name:plainName(acc)});
    else if(result===true)run.ok++;
    else if(result==="missing")run.missing++;
    run.done++;renderRun();
    if(run.stop)break;
    await new Promise(r=>setTimeout(r,cfg.backendUrl?200:800));
  }
  const {done:nDone,ok,missing,failed,stop,dirty}=run;
  run=null;lastFails=failed.length?failed:null;
  if(dirty)saveDB();
  render(); // the sort order was deliberately left alone during the run
  renderRun();renderFailbar();
  let msg, notifyMsg="";
  if(stop)msg="Stopped after "+nDone+" of "+list.length;
  else{
    const parts=[];
    if(ok)parts.push(ok+" refreshed");
    if(missing)parts.push(missing+" not found");
    // On the page the failures are the banner's to say (see renderFailbar), and each
    // card's; a desktop notice reaches someone away from the page, so it says them.
    msg=parts.length?parts.join(", "):failed.length?"":"Nothing changed";
    if(failed.length)notifyMsg=parts.concat(failed.length+" failed").join(", ");
  }
  if(msg)toast(msg);
  if(!stop)notify("Check all ranks finished",notifyMsg||msg);
}

// LP moved since the check before last — what "who is climbing right now" means.
// Across a season break there is no "moved": the account is on a new ladder, and
// treating Diamond→Silver as "▼ −900 LP" is exactly the crash that never happened.
function lastDelta(a){
  const h=a.history||[];
  if(h.length<2)return 0;
  const cur=h[h.length-1], prev=h[h.length-2];
  if(seasonBreak(prev,cur))return 0;
  const now=ladderLP(cur), before=ladderLP(prev);
  return now===null||before===null?0:now-before;
}
function markPlayed(id){
  const a=accounts.find(x=>x.id===id); if(!a)return;
  openMore.delete(id);
  a.lastPlayedAt=Date.now();
  renderCard(id); renderDash(); saveThen("Marked played today");
}
function seasonReset(id){
  const a=accounts.find(x=>x.id===id); if(!a||!a.stats){toast("Nothing to reset");return}
  openMore.delete(id);
  seasonResetCore(a);
  renderCard(id); renderDash(); renderRibbon();
  saveThen("Season reset. The previous rank is in Past seasons");
}
// The data side of a season reset, shared by one account's ⋯ menu and New season.
function seasonResetCore(a){
  const s=a.stats;
  const seasons=normSeasons(s.seasons)||{solo:[],flex:[]};
  if(s.tier&&s.tier!=="UNRANKED"){
    seasons.solo=[{season:"prev",tier:s.tier,division:s.division||null,lp:s.lp??0}].concat(seasons.solo).slice(0,20);
  }
  /* The season peak was copied into the peak set by hand, so it carried on into the
     new season: every card said "Peak Challenger" over a rank it no longer had. A
     season's peak is that season's; its final rank is in Past seasons. */
  delete a.peakManual;
  a.history=a.history||[];
  if(a.history.length){
    a.history.push({t:Date.now(),tier:"UNRANKED",division:null,lp:null,w:0,l:0});
  }
  // Clear live ladder fields explicitly — spreading old stats left flex/lpAt around.
  a.stats={
    found:true,tier:"UNRANKED",division:null,lp:null,wins:0,losses:0,level:s.level??null,
    peak:null,seasons,flex:null,champs:null,lpAt:null,icon:s.icon||null,
    mmr:null,avgRecent:null,uncertain:false,source:null,asOf:"season-reset",
    note:null,updatedAt:Date.now(),seasonResetAt:Date.now()
  };
  a.goal=null;
}
/* New season: the same reset for every ranked account at once, for the day a
   split ends, instead of thirty trips through thirty ⋯ menus. Archived and
   never-ranked accounts are left alone. One Undo puts them all back. */
async function newSeasonAll(){
  const list=accounts.filter(a=>!a.archived&&isRanked(a));
  if(!list.length){toast("No ranked accounts to start a new season for");return}
  if(!await ask({title:"Start a new season for "+list.length+" ranked account"+(list.length===1?"":"s")+"?",
    body:"Each one's current rank moves into its Past seasons, and it shows as not placed yet until a check finds its new rank.",ok:"Start new season"}))return;
  const before=new Map(list.map(a=>[a.id,JSON.parse(JSON.stringify(a))]));
  for(const a of list)seasonResetCore(a);
  render();
  saveThen(list.length+" account"+(list.length===1?"":"s")+" moved to the new season","Undo",()=>{
    accounts=accounts.map(a=>before.has(a.id)?before.get(a.id):a);
    render();saveThen("New season undone");
  });
}
/* This week: the last seven days at a glance — LP gained across the counted
   accounts, games played and who climbed most. Not "since your last visit",
   which the band over the grid already says: the same week however often the
   app is opened. Like Group climb, an account first checked during the week
   counts from that check, and a new season inside the week starts it afresh
   rather than reading as a fall to Iron. */
function weekRecap(pool,now=Date.now()){
  const from=now-7*86400000;
  let lp=0,games=0,moved=0,best=null;
  for(const a of pool||[]){
    const pts=(a.history||[]).filter(h=>+h.t&&+h.t<=now&&ladderLP(h)!=null).sort((x,y)=>x.t-y.t);
    if(!pts.length)continue;
    const last=pts[pts.length-1];
    if(last.t<from)continue; // not checked this week: no telling what it did
    let start=pts[0];
    for(let i=0;i<pts.length;i++){
      if(pts[i].t<=from)start=pts[i];
      else if(i&&seasonBreak(pts[i-1],pts[i]))start=pts[i];
    }
    if(start===last)continue;
    const d=ladderLP(last)-ladderLP(start);
    lp+=d;moved++;
    if(last.w!=null&&last.l!=null&&start.w!=null&&start.l!=null)games+=Math.max(0,(last.w+last.l)-(start.w+start.l));
    if(d>0&&(!best||d>best.d))best={a,d:Math.round(d)};
  }
  return moved?{lp:Math.round(lp),games,moved,best}:null;
}
function poolLpTrend(pool){
  // Average absolute ladder position across the counted pool (same scale as the
  // LP chart: Iron→Challenger). One point per day. Carry each account's last
  // known LP forward so days with different check coverage don't invent climbs.
  const DAY=86400000;
  const keys=[];
  const series=new Map(); // key -> sorted [{t,v}]
  for(const a of pool||[]){
    const key=a.id||a.gameName||("anon-"+keys.length);
    const pts=[];
    for(const h of (a.history||[]).slice(-12)){
      const v=ladderLP(h); if(v==null)continue;
      pts.push({t:Math.floor((+h.t||0)/DAY)*DAY,v});
    }
    if(!pts.length)continue;
    pts.sort((x,y)=>x.t-y.t);
    // last point per day
    const byDay=new Map();
    for(const p of pts)byDay.set(p.t,p.v);
    const dayPts=[...byDay.entries()].sort((x,y)=>x[0]-y[0]).map(([t,v])=>({t,v}));
    keys.push(key); series.set(key,dayPts);
  }
  if(keys.length<1)return null;
  const allT=new Set();
  for(const days of series.values())for(const p of days)allT.add(p.t);
  const timeline=[...allT].sort((a,b)=>a-b);
  if(timeline.length<2)return null;
  // Chained, not a plain average of whoever has a point that day: an account first
  // checked mid-window used to drag the line by its distance from the rest, so
  // adding a Silver account to a Diamond vault read as the group falling 300 LP.
  // Each day moves the line by the average change of the accounts already
  // counted; one that is new that day joins from there, moving nothing.
  const last=new Map();
  const days=[];
  let level=0;
  for(const t of timeline){
    let moved=0; const before=last.size;
    for(const key of keys){
      const hist=series.get(key);
      while(hist.length&&hist[0].t<=t){
        const v=hist[0].v;hist.shift();
        if(last.has(key))moved+=v-last.get(key);
        last.set(key,v);
      }
    }
    if(last.size<1)continue;
    if(!days.length){let sum=0;for(const v of last.values())sum+=v;level=sum/last.size}
    else if(before)level+=moved/before;
    days.push({t,avg:level,n:last.size});
  }
  if(days.length<2)return null;
  const pts=days.map(d=>d.avg);
  const min=Math.min(...pts), max=Math.max(...pts), span=Math.max(1,max-min);
  /* Drawn about the shape of its box: at 160×28 stretched over a wide tile, with a
     dot on every day, it read as a flat dotted line under a climb of +246. Only the
     latest day keeps a visible dot; every day still answers on hover. */
  const w=120,h=34,pad=4;
  const coords=pts.map((v,i)=>{
    const x=pad+(i/(pts.length-1))*(w-pad*2);
    const y=h-pad-((v-min)/span)*(h-pad*2);
    return {x,y,d:days[i],v};
  });
  const poly=coords.map(c=>c.x.toFixed(1)+","+c.y.toFixed(1)).join(" ");
  const delta=Math.round(pts[pts.length-1]-pts[0]);
  // day before month, as on the charts' axes: the tile read "Oct 19 → Nov 8" above
  // a chart marked "8 Nov"
  const fmtDay=t=>dateLabel(t,"year");
  const from=fmtDay(days[0].t), to=fmtDay(days[days.length-1].t);
  const dots=coords.map((c,i)=>{
    const ch=Math.round(c.v-pts[0]);
    const label=fmtDay(c.d.t)+"\n"+(ch>0?"+":ch<0?"−":"±")+fmtN(Math.abs(ch))+" LP since "+fmtDay(days[0].t)+"\n"+c.d.n+" counted account"+(c.d.n===1?"":"s");
    return `<circle class="pool-hit" cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="8" data-spark-tip="${esc(label)}"></circle>`
      +(i===coords.length-1?`<circle class="pool-dot" cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="2.6"></circle>`:"");
  }).join("");
  const svg=`<svg class="pool-spark" viewBox="0 0 ${w} ${h}" width="100%" height="${h}" preserveAspectRatio="none" role="img" aria-label="Average climb of counted accounts from ${esc(from)} to ${esc(to)}"><polyline fill="none" stroke="var(--teal)" stroke-width="1.5" points="${poly}"/>${dots}</svg>`;
  const sign=delta>0?"↑ +":delta<0?"↓ ":"→ ";
  const headline=sign+Math.abs(delta);
  const note=from+" → "+to+" · the average climb of counted accounts; one added later counts from its first check";
  // what fits under a tile: the window; the rest of the sentence is the tile's title
  const window_=from+" → "+to;
  return {svg, note, tip:note, headline, delta, span:window_};
}
// Back-compat for tests that still call the old name.
function poolLpSpark(pool){const t=poolLpTrend(pool);return t?t.svg:""}
function ensureSparkTip(){
  let tip=$("sparkTip");
  if(tip)return tip;
  tip=document.createElement("div");
  tip.id="sparkTip";
  tip.className="spark-tip";
  tip.setAttribute("role","tooltip");
  document.body.appendChild(tip);
  return tip;
}
function hideSparkTip(){
  const tip=$("sparkTip");
  if(tip)tip.classList.remove("on");
}
function bindSparkTip(root){
  if(!root||root._sparkBound)return;
  root._sparkBound=true;
  const show=(el,clientX,clientY)=>{
    const text=el.getAttribute("data-spark-tip");
    if(!text)return;
    const tip=ensureSparkTip();
    tip.textContent=text;
    tip.classList.add("on");
    const pad=12, tw=tip.offsetWidth||160, th=tip.offsetHeight||40;
    let x=clientX+pad, y=clientY-th-8;
    if(x+tw>window.innerWidth-8)x=clientX-tw-pad;
    if(y<8)y=clientY+pad;
    tip.style.left=x+"px";
    tip.style.top=y+"px";
  };
  root.addEventListener("pointerover",e=>{
    const hit=e.target.closest&&e.target.closest("[data-spark-tip]");
    if(hit)show(hit,e.clientX,e.clientY);
  });
  root.addEventListener("pointermove",e=>{
    const hit=e.target.closest&&e.target.closest("[data-spark-tip]");
    if(hit)show(hit,e.clientX,e.clientY);
    else hideSparkTip();
  });
  root.addEventListener("pointerleave",hideSparkTip);
}
let compareIds=[];
/* Comparing is picking two accounts, which is what selecting already does. It was
   its own pick, "⋯ → Compare" on one card and again on another, with "Pick one
   more account to compare (1/2)" in a message that stayed up after the comparison
   had opened. Now "Compare…" selects the card, the bar says to tick one more, and
   the second tick opens the comparison. Any two ticked accounts get a Compare
   button in the bar. `cmpPick` is set while a pick started from the menu is under
   way, so closing the comparison also puts the selection away again. */
let cmpPick=false;
function startCompare(id){
  if(cmpPick&&selected.size===1&&!selected.has(id)){selected.add(id);render();compareSelected();return}
  selected.clear();selected.add(id);lastSelectedId=id;ui.selecting=true;cmpPick=true;
  render();
}
function compareSelected(){
  if(selected.size!==2)return;
  compareIds=[...selected];
  renderCompare();
}
/* A versus screen rather than two loose columns of grey lines: who, at what rank,
   then the same facts side by side on one row each, with the better of a pair
   lit — so the answer to "which one" is where the eye lands, not something read
   off two lists and worked out. */
function renderCompare(){
  const a=accounts.find(x=>x.id===compareIds[0]), b=accounts.find(x=>x.id===compareIds[1]);
  if(!a||!b){compareIds=[];return}
  const side=acc=>{
    const s=acc.stats||{}, url=iconUrl(s), ranked=isRanked(acc);
    const initial=(acc.label||acc.gameName||"?").trim().charAt(0).toUpperCase()||"?";
    const rank=ranked?tierLabel(s):!hasReading(s)?"Never checked":s.found===false?"Not found":notPlaced(acc)?"Not placed yet":"Unranked";
    return `<div class="cmp-side">
      <span class="cmp-pic"><b aria-hidden="true">${esc(initial)}</b>${url?`<img src="${esc(url)}" alt="" loading="lazy" data-ico>`:""}</span>
      <div class="cmp-nm" title="${esc(plainName(acc))}">${nameOf(acc)}</div>
      <div class="cmp-id">${sens(esc(acc.gameName)+"#"+esc(acc.tagLine))} · ${esc(acc.region)}</div>
      <div class="cmp-rk${ranked?"":" q"}" style="color:${tierColor(s.tier)}">${ranked?crest(s.tier,"cmp-crest"):""}<span>${esc(rank)}</span></div>
      <div class="cmp-lp">${ranked&&s.lp!=null?esc(fmtN(s.lp)+" LP"):"&nbsp;"}</div>
    </div>`;
  };
  const facts=acc=>{
    const s=acc.stats||{}, wl=winLoss(s), tr=wrTrend(acc);
    const seen=acc.lastPlayedAt||acc.lastLoginAt||s.updatedAt||0;
    return {
      record:wl.w!=null||wl.l!=null?(wl.w!=null?fmtN(wl.w)+"W":"—")+" "+(wl.l!=null?fmtN(wl.l)+"L":"—"):"—",
      wr:wl.wr, peak:peakInfo(acc).peak||"—", trend:tr?(tr.d>0?"+":"")+tr.d+" pp":"—",
      seen, level:s.level!=null?String(s.level):"—",
    };
  };
  const fa=facts(a), fb=facts(b);
  // -1 left is better, 1 right is, 0 neither (or nothing to compare)
  const cmp=(x,y)=>x==null||y==null||x===y?0:(x>y?-1:1);
  const row=(label,l,r,better)=>`<div class="cmp-row"><span class="${better<0?"win":""}">${esc(l)}</span>`
    +`<span class="k">${esc(label)}</span><span class="${better>0?"win":""}">${esc(r)}</span></div>`;
  const pct=v=>v==null?"—":v+"%";
  setHTML($("cmpBody"),`<div class="cmp">
    <div class="cmp-head">${side(a)}<div class="cmp-vs" aria-hidden="true"><span>VS</span></div>${side(b)}</div>
    <div class="cmp-rows">`
      +row("Record",fa.record,fb.record,0)
      +row("Win rate",pct(fa.wr),pct(fb.wr),cmp(fa.wr,fb.wr))
      +row("Peak",fa.peak,fb.peak,0)
      +row("WR trend",fa.trend,fb.trend,0)
      +row("Level",fa.level,fb.level,0)
      +row("Last played",fa.seen?timeAgo(fa.seen):"never",fb.seen?timeAgo(fb.seen):"never",0)
    +`</div></div>`);
  const modal=$("compareModal");
  if(!modal){compareIds=[];return}
  modal.classList.remove("hidden");
  $("cmpClear").onclick=()=>{closeCompare()};
}


// ---------- filtering / sorting ----------
/* Sixty accounts is the point where "type some letters and see what sticks" stops
   being enough. The operators are the filters that already exist in the toolbar,
   reachable without leaving the keyboard:
     tier:diamond   region:euw   champ:yasuo   role:mid   is:stale|never|flagged|banned|fav|goal|decay|ready|leveling
     >plat  >=plat  <gold  <=gold      (rank at least / below)
   Anything not recognised as an operator stays a plain search term, so a stray
   colon in a note never silently swallows the rest of the query. */
function parseQuery(q){
  const out={terms:[],tier:"",region:"",is:[],min:null,max:null,champ:[],role:""};
  for(const raw of String(q||"").trim().split(/\s+/)){
    if(!raw)continue;
    const tok=raw.toLowerCase();
    let m;
    if((m=/^(?:tier|t):(.+)$/.exec(tok))){
      const t=TIER_ORDER.find(x=>x.toLowerCase().startsWith(m[1]))||(("unranked").startsWith(m[1])?"UNRANKED":null);
      if(t){out.tier=t;continue}
    }
    if((m=/^(?:region|r):(.+)$/.exec(tok))){
      const r=Object.keys(REGIONS).find(x=>x.toLowerCase()===m[1]||x.toLowerCase().startsWith(m[1]));
      if(r){out.region=r;continue}
    }
    // champ:yasuo — played this season (op.gg's list) or in its top mastery
    if((m=/^role:(.+)$/.exec(tok))){
      const r=ROLES.find(x=>x.toLowerCase().startsWith(m[1]))||({mid:"Mid",adc:"Bot",bottom:"Bot",sup:"Support",supp:"Support",jg:"Jungle",jng:"Jungle"})[m[1]];
      if(r){out.role=r;continue}
    }
    if((m=/^(?:champ|c):(.+)$/.exec(tok))){out.champ.push(m[1].replace(/[^a-z0-9]/g,""));continue}
    if((m=/^is:(.+)$/.exec(tok))){
      if(["stale","never","flagged","banned","fav","goal","decay","ready","leveling","unplaced"].includes(m[1])){out.is.push(m[1]);continue}
    }
    if((m=/^(>=|>|<=|<)(.+)$/.exec(tok))){
      const t=TIER_ORDER.find(x=>x.toLowerCase().startsWith(m[2]));
      if(t){
        const i=TIER_ORDER.indexOf(t);
        // ">plat" means "Platinum and up" the way people say it out loud, not
        // "strictly better than every Platinum", so > and >= are the same thing.
        // "<gold" is that mirrored, everything below Gold — but "<=gold" has to
        // take Gold with it, and it was being read as the same query as "<gold".
        if(m[1][0]===">")out.min=i; else out.max=m[1]==="<="?i+1:i;
        continue;
      }
    }
    out.terms.push(tok);
  }
  return out;
}
// forceActive: dash tiles always count the live vault even while browsing Archive.
function passesBaseFilters(a,Q,{forceActive=false}={}){
  Q=Q||parseQuery(ui.search);
  if(forceActive){if(a.archived)return false}
  else{
    if(a.archived&&!ui.showArchived)return false;
    if(ui.showArchived&&!a.archived)return false;
  }
  if(ui.favOnly&&!a.fav)return false;
  if(ui.region&&a.region!==ui.region)return false;
  if(ui.status&&(a.status||"active")!==ui.status)return false;
  if(ui.tag&&!(a.tags||[]).includes(ui.tag))return false;
  if(Q.tier){
    const t=(a.stats&&a.stats.found!==false&&a.stats.tier||"").toUpperCase();
    if(Q.tier==="UNRANKED"?!unrankedTier(a):t!==Q.tier)return false;
  }
  if(Q.region&&a.region!==Q.region)return false;
  if(Q.min!=null||Q.max!=null){
    const i=isRanked(a)?TIER_ORDER.indexOf((a.stats.tier||"").toUpperCase()):-1;
    if(i<0)return false;
    if(Q.min!=null&&i<Q.min)return false;
    if(Q.max!=null&&i>=Q.max)return false;
  }
  if(Q.role&&mainRole(a)!==Q.role)return false;
  for(const c of Q.champ||[]){
    const names=[...(normChamps(a.stats&&a.stats.champs)||[]),...(normMastery(a.mastery)||[])].map(x=>x.name.toLowerCase().replace(/[^a-z0-9]/g,""));
    if(!names.some(n=>n.startsWith(c)))return false;
  }
  for(const f of Q.is){
    if(f==="stale"&&(!isLive(a)||!isStale(a)))return false;
    if(f==="never"&&!neverChecked(a))return false;
    if(f==="flagged"&&!needsAttention(a))return false;
    if(f==="banned"&&a.status!=="banned")return false;
    if(f==="fav"&&!a.fav)return false;
    if(f==="goal"&&!(a.goal&&a.goal.tier))return false;
    if(f==="decay"&&!decayRisk(a))return false;
    if(f==="ready"&&!isReadyForRanked(a))return false;
    if(f==="leveling"&&!isLeveling(a))return false;
    if(f==="unplaced"&&!notPlaced(a))return false;
  }
  if(Q.terms.length){
    // the Riot ID whole as well: "Lunar Echo#EUW", pasted from the client, found nothing
    // while the name and the tag were only ever in here apart
    const hay=[a.label,a.gameName,a.tagLine,a.gameName+"#"+a.tagLine,a.email,a.login,a.notes,noteFieldsText(a),a.createdOn,a.birthdate,
      a.flagged?"flagged attention":"",(a.tags||[]).join(" "),a.stats?(a.stats.tier||"")+" "+(shortRank(a.stats)||""):"",(STATUS[a.status]||STATUS.active).label].join(" ").toLowerCase();
    if(!Q.terms.every(t=>hay.includes(t)))return false;
  }
  return true;
}
function setChoreFlag(flag){
  const next=ui.flag===flag?"":flag;
  ui.flag=next;
  if(next){
    ui.tier="";
    if(ui.showArchived){ui.showArchived=false;syncToggles()}
  }
  render();
}
function setTierFilter(tier){
  const next=ui.tier===tier?"":tier;
  ui.tier=next;
  if(next){
    ui.flag="";
    if(ui.showArchived){ui.showArchived=false;syncToggles()}
  }
  render();
}
// The ribbon's Banned segment. Drives the same ui.status the toolbar dropdown
// does, so the two never disagree — renderFilterOptions puts the select back in
// step on the render below.
function setStatusFilter(status){
  const next=ui.status===status?"":status;
  ui.status=next;
  if(next){
    ui.flag="";ui.tier="";
    if(ui.showArchived){ui.showArchived=false;syncToggles()}
  }
  render();
}
/* The out-of-date view keeps the accounts it opened with until you leave it. Checked
   from there ("Check 2 shown"), each one stopped being out of date and vanished as
   its new rank landed, and the run ended on an empty page; now they stay, updated
   in place. */
let staleHeld=null;
function filtered(){
  const Q=parseQuery(ui.search);
  if(ui.flag!=="stale")staleHeld=null;
  else if(!staleHeld)staleHeld=new Set(accounts.filter(a=>isLive(a)&&isStale(a)).map(a=>a.id));
  let list=accounts.filter(a=>{
    if(!passesBaseFilters(a,Q))return false;
    if(ui.flag==="stale"&&!staleHeld.has(a.id)&&(!isLive(a)||!isStale(a)))return false;
    if(ui.flag==="unchecked"&&!neverChecked(a))return false;
    if(ui.flag==="failed"&&(!isLive(a)||!isFailed(a)))return false;
    if(ui.flag==="attention"&&!needsAttention(a))return false;
    if(ui.flag==="missing"&&(!isLive(a)||!(a.stats&&a.stats.found===false)))return false;
    if(ui.flag==="dup"&&!isDuplicate(a))return false;
    if(ui.flag==="rotate"&&!needsRotation(a))return false;
    if(ui.flag==="decay"&&!decayRisk(a))return false;
    if(ui.flag==="unplaced"&&!notPlaced(a))return false;
    if(ui.tier){
      const t=(a.stats&&a.stats.found!==false&&a.stats.tier||"").toUpperCase();
      if(ui.tier==="UNRANKED"?!unrankedTier(a):t!==ui.tier)return false;
    }
    return true;
  });
  const by={
    rank:(x,y)=>rankValue(y.stats)-rankValue(x.stats),
    name:(x,y)=>(x.label||x.gameName).localeCompare(y.label||y.gameName),
    updated:(x,y)=>((y.stats&&y.stats.updatedAt)||0)-((x.stats&&x.stats.updatedAt)||0),
    // the stamp the Login button leaves ("Last login 3 days ago"): the account you were
    // just on comes first, the ones you never open sink to the bottom
    opened:(x,y)=>openedAt(y)-openedAt(x),
    // the only number that matters on an account that isn't ranked yet
    level:(x,y)=>((y.stats&&y.stats.level)||0)-((x.stats&&x.stats.level)||0),
    change:(x,y)=>lastDelta(y)-lastDelta(x),
    // "Sort by movement" on the away band — the away window's delta, not the
    // last two checks. Falls back to lastDelta once that map has been cleared.
    away:(x,y)=>(awayDelta.get(y.id)||0)-(awayDelta.get(x.id)||0),
    // "LP change" is whatever the last check happened to see, which on an account
    // checked twice in an hour is noise. This is the fortnight's actual trend.
    climb:(x,y)=>{
      const r=a=>{const c=climbRate(a.history);return c?c.lpPerDay:-Infinity};
      return r(y)-r(x);
    }
  }[ui.sort]||((x,y)=>rankValue(y.stats)-rankValue(x.stats));
  list.sort((x,y)=>(y.fav?1:0)-(x.fav?1:0)||by(x,y));
  return list;
}
let awayDelta=new Map();
function openedAt(a){const t=Number(a.lastLoginAt);return Number.isFinite(t)&&t>0?t:0}

// ---------- DOM patching ----------
// Regenerating a card's markup is cheap; throwing its DOM away is not. Replacing
// a node re-runs its entrance animation, makes the browser re-decode the avatar
// <img>, drops the caret out of an open textarea and resets scroll — which is the
// blink that showed after every rank check and on every panel toggle, because
// each of those went through innerHTML on the whole grid. So the new markup is
// parsed off-screen and then patched onto the live tree: a node that still
// belongs in the same slot keeps its identity, and only the differences are
// written. Nothing above this point had to change for it.
function nodeKey(n){return n.nodeType===1?(n.getAttribute("data-k")||n.getAttribute("data-id")||null):null}
function sameKind(a,b){return a.nodeType===b.nodeType&&(a.nodeType!==1||a.tagName===b.tagName)}
/* A field inside a ✎ Rank panel that is currently open. rankPanelHTML is always
   generated from the *saved* stats, so a remorph while the panel is open is a
   render of a state the user has already moved past. */
const RANK_FIELD=/^(tier|div|lp|w|l|ptier|pdiv|plp|gtier|gdiv)$/;
function isLiveRankField(el){
  const rf=el.getAttribute&&el.getAttribute("data-f");
  if(!rf||!RANK_FIELD.test(rf))return false;
  const card=el.closest("[data-id]");
  return !!(card&&openRank.has(card.dataset.id));
}
function morph(from,to){
  if(from.nodeType!==1){if(from.nodeValue!==to.nodeValue)from.nodeValue=to.nodeValue;return}
  const tag=from.tagName;
  /* Checked before the attributes, not after. Protecting only the value left the
     division select's `disabled` up for grabs: pick Master (no divisions up
     there, so the change listener disables it), then let anything at all
     re-render the card — a refresh landing, the flash timeout — and the attribute
     sync put the enabled version from the saved Gold rank straight back. */
  if((tag==="INPUT"||tag==="SELECT")&&isLiveRankField(from)){
    if(tag==="SELECT")morphChildren(from,to);   // new tiers may have appeared
    return;
  }
  for(const at of Array.from(from.attributes))if(!to.hasAttribute(at.name))from.removeAttribute(at.name);
  for(const at of Array.from(to.attributes))if(from.getAttribute(at.name)!==at.value)from.setAttribute(at.name,at.value);
  if(tag==="INPUT"||tag==="TEXTAREA"||tag==="SELECT"){
    // Checkboxes must still sync when focused — shift-select re-renders while the
    // box that was just clicked still has focus, and bailing here left the DOM
    // unticked while `selected` still held the id.
    if(from.type==="checkbox"||from.type==="radio"){from.checked=to.checked;return}
    // Whatever the user is currently typing in is left completely alone, so a
    // render triggered mid-keystroke can't eat the character or move the caret.
    // (Unsaved ✎ Rank fields are handled above, before the attributes: focus
    // alone is not enough, since clicking another control inside the panel would
    // otherwise let the next render wipe the draft back to the saved stats.)
    if(document.activeElement===from)return;
    // Live value lives in the property, not the attribute — once a field is
    // dirty the attribute stops driving it, so it has to be set directly.
    if(tag==="TEXTAREA"){if(from.value!==to.textContent)from.value=to.textContent}
    else if(tag!=="SELECT"&&from.value!==to.value)from.value=to.value;
    if(tag!=="SELECT")return;
    // A <select>'s value is only meaningful once its options exist, so it is set
    // after the children are patched, not before: assigning first meant matching
    // against the *old* option list, and any value that had just been added
    // silently fell back to the first entry.
    morphChildren(from,to);
    if(from.value!==to.value)from.value=to.value;
    return;
  }
  morphChildren(from,to);
}
function morphChildren(from,to){
  const keyed=new Map();
  for(let n=from.firstChild;n;n=n.nextSibling){const k=nodeKey(n);if(k&&!keyed.has(k))keyed.set(k,n)}
  const kept=new Set();
  let cur=from.firstChild;
  for(let want=to.firstChild;want;want=want.nextSibling){
    const k=nodeKey(want);
    let m=null;
    if(k){const c=keyed.get(k);if(c&&!kept.has(c)&&sameKind(c,want)){m=c;keyed.delete(k)}}
    // otherwise the next unclaimed, unkeyed node of the same kind at or after
    // the write cursor — enough to hold structure through panels opening and
    // closing, since the markup is generated in a fixed order
    if(!m)for(let c=cur;c;c=c.nextSibling){
      if(kept.has(c)||nodeKey(c)||!sameKind(c,want))continue;
      m=c;break;
    }
    if(m)morph(m,want);
    else m=want.cloneNode(true);
    kept.add(m);
    if(m===cur)cur=cur.nextSibling;
    else from.insertBefore(m,cur);
  }
  for(let n=from.firstChild;n;){const next=n.nextSibling;if(!kept.has(n))from.removeChild(n);n=next}
}
// Drop-in for `el.innerHTML = html` that patches instead of replacing.
function setHTML(el,html){
  const tmp=el.cloneNode(false);
  tmp.innerHTML=html;
  morphChildren(el,tmp);
}
// The grid is the one place where diffing everything is genuinely expensive. A
// full vault is around 4000 nodes, 150 of them SVG, and a keystroke in the search
// box re-renders the lot — measured at 30 ms for thirty accounts, of which only
// 1.4 ms was generating the markup and 8 ms parsing it. The remaining 20 ms was
// walking the tree to discover that almost nothing had changed.
//
// A card's markup is a pure function of its account and the UI state, so two
// identical strings mean two identical cards. Comparing the string a card was
// last built from is far cheaper than proving the same thing node by node, and a
// card that hasn't changed is left completely alone — which is also the strongest
// possible version of the no-flicker guarantee.
let cardCache=new Map();
/* Cards slide to their new places when the order changes, rather than teleporting.
   This is only possible at all because syncGrid moves the existing nodes instead
   of rebuilding them — the node that was third and is now tenth is the same node,
   so it can be told where it came from.

   The guard matters more than the animation. Measuring rects forces layout, and
   doing that twice over sixty cards on every render would hand back the render
   work this file already did. So it only runs when the *set* is unchanged and only
   the order differs — which is exactly a sort change or a favourite being toggled.
   Typing in the search box changes the set, takes none of this, and stays at the
   three milliseconds it costs today. Both checks are string compares against a
   list we already have; neither touches the DOM. */
function reorderOnly(grid,list){
  const prev=[];
  for(const n of grid.children)if(n.dataset&&n.dataset.id)prev.push(n.dataset.id);
  if(prev.length<2||prev.length!==list.length)return null;
  const now=list.map(x=>x.id);
  const set=new Set(prev);
  if(!now.every(id=>set.has(id)))return null;      // something came or went
  if(!prev.some((id,i)=>id!==now[i]))return null;  // nothing actually moved
  return prev;
}
function flipFrom(grid,before){
  const vh=window.innerHeight||0;
  for(const n of grid.children){
    const id=n.dataset&&n.dataset.id;if(!id)continue;
    const was=before.get(id);if(!was)continue;
    const now=n.getBoundingClientRect();
    // Only what ends up on screen. Measured on sixty cards: reading the rects
    // costs about 3ms, animating the ones you can see costs about 22ms, and
    // animating all sixty costs 72ms — fifty milliseconds of animation nobody is
    // in a position to watch. A card that glides past the fold is not an
    // animation, it is a bill.
    if(now.bottom<0||now.top>vh)continue;
    const dx=was.left-now.left, dy=was.top-now.top;
    if(Math.abs(dx)<1&&Math.abs(dy)<1)continue;
    n.animate([{transform:`translate(${dx.toFixed(1)}px,${dy.toFixed(1)}px)`},{transform:"none"}],
      {duration:380,easing:"cubic-bezier(.22,1,.36,1)"});
  }
}
function syncGrid(grid,list,htmls){
  let before=null;
  if(!prefersReducedMotion()&&typeof Element!=="undefined"&&Element.prototype.animate&&reorderOnly(grid,list)){
    before=new Map();
    for(const n of grid.children)if(n.dataset&&n.dataset.id)before.set(n.dataset.id,n.getBoundingClientRect());
  }
  const have=new Map();
  for(const n of grid.children)if(n.dataset&&n.dataset.id)have.set(n.dataset.id,n);
  const tmp=document.createElement("div");
  const seen=new Set();
  let cur=grid.firstElementChild;
  for(let i=0;i<list.length;i++){
    const id=list[i].id, html=htmls[i];
    let node=have.get(id);
    if(node){
      if(cardCache.get(id)!==html){tmp.innerHTML=html;morph(node,tmp.firstElementChild)}
    }else{
      tmp.innerHTML=html;
      node=tmp.firstElementChild;
    }
    cardCache.set(id,html);
    seen.add(id);
    if(node===cur)cur=cur.nextElementSibling;
    else grid.insertBefore(node,cur);   // moves it if it was already elsewhere
  }
  for(const n of[...grid.children])if(!n.dataset||!seen.has(n.dataset.id))grid.removeChild(n);
  for(const id of[...cardCache.keys()])if(!seen.has(id))cardCache.delete(id);
  if(before)flipFrom(grid,before);
}

// ---------- render ----------
// Every per-card UI flag is keyed by account id and none of them were ever
// cleaned up, so deleting an account left its open panels, its chart period and
// its expanded sections behind forever — invisible, but they accumulate for the
// life of the tab and an armed Delete could outlive the row it was armed on.
function pruneCardState(){
  const live=new Set(accounts.map(a=>a.id));
  // The ⋯ menu is a floating element outside the grid, so nothing else takes it
  // down when the account it belongs to stops existing.
  for(const id of openMore)if(!live.has(id)){closeCardMenu();break}
  for(const s of [selected,openInfo,openLogin,shownPw,openRank,openMore,checking])
    for(const id of [...s])if(!live.has(id))s.delete(id);
  for(const set of [openSec,shutSec])for(const k of [...set])if(!live.has(k.slice(0,k.lastIndexOf("|"))))set.delete(k);
  for(const id of [...chartRange.keys()])if(!live.has(id))chartRange.delete(id);
  for(const id of [...checkGen.keys()])if(!live.has(id))checkGen.delete(id);
  if(compareIds.some(id=>!live.has(id))){
    compareIds=compareIds.filter(id=>live.has(id));
    const m=$("compareModal");
    if(m&&compareIds.length<2)m.classList.add("hidden");
  }
  if(armedDelete&&!live.has(armedDelete))armedDelete=null;
  if(editingNote&&!live.has(editingNote)){editingNote=null;noteDraft=""}
  if(flashId&&!live.has(flashId))flashId=null;
  if(lastSelectedId&&!live.has(lastSelectedId))lastSelectedId=null;
}
/* Safari on iPhone and iPad deletes everything a site stored after seven days
   without a visit, this vault included, and the only word of it was one line in
   Settings → Security. Once there is something to lose, the page says so, once,
   with what to do about it. A Home Screen app keeps its data, but it starts with
   storage of its own, empty, so the vault goes over by backup. Other browsers on
   iOS are left out: the seven-day rule is Safari's. */
function iosSafari(){
  const ua=navigator.userAgent||"";
  const ios=/iP(hone|od|ad)/.test(ua)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
  return ios&&/Safari\//.test(ua)&&!/CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(ua);
}
function installedApp(){
  try{return navigator.standalone===true||matchMedia("(display-mode: standalone)").matches}catch(e){return false}
}
function renderIosBand(){
  const el=$("iosBand");if(!el)return;
  const show=accounts.length>0&&!previewMode&&!cfg.iosHintSeen&&iosSafari()&&!installedApp();
  el.classList.toggle("hidden",!show);
  if(!show||el.childElementCount)return;
  setHTML(el,`<div class="mv-t">${icon("alert")}<span><b>Safari deletes this vault after 7 days without a visit.</b> `
    +`To keep it, add the app to your Home Screen: tap Share, then Add to Home Screen. `
    +`The Home Screen app starts empty, so back up here first and import the backup there.</span></div>`
    +`<div class="mv-acts"><button type="button" class="b-fill" data-ios="backup">Back up now</button>`
    +`<button type="button" class="mv-quiet" data-ios="ok">Got it</button></div>`);
}
function render(){
  pruneCardState();
  $("previewBanner").classList.toggle("hidden",!previewMode);
  renderIosBand();
  $("bDeleteAll").disabled=accounts.length===0;
  // No renderBulkBar() after renderGrid(): it ends with one, against the list it
  // has just built. Calling it again here filtered and sorted the whole vault a
  // second time to reach the same answer, on the hottest path in the app.
  renderRibbon();renderDash();renderSetup();renderTagbar();renderChips();renderFilterOptions();renderGrid();
  renderRun();renderFailbar();
  for(const b of $("density").children){
    const on=b.dataset.density===ui.density;
    b.classList.toggle("on",on);
    b.setAttribute("aria-pressed",on?"true":"false");
  }
}
// `shown` is passed in by renderGrid, which has just built the same list — this
// is called on every filter change and filtered() sorts.
/* Phones show the bulk checkboxes only while selecting: tapping Select starts it,
   Done (the same button) or the bar's Clear ends it and drops the selection. */
function syncSelecting(){
  const on=!!ui.selecting||selected.size>0;
  document.body.classList.toggle("selecting",on);
  const b=$("tSelectMode");if(b){b.setAttribute("aria-pressed",String(on));b.textContent=on?"Done":"Select"}
}
function renderBulkBar(shown){
  const n=selected.size;
  if(cmpPick&&n===0)cmpPick=false;
  syncSelecting();
  $("bulkbar").classList.toggle("hidden",n===0);
  const first=cmpPick&&n===1&&accounts.find(a=>selected.has(a.id));
  $("bulkCount").textContent=first?"Tick one more account to compare with "+plainName(first):n+" selected";
  $("bulkCompare").classList.toggle("hidden",n!==2);
  // mid-pick the bar is the instruction and a way out; status, tags and Delete wait
  $("bulkbar").classList.toggle("cmp-pick",!!first);
  $("bulkClear").textContent=first?"Cancel":"Clear selection";
  // "Select all shown" stayed ticked after the filter under it changed, so it
  // claimed a selection that no longer matched anything on screen — and clicking
  // it then *cleared* rather than selected, because a ticked box unticks first.
  const list=shown||filtered();
  $("tSelectAll").checked=list.length>0&&list.every(a=>selected.has(a.id));
  /* A box ticked by hand changes its own state and nothing else, so the card's
     markup is the same ticked or not and the grid's patch skips it. Clearing the
     selection then left the boxes ticked with nothing selected behind them. */
  for(const b of document.querySelectorAll("#grid .bulkchk")){
    const host=b.closest("[data-id]"), on=!!host&&selected.has(host.dataset.id);
    if(b.checked!==on)b.checked=on;
  }
}

function renderFilterOptions(){
  // Scope the options to whichever view is showing — offering a region or status
  // that only exists on the other side of the archive toggle just yields "no matches".
  const inView=accounts.filter(a=>!!a.archived===ui.showArchived);
  const regions=[...new Set(inView.map(a=>a.region))].sort((a,b)=>a.localeCompare(b));
  if(ui.region&&!regions.includes(ui.region))ui.region="";
  setHTML($("tRegion"),`<option value="">All regions</option>`+regions.map(r=>`<option value="${esc(r)}">${esc(r)}</option>`).join(""));
  // patching options keeps the element, and a <select> the user has touched stops
  // honouring the `selected` attribute — so the value is set outright
  $("tRegion").value=ui.region||"";

  const order=["active","resting","restricted","banned"];
  const statuses=[...new Set(inView.map(a=>a.status||"active"))].sort((a,b)=>order.indexOf(a)-order.indexOf(b));
  if(ui.status&&!statuses.includes(ui.status))ui.status="";
  setHTML($("tStatus"),`<option value="">All statuses</option>`+statuses.map(s=>`<option value="${esc(s)}">${esc((STATUS[s]||STATUS.active).label)}</option>`).join(""));
  $("tStatus").value=ui.status||"";
}

// The floor for the combined numbers. "" is everything, otherwise the lowest tier
// that still counts.
const COMBINED_FLOORS=[
  {v:"",label:"all ranked accounts"},{v:"GOLD",label:"Gold and above"},
  {v:"PLATINUM",label:"Platinum and above"},{v:"EMERALD",label:"Emerald and above"},
  {v:"DIAMOND",label:"Diamond and above"},{v:"MASTER",label:"Master and above"}
];
function inCombined(a){
  if(a.excludeStats)return false;
  const floor=cfg.statsMinTier||"";
  if(!floor)return true;
  const t=TIER_ORDER.indexOf((a.stats&&a.stats.tier||"").toUpperCase());
  return t>=0&&t>=TIER_ORDER.indexOf(floor);
}
// Champions across several accounts, weighted by games rather than by winrate —
// a lucky 100% on two games is not a better champion than a 58% on ninety.
function mergeChampions(pool){
  const agg={};
  (pool||[]).forEach(a=>((a.stats&&a.stats.champs)||[]).forEach(c=>{
    const g=Number(c.games)||0;
    if(!g||!c.name)return;
    const e=agg[c.name]||(agg[c.name]={name:c.name,games:0,wins:0,accs:0});
    // the real win count when a source gave one, rather than re-deriving it from a
    // rounded percentage
    let w=c.wins!=null?Number(c.wins):Math.round((Number(c.wr)||0)/100*g);
    if(!Number.isFinite(w)||w<0)w=0;
    if(w>g)w=g;
    e.games+=g;e.wins+=w;e.accs++;
  }));
  return Object.values(agg).sort((x,y)=>y.games-x.games).slice(0,8)
    .map(c=>({name:c.name,games:c.games,accs:c.accs,wins:c.wins,losses:c.games-c.wins,
      wr:Math.round(c.wins/c.games*100)}));
}
/* The vault at a glance, in the header: a small emblem and a count for each tier
   (each one filters to it), the states that are not ranks as plain words, and "not
   found" (a Riot ID op.gg doesn't know: not entered yet, renamed or mistyped) as
   the one warning, with a way to see them. It was a bar of thick tier-coloured
   blocks with the counts squeezed inside and a caption under it saying the same in
   words: the loudest thing on the page and the least important, with the statuses
   on the same scale as the ranks, so forty unfinished Riot IDs made a red block
   that crushed the ladder beside it. Tiers run best first, the way the list does. */
function renderRibbon(){
  const el=$("ribbon");
  const pool=accounts.filter(a=>!a.archived);
  // Under two accounts there is no spread to show, only one emblem saying "1".
  if(pool.length<2){setHTML(el,"");return}
  const dist={};let unN=0,placeN=0,neverN=0,missN=0,bannedN=0;
  for(const a of pool){
    /* Banned first, and out of the tier counts entirely. The dashboard's Rank
       spread asks the same question and has always answered it with isLive(),
       so a banned Bronze account made the two disagree about how many tiers the
       vault spans — and gave the ribbon a Bronze segment the gem row did not
       have. It is counted on its own instead of vanishing ("1 banned"). */
    if(!isLive(a)){bannedN++;continue}
    // Same predicate as the dash "Never checked" tile / filter.
    if(neverChecked(a)){neverN++;continue}
    if(isRanked(a)){const t=a.stats.tier.toUpperCase();dist[t]=(dist[t]||0)+1}
    else if(notPlaced(a))placeN++;
    else if(isUnrankedAnswer(a))unN++;
    else if(a.stats&&a.stats.found===false)missN++;
  }
  const tiers=TIER_ORDER.slice().reverse().filter(t=>dist[t]);
  // a state of its own, across tiers: a Diamond account can be out of date too.
  // It sat in the toolbar beside Check all; with the others here, the header holds
  // what is wrong and the toolbar what to do about it.
  const staleN=pool.filter(a=>isLive(a)&&isStale(a)).length;
  if(!tiers.length&&!unN&&!placeN&&!missN&&!neverN&&!bannedN&&!staleN){setHTML(el,"");return}
  const plural=n=>n===1?"":"s";
  const tierItem=t=>{const on=ui.tier===t, n=dist[t], name=groupLabel(t);
    return`<button class="rib-i rib-t${on?" on":""}" data-tier="${t}" aria-pressed="${on}"`
      +` title="${esc(name)}: ${n} account${plural(n)}. Click to show only these." aria-label="${esc(name)}, ${n}">${crest(t,"rib-crest")}<b>${n}</b></button>`};
  const word=(attr,on,n,label,why)=>`<button class="rib-i rib-s${on?" on":""}" ${attr} aria-pressed="${on}" title="${esc(why)} Click to show them."`
    +` aria-label="${esc(label.charAt(0).toUpperCase()+label.slice(1))}, ${n}">${n} ${label}</button>`;
  const states=[
    // after a reset, the whole vault; "16 unranked" read as sixteen fresh accounts
    placeN&&word('data-flag="unplaced"',ui.flag==="unplaced",placeN,"not placed yet","Ranked in an earlier season, with placements still to play in this one."),
    unN&&word('data-tier="UNRANKED"',ui.tier==="UNRANKED",unN,"unranked","Checked, and never ranked."),
    neverN&&word('data-flag="unchecked"',ui.flag==="unchecked",neverN,"never checked","No rank read yet."),
    bannedN&&word('data-status="banned"',ui.status==="banned",bannedN,"banned","Marked banned."),
    staleN&&word('data-flag="stale"',ui.flag==="stale",staleN,staleN===1?"needs a refresh":"need a refresh","Last read over 3 days ago.")
      .replace('class="rib-i rib-s','class="rib-i rib-s rib-stale'),
  ].filter(Boolean);
  const missOn=ui.flag==="missing";
  const warn=missN?`<button class="rib-i rib-warn${missOn?" on":""}" data-flag="missing" aria-pressed="${missOn}" aria-label="Not found, ${missN}"`
    +` title="op.gg has no profile for these Riot IDs: not entered yet, renamed, or mistyped.">${icon("alert")}<span>${missN} not found</span><u>${missOn?"Shown":"Show"}</u></button>`:"";
  setHTML(el,`<div class="rib-row" role="group" aria-label="Accounts by tier">${tiers.map(tierItem).join("")}`
    +(states.length?`<span class="rib-states">${states.join("")}</span>`:"")
    +warn+`</div>`);
}
/* Collapsed until asked for on a phone: there the stats were the whole first
   screen, ahead of every account. A choice made with the toggle is kept on any
   screen; until then a phone starts closed and a wider screen open. */
/* A phone held sideways is 844 by 390: wide enough to be laid out as a desktop,
   with the header, the stats and the toolbar's two rows of filters all open, and
   the first card more than two screens down. A screen that short is a phone,
   whichever way up, and gets the phone's layout (see PHONE in the CSS too). */
const PHONE_MQ="(max-width:560px), (max-height:500px) and (orientation:landscape)";
function phoneLayout(){return !!(window.matchMedia&&matchMedia(PHONE_MQ).matches)}
function dashCollapsed(){
  if(typeof cfg.dashCollapsed==="boolean")return cfg.dashCollapsed;
  return phoneLayout();
}
function syncDashToggle(){
  const b=$("bDashToggle");
  const show=accounts.some(a=>!a.archived);
  b.classList.toggle("hidden",!show);
  /* An on/off switch: "Stats", lit while the panel is open. It said "Show stats" or
     "Hide stats" over a chevron, and the button's gap between the two words made
     them read as two loose words. Pressed or not is for a screen reader to say. */
  const on=!dashCollapsed();
  b.classList.toggle("on",on);
  b.setAttribute("aria-pressed",String(on));
  setHTML(b,icon("bars")+`<span class="dt-n">Stats</span>`);
  // its name, for when the narrowest phones show only the icon
  b.setAttribute("aria-label","Stats");
}
function renderDash(){
  applyRankTheme(); // a new best tier is news the dashboard already gets; the colours follow it
  const el=$("dash");
  /* Chore counts use the same toolbar filters as the grid (region/tag/status/…),
     but not the search: that is a quick find, not a scope, and a panel that redrew
     its counts, and its height, on every keystroke moved the search box under the
     typing. Always from the active vault — archived view is exited when a tile is
     clicked. */
  const Q=parseQuery("");
  const countPool=accounts.filter(a=>passesBaseFilters(a,Q,{forceActive:true}));
  const allActive=accounts.filter(a=>!a.archived);
  const filterHint=[ui.region&&ui.region,ui.status&&ui.status,ui.tag&&("#"+ui.tag),ui.favOnly&&"★"].filter(Boolean).join(" · ");
  syncDashToggle();
  if(!allActive.length){hideSparkTip();el.innerHTML="";return}
  if(dashCollapsed()){hideSparkTip();el.innerHTML="";return}
  const ranked=countPool.filter(a=>isLive(a)&&a.stats&&a.stats.found!==false&&a.stats.tier&&a.stats.tier.toUpperCase()!=="UNRANKED");
  const pool=ranked.filter(inCombined);
  /* "Counting: all ranked accounts ▾ / 3 of 3 ranked" headed the panel, a control
     nobody could make sense of, on every vault, including the many where it could
     not change a thing. It is a footnote now that reads as one ("Figures from all
     5 ranked accounts"), each choice says how many accounts it keeps, and it only
     shows when there is a choice to make, or one already made to undo. */
  const handOutN=ranked.filter(a=>a.excludeStats).length;
  const tierAt=a=>TIER_ORDER.indexOf((a.stats.tier||"").toUpperCase());
  const floorN=f=>ranked.filter(a=>!a.excludeStats&&(!f||tierAt(a)>=TIER_ORDER.indexOf(f))).length;
  const curFloor=cfg.statsMinTier||"", allN=floorN("");
  const floors=COMBINED_FLOORS.filter(f=>!f.v||f.v===curFloor||(floorN(f.v)>0&&floorN(f.v)<allN));
  const scopeShown=floors.length>1||!!curFloor||handOutN>0;
  let W=0,L=0;
  pool.forEach(a=>{W+=Number(a.stats.wins)||0;L+=Number(a.stats.losses)||0});
  const wr=(W+L)>0?Math.round(W/(W+L)*100)+"%":"—";
  const topChamps=mergeChampions(pool);
  const neverN=countPool.filter(neverChecked).length;
  const attentionN=countPool.filter(needsAttention).length;
  let bk="";
  if(hasStorage){
    const remindDays=clampExportDays(cfg.exportRemindDays);
    if(!cfg.lastExport)bk="No backup yet.";
    else if(Date.now()-cfg.lastExport>remindDays*24*3600*1000)bk="Last backup "+Math.floor((Date.now()-cfg.lastExport)/86400000)+" days ago.";
  }
  const dupN=countPool.filter(isDuplicate).length;
  const rotN=countPool.filter(needsRotation).length;
  const decayN=countPool.filter(decayRisk).length;
  const next=playNext(countPool);
  const poolTrend=poolLpTrend(pool), week=weekRecap(pool);
  /* Said once, and only when there is something to say. The panel used to repeat
     the header and the toolbar: Accounts (the header's caption says it), Best
     account (so does the caption, now with the name), Rank spread (the header bar,
     whose segments filter the same way) and Needs refresh (the toolbar's "N need
     a refresh" and its Refresh stale button). Regions was a count nobody acts on.
     What stays is the season, what to play, and what needs you — and a figure
     with nothing behind it yet (0W 0L, a climb with one day of history) waits
     until it has something. */
  const cells=[
    (W+L)>0&&`<div class="stat"><div class="k">Season W/L</div><div class="v nw">${fmtN(W)}<small>W</small> ${fmtN(L)}<small>L</small></div>
      <div class="s-note">${wr} WR · ${pool.length} counted account${pool.length===1?"":"s"}</div></div>`,
    // "Never checked" is a word in the header line, which filters the same way, so
    // it has no tile here. Flagged is amber: a reminder you left, not an alarm.
    attentionN&&`<button class="stat stat-b${ui.flag==="attention"?" on":""}" data-flag="attention" aria-pressed="${ui.flag==="attention"}"><div class="k">Flagged</div>
      <div class="v" style="color:var(--warn-txt)">${attentionN}</div><div class="s-note">marked by you · click to see them</div></button>`,
    dupN&&`<button class="stat stat-b${ui.flag==="dup"?" on":""}" data-flag="dup" aria-pressed="${ui.flag==="dup"}"><div class="k">Duplicate IDs</div>
      <div class="v" style="color:var(--danger)">${dupN}</div><div class="s-note">same name#tag on one region</div></button>`,
    /* The reason leads and the account follows: "Decays in 3 days", then "Main",
       reads at a glance. Named "Play next" with the name first, the tile only made
       sense once you knew why it had picked that account. */
    next&&`<button class="stat stat-b s-next" data-next="${idAttr(next.a.id)}" title="Show this account"><div class="k">Suggested game</div>
      <div class="v">${esc(next.why)}</div><div class="s-note">${nameOf(next.a)}</div></button>`,
    // Suggested game already names the one account at decay risk and when it decays;
    // a tile saying "1" beside it only says it again. Two or more, and it filters.
    decayN&&!(decayN===1&&next&&decayRisk(next.a))&&`<button class="stat stat-b${ui.flag==="decay"?" on":""}" data-flag="decay" aria-pressed="${ui.flag==="decay"}" title="Diamond and up with a week or less of decay protection left, estimated from the games seen between checks"><div class="k">Decay risk</div>
      <div class="v" style="color:var(--warn)">${decayN}</div><div class="s-note">a week or less banked · play a ranked game</div></button>`,
    rotN&&`<button class="stat stat-b${ui.flag==="rotate"?" on":""}" data-flag="rotate" aria-pressed="${ui.flag==="rotate"}"><div class="k">Idle</div>
      <div class="v">${rotN}</div><div class="s-note">14+ days without a game, login or check</div></button>`,
    week&&(()=>{
      /* Two LP figures sat side by side here, +286 this week and +246 for the group,
         and read as a contradiction: this one is a total across the accounts, the
         group's is an average per account over a longer stretch. Each says which. */
      const note="total of "+week.moved+" account"+(week.moved===1?"":"s")
        +(week.games?" · "+week.games+" game"+(week.games===1?"":"s"):"")
        +(week.best?" · best "+nameOf(week.best.a)+" +"+week.best.d:"");
      const inner=`<div class="k">This week</div><div class="v">${week.lp>0?"+":week.lp<0?"−":""}${fmtN(Math.abs(week.lp))} <small>LP</small></div><div class="s-note">${note}</div>`;
      return week.best?`<button class="stat stat-b" id="weekStat" data-next="${idAttr(week.best.a.id)}" title="The last seven days across the counted accounts. Click to see the best climber">${inner}</button>`
        :`<div class="stat" id="weekStat" title="The last seven days across the counted accounts">${inner}</div>`;
    })(),
    poolTrend&&`<div class="stat" id="ladderTrendStat" title="${esc(poolTrend.note)}">
      <div class="k">Average climb</div>
      <div class="v">${esc(poolTrend.headline)} <small>LP</small></div>
      <div class="v spark-wrap">${poolTrend.svg}</div>
      <div class="s-note">per account · ${esc(poolTrend.span)}</div></div>`,
  ].filter(Boolean);
  const bkNote=bk&&accounts.length&&!previewMode&&!(setupVisible()&&!cfg.lastExport)?`<div class="bk-note">${icon("archive")}<span>${bk}</span><button type="button" id="bkNow">Back up now</button></div>`:"";
  // nothing to show: no panel, and no Hide stats button for an empty one
  $("bDashToggle").classList.toggle("hidden",!cells.length&&!topChamps.length);
  if(!cells.length&&!topChamps.length){hideSparkTip();setHTML(el,bkNote);dashJustOpened=false;wireBkNow(el);return}
  setHTML(el,`
  <div class="hx${dashJustOpened?" dash-in":""}" style="margin-bottom:16px"><div class="hx-in">
  ${cells.length?`<div class="dash">${cells.join("")}</div>`:""}
  ${topChamps.length?`<div class="dist"${cells.length||ranked.length?' style="border-top:1px solid var(--line)"':""}><span class="k">Most played</span>${
    // Sorted by games, so "Best" was the wrong word: a 44% champion sat in it.
    // And 4-4 is not a good record yet; green waits for ten games.
    topChamps.map(c=>`<span class="gem cmb" title="${esc(c.games)} games across ${esc(c.accs)} account${c.accs===1?"":"s"}">`
      +`<span class="n">${esc(c.name)}</span>`
      +`<b class="${c.wr>=50&&c.games>=10?"wr-good":""}">${esc(c.wr)}%</b>`
      +`<i class="g">${esc(wlText(c.wins,c.losses))}</i></span>`).join("")}</div>`:""}
  ${scopeShown?`<div class="dash-scope"><label for="dashMin">Figures from</label>
    <select id="dashMin">${floors.map(f=>{const n=floorN(f.v);
      return`<option value="${f.v}"${curFloor===f.v?" selected":""}>${f.v?esc(f.label)+" ("+n+")":"all "+n+" ranked account"+(n===1?"":"s")}</option>`}).join("")}</select>
    ${handOutN||filterHint?`<span class="dash-ex">${[handOutN?handOutN+" left out in their account settings":"",filterHint?esc(filterHint):""].filter(Boolean).join(" · ")}</span>`:""}
  </div>`:""}
  </div></div>
  ${bkNote}`);
  dashJustOpened=false; // consumed by the render above
  bindSparkTip(el);
  wireBkNow(el);
  balanceDash();
}
/* The reminder said "hit Export" — and Export lives two clicks away, inside the
   ⋯ menu at the other end of the header. The way to act on it is now on it:
   encrypted when there is a master password to encrypt with, plaintext (which
   asks first whenever logins are in it) when there is not. */
function wireBkNow(el){
  const bkNow=el.querySelector("#bkNow");
  if(bkNow)bkNow.onclick=()=>{vaultPassword?doExportEnc():doExport()};
}
/* The figures are a grid that fits as many as it can per row, and how many there
   are depends on the vault (six to eleven). Eight at 1024px came out six and two:
   two tiles under a row of six, four empty cells beside them. Instead: as few rows
   as the width needs, and the figures shared evenly across them — four and four. */
function dashCols(n,width,min){
  if(!n||!width)return 0;
  const most=Math.max(1,Math.floor(width/min)), rows=Math.ceil(n/most);
  return Math.ceil(n/rows);
}
function balanceDash(){
  const d=document.querySelector("#dash .dash");
  if(!d)return;
  const tiles=[...d.children];
  const narrow=!!(window.matchMedia&&matchMedia("(max-width:720px)").matches); // the .dash rule's own minimum there
  // a phone lays the figures in one sliding row: one row, so only the first has no rule before it
  const strip=phoneLayout();
  const cols=strip?tiles.length:dashCols(tiles.length,d.clientWidth,narrow?140:158);
  if(!cols){d.style.removeProperty("--cols");return}
  d.style.setProperty("--cols",cols);
  // the hairline between tiles belongs inside a row, not down the left edge of one
  tiles.forEach((t,i)=>t.classList.toggle("rs",i%cols===0));
}
if("ResizeObserver"in window)new ResizeObserver(()=>balanceDash()).observe($("dash"));
else window.addEventListener("resize",balanceDash);

/* Every tag in the vault, as a row of chips above the grid. On a vault with one
   tag on one account that is a single word floating in its own band, and on a
   vault with twenty it is a wall — either way it was taking a full row on every
   screen to answer a question nobody had asked yet.
   Folded behind its own count instead. The chip for whatever tag is currently
   filtering stays out where you can see it and switch it off, because a filter
   you cannot see is the one thing this bar must never become. */
function renderTagbar(){
  const all=[...new Set(accounts.filter(a=>!!a.archived===ui.showArchived).flatMap(a=>a.tags||[]))].sort((a,b)=>a.localeCompare(b));
  if(ui.tag&&!all.includes(ui.tag))ui.tag=null;
  const el=$("tagbar");
  if(!all.length){setHTML(el,"");return}
  const open=!!cfg.tagsOpen;
  const chip=t=>`<button class="chip${ui.tag===t?" on":""}" data-k="tag:${esc(t)}" data-tag="${esc(t)}"
    aria-pressed="${ui.tag===t}">${esc(t)}</button>`;
  /* Folded, this is a handle and nothing else — no chip for the active tag out
     here beside it. The console's own filter chips already carry "Tag: jungle ✕"
     whenever one is filtering, so the rule that a filter must always be visible
     and removable is kept there rather than paid for twice. The handle only
     lights up to say one is on. */
  // Mark first, then what it is, then how many, then the way to open it. Every
  // other control in this row carries a colour or a glyph; this was the one
  // reading as a grey rectangle.
  setHTML(el,`<button class="tag-handle${open?" open":""}${ui.tag?" lit":""}" data-k="tagtoggle" data-tagtoggle
      aria-expanded="${open}" title="${open?"Hide the tag list":"Show every tag in the vault"}">`
    // with a tag picked it names it: "Tags 6" lit up said a tag was on, not which
    +icon("tag","tag-ico")+(ui.tag?`<span>#${esc(ui.tag)}</span>`:`<span>Tags</span><b>${all.length}</b>`)+icon("chevron","tag-chev")+`</button>`
    +(open?`<div class="tag-list" data-k="taglist">${all.map(chip).join("")}</div>`:""));
}
// A number in a dashboard always raises "which ones?", so the stats panel sets
// these — and they have to be visible and removable, or the grid just looks
// mysteriously short.
const FLAG_LABEL={stale:"Needs refresh",unchecked:"Never checked",failed:"Last check failed",attention:"Flagged",missing:"Not found",dup:"Duplicate IDs",rotate:"Idle 14+ days",unplaced:"Not placed yet"};
function renderChips(){
  syncFilterCount();
  const out=[];
  if(ui.flag)out.push(["flag",FLAG_LABEL[ui.flag]||ui.flag]);
  if(ui.tier)out.push(["tier",ui.tier==="UNRANKED"?"Unranked":ui.tier.charAt(0)+ui.tier.slice(1).toLowerCase()]);
  if(ui.tag)out.push(["tag","Tag: "+ui.tag]);
  if(ui.favOnly)out.push(["favOnly","Favorites"]);
  // no chip for the search: the box already says what is in it
  setHTML($("chips"),!out.length?"":out.map(([k,label])=>
    `<button class="fchip" data-clear="${k}" aria-label="${esc(label)}, clear">${esc(label)}${icon("x")}</button>`).join("")
    // two have an x each; Clear all earns its room from three
    +(out.length>2?`<button class="fchip fchip-all" data-clear="all">Clear all</button>`:""));
}

// Everything the profile page carries that isn't the current rank: how the account
// finished previous seasons, its flex rank, and the champions it actually plays.
// Returns "" when a check has never brought any of it back, which is also what the
// Info button keys off — no point offering a panel with nothing in it.
// Normalised on the way out as well as on the way in: a vault saved before
// applyStats started shaping these — or one restored from someone else's export —
// must not be able to throw inside a render.
function infoParts(a){
  const s=a.stats||{};
  const seasons=normSeasons(s.seasons)||{solo:[],flex:[]};
  return {solo:seasons.solo,flexHist:seasons.flex,
    champs:normChamps(s.champs)||[],flex:normPeak(s.flex)};
}
/* ---- recent form ----
   The last five ranked solo games, from the worker's /form (Riot's match-v5). Only
   an account the worker has read through Riot carries a puuid, so that is the
   test. Fetched when an account's Details open, never in a batch: each costs six
   Riot calls, against a personal key's hundred per two minutes. */
const formCache=new Map(), FORM_TTL=5*60*1000;
function canForm(a){return !!(a&&cfg.backendUrl&&validPuuid(a.puuid))}
async function loadForm(id){
  const acc=accounts.find(a=>a.id===id);
  if(!acc||!canForm(acc))return;
  const had=formCache.get(id);
  if(had&&(had.state==="loading"||had.state==="ok"&&Date.now()-had.at<FORM_TTL))return;
  formCache.set(id,{state:"loading"});
  let next;
  try{
    const u=new URL(cfg.backendUrl);
    u.pathname=u.pathname.replace(/\/?$/,"/form");u.search="";
    u.searchParams.set("puuid",acc.puuid);
    u.searchParams.set("region",(REGIONS[acc.region]||REGIONS.EUW).opgg);
    const c=new AbortController();const t=setTimeout(()=>c.abort(),20000);
    const res=await fetch(u.href,{signal:c.signal}).finally(()=>clearTimeout(t));
    const d=await res.json().catch(()=>null);
    if(res.ok&&d&&Array.isArray(d.games)){
      const games=d.games.slice(0,5).filter(g=>g&&typeof g==="object").map(g=>({win:g.win===true,
        champ:String(g.champ||"?").slice(0,24),role:ROLES.includes(g.role)?g.role:null,kda:[g.k,g.d,g.a].map(n=>Number.isFinite(n)?n:"?").join("/"),
        min:Number.isFinite(g.min)?g.min:null,at:Number.isFinite(g.at)?g.at:null}));
      next={state:"ok",games,at:Date.now()};
      const keep=accounts.find(a=>a.id===id);
      if(keep&&!previewMode){keep.recent=normRecent({at:Date.now(),games});if(!keep.recent)delete keep.recent;saveDB()}
    }else next={state:"error",msg:res.status===503?"Riot's rate limit. Try again in a minute"
      :res.status===404?"Your worker has no Riot API key, or is an older version"
      :"Could not load them"+(d&&d.error?" ("+String(d.error).slice(0,80)+")":"")};
  }catch(e){next={state:"error",msg:"Could not reach your worker"}}
  formCache.set(id,next);
  if(accounts.some(a=>a.id===id))renderCard(id);
}
function formHTML(a){
  if(!canForm(a))return"";
  const f=formCache.get(a.id);
  const flat=body=>`<div class="sec flat" data-k="sec-form"><span class="sec-n">Last 5 ranked</span>${body}</div>`;
  if(!f||f.state==="loading")return flat(`<span class="sec-p">Loading…</span>`);
  if(f.state==="error")return flat(`<span class="sec-p" title="${esc(f.msg)}">${esc(f.msg)}</span>`
    +`<button class="fm-retry" data-act="formretry">Retry</button>`);
  if(!f.games.length)return flat(`<span class="sec-p">No ranked games yet this season</span>`);
  const w=f.games.filter(g=>g.win).length;
  const pips=`<span class="fm-pips" aria-hidden="true">${f.games.map(g=>`<i class="fm-pip${g.win?" w":""}"></i>`).join("")}</span>`;
  return secHTML(a,"form","Last 5 ranked",f.games.length,`${wlText(w,f.games.length-w)}${pips}`,
    f.games.map(g=>`<div class="chp">`
      +`<span class="c-nm"><b class="fm-res${g.win?" w":""}">${g.win?"W":"L"}</b>${esc(g.champ)}</span>`
      +`<span class="c-kd">${esc(g.kda)}</span>`
      +`<span class="c-gm">${g.min!=null?esc(g.min)+" min":""}</span>`
      +`<span class="c-gm">${g.at?esc(timeAgo(g.at)):""}</span></div>`).join(""));
}
/* ---- champion art ----
   From Riot's Data Dragon, which serves splash art by champion id ("MonkeyKing",
   "Kaisa"), not by the name people see. Most names map by squeezing out spaces
   and punctuation; the ones that do not are listed. An <img loading="lazy"> and
   not a CSS background, so a card far down the page fetches nothing until it is
   near the screen, and one that fails to load is simply removed. */
const DD="https://ddragon.leagueoflegends.com", DD_ID=/^[A-Za-z][A-Za-z0-9]{1,29}$/;
const CHAMP_ID_FIX={"wukong":"MonkeyKing","nunu & willump":"Nunu","renata glasc":"Renata","kai'sa":"Kaisa","cho'gath":"Chogath",
  "vel'koz":"Velkoz","kha'zix":"Khazix","bel'veth":"Belveth","leblanc":"Leblanc","fiddlesticks":"Fiddlesticks"};
function champKey(name){
  const n=String(name||"").trim().replace(/[\u2018\u2019\u02bc]/g,"'"); // Kai’Sa is Kai'Sa
  if(!n||!/^[A-Za-z0-9 '.&-]+$/.test(n))return null; // what champion names are made of, and nothing else
  const fixed=CHAMP_ID_FIX[n.toLowerCase()];if(fixed)return fixed;
  const k=n.split(/[^A-Za-z0-9]+/).filter(Boolean).map(w=>w[0].toUpperCase()+w.slice(1)).join("");
  return DD_ID.test(k)?k:null;
}
let pendingChampArt=null;
function champArtOn(){return pendingChampArt===null?cfg.champArt!==false:pendingChampArt}
function mainChamp(a){const c=normChamps(a.stats&&a.stats.champs);return c&&c.length?c[0].name:null}
/* A pick of your own outranks the most-played champion: {champ, skin, name}.
   The champion is a Data Dragon id of exactly the shape champKey makes and the
   skin a plain number, because both go straight into an image URL; the name is
   only ever shown, through esc(). */
function normArt(v){
  if(!v||typeof v!=="object"||Array.isArray(v))return null;
  const skin=Number(v.skin);
  if(typeof v.champ!=="string"||!DD_ID.test(v.champ)||!Number.isInteger(skin)||skin<0||skin>9999)return null;
  const out={champ:v.champ,skin};
  const n=typeof v.name==="string"?v.name.replace(/\s+/g," ").trim().slice(0,80):"";
  if(n)out.name=n;
  return out;
}
function artOf(a){
  const own=normArt(a&&a.art);if(own)return own;
  const k=champKey(mainChamp(a));
  return k?{champ:k,skin:0}:null;
}
const splashUrl=(c,n)=>DD+"/cdn/img/champion/splash/"+c+"_"+n+".jpg";
const apPortraitUrl=(c,n)=>DD+"/cdn/img/champion/loading/"+c+"_"+n+".jpg";
/* How strongly the art shows, in percent: one value for every card
   (cfg.artOpacity), and any card can have its own (a.artOp). 0 hides it — and
   then nothing is fetched for that card either. */
const ART_OP_DEFAULT=28, ART_OP_MAX=60;
function normArtOp(v){const n=Number(v);return v!=null&&v!==""&&Number.isInteger(n)&&n>=0&&n<=ART_OP_MAX?n:null}
function artOpGlobal(){const n=normArtOp(cfg.artOpacity);return n==null?ART_OP_DEFAULT:n}
function artOpOf(a){const own=normArtOp(a&&a.artOp);return own==null?artOpGlobal():own}
function applyArtOpacity(){
  const r=document.documentElement.style, n=artOpGlobal();
  if(n===ART_OP_DEFAULT)r.removeProperty("--art-op");else r.setProperty("--art-op",String(n/100));
}
function champArtHTML(a){
  if(!champArtOn()||!artOpOf(a))return"";
  const art=artOf(a);if(!art)return"";
  const own=normArtOp(a.artOp);
  return`<img class="c-art" src="${splashUrl(art.champ,art.skin)}"${own!=null?` style="--art-op:${own/100}"`:""} alt="" aria-hidden="true" loading="lazy" decoding="async" referrerpolicy="no-referrer">`;
}
/* ---- Data Dragon: the champion list and each champion's skins ----
   Riot's public static data, the same place the splash art comes from. Fetched
   only when the picker opens, kept for the session, and a failure is forgotten
   rather than cached so Try again means it. Everything read out of it is checked
   for shape before it reaches a URL or the page. */
const dd={ver:null,champs:null,skins:new Map()};
function ddJSON(url){
  return fetch(url,{credentials:"omit",referrerPolicy:"no-referrer"})
    .then(r=>{if(!r.ok)throw new Error("Data Dragon answered "+r.status);return r.json()});
}
function ddVersion(){
  return dd.ver||(dd.ver=ddJSON(DD+"/api/versions.json").then(v=>{
    const x=Array.isArray(v)?v.find(s=>typeof s==="string"&&/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(s)):null;
    if(!x)throw new Error("Data Dragon sent no version");
    return x;
  }).catch(e=>{dd.ver=null;throw e}));
}
function ddChampions(){
  return dd.champs||(dd.champs=ddVersion().then(ver=>ddJSON(DD+"/cdn/"+ver+"/data/en_US/champion.json").then(j=>{
    const list=Object.values(j&&typeof j.data==="object"&&j.data||{})
      .filter(c=>c&&typeof c.id==="string"&&DD_ID.test(c.id)&&typeof c.name==="string"&&c.name.trim())
      .map(c=>({id:c.id,name:c.name.trim().slice(0,40)}))
      .sort((x,y)=>x.name.localeCompare(y.name));
    if(!list.length)throw new Error("Data Dragon sent no champions");
    return{ver,list};
  })).catch(e=>{dd.champs=null;throw e}));
}
function ddSkins(id){
  if(!DD_ID.test(String(id)))return Promise.reject(new Error("not a champion id"));
  if(!dd.skins.has(id))dd.skins.set(id,ddVersion().then(ver=>ddJSON(DD+"/cdn/"+ver+"/data/en_US/champion/"+id+".json")).then(j=>{
    const c=j&&j.data&&j.data[id], seen=new Set();
    const all=(c&&Array.isArray(c.skins)?c.skins:[])
      .filter(s=>s&&Number.isInteger(s.num)&&s.num>=0&&s.num<=9999&&!seen.has(s.num)&&seen.add(s.num))
      .map(s=>({num:s.num,parent:s.parentSkin,name:s.num===0?"":String(s.name||"").replace(/\s+/g," ").trim().slice(0,80)}));
    /* The list also carries chromas and forms sold on their own — "Lunar Empress
       Lux (Ruby)", "Elementalist Lux (Fire)" — which have no splash or portrait
       of their own: blank tiles that would put a blank card behind the account.
       Riot marks some with parentSkin; the rest are named "<a skin> (<variant>)".
       A year in brackets is a re-release with art of its own ("Prestige K/DA
       Akali (2022)"), and anything that still has no picture leaves the grid
       when its portrait fails to load (see the error handler on #apGrid). */
    const names=new Set(all.map(s=>s.name.toLowerCase()));
    const variant=s=>{const m=/^(.+) \(([^()]+)\)$/.exec(s.name);return!!m&&names.has(m[1].toLowerCase())&&!/^\d{4}$/.test(m[2])};
    const out=all.filter(s=>s.parent==null&&!variant(s)).map(s=>({num:s.num,name:s.name}));
    if(!out.some(s=>s.num===0))out.unshift({num:0,name:""});
    return out.sort((x,y)=>x.num-y.num);
  }).catch(e=>{dd.skins.delete(id);throw e}));
  return dd.skins.get(id);
}
/* ---- card art picker ----
   Champion first, then skin, the way the client's own collection screen goes:
   the splash large across the top so you can see what you are picking, which
   is the one thing the faint art on a card can't show you. */
const ap={id:null,champ:null,skin:0,name:"",view:"champs",q:"",champs:null,ver:null,skins:null,err:null,gen:0,focusTile:false};
function apAcc(){return ap.id==null?null:accounts.find(a=>a.id===ap.id)||null}
function apChampName(id){const c=ap.champs&&ap.champs.find(x=>x.id===id);return c?c.name:id}
// What the selection is called: the skin's own name, or the champion's for the default
function apLabel(){
  if(ap.skin===0)return apChampName(ap.champ);
  const s=ap.skins&&ap.skins.find(x=>x.num===ap.skin);
  return s&&s.name||ap.name||apChampName(ap.champ);
}
function openArtPicker(id){
  const acc=accounts.find(a=>a.id===id);if(!acc)return;
  const own=normArt(acc.art), auto=champKey(mainChamp(acc));
  const start=own||(auto?{champ:auto,skin:0}:null);
  Object.assign(ap,{id,champ:start?start.champ:null,skin:start?start.skin:0,name:own&&own.name||"",
    view:start?"skins":"champs",q:"",skins:null,err:null,gen:ap.gen+1,focusTile:!!start,
    picked:false,op:artOpOf(acc),opAll:normArtOp(acc.artOp)==null,opTouched:false});
  $("apOp").value=String(ap.op);$("apOpAll").checked=ap.opAll;
  $("apPrev").dataset.k="";
  $("apSearch").value="";
  $("apSub").innerHTML=nameOf(acc);
  $("apHero").dataset.k="";
  renderArtPicker();
  $("artPicker").classList.remove("hidden");
  apLoad();
}
function closeArtPicker(){
  const m=$("artPicker");if(!m)return;
  ap.gen++;ap.id=null; // anything still loading lands nowhere
  m.classList.add("hidden");
}
function apLoad(){
  const g=ap.gen;
  if(!ap.champs)ddChampions().then(r=>{if(g!==ap.gen)return;ap.champs=r.list;ap.ver=r.ver;ap.err=null;renderArtPicker()},
    e=>{if(g!==ap.gen)return;ap.err=e;renderArtPicker()});
  if(ap.view==="skins"&&ap.champ)apLoadSkins();
}
function apLoadSkins(){
  const g=ap.gen, c=ap.champ;
  ap.skins=null;
  ddSkins(c).then(list=>{if(g!==ap.gen||c!==ap.champ)return;ap.skins=list;ap.err=null;
    // a pick saved from a skin since removed falls back to the default rather than to nothing
    // a pick saved from a skin since removed (or a chroma, which 2.3.1 stopped
    // offering) falls back to the default — and that counts as a change, so Save
    // can put art back on a card that has been showing none
    if(!list.some(s=>s.num===ap.skin)){ap.skin=0;ap.name="";const own=normArt(apAcc()&&apAcc().art);if(own&&own.champ===c)ap.picked=true}
    renderArtPicker()},
    e=>{if(g!==ap.gen||c!==ap.champ)return;ap.err=e;renderArtPicker()});
}
function apHero(){
  const el=$("apHero"), acc=apAcc();
  if(!ap.champ){
    if(el.dataset.k!=="-"){el.dataset.k="-";el.innerHTML=`<div class="ap-empty"><div>${icon("image")}Pick a champion below</div></div>`}
    return;
  }
  const k=ap.champ+"_"+ap.skin;
  /* The picture is only swapped when the pick changes, so the fade plays once
     per choice instead of flickering on every repaint around it.
     A splash is a few hundred KB and took a couple of seconds on a tablet, with
     the banner blank meanwhile. Now nothing waits on it: the skin's portrait —
     already fetched for its tile — fills the banner at once, blurred, the last
     splash stays under it, and the new splash fades in over both when it lands. */
  if(el.dataset.k!==k){
    el.dataset.k=k;
    const empty=el.querySelector(".ap-empty");if(empty)empty.remove();
    let meta=el.querySelector(".ap-meta");
    if(!meta){meta=document.createElement("div");meta.className="ap-meta";el.appendChild(meta)}
    const under=[...el.querySelectorAll("img")];
    const layer=(cls,src)=>{
      const i=document.createElement("img");
      i.className=cls;i.alt="";i.decoding="async";i.referrerPolicy="no-referrer";
      i.addEventListener("load",()=>i.classList.add("ld"));
      el.insertBefore(i,meta);i.src=src;
      return i;
    };
    const ph=layer("ap-ph",apPortraitUrl(ap.champ,ap.skin));
    ph.addEventListener("error",()=>ph.remove());
    const img=layer("ap-sp",splashUrl(ap.champ,ap.skin));
    try{img.fetchPriority="high"}catch(e){} // ahead of the grid's portraits
    const settle=keepPh=>setTimeout(()=>{for(const o of under)o.remove();if(!keepPh)ph.remove()},450);
    img.addEventListener("load",()=>settle(false));
    // No splash (offline, or a skin Riot hasn't published art for): the portrait
    // stays as the banner, and the caption over it still says what is picked
    img.addEventListener("error",()=>{img.remove();settle(true)});
  }
  const shown=acc&&artOf(acc), own=acc&&normArt(acc.art);
  const onCard=!!shown&&shown.champ===ap.champ&&shown.skin===ap.skin;
  el.querySelector(".ap-meta").innerHTML=
    (onCard?`<span class="ap-badge">${icon("check")}${own?"On the card now":"On the card now · most-played"}</span>`:"")
    +`<div class="ap-cap"><b>${esc(apLabel())}</b><span>${ap.skin===0?"Default skin":esc(apChampName(ap.champ))}</span></div>`;
}
function renderArtPicker(){
  if(!$("artPicker"))return;
  const acc=apAcc(), own=acc&&normArt(acc.art), skins=ap.view==="skins";
  apHero();
  $("apOff").classList.toggle("hidden",champArtOn());
  $("apBarChamps").classList.toggle("hidden",skins);
  $("apBarSkins").classList.toggle("hidden",!skins);
  const grid=$("apGrid");
  grid.className="ap-grid "+(skins?"sk":"ch");
  grid.setAttribute("aria-label",skins?"Skins":"Champions");
  const msg=(t,retry)=>`<div class="ap-msg">${t}${retry?`<br><button type="button" data-ap="retry">Try again</button>`:""}</div>`;
  const failed=`Couldn't reach Riot's Data Dragon, where the champion and skin art comes from.`;
  let h="";
  if(skins){
    $("apBack").innerHTML=icon("chevron")+"Champions";
    $("apChampName").textContent=apChampName(ap.champ);
    $("apCount").textContent=ap.skins?ap.skins.length+(ap.skins.length===1?" skin":" skins"):"";
    const shown=acc&&artOf(acc);
    if(ap.skins)h=ap.skins.map(s=>{
      const on=s.num===ap.skin, cur=shown&&shown.champ===ap.champ&&shown.skin===s.num;
      const nm=s.num===0?apChampName(ap.champ):s.name||apChampName(ap.champ);
      return`<button type="button" class="ap-sk${on?" on":""}" data-skin="${s.num}" aria-pressed="${on}" tabindex="${on?0:-1}" title="${esc(nm)}">`
        +`<img src="${apPortraitUrl(ap.champ,s.num)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">`
        +`<span class="nm">${esc(s.num===0?"Default":nm)}</span>${cur?`<span class="cur">On the card</span>`:""}</button>`;
    }).join("");
    else if(ap.err)h=msg(failed,true);
    else h=`<div class="ap-sk skel"></div>`.repeat(6);
  }else{
    if(ap.champs){
      const q=ap.q.toLowerCase().replace(/[^a-z0-9]/g,"");
      // by name or by id, so "monkey" still finds Wukong
      const list=q?ap.champs.filter(c=>[c.name,c.id].some(x=>x.toLowerCase().replace(/[^a-z0-9]/g,"").includes(q))):ap.champs;
      const sel=list.some(c=>c.id===ap.champ)?ap.champ:list[0]&&list[0].id;
      h=list.length?list.map(c=>`<button type="button" class="ap-ch${c.id===ap.champ?" on":""}" data-champ="${c.id}" aria-pressed="${c.id===ap.champ}" tabindex="${c.id===sel?0:-1}" title="${esc(c.name)}">`
        +`<i><img src="${DD}/cdn/${esc(ap.ver)}/img/champion/${c.id}.png" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"></i><span>${esc(c.name)}</span></button>`).join("")
        :msg(`No champion called “${esc(ap.q.trim())}”.`);
    }
    else if(ap.err)h=msg(failed,true);
    else h=`<div class="ap-ch skel"><i></i><span></span></div>`.repeat(24);
  }
  setHTML(grid,h);
  // Where the keyboard starts when the window opens: the search on the champion
  // list, the picked skin on the skin list (its way back until the skins arrive).
  const tile=skins&&grid.querySelector(".ap-sk.on");
  for(const el of [$("apSearch"),$("apBack")])el.removeAttribute("data-autofocus");
  (skins?tile||$("apBack"):$("apSearch")).setAttribute("data-autofocus","");
  if(tile&&ap.focusTile&&(document.activeElement===$("apBack")||!$("artPicker").contains(document.activeElement)||document.activeElement===document.body)){
    ap.focusTile=false;
    if(!$("artPicker").classList.contains("hidden"))tile.focus();
  }
  apControls(acc);
  const auto=acc&&champKey(mainChamp(acc));
  $("apAuto").classList.toggle("hidden",!own);
  $("apAuto").textContent=auto?"Back to most-played":"Remove the art";
}
// A pick only counts once a tile is chosen: changing just the strength must not
// pin the most-played champion as this card's art for good.
function apArtChanged(acc){
  const own=acc&&normArt(acc.art);
  return !!acc&&ap.picked&&!!ap.champ&&!(own&&own.champ===ap.champ&&own.skin===ap.skin);
}
function apOpChanged(acc){
  if(!acc||!ap.opTouched)return false;
  const g=artOpGlobal(), own=normArtOp(acc.artOp);
  if(ap.opAll)return ap.op!==g||accounts.some(a=>normArtOp(a.artOp)!=null);
  return (ap.op===g?null:ap.op)!==own;
}
// The strength row and Save, without the grid: dragging the slider fires this
// sixty times a second, and redrawing forty skin tiles each time made it stutter.
function apControls(acc){
  apStrength(acc);
  $("apUse").disabled=!(apArtChanged(acc)||apOpChanged(acc));
}
function apStrength(acc){
  $("apOpV").textContent=ap.op?ap.op+"%":"Hidden";
  const others=accounts.filter(a=>a!==acc&&normArtOp(a.artOp)!=null).length;
  $("apOpHint").textContent=ap.opAll?(others?"including "+others+" set on "+(others===1?"its":"their")+" own":"")
    :"Only this card";
  // the strip: this card's name and rank over the art, at the strength chosen
  // "-" for no champion, as the hero does: opening clears the key to "" to force a redraw
  const el=$("apPrev"), k=ap.champ?ap.champ+"_"+ap.skin:"-";
  if(el.dataset.k!==k){
    el.dataset.k=k;
    el.innerHTML=(ap.champ?`<img alt="" decoding="async" referrerpolicy="no-referrer" src="${splashUrl(ap.champ,ap.skin)}">`:"")+`<div class="ap-prev-t"></div>`;
  }
  const img=el.querySelector("img");if(img)img.style.opacity=String(ap.op/100);
  const s=acc&&acc.stats, ranked=acc&&isRanked(acc);
  el.querySelector(".ap-prev-t").innerHTML=acc?`<b>${esc(plainName(acc))}</b><span style="color:${ranked?tierColor(s.tier):"var(--muted)"}">`
    +`${esc(ranked?tierLabel(s)+(s.lp!=null?" · "+fmtN(s.lp)+" LP":""):"Unranked")}</span>`:"";
}
function apPickChamp(id){
  const acc=apAcc(), own=acc&&normArt(acc.art);
  ap.champ=id;ap.view="skins";ap.err=null;ap.picked=true;
  // back on the champion that is already on the card: start on its skin, not the default
  ap.skin=own&&own.champ===id?own.skin:0;ap.name=own&&own.champ===id&&own.name||"";
  ap.focusTile=true;
  apLoadSkins();
  renderArtPicker();
  $("apBack").focus(); // the tile that was clicked is gone; the skins take over when they land
}
function apPickSkin(num){
  const s=ap.skins&&ap.skins.find(x=>x.num===num);if(!s)return;
  ap.skin=num;ap.name=s.name;ap.picked=true;
  renderArtPicker();
}
function apSave(){
  const acc=apAcc();if(!acc)return;
  const msgs=[], artChanged=apArtChanged(acc), opChanged=apOpChanged(acc), all=ap.opAll;
  if(!artChanged&&!opChanged)return;
  if(artChanged){const art=normArt({champ:ap.champ,skin:ap.skin,name:apLabel()});if(art){acc.art=art;msgs.push("Card art: "+apLabel())}}
  if(opChanged){
    if(all){
      // all means all: the cards that had their own strength take this one too
      if(ap.op===ART_OP_DEFAULT)delete cfg.artOpacity;else cfg.artOpacity=ap.op;
      saveCfg();applyArtOpacity();
      for(const a of accounts)delete a.artOp;
      msgs.push(ap.op?"All cards at "+ap.op+"%":"Art hidden on every card");
    }else{
      if(ap.op===artOpGlobal())delete acc.artOp;else acc.artOp=ap.op;
      msgs.push(ap.op?"This card at "+ap.op+"%":"Art hidden on this card");
    }
  }
  closeArtPicker();
  if(opChanged&&all)renderGrid();else renderCard(acc.id);
  saveThen(champArtOn()?msgs.join(" · "):"Saved. Turn on Champion art in Settings to see it");
}
function apAuto(){
  const acc=apAcc();if(!acc)return;
  delete acc.art;
  const auto=champKey(mainChamp(acc));
  closeArtPicker();
  renderCard(acc.id);
  saveThen(auto?"Back to the most-played champion":"Card art removed");
}
$("apGrid").addEventListener("click",e=>{
  if(e.target.closest('[data-ap="retry"]')){
    ap.err=null;
    if(!ap.champs)apLoad();else if(ap.view==="skins")apLoadSkins();
    renderArtPicker();return;
  }
  const ch=e.target.closest("[data-champ]");if(ch){apPickChamp(ch.dataset.champ);return}
  const sk=e.target.closest("[data-skin]");if(sk)apPickSkin(Number(sk.dataset.skin));
});
/* The splash download starts when a finger lands on a tile, not when it lifts,
   and under a mouse once the pointer rests on one — so most of it is already
   here by the time the tap is a click. */
const apWarmed=new Set();
function apWarm(num){
  if(!ap.champ||!Number.isInteger(num))return;
  const u=splashUrl(ap.champ,num);if(apWarmed.has(u))return;apWarmed.add(u);
  const i=new Image();i.referrerPolicy="no-referrer";i.decoding="async";i.src=u;
}
let apHoverT=0;
$("apGrid").addEventListener("pointerdown",e=>{const t=e.target.closest("[data-skin]");if(t)apWarm(Number(t.dataset.skin))});
$("apGrid").addEventListener("pointerover",e=>{
  clearTimeout(apHoverT);
  const t=e.pointerType==="mouse"&&e.target.closest("[data-skin]");
  if(t)apHoverT=setTimeout(()=>apWarm(Number(t.dataset.skin)),120);
});
$("apGrid").addEventListener("pointerleave",()=>clearTimeout(apHoverT));
$("apGrid").addEventListener("dblclick",e=>{if(e.target.closest("[data-skin]")&&!$("apUse").disabled)apSave()});
/* A skin with no loading-screen portrait has no art to put on a card either, so
   it leaves the grid — unless it is the one picked, which stays as a named plate
   so the pick is never silently swapped for another. */
$("apGrid").addEventListener("error",e=>{
  const t=e.target.closest&&e.target.closest(".ap-sk");if(!t)return;
  if(t.classList.contains("on")){t.classList.add("dead");return}
  const num=Number(t.dataset.skin);
  if(ap.skins)ap.skins=ap.skins.filter(s=>s.num!==num);
  t.remove();
  const n=$("apGrid").querySelectorAll("[data-skin]").length;
  $("apCount").textContent=n+(n===1?" skin":" skins");
},true);
/* Arrow keys walk the grid, so Tab is one stop for all of it instead of a
   hundred and seventy. Columns are counted off the layout, which is whatever
   the window's width made them. */
$("apGrid").addEventListener("keydown",e=>{
  const tiles=[...$("apGrid").querySelectorAll("[data-champ],[data-skin]")];
  const i=tiles.indexOf(document.activeElement);if(i<0)return;
  const top=tiles[0].offsetTop, cols=Math.max(1,tiles.filter(t=>t.offsetTop===top).length);
  const to={ArrowRight:i+1,ArrowLeft:i-1,ArrowDown:i+cols,ArrowUp:i-cols,Home:0,End:tiles.length-1}[e.key];
  if(to==null)return;
  e.preventDefault();
  if(e.key==="ArrowUp"&&to<0&&ap.view==="champs"){$("apSearch").focus();return}
  const t=tiles[Math.max(0,Math.min(tiles.length-1,to))];
  for(const x of tiles)x.tabIndex=x===t?0:-1;
  t.focus();
});
$("apSearch").addEventListener("input",e=>{ap.q=e.target.value;renderArtPicker()});
$("apSearch").addEventListener("keydown",e=>{
  const first=$("apGrid").querySelector("[data-champ]");
  if(e.key==="Enter"&&first){e.preventDefault();apPickChamp(first.dataset.champ)}
  else if(e.key==="ArrowDown"&&first){e.preventDefault();($("apGrid").querySelector('[data-champ][tabindex="0"]')||first).focus()}
});
$("apBack").addEventListener("click",()=>{
  ap.view="champs";ap.err=null;renderArtPicker();if(!ap.champs)apLoad();
  // back at the champion you came from, not at Aatrox
  const on=$("apGrid").querySelector(".ap-ch.on");
  if(on&&on.scrollIntoView)on.scrollIntoView({block:"center"});
  $("apSearch").focus();
});
$("apUse").addEventListener("click",apSave);
$("apOp").addEventListener("input",e=>{ap.op=normArtOp(Number(e.target.value))??ap.op;ap.opTouched=true;apControls(apAcc())});
$("apOpAll").addEventListener("change",e=>{ap.opAll=e.target.checked;ap.opTouched=true;apControls(apAcc())});
$("apAuto").addEventListener("click",apAuto);
$("apCancel").addEventListener("click",closeArtPicker);
$("apTurnOn").addEventListener("click",()=>{cfg.champArt=null;saveCfg();renderGrid();renderArtPicker();toast("Champion art is on")});
/* ---- share a read-only snapshot ----
   A page of your ranks for somebody else, carried entirely in the link. The data
   is the part after "#", which a browser never sends to any server — so nothing
   is uploaded, stored or kept anywhere, and the link is the whole page. It holds
   only what the share window lists: never a login, password, email or note, and
   no Riot ID unless you tick the box. Opening one never reads or writes the
   opener's own vault or settings (see openSnapshot). */
/* Where the app lives. Until 2.14 that was marvinpanvan.github.io/league-smurf-tracker/,
   but every GitHub Pages site under that account shares the origin
   marvinpanvan.github.io, and with it one localStorage: any other project published
   there could read the vault. smurf-tracker.pages.dev is an origin of its own. The
   old address still serves the app, to hand vaults over (see the move, near boot). */
const APP_HOME="https://smurf-tracker.pages.dev/", APP_ORIGIN="https://smurf-tracker.pages.dev";
const OLD_ORIGIN="https://marvinpanvan.github.io";
const onOldHome=()=>location.origin===OLD_ORIGIN;
const SNAP_HOME=APP_HOME;
const SNAP_MAX_HASH=16000, SNAP_MAX_JSON=200000, SNAP_MAX_ACC=60, SNAP_HIST=16;
let snapMode=false;
function b64url(bytes){return b64(bytes).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")}
function unb64url(s){s=s.replace(/-/g,"+").replace(/_/g,"/");while(s.length%4)s+="=";return unb64(s)}
// Through a CompressionStream and back out, stopping at `cap` bytes so a small
// link can't unpack into something enormous.
async function pipeBytes(bytes,stream,cap){
  const w=stream.writable.getWriter();
  w.write(bytes).catch(()=>{});w.close().catch(()=>{});
  const r=stream.readable.getReader(), chunks=[];let n=0;
  for(;;){
    const{done,value}=await r.read();if(done)break;
    n+=value.length;
    if(cap&&n>cap){try{r.cancel()}catch(e){}throw new Error("too large")}
    chunks.push(value);
  }
  const out=new Uint8Array(n);let o=0;for(const c of chunks){out.set(c,o);o+=c.length}
  return out;
}
// "1." compressed, "0." plain for a browser without CompressionStream
async function snapEncode(obj){
  const bytes=new TextEncoder().encode(JSON.stringify(obj));
  if(typeof CompressionStream==="function"){
    try{return"1."+b64url(await pipeBytes(bytes,new CompressionStream("deflate-raw")))}catch(e){}
  }
  return"0."+b64url(bytes);
}
async function snapDecode(str){
  str=String(str||"");
  const m=str.length<=SNAP_MAX_HASH&&/^([01])\.([A-Za-z0-9_-]+)$/.exec(str);
  if(!m)throw new Error("not a snapshot");
  let bytes=unb64url(m[2]);
  if(m[1]==="1"){
    if(typeof DecompressionStream!=="function")throw new Error("this browser can't unpack it");
    bytes=await pipeBytes(bytes,new DecompressionStream("deflate-raw"),SNAP_MAX_JSON);
  }else if(bytes.length>SNAP_MAX_JSON)throw new Error("too large");
  return JSON.parse(new TextDecoder().decode(bytes));
}
// A rank as [tier index, division or 0, LP]: four short values instead of a word
const snapRank=s=>{
  const t=TIER_ORDER.indexOf(String(s&&s.tier||"").toUpperCase());
  if(t<0)return null;
  const lp=Number(s.lp);
  return[t,normDivision(TIER_ORDER[t],s.division)||0,Number.isFinite(lp)?Math.max(0,Math.min(9999,Math.round(lp))):0];
};
function snapAccounts(which){
  const live=accounts.filter(a=>!a.archived);
  if(which==="fav")return live.filter(a=>a.fav);
  if(which==="sel")return live.filter(a=>selected.has(a.id));
  if(which==="ranked")return live.filter(isRanked);
  return live;
}
function snapColours(){
  const cs=getComputedStyle(document.documentElement), hex=v=>/^#[0-9a-f]{6}$/i.test(v)?v.toLowerCase():null;
  return[hex(cs.getPropertyValue("--gold").trim())||DEFAULT_ACCENT,hex(cs.getPropertyValue("--teal").trim())||DEFAULT_ACCENT2];
}
function buildSnapshot(o){
  const now=Date.now();let k=0;
  const list=snapAccounts(o.which).slice(0,SNAP_MAX_ACC).map(a=>{
    const s=a.stats&&a.stats.found!==false?a.stats:null, x={};
    const rid=(a.gameName||"")+"#"+(a.tagLine||"");
    x.n=(a.label||"").trim().slice(0,40)||(o.ids?rid.slice(0,40):"Account "+(++k));
    if(o.ids&&a.label)x.i=rid.slice(0,40);
    if(REGIONS[a.region])x.r=a.region;
    const rk=isRanked(a)?snapRank(s):null;
    if(rk){
      x.k=rk;
      const wl=winLoss(s);
      if(wl.w!=null)x.w=Math.min(99999,wl.w);if(wl.l!=null)x.l=Math.min(99999,wl.l);
      const pk=peakInfo(a);if(pk.peakV!=null&&pk.peak)x.p=pk.peak.slice(0,40);
    }
    if(s&&Number.isInteger(+s.level)&&+s.level>0)x.lv=Math.min(9999,+s.level);
    if(o.hist&&rk){
      const h=(a.history||[]).filter(e=>e&&ladderLP(e)!==null&&Number(e.t)>0).slice(-SNAP_HIST);
      if(h.length>1)x.h=h.map(e=>[Math.max(0,Math.round((now-e.t)/864e5*10)/10),...snapRank(e)]);
    }
    // not for a card that hides its art: the link would show what its card doesn't
    if(o.art&&artOpOf(a)>0){const art=artOf(a);if(art)x.c=[art.champ,art.skin]}
    if(o.notes){
      const info=normInfo(a.info);
      if(info&&info.honor!=null)x.hn=info.honor;
      if(info&&info.skins)x.sk=info.skins.slice(0,8);
    }
    if(a.status&&a.status!=="active"&&STATUS[a.status])x.st=a.status;
    if(a.fav)x.f=1;
    return x;
  });
  return{v:1,t:String(o.title||"").replace(/\s+/g," ").trim().slice(0,60),at:Math.floor(now/60000)*60000,c:snapColours(),a:list};
}
// Everything in a link is somebody else's input: every value is checked for
// shape and range here, and only what passes reaches the page, through esc().
function normSnap(o){
  if(!o||typeof o!=="object"||o.v!==1||!Array.isArray(o.a))return null;
  const str=(v,n)=>typeof v==="string"?v.replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,n):"";
  const int=(v,lo,hi)=>Number.isInteger(v)&&v>=lo&&v<=hi?v:null;
  const rank=k=>{
    if(!Array.isArray(k))return null;
    const t=int(k[0],0,TIER_ORDER.length-1);if(t==null)return null;
    const tier=TIER_ORDER[t];
    return{tier,division:hasDivisions(tier)&&["I","II","III","IV"].includes(k[1])?k[1]:null,lp:int(k[2],0,9999)??0};
  };
  const hex=v=>typeof v==="string"&&/^#[0-9a-f]{6}$/i.test(v)?v:null;
  const accs=o.a.slice(0,SNAP_MAX_ACC).filter(x=>x&&typeof x==="object"&&!Array.isArray(x)).map(x=>({
    name:str(x.n,40)||"Account", rid:str(x.i,40), region:REGIONS[x.r]?x.r:"",
    rank:rank(x.k), w:int(x.w,0,99999), l:int(x.l,0,99999), level:int(x.lv,1,9999), peak:str(x.p,40),
    hist:(Array.isArray(x.h)?x.h.slice(-SNAP_HIST):[]).map(e=>{
      if(!Array.isArray(e)||typeof e[0]!=="number"||!(e[0]>=0&&e[0]<5000))return null;
      const r=rank(e.slice(1));return r?{d:e[0],...r}:null;
    }).filter(Boolean),
    art:Array.isArray(x.c)?normArt({champ:x.c[0],skin:x.c[1]}):null,
    honor:int(x.hn,0,5), skins:(Array.isArray(x.sk)?x.sk:[]).map(s=>str(s,60)).filter(Boolean).slice(0,8),
    status:typeof x.st==="string"&&x.st!=="active"&&Object.prototype.hasOwnProperty.call(STATUS,x.st)?x.st:"",
    fav:x.f===1,
  }));
  const at=Number(o.at);
  return{title:str(o.t,60),at:Number.isFinite(at)&&at>0&&at<8.64e15?at:null,
    colors:Array.isArray(o.c)?[hex(o.c[0]),hex(o.c[1])]:[null,null],accounts:accs};
}
// Where a link should point: the page itself when it is hosted somewhere, the
// published app when it is a file on this computer nobody else can open.
function snapBase(){return/^https?:$/.test(location.protocol)&&!/^(localhost|127\.|\[::1\])/.test(location.hostname)&&!onOldHome()?location.origin+location.pathname:SNAP_HOME}
const snapDay=ts=>{const d=new Date(ts);return d.getDate()+" "+["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getMonth()]+" "+d.getFullYear()};
// today as YYYY-MM-DD where you are: toISOString() is the date in London, so a backup
// made just after midnight anywhere east of it was named for the day before
const localDay=(d=new Date())=>d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
function snapCardHTML(a,i){
  const r=a.rank, col=r?tierColor(r.tier):"#8a8f98";
  const total=(a.w||0)+(a.l||0), wr=a.w!=null&&a.l!=null&&total?Math.round(a.w/total*100):null;
  const label=r?tierLabel(r):"Unranked";
  const st=a.status?STATUS[a.status]:null;
  const spk=a.hist.length>1?sparkline(a.hist,col):"";
  const days=a.hist.length>1?Math.max(1,Math.round(a.hist[0].d-a.hist[a.hist.length-1].d)):0;
  const meta=[a.peak?`<span><i>Peak</i>${esc(a.peak)}</span>`:"",a.level?`<span><i>Level</i>${esc(a.level)}</span>`:"",
    total?`<span><i>Games</i>${esc(total)}</span>`:""].filter(Boolean).join("");
  const notes=(a.honor!=null?`<span class="ni-f"><span class="ni-pips" aria-hidden="true">${[1,2,3,4,5].map(n=>`<i${n<=a.honor?' class="on"':""}></i>`).join("")}</span>Honor <b>${a.honor}</b></span>`:"")
    +a.skins.map(s=>`<span class="ni-f sk">${esc(s)}</span>`).join("");
  return`<article class="hx sn-card${a.status==="banned"?" dead":""}" style="--tier:${col};--i:${i}"><div class="hx-in sn-c">
    <div class="sn-art">${a.art?`<img src="${splashUrl(a.art.champ,a.art.skin)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">`:""}</div>
    <div class="sn-head">
      <span class="sn-crest">${r?crest(r.tier,"sn-crest-i"):`<b>${esc(a.name.charAt(0).toUpperCase())}</b>`}</span>
      <div class="sn-id"><div class="sn-nm">${esc(a.name)}${a.fav?`<span class="sn-fav" title="Favorite">${icon("star")}</span>`:""}</div>
        ${a.rid?`<div class="sn-rid">${esc(a.rid)}</div>`:""}</div>
      ${a.region?`<span class="regiontag">${esc(a.region)}</span>`:""}
    </div>
    <div class="sn-rank"><b>${esc(label)}</b>${r?`<span>${esc(fmtN(r.lp))} LP</span>`:""}${st?`<span class="stchip" style="color:${st.color};background:${st.color}1f">${esc(st.short||st.label)}</span>`:""}</div>
    ${wr!=null?`<div class="sn-wl"><span>${esc(wlText(a.w,a.l))}</span><b class="${wr>=50?"wr-good":""}">${wr}% WR</b></div>
      <div class="wrbar"><i style="width:${wr}%;background:${col}"></i></div>`:""}
    ${spk?`<div class="sn-spk" title="Last ${days} day${days===1?"":"s"}">${spk}</div>`:""}
    ${meta?`<div class="sn-meta">${meta}</div>`:""}
    ${notes?`<div class="ni-row sn-notes">${notes}</div>`:""}
  </div></article>`;
}
function snapHTML(s){
  const list=s.accounts.slice().sort((x,y)=>(y.rank?ladderLP(y.rank):-1)-(x.rank?ladderLP(x.rank):-1)||(y.level||0)-(x.level||0));
  const ranked=list.filter(a=>a.rank), best=ranked[0];
  const w=list.reduce((n,a)=>n+(a.w||0),0), l=list.reduce((n,a)=>n+(a.l||0),0);
  const wr=w+l?Math.round(w/(w+l)*100):null;
  const regions=[...new Set(list.map(a=>a.region).filter(Boolean))];
  const tiers=TIER_ORDER.slice().reverse().map(t=>[t,ranked.filter(a=>a.rank.tier===t).length]).filter(x=>x[1]);
  const unrankedN=list.length-ranked.length;
  const nice=t=>t.charAt(0)+t.slice(1).toLowerCase();
  const home=snapBase();
  return`<header class="sn-top">
      <a class="sn-brand" href="${esc(home)}"><span class="brand-mark" aria-hidden="true"></span><span class="hex-display">Smurf Tracker</span></a>
      <span class="sn-pill">${icon("eye")}Read-only snapshot</span>
    </header>
    <section class="sn-hero">
      ${s.at?`<div class="sn-eyebrow">Shared ${esc(snapDay(s.at))}</div>`:""}
      <h1 class="sn-title">${esc(s.title||"League accounts")}</h1>
      <div class="sn-sub">${list.length} account${list.length===1?"":"s"}${regions.length?" · "+regions.map(esc).join(", "):""}</div>
      ${list.length?`<div class="hx gold sn-sum"><div class="hx-in">
        <div class="cell sn-best">${best?crest(best.rank.tier,"sn-best-c"):""}<div><span class="k">Highest</span>
          <b style="color:${best?tierColor(best.rank.tier):"var(--muted)"}">${best?esc(tierLabel(best.rank)):"Unranked"}</b>
          <em>${best?esc(fmtN(best.rank.lp)+" LP · "+best.name):"No ranked account in this snapshot"}</em></div></div>
        <div class="cell"><span class="k">Ranked</span>${
          // "Ranked 16 / of 16" read as a sum with nothing to add up
          ranked.length===list.length?`<b>All ${list.length}</b><em>this season</em>`
          :ranked.length?`<b>${ranked.length} of ${list.length}</b><em>${list.length-ranked.length} unranked</em>`
          :`<b>None</b><em>no ranked games yet</em>`}</div>
        <div class="cell"><span class="k">Games</span><b>${(w+l).toLocaleString("en-US")}</b><em>this season</em></div>
        <div class="cell"><span class="k">Win rate</span><b class="${wr!=null&&wr>=50?"wr-good":""}">${wr!=null?wr+"%":"—"}</b><em>${w+l?wlText(w,l):"no games"}</em></div>
      </div></div>`:""}
      ${tiers.length+(unrankedN?1:0)>1?
        // the app header's emblem row, read-only: a 5px bar of tier colors under a
        // legend of diamonds was one more way of saying the same thing
        `<div class="sn-tiers" role="list" aria-label="Accounts by tier">${tiers.map(([t,n])=>`<span class="sn-t" role="listitem" title="${esc(nice(t))}: ${n} account${n===1?"":"s"}">`
          +`${crest(t,"sn-t-c")}<b>${n}</b><span class="sr-only"> ${esc(nice(t))}</span></span>`).join("")}`
        +(unrankedN?`<span class="sn-t sn-t-w" role="listitem">${unrankedN} unranked</span>`:"")+`</div>`:""}
    </section>
    ${list.length?`<section class="sn-grid" aria-label="Accounts">${list.map(snapCardHTML).join("")}</section>`
      :`<p class="sn-empty">This snapshot has no accounts in it.</p>`}
    <footer class="sn-foot">
      <p>A snapshot${s.at?" taken "+esc(snapDay(s.at)):""}. It doesn't update. Logins, emails and notes are never part of one.</p>
      <a class="btn b-fill" href="${esc(home)}">Track your own accounts</a>
      <p class="sn-riot">${esc(RIOT_NOTICE)}</p>
    </footer>`;
}
// Riot's wording for projects built on its games (its developer policy). The app's
// footer carries the same sentence in the markup.
const RIOT_NOTICE="Smurf Tracker isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc.";
function snapErrorHTML(){
  return`<div class="sn-err hx gold"><div class="hx-in">
    <span class="brand-mark" aria-hidden="true"></span>
    <h1>This snapshot link is broken</h1>
    <p>Part of it may have been cut off when it was copied. Ask for the link again, and paste all of it.</p>
    <a class="btn b-fill" href="${esc(snapBase())}">Open Smurf Tracker</a></div></div>`;
}
/* The viewer. It runs instead of the app, before anything has read this
   browser's storage, and switches storage off for the rest of the page's life:
   saveCfg and saveDB both check hasStorage, so nothing here can write over the
   opener's own vault or settings — not a shortcut, not leaving the tab. */
async function openSnapshot(code){
  snapMode=true;hasStorage=false;
  // a snapshot starts at its top, wherever the page was before (see hashchange, below)
  try{history.scrollRestoration="manual"}catch(e){}
  document.body.classList.add("snap-mode");
  const root=$("snapView");root.classList.remove("hidden");
  root.innerHTML=`<p class="sn-wait">Opening the snapshot…</p>`;
  let s=null;
  try{s=normSnap(await snapDecode(code))}catch(e){s=null}
  if(!s){root.innerHTML=snapErrorHTML();document.title="Snapshot · Smurf Tracker";snapTop();return}
  if(s.colors[0])applyAccent(s.colors[0]);
  if(s.colors[1])applyAccent2(s.colors[1]);
  document.title=(s.title||"League accounts")+" · Smurf Tracker";
  root.innerHTML=snapHTML(s);
  snapTop();
}
// at once, not with the page's smooth scrolling: this is a new page, not a move on this one
function snapTop(){try{scrollTo({top:0,left:0,behavior:"instant"})}catch(e){scrollTo(0,0)}}
window.addEventListener("error",e=>{const t=e.target;if(snapMode&&t&&t.closest&&t.closest(".sn-art"))t.remove()},true);
// Pasting a snapshot link into a tab that already has the app open changes only
// the part after #, which reloads nothing; going back out of one is the same.
// The new entry takes the app's scroll position with it, and the reload would
// put it back, so a snapshot coming in is told to start at its top.
window.addEventListener("hashchange",()=>{
  if(!snapMode&&!/^#s=/.test(location.hash))return;
  if(!snapMode)try{history.scrollRestoration="manual"}catch(e){}
  location.reload();
});

/* ---- the share window ---- */
const share={which:"ranked",gen:0,url:""};
function shareCounts(){return{ranked:snapAccounts("ranked").length,fav:snapAccounts("fav").length,sel:snapAccounts("sel").length,all:snapAccounts("all").length}}
function openShare(){
  if(previewMode){toast("Exit preview first. This is example data, not your accounts");return}
  if(!accounts.some(a=>!a.archived)){toast("Add an account first. There is nothing to share yet");return}
  closeAllPanels();
  const n=shareCounts();
  share.which=selected.size&&n.sel?"sel":n.ranked?"ranked":"all";
  $("shArt").checked=champArtOn();
  renderShare();
  $("shareModal").classList.remove("hidden");
}
function closeShare(){share.gen++;const m=$("shareModal");if(m)m.classList.add("hidden")}
function shareOpts(){
  return{which:share.which,title:$("shName").value||"My League accounts",ids:$("shIds").checked,art:$("shArt").checked,
    hist:$("shHist").checked,notes:$("shNotes").checked};
}
function renderShare(){
  const n=shareCounts();
  const seg=[["ranked","Ranked"],["fav","Favorites"],["sel","Selected"],["all","All"]];
  setHTML($("shWhich"),seg.map(([k,t])=>`<button type="button" data-which="${k}" aria-pressed="${share.which===k}" class="${share.which===k?"on":""}"${n[k]?"":" disabled"}>${t} <b>${n[k]}</b></button>`).join(""));
  updateShareLink();
}
async function updateShareLink(){
  const g=++share.gen, o=shareOpts(), count=snapAccounts(o.which).length;
  $("shCopy").disabled=$("shOpen").disabled=!count;
  if(!count){$("shSize").textContent="No accounts to share in this group.";share.url="";return}
  const code=await snapEncode(buildSnapshot(o));
  if(g!==share.gen)return;
  share.url=snapBase()+"#s="+code;
  share.local=location.href.split("#")[0]+"#s="+code;
  const kb=Math.max(.1,Math.round(share.url.length/102.4)/10);
  $("shSize").textContent=Math.min(count,SNAP_MAX_ACC)+" account"+(count===1?"":"s")+" · "+kb+" KB link"+(count>SNAP_MAX_ACC?" (the first "+SNAP_MAX_ACC+")":"");
}
$("shWhich").addEventListener("click",e=>{const b=e.target.closest("[data-which]");if(!b||b.disabled)return;share.which=b.dataset.which;renderShare()});
for(const id of["shIds","shArt","shHist","shNotes"])$(id).addEventListener("change",updateShareLink);
$("shName").addEventListener("input",updateShareLink);
$("shCopy").addEventListener("click",async()=>{await updateShareLink();if(share.url)copyText(share.url,"Snapshot link")});
$("shOpen").addEventListener("click",async()=>{await updateShareLink();if(share.local)window.open(share.local,"_blank","noopener")});
$("shCancel").addEventListener("click",closeShare);
$("bShare").addEventListener("click",()=>{$("moreMenu").classList.add("hidden");openShare()});
/* ---- streamer mode ----
   For streaming or sharing the screen: whatever would let a viewer find an
   account — its Riot ID, login, email, notes, or a name that is only its Riot
   name — is blurred on screen and left out of tooltips and messages. The
   labels you gave your accounts stay: you chose those. One key (H) or the ⋯
   menu turns it on; turning it off takes a click on the header's pill, so a
   stray key can never reveal anything mid-stream. */
function streamerOn(){return !!cfg.streamer}
function sens(html){return`<span class="sens">${html}</span>`}
function nameOf(a){return a.label?esc(a.label):sens(esc(a.gameName||""))}
function plainName(a){return a.label||(streamerOn()?"an unlabelled account":a.gameName||"")}
function applyStreamer(){
  const on=streamerOn();
  document.body.classList.toggle("streamer",on);
  const pill=$("streamerPill");if(pill)pill.classList.toggle("hidden",!on);
  const b=$("bStreamer");if(b)setMenuItem(b,"eyeOff",on?"Streamer mode: on":"Streamer mode");
}
function setStreamer(on){
  cfg.streamer=on?true:null;saveCfg();applyStreamer();render();
  toast(on?"Streamer mode on. Riot IDs, logins, emails and notes are hidden":"Streamer mode off");
}
function drawerTitle(){
  const h=new Set(cardHidden());
  return CARD_PARTS.filter(([k])=>h.has(k)).map(p=>p[1]).concat(["past seasons, flex rank, champions"]).join(", ").replace(/^./,c=>c.toUpperCase());
}
function hasInfo(a){const p=infoParts(a);return !!(p.solo.length||p.flexHist.length||p.champs.length||p.flex||(a.mastery&&a.mastery.length))}
// The one-line summary on the drawer pull, so the card says what is folded away
// before you open it.
function infoPeek(a){
  const p=infoParts(a),bits=[];
  if(p.flex)bits.push("flex");
  const seasons=p.solo.length+p.flexHist.length;
  if(seasons)bits.push(seasons+" season"+(seasons===1?"":"s"));
  if(p.champs.length)bits.push(p.champs.length+" champion"+(p.champs.length===1?"":"s"));
  return bits.join(" · ");
}
function highestOf(list){let best=null,v=-1;for(const e of list){const x=ladderLP(e);if(x!==null&&x>v){v=x;best=e}}return best}
// Opening the panel used to unroll every season and every champion at once, which
// buried the one number you came for under thirty others. Each group is a
// headline that already answers most of the question — the ranked peak, the
// champion you actually play — and the rows behind it are one click away.
/* Details opened onto more folded rows, "Champions this season 3" among them, each
   wanting a click of its own to show anything: two clicks to see what Details was
   opened for. Its sections start open and remember being closed (shutSec); the
   Rank panel's start folded and remember being opened (openSec). */
const DRAWER_SECS=new Set(["form","solo","flexhist","champs","mastery"]);
function secOn(id,key){const k=id+"|"+key;return DRAWER_SECS.has(key)?!shutSec.has(k):openSec.has(k)}
function secHTML(a,key,label,n,peek,body){
  const on=secOn(a.id,key);
  return `<div class="sec${on?" on":""}" data-k="sec-${key}">`
    +`<button class="sec-h" data-act="sec" data-s="${key}" aria-expanded="${on}">`
      +`<span class="sec-n">${esc(label)}${n===""||n==null?"":`<i>${n}</i>`}</span>`
      +`<span class="sec-p">${peek}</span>`
      +`<svg class="ico" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>`
    +`</button>`
    +(on?`<div class="sec-b">${body}</div>`:"")
  +`</div>`;
}
function infoBlockHTML(a,rev){
  const {solo,flexHist,champs,flex}=infoParts(a);
  const mastery=normMastery(a.mastery)||[];
  if(!solo.length&&!flexHist.length&&!champs.length&&!flex&&!mastery.length&&!canForm(a))return"";
  // through tierLabel like everywhere else — the drawer was the fifth place
  // building this string by hand, and the fifth place printing "Challenger II"
  const rank=e=>tierLabel(e)+(e.lp!=null?" · "+fmtN(e.lp)+" LP":"");
  const tinted=e=>`<span style="color:${tierColor(e.tier)}">${esc(rank(e))}</span>`;
  const rows=list=>list.map(e=>`<div class="sea"><span class="s-yr">${esc(e.season)}</span>`
    +`<span class="s-rk" style="color:${tierColor(e.tier)}">${esc(rank(e))}</span></div>`).join("");
  const seasonPeek=list=>{const b=highestOf(list);return b?tinted(b):""};
  let out="";
  // one fact, one line — folding it would cost a click to reveal nothing extra
  if(flex)out+=`<div class="sec flat" data-k="sec-flex"><span class="sec-n">Flex rank</span>`
    +`<span class="sec-p" style="color:${tierColor(flex.tier)}">${esc(rank(flex))}</span></div>`;
  out+=formHTML(a);
  if(solo.length)out+=secHTML(a,"solo","Past seasons · Solo",solo.length,seasonPeek(solo),rows(solo));
  if(flexHist.length)out+=secHTML(a,"flexhist","Past seasons · Flex",flexHist.length,seasonPeek(flexHist),rows(flexHist));
  if(champs.length){
    const top=champs[0];
    // The KDA column only exists when a source supplied one — a column of dashes
    // is worse than no column.
    const kdaCol=champs.some(c=>c.kda!=null);
    const row=(cls,cells)=>`<div class="chp${cls}"${kdaCol?"":' style="grid-template-columns:1fr auto auto"'}>${cells}</div>`;
    out+=secHTML(a,"champs","Champions this season",champs.length,
      `<span class="c-nm">${esc(top.name)}</span> <span class="${top.wr>=50?"wr-good":""}">${esc(top.wr)}%</span>`,
      row(" chp-h",`<span>Champion</span><span>W/L</span><span>WR</span>${kdaCol?"<span>KDA</span>":""}`)
      +champs.map(c=>row("",`<span class="c-nm">${esc(c.name)}</span>`
        +`<span class="c-gm">${c.wins!=null&&c.losses!=null?esc(wlText(c.wins,c.losses)):esc(c.games)+"G"}</span>`
        +`<span class="c-wr${c.wr>=50?" wr-good":""}">${esc(c.wr)}%</span>`
        +(kdaCol?`<span class="c-kd">${c.kda!=null?esc(c.kda):"—"}</span>`:""))).join(""));
  }
  if(mastery.length){
    const top=mastery[0];
    out+=secHTML(a,"mastery","Mastery",mastery.length,
      `<span class="c-nm">${esc(top.name)}</span>${top.level!=null?" · M"+esc(top.level):""}`,
      mastery.map(m=>`<div class="chp" style="grid-template-columns:1fr auto auto"><span class="c-nm">${esc(m.name)}</span>`
        +`<span class="c-gm">${m.level!=null?"M"+esc(m.level):""}</span><span class="c-kd">${esc(fmtPoints(m.points))}${m.points!=null?" pts":""}</span></div>`).join(""));
  }
  return `<div class="login info${rev||""}">${out}</div>`;
}
/* ---- note fields ----
   What people kept typing into Notes by hand — "honor 3, 140 champs, Elementalist
   Lux, 2FA on" — as fields: the same place on every card, searchable, and not a
   paragraph to read sixty times. The built-in ones can each be switched off;
   your own are kept on the account by name ({own: {"Bought from": "G2G"}}), so
   a backup or a synced device shows them even where the field list itself has
   never been set up — it is inferred from what the accounts carry. */
const NOTE_FIELDS=[
  {k:"honor",label:"Honor level",kind:"honor"},
  {k:"owned",label:"Champions owned",kind:"num",max:999},
  {k:"be",label:"Blue Essence",kind:"num",max:99999999},
  {k:"rp",label:"RP",kind:"num",max:9999999},
  {k:"twofa",label:"2-step verification",kind:"bool"},
  {k:"skins",label:"Skins",kind:"list"},
  {k:"penalty",label:"Penalties / bans",kind:"text"},
];
const NOTE_OFF_DEFAULT=["rp"];
const NF_KINDS={text:"Text",num:"Number",bool:"Yes / no"};
const NF_MAX_OWN=12;
function nfLabel(s){
  const t=typeof s==="string"?s.replace(/\s+/g," ").trim().slice(0,32):"";
  return t&&!/^(__proto__|constructor|prototype)$/i.test(t)?t:"";
}
function nfInt(x,max){const n=Number(x);return Number.isInteger(n)&&n>=0&&n<=max?n:null}
function normInfo(v){
  if(!v||typeof v!=="object"||Array.isArray(v))return null;
  const o={};
  {const n=nfInt(v.honor,5);if(v.honor!=null&&n!=null)o.honor=n}
  for(const f of NOTE_FIELDS)if(f.kind==="num"&&v[f.k]!=null){const n=nfInt(v[f.k],f.max);if(n!=null)o[f.k]=n}
  if(typeof v.twofa==="boolean")o.twofa=v.twofa;
  if(Array.isArray(v.skins)){
    const seen=new Set();
    const s=v.skins.filter(x=>typeof x==="string").map(x=>x.replace(/\s+/g," ").trim().slice(0,60))
      .filter(x=>x&&!seen.has(x.toLowerCase())&&seen.add(x.toLowerCase())).slice(0,40);
    if(s.length)o.skins=s;
  }
  if(typeof v.penalty==="string"){const t=v.penalty.trim().slice(0,200);if(t)o.penalty=t}
  if(v.own&&typeof v.own==="object"&&!Array.isArray(v.own)){
    const own={};let n=0;
    for(const[k0,x]of Object.entries(v.own)){
      const k=nfLabel(k0);if(!k||Object.keys(own).some(y=>y.toLowerCase()===k.toLowerCase())||n>=24)continue;
      if(typeof x==="boolean"||typeof x==="number"&&Number.isFinite(x)&&Math.abs(x)<1e12){own[k]=x;n++}
      else if(typeof x==="string"){const t=x.trim().slice(0,200);if(t){own[k]=t;n++}}
    }
    if(n)o.own=own;
  }
  return Object.keys(o).length?o:null;
}
function normNoteFields(v){
  const o=v&&typeof v==="object"&&!Array.isArray(v)?v:{};
  const off=Array.isArray(o.off)?[...new Set(o.off.filter(k=>NOTE_FIELDS.some(f=>f.k===k)))]:NOTE_OFF_DEFAULT.slice();
  const seen=new Set(), custom=[];
  for(const c of Array.isArray(o.custom)?o.custom:[]){
    const label=nfLabel(c&&c.label);
    if(!label||seen.has(label.toLowerCase())||!NF_KINDS[c.kind]||custom.length>=NF_MAX_OWN)continue;
    seen.add(label.toLowerCase());custom.push({label,kind:c.kind});
  }
  return{off,custom};
}
const nfKindOf=v=>typeof v==="boolean"?"bool":typeof v==="number"?"num":"text";
// Your own fields: the list from Fields…, then any name an account carries that
// the list doesn't have yet — so nothing an import brought in goes unseen.
function ownFields(){
  const list=normNoteFields(cfg.noteFields).custom.map(c=>({...c}));
  const seen=new Set(list.map(c=>c.label.toLowerCase()));
  for(const a of accounts){
    const own=a.info&&a.info.own;if(!own||typeof own!=="object")continue;
    for(const[k,v]of Object.entries(own)){
      const label=nfLabel(k);
      if(label&&!seen.has(label.toLowerCase())){seen.add(label.toLowerCase());list.push({label,kind:nfKindOf(v),inferred:true})}
    }
  }
  return list;
}
function noteFields(){
  const {off}=normNoteFields(cfg.noteFields);
  return NOTE_FIELDS.filter(f=>!off.includes(f.k)).concat(ownFields().map(c=>({k:"own",label:c.label,kind:c.kind,own:true})));
}
function nfValue(info,f){
  if(!info)return null;
  if(!f.own)return info[f.k]==null?null:info[f.k];
  const own=info.own||{}, k=Object.keys(own).find(x=>x.toLowerCase()===f.label.toLowerCase());
  return k==null?null:own[k];
}
// a function, not a const, so the rank labels built before this line can use it
function fmtN(n){return Number(n).toLocaleString("en-US",{maximumFractionDigits:2})}
/* One way to write a record. "312W 250L" on a card, "15-9" in the champion table
   and "15 · 9" on the Most played chips (a faded hyphen) were the same thing. */
function wlText(w,l){return fmtN(w)+"W "+fmtN(l)+"L"}
// Everything a search should find in the fields, as one string
function noteFieldsText(a){
  const info=normInfo(a.info);if(!info)return"";
  return noteFields().map(f=>{const v=nfValue(info,f);
    return v==null?"":Array.isArray(v)?v.join(" "):typeof v==="string"?v:""}).filter(Boolean).join(" ");
}
/* `cap`: the card's own view keeps to one row, two chips and "+N more",
   which opens Details, where the whole set is. Honor, champions, BE, 2-step, three
   skins and a note made the notes box 200px on one card and 28px on the next, and
   that box was most of why cards in a row ended hundreds of pixels apart. A
   penalty stays in view: it is a warning, not a fact. */
function noteFactsHTML(a,clickable,cap){
  const info=normInfo(a.info);if(!info)return"";
  const facts=[], kv=[];let skins="", pen="", skinList=[];
  for(const f of noteFields()){
    const v=nfValue(info,f);if(v==null)continue;
    if(f.k==="honor")facts.push(`<span class="ni-f" title="Honor level ${v} of 5"><span class="ni-pips" aria-hidden="true">${[1,2,3,4,5].map(i=>`<i${i<=v?' class="on"':""}></i>`).join("")}</span>Honor <b>${v}</b></span>`);
    else if(f.k==="twofa")facts.push(v?`<span class="ni-f ok" title="2-step verification is on">${icon("check")}2-step on</span>`
      :`<span class="ni-f warn" title="2-step verification is off">${icon("alert")}No 2-step</span>`);
    else if(f.k==="owned")facts.push(`<span class="ni-f"><b>${fmtN(v)}</b> champion${v===1?"":"s"}</span>`);
    else if(f.k==="be")facts.push(`<span class="ni-f" title="Blue Essence"><b>${fmtN(v)}</b> BE</span>`);
    else if(f.k==="rp")facts.push(`<span class="ni-f"><b>${fmtN(v)}</b> RP</span>`);
    else if(f.k==="skins"){
      skinList=v;
      // all of them: this is the open view, where "+N more" on the card face leads,
      // and a second "+2 more" here led nowhere
      skins=`<div class="ni-row ni-skins">${v.map(s=>`<span class="ni-f">${esc(s)}</span>`).join("")}</div>`;
    }
    else if(f.k==="penalty")pen=`<div class="ni-pen">${icon("alert")}<span>${sens(esc(v))}</span></div>`;
    // your own fields are shown by what the value is, not by what the list says it
    // should be — a kind changed after the fact still shows what was stored
    else if(typeof v==="boolean")facts.push(`<span class="ni-f${v?" ok":""}">${v?icon("check"):""}${esc(f.label)}${v?"":": no"}</span>`);
    else if(typeof v==="number")facts.push(`<span class="ni-f">${esc(f.label)} <b>${fmtN(v)}</b></span>`);
    else kv.push(`<span class="k2">${esc(f.label)}</span><span class="v2">${sens(esc(v))}</span>`);
  }
  let body;
  if(cap){
    // two, so the row stays one row on the narrowest card; a warning ("No 2-step")
    // goes first, since it is the one chip that asks for something
    const warn=facts.filter(c=>/ni-f warn/.test(c)), rest0=facts.filter(c=>!/ni-f warn/.test(c));
    const chips=warn.concat(rest0,skinList.map(x=>`<span class="ni-f">${esc(x)}</span>`)), rest=chips.length-2+kv.length;
    body=(chips.length||kv.length?`<div class="ni-row">${chips.slice(0,2).join("")}`
      +(rest>0?`<span class="ni-f more" data-act="info" title="Show all of them in Details">+${rest} more</span>`:"")+`</div>`:"")+pen;
  }else body=(facts.length?`<div class="ni-row">${facts.join("")}</div>`:"")+skins+pen+(kv.length?`<div class="ni-kv">${kv.join("")}</div>`:"");
  return body?`<div class="ni"${clickable?' data-act="notefields" title="Click to edit these fields"':""}>${body}</div>`:"";
}
// Split out of cardHTML so opening the editor can swap this one block instead of
// rebuilding the card around it — see syncNoteBlock.
function noteBlockHTML(a,rev){
  // The fields stay in view above the text being written, but only the text
  // edits here: they open the account form, which a click inside an open editor
  // must not do — it would take the focus the editor saves on losing.
  if(editingNote===a.id)return`<div class="c-notes editing${rev||""}"><span class="k">Notes</span>${noteFactsHTML(a,false)}`
    +`<textarea data-f="notetext" rows="3" placeholder="Anything worth remembering about this account…">${esc(noteDraft)}</textarea></div>`;
  // Always clickable, so there is no separate "add a note" action to find — an
  // empty one is just a quiet line rather than a filled box.
  // capped on the card face; whole once Details is open
  const cap=!openInfo.has(a.id), facts=noteFactsHTML(a,true,cap);
  if(a.notes||facts)return`<div class="c-notes${cap?" capped":""}" data-act="noteedit" title="Click to edit the note"><span class="k">Notes ${icon("pencil")}</span>${facts}${a.notes?`<div class="nt">${sens(esc(a.notes))}</div>`:""}</div>`;
  /* An empty note was two invitations, "Add a note" and "Honor, skins…", on nearly
     every card: twenty cards, forty prompts. It says nothing now, on a card or in an
     opened list row: Add note is in the ⋯ menu of both. */
  return"";
}
// Replace only the note block, leaving the rest of the card's DOM alone. Going
// through renderGrid meant every card on screen was thrown away and rebuilt just
// to open one textarea, which is why the portrait, the select checkbox and the
// rest of the card blinked out and came back.
function syncNoteBlock(card,a){
  const html=noteBlockHTML(a,"");
  const cur=card.querySelector(".c-notes");
  if(!html){if(cur)cur.remove();return}
  const tmp=document.createElement("div");
  tmp.innerHTML=html;
  const node=tmp.firstElementChild;
  if(cur)cur.replaceWith(node);
  else{const foot=card.querySelector(".c-foot")||card.querySelector(".rw-open>.acts");foot?foot.before(node):card.appendChild(node)}
  focusNoteEditor(card);
}
function focusNoteEditor(root){
  const ta=(root||document).querySelector('[data-f="notetext"]');
  // only when focus actually moved, or a background render yanks the caret to the
  // end while the user is still typing
  if(ta&&document.activeElement!==ta){ta.focus();try{ta.setSelectionRange(ta.value.length,ta.value.length)}catch(e){}}
}
// Manual rank entry, shared by both views rather than living inside the card.
/* Rendered disabled rather than synced after the fact, so the panel is right the
   moment it appears. Saving already threw the value away, so nothing was ever
   stored wrong from here — but a dropdown that quietly ignores you is its own kind
   of bug, and it is part of what made a division on a Challenger account look like
   something the app believed in. */
function divOff(tier){
  return hasDivisions(tier)?""
    :' disabled style="opacity:.35" title="No divisions above Master. Up there the ladder is only LP"';
}
/* A tier with no divisions gets a dash, not a greyed-out "I". Disabling the
   select said the numeral did not apply; it still left a numeral sitting there
   as if the account were Master I, which is not a rank. */
const DIV_NONE="—";
function divisionOptions(entry){
  if(!hasDivisions(entry&&entry.tier))return `<option>${DIV_NONE}</option>`;
  return ["I","II","III","IV"]
    .map(d=>`<option ${entry&&entry.division===d?"selected":""}>${d}</option>`).join("");
}
/* Rebuilt in the DOM rather than re-rendered: morph deliberately leaves an open
   rank window's fields alone — that is what keeps a half-typed LP alive — so the
   tier listener has to swap these options itself. */
function setDivisionOptions(ds,tier){
  const off=!hasDivisions(tier);
  ds.disabled=off;
  ds.style.opacity=off?".35":"";
  ds.title=off?"No divisions above Master. Up there the ladder is only LP":"";
  const want=off?[DIV_NONE]:["I","II","III","IV"];
  const have=[...ds.options].map(o=>o.textContent);
  if(have.join("|")===want.join("|"))return;   // already right; keep the value
  const keep=ds.value;
  ds.innerHTML=want.map(d=>`<option>${d}</option>`).join("");
  if(!off&&want.includes(keep))ds.value=keep;
}
// "—" is the absence of a division, never a value to store.
function readDivision(tier,el){
  const v=el?el.value:null;
  return normDivision(tier,v&&v!==DIV_NONE?v:null);
}
/* Three stacked sections with a paragraph of prose each made this the tallest
   thing on a card — and it opened from inside the ⋯ menu, so it was routinely
   opened by accident. Current is what you came for and stays open; the peak and
   the goal are set once and then left alone, so they fold behind their own
   headings using the same .sec the details drawer has always used. Their
   explanations move inside the fold, where they cost nothing until asked for. */
function rankPanelHTML(a,s,rev){
  const pm=a.peakManual, gm=a.goal;
  const numVal=v=>{const n=Number(v);return Number.isFinite(n)?esc(String(n)):""};
  const tierOpts=(sel,noneLabel)=>["UNRANKED"].concat(TIER_ORDER)
    .map(t=>`<option value="${t}" ${(sel&&(sel.tier||"").toUpperCase())===t?"selected":""}>${t==="UNRANKED"?noneLabel:t.charAt(0)+t.slice(1).toLowerCase()}</option>`).join("");
  const divOpts=divisionOptions;
  /* Every field named. These were five bare boxes in a row whose placeholders
     vanish the moment they hold a value, so a saved account showed "239" and
     "260" side by side with nothing saying which was which — and at 64px a
     three-digit count had the native spinner sitting on top of its own digits. */
  const fld=(label,control)=>`<label class="rk-f"><span>${esc(label)}</span>${control}</label>`;
  const num=(f,val,extra)=>`<input data-f="${f}" type="number" min="0"${extra||""} value="${val}">`;
  const peakBody=`<div class="rk-grid">`
    +fld("Tier",`<select data-f="ptier">${tierOpts(pm,"None")}</select>`)
    +fld("Division",`<select data-f="pdiv"${divOff(pm&&pm.tier)}>${divOpts(pm)}</select>`)
    +fld("LP",num("plp",pm&&pm.lp!=null?numVal(pm.lp):"",' max="2000"'))
    +`</div><div class="rk-note">Refresh reads op.gg's own "Top tier" peak when the profile has one, and the app also tracks the highest rank it has seen itself. Set a peak here as well if you know better. The highest of them is the one shown.</div>`;
  const goalBody=`<div class="rk-grid">`
    +fld("Tier",`<select data-f="gtier">${tierOpts(gm,"None")}</select>`)
    +fld("Division",`<select data-f="gdiv"${divOff(gm&&gm.tier)}>${divOpts(gm)}</select>`)
    +`</div><div class="rk-note">The card gets a rail showing how far there is left to go and, after two weeks of checks, roughly how long it will take at the rate this account has been climbing.</div>`;
  const tint=e=>e&&e.tier?`<span style="color:${tierColor(e.tier)}">${esc(shortRank(e)||"")}</span>`:`<span class="rk-none">not set</span>`;
  // Body only: the window around it carries the title, the ✕ and Save.
  return `<div class="rankpanel">
    <div class="rk-cur"><span class="k">Current</span><div class="rk-grid">
      ${fld("Tier",`<select data-f="tier">${["UNRANKED"].concat(TIER_ORDER).map(t=>`<option value="${t}" ${s&&(s.tier||"").toUpperCase()===t?"selected":""}>${t.charAt(0)+t.slice(1).toLowerCase()}</option>`).join("")}</select>`)}
      ${fld("Division",`<select data-f="div"${divOff(s&&s.tier)}>${divOpts(s)}</select>`)}
      ${fld("LP",num("lp",s&&s.lp!=null?numVal(s.lp):"",' max="2000"'))}
      ${fld("Wins",num("w",s&&s.wins!=null?numVal(s.wins):""))}
      ${fld("Losses",num("l",s&&s.losses!=null?numVal(s.losses):""))}
    </div></div>
    ${secHTML(a,"rkpeak","Season peak","",tint(pm),peakBody)}
    ${secHTML(a,"rkgoal","Goal","",tint(gm),goalBody)}
    ${s&&isRanked(a)?`<div class="rk-season"><button type="button" class="b-quiet" data-act="seasonreset">${icon("reset")}<span>Start a new season for this account…</span></button>
      <span class="hint">Moves today's rank into Past seasons.</span></div>`:""}
  </div>`;
}
/* Opened from the ⋯ menu, beside Account — which has always opened a window.
   Unfolding one of the two inside the card and floating the other was two
   answers to the same gesture, and the inline one was the taller of them. */
function openRankModal(id){
  const a=accounts.find(x=>x.id===id);if(!a)return;
  closeAllPanels();
  openRank.clear();openRank.add(id);
  const m=$("rankModal");
  m.dataset.id=id;
  $("rankTitle").textContent="Rank by hand";
  $("rankSub").textContent=streamerOn()?(a.label||"Riot ID hidden"):(a.label&&a.label!==a.gameName?a.label+" · ":"")+a.gameName+"#"+a.tagLine;
  renderRankBody(id,true);
  m.classList.remove("hidden");
}
// Folding Season peak or Goal open has to redraw the window's own body —
// renderCard redraws the card behind it, which is not where the panel lives.
/* `fresh` empties the body first so the patch has nothing to match against.
   It has to: morph deliberately refuses to touch a rank field while the window
   is open, which is what keeps half-typed numbers alive across a refold — and
   that same guard would otherwise hand the next account the previous one's
   values, because the fields it declines to update are exactly these. */
function renderRankBody(id,fresh){
  const a=accounts.find(x=>x.id===id);if(!a)return;
  const body=$("rankBody");
  if(fresh)body.textContent="";
  setHTML(body,rankPanelHTML(a,a.stats));
}
function closeRankModal(){
  openRank.clear();
  const m=$("rankModal");
  if(m){m.classList.add("hidden");m.removeAttribute("data-id")}
}

// A sixty-account vault is a list, not a wall. Each card is ~450 px tall, so the
// grid runs to thirteen screens and comparing two accounts means remembering one
// of them. A row is 46 px and puts the same six facts in columns you can read
// straight down. Clicking one unfolds the chart and the details under it, so
// nothing is lost — the card view stays for browsing, this is for working.
/* A blank W or L in the ✎ Rank form is stored as null — not known, as against zero
   — and both layouts coerced the pair to numbers before dividing. Five wins with the
   loss box left empty printed as "5W 0L · 100% WR": a record and a rate nobody
   entered. The figure that is known still shows; the rate waits until there is
   something to work it out from. */
function winLoss(s){
  const w=s&&s.wins!=null?Number(s.wins)||0:null;
  const l=s&&s.losses!=null?Number(s.losses)||0:null;
  const total=(w||0)+(l||0);
  return{w,l,total,wr:(w!=null&&l!=null&&total>0)?Math.round(w/total*100):null};
}
/* Highest known ladder point this season — shared by the Peak microstat and the chart
   ceiling. Sources: op.gg Top tier, this season's checks, a peak set by hand since
   the season began, and the current rank itself (season high is often where you are
   right now). Past seasons stay in Details: counted here, a card waiting on its
   placements said "Peak Challenger" as if that were this season's.
   The microstat always names that high. The chart dashed line only draws when the
   peak sits *above* current — a ceiling on top of "you are here" is noise. */
function peakInfo(a){
  const s=a.stats, all=a.history||[], from=seasonStartIdx(all), hist=all.slice(from);
  if(!isRanked(a))return{peak:null,peakV:null};
  // one set by hand before this season began was last season's
  const startT=from>0?(+all[from].t||0):0, pm=a.peakManual;
  const pmNow=pm&&(!startT||(+pm.at||0)>=startT)?pm:null;
  let bestE=null,bestV=-1;
  const cands=hist.concat([s.peak,pmNow,s].filter(Boolean));
  for(const h of cands){
    if(!h||typeof h!=="object")continue;
    if(h.found===false)continue;
    const t=(h.tier||"").toUpperCase();
    if(!t||t==="UNRANKED")continue;
    const v=ladderLP(h);if(v!==null&&v>bestV){bestV=v;bestE=h}
  }
  if(!bestE)return{peak:null,peakV:null};
  const cur=ladderLP(s);
  return{peak:shortRank(bestE),peakV:(cur===null||bestV>cur)?bestV:null};
}
function rowHTML(a,i){
  const s=a.stats, col=tierColor(s&&s.tier), isChecking=checking.has(a.id);
  const st=STATUS[a.status]||STATUS.active;
  const open=openInfo.has(a.id);
  const {w:wins,l:losses,total,wr}=winLoss(s);
  // a banned account's rank will never move again: its last change is not news here either
  const dv=a.status==="banned"?0:lastDelta(a);
  let rank="—",lp="";
  if(isChecking)rank="…";
  else if(!hasReading(s))rank=noRankLabel(a);
  else if(s.found===false)rank="Not found";
  else if(isRanked(a)){
    rank=tierLabel(s);
    if(s.lp!=null)lp=fmtN(s.lp)+" LP";
  // as the card says it: a levelling account is its level, not "Unranked"
  }else rank=notPlaced(a)?"Not placed yet":s.level?"Level "+s.level:"Unranked";
  const initial=(a.label||a.gameName||"?").trim().charAt(0).toUpperCase()||"?";
  const icon0=iconUrl(s);
  return `<div class="hx row${flashId===a.id?" flash":""}${open?" open":""}" data-id="${idAttr(a.id)}"><div class="hx-in rw${isRanked(a)?"":" rw-quiet"}${a.status==="banned"?" dead":""}${isChecking?" scanning":""}" data-id="${idAttr(a.id)}"${a.status&&a.status!=="active"&&a.status!=="banned"?` style="--st:${st.color}"`:""}>
    <div class="rw-main" data-act="info" role="button" tabindex="0" aria-expanded="${open}">
      <!-- No stopPropagation here: every click on a card is handled by one
           delegated listener on #grid, and closest("[data-act]") already stops at
           this checkbox rather than the row behind it. Blocking the bubble only
           stopped that listener from ever running, so ticking a row selected
           nothing and the bulk bar never appeared. -->
      <input type="checkbox" class="bulkchk" data-act="select" ${selected.has(a.id)?"checked":""} title="Select for bulk actions" aria-label="Select ${esc(a.label||a.gameName)}">
      <span class="rw-pic"><b aria-hidden="true">${esc(initial)}</b>${icon0?`<img src="${esc(icon0)}" alt="" loading="lazy" data-ico>`:""}${s&&s.level?`<em class="rw-lvb" title="Level ${esc(s.level)}">${esc(s.level)}</em>`:""}${isRanked(a)?`<span class="rw-crest" style="--c:${col}" title="${esc(rank)}">${crest(s.tier)}</span>`:""}</span>
      <span class="rw-id">
        <span class="rw-nm" title="${esc(plainName(a))}"><span class="nm-t">${nameOf(a)}</span>${a.fav?` <span class="rw-star">${icon("star")}</span>`:""}${a.flagged?flagMark():""}${isLive(a)&&isFailed(a)?
          // the card's "Last check failed", on the row's first line so a phone shows it too
          `<span class="rw-failed" role="img" aria-label="Last check failed" title="${esc("Last check failed. "+failReason(s.note))}">${icon("alert")}<span class="rw-failed-t">Last check failed</span></span>`:""}</span>
        <span class="rw-sub"><span class="rw-tag sens">${esc(a.gameName)}#${esc(a.tagLine)}</span>${(a.tags||[]).length?`<span class="rw-tags">${a.tags.slice(0,3).map(t=>`<i>${esc(t)}</i>`).join("")}</span>`:""}</span>
      </span>
      <span class="rw-spark">${sparkline(thisSeason(a.history),col)
        // Nothing to plot yet, so the slot offers the one thing that would change
        // that. Sixty never-checked rows used to be sixty dead lines.
        ||(!isChecked(a)&&!isChecking?`<button class="rw-check" data-act="check" title="Check this account's rank now">${icon("refresh")} Check</button>`:"")}</span>
      <span class="rw-rank" style="color:${isRanked(a)?col:"var(--muted)"}"><b>${esc(rank)}</b>${lp?`<em>${esc(lp)}</em>`:""}</span>
      <span class="rw-d">${dv?`<span class="delta ${dv>0?"d-up":"d-down"}">${dv>0?"▲ +":"▼ -"}${fmtN(Math.abs(dv))}</span>`:""}</span>
      <span class="rw-wr">${wr!==null?`<b class="${wr>=50?"wr-good":""}">${wr}%</b><span class="rw-bar"><i style="width:${wr}%;background:${col}"></i></span><em>${wlText(wins,losses)}</em>`
        :total>0?`<em>${wins!=null?fmtN(wins)+"W":fmtN(losses)+"L"}</em>`:""}</span>
      <span class="rw-rg">${esc(a.region)}</span>
      <span class="rw-up${isStale(a)||!hasReading(s)?" stale":""}">${s&&s.updatedAt?timeAgo(s.updatedAt):"never"}</span>
      <span class="rw-keys">${a.login?`<button class="rw-key" data-act="copylogin" title="Copy username" aria-label="Copy username for ${esc(plainName(a))}">${icon("user")}</button>`:""}${a.password?`<button class="rw-key" data-act="copypw" title="Copy password" aria-label="Copy password for ${esc(plainName(a))}">${icon("key")}</button>`:""}</span>
      <svg class="ico rw-chev" viewBox="0 0 24 24" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
    </div>
    ${open?`<div class="rw-open">
      ${(()=>{const p=peakInfo(a),h=thisSeason(a.history);return rankChart(h,cutoffsFor(a.region),chartRange.get(a.id)||defaultRange(h),a.id,p.peakV,p.peak)})()}
      ${infoBlockHTML(a)||""}
      ${noteBlockHTML(a,"")}
      <!-- The card's own words and controls. It was the app before every clean-up:
           Login, OP.GG ↗, Refresh, Rank, Edit, Archive and Delete in a row of seven,
           "Add a note" and "Honor, skins…" on every empty note, and a login panel
           of its own. The ⋯ menu holds the rest, the same menu as a card's. -->
      <div class="acts">${loginButtonsHTML(a,openLogin.has(a.id))}${moreButtonHTML(a)}</div>
      ${openLogin.has(a.id)?loginPanelHTML(a,""):""}
    </div>`:""}
  </div></div>`;
}
/* The third layout. Cards are thirteen screens of a sixty-account vault and the
   list is four; neither ever shows you the collection as a collection. A tile is
   the portrait, the crest and the rank, and sixty of them fit on one screen.
   It is for finding, not for working — clicking one drops you back into the card
   view at that account, which is where everything else lives. */
function tileHTML(a){
  const s=a.stats, col=tierColor(s&&s.tier);
  const initial=(a.label||a.gameName||"?").trim().charAt(0).toUpperCase()||"?";
  const icon0=iconUrl(s);
  let rank="Never checked",lp="";
  if(checking.has(a.id))rank="…";
  else if(!hasReading(s))rank=noRankLabel(a);
  else if(s.found===false)rank="Not found";
  else if(isRanked(a)){
    rank=tierLabel(s);
    if(s.lp!=null)lp=fmtN(s.lp)+" LP";
  // as the card says it: a levelling account is its level, not "Unranked"
  }else rank=notPlaced(a)?"Not placed yet":s.level?"Level "+s.level:"Unranked";
  const st=STATUS[a.status]||STATUS.active;
  return `<div class="hx${flashId===a.id?" flash":""}" data-id="${idAttr(a.id)}"><div class="hx-in tile${isRanked(a)?"":" rw-quiet"}${a.status==="banned"?" dead":""}${checking.has(a.id)?" scanning":""}" data-id="${idAttr(a.id)}" data-act="zoom" role="button" tabindex="0" title="${esc(plainName(a)+" · "+rank+(lp?" · "+lp:""))}"${a.status&&a.status!=="active"&&a.status!=="banned"?` style="--st:${st.color}"`:""}>
    ${isRanked(a)?`<span class="c-tint" style="--tier:${col}"></span>`:""}
    <span class="t-pic"><b aria-hidden="true">${esc(initial)}</b>${icon0?`<img src="${esc(icon0)}" alt="" loading="lazy" data-ico>`:""}
      ${s&&s.level?`<em class="t-lv">${esc(s.level)}</em>`:""}
      ${isRanked(a)?`<span class="t-crest">${crest(s.tier)}</span>`:""}</span>
    <span class="t-nm">${a.fav?`<span class="rw-star">${icon("star")}</span>`:""}<span class="nm-t">${nameOf(a)}</span>${a.flagged?flagMark():""}</span>
    <span class="t-rk" style="color:${isRanked(a)?col:"var(--muted)"}">${esc(rank)}</span>
    ${lp?`<span class="t-lp">${esc(lp)}</span>`:""}
  </div></div>`;
}
function cardHTML(a,i){
  const s=a.stats, col=tierColor(s&&s.tier), isChecking=checking.has(a.id);
  /* The header's "N need a refresh", its filter and the list all go by isStale.
     The card had a rule of its own, so a banned account (never checked again, so it
     ages forever) and a Riot ID that came back not found wore an amber "out of
     date" warning the toolbar didn't count and Refresh stale wouldn't touch. */
  const stale=isStale(a);
  const hist=a.history||[];
  const st=STATUS[a.status]||STATUS.active;
  let peak=null,peakV=null;
  {const p=peakInfo(a);peak=p.peak;peakV=p.peakV}
  let deltaChip="";
  /* A banned account's rank will never move again, so its last movement is not
     news: a closed account wore a green "+82 LP" and a win-streak chip as if it
     were climbing. It keeps the chips about the record itself (duplicate ID,
     uncertain reading), and loses the Refresh beside its timestamp, since checks
     skip it anyway. */
  const dead=a.status==="banned";
  // Same rule as the list row: lastDelta() already knows about season breaks and
  // Unranked ends. Subtracting raw ladderLP() here invented crash chips the list
  // correctly suppressed.
  {
    const dv=lastDelta(a);
    if(dv&&!dead)deltaChip='<span class="delta '+(dv>0?"d-up":"d-down")+'" title="Since previous check">'+(dv>0?"▲ +":"▼ -")+fmtN(Math.abs(dv))+' LP</span>';
    /* "+87 LP" over what? Said under the chip now, with the pace beside it: the
       pace had a whole row of the card to itself ("Climb · +21 LP/day"), and
       without "since last check" the two numbers read as a contradiction. */
    // The pace ("+20 LP/day") was a fourth way of saying "going up", beside this chip,
    // the chart and the goal: it is in the chart's tip on the newest point now (paceText).
    if(dv&&!dead)deltaChip+=`<span class="d-cap" title="Since previous check"><span>since last check</span></span>`;
  }
  /* There was a flame "Climbing" chip here too (LP up three checks running). It was
     the fourth way the card said "going up", beside the +LP chip, the Climb figure
     and the chart's own line, and the only orange anywhere in the app. */
  /* The corner under the LP change held up to four more chips (a streak, decay,
     "Rotate", a win-rate trend), three or four to a card and in a different order
     on each. It keeps the one that matters most now: decay, which costs LP, then a
     streak, then a long idle. A Riot ID shared by two cards or a reading op.gg
     didn't confirm are data problems, rare, and still always said. The win-rate
     trend moved beside the win rate it is about. */
  const signals=[];
  {
    const dd=dead?null:decayDays(a);
    if(dd!==null&&dd<=7){
      const r=DECAY_RULES[(a.stats.tier||"").toUpperCase()];
      const why=`Estimated from the games seen between checks. A ranked game banks ${r.per===1?"1 day":r.per+" days"}, up to ${r.cap}; past that the account loses ${r.lp} LP a day.`;
      signals.push(dd<0?`<span class="delta d-down" title="${esc(why)}">${icon("alert")} Decaying</span>`
        :`<span class="delta d-warn" title="${esc(why)}">${icon("alert")} Decay in ${decayIn(dd)}</span>`);
    }
  }
  {const st=!dead&&streakOf(a);if(st)signals.push(`<span class="delta ${st.win?"d-up":"d-down"} streak" title="The last ${st.n} ranked games were all ${st.win?"wins":"losses"}">${st.n}${st.win?"W":"L"} streak</span>`)}
  {
    const d=rotationDays(a);
    // "Rotate · 54d" meant nothing without the Help page; this says it
    if(needsRotation(a))signals.push(`<span class="delta" title="No game, login or check here in ${d} days">Idle ${d} days</span>`);
  }
  if(signals.length)deltaChip+=signals[0];
  if(isDuplicate(a))deltaChip+='<span class="delta" title="Another card shares this Riot ID + region">Duplicate ID</span>';
  if(isUncertain(a))deltaChip+='<span class="delta" title="Parsed without op.gg meta description">Uncertain</span>';
  const tr=!dead&&wrTrend(a), wrTr=tr&&Math.abs(tr.d)>=3
    ?` <span class="wr-tr ${tr.d>0?"d-up":"d-down"}" title="Win rate against about four checks ago">${tr.d>0?"▲":"▼"}${Math.abs(tr.d)}</span>`:"";
  const {w:wins,l:losses,total,wr}=winLoss(s);
  // whichever of the two is known — printing both from coerced numbers is what put
  // an invented "0L" beside a real win count
  const wlTxt=[wins!=null?`<b>${fmtN(wins)}W</b>`:"",losses!=null?`<b>${fmtN(losses)}L</b>`:""].filter(Boolean).join(" ");
  // Both profile links live in the ⋯ menu's "Look up" group now.
  // Tier and LP are separate on purpose: the tier carries the card's type scale,
  // the LP sits under it as the companion figure — shortRank() glues them for
  // places that need one string (list, palette, Peak).
  let tierTxt="",lpTxt="";
  if(s&&s.tier){
    tierTxt=tierLabel(s);
    if(s.lp!==null&&s.lp!==undefined)lpTxt=fmtN(s.lp)+" LP";
  }
  // On an account that isn't ranked yet the level is the whole story, so it gets
  // the headline slot. Printing "Unranked" in 26 px and tucking "Level 97" into a
  // 10 px caption underneath answered the question nobody asked, in the larger type.
  // ...unless it has had a rank: then it is waiting on placements, not levelling
  const prevSeason=notPlaced(a)?lastSeasonHTML(a):"";
  const levelLed=!!(s&&s.found!==false&&!isRanked(a)&&s.level&&!prevSeason);
  let rankBlock;
  if(isChecking)rankBlock=`<div class="wl"><span class="spin">${icon("refresh")}</span> Checking rank…</div>`;
  // A card never checked had no way to check it but the ⋯ menu, the one card that
  // most needs it. A failed one has its Refresh on the meta line; banned ones are skipped.
  else if(!hasReading(s))rankBlock=`<div class="rk c-unchecked">${noRankLabel(a)}</div>`
    +(!dead&&!isFailed(a)?`<div class="wl"><button type="button" class="c-check" data-act="check" title="Check this account's rank now">${icon("refresh")}Check rank</button></div>`:"");
  // amber like the header's warning: a Riot ID op.gg doesn't know is usually one to
  // correct, so the line is the way to correct it, not only the advice to
  else if(s.found===false)rankBlock=`<div class="wl c-miss">${icon("alert")}<span>Not found on op.gg</span><button type="button" class="c-fix" data-act="edit">Fix Riot ID</button></div>`;
  else if(levelLed)rankBlock=`<div class="rk c-lvl">Level <span class="rk-lp">${esc(s.level)}</span></div>
    ${s.level>=30?`<div class="wl"><span class="ready" title="Level 30 reached. Ranked also needs 20 champions owned, which the app cannot see.">Ready for ranked</span></div>`:""}`;
  else if(prevSeason)rankBlock=`<div class="rk c-unplaced">Not placed yet this season</div><div class="wl c-lastseason">${prevSeason}</div>`;
  else if(!isRanked(a))rankBlock=`<div class="rk" style="color:${col}"><span class="rk-main"><span class="rk-t">Unranked</span></span></div>
    <div class="wl">${total>0?wlTxt+(wr!==null?` · <span class="wrv ${wr>=50?"wr-good":""}">${wr}% WR</span>${wrTr}`:""):"No ranked games found"}</div>`;
  else rankBlock=`<div class="rk" style="color:${col}">${crest(s.tier,"rk-crest")}<span class="rk-main"><span class="rk-t">${esc(tierTxt)}</span>${lpTxt?`<span class="rk-lp">${esc(lpTxt)}</span>`:""}</span></div>
    <div class="wl">${total>0?wlTxt+(wr!==null?` · <span class="wrv ${wr>=50?"wr-good":""}">${wr}% WR</span>${wrTr}`:""):"No ranked games found"}</div>`;
  // Peak / Level / MMR are unrelated facts — label them instead of running them
  // together in one muted sentence.
  const microStats=[];
  if(s&&s.found!==false){
    // Only a peak above today's rank is news. At the top of its climb the card
    // said "Platinum II · 61 LP" twice, a few lines apart.
    if(peak&&peakV!=null)microStats.push(["Peak",peak]);
    // Level is no longer one of these — it belongs to the identity, not to the
    // performance figures, and it now rides on the portrait the way op.gg does it.
    // How far the climb still is, against today's floor. Only for Master+, where
    // it's the only thing left that "next rank" can mean.
    {
      const cut=cutoffsFor(a.region), cur=ladderLP(s);
      const mBase=TIER_ORDER.indexOf("MASTER")*TIER_SPAN;
      if(cut&&cur!==null&&cur>=mBase){
        const lp=cur-mBase;
        // gm can be missing when the ladder scrape only found Challenger — treating
        // null as 0 made Master cards claim "To Grandmaster −400 LP".
        // "To Grandmaster 1762 LP" read as the cutoff as easily as the distance to it
        if(cut.gm!=null&&lp<cut.gm)microStats.push(["To Grandmaster",fmtN(cut.gm-lp)+" LP to go"]);
        else if(cut.chall!=null&&lp<cut.chall)microStats.push(["To Challenger",fmtN(cut.chall-lp)+" LP to go"]);
        else if(cut.chall!=null)microStats.push(["Above","the Challenger cutoff"]);
      }
    }
    {
      const g=gamesSince(hist);
      if(g)microStats.push(["Since last check",fmtN(g.n)+(g.n===1?" game · ":" games · ")+wlText(g.w,g.l)]);
      // the pace ("Climb") sits under the LP chip now, beside "since last check"
    }
    if(s.mmr)microStats.push(["MMR est.",s.mmr]);
    if(s.avgRecent)microStats.push(["Recent avg",s.avgRecent]);
  }
  const loginOpen=openLogin.has(a.id);
  const rv=block=>reveal===a.id+":"+block?" reveal":"";
  const initial=(a.label||a.gameName||"?").trim().charAt(0).toUpperCase()||"?";
  // Active is the default state of almost every account, so railing it green just
  // paints the same stripe down the whole grid and says nothing. Only the states
  // worth spotting get one.
  const railed=a.status&&a.status!=="active"&&a.status!=="banned"; // banned says it with its badge and strikethrough
  const icon0=iconUrl(s);
  return `<div class="hx${flashId===a.id?" flash":""}" data-id="${idAttr(a.id)}" style="--d:${(i||0)*40}ms"><div class="hx-in card${a.status==="banned"?" dead":""}${isChecking?" scanning":""}${openInfo.has(a.id)?" info-open":""}" data-id="${idAttr(a.id)}"${railed?` style="--st:${st.color}"`:""}>
    ${champArtHTML(a)}${isRanked(a)?`<span class="c-tint" style="--tier:${col}"></span>`:""}
    <div class="c-head">
      <div class="c-portrait">
        <span class="c-initial">${esc(initial)}</span>
        ${icon0?`<img class="c-avatar" src="${esc(icon0)}" alt="" loading="lazy" data-ico>`:""}
        <!-- no tier crest here any more: it earns its place beside the rank
             itself, and two of them on one card is one too many -->
        ${""}
        ${s&&s.found!==false&&s.level&&!levelLed?`<span class="c-lvbadge" title="Summoner level">${esc(s.level)}</span>`:""}
      </div>
      <div class="c-id">
        <!-- the name is ellipsised at the card's width, so the full one has to be
             available somewhere; hovering is the only place left for it -->
        <div class="c-name"><span title="${esc(plainName(a))}"${a.label?"":' class="sens"'}>${esc(a.label||a.gameName)}</span>${a.flagged?flagMark():""}${a.status&&a.status!=="active"?`<span class="stchip" style="color:${st.color};background:${st.color}1f" title="${esc(st.label)}">${esc(st.short||st.label)}</span>`:""}</div>
        <button class="rid" data-act="copyid" title="Copy Riot ID"><span class="sens">${esc(a.gameName)}<b>#${esc(a.tagLine)}</b></span></button>
      </div>
      <div class="c-chrome">
        <input type="checkbox" class="bulkchk" data-act="select" ${selected.has(a.id)?"checked":""} title="Select for bulk actions" aria-label="Select for bulk actions">
        <button class="star ${a.fav?"on":""}${rv("fav")}" data-act="fav" title="Favorite">${icon("star")}</button>
        <span class="regiontag">${esc(a.region)}</span>
      </div>
    </div>
    <div class="c-rank">
      <div class="c-rk-l">${rankBlock}</div>
      ${deltaChip?`<div class="c-deltas">${deltaChip}</div>`:""}
    </div>
    ${wr!==null&&s&&s.found!==false?`<div class="wrbar"><i style="width:${wr}%;background:${col}"></i></div>`:""}
    ${levelLed&&s.level<30?levelTrackHTML(a):""}
    ${(()=>{
      // The goal rail. Only drawn once there is a goal — an account with nothing to
      // climb towards should not be shown an empty progress bar.
      const g=goalProgress(a);
      if(!g)return "";
      // Anchor at the start of the current climb window (after the last season
      // break), not history[0] — otherwise a year-old Iron point makes Diamond
      // look 95% done while you are still 400 LP away.
      const hist=a.history||[];
      let fromIdx=0;
      for(let i=1;i<hist.length;i++)if(seasonBreak(hist[i-1],hist[i]))fromIdx=i;
      const from=ladderLP(hist[fromIdx])??g.cur;
      const span=Math.max(g.target-Math.min(from,g.cur),1);
      const pct=g.done?100:Math.max(0,Math.min(100,Math.round((g.cur-Math.min(from,g.cur))/span*100)));
      const gcol=tierColor(a.goal.tier);
      return `<div class="goal${g.done?" hit":""}" title="Goal: ${esc(g.label)}">
        <div class="goal-h"><span class="k">Goal</span><span class="goal-t" style="color:${gcol}">${esc(g.label)}</span>
          <span class="goal-r">${g.done?"reached":fmtN(g.gap)+" LP to go"+(g.eta?" · "+esc(g.eta):"")}</span></div>
        <div class="goal-bar"><i style="width:${pct}%;background:${gcol}"></i></div>
      </div>`;
    })()}
    ${(h=>rankChart(h,cutoffsFor(a.region),chartRange.get(a.id)||defaultRange(h),a.id,peakV,peak))(thisSeason(hist))}
    ${microStats.length?`<div class="c-stats n${microStats.length}">${microStats.map(([k,v])=>`<div><span class="k">${esc(k)}</span><span class="v">${esc(v)}</span></div>`).join("")}</div>`:""}
    ${s&&s.note&&!isFailed(a)?`<div class="meta">${esc(s.note)}</div>`:""}
    ${(()=>{const role=mainRole(a),tags=a.tags||[];
      return role||tags.length?`<div class="ctags">${role?`<span class="role-tag" title="Played in 3 or more of the last 5 ranked games">${esc(role)}</span>`:""}${tags.map(t=>`<span>${esc(t)}</span>`).join("")}</div>`:""})()}
    ${loginOpen?loginPanelHTML(a,rv("login")):""}
    ${noteBlockHTML(a,rv("note"))}
    <div class="c-foot">
      <!-- Where the numbers came from used to sit here as its own pill. It is
           developer detail: it never changes what you would do next, and it took a
           slot on every card in the vault. It hangs off the timestamp instead. -->
      ${(()=>{
        /* What is normal goes unsaid. "Updated 4 h ago" sat on every card in the vault
           and only matters once a reading is old: it shows past a day, in amber past
           three (the header counts those). Refresh sits beside it then, and beside a
           failed check; otherwise it is in the ⋯ menu, with Check all and auto-check
           covering the rest. */
        const old=!!(s&&s.updatedAt&&Date.now()-s.updatedAt>864e5), failed=isLive(a)&&isFailed(a);
        const parts=(old?`<span class="upd${stale?" stale":""}"${s&&(s.asOf||s.source)?` title="Read from ${esc([s.asOf,s.source&&s.source!=="meta"?s.source:null].filter(Boolean).join(" · "))}"`:""}>${(stale?icon("alert"):"")+"Updated "+timeAgo(s.updatedAt)}</span>`:"")
          +((old||failed)&&a.status!=="banned"?`<button class="c-ref" data-act="check" ${isChecking?"disabled":""} title="Check this account's rank now" aria-label="Refresh rank">${isChecking?`<span class="spin">${icon("refresh")}</span>`:icon("refresh")}</button>`:"")
          +(failed?`<span class="c-failed" title="${esc(failReason(s.note))}">${icon("alert")}Last check failed</span>`:"")
          +(a.lastLoginAt?`<span class="src" title="The last time you copied or looked at this account's login here">Last login ${esc(timeAgo(a.lastLoginAt))}</span>`:"");
        return parts?`<span class="c-meta">${parts}</span>`:"";
      })()}
      <!-- Three buttons, not five, and the ⋯ no longer unfolds a second toolbar
           into the card: it opens one shared floating menu (see cardMenuHTML).
           DPM moved in there with the rest — it is an outbound link you follow
           occasionally, not one of the three things you do on a card. -->
      <div class="acts">
        <!-- A key, not a person: a person beside "Login" read as "sign in to this
             app". Refresh moved up beside "Updated 2 h ago", the thing it changes;
             here it weighed nearly as much as Login, which is what a card is for. -->
        ${loginButtonsHTML(a,loginOpen)}
        ${moreButtonHTML(a)}
      </div>
    </div>
    ${openInfo.has(a.id)&&(hasInfo(a)||canForm(a))?infoBlockHTML(a,rv("info")):""}
    ${openInfo.has(a.id)||hasInfo(a)||cardHidden().some(k=>k!=="wl")||canForm(a)?(open=>`<button class="c-drawer${open?" on":""}" data-act="info" aria-expanded="${open}" title="${esc(drawerTitle())}">
      <span class="c-dl" aria-hidden="true"></span>
      <span class="c-dt">${open?"Close":"Details"}</span>
      <svg class="ico" viewBox="0 0 26 12" aria-hidden="true"><polyline points="2 3 13 10 24 3"/></svg>
      <span class="c-dl" aria-hidden="true"></span>
    </button>`)(openInfo.has(a.id)):""}
  </div></div>`;
}

/* ---------- the card's ⋯ menu ----------
   One floating element shared by every card, rather than a second row of buttons
   folded into each one.

   Inline it was a toolbar wearing a menu's clothes: it shoved the card's own
   content down the moment it appeared, it stayed open until you found the ⋯
   again, and Rank lives in it — so a single missclick opened a second, much
   larger panel underneath, and undoing one wrong click cost two right ones in two
   different places.

   It cannot simply become a popover *inside* the card either: .card is
   overflow:hidden (the tier tint and the status rail need it), so anything
   anchored to a footer button is cut off at the card's edge. Same answer as the
   colour miniature and the chart tooltip — one fixed element on the body,
   positioned against whatever asked for it. The card's markup never changes when
   the menu opens, so the card never reflows at all. */
let cardMenuAnchor=null;
function cardMenuHTML(a){
  const dpm="https://dpm.lol/"+encodeURIComponent(a.gameName)+"-"+encodeURIComponent(a.tagLine);
  const opgg="https://op.gg/lol/summoners/"+(REGIONS[a.region]||REGIONS.EUW).opgg+"/"+encodeURIComponent(a.gameName)+"-"+encodeURIComponent(a.tagLine);
  /* Grouped by what the items are, ordered by how often you reach for them, and
     each group named rather than merely separated — a hairline says "these two
     things are apart" without ever saying what either of them is.
     No account name at the top any more: the menu is anchored to the card you
     clicked, so it was repeating something already on screen — and being the
     one row that was not an item, it was also the row that got clipped when the
     list needed to scroll. */
  const grp=t=>`<div class="cm-g">${esc(t)}</div>`;
  const it=(act,ico,label,extra)=>
    `<button data-act="${act}" role="menuitem"${extra||""}>${icon(ico)}<span>${esc(label)}</span></button>`;
  return `<div class="hx-in cm-in">`
    +grp("Edit")
    +it("rank","rank","Rank…")
    +it("edit","pencil","Account…")   // the person is the username's mark
    +it("noteedit","note",a.notes?"Edit note":"Add note")
    +it("art","image","Card art…")
    // Both profile links together. op.gg used to sit in the footer while dpm.lol
    // sat in here, which split one kind of thing across two places.
    +grp("Look up")
    // the card shows its own Refresh only once a reading is old or a check failed
    +(a.status==="banned"?"":it("check","refresh","Refresh rank"))
    +`<a class="cm-link" href="${opgg}" target="_blank" rel="noreferrer" role="menuitem">${icon("external")}<span>op.gg</span></a>`
    +`<a class="cm-link" href="${dpm}" target="_blank" rel="noreferrer" role="menuitem">${icon("external")}<span>dpm.lol</span></a>`
    +grp("Mark")
    +it("played","check","Played today",' title="Mark that you played on this account today"')
    +it("flag","flag",a.flagged?"Clear the flag":"Flag for attention")
    +it("compare","compare","Compare…")
    /* Twelve actions under five headings. "Season reset…" is about the rank and
       lives at the foot of the Rank window now; "Exclude from stats" is a setting
       of the account and is in its form, under More details. */
    +grp("Vault")
    +it(a.archived?"unarchive":"archive","archive",a.archived?"Unarchive":"Archive")
    +`<button data-act="del" class="b-danger" role="menuitem">${icon("trash")}<span>${armedDelete===a.id?"Sure? Click again":"Delete account"}</span></button>`
  +`</div>`;
}
function ensureCardMenu(){
  let el=$("cardMenu");
  if(el)return el;
  el=document.createElement("div");
  el.id="cardMenu";
  el.className="card-menu hx teal hidden";
  el.setAttribute("role","menu");
  document.body.appendChild(el);
  // The same delegated handler the grid uses — the menu carries the account's
  // data-id, so every branch resolves exactly as it does from inside a card.
  el.addEventListener("click",onCardClick);
  el.addEventListener("keydown",onCardMenuKey);
  return el;
}
/* A menu is somewhere the keyboard goes, not only something it can open. This one
   is appended to <body>, so in tab order it came after every card in the vault,
   and nothing ever moved focus into it — which left Rank, Account, Archive and
   Delete, all of which live only in here in the card layout, out of reach without
   a mouse. Arrows walk it, Escape and Tab leave it from the ⋯ that opened it. */
function cardMenuItems(){const m=$("cardMenu");return m?[...m.querySelectorAll('[role="menuitem"]')]:[]}
function focusCardMenuItem(i){
  const items=cardMenuItems();
  if(items.length)items[((i%items.length)+items.length)%items.length].focus();
}
function onCardMenuKey(e){
  const at=cardMenuItems().indexOf(document.activeElement);
  if(e.key==="ArrowDown"||e.key==="ArrowUp"){e.preventDefault();focusCardMenuItem(at<0?0:at+(e.key==="ArrowDown"?1:-1))}
  else if(e.key==="Home"){e.preventDefault();focusCardMenuItem(0)}
  else if(e.key==="End"){e.preventDefault();focusCardMenuItem(-1)}
  // the page's own Escape would go on to fold the card's panels as well
  else if(e.key==="Escape"){e.preventDefault();e.stopPropagation();closeCardMenu()}
  // focus is back on the ⋯ by the time Tab's default runs, so it carries on from the card
  else if(e.key==="Tab")closeCardMenu();
}
function renderCardMenu(){
  const id=[...openMore][0];
  const el=$("cardMenu");
  if(!id){if(el){el.classList.add("hidden");el.removeAttribute("data-id")}return}
  const a=accounts.find(x=>x.id===id);
  if(!a){closeCardMenu();return}
  const m=ensureCardMenu();
  m.dataset.id=id;
  setHTML(m,cardMenuHTML(a));
  m.classList.remove("hidden");
  placeCardMenu();
}
function placeCardMenu(){
  const m=$("cardMenu");
  if(!m||m.classList.contains("hidden"))return;
  const anchor=cardMenuAnchor;
  if(!anchor||!anchor.isConnected)return;
  const r=anchor.getBoundingClientRect(), pad=8, gap=6;
  /* offsetWidth/offsetHeight, not getBoundingClientRect: what is computed here is
     written to style.left/top, and those are CSS pixels. offsetWidth is the same
     unit; a client rect is post-transform screen pixels. Browser zoom scales the
     CSS pixel itself so the two agree there — they only diverge under an actual
     ancestor transform, and then it is the CSS-pixel pair that stays right. */
  const w=m.offsetWidth||232, h=m.offsetHeight||300;
  // Right-aligned to the ⋯ and opening upward: the footer sits at the bottom of
  // the card, so upward is where the room is. Flips down only when it isn't.
  let left=r.right-w, top=r.top-h-gap;
  if(top<pad)top=r.bottom+gap;
  if(top+h>window.innerHeight-pad)top=Math.max(pad,window.innerHeight-h-pad);
  if(left<pad)left=pad;
  if(left+w>window.innerWidth-pad)left=Math.max(pad,window.innerWidth-w-pad);
  m.style.left=Math.round(left)+"px";
  m.style.top=Math.round(top)+"px";
}
/* Tracking listeners exist only while the menu is open — this app sits in a
   background tab for days, and a permanent scroll listener is exactly the idle
   cost the rest of this file works to avoid. */
function cardMenuTrack(){
  const a=cardMenuAnchor;
  if(!a||!a.isConnected){closeCardMenu();return}
  const r=a.getBoundingClientRect();
  if(r.bottom<0||r.top>window.innerHeight){closeCardMenu();return}
  placeCardMenu();
}
function bindCardMenuTracking(on){
  if(on){
    window.addEventListener("scroll",cardMenuTrack,true);
    window.addEventListener("resize",cardMenuTrack);
  }else{
    window.removeEventListener("scroll",cardMenuTrack,true);
    window.removeEventListener("resize",cardMenuTrack);
  }
}
// `focusFirst` when the keyboard opened it: the menu is where the keyboard goes next.
function openCardMenu(id,anchor,focusFirst){
  const others=[...openMore].filter(x=>x!==id);
  openMore.clear();openMore.add(id);
  cardMenuAnchor=anchor||null;
  for(const x of others)if(accounts.some(a=>a.id===x))renderCard(x);
  renderCard(id);          // presses the ⋯ and flips aria-expanded
  renderCardMenu();
  if(window.requestAnimationFrame)requestAnimationFrame(placeCardMenu); // measure once laid out
  bindCardMenuTracking(true);
  if(focusFirst)focusCardMenuItem(0);
}
function closeCardMenu(){
  if(!openMore.size&&!cardMenuAnchor)return false;
  const ids=[...openMore], anchor=cardMenuAnchor;
  openMore.clear();cardMenuAnchor=null;
  const el=$("cardMenu");
  // A focused item about to be hidden drops focus to <body>, and the keyboard
  // starts over from the top of the page. It goes back to the ⋯ instead.
  const hadFocus=!!(el&&el.contains(document.activeElement));
  if(el){el.classList.add("hidden");el.removeAttribute("data-id")}
  bindCardMenuTracking(false);
  for(const id of ids)if(accounts.some(a=>a.id===id))renderCard(id);
  if(hadFocus&&anchor&&anchor.isConnected)anchor.focus();
  return true;
}
/* Login is the only panel that still unfolds inside a card — ✎ Rank opens a
   window now, so there is nothing left for it to stack against. Kept as its own
   function because opening it also has to put the revealed password away. */
function togglePanel(id,which){
  const on=!openLogin.has(id);
  openLogin.delete(id);
  if(on)openLogin.add(id);
  shownPw.delete(id);
  return on;
}
// Escape's "put this card back the way it was", and what a click on the page
// outside any card falls through to.
function closeCardPanels(){
  let touched=closeCardMenu();
  if(openRank.size){closeRankModal();touched=true}
  const ids=new Set([...openLogin,...openInfo]);
  if(ids.size){
    openLogin.clear();openInfo.clear();shownPw.clear();
    touched=true;
    for(const id of ids)if(accounts.some(a=>a.id===id))renderCard(id);
  }
  return touched;
}

/* The rank-sorted list as a flat sequence with a heading before each new tier.
   Sixty rows of identical grey is a wall you scroll past; the headings are what
   turn the same sixty rows into a ladder you can read down.
   Favourites used to have a band of their own at the top, which pulled a favourite
   Platinum account out of Platinum: with one Platinum account there was then no
   Platinum heading at all, and the grouping stopped saying what it said. They sit
   at the top of their own tier now, with the star on the row.
   And a heading is only worth its line when tiers hold more than one account: five
   accounts in five tiers came out as five headings for five rows. Headings are kept
   while the list averages two rows a tier, for every tier, so a lone row never
   looks like it belongs to the heading above it. */
function groupRank(k){const i=TIER_ORDER.indexOf(k);return i>=0?100+i:({UNPLACED:4,UNRANKED:3,MISSING:2,UNCHECKED:1})[k]||0}
function withGroups(list){
  const buckets=new Map();
  for(const a of list){const k=listGroup(a);if(!buckets.has(k))buckets.set(k,[]);buckets.get(k).push(a)}
  const keys=[...buckets.keys()].sort((x,y)=>groupRank(y)-groupRank(x));
  const headed=list.length>=2*keys.length;
  const out=[];
  for(const k of keys){
    const rows=buckets.get(k).sort((x,y)=>(y.fav?1:0)-(x.fav?1:0)); // stable: favourites first, then rank order
    if(headed)out.push({id:"grp:"+k,group:k,n:rows.length});
    out.push(...rows);
  }
  return out;
}
function listHeadHTML(){
  return `<div class="rw-head" data-id="rw:head" aria-hidden="true"><span class="h-chk"></span><span></span>`
    +`<span>Account</span><span>Trend</span><span>Rank</span><span>Change</span><span class="h-wr">Win rate</span>`
    +`<span class="h-rg h-c">Region</span><span class="h-up h-r">Updated</span><span class="h-r">Copy</span><span></span></div>`;
}
function groupHTML(g){
  const c=groupColor(g.group);
  const mark=CRESTS[g.group]?crest(g.group,"lgrp-crest")
    :`<span class="lgrp-dot" style="background:${c}"></span>`;
  return `<div class="lgrp" data-id="${idAttr(g.id)}" role="presentation">${mark}`
    +`<span class="lgrp-n" style="color:${c}">${esc(groupLabel(g.group))}</span>`
    +`<span class="lgrp-ln"></span><span class="lgrp-k">${g.n}</span></div>`;
}
function renderGrid(){
  const list=filtered();
  /* A selection can only be made from what is on screen, and it has no business
     outliving it. Archiving an account, or flipping to the Archived view, used to
     leave it selected and out of sight — the bar went on counting it, and Delete
     selected reached straight past the grid to accounts nobody could see, behind a
     confirm that names a number rather than the accounts. Select two, click
     Archived, and "Delete selected" emptied the active view you had just left.
     Anything that leaves the view leaves the selection with it, which covers the
     search and the filters as well as the archive toggle. */
  if(selected.size){
    const inView=new Set(list.map(a=>a.id));
    const before=selected.size;
    selected.forEach(id=>{if(!inView.has(id))selected.delete(id)});
    // The remembered anchor is a position in a list that has just changed shape, so
    // shift-clicking against it would sweep a range nobody picked.
    if(selected.size!==before)lastSelectedId=null;
  }
  const grid=$("grid");
  /* An empty vault has nothing to search, sort, filter, select or check, and the
     toolbar's Add account was the welcome's own button said a second time. The
     welcome is the whole first screen; the toolbar arrives with the first account. */
  document.querySelector(".console").classList.toggle("hidden",accounts.length===0);
  if(accounts.length===0){
    /* The first screen anyone sees. It was one grey sentence pointing at a button
       somewhere else on the page, with the demo as the only thing to press here.
       Now it says what the app is for in three steps, and both ways in are buttons
       of their own: start for real, or look around first. */
    setHTML(grid,`<div class="hx" data-k="empty" style="grid-column:1/-1"><div class="hx-in empty welcome"><div class="d"><span class="brand-mark" aria-hidden="true"></span></div>`
      +`<h2 class="wl-t">No accounts yet</h2><p class="wl-s">Add your accounts to keep their ranks and logins in one place.</p>`
      +`<ol class="wl-steps"><li><span class="wl-n">1</span><b>Add an account</b><span>Its Riot ID and region. The login is optional.</span></li>`
      +`<li><span class="wl-n">2</span><b>Check its rank</b><span>Free and automatic, read from op.gg. No key needed.</span></li>`
      +`<li><span class="wl-n">3</span><b>Log in fast</b><span>Copy username, then Copy password: one click each, on the card.</span></li></ol>`
      +`<div class="wl-acts"><button id="bEmptyAdd" class="b-fill">+ Add account</button><button id="bDemo">${icon("eye")} Preview with example data</button></div>`
      +`<p class="wl-note">${icon("lock")}<span>Logins, passwords and notes stay in this browser. A rank check sends only the Riot ID to op.gg, through a public proxy. Clearing the browser's data clears the vault too, so keep a backup.</span></p></div></div>`);
  }else if(list.length===0){
    /* The zero-accounts state offers Add account and the demo; this one used to
       be a sentence and nothing else — on a page where the filters are spread
       over a dropdown row, a ribbon segment, a tag drawer and a search box, so
       "which one is hiding everything?" was a hunt. */
    setHTML(grid,`<div class="hx" data-k="nomatch" style="grid-column:1/-1"><div class="hx-in empty">No accounts match the current filters.<div style="margin-top:12px"><button id="bClearFilters">Clear filters</button></div></div></div>`);
  }else{
    const layout=ui.density==="list"?"list":ui.density==="wall"?"wall":"cards";
    const asList=layout==="list";
    grid.classList.toggle("list",asList);
    grid.classList.toggle("wall",layout==="wall");
    // A row, a card and a tile share no structure worth patching into each other,
    // so switching layout starts from nothing rather than diffing one into another.
    // Switching layout throws every card node away, taking the ⋯ menu's anchor
    // with it — and the menu is a floating element that would otherwise be left
    // hanging over a grid it no longer points into.
    if(grid.dataset.layout!==layout){closeCardMenu();grid.textContent="";cardCache.clear();grid.dataset.layout=layout}
    // Grouped only when the list is actually in rank order — under any other sort
    // the headings would be scattered through the list and mean nothing.
    const grouped=asList&&ui.sort==="rank"?withGroups(list):list;
    // the list's column headings, so a figure says what it is without a hover
    const items=asList?[{id:"rw:head",head:true},...grouped]:grouped;
    syncGrid(grid,items,items.map((it,i)=>it.head?listHeadHTML():it.group?groupHTML(it)
      :layout==="wall"?tileHTML(it):asList?rowHTML(it,i):cardHTML(it,i)));
  }
  reveal=null; // consumed by the render above — the next one must not replay it
  // A filter or a search can take the menu's own card off screen while the menu
  // is still open beside it.
  if(openMore.size&&(!cardMenuAnchor||!cardMenuAnchor.isConnected))closeCardMenu();
  renderBulkBar(list); // the "select all shown" box tracks whatever is shown now
  // patching keeps a focused textarea alive, so this is normally a no-op — it
  // only matters if the note block was structurally replaced rather than patched
  if(editingNote)focusNoteEditor(grid);
  document.title=accounts.length?"Smurf Tracker ("+accounts.length+")":"Smurf Tracker";
  // "N need a refresh" is in the header's status line now (renderRibbon), with the
  // other states; the toolbar keeps the count and the actions.
  /* Out of what this view holds: archived accounts are a view of their own, so
     counting them in ("53 of 61 shown" with nothing filtered) read as eight
     accounts hidden by a filter nobody had set. Nothing filtered, it is just a
     total. */
  const held=accounts.filter(a=>!!a.archived===!!ui.showArchived).length;
  const noun=ui.showArchived?"archived":"account"+(held===1?"":"s");
  setHTML($("count"),!accounts.length?"":(list.length===held?`<span><b>${held}</b> ${noun}</span>`
      :`<span><b>${list.length}</b> of <b>${held}</b>${ui.showArchived?" archived":""} shown</span>`));
  syncCheckAll(list);
  fitTags(grid);
}
// Called on its own during a run, where re-rendering the grid to flip one button
// would undo the point of rendering a single card.
// `shown` is the list renderGrid has just built, handed over rather than asked
// for again: this used to sort the whole vault on every call purely to count it.
function syncCheckAll(shown){
  // A run releases `checking` between accounts, so keying off that alone left the
  // button flickering enabled-and-back sixty times over a check-all — and made
  // this rebuild the label sixty times to say "Checking…" either way.
  const busy=checking.size>0||!!run;
  $("bCheckAll").disabled=accounts.length===0||busy;
  if(busy)setHTML($("bCheckAll"),`<span class="spin">${icon("refresh")}</span> Checking…`);
  else{
    // The button runs over whatever the filters are showing, not over the vault —
    // which is the right behaviour and was a trap while it still said "all". With a
    // search or a tier filter on, "Check all ranks" would quietly refresh three of
    // sixty accounts. Say which it is.
    const n=(shown||filtered()).filter(a=>a.status!=="banned").length;
    const inView=accounts.filter(a=>!!a.archived===ui.showArchived&&a.status!=="banned").length;
    setHTML($("bCheckAll"),icon("refresh")+" "+(n&&n<inView?`Check ${n} shown`:"Check all ranks"));
  }
}

// Opening a panel on one card is a change to that card, not to the grid, and it
// must not touch the sort order either — a card jumping to a new column because
// you opened its details is not a thing anyone asked for.
// Falls back to a full render whenever the card isn't where we expect it.
function renderCard(id){
  const grid=$("grid");
  const el=grid.querySelector(`[data-id="${idSel(id)}"]`);
  const acc=accounts.find(a=>a.id===id);
  if(!el||!acc){renderGrid();return}
  let html;
  if(run){
    // Sort order is frozen during Check-all — skip filtered()/sort on every patch.
    html=ui.density==="list"?rowHTML(acc,0)
      :ui.density==="wall"?tileHTML(acc):cardHTML(acc,0);
  }else{
    const list=filtered();
    const idx=list.findIndex(a=>a.id===id);
    if(idx<0){renderGrid();return}
    html=ui.density==="list"?rowHTML(list[idx],idx)
      :ui.density==="wall"?tileHTML(list[idx]):cardHTML(list[idx],idx);
  }
  const tmp=document.createElement("div");
  tmp.innerHTML=html;
  morph(el,tmp.firstElementChild);
  fitTags(el);
  cardCache.set(id,html); // keep the skip-check honest about what this node holds
  reveal=null; // consumed, exactly as renderGrid does
  if(editingNote)focusNoteEditor(grid);
}

// ---------- form ----------
function closeAllPanels(){
  if(askDone)askDone(false);
  // The card's ⋯ menu floats on the body, so nothing else takes it down — and a
  // menu left hanging over a modal that has just opened on top of it is the one
  // thing on this page that could still be above everything and belong to nothing.
  closeCardMenu();
  revertLookPreviews(); // Settings previews Appearance live; leaving it must not keep any of it
  settingsSaveGen++; // cancel a Save that is waiting on the notification prompt
  // Dismissing first-run Help via ✕ or Escape must count as "seen", the same as Got it —
  // otherwise an empty vault re-opens the modal on every reload.
  if(!$("help").classList.contains("hidden")&&!cfg.seenHelp){cfg.seenHelp=true;saveCfg()}
  editingId=null; // form ✕ / backdrop used to leave this set while the form was hidden
  closeRankModal();
  $("form").classList.add("hidden");
  $("settings").classList.add("hidden");
  $("help").classList.add("hidden");
  $("bulkAdd").classList.add("hidden");
  closeLockPrompt();
  $("moreMenu").classList.add("hidden");
  // Quick find is a modal like the other two, and every way out of a modal —
  // Escape, a click on the backdrop, the ✕ — goes through here. Leaving it off
  // this list meant Ctrl+K was the only thing that would close it again: Escape
  // shut every other panel on the page and left the palette standing.
  closePalette();
  closeCompare();
  closeArtPicker();
  closeShare();
}
function closeCompare(){
  compareIds=[];
  const m=$("compareModal");
  if(m)m.classList.add("hidden");
  // a pick started from a card's menu ends with its comparison; two accounts ticked
  // by hand stay ticked, for whatever else they were picked for
  if(cmpPick){cmpPick=false;selected.clear();lastSelectedId=null;ui.selecting=false;render()}
}
/* ---- note fields in the account form ----
   One control per field in the list, filled from the account; saving writes
   back only the fields shown, so a field switched off keeps what it held. */
function renderInfoFields(info,focusFirst){
  const box=$("fInfo");if(!box)return;
  const fs=noteFields();
  box.innerHTML=fs.map((f,i)=>{
    const v=nfValue(info,f), id="nf"+i, at=f.own?` data-label="${esc(f.label)}"`:"";
    if(f.kind==="honor"){
      const cur=v==null?"":String(v);
      return`<div class="fld f-honor"><label id="${id}">Honor level</label><div class="seg nf-honor" role="radiogroup" aria-labelledby="${id}" data-nf="honor">`
        +["",0,1,2,3,4,5].map(n=>`<button type="button" role="radio" data-v="${n}" aria-checked="${String(n)===cur}" tabindex="${String(n)===cur?0:-1}"`
          +` class="${String(n)===cur?"on":""}" title="${n===""?"Not set":"Honor level "+n}">${n===""?"Not set":n}</button>`).join("")+`</div></div>`;
    }
    if(f.kind==="bool"){
      const val=v===true?"1":v===false?"0":"";
      const [y,n]=f.k==="twofa"?["On","Off"]:["Yes","No"];
      return`<div class="fld"><label for="${id}">${esc(f.label)}</label><select id="${id}" data-nf="${f.k}"${at}>`
        +`<option value=""${val===""?" selected":""}>Not set</option><option value="1"${val==="1"?" selected":""}>${y}</option><option value="0"${val==="0"?" selected":""}>${n}</option></select></div>`;
    }
    if(f.kind==="num"){
      const val=typeof v==="number"?String(v):"";
      return`<div class="fld"><label for="${id}">${esc(f.label)}</label><input id="${id}" type="number" inputmode="${f.own?"decimal":"numeric"}" data-nf="${f.k}"${at}`
        +(f.own?' step="any"':` min="0" max="${f.max}" step="1"`)+` value="${esc(val)}"></div>`;
    }
    if(f.kind==="list")return`<div class="fld wide"><label for="${id}">${esc(f.label)}</label><input id="${id}" data-nf="skins" autocomplete="off"`
      +` value="${esc((v||[]).join(", "))}" placeholder="Comma-separated, e.g. Elementalist Lux, Spirit Blossom Yasuo"></div>`;
    const val=v==null?"":String(v);
    return`<div class="fld wide"><label for="${id}">${esc(f.label)}</label><input id="${id}" class="nf-sens" data-nf="${f.k}"${at} autocomplete="off" value="${esc(val)}"`
      +(f.k==="penalty"?` placeholder="e.g. 14-day chat restriction, ends 12 Oct"`:"")+`></div>`;
  }).join("");
  for(const el of box.querySelectorAll("[data-autofocus]"))el.removeAttribute("data-autofocus");
  if(focusFirst){const first=box.querySelector('[aria-checked="true"],input,select');if(first)first.setAttribute("data-autofocus","")}
}
function readInfoFields(base){
  const out=Object.assign({},normInfo(base)||{});
  out.own=Object.assign({},out.own||{});
  const fs=noteFields(), box=$("fInfo");
  const ctl=[...box.querySelectorAll("[data-nf]")];
  for(const f of fs){
    const el=f.own?ctl.find(x=>x.dataset.nf==="own"&&x.dataset.label===f.label):ctl.find(x=>x.dataset.nf===f.k);
    if(!el)continue;
    let v=null;
    if(f.kind==="honor"){const b=el.querySelector('[aria-checked="true"]');v=b&&b.dataset.v!==""?Number(b.dataset.v):null}
    else if(f.kind==="list")v=el.value.split(/[,\n]/).map(x=>x.trim()).filter(Boolean);
    else if(f.kind==="bool")v=el.value===""?null:el.value==="1";
    else if(f.kind==="num"){
      const t=el.value.trim(), n=Number(t);
      // a number past what the field holds is kept at its top rather than lost
      v=t===""||!Number.isFinite(n)?null:f.own?n:Math.min(f.max,Math.max(0,Math.round(n)));
    }
    else v=el.value.trim()||null;
    if(f.own){
      for(const k of Object.keys(out.own))if(k.toLowerCase()===f.label.toLowerCase())delete out.own[k];
      if(v!=null)out.own[f.label]=v;
    }else{
      delete out[f.k];
      if(v!=null&&!(Array.isArray(v)&&!v.length))out[f.k]=v;
    }
  }
  return normInfo(out);
}
$("fInfo").addEventListener("click",e=>{
  const b=e.target.closest('[data-nf="honor"] button');if(!b)return;
  for(const x of b.parentNode.children){const on=x===b;x.classList.toggle("on",on);x.setAttribute("aria-checked",String(on));x.tabIndex=on?0:-1}
});
$("fInfo").addEventListener("keydown",e=>{
  const b=e.target.closest('[data-nf="honor"] button');if(!b)return;
  const d={ArrowRight:1,ArrowDown:1,ArrowLeft:-1,ArrowUp:-1}[e.key];if(!d)return;
  e.preventDefault();
  const all=[...b.parentNode.children], t=all[(all.indexOf(b)+d+all.length)%all.length];
  t.click();t.focus();
});
/* Fields…: the list itself. Switching one off hides it everywhere and keeps
   what it holds; removing one of your own takes its values with it, after
   saying how many accounts that touches. */
function renderFieldsCfg(){
  const box=$("fFieldsCfg");if(!box||box.classList.contains("hidden"))return;
  const {off}=normNoteFields(cfg.noteFields), own=ownFields();
  const kinds=k=>Object.entries(NF_KINDS).map(([v,t])=>`<option value="${v}"${v===k?" selected":""}>${t}</option>`).join("");
  box.innerHTML=`<div class="grp-h">On every account</div>`
    +`<div class="nf-on">${NOTE_FIELDS.map(f=>`<label><input type="checkbox" data-nf-on="${f.k}"${off.includes(f.k)?"":" checked"}> ${esc(f.label)}</label>`).join("")}</div>`
    +`<div class="grp-h">Your own</div><div class="nf-own">`
    +(own.length?own.map((c,i)=>`<div class="row"><input data-own-label="${i}" value="${esc(c.label)}" maxlength="32" aria-label="Field name">`
      +`<select data-own-kind="${i}" aria-label="Kind of field">${kinds(c.kind)}</select>`
      +`<button type="button" data-own-del="${i}" title="Remove this field" aria-label="Remove ${esc(c.label)}">${icon("x")}</button></div>`).join("")
      :`<span class="none">Anything else you track on every account: where it came from, what it cost, the recovery question.</span>`)
    +(own.length<NF_MAX_OWN?`<div class="row"><input id="nfNewLabel" maxlength="32" placeholder="New field, e.g. Bought from" aria-label="New field name">`
      +`<select id="nfNewKind" aria-label="Kind of field">${kinds("text")}</select><button type="button" id="nfAdd">Add</button></div>`
      :`<span class="none">That's ${NF_MAX_OWN}, the most a vault can have.</span>`)
    +`</div>`;
}
// Every change to the list: store it, then redraw the fields with what was typed
// into them kept, and the cards with the new list.
function setNoteFields(off,custom,rename){
  // read against the list as it was, before it changes under the form
  const typed=readInfoFields(formInfoBase)||{};
  if(rename&&typed.own){
    const k=Object.keys(typed.own).find(x=>x.toLowerCase()===rename[0].toLowerCase());
    if(k!=null){typed.own[rename[1]]=typed.own[k];delete typed.own[k]}
  }
  cfg.noteFields={off,custom:custom.map(c=>({label:c.label,kind:c.kind}))};saveCfg();
  renderInfoFields(typed);
  renderFieldsCfg();renderGrid();
}
let formInfoBase=null;
$("fFieldsBtn").addEventListener("click",()=>{
  const box=$("fFieldsCfg"), open=box.classList.contains("hidden");
  box.classList.toggle("hidden",!open);$("fFieldsBtn").setAttribute("aria-expanded",String(open));
  renderFieldsCfg();
  if(open){const first=box.querySelector("input");if(first)first.focus()}
});
$("fFieldsCfg").addEventListener("change",e=>{
  const t=e.target, {off}=normNoteFields(cfg.noteFields), own=ownFields();
  if(t.dataset.nfOn){
    const k=t.dataset.nfOn, next=t.checked?off.filter(x=>x!==k):off.concat(k);
    setNoteFields(next,own);
  }else if(t.dataset.ownKind!=null){
    const c=own[+t.dataset.ownKind];if(!c||!NF_KINDS[t.value])return;
    c.kind=t.value;setNoteFields(off,own);
  }else if(t.dataset.ownLabel!=null){
    const c=own[+t.dataset.ownLabel];if(!c)return;
    const to=nfLabel(t.value);
    if(!to||own.some(x=>x!==c&&x.label.toLowerCase()===to.toLowerCase())){
      toast(to?"There is already a field called "+to:"A field needs a name");t.value=c.label;return;
    }
    if(to===c.label)return;
    // the values are stored under the name, so they move with it
    let moved=0;
    for(const a of accounts){
      const o=a.info&&a.info.own;if(!o)continue;
      const k=Object.keys(o).find(x=>x.toLowerCase()===c.label.toLowerCase());
      if(k!=null){const v=o[k];delete o[k];o[to]=v;moved++}
    }
    if(formInfoBase&&formInfoBase.own){const o=formInfoBase.own,k=Object.keys(o).find(x=>x.toLowerCase()===c.label.toLowerCase());if(k!=null){o[to]=o[k];delete o[k]}}
    const from=c.label;c.label=to;
    setNoteFields(off,own,[from,to]);
    if(moved)saveDB();
  }
});
$("fFieldsCfg").addEventListener("click",async e=>{
  const del=e.target.closest("[data-own-del]");
  if(del){
    const {off}=normNoteFields(cfg.noteFields), own=ownFields(), c=own[+del.dataset.ownDel];if(!c)return;
    const holders=accounts.filter(a=>a.info&&a.info.own&&Object.keys(a.info.own).some(k=>k.toLowerCase()===c.label.toLowerCase()));
    if(holders.length&&!await ask({title:`Remove “${c.label}”?`,
      body:`${holders.length} account${holders.length===1?" has a value":"s have values"} in it, and ${holders.length===1?"it goes":"they go"} too.`,ok:"Remove",danger:true}))return;
    for(const a of holders){
      for(const k of Object.keys(a.info.own))if(k.toLowerCase()===c.label.toLowerCase())delete a.info.own[k];
      a.info=normInfo(a.info);if(!a.info)delete a.info;
    }
    if(formInfoBase&&formInfoBase.own)for(const k of Object.keys(formInfoBase.own))if(k.toLowerCase()===c.label.toLowerCase())delete formInfoBase.own[k];
    const box=$("fInfo"), el=[...box.querySelectorAll('[data-nf="own"]')].find(x=>x.dataset.label===c.label);
    if(el)el.closest(".fld").remove(); // what was typed into it goes with it
    setNoteFields(off,own.filter(x=>x!==c));
    if(holders.length)saveDB();
    return;
  }
  if(e.target.closest("#nfAdd"))addOwnField();
});
$("fFieldsCfg").addEventListener("keydown",e=>{if(e.key==="Enter"&&e.target.id==="nfNewLabel"){e.preventDefault();addOwnField()}});
function addOwnField(){
  const {off}=normNoteFields(cfg.noteFields), own=ownFields();
  const label=nfLabel($("nfNewLabel").value), kind=$("nfNewKind").value;
  if(!label){toast("Name the field first");$("nfNewLabel").focus();return}
  if(own.some(x=>x.label.toLowerCase()===label.toLowerCase())){toast("There is already a field called "+label);return}
  if(own.length>=NF_MAX_OWN||!NF_KINDS[kind])return;
  setNoteFields(off,own.concat({label,kind}));
  const n=$("nfNewLabel");if(n)n.focus();
}
/* Opening Add account or Bulk add from the example data used to end the preview
   there and then, so the example accounts were gone and Cancel left an empty
   page. The preview now lasts until something is actually added, and the window
   says that saving is what ends it. */
function openForm(acc,focus){
  closeAllPanels();
  $("fPreviewNote").hidden=!(previewMode&&!acc);
  editingId=acc?acc.id:null;
  $("fLabel").value=acc?acc.label||"":"";
  $("fRegion").value=acc?normRegion(acc.region):usualRegion();delete $("fRegion").dataset.picked;
  $("fName").value=acc?acc.gameName:"";
  $("fTag").value=acc?acc.tagLine:"";
  $("fLogin").value=acc?acc.login||"":"";
  $("fPass").value=acc?acc.password||"":"";
  $("fEmail").value=acc?acc.email||"":"";
  $("fCreated").value=acc?acc.createdOn||"":"";
  $("fBirth").value=acc?acc.birthdate||"":"";
  $("fStatus").value=acc?(acc.status||"active"):"active";
  $("fExStats").checked=!!(acc&&acc.excludeStats);
  setPassShown(false);
  renderPassNote();
  renderPwMeter();
  $("fTags").value=acc?(acc.tags||[]).join(", "):"";
  $("fNotes").value=acc?acc.notes||"":"";
  formInfoBase=acc?normInfo(acc.info):null;
  $("fFieldsCfg").classList.add("hidden");$("fFieldsBtn").setAttribute("aria-expanded","false");
  // From a card's note fields, the window starts at them rather than at the name
  const atNotes=focus==="notes", atPw=focus==="password", atLogin=focus==="login";
  $("fName").toggleAttribute("data-autofocus",!atNotes&&!atPw&&!atLogin);
  $("fLogin").toggleAttribute("data-autofocus",atLogin);   // from a card's Add login
  $("fPass").toggleAttribute("data-autofocus",atPw);   // from the password check-up
  renderInfoFields(formInfoBase,atNotes);
  clearFormErrors();
  // Folded unless you keep it open, the account already has some of it, or you came
  // for the notes. Opening the ones an account has hides nothing it holds.
  setFormMore(!!cfg.formMore||atNotes||!!(acc&&(acc.label||acc.email||acc.createdOn||acc.birthdate
    ||(acc.tags||[]).length||(acc.status&&acc.status!=="active")||acc.excludeStats||acc.notes||normInfo(acc.info))));
  $("fSave").textContent=acc?"Save changes":"Add account";
  $("formTitle").textContent=acc?"Edit account":"Add account";
  // Which one, in the header: over the page the card being edited is behind the
  // backdrop, so the panel is the only thing left saying what it is editing.
  $("formSub").textContent=acc?acc.gameName+"#"+acc.tagLine:"";
  // The modal observer focuses the name, which carries data-autofocus — the first
  // field is the optional label, and the one you came here to type is the name.
  $("form").classList.remove("hidden");
  formBase=formSnapshot();
  if(atNotes)requestAnimationFrame(()=>{const h=$("fNotesHead");if(h&&h.scrollIntoView)h.scrollIntoView({block:"start"})});
}
function setFormMore(on){
  foldLand($("fGrid"));
  $("fGrid").classList.toggle("more",on);
  setFormMoreBtn(on);
}
function setFormMoreBtn(on){
  const b=$("fMoreBtn");b.setAttribute("aria-expanded",String(on));
  b.firstChild.textContent=on?"Fewer details":"More details";
}
/* ---------- folds that open in place ----------
   More details took the account form from about 400px to 800px in one frame, and
   Settings' Advanced sections jumped the same way. They glide now, the way windows
   do: the box's height runs from where it was to where it lands while what it
   uncovers fades in, 280ms on the way out and quicker on the way back. Nothing
   moves with reduced motion or effects off, or where the browser cannot animate. */
/* An ease-out cubic, not the quint the windows use: a fold travels hundreds of
   pixels, and the quint put 56% of that into the first two frames (275, 487, 651
   of 948px), which read as a jump. This one has about 31% there. */
const FOLD_EASE="cubic-bezier(.33,1,.68,1)";
function foldMotion(){return typeof Element.prototype.animate==="function"&&!prefersReducedMotion()&&document.body.dataset.fx!=="off"}
// set straight, by a window opening: whatever was in flight lands first, so its
// last step cannot undo this
function foldLand(box){if(box&&box._foldEnd)box._foldEnd()}
// open or closed as last asked, even while it is still on its way there
function foldWanted(box,now){return box._foldEnd?box._foldTo:now}
function glideFold(box,on,set,parts){
  if(box._foldEnd)box._foldEnd();   // a second press first lands the one in flight
  if(!foldMotion()){set(on);return}
  const from=box.getBoundingClientRect().height;
  set(on);
  const to=box.getBoundingClientRect().height, shown=parts();
  // closing keeps everything in place until the height has run down to the closed one
  if(!on)set(true);
  const o={duration:on?280:160,easing:on?FOLD_EASE:"ease",fill:"forwards"};
  box.style.overflow="hidden";
  const anims=[box.animate([{height:from+"px"},{height:to+"px"}],o)]
    .concat(shown.map(p=>p.animate(on?[{opacity:0},{opacity:1}]:[{opacity:1},{opacity:0}],o)));
  for(const a of anims)a.finished.catch(()=>{});
  const end=()=>{
    if(box._foldEnd!==end)return;
    box._foldEnd=null;
    if(!on)set(false);
    for(const a of anims)a.cancel();
    box.style.overflow="";
  };
  box._foldEnd=end;box._foldTo=on;
  anims[0].finished.then(end,()=>{});
}
for(const d of document.querySelectorAll("#settings details")){
  const sum=d.querySelector(":scope>summary");
  if(sum)sum.addEventListener("click",e=>{
    if(!foldMotion()&&!d._foldEnd)return;   // the browser's own toggle
    e.preventDefault();
    glideFold(d,!foldWanted(d,d.open),v=>{d.open=v},()=>[...d.children].filter(c=>c!==sum));
  });
}
/* Everything the form holds, to tell whether leaving it would lose something */
let formBase="";
function formSnapshot(){
  return JSON.stringify([[...$("form").querySelectorAll("input,select,textarea")].map(e=>e.type==="checkbox"?e.checked:e.value),
    readInfoFields(formInfoBase)]);
}
/* A field that stops the save says why under itself. Typing in it clears that. */
function fieldError(id,msg){
  const f=$(id), m=$(id+"Msg");
  f.closest(".fld").classList.add("bad");f.setAttribute("aria-invalid","true");
  if(m)m.textContent=msg;
}
function clearFieldError(id){
  const f=$(id), m=$(id+"Msg");
  f.closest(".fld").classList.remove("bad");f.removeAttribute("aria-invalid");
  if(m)m.textContent="";
}
function clearFormErrors(){clearFieldError("fName");clearFieldError("fTag")}
/* What happens to the password, under the box: it was the placeholder, in the
   password's monospace, gone at the first letter. Without a master password the
   line offers to set one; leaving a form with typing in it asks first. */
function renderPassNote(){
  const el=$("fPassNote");
  el.classList.toggle("open",!vaultPassword);
  setHTML(el,vaultPassword?`${icon("lock")}<span>Encrypted with your master password</span>`
    :`<span>Saved in this browser without encryption.</span><button type="button" class="f-link" id="fSetMaster">Set a master password</button>`);
}
function closeForm(){$("form").classList.add("hidden");editingId=null}
/* Only "Set a master password" asked before dropping what the form held. Escape,
   Cancel, ✕, a click beside the window and the back button all closed it without
   a word, so a password made with Gen, already set on the Riot account, was gone
   with one misclick. Every way out now goes through here, and asks first if
   anything in the form differs from what it opened with. */
function formDirty(){return !$("form").classList.contains("hidden")&&formSnapshot()!==formBase}
async function leaveForm(){
  if(!formDirty())return true;
  return !!await ask({title:editingId?"Discard your changes to this account?":"Discard this new account?",
    body:"What you typed here isn't saved yet.",ok:"Discard",cancel:"Keep editing",danger:true});
}
// With nothing at stake the window closes there and then; only a question waits.
function requestClose(){
  const go=()=>{closeAllPanels();editingId=null;if(armedDelete){armedDelete=null;renderGrid()}return true};
  if(formDirty())return leaveForm().then(ok=>ok?go():false);
  if(settingsUnsaved())return leaveSettings().then(ok=>ok?go():false);
  return Promise.resolve(go());
}
function cancelForm(){
  if(!formDirty()){closeForm();return}
  leaveForm().then(ok=>{if(ok)closeForm()});
}
/* A Riot ID is copied as one string — "Hide on Bush#EUW" from op.gg, the client,
   a friend's message — and the form wanted it in two boxes, so a paste into the
   name failed with "name and tag are required". A game name cannot contain "#",
   so everything after the last one is the tag: pasted, it fills both fields;
   typed, the "#" carries you on to the tag. */
function splitRiotId(){
  const f=$("fName"),v=f.value,i=v.lastIndexOf("#");
  if(i<0)return;
  const tag=v.slice(i+1).trim();
  f.value=v.slice(0,i).trim();
  if(tag){$("fTag").value=tag;regionFromTagField()}
  else $("fTag").focus();
}
// New accounts only, and only until the user picks a region themselves
function regionFromTagField(){
  const sel=$("fRegion");
  if(editingId||sel.dataset.picked)return;
  const r=regionFromTag($("fTag").value);
  if(r)sel.value=r;
}
$("fName").addEventListener("input",()=>{
  splitRiotId();clearFieldError("fName");
  if($("fTag").value.trim())clearFieldError("fTag");   // a pasted Name#TAG filled it
});
$("fTag").addEventListener("input",()=>clearFieldError("fTag"));
$("fRegion").addEventListener("change",()=>clearFieldError("fName"));   // a duplicate is per region
$("fMoreBtn").addEventListener("click",e=>{
  const g=$("fGrid"), on=!foldWanted(g,g.classList.contains("more"));
  setFormMoreBtn(on);
  glideFold(g,on,v=>g.classList.toggle("more",v),()=>[...g.querySelectorAll(":scope>.f-x:not(.hidden)")]);
  cfg.formMore=on;saveCfg();   // kept the way you leave it, for the next account
  /* Ready to type in from the keyboard (Enter or Space: a click with no count). A
     tap moved the focus too, and on an iPad a text field taking focus brings up the
     keyboard and the contact-autofill bar over a form you only wanted to look at.
     Not scrolled to: the box clips while it grows, and the field is just below. */
  if(on&&e.detail===0)$("fLabel").focus({preventScroll:true});
});
$("fPassNote").addEventListener("click",async e=>{
  if(!e.target.closest("#fSetMaster"))return;
  if(formDirty()&&!await leaveForm())return;
  openSettings("security");
  setTimeout(()=>{const f=$("sVaultPass");if(f){f.scrollIntoView&&f.scrollIntoView({block:"center"});f.focus()}},60);
});
$("fTag").addEventListener("input",regionFromTagField);
$("fRegion").addEventListener("change",()=>{$("fRegion").dataset.picked="1"});
function submitForm(){
  let newId=null;
  splitRiotId();
  const gameName=$("fName").value.trim(), tagLine=$("fTag").value.trim().replace(/^#/,"");
  clearFormErrors();
  if(!gameName||!tagLine){
    if(!tagLine)fieldError("fTag","Needed for the lookup, the part after #");
    if(!gameName)fieldError("fName","Needed: the name before the #");
    $(gameName?"fTag":"fName").focus();
    return;
  }
  // Checked on edit too, not only on add: renaming one account onto another was
  // the one way to get two rows for the same Riot ID past the guard, and every
  // check then refreshed both of them off the same profile.
  {
    const dup=accounts.find(a=>a.id!==editingId
      &&a.gameName.toLowerCase()===gameName.toLowerCase()
      &&a.tagLine.toLowerCase()===tagLine.toLowerCase()
      &&a.region===$("fRegion").value);
    if(dup&&!(previewMode&&!editingId)){fieldError("fName","Already in the vault as "+plainName(dup));$("fName").focus();return}
  }
  // the first account of your own: the example data makes way for it
  if(previewMode&&!editingId){previewMode=false;accounts=[]}
  const data={label:$("fLabel").value.trim(),region:$("fRegion").value,gameName,tagLine,status:$("fStatus").value,
    login:$("fLogin").value,password:$("fPass").value,email:$("fEmail").value.trim(),
    // Stored as the ISO string the date input hands over, so they sort as strings
    // and survive a JSON round trip without a timezone deciding to shift them by a
    // day — which a Date object serialised to UTC absolutely will.
    createdOn:$("fCreated").value||"",birthdate:$("fBirth").value||"",
    tags:parseTags($("fTags").value),notes:$("fNotes").value.trim(),info:readInfoFields(formInfoBase),
    excludeStats:$("fExStats").checked};
  if(editingId){
    const a=accounts.find(x=>x.id===editingId);if(a){Object.assign(a,data);if(!a.info)delete a.info;if(!a.excludeStats)delete a.excludeStats}
  }else{
    const a=Object.assign({id:uid(),fav:false,stats:null},data);if(!a.info)delete a.info;if(!a.excludeStats)delete a.excludeStats;
    accounts.push(a);
    newId=a.id;
  }
  saveDB();closeForm();render();
  if(newId)revealAccount(newId);
  /* A new account came in as "Never checked" and stayed that way until somebody
     found Refresh, on an app that says rank checks are free and automatic. It is
     read straight away now, the same check its own Refresh runs. Not in the
     preview (nothing there is real), not for a banned one (checks skip those),
     and not under a Check all run that is already going through the vault. */
  if(newId&&!previewMode&&!run&&data.status!=="banned")check(newId);
  if(data.password)maybeLockPrompt();
}

// ---------- settings ----------
const SETTINGS_TABS=["look","checks","alerts","security","backup"];
function settingsTab(tab,focus){
  if(tab==="sync")tab="backup";   // a tab of its own until Backup & sync
  if(!SETTINGS_TABS.includes(tab))tab="look";
  const m=$("settings");m.dataset.tab=tab;
  $("settingsPanel").setAttribute("aria-labelledby","stab-"+tab); // read as the tab's panel
  for(const b of m.querySelectorAll("[data-stab]")){
    const on=b.dataset.stab===tab;
    b.setAttribute("aria-selected",String(on));b.tabIndex=on?0:-1;
    // Settings starts on its tab, not on the first field of the page: that was the
    // colour picker, which on a phone sits below the themes and scrolled them away
    b.toggleAttribute("data-autofocus",on);
    if(on&&focus)b.focus();
  }
  const body=m.querySelector(".mdl-b");if(body)body.scrollTop=0;
  centreSettingsTab();
}
// A phone showed four of the tabs in one sliding row; one chosen from elsewhere
// (Back up, Set a master password) was selected out of sight. Centre it in the row. Only
// measurable once Settings is on screen, so openSettings calls it again then.
function centreSettingsTab(){
  const row=$("settings").querySelector(".stabs"), on=row&&row.querySelector('[aria-selected="true"]');
  if(row&&on&&row.clientWidth)row.scrollLeft=Math.max(0,on.offsetLeft-row.offsetLeft-(row.clientWidth-on.offsetWidth)/2);
}
function updateBackupLast(){
  const el=$("sBackupLast");if(!el)return;
  el.textContent=cfg.lastExport?"Last backup: "+timeAgo(cfg.lastExport)+".":"No backup made from this browser yet.";
}
function openSettings(tab){
  closeAllPanels();
  settingsTab(typeof tab==="string"?tab:"look");updateBackupLast();
  // Permission can be revoked in site settings while cfg still says on — don't
  // show the box checked for alerts that cannot fire.
  if(cfg.notify&&"Notification"in window&&Notification.permission!=="granted"){
    cfg.notify=false;saveCfg();
  }
  $("sKey").value=cfg.apiKey;$("sModel").value=cfg.model;$("sAuto").checked=!!cfg.autoCheck;$("sAutoEvery").value=String(coerceAutoEvery(cfg.autoEveryHours));$("sAutoRanked").checked=!!cfg.autoRankedOnly;$("sBackend").value=cfg.backendUrl||"";$("sNotify").checked=!!cfg.notify;$("sDiscord").value=cfg.discordWebhook||"";fillAutoLock($("sAutoLock"),cfg.autoLockMin||0);$("sAccent").value=cfg.accent||DEFAULT_ACCENT;$("sAccent2").value=cfg.accent2||DEFAULT_ACCENT2;pendingRankTheme=null;if(cfg.rankTheme){const c=rankThemeColours(bestTierNow());$("sAccent").value=c.a;$("sAccent2").value=c.b}renderThemes();syncAtmosphereUI(cfg.atmosphere||DEFAULT_ATMOSPHERE);applyEffects(cfg.effects);applyTextSize(cfg.textSize);$("sVaultPass").value="";if($("sExportDays"))$("sExportDays").value=String(clampExportDays(cfg.exportRemindDays));if($("sSyncToken"))$("sSyncToken").value=cfg.syncToken||"";pendingCardHide=null;renderCardParts();pendingChampArt=null;$("sChampArt").checked=champArtOn();updateVaultStatus();renderPwCheck();updateSyncStatus();updateStorageStatus();updateBackendStatus();$("sWatch").checked=!!cfg.watch;updateWatchStatus();$("sChecksLead").textContent=checksLead();["sChecksAdv","sDeployHelp","sAdvanced"].forEach(id=>foldLand($(id)));$("sChecksAdv").open=!!(cfg.backendUrl||cfg.apiKey);$("sDeployHelp").open=!cfg.backendUrl;$("sAdvanced").open=!!cfg.apiKey;$("settings").classList.remove("hidden");centreSettingsTab();settingsDirty(false)
}
// Where ranks come from, in the order check() tries them
function checksLead(){
  return cfg.backendUrl?"Ranks are read by your own worker, set up under Advanced, and from op.gg when it can't answer."
    :cfg.apiKey?"Ranks are read with your Anthropic API key, set under Advanced, and from op.gg when that fails."
    :"Ranks are read from op.gg for free. There is nothing to set up.";
}
function renderPwMeter(){
  const p=$("fPass").value;
  const {score,label}=passwordStrength(p);
  const colors=["#ff6b6b","#ff6b6b","#e8c464","#e8c464","#4ade80"];
  $("pwMeter").innerHTML=p?Array.from({length:5},(_,i)=>`<span style="flex:1;height:100%;border-radius:1px;transition:background .2s;background:${i<score?colors[score-1]:"var(--line)"}"></span>`).join(""):"";
  $("pwMeterLabel").textContent=p?label:"";
}
function renderPwCheck(){
  const el=$("sPwList");if(!el)return;
  const withPw=accounts.filter(a=>a.password).length, f=pwFindings();
  const reused=f.filter(x=>x.same.length).length, weak=f.filter(x=>x.weak).length, leaked=f.filter(x=>x.leak>0).length;
  $("sPwSum").textContent=!withPw?"No passwords saved yet."
    :!f.length?(withPw===1?"The one saved password is fine.":"All "+withPw+" saved passwords are different, and none is weak.")
    :withPw===1?"The one saved password could be safer."
    :f.length+" of "+withPw+" passwords could be safer: "+[leaked&&leaked+" found in data leaks",reused&&reused+" used on more than one account",weak&&weak+" weak"].filter(Boolean).join(", ")+".";
  setHTML(el,f.map(x=>`<div class="pwc-row"><div class="t"><span class="n">${nameOf(x.a)}</span>`
    +`<span class="why">${[x.leak&&`<span class="bad">${pwLeakText(x.leak)}</span>`,x.same.length&&pwSameText(x.same),x.weak&&esc(x.weak)].filter(Boolean).join(" · ")}</span></div>`
    // "Change" alone, row after row, says nothing to a screen reader
    +`<button type="button" data-pwedit="${idAttr(x.a.id)}" aria-label="Change the password of ${esc(plainName(x.a))}">Change</button></div>`).join(""));
  const st=pwLeakState, btn=$("sPwLeaks");
  btn.disabled=st==="busy"||!withPw;
  btn.textContent=st==="busy"?"Checking…":st&&!st.err?"Check again":"Check for leaks";
  // what was found is said once, in the list above; this line is about the check
  $("sPwLeakNote").textContent=st==="busy"?"Asking Have I Been Pwned…"
    :st&&st.err?"Couldn't reach Have I Been Pwned. Check the connection and try again."
    :st?"Checked "+timeAgo(st.at)+(leaked?".":": none of your passwords is in a known leak.")
    :"Looks each password up in Have I Been Pwned's list of leaked passwords. Only the first 5 characters of its SHA-1 fingerprint are sent, never the password.";
}
$("sPwLeaks").addEventListener("click",checkPwLeaks);
$("sPwList").addEventListener("click",e=>{
  const b=e.target.closest("[data-pwedit]");if(!b)return;
  const acc=accounts.find(a=>a.id===b.dataset.pwedit);if(acc)openForm(acc,"password");
});
/* Remove protection was red and pressable with nothing protected, where all it could
   do was say so in a toast. It shows once there is a password to remove, and the
   button beside it says which of the two it will do. */
function updateVaultStatus(){
  $("sVaultStatus").textContent=vaultPassword?"Vault is currently encrypted with a master password.":"Vault is currently unencrypted.";
  $("sVaultRemove").classList.toggle("hidden",!vaultPassword);
  $("sVaultSet").textContent=vaultPassword?"Change password":"Set password";
  updatePkStatus();renderSetup();
}
function updatePkStatus(){
  const r=pkRecord(), ok=pkAvailable();
  $("sPkSet").classList.toggle("hidden",!!r);$("sPkOff").classList.toggle("hidden",!r);
  $("sPkSet").disabled=!ok||!vaultPassword;
  $("sPkSet").textContent=pkPending?"Finish set-up":"Set up";
  $("sPkStatus").textContent=r?"On in this browser since "+snapDay(r.at||Date.now())+". The master password still works."
    :!ok?"Needs a browser with passkeys, and the app opened from its https address."
    :pkPending?"Passkey made. Tap Finish set-up and confirm it once more with Face ID / fingerprint."
    :!vaultPassword?"Set a master password first. This opens the vault without typing it."
    :"Makes a passkey on this device. The master password still works, and is what you need if the passkey is lost.";
}
$("sPkSet").addEventListener("click",async()=>{
  if(!vaultPassword||!pkAvailable())return;
  const b=$("sPkSet");b.disabled=true;b.textContent="Waiting for the passkey…";
  try{
    const done=pkPending?(await pkFinish(vaultPassword),true):await pkSetup(vaultPassword);
    toast(done?"Face ID / fingerprint unlock is on for this browser":"Passkey made. Tap Finish set-up and confirm it once more");
  }catch(e){
    toast(e.name==="NoPrf"?"This browser or device can't unlock with a passkey yet. Recent Chrome, Edge and Safari can."
      :e.name==="NotAllowedError"?(pkPending?"Canceled. Tap Finish set-up to try again":"Canceled. Nothing was set up")
      :"Couldn't set it up: "+(e.message||e.name||"unknown error"));
  }finally{updatePkStatus()}
});
$("sPkOff").addEventListener("click",()=>{
  const r=pkRecord();
  pkForget();if(r)pkSignalGone(unb64(r.id));
  updatePkStatus();
  toast("Turned off. The passkey may still be listed in your password manager; you can delete it there");
});
/* Four things make a vault safe to rely on, and a first visit does the first and
   usually stops: accounts in, ranks read, a master password, a backup. Until all
   four are done (or the strip is hidden) they sit above the toolbar as one row of
   steps, each a button that does it. The backup line in the dashboard stands
   down while this is showing the same step. */
function setupSteps(){
  return [
    {act:"add",done:accounts.length>0,label:"Add your accounts"},
    {act:"check",done:accounts.some(isChecked),label:"Check their ranks"},
    {act:"lock",done:!!vaultPassword,label:"Set a master password"},
    {act:"backup",done:!!cfg.lastExport,label:"Back up"},
  ];
}
/* The prompt: when a password is saved into a vault with no master password, and
   once a visit while passwords sit there in plain text. "Not now" asks again next
   visit; "Don't ask again" stops it on this device (the setup step still says it). */
let lockPromptShown=false;
function wantsLockPrompt(){
  return !previewMode&&!vaultPassword&&!cfg.lockPromptOff&&!lockPromptShown&&accounts.some(a=>a.password);
}
function maybeLockPrompt(){
  if(!wantsLockPrompt())return false;
  lockPromptShown=true;
  $("lpPass").value="";$("lpPass2").value="";$("lpOff").checked=false;
  $("lockPrompt").classList.remove("hidden");
  return true;
}
function setupVisible(){return accounts.length>0&&!previewMode&&!cfg.setupHidden&&setupSteps().some(s=>!s.done)}
function renderSetup(){
  const el=$("setup");if(!el)return;
  if(!setupVisible()){setHTML(el,"");return}
  const steps=setupSteps(), left=steps.filter(s=>!s.done).length;
  setHTML(el,`<div class="setup hx"><div class="hx-in setup-in">
    <span class="setup-k">Get set up <em>${steps.length-left} of ${steps.length}</em></span>
    <ol class="setup-steps">${steps.map((s,i)=>`<li class="${s.done?"done":""}">`
      +(s.done?`${icon("check")}<span>${esc(s.label)}</span>`:`<button type="button" data-setup="${s.act}"><b>${i+1}</b>${esc(s.label)}</button>`)+`</li>`).join("")}</ol>
    <button type="button" class="setup-x" data-setup="hide" title="Hide these steps">Hide</button>
  </div></div>`);
}
const DEFAULT_ACCENT="#c8aa6e", DEFAULT_ACCENT2="#0ac8b9";
const DEFAULT_ATMOSPHERE="spotlight";
const ATMOSPHERES=new Set(["spotlight","aurora","noir","lattice","stardust","void"]);
function syncAtmosphereUI(mode){
  const seg=$("sAtmosphere");if(!seg)return;
  for(const b of seg.querySelectorAll("[data-atmosphere]")){
    const on=b.dataset.atmosphere===mode;
    b.classList.toggle("on",on);
    b.setAttribute("aria-checked",on?"true":"false");
  }
}
function applyAtmosphere(mode){
  const m=ATMOSPHERES.has(mode)?mode:DEFAULT_ATMOSPHERE;
  document.body.dataset.atmosphere=m;
  syncAtmosphereUI(m);
  return m;
}
/* Compact cards: the chart and the stat row are the tallest parts of a card,
   and in a big vault they are the parts you look at least often. Left under
   Details they come back when that card is opened, so nothing is lost — the grid
   just fits about twice as many cards on a screen. A class on the body, so the
   switch costs no re-render. */
// Effects: a body attribute, so the switch is one style pass and no re-render
const EFFECTS=["full","subtle","off"];
function syncOptSeg(id,v){const el=$(id);if(el)for(const b of el.querySelectorAll("[data-v]"))b.setAttribute("aria-checked",String(b.dataset.v===v))}
const TEXT_SIZES=["small","default","large"];
function applyTextSize(v){
  const t=TEXT_SIZES.includes(v)?v:"default", was=document.documentElement.dataset.ts||"default";
  if(t==="default")delete document.documentElement.dataset.ts;else document.documentElement.dataset.ts=t;
  // Every window's opening puts any previewed size back through here. Refitting
  // every card's tags each time, size changed or not, was 0.1s of layout before
  // + Add account could show at all.
  syncOptSeg("sTextSize",t);if(t!==was)fitTags();return t;
}
/* A card's tags stay on one row, the way its note chips do: ten tags made a
   two-row block of chips on every card that had them. What does not fit hides
   behind "+N", which opens Details, where they all show. Measured rather than
   counted, since "do not use" and "2fa" are not the same width; the CSS keeps the
   row to one line even before this runs. */
let fitTagsRaf=0;
addEventListener("resize",()=>{cancelAnimationFrame(fitTagsRaf);fitTagsRaf=requestAnimationFrame(()=>fitTags())});
/* All the resetting first, then all the measuring: done a card at a time, each
   card's measure came straight after a change and paid for a layout of the whole
   page, forty of them on every render. Only the rows that overflow, usually none,
   go on to the one-at-a-time fitting below. */
function fitTags(root){
  const scope=root||$("grid");if(!scope)return;
  const rows=[...(scope.matches&&scope.matches(".ctags")?[scope]:scope.querySelectorAll(".card:not(.info-open) .ctags"))];
  for(const row of rows){
    for(const m of row.querySelectorAll(".ct-more"))m.remove();
    for(const c of row.children)c.hidden=false;
  }
  const over=[];
  for(const row of rows){
    const R=row.getBoundingClientRect();
    if(!R.width)continue;
    const chips=[...row.children], cut=chips.findIndex(el=>el.getBoundingClientRect().right>R.right+.5);
    if(cut>=0)over.push([row,chips,cut,R]);
  }
  for(const[row,chips,cut,R]of over){
    const out=el=>el.getBoundingClientRect().right>R.right+.5;
    const more=document.createElement("button");
    more.type="button";more.className="ct-more";more.dataset.act="info";more.title="Show every tag in Details";
    row.appendChild(more);
    let n=Math.max(1,cut);
    // "+5 more", worded like the note chips' count beside it
    const show=()=>{chips.forEach((c,i)=>{c.hidden=i>=n});more.textContent="+"+(chips.length-n)+" more"};
    show();
    while(n>1&&out(more)){n--;show()}
  }
}
function applyEffects(v){const f=EFFECTS.includes(v)?v:"full";document.body.dataset.fx=f;syncOptSeg("sEffects",f);return f}
const CARD_PARTS=[["chart","LP chart"],["stats","Peak & stats"],["wl","Win/loss bar"],["goal","Goal & level bar"],["tags","Tags"],["notes","Notes"]];
let pendingCardHide=null; // Settings' choice before Save
/* Hidden until asked for: the win/loss bar. It drew the win rate printed just above
   it a second time, and on a card with a goal it was one of two bars in a row that
   meant different things. A choice saved in Settings, even "show everything" ([]),
   is kept as it is. */
const DEFAULT_CARD_HIDE=["wl"];
// (the win rate stays printed, so a hidden bar alone is no reason for a Details handle)
function cardHidden(){
  const list=pendingCardHide||cfg.cardHide;
  return Array.isArray(list)?list.filter(k=>CARD_PARTS.some(p=>p[0]===k)):DEFAULT_CARD_HIDE.slice();
}
function applyCompact(){const h=new Set(cardHidden());for(const[k]of CARD_PARTS)document.body.classList.toggle("hide-"+k,h.has(k))}
function renderCardParts(){
  const el=$("sCardParts");if(!el)return;const h=new Set(cardHidden());
  setHTML(el,CARD_PARTS.map(([k,n])=>`<label><input type="checkbox" data-part="${k}"${h.has(k)?"":" checked"}> ${esc(n)}</label>`).join(""));
}
function previewCardParts(list){pendingCardHide=list;applyCompact();renderCardParts();renderGrid()}
function revertAtmosphere(){applyAtmosphere(cfg.atmosphere||DEFAULT_ATMOSPHERE)}
/* ---- themes ----
   Two accents and an atmosphere picked to go together, so a new look is one
   click instead of two colour pickers and a guess. The pickers stay underneath
   for anyone who wants their own. "My best rank" is not a fixed pair: it follows
   the highest tier in the vault, and moves when you climb. */
const THEMES=[
  {k:"hextech",n:"Hextech",a:"#c8aa6e",b:"#0ac8b9",atm:"spotlight"},
  {k:"shadowisles",n:"Shadow Isles",a:"#7fe8c9",b:"#1fae8a",atm:"noir"},
  // red on the wordmark and headings, steel on the buttons: as the button colour, red
  // made "Copy username" look like Delete
  {k:"noxus",n:"Noxus",a:"#d9434a",b:"#b8c0c8",atm:"spotlight"},
  {k:"piltover",n:"Piltover",a:"#e0a458",b:"#3f9cff",atm:"lattice"},
  {k:"freljord",n:"Freljord",a:"#d6ecff",b:"#5bb8f5",atm:"stardust"},
  {k:"ionia",n:"Ionia",a:"#f0a6c4",b:"#4fcf9f",atm:"spotlight"},
  {k:"void",n:"Void",a:"#b07cff",b:"#e04fd0",atm:"aurora"},
];
let pendingRankTheme=null; // Settings' choice before Save; null means "as saved"
function rankThemeOn(){return pendingRankTheme===null?!!cfg.rankTheme:pendingRankTheme}
function bestTierNow(){
  let best=null,v=-Infinity;
  for(const a of accounts){
    if(!isLive(a)||!isRanked(a))continue;
    const x=rankValue(a.stats);if(x>v){v=x;best=String(a.stats.tier).toUpperCase()}
  }
  return best;
}
// the tier's own colour leads; its partner is the default teal unless the tier
// sits near teal on the wheel (Platinum, Emerald, Diamond), where gold keeps the
// two accents apart
function rankThemeColours(tier){
  const a=TIER_COLORS[tier];
  if(!a||tier==="UNRANKED")return{a:DEFAULT_ACCENT,b:DEFAULT_ACCENT2};
  const d=Math.abs(hexToHsl(a)[0]-hexToHsl(DEFAULT_ACCENT2)[0]);
  return{a,b:Math.min(d,360-d)<45?DEFAULT_ACCENT:DEFAULT_ACCENT2};
}
let rankThemeApplied;
function applyRankTheme(force){
  if(!rankThemeOn())return;
  const tier=bestTierNow();
  if(!force&&tier===rankThemeApplied)return; // an accent change restyles the page: only on a new best
  rankThemeApplied=tier;
  const c=rankThemeColours(tier);
  applyAccent(c.a);applyAccent2(c.b);
  if($("sAccent")){$("sAccent").value=c.a;$("sAccent2").value=c.b}
}
function renderThemes(){
  const el=$("sThemes");if(!el)return;
  const pa=$("sAccent").value.toLowerCase(), pb=$("sAccent2").value.toLowerCase(), rank=rankThemeOn();
  const tile=(k,name,dots,on,sub)=>`<button type="button" role="radio" class="thm${on?" on":""}" data-theme="${k}" aria-checked="${on}">`
    +`<span class="thm-dots" aria-hidden="true">${dots.map(c=>`<i style="background:${c}"></i>`).join("")}</span><span class="thm-n">${esc(name)}${sub?`<small>${esc(sub)}</small>`:""}</span></button>`;
  const ladder=TIER_ORDER.map((t,i)=>`${TIER_COLORS[t]} ${Math.round(i/TIER_ORDER.length*360)}deg`).join(",");
  setHTML(el,THEMES.map(t=>tile(t.k,t.n,[t.a,t.b],!rank&&pa===t.a&&pb===t.b)).join("")
    +tile("rank","My best rank",[`conic-gradient(${ladder},${TIER_COLORS[TIER_ORDER[0]]} 360deg)`],rank,"follows your highest tier"));
}
function pickTheme(k){
  cancelAccentPreview();
  if(k==="rank"){pendingRankTheme=true;rankThemeApplied=undefined;applyRankTheme(true)}
  else{
    const t=THEMES.find(x=>x.k===k);if(!t)return;
    pendingRankTheme=false;
    $("sAccent").value=t.a;$("sAccent2").value=t.b;
    applyAccent(t.a);applyAccent2(t.b);applyAtmosphere(t.atm);
  }
  renderThemes();
}
function hexToHsl(hex){
  const r=parseInt(hex.slice(1,3),16)/255,g=parseInt(hex.slice(3,5),16)/255,b=parseInt(hex.slice(5,7),16)/255;
  const max=Math.max(r,g,b),min=Math.min(r,g,b);let h,s,l=(max+min)/2;
  if(max===min){h=0;s=0}else{
    const d=max-min;s=l>0.5?d/(2-max-min):d/(max+min);
    if(max===r)h=(g-b)/d+(g<b?6:0);else if(max===g)h=(b-r)/d+2;else h=(r-g)/d+4;
    h/=6;
  }
  return[h*360,s*100,l*100];
}
function hslToHex(h,s,l){
  s/=100;l/=100;
  const k=n=>(n+h/30)%12;
  const a=s*Math.min(l,1-l);
  const f=n=>l-a*Math.max(-1,Math.min(k(n)-3,Math.min(9-k(n),1)));
  const toHex=x=>Math.round(255*Math.max(0,Math.min(1,x))).toString(16).padStart(2,"0");
  return"#"+toHex(f(0))+toHex(f(8))+toHex(f(4));
}
function applyAccent(hex){
  const[h,s,l]=hexToHsl(hex);
  const root=document.documentElement.style;
  root.setProperty("--gold",hex);
  root.setProperty("--gold-dim",hslToHex(h,Math.max(s-10,0),Math.max(l-25,10)));
  root.setProperty("--gold-mid",hslToHex(h,Math.max(s-10,0),Math.min(Math.max(l-5,30),65)));
  root.setProperty("--star",hslToHex(h,Math.min(s+10,100),Math.min(l+20,88)));
  root.setProperty("--gold-txt",textSafe(h,s,l));
}
// Hold a hue inside the band that actually reads as type on our panels: chroma
// capped so a saturated accent stops vibrating, lightness floored so a deep one
// stays visible and ceilinged so a pale one doesn't glare.
function textSafe(h,s,l){return hslToHex(h,Math.min(s,72),Math.min(Math.max(l,68),86))}
// WCAG relative luminance — the only honest way to decide whether a colour wants
// dark or light text on it. Eyeballing "is this bright" from the hex fails badly
// on saturated blues and greens.
function relLuminance(hex){
  const ch=[1,3,5].map(i=>{
    const v=parseInt(hex.slice(i,i+2),16)/255;
    return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);
  });
  return 0.2126*ch[0]+0.7152*ch[1]+0.0722*ch[2];
}
// Secondary accent: the Login button, Refresh, focus rings, the card glow.
function applyAccent2(hex){
  const[h,s,l]=hexToHsl(hex);
  const root=document.documentElement.style;
  root.setProperty("--teal",hex);
  root.setProperty("--teal-txt",textSafe(h,s,l));
  // Anything filled with --teal prints its label in --teal-ink. A fixed dark ink
  // vanishes on a deep secondary and a fixed light one vanishes on a pale one,
  // so the ink follows the colour instead of being hardcoded.
  root.setProperty("--teal-ink",inkOn(hex));
}
/* Whichever of the two inks reads better on it, by contrast ratio. A luminance
   cut-off at 0.42 put white on mid-bright accents where dark was far better:
   white on Shadow Isles and Piltover was 2.8:1, on Void 3.4:1, all under the
   4.5:1 small text needs. */
function inkOn(hex){
  const[h,s]=hexToHsl(hex), dark=hslToHex(h,Math.min(s+15,100),9);
  const L=relLuminance(hex), cWhite=1.05/(L+0.05), cDark=(L+0.05)/(relLuminance(dark)+0.05);
  return cDark>=cWhite?dark:"#ffffff";
}
// Dragging the colour picker fires `input` continuously, and one accent change is
// not cheap: setting a custom property on :root makes the browser re-resolve
// style for everything beneath it, and with a full grid of cards that measured at
// 55-60 ms — several frames' worth. Answering every event meant the work queued up
// faster than it could be done and the page stopped responding.
//
// Measured, not guessed: the cost is proportional to how many elements hang off
// the root (hiding the grid alone took a step from 62 ms to 14 ms), so it cannot
// be optimised away from inside applyAccent — containment, compositing hints and
// re-declaring the variables on the grid all changed nothing. Rate limiting is
// the fix that works: the page follows the drag in steps instead of trying to
// repaint on every pixel, and the value you release on always lands via the
// trailing update and the picker's change event.
const ACCENT_MIN_MS=140;
let accentQueue=null, accentTimer=0, accentLast=0;
function flushAccents(){
  const q=accentQueue;accentQueue=null;accentTimer=0;accentLast=performance.now();
  if(!q)return;
  if(q.primary)applyAccent(q.primary);
  if(q.secondary)applyAccent2(q.secondary);
}
function previewAccent(which,hex){
  (accentQueue=accentQueue||{})[which]=hex;
  if(accentTimer)return; // an update is already due; it will pick up this value
  // accentLast=0 means nothing has been applied yet, and that first move must
  // show immediately — not "140 ms minus however long the page has been open"
  const wait=accentLast?ACCENT_MIN_MS-(performance.now()-accentLast):0;
  if(wait<=0)flushAccents();                       // first move: show it at once
  else accentTimer=setTimeout(flushAccents,wait);  // mid-drag: wait out the budget
}
// the picker's change event is the release, so that value skips the queue
function commitAccent(which,hex){
  (accentQueue=accentQueue||{})[which]=hex;
  clearTimeout(accentTimer);accentTimer=0;
  flushAccents();
}
// Reset and close both set colours directly, so a queued preview from a drag a
// moment earlier has to be dropped — otherwise it lands afterwards and quietly
// overwrites what the user just chose.
function cancelAccentPreview(){clearTimeout(accentTimer);accentTimer=0;accentQueue=null}
// Both pickers preview live while you drag them, so leaving Settings without
// saving has to put the saved colours back.
function revertAccents(){
  cancelAccentPreview();
  hideAccPrev();
  pendingRankTheme=null;
  applyAccent(cfg.accent||DEFAULT_ACCENT);
  applyAccent2(cfg.accent2||DEFAULT_ACCENT2);
  if(cfg.rankTheme)applyRankTheme(true);
}
function notify(title,body){
  if(!cfg.notify||!("Notification"in window)||Notification.permission!=="granted")return;
  try{new Notification(title,{body,icon:"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' fill='%23050c14'/%3E%3Crect x='9.5' y='9.5' width='13' height='13' fill='%23c8aa6e' transform='rotate(45 16 16)'/%3E%3C/svg%3E"})}catch(e){}
}

// ---------- export / import ----------
function downloadBlob(blob,filename){
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download=filename;
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),3000);
}
async function doExport(){
  if(previewMode){toast("Exit preview before exporting. This is example data, not your vault");return}
  const hasSecrets=accounts.some(a=>a.password||a.login||a.email);
  if(hasSecrets&&!await ask({title:"Download a plain-text backup?",
    body:"Login passwords and emails are readable in the file. With a master password set, the backup can be encrypted instead.",ok:"Download"}))return;
  const payload={app:"smurf-tracker",version:2,exported:new Date().toISOString(),plaintext:true,accounts};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
  downloadBlob(blob,"smurf-backup-plaintext-"+localDay()+".json");
  cfg.lastExport=Date.now();saveCfg();renderDash();renderSetup();
  toast("Plaintext backup exported. Keep it private");
}
/* With no master password the encrypted backup, the first and highlighted button,
   only sent you off to set one. It asks for a password for this backup instead,
   twice, since a typo would make the file unopenable. Import asks for it back. */
function askBackupPassword(){
  return ask({title:"Choose a password for this backup",
    body:"You have no master password, so the backup gets a password of its own. You need it to import the file, and it can't be recovered.",
    fields:[{label:"Backup password",type:"password",ac:"new-password"},{label:"The same again",type:"password",ac:"new-password"}],
    check:v=>v[0].length<4?"At least 4 characters":v[0]!==v[1]?"The two passwords don't match":"",ok:"Export"})
    .then(v=>v?v[0]:null);
}
async function doExportEnc(){
  if(previewMode){toast("Exit preview before exporting. This is example data, not your vault");return}
  if(vaultLocked()){toast("Unlock the vault first");return}
  const pass=vaultPassword||await askBackupPassword();
  if(!pass)return;
  try{
    const envelope=await encryptData(pass,accounts);
    if(vaultLocked())return;
    const payload={app:"smurf-tracker",version:2,exported:new Date().toISOString(),encrypted:true,envelope};
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
    downloadBlob(blob,"smurf-backup-encrypted-"+localDay()+".json");
    cfg.lastExport=Date.now();saveCfg();renderDash();renderSetup();
    toast(pass===vaultPassword?"Encrypted backup exported. Your master password opens it":"Encrypted backup exported. Its password opens it");
  }catch(e){toast("Encrypted export failed: "+(e.message||"error"))}
}
function csvCell(v){
  let s=String(v==null?"":v);
  // Spreadsheets treat a cell starting with = + - @ (or a control char) as a formula,
  // so a password like "@GN{Er..." or "+6qu..." gets executed or shown as #NAME? instead
  // of surviving the round trip. Prefix those with an apostrophe — doImportCSV strips
  // exactly one back off again, but only from files we exported ourselves.
  if(/^['=+\-@\t\r]/.test(s))s="'"+s;
  return /[",\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;
}
async function doExportCSV(){
  if(previewMode){toast("Exit preview before exporting. This is example data, not your vault");return}
  // The JSON backup warned that its passwords are readable; the spreadsheet, the file
  // most likely to be opened, shared or synced somewhere, said nothing.
  /* It also leaves the LP history out, which a sheet of one row an account cannot
     hold, and said nothing about that either: an export you might keep as your copy. */
  const CSV_PART="LP history isn't included; use Export backup for a full copy.";
  const asked=accounts.some(a=>a.password||a.login||a.email);
  if(asked&&!await ask({title:"Export a spreadsheet with your logins in it?",
    body:"Usernames, passwords and emails are in the file as plain text, readable by anyone who opens it. "+CSV_PART,ok:"Export"}))return;
  // The note fields go on the end, so every column a spreadsheet already reads by
  // position stays where it was.
  const nf=noteFields();
  const cols=["label","gameName","tagLine","region","status","tier","division","lp","wins","losses","level","login","password","email","createdOn","birthdate","tags","notes","favorite","lastUpdated"]
    .concat(nf.map(f=>f.label));
  const rows=accounts.map(a=>{
    const s=a.stats||{}, info=normInfo(a.info);
    const extra=nf.map(f=>{const v=nfValue(info,f);return v==null?"":Array.isArray(v)?v.join("|"):typeof v==="boolean"?(v?"yes":"no"):String(v)});
    return [
      a.label||"",a.gameName,a.tagLine,a.region,a.status||"active",
      s.tier||"",s.division||"",s.lp??"",s.wins??"",s.losses??"",s.level??"",
      a.login||"",a.password||"",a.email||"",a.createdOn||"",a.birthdate||"",(a.tags||[]).join("|"),a.notes||"",
      a.fav?"yes":"no",s.updatedAt?new Date(s.updatedAt).toISOString():"",...extra
    ].map(csvCell).join(",");
  });
  const csv=[cols.join(","),...rows].join("\r\n");
  const blob=new Blob([csv],{type:"text/csv"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download="smurf-export-"+localDay()+".csv";
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),3000);
  toast(asked?"CSV exported":"CSV exported. "+CSV_PART.replace(/\.$/,""));
}
function doImport(file){
  if(vaultLocked()){toast("Unlock the vault before importing");return}
  if(previewMode){previewMode=false;accounts=[]}
  const rd=new FileReader();
  rd.onload=async()=>{
    try{
      const p=JSON.parse(rd.result);
      let list=null;
      // Encrypted export: {encrypted:true,envelope:{__enc,…}} — or a bare envelope.
      const envelope=(p&&p.envelope&&p.envelope.__enc)?p.envelope
        :(p&&p.__enc)?p:null;
      if(envelope){
        // the master password first; a backup made with a password of its own asks for it
        if(vaultPassword){try{list=await decryptData(vaultPassword,envelope)}catch(e){list=null}}
        for(let tries=0;!list;tries++){
          const v=await ask({title:"This backup is encrypted",
            body:tries?"That password didn't open it. Try again.":"Type the password it was exported with.",
            fields:[{label:"Backup password",type:"password",ac:"current-password"}],check:v=>v[0]?"":"Type the password",ok:"Open"});
          if(!v)return;
          try{list=await decryptData(v[0],envelope)}catch(e){list=null}
        }
      }else{
        list=Array.isArray(p)?p:p.accounts;
      }
      if(!Array.isArray(list))throw new Error("no accounts array");
      const key=a=>(a.gameName+"#"+a.tagLine+"@"+a.region).toLowerCase();
      const fileSeen=new Set();
      const cleaned=list.filter(a=>a&&a.gameName&&a.tagLine)
        // id last, not first: spreading the file's own fields over the defaults
        // meant the uid() was thrown away whenever the backup carried an id, so
        // importing the same file twice produced accounts sharing an id — and
        // every per-card lookup goes through find(a=>a.id===id).
        .map(a=>{
          const row=Object.assign({fav:false,stats:null,tags:[],history:[],status:"active",label:"",login:"",password:"",email:"",notes:"",region:"EUW"},a,
            {id:uid(),region:normRegion(a.region),status:normStatus(a.status)});
          return sanitizeAccount(row);
        })
        // Same Riot ID twice in one file used to land as two rows with different
        // ids — merge and replace both treated them as distinct.
        .filter(a=>{const k=key(a);if(fileSeen.has(k))return false;fileSeen.add(k);return true});
      const how=accounts.length>0?await askMergeOrReplace("backup",cleaned.length):"replace";
      if(!how)return;
      const merge=how==="merge";
      if(merge){
        const seen=new Set(accounts.map(key));
        const add=cleaned.filter(a=>!seen.has(key(a)));
        accounts=accounts.concat(add);
        if(!await saveDB()){toast("Import saved in memory but could not write to storage");render();return}
        render();
        toast(add.length+" added, "+(cleaned.length-add.length)+" duplicates skipped");
      }else{
        accounts=cleaned;
        if(!await saveDB()){toast("Import saved in memory but could not write to storage");render();return}
        render();toast("Backup imported ("+cleaned.length+" accounts)");
      }
    }catch(e){toast("Import failed: not a valid backup file")}
  };
  // a file that can't be read at all (permissions, a device that went away, a
  // directory dropped on the picker) fired nothing and looked like a no-op
  rd.onerror=()=>toast("Couldn't read that file");
  rd.readAsText(file);
}

function parseCSV(text){
  // Excel and Sheets write a UTF-8 BOM, which lands inside the first header cell
  // and turns "label" into "﻿label" — so every lookup for the first column
  // missed and that column silently imported as empty.
  text=String(text).replace(/^﻿/,"");
  const rows=[];let row=[],field="",inQuotes=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(inQuotes){
      if(c==='"'){if(text[i+1]==='"'){field+='"';i++}else inQuotes=false}
      else field+=c;
    }else{
      if(c==='"')inQuotes=true;
      else if(c===','){row.push(field);field=""}
      else if(c==='\r'){}
      else if(c==='\n'){row.push(field);rows.push(row);row=[];field=""}
      else field+=c;
    }
  }
  if(field.length||row.length){row.push(field);rows.push(row)}
  return rows.filter(r=>r.length>1||r[0]);
}
// The note-field columns this app's own export puts after lastUpdated, read back by
// their names; your own fields come back as the kind the field list says they are.
function csvNoteInfo(header,get){
  const out={own:{}}, kinds=new Map(ownFields().map(c=>[c.label.toLowerCase(),c.kind]));
  for(const name of header.slice(header.indexOf("lastUpdated")+1)){
    const raw=String(get(name)||"").trim();if(!raw)continue;
    const f=NOTE_FIELDS.find(x=>x.label===name);
    const kind=f?f.kind:kinds.get(name.toLowerCase())||(raw==="yes"||raw==="no"?"bool":/^-?\d+(\.\d+)?$/.test(raw)?"num":"text");
    const v=kind==="list"?raw.split("|"):kind==="bool"?(raw==="yes"?true:raw==="no"?false:null)
      :kind==="num"||kind==="honor"?Number(raw):raw;
    if(v==null||Number.isNaN(v))continue;
    if(f)out[f.k]=v;else out.own[name]=v;
  }
  return normInfo(out);
}
function doImportCSV(file){
  if(vaultLocked()){toast("Unlock the vault before importing");return}
  if(previewMode){previewMode=false;accounts=[]}
  const rd=new FileReader();
  rd.onload=async()=>{
    try{
      const rows=parseCSV(rd.result);
      if(rows.length<2)throw new Error("empty");
      const header=rows[0];
      // Only un-escape the apostrophe csvCell() adds when this is one of our own exports —
      // a third-party CSV whose password genuinely starts with ' must come through untouched.
      const ownExport=header.includes("gameName")&&header.includes("favorite")&&header.includes("lastUpdated");
      const key=a=>(a.gameName+"#"+a.tagLine+"@"+a.region).toLowerCase();
      const fileSeen=new Set();
      const list=rows.slice(1).map(r=>{
        const get=name=>{
          const i=header.indexOf(name);
          const v=i>=0?(r[i]||""):"";
          return ownExport&&v.startsWith("'")?v.slice(1):v;
        };
        const gameName=get("gameName"),tagLine=get("tagLine");
        if(!gameName||!tagLine)return null;
        /* As typed in a spreadsheet: "gold", "Gold 2", "ii". A division of "2" was
           stored as written, read by the chart as IV and shown as "Gold 2". */
        const tier=get("tier").trim().toUpperCase();
        const dv=get("division").trim().toUpperCase(), div={"1":"I","2":"II","3":"III","4":"IV"}[dv]||(dv in DIV_ORDER?dv:null);
        return sanitizeAccount({
          id:uid(),tags:get("tags")?get("tags").split("|").filter(Boolean):[],history:[],
          label:get("label"),region:normRegion(get("region")),gameName,tagLine,status:normStatus(get("status")),
          login:get("login"),password:get("password"),email:get("email"),notes:get("notes"),
          createdOn:get("createdOn"),birthdate:get("birthdate"),
          fav:get("favorite")==="yes",info:ownExport?csvNoteInfo(header,get):null,
          stats:tier?{found:true,tier,division:normDivision(tier,div),lp:get("lp")?+get("lp"):null,wins:get("wins")?+get("wins"):null,losses:get("losses")?+get("losses"):null,level:get("level")?+get("level"):null,mmr:null,avgRecent:null,asOf:"CSV import",note:null,updatedAt:get("lastUpdated")?new Date(get("lastUpdated")).getTime()||null:null}:null
        });
      }).filter(Boolean)
        .filter(a=>{const k=key(a);if(fileSeen.has(k))return false;fileSeen.add(k);return true});
      if(!list.length)throw new Error("no rows");
      const how=accounts.length>0?await askMergeOrReplace("file",list.length):"replace";
      if(!how)return;
      const merge=how==="merge";
      if(merge){
        const seen=new Set(accounts.map(key));
        const add=list.filter(a=>!seen.has(key(a)));
        accounts=accounts.concat(add);
        if(!await saveDB()){toast("Import saved in memory but could not write to storage");render();return}
        render();
        toast(add.length+" added, "+(list.length-add.length)+" duplicates skipped");
      }else{
        accounts=list;
        if(!await saveDB()){toast("Import saved in memory but could not write to storage");render();return}
        render();toast("CSV imported ("+list.length+" accounts)");
      }
    }catch(e){toast("CSV import failed: not a valid export file")}
  };
  // a file that can't be read at all (permissions, a device that went away, a
  // directory dropped on the picker) fired nothing and looked like a no-op
  rd.onerror=()=>toast("Couldn't read that file");
  rd.readAsText(file);
}

// ---------- demo data ----------
function loadDemo(){
  const now=Date.now(),D=86400000;
  const mk=o=>Object.assign({id:uid(),fav:false,status:"active",tags:[],history:[],login:"",password:"",email:"",notes:"",label:"",demo:true},o);
  accounts=[
    /* Invented names only: the first one used to be a famous pro's real account.
       No MMR or "recent average" either: those come only from the paid AI check,
       so a free vault never shows them, and the preview shouldn't promise them.
       And a note that fits the account: decay starts at Diamond, not Platinum. */
    mk({label:"Main smurf",gameName:"Moonlit Mid",tagLine:"0001",region:"EUW",fav:true,tags:["mid","ranked-ready"],login:"demo_user1",password:"demo-pass-1",email:"smurf1@mail.gg",notes:"Push for Diamond before the split ends",
      info:{honor:3,owned:96,be:23400,twofa:true,skins:["Elementalist Lux","Star Guardian Ahri","Arcade Kai'Sa"]},
      stats:{found:true,tier:"PLATINUM",division:"II",lp:61,wins:38,losses:29,level:214,icon:"https://opgg-static.akamaized.net/meta/images/profile_icons/profileIcon1.jpg",asOf:"updated today",updatedAt:now-2*3600000,
        champs:[{name:"Lux",games:24,wins:15,losses:9,wr:63,kda:"3.4"},{name:"Ahri",games:18,wins:10,losses:8,wr:56,kda:"2.9"},{name:"Syndra",games:9,wins:4,losses:5,wr:44,kda:"2.1"}]},
      history:[
        {t:now-24*D,tier:"GOLD",division:"II",lp:40},{t:now-20*D,tier:"GOLD",division:"I",lp:15},{t:now-16*D,tier:"GOLD",division:"I",lp:78},
        {t:now-12*D,tier:"PLATINUM",division:"IV",lp:12},{t:now-9*D,tier:"PLATINUM",division:"IV",lp:55},{t:now-6*D,tier:"PLATINUM",division:"III",lp:31},
        {t:now-3*D,tier:"PLATINUM",division:"III",lp:74},{t:now-2*3600000,tier:"PLATINUM",division:"II",lp:61}]}),
    mk({label:"ADC acc",gameName:"Bot Diff",tagLine:"EUW",region:"EUW",tags:["adc"],login:"demo_user2",password:"demo-pass-2",email:"smurf2@mail.gg",notes:"",
      info:{honor:2,owned:41,be:6150,twofa:false,skins:["Spirit Blossom Yasuo"]},
      stats:{found:true,tier:"GOLD",division:"III",lp:22,wins:21,losses:24,level:167,asOf:"updated 4 days ago",updatedAt:now-4*D,
        champs:[{name:"Jinx",games:20,wins:10,losses:10,wr:50,kda:"2.6"},{name:"Kai'Sa",games:15,wins:7,losses:8,wr:47,kda:"2.4"}]},
      history:[{t:now-14*D,tier:"GOLD",division:"II",lp:35},{t:now-10*D,tier:"GOLD",division:"II",lp:8},{t:now-7*D,tier:"GOLD",division:"III",lp:71},{t:now-4*D,tier:"GOLD",division:"III",lp:22}]}),
    mk({label:"EUNE fill acc",gameName:"Coinflip Queue",tagLine:"EUNE",region:"EUNE",tags:["fill"],login:"demo_user3",password:"demo-pass-3",
      stats:{found:true,tier:"SILVER",division:"I",lp:89,wins:15,losses:11,level:98,asOf:"updated yesterday",updatedAt:now-1*D,
        champs:[{name:"Thresh",games:14,wins:9,losses:5,wr:64,kda:"3.1"},{name:"Lee Sin",games:8,wins:4,losses:4,wr:50,kda:"2.2"}]},
      history:[{t:now-8*D,tier:"SILVER",division:"II",lp:60},{t:now-5*D,tier:"SILVER",division:"II",lp:95},{t:now-1*D,tier:"SILVER",division:"I",lp:89}]}),
    mk({label:"Fresh leveling acc",gameName:"NewSmurf",tagLine:"2026",region:"EUW",status:"resting",tags:["leveling"],login:"demo_user4",password:"demo-pass-4",
      stats:{found:true,tier:"UNRANKED",division:null,lp:null,wins:null,losses:null,level:23,mmr:null,avgRecent:null,asOf:"updated 6 days ago",note:null,updatedAt:now-6*D}}),
    mk({label:"RIP acc",gameName:"Chat Restricted",tagLine:"4444",region:"EUNE",status:"banned",tags:["dead"],notes:"",
      info:{honor:0,skins:["Prestige K/DA Akali"],penalty:"Permanent ban for chat"},
      stats:{found:true,tier:"BRONZE",division:"I",lp:12,wins:40,losses:52,level:301,asOf:"before the ban",updatedAt:now-40*D},
      history:[{t:now-50*D,tier:"BRONZE",division:"II",lp:30},{t:now-40*D,tier:"BRONZE",division:"I",lp:12}]})
  ];
  previewMode=true;render();
}

// ---------- events ----------
$("bAdd").addEventListener("click",()=>{if($("form").classList.contains("hidden"))openForm(null);else cancelForm()});
$("fSave").addEventListener("click",submitForm);
$("fCancel").addEventListener("click",cancelForm);
// Enter in a field submits the form — except inside the notes textarea, where it
// still means a newline.
$("form").addEventListener("keydown",e=>{
  if(e.key!=="Enter")return;
  // a button (More details, Fields…, Gen) does its own thing on Enter
  if(e.target&&(e.target.tagName==="TEXTAREA"||e.target.tagName==="BUTTON"))return;
  e.preventDefault();
  submitForm();
});
// A CSS-masked text field only stays secret where the browser implements
// text-security. Anywhere it doesn't, a stored password would sit on screen in
// clear — so those browsers get a real password field back, prompt and all.
const CAN_MASK=typeof CSS!=="undefined"&&CSS.supports&&
  (CSS.supports("-webkit-text-security","disc")||CSS.supports("text-security","disc"));
if(!CAN_MASK)for(const id of ["fPass","sKey"]){const el=$(id);if(el){el.type="password";el.classList.remove("mask")}}
function setPassShown(show){
  if(!CAN_MASK){$("fPass").type=show?"text":"password"}
  $("fPass").classList.toggle("mask",!show&&CAN_MASK);
  $("fToggleIco").outerHTML=`<svg id="fToggleIco" class="ico" viewBox="0 0 24 24">${show?ICON.eyeOff:ICON.eye}</svg>`;
  $("fTogglePass").title=show?"Hide password":"Show password";
  $("fTogglePass").setAttribute("aria-label",show?"Hide password":"Show password");
}
$("fGen").addEventListener("click",async()=>{
  if($("fPass").value&&!await ask({title:"Replace the password in this field?",body:"The one there now is gone, with no undo.",ok:"Replace",danger:true}))return;
  $("fPass").value=genPassword(16);
  setPassShown(true);
  renderPwMeter();
  toast("Password generated. It is shown in clear so you can note it");
});
$("fPass").addEventListener("input",renderPwMeter);
$("fTogglePass").addEventListener("click",()=>{
  // On browsers without text-security the field is type=password and never gets
  // the .mask class — reading .mask always looked "shown", so the eye could only
  // hide and never reveal again.
  const hidden=CAN_MASK?$("fPass").classList.contains("mask"):$("fPass").type==="password";
  setPassShown(hidden);
});
document.addEventListener("keydown",e=>{
  if(snapMode)return; // a snapshot has no app behind it to drive
  /* The lock screen is a vault nobody can read. Focus on Unlock is a BUTTON, so
     `typing` is false, and f / n / / used to fire underneath: unlock, and the
     Favorites filter is on (accounts look "missing") or the add form is open.
     Ctrl+K in the password field opened Quick find over an empty accounts array
     and toasted "Nothing in the vault yet". Same idea while Help or Settings is
     up — the page behind the dialog is not the thing being typed at. */
  if(vaultLocked()){
    if(e.key==="Escape"){
      if($("accPrev").classList.contains("show")){hideAccPrev();return}
      closeAllPanels();
    }
    return;
  }
  if(openModals().some(m=>m.id!=="palette")){
    if(e.key==="Escape"){
      // Colour miniature alone — Escape used to close Settings while the picker
      // was the thing being dismissed.
      if($("accPrev").classList.contains("show")){hideAccPrev();return}
      requestClose();
    }
    return;
  }
  const tag=document.activeElement?document.activeElement.tagName:"";
  const typing=tag==="INPUT"||tag==="TEXTAREA"||tag==="SELECT";
  // Works while typing, unlike every other shortcut here — Ctrl+K is the one you
  // reach for *because* your hands are already on the keyboard.
  if((e.key==="k"||e.key==="K")&&(e.ctrlKey||e.metaKey)&&!e.altKey){
    e.preventDefault();
    $("palette").classList.contains("hidden")?openPalette():closePalette();
    return;
  }
  if(e.key==="/"&&!typing){e.preventDefault();$("tSearch").focus()}
  if(e.key==="n"&&!typing&&!e.ctrlKey&&!e.metaKey){e.preventDefault();openForm(null)}
  if(e.key==="f"&&!typing&&!e.ctrlKey&&!e.metaKey){e.preventDefault();$("tFav").click()}
  // H only ever hides: turning streamer mode off is the pill's job, never a stray key
  if((e.key==="h"||e.key==="H")&&!typing&&!e.ctrlKey&&!e.metaKey&&!e.altKey){e.preventDefault();if(!streamerOn())setStreamer(true);else toast("Streamer mode is on. Click its pill in the header to turn it off")}
  if(e.key==="Escape"){
    if($("accPrev").classList.contains("show")){hideAccPrev();return}
    // Quick find sits over everything, so it goes first. With a card's login
    // still open underneath, Escape used to fold the card away behind the
    // palette and leave the palette up.
    if(!$("palette").classList.contains("hidden")){closePalette();return}
    // Whatever a card has unfolded goes first — that is what is in front of you,
    // and hunting down the button that opened each panel was the complaint.
    // Only once the cards are tidy does Escape mean "close the page's panels".
    if(closeCardPanels())return;
    closeAllPanels();editingId=null;if(armedDelete){armedDelete=null;renderGrid()}
  }
});
// mousemove alone fires a hundred times a second while the pointer is moving, and
// all any of these do is stamp a clock. A second's resolution is far finer than
// an auto-lock measured in minutes needs.
{
  let coarse=0;
  const touch=()=>{const t=Date.now();if(t-coarse<1000)return;coarse=t;lastActivity=t};
  for(const evt of["mousemove","keydown","click","scroll","touchstart"])
    document.addEventListener(evt,touch,{passive:true});
}
// The idle timer only exists while there is something to lock. It used to tick
// every 15 s for the entire life of the tab even with no master password set —
// nothing to do, but enough to keep waking a backgrounded page.
let lockTimer=0;
function syncLockTimer(){
  const want=!!vaultPassword&&cfg.autoLockMin>0;
  if(want===!!lockTimer)return;
  if(!want){clearInterval(lockTimer);lockTimer=0;return}
  lockTimer=setInterval(checkAutoLock,15000);
  if(lockTimer&&lockTimer.unref)lockTimer.unref(); // don't keep a Node/test process alive just for this
}
function checkAutoLock(){
  if(vaultPassword&&cfg.autoLockMin>0&&Date.now()-lastActivity>cfg.autoLockMin*60000)relock();
}
// Everything decorative is parked while the page is out of sight, and the lock is
// re-evaluated the moment it comes back: background tabs have their timers
// throttled hard, so a tab hidden for an hour must not come back still unlocked
// because the interval only managed to fire a handful of times.
document.addEventListener("visibilitychange",()=>{
  const away=document.hidden;
  document.body.classList.toggle("away",away);
  if(!away)checkAutoLock();
});
document.body.classList.toggle("away",document.hidden); // a restored tab can boot already hidden
// A <select> keeps focus after you pick an option, so its focus tint sits on the
// control until you happen to click elsewhere. Once you've picked with the mouse
// you're done with the field, so drop focus then. Keyboard picks must keep it —
// otherwise tabbing through the toolbar loses its place mid-row. Delegated, so it
// covers the selects the cards render on the fly too.
{
  let pickedByPointer=false;
  document.addEventListener("pointerdown",e=>{
    pickedByPointer=!!(e.target&&e.target.tagName==="SELECT");
  },true);
  // any keypress means the user is on the keyboard now, whatever started the interaction
  document.addEventListener("keydown",()=>{pickedByPointer=false},true);
  document.addEventListener("change",e=>{
    if(pickedByPointer&&e.target&&e.target.tagName==="SELECT")e.target.blur();
    pickedByPointer=false;
  });
}
document.querySelectorAll("[data-close-panel]").forEach(btn=>btn.addEventListener("click",requestClose));

// ---------- modal panels ----------
// Settings and Help open over the page. Everything a modal owes the user beyond
// looking like one — the page behind it not scrolling, focus starting inside it
// and coming back afterwards, Tab staying in, a click on the backdrop closing it
// — is here.
//
// Driven by an observer rather than by each of the eight places that add or
// remove .hidden on these two. Wiring it into every call site works right up
// until the ninth one is added and quietly doesn't lock the page.
/* Every "are you sure" used the browser's own grey box: replacing the vault from
   sync, a new season, leaving a form, removing a field, deleting accounts. It
   looked like a different program, and on a phone it covered the app with the
   site's address. ask() is the same question in the app's own window, over the
   one that asked. It resolves to "ok" (or "alt", for the one question with two
   ways forward, adding or replacing on import) and to false on Cancel, Escape,
   a click outside or the back button. A destructive answer is red, and focus
   starts on Cancel for those, so Enter alone never deletes anything. */
let askDone=null, askCheck=null;
/* `fields` makes it a question that needs something typed ([{label,type,ac}]); it
   then resolves to the values, once `check` (values => an error, or "") passes. */
function ask(o){
  if(askDone)askDone(false);
  const m=$("askModal"), ok=$("askOk"), alt=$("askAlt"), cancel=$("askCancel"), box=$("askFields");
  $("askTitle").textContent=o.title;
  $("askBody").textContent=o.body||"";
  const fields=o.fields||null;
  setHTML(box,fields?fields.map((f,i)=>`<label><span>${esc(f.label)}</span><input id="askF${i}" type="${esc(f.type||"text")}" autocomplete="${esc(f.ac||"off")}"${i===0?" data-autofocus":""}></label>`).join("")
    +`<p class="ask-err" id="askErr" role="alert"></p>`:"");
  box.hidden=!fields;
  askCheck=fields?()=>{
    const v=fields.map((_,i)=>$("askF"+i).value), err=o.check?o.check(v):"";
    $("askErr").textContent=err||"";return err?null:v;
  }:null;
  ok.textContent=o.ok||"OK";ok.className=o.danger?"b-danger":"b-fill";
  alt.hidden=!o.alt;alt.textContent=o.alt||"";alt.className=o.altDanger?"b-danger":"";
  // cancel:false for a window that only tells you something
  cancel.hidden=o.cancel===false;cancel.textContent=o.cancel||"Cancel";
  for(const b of[ok,alt,cancel])b.removeAttribute("data-autofocus");
  if(!fields)(o.danger||o.altDanger?cancel:ok).setAttribute("data-autofocus","");
  return new Promise(res=>{
    // what was typed leaves the page with the answer: a password is not left in a hidden field
    askDone=v=>{askDone=null;askCheck=null;m.classList.add("hidden");box.textContent="";res(v)};
    m.classList.remove("hidden");
  });
}
// An import into a vault that already has accounts: add the new ones, or replace
// everything. The browser's box could only say "OK = MERGE, Cancel = replace",
// so there was no way to back out, and replacing took a second box after it.
function askMergeOrReplace(what,n){
  return ask({title:"Add this "+what+" to the vault, or replace it?",
    body:"This vault has "+accounts.length+" account"+(accounts.length===1?"":"s")+" and the "+what+" "+n+". "
      +"Adding keeps everything here and adds the accounts that are new. Replacing leaves only the "+what+"'s, with no undo.",
    ok:"Add the new ones",alt:"Replace everything",altDanger:true})
    .then(v=>v==="ok"?"merge":v==="alt"?"replace":false);
}
$("askOk").addEventListener("click",()=>{
  if(!askDone)return;
  if(askCheck){const v=askCheck();if(v)askDone(v);return}
  askDone("ok");
});
$("askFields").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();$("askOk").click()}});
$("askAlt").addEventListener("click",()=>{if(askDone)askDone("alt")});
$("askCancel").addEventListener("click",()=>{if(askDone)askDone(false)});
// Escape answers the question and nothing else: the window behind stays open
document.addEventListener("keydown",e=>{
  if(e.key==="Escape"&&askDone){e.preventDefault();e.stopImmediatePropagation();askDone(false)}
},true);
const MODALS=["askModal","settings","help","form","rankModal","palette","compareModal","bulkAdd","artPicker","shareModal"];
let modalReturn=null;
function openModals(){return MODALS.map($).filter(el=>el&&!el.classList.contains("hidden"))}
/* The phone's back button left the app. A window here is not a page of its own,
   so with Settings or Add account open, back on Android (or in the installed
   app) went past the whole app instead of closing the window. While a window is
   open there is one history entry for it: back takes it and closes the window,
   the way Escape does. A window closed any other way takes the entry back out,
   so the next back press means what it always meant. */
/* Read off the history itself, not a flag of our own: a window that closes and
   another that opens before the browser has carried out the step back left a
   flag saying "there is an entry" over an entry that was already gone. */
let backSkip=false;
/* Each window takes a history entry, and closing it steps back off that entry. On
   that step the browser put the page back where it had been when the window opened:
   after Add account, at the top, while the new account's card was being scrolled to.
   Windows never move the page, so there is nothing for the browser to restore. */
try{if("scrollRestoration" in history)history.scrollRestoration="manual"}catch(e){}
function onWindowEntry(){try{return !!(history.state&&history.state.smurfWindow)}catch(e){return false}}
function syncBackStep(open){
  if(snapMode||backSkip)return;   // our own step back is on its way; popstate settles it
  if(open&&!onWindowEntry()){try{history.pushState({smurfWindow:1},"")}catch(e){}}
  else if(!open&&onWindowEntry()){backSkip=true;try{history.back()}catch(e){backSkip=false}}
}
addEventListener("popstate",()=>{
  if(backSkip){backSkip=false;syncBackStep(openModals().length>0);return}
  if(!openModals().length)return;
  // the window in front goes first, as with Escape; whatever stays open behind it
  // (or a form you chose to keep editing) takes a new entry through syncModals
  if(askDone){askDone(false);return}
  if(!$("palette").classList.contains("hidden")){closePalette();return}
  requestClose();
});
// a reload keeps the history entry a window had taken; with nothing open it is ours to clear
try{if(onWindowEntry())history.replaceState(null,"")}catch(e){}
function syncModals(){
  const open=openModals();
  document.body.classList.toggle("modal-open",open.length>0);
  syncBackStep(open.length>0);
  if(open.length){
    if(!modalReturn){
      const a=document.activeElement;
      // body means nothing had focus; restoring to it later would be a no-op that
      // still counts as "handled", so don't record it
      modalReturn=a&&a!==document.body?a:null;
    }
    const el=open[0];
    if(!el.contains(document.activeElement)){
      /* Where a window wants to start is marked in its markup — Help on Got it,
         since landing on ✕ reads as "leave", not "read"; Add account on the name
         and Bulk add on the list, past the optional field above each. Two of those
         used to focus themselves before this ran, which this then recorded as the
         way back, and closing them dropped focus on <body>. Otherwise the first
         real field, not the ✕ — landing on Close reads as "are you sure you meant
         to open this". */
      const first=el.querySelector("[data-autofocus]")
        ||el.querySelector("input:not([type=hidden]),select,textarea")||el.querySelector("button");
      if(first)first.focus();
    }
  }else if(modalReturn){
    // Back to whatever opened it, so the keyboard doesn't restart at the top of
    // the page. Settings is opened from inside the ⋯ menu, which closes with it —
    // focusing a display:none button silently does nothing and drops focus to
    // <body>, so that one hands back to the tray button the menu hangs off.
    const back=modalReturn.isConnected
      ?(modalReturn.closest("#moreMenu")?$("bMore"):modalReturn)
      :null;
    // without scrolling: the page may have moved on (to a new account) meanwhile
    try{if(back)back.focus({preventScroll:true})}catch(e){}
    modalReturn=null;
  }
}
{
  const obs=new MutationObserver(syncModals);
  for(const id of MODALS){
    const el=$(id);
    if(!el)continue;
    obs.observe(el,{attributes:true,attributeFilter:["class"]});
    // Only a press that both starts and ends on the backdrop counts. Checking the
    // click alone would close the panel when a text selection that began inside it
    // happened to be released outside.
    let downOnBack=false;
    el.addEventListener("mousedown",e=>{downOnBack=e.target===el});
    el.addEventListener("click",e=>{
      if(downOnBack&&e.target===el){if(id==="askModal"){if(askDone)askDone(false)}else requestClose()}
      downOnBack=false});
  }
}
document.addEventListener("keydown",e=>{
  if(e.key!=="Tab")return;
  const el=openModals()[0];
  if(!el)return;
  /* Only what Tab can actually land on. Settings ends in the colour preview, which
     is inert with tabindex -1 throughout — and its last button, taken as "last",
     meant Tab from Close was never caught and walked out into the page behind. */
  const f=[...el.querySelectorAll('a[href],button,input:not([type=hidden]),select,textarea,[tabindex]')]
    .filter(x=>!x.disabled&&x.getAttribute("tabindex")!=="-1"&&!x.closest("[inert],.hidden"));
  if(!f.length)return;
  const first=f[0], last=f[f.length-1];
  if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
  else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
});
$("bMore").addEventListener("click",()=>$("moreMenu").classList.toggle("hidden"));
$("moreMenu").addEventListener("click",e=>{if(e.target.closest("button"))$("moreMenu").classList.add("hidden")});
document.addEventListener("click",e=>{if(!e.target.closest("#moreMenu")&&!e.target.closest("#bMore"))$("moreMenu").classList.add("hidden")});
// Closing has to go through the same door as the ✕ and Escape do. Toggling the panel
// shut from the ⋯ menu only hid it, which left a colour you had dragged but not saved
// applied to the whole page — the one close out of four that kept it.
// Everything in Appearance previews live; leaving Settings without saving, by
// any way out, puts it all back. Close did this for every setting, but Escape,
// the ✕ and the backdrop (closeAllPanels) only for the colours and atmosphere.
function revertLookPreviews(){
  revertAccents();revertAtmosphere();applyEffects(cfg.effects);applyTextSize(cfg.textSize);
  if(pendingCardHide||pendingChampArt!==null){pendingCardHide=null;pendingChampArt=null;applyCompact();renderGrid()}
}
function closeSettings(){revertLookPreviews();settingsSaveGen++;$("settings").classList.add("hidden")}
/* Every change here shows live and waits for Save: closing puts it back, so a
   colour can be tried and walked away from. Picking a theme and pressing Esc
   undid it without a word, though. Once something has changed, the footer says
   what Save and closing each do. */
const S_FOOT="Stays in this browser unless you use Device sync.";
let sUnsaved=false;
function settingsDirty(on){
  sUnsaved=!!on;
  const h=$("sFootHint");if(!h)return;
  h.classList.toggle("dirty",!!on);
  h.textContent=on?"Not saved yet. Save keeps it; closing asks first.":S_FOOT;
}
// fields that act on their own button, or save the moment they change, not on Save
const S_SELF=new Set(["sVaultPass","sSyncToken"]);
/* Closing put back whatever Save had not kept, which is right for a theme being
   tried on and wrong for a Backend URL or a webhook just pasted in: that was gone
   with one Escape, the way the account form used to lose what you typed. Now a
   change that would be lost is asked about, as the form does. */
function settingsUnsaved(){return sUnsaved&&!$("settings").classList.contains("hidden")}
async function leaveSettings(){
  if(!settingsUnsaved())return true;
  // the same question as the account form's, with Save beside it
  const r=await ask({title:"Discard your changes to Settings?",body:"They aren't saved yet. Discarding puts them back the way they were.",
    ok:"Discard",danger:true,alt:"Save",cancel:"Keep editing"});
  if(r==="alt"){$("sSave").click();return false}  // Save closes the window itself, once the links check out
  return r==="ok";
}
function requestCloseSettings(){
  if(!settingsUnsaved()){closeSettings();return}
  leaveSettings().then(ok=>{if(ok)closeSettings()});
}
$("settings").addEventListener("input",e=>{if(e.target.closest(".mdl-b")&&!S_SELF.has(e.target.id))settingsDirty(true)});
$("settings").addEventListener("change",e=>{if(e.target.closest(".mdl-b")&&!S_SELF.has(e.target.id))settingsDirty(true)});
$("settings").addEventListener("click",e=>{
  // inside this window only: <body> carries data-atmosphere for the page's own
  // background, so closest() matched it on every click, a tab included, and the
  // footer said "Not saved yet" when nothing had changed
  const hit=e.target.closest("[data-theme],[data-atmosphere],#sEffects [data-v],#sTextSize [data-v],#sCompact,.acc-reset");
  if(hit&&e.currentTarget.contains(hit))settingsDirty(true);
});
$("bFind").addEventListener("click",openPalette);
$("tFindKey").addEventListener("click",openPalette);
// a Mac's key for it is ⌘, and that is what its keyboard says
if(/Mac|iPhone|iPad/.test(navigator.platform||navigator.userAgent||"")){$("tFindKey").textContent="⌘ K";$("bFind").title="Quick find (⌘K)"}
$("bSettings").addEventListener("click",()=>$("settings").classList.contains("hidden")?openSettings():requestCloseSettings());
$("bNewSeason").addEventListener("click",()=>{$("moreMenu").classList.add("hidden");newSeasonAll()});
for(const[id,ic]of Object.entries(MORE_MENU_ICONS)){const b=$(id);if(b)setMenuItem(b,ic,b.textContent.trim())}
$("bStreamer").addEventListener("click",()=>{$("moreMenu").classList.add("hidden");setStreamer(!streamerOn())});
$("streamerPill").addEventListener("click",()=>setStreamer(false));
$("settings").querySelector(".stabs").addEventListener("click",e=>{const b=e.target.closest("[data-stab]");if(b)settingsTab(b.dataset.stab)});
$("settings").querySelector(".stabs").addEventListener("keydown",e=>{
  const i=SETTINGS_TABS.indexOf($("settings").dataset.tab);
  const to=e.key==="ArrowRight"?i+1:e.key==="ArrowLeft"?i-1:e.key==="Home"?0:e.key==="End"?SETTINGS_TABS.length-1:null;
  if(to===null)return;
  e.preventDefault();settingsTab(SETTINGS_TABS[(to+SETTINGS_TABS.length)%SETTINGS_TABS.length],true);
});
// the backup buttons in Settings do what their twins in the ⋯ menu do
for(const b of document.querySelectorAll("#settings [data-proxy]"))b.addEventListener("click",()=>{
  const t=$(b.dataset.proxy);if(t)t.click();setTimeout(updateBackupLast,0);
});
$("sSave").addEventListener("click",async()=>{
  // Validate the two free-text URLs before touching cfg — a bail after partial
  // assignment left the session with the new API key / auto-check values even
  // though Save had "failed", and Close could not put them back.
  const backend=$("sBackend").value.trim();
  let backendOk="";
  if(backend){
    backendOk=validBackendUrl(backend);
    if(!backendOk){toast("Backend URL must be a full http(s) link");return}
  }
  const wh=$("sDiscord").value.trim();
  let whOk="";
  if(wh){
    whOk=validDiscordWebhook(wh);
    if(!whOk){toast("Discord webhook must be an https://discord.com/api/webhooks/… URL");return}
  }
  // Ask for notification permission before mutating cfg. Chrome's prompt does not
  // block the page — Escape during it used to close Settings while Save still
  // wrote everything afterwards. A generation token cancels that late write.
  let wantNotify=$("sNotify").checked;
  let notifyNote="";
  const saveGen=++settingsSaveGen;
  if(wantNotify&&"Notification"in window&&Notification.permission==="default"){
    const perm=await Notification.requestPermission();
    if(saveGen!==settingsSaveGen)return; // a newer Save, or we gave up
    if($("settings").classList.contains("hidden"))return; // closed during the prompt
    if(perm!=="granted"){wantNotify=false;$("sNotify").checked=false;notifyNote=". Notifications are blocked by the browser"}
  }else if(wantNotify&&"Notification"in window&&Notification.permission==="denied"){
    wantNotify=false;$("sNotify").checked=false;notifyNote=". Notifications are blocked in the browser's site settings";
  }
  if(saveGen!==settingsSaveGen)return;
  cancelAccentPreview();
  cfg.apiKey=$("sKey").value.trim();cfg.model=$("sModel").value;cfg.autoCheck=$("sAuto").checked;cfg.autoEveryHours=coerceAutoEvery($("sAutoEvery").value);cfg.autoRankedOnly=$("sAutoRanked").checked;
  cfg.backendUrl=backendOk;$("sBackend").value=backendOk;
  cfg.notify=wantNotify;
  cfg.discordWebhook=whOk;$("sDiscord").value=whOk;
  const wantWatch=$("sWatch").checked&&!!backendOk&&!!whOk;
  if($("sWatch").checked&&!wantWatch)notifyNote+=". Decay alerts need the worker and the Discord webhook";
  if(wantWatch){if(!cfg.watchToken)cfg.watchToken=genSyncToken();const was=cfg.watch;cfg.watch=true;if(!was)setTimeout(()=>syncWatch(true).then(updateWatchStatus),0)}
  else if(cfg.watch){stopWatch();cfg.watch=null}
  $("sWatch").checked=wantWatch;
  cfg.autoLockMin=clampAutoLock($("sAutoLock").value);
  // null, not the default's own hex, when that is what the picker is sitting on:
  // "no colour chosen" is a different thing to store than "chose exactly this one",
  // and it is what lets the default move later without dragging every vault that
  // never picked anything along behind it.
  cfg.rankTheme=rankThemeOn()||null;pendingRankTheme=null;
  if(cfg.rankTheme){cfg.accent=null;cfg.accent2=null;applyRankTheme(true)} // computed, so nothing fixed to store
  else{
    cfg.accent=$("sAccent").value===DEFAULT_ACCENT?null:$("sAccent").value;applyAccent(cfg.accent||DEFAULT_ACCENT);
    cfg.accent2=$("sAccent2").value===DEFAULT_ACCENT2?null:$("sAccent2").value;applyAccent2(cfg.accent2||DEFAULT_ACCENT2);
  }
  // the Details handle depends on it, so the cards are redrawn when it changes
  if(pendingChampArt!==null){cfg.champArt=pendingChampArt?null:false;pendingChampArt=null;renderGrid()}
  if(pendingCardHide){cfg.cardHide=pendingCardHide.slice();delete cfg.compactCards;pendingCardHide=null;applyCompact();renderGrid()}
  cfg.effects=applyEffects(document.body.dataset.fx);if(cfg.effects==="full")cfg.effects=null;
  cfg.textSize=applyTextSize(document.documentElement.dataset.ts);if(cfg.textSize==="default")cfg.textSize=null;
  cfg.atmosphere=applyAtmosphere(document.body.dataset.atmosphere||DEFAULT_ATMOSPHERE);
  if(cfg.atmosphere===DEFAULT_ATMOSPHERE)cfg.atmosphere=null; // same idea as accents: no preference vs explicit default
  cfg.exportRemindDays=clampExportDays($("sExportDays")&&$("sExportDays").value);
  if($("sSyncToken"))cfg.syncToken=$("sSyncToken").value.trim();
  saveCfg();syncLockTimer();hideAccPrev();$("settings").classList.add("hidden");toast("Settings saved"+notifyNote)
});
let settingsSaveGen=0;
$("sClose").addEventListener("click",requestCloseSettings);
if($("sSyncGen"))$("sSyncGen").addEventListener("click",()=>{
  const t=genSyncToken();
  $("sSyncToken").value=t;cfg.syncToken=t;saveCfg();updateSyncStatus();toast("Sync key made. Paste the same key on your other devices");
});
if($("sSyncPush"))$("sSyncPush").addEventListener("click",()=>pushVaultSync());
// the status line's links: to the worker under Rank checks, Advanced, or the master password
$("sSyncStatus").addEventListener("click",e=>{
  const b=e.target.closest("[data-sync-go]");if(!b)return;
  const tab=b.dataset.syncGo;settingsTab(tab,true);
  const f=tab==="checks"?(($("sChecksAdv").open=true),$("sBackend")):$("sVaultPass");
  setTimeout(()=>{if(f){f.scrollIntoView&&f.scrollIntoView({block:"center"});f.focus()}},60);
});
if($("sSyncPull"))$("sSyncPull").addEventListener("click",()=>pullVaultSync(false));
if($("sSyncToken"))$("sSyncToken").addEventListener("change",()=>{cfg.syncToken=$("sSyncToken").value.trim();saveCfg();updateSyncStatus()});
$("sAtmosphere").addEventListener("click",e=>{
  const b=e.target.closest("[data-atmosphere]");if(!b)return;
  applyAtmosphere(b.dataset.atmosphere); // preview only — Save keeps it, Close reverts
});
$("sCardParts").addEventListener("change",e=>{
  const h=new Set(cardHidden()),k=e.target.dataset.part;if(!k)return;
  e.target.checked?h.delete(k):h.add(k);previewCardParts([...h]);
});
document.addEventListener("error",e=>{const t=e.target;if(t&&t.classList&&t.classList.contains("c-art"))t.remove()},true);
$("sChampArt").addEventListener("change",e=>{pendingChampArt=e.target.checked;renderGrid()});
$("sCompact").addEventListener("click",()=>previewCardParts([...new Set([...cardHidden(),"chart","stats"])]));
$("sTextSize").addEventListener("click",e=>{const b=e.target.closest("[data-v]");if(b)applyTextSize(b.dataset.v)});
$("sEffects").addEventListener("click",e=>{const b=e.target.closest("[data-v]");if(b)applyEffects(b.dataset.v)}); // preview; Save keeps it
$("sThemes").addEventListener("click",e=>{const b=e.target.closest("[data-theme]");if(b)pickTheme(b.dataset.theme)});
for(const id of ["sAccent","sAccent2"])$(id).addEventListener("input",()=>{pendingRankTheme=false;renderThemes()}); // your own colours: no theme

$("sAccent").addEventListener("input",e=>previewAccent("primary",e.target.value));
$("sAccent2").addEventListener("input",e=>previewAccent("secondary",e.target.value));
$("sAccent").addEventListener("change",e=>commitAccent("primary",e.target.value));
$("sAccent2").addEventListener("change",e=>commitAccent("secondary",e.target.value));
/* Floated next to the browser's colour popup. Sitting under the swatches put it
   exactly where that popup opens, so the answer was covered as soon as you asked.
   The native picker is an OS widget (~280×340) that sits on the swatch — the
   miniature has to clear that block, not nestle against the 52px square.
   Open on click (same gesture that opens the native dialog), not mousedown —
   a press-and-drag cancels the click, so the picker stays shut and the miniature
   must stay shut with it. Close on the next mousedown while armed, with a short
   suppress so Chromium cannot reopen on the trailing click. */
let accPrevAnchor=null;
let accPickerArmed=false;
let accPrevSuppressUntil=0;
const ACC_PICKER_W=280, ACC_PICKER_H=340;
function placeAccPrev(anchor){
  const prev=$("accPrev");
  if(!anchor||!prev.classList.contains("show"))return;
  const r=anchor.getBoundingClientRect();
  const pad=12, gap=16;
  const w=prev.offsetWidth||560, h=prev.offsetHeight||260;
  // Prefer just past the native picker (to its right), never flush to the swatch.
  let left=r.left+ACC_PICKER_W+gap;
  let top=r.top;
  if(left+w>window.innerWidth-pad){
    // Room on the left of the swatch instead
    left=Math.max(pad,r.left-w-gap);
  }
  if(left+w>window.innerWidth-pad)left=Math.max(pad,window.innerWidth-w-pad);
  // If we still sit in the picker's horizontal band, drop below (or above) it.
  const overlapsPickerX=left<r.left+ACC_PICKER_W&&left+w>r.left-4;
  if(overlapsPickerX){
    top=r.bottom+ACC_PICKER_H*0.15+gap;
    if(top+h>window.innerHeight-pad)top=Math.max(pad,r.top-h-gap);
  }
  if(top+h>window.innerHeight-pad)top=Math.max(pad,window.innerHeight-h-pad);
  if(top<pad)top=pad;
  prev.style.left=Math.round(left)+"px";
  prev.style.top=Math.round(top)+"px";
}
function showAccPrev(anchor){
  if(Date.now()<accPrevSuppressUntil)return;
  const prev=$("accPrev");
  clearTimeout(accPrevHide);
  accPickerArmed=true;
  accPrevAnchor=anchor||null;
  prev.classList.add("show");
  // measure after display:flex so width/height are real
  requestAnimationFrame(()=>placeAccPrev(anchor||accPrevAnchor));
}
function hideAccPrev(){
  clearTimeout(accPrevHide);
  accPrevHide=0;
  accPickerArmed=false;
  accPrevAnchor=null;
  const prev=$("accPrev");
  prev.classList.remove("show");
  prev.style.left="";
  prev.style.top="";
}
function closeAccPickerSession(el,e){
  // Kill this press and the click that follows — mousedown preventDefault alone
  // is not enough for <input type=color> in Chromium.
  if(e){e.preventDefault();e.stopPropagation()}
  accPrevSuppressUntil=Date.now()+500;
  hideAccPrev();
  if(!el)return;
  el.blur();
  el.disabled=true;
  setTimeout(()=>{el.disabled=false},0);
}
let accPrevHide=0;
function scheduleHideAccPrev(){
  clearTimeout(accPrevHide);
  // Opening the native colour popup can blur the input in some browsers; a short
  // wait keeps the miniature up through the drag instead of flashing off.
  accPrevHide=setTimeout(()=>{
    const a=document.activeElement;
    if(a!==$("sAccent")&&a!==$("sAccent2"))hideAccPrev();
  },250);
}
for(const id of["sAccent","sAccent2"]){
  const el=$(id);
  el.addEventListener("mousedown",e=>{
    if(Date.now()<accPrevSuppressUntil){
      e.preventDefault();e.stopPropagation();return;
    }
    // Armed OR preview visible: this press is the off half of the toggle.
    // Armed covers the case where change/blur already hid the miniature a
    // tick earlier in the same click that was meant to close the picker.
    if(accPickerArmed||$("accPrev").classList.contains("show")){
      closeAccPickerSession(el,e);
    }
    // else: do not show yet — wait for click, so a press-and-drag that cancels
    // the native open does not leave the miniature up alone
  },true);
  el.addEventListener("click",e=>{
    if(Date.now()<accPrevSuppressUntil){
      e.preventDefault();e.stopPropagation();return;
    }
    // A completed click is what opens the native dialog; open the miniature with it.
    if(!accPickerArmed&&!$("accPrev").classList.contains("show"))showAccPrev(el);
  },true);
  el.addEventListener("input",()=>{if(Date.now()>=accPrevSuppressUntil)showAccPrev(el)});
  // change = the native dialog closed (confirmed). Absorb a same-gesture
  // mousedown on the swatch that Chromium often delivers right after — without
  // the short suppress, the click that was meant to close reopens the picker.
  el.addEventListener("change",()=>{
    if(Date.now()<accPrevSuppressUntil)return;
    hideAccPrev();
    accPrevSuppressUntil=Date.now()+350;
  });
  el.addEventListener("blur",scheduleHideAccPrev);
}
window.addEventListener("resize",()=>{
  if(accPrevAnchor)placeAccPrev(accPrevAnchor);
});
document.addEventListener("keydown",e=>{
  if(e.key==="Escape"&&$("accPrev").classList.contains("show"))hideAccPrev();
});
// Clicks on the page (not the swatch) mean the native picker is gone — Chromium
// often leaves focus on the input after Escape, which used to keep the miniature.
document.addEventListener("pointerdown",e=>{
  if(!$("accPrev").classList.contains("show")&&!accPickerArmed)return;
  const t=e.target;
  if(t===$("sAccent")||t===$("sAccent2"))return;
  if(t&&t.closest&&(t.closest("#sAccentReset1")||t.closest("#sAccentReset2")))return;
  hideAccPrev();
},true);
// Reset is undo, not "pick a colour" — opening the miniature beside the native
// picker made ↺ look like it had opened the colour dialog.
function resetAccent(which){
  cancelAccentPreview();
  hideAccPrev();
  accPrevSuppressUntil=Date.now()+350;
  if(which==="primary"){$("sAccent").value=DEFAULT_ACCENT;applyAccent(DEFAULT_ACCENT)}
  else{$("sAccent2").value=DEFAULT_ACCENT2;applyAccent2(DEFAULT_ACCENT2)}
  pendingRankTheme=false;renderThemes();
}
$("sAccentReset1").addEventListener("click",()=>resetAccent("primary"));
$("sAccentReset2").addEventListener("click",()=>resetAccent("secondary"));
// Settings' Set password and the first-run prompt both come through here, so
// there is one way a vault becomes encrypted, with one set of checks.
$("sVaultSet").addEventListener("click",async()=>{if(await setVaultPassword($("sVaultPass").value))$("sVaultPass").value=""});
$("lpSet").addEventListener("click",async()=>{
  const p=$("lpPass").value;
  if(p!==$("lpPass2").value){toast("The two passwords don't match");$("lpPass2").focus();return}
  if(await setVaultPassword(p)){closeLockPrompt();render()}
});
$("lpLater").addEventListener("click",()=>{
  if($("lpOff").checked){cfg.lockPromptOff=true;saveCfg()}
  closeLockPrompt();
});
async function setVaultPassword(pass){
  if(!pass||pass.length<4){toast("Choose a password with at least 4 characters");return false}
  if(previewMode){previewMode=false;accounts=[]}
  const prev=vaultPassword;
  const changing=!!prev&&prev!==pass;
  if(changing&&cfg.syncToken&&cfg.backendUrl){
    if(!await ask({title:"Change the master password?",
      body:"The synced copy stays locked with the old one until you upload again from this device. Other devices need the new password after that upload.",ok:"Change it"}))return false;
  }
  vaultPassword=pass;
  // If the envelope never reached the disk then the vault there is still the old
  // one, and claiming otherwise is the worst version of this failure: the panel
  // says "encrypted", the auto-lock never engages — relock() looks for an envelope
  // and finds none — and the plaintext everyone believes is now protected sits
  // exactly where it was.
  if(!await saveDB()){
    vaultPassword=prev;
    updateVaultStatus();
    toast("Could not write the encrypted vault. The password has not been set");
    return false;
  }
  $("sVaultPass").value="";
  // the passkey holds the old password, which no longer opens anything
  const hadPk=changing&&!!pkRecord();if(hadPk)pkForget();
  updateVaultStatus();syncLockTimer();
  toast(changing
    ?"Password changed. Upload the vault in Sync so other devices get it"+(hadPk?". Set Face ID / fingerprint up again in Security":"")
    :"Vault password set. Remember it: there's no way to recover it if lost");
  return true;
}
if($("sLockNow"))$("sLockNow").addEventListener("click",async()=>{
  if(!vaultPassword){toast("Set a master password first. There's nothing to lock yet");return}
  if(vaultLocked()){toast("Already locked");return}
  if(!await ask({title:"Lock the vault now?",body:"You'll need the master password to open it again.",ok:"Lock"}))return;
  $("settings").classList.add("hidden");
  relock();   // the lock screen says "Vault locked"; a message saying it again under it did not
});
$("sVaultRemove").addEventListener("click",async()=>{
  if(!vaultPassword){toast("No password is set");return}
  if(previewMode){toast("Exit preview before removing vault protection");return}
  if(!await ask({title:"Remove password protection?",body:"Your vault will be saved unencrypted again.",ok:"Remove protection",danger:true}))return;
  const prev=vaultPassword;
  vaultPassword=null;forgetVaultKey();
  // The same the other way round: a failed write leaves the encrypted vault on the
  // disk, so protection is still on whatever this panel has been told.
  if(!await saveDB()){
    vaultPassword=prev;
    updateVaultStatus();
    toast("Could not write the vault. The password is still in place");
    return;
  }
  pkForget();pkDropPending();
  updateVaultStatus();syncLockTimer();
  toast("Password protection removed");
});
$("bHelp").addEventListener("click",()=>{const willShow=$("help").classList.contains("hidden");closeAllPanels();if(willShow)$("help").classList.remove("hidden")});
// the footer's Terms: Help, at "Using this app", where the terms are written out
$("appVer").addEventListener("click",e=>{e.preventDefault();showWhatsNew()});
$("footTerms").addEventListener("click",e=>{e.preventDefault();closeAllPanels();$("help").classList.remove("hidden");
  const t=$("helpTerms");if(t&&t.scrollIntoView)t.scrollIntoView({block:"start"})});
$("bHelpClose").addEventListener("click",()=>{$("help").classList.add("hidden");cfg.seenHelp=true;saveCfg()});
$("bExport").addEventListener("click",doExport);
$("iosBand").addEventListener("click",e=>{
  const b=e.target.closest("[data-ios]");if(!b)return;
  if(b.dataset.ios==="backup"){doExport();return}
  cfg.iosHintSeen=true;saveCfg();renderIosBand();
});
$("sBackend").addEventListener("change",updateBackendStatus);
$("sStorageProtect").addEventListener("click",async()=>{
  const ok=await protectStorage();
  await updateStorageStatus();
  toast(ok?"Storage protected. The browser will not clear the vault on its own"
    :"The browser said no. Installing the app or using it more often usually changes that. Keep a backup meanwhile.");
});
if($("bExportEnc"))$("bExportEnc").addEventListener("click",()=>{doExportEnc()});
$("bExportCsv").addEventListener("click",doExportCSV);
$("bImport").addEventListener("click",()=>$("fileIn").click());
$("bDeleteAll").addEventListener("click",async()=>{
  if(accounts.length===0)return;
  if(!await ask({title:"Delete all "+accounts.length+" account"+(accounts.length===1?"":"s")+" in this vault?",
    body:"This can't be undone, so export a backup first if you're not sure.",ok:"Delete all",danger:true}))return;
  accounts=[];selected.clear();lastSelectedId=null;render();
  saveThen("Vault cleared");
});
$("bExitPreview").addEventListener("click",()=>{previewMode=false;accounts=[];render()});
$("fileIn").addEventListener("change",e=>{if(e.target.files[0])doImport(e.target.files[0]);e.target.value=""});
$("bImportCsv").addEventListener("click",()=>$("fileInCsv").click());
$("fileInCsv").addEventListener("change",e=>{if(e.target.files[0])doImportCSV(e.target.files[0]);e.target.value=""});
$("bBulkAdd").addEventListener("click",()=>{
  closeAllPanels();
  $("baPreviewNote").hidden=!previewMode;
  $("baList").value="";
  $("baRegion").value=usualRegion(); // it started on NA, the first in the list, for everyone
  // The list carries data-autofocus: the first field is the region select, and
  // the one you came here to fill is the list.
  $("bulkAdd").classList.remove("hidden");
});
$("baCancel").addEventListener("click",()=>$("bulkAdd").classList.add("hidden"));
/* What Bulk add understands. People have their accounts in three shapes: a list
   of Riot IDs, an op.gg multi-search link (which also says the region), and
   whatever the client's lobby chat printed when the accounts joined. Every one
   of them comes down to name, tag and maybe a region. */
function regionFromOpgg(code){code=String(code||"").toLowerCase();return Object.keys(REGIONS).find(k=>REGIONS[k].opgg===code)||null}
function splitId(item){
  const t=String(item||"").trim();if(!t)return null;
  let m=t.match(/^(.+?)\s*#\s*([^\s#]+)$/);
  if(!m)m=t.match(/^(.+)-([A-Za-z0-9]{2,5})$/); // op.gg's URL form: Name-TAG
  if(!m)return null;
  const gameName=m[1].trim(),tagLine=m[2].trim();
  return gameName&&tagLine?{gameName,tagLine}:null;
}
function parseBulk(text,fallbackRegion){
  const out=[],seen=new Set();let bad=0;
  const add=(id,region)=>{
    if(!id){bad++;return}
    const r=region||fallbackRegion, k=(id.gameName+"#"+id.tagLine+"@"+r).toLowerCase();
    if(seen.has(k))return;seen.add(k);out.push({...id,region:r});
  };
  for(const raw of String(text||"").split("\n")){
    const line=raw.trim();if(!line)continue;
    const url=line.match(/https?:\/\/[^\s]*op\.gg\/[^\s]+/i);
    if(url){
      let u;try{u=new URL(url[0])}catch(e){bad++;continue}
      const path=u.pathname.split("/").filter(Boolean).map(x=>decodeURIComponent(x));
      const ms=path.indexOf("multisearch"), sm=path.indexOf("summoners");
      if(ms>=0){
        const region=regionFromOpgg(path[ms+1]);
        const list=(u.searchParams.get("summoners")||"").split(/[,\n]/).map(x=>x.trim()).filter(Boolean);
        if(!list.length)bad++;
        for(const item of list)add(splitId(item),region);
      }else if(sm>=0&&path[sm+2])add(splitId(path[sm+2]),regionFromOpgg(path[sm+1]));
      else bad++;
      continue;
    }
    // the client's chat: "Name #TAG joined the lobby", "... left the room."
    const chat=line.match(/^(.+?)\s*#\s*([A-Za-z0-9]{2,5})\s+(?:joined|left) the (?:lobby|room|chat)\b/i);
    if(chat){add({gameName:chat[1].trim(),tagLine:chat[2]});continue}
    const parts=line.split(",").map(x=>x.trim()).filter(Boolean);
    if(parts.length>1&&parts.every(x=>x.includes("#"))){for(const x of parts)add(splitId(x));continue}
    const m=line.match(/^(.+)#(\S+)$/);
    add(m&&m[1].trim()&&m[2].trim()?{gameName:m[1].trim(),tagLine:m[2].trim()}:null);
  }
  return{entries:out,bad};
}
$("baSave").addEventListener("click",()=>{
  const parsed=parseBulk($("baList").value,$("baRegion").value);
  if(!parsed.entries.length&&!parsed.bad){toast("Paste at least one Name#TAG, an op.gg link or the lobby chat");return}
  if(previewMode&&parsed.entries.length){previewMode=false;accounts=[]}
  let added=0,skipped=0,bad=parsed.bad;const newIds=[];
  for(const{gameName,tagLine,region}of parsed.entries){
    const dup=accounts.find(a=>a.gameName.toLowerCase()===gameName.toLowerCase()&&a.tagLine.toLowerCase()===tagLine.toLowerCase()&&a.region===region);
    if(dup){skipped++;continue}
    const id=uid();newIds.push(id);
    accounts.push({id,fav:false,stats:null,label:"",region,gameName,tagLine,status:"active",login:"",password:"",email:"",tags:[],notes:"",history:[]});
    added++;
  }
  render();$("bulkAdd").classList.add("hidden");
  if(newIds.length)revealAccount(newIds[0]);
  const msg=added+" added"+(skipped?", "+skipped+" duplicate"+(skipped===1?"":"s")+" skipped":"")+(bad?", "+bad+" line"+(bad===1?"":"s")+" couldn't be parsed":"");
  // The new ones are read straight away, through the same paced run as Check all
  // ranks: its progress bar, its Stop, its summary at the end.
  saveThen(msg).then(()=>{if(newIds.length&&!previewMode&&!run)checkAll(newIds)});
});
// Wrapped, not passed directly: addEventListener hands the listener a MouseEvent,
// which checkAll would take as its `ids` list and immediately call .map() on — so
// the button threw on every click and refreshed nothing at all.
$("bCheckAll").addEventListener("click",()=>checkAll());
// Narrowing the grid without redrawing the chip that says why is the exact
// problem the chips exist to solve: searching or hitting Favorites went through
// renderGrid alone, so the grid went short with nothing on screen explaining it
// and nothing to click to undo it.
function renderFilters(){renderChips();renderGrid();renderDash()}
let searchT;
// the grid and the chips only: the stats panel above does not follow the search (see renderDash)
$("tSearch").addEventListener("input",e=>{ui.search=e.target.value;clearTimeout(searchT);searchT=setTimeout(()=>{renderChips();renderGrid()},120)});
$("tRegion").addEventListener("change",e=>{ui.region=e.target.value;renderFilters()});
/* "While away" was always in the list, and picked from it sorted by nothing: it
   only means something after "While you were away" has measured the visit. It
   is offered while that sort is on, and goes again once another is picked. */
function awaySortOption(on){
  const sel=$("tSort");let o=sel.querySelector('option[value="away"]');
  if(on&&!o){o=new Option("Sort: While you were away","away");sel.add(o)}
  if(!on&&o)o.remove();
}
$("tSort").addEventListener("change",e=>{
  ui.sort=e.target.value;
  if(ui.sort!=="away"){awayDelta=new Map();awaySortOption(false)}
  renderGrid();
});
$("tStatus").addEventListener("change",e=>{ui.status=e.target.value;renderFilters()});
// One place that puts the two toolbar toggles in step with the state they stand
// for, rather than three copies of the same pair of style assignments.
function syncToggles(){
  for(const[id,on]of[["tFav",ui.favOnly],["tArchived",ui.showArchived]]){
    const b=$(id);
    b.classList.toggle("on",!!on);
    b.setAttribute("aria-pressed",on?"true":"false");
  }
  syncFilterCount();
}
// how many of the folded filters are on, on the phone's Filters button
function syncFilterCount(){
  const n=[ui.region,ui.status,ui.favOnly,ui.showArchived,ui.tag].filter(Boolean).length, b=$("tFilters");
  if(!b)return;
  const badge=b.querySelector(".t-n");
  badge.hidden=!n;badge.textContent=n?String(n):"";
  b.setAttribute("aria-label",n?"Filters, "+n+" on":"Filters");
}
$("skipLink").addEventListener("click",e=>{
  e.preventDefault();
  const g=$("grid");g.focus({preventScroll:true});
  if(g.scrollIntoView)g.scrollIntoView({block:"start",behavior:prefersReducedMotion()?"auto":"smooth"});
});
$("tFilters").addEventListener("click",()=>{
  const t=document.querySelector(".tools"), open=!t.classList.contains("open");
  t.classList.toggle("open",open);$("tFilters").setAttribute("aria-expanded",String(open));
});
$("tFav").addEventListener("click",()=>{ui.favOnly=!ui.favOnly;syncToggles();renderFilters()});
$("tArchived").addEventListener("click",()=>{ui.showArchived=!ui.showArchived;syncToggles();render()});
$("bDashToggle").addEventListener("click",()=>{
  cfg.dashCollapsed=!dashCollapsed();
  // one-shot: renderDash also runs on every account change, and the panel must
  // not re-animate then — only when the user actually opened it
  dashJustOpened=!cfg.dashCollapsed;
  if(cfg.dashCollapsed)hideSparkTip();
  saveCfg();
  /* It opened with a fold-down and snapped shut. Closing plays the same move the
     other way, a little quicker, then the panel goes; with motion reduced or
     effects off it goes at once, as before. */
  const box=$("dash").querySelector(":scope>.hx");
  if(cfg.dashCollapsed&&box&&!prefersReducedMotion()&&document.body.dataset.fx!=="off"){
    syncDashToggle();
    box.classList.remove("dash-in");box.classList.add("dash-out");
    let t=0;
    const done=()=>{clearTimeout(t);box.removeEventListener("animationend",done);if(dashCollapsed())renderDash()};
    box.addEventListener("animationend",done);
    t=setTimeout(done,320);   // in case no animation runs to say it ended
    return;
  }
  renderDash();
});
// The ribbon filters by tier exactly the way the dashboard's gem row does, so it
// hands the click to the same place rather than growing its own idea of filtering.
/* Shown past two screens of scrolling. An IntersectionObserver on a sentinel
   rather than a scroll listener, because this app is meant to sit open for days
   and a listener that fires on every scroll frame is exactly the kind of idle
   cost the rest of this file works to avoid — the observer fires twice, on the
   two crossings, and nothing in between. */
{
  const btn=$("toTop"), head=document.querySelector(".top");
  /* Watching the header, not a marker planted at some depth down the page. A
     marker at 200vh is unreachable on a page only two screens tall — the button
     could never appear — and "not intersecting" is the same answer whether it is
     still below the fold or already scrolled past, which had the button showing at
     the very top. The header has neither problem: it starts on screen, there is
     only one way for it to leave, and leaving is exactly the moment "back to top"
     starts to mean something.
     No observer, no button. This page already needs :has(), color-mix() and
     backdrop-filter, all newer than IntersectionObserver, so anything that got
     this far has it. */
  if("IntersectionObserver"in window&&head){
    new IntersectionObserver(([e])=>{
      btn.classList.toggle("hidden",e.isIntersecting);
    },{threshold:0}).observe(head);
  }
  /* How far the console may scroll before it sticks: the height of its command
     row, so only the search row stays pinned (see .console in app.css). Measured,
     because the row wraps at some widths. Without ResizeObserver it stays 0 and the
     whole console pins, as it always did. */
  const con=document.querySelector(".console"), cmd=con&&con.querySelector(".cmd");
  if(cmd&&"ResizeObserver"in window)
    new ResizeObserver(()=>con.style.setProperty("--cmd-pin",cmd.offsetHeight+con.clientTop+"px")).observe(cmd);
  /* Phones only: away while scrolling down, back on the way up (see .to-top.away).
     Passive, and it only compares two numbers, so it costs nothing per frame. */
  const narrow=window.matchMedia&&window.matchMedia(PHONE_MQ);
  let lastY=window.scrollY||0;
  window.addEventListener("scroll",()=>{
    const y=window.scrollY||0, d=y-lastY;
    if(Math.abs(d)<6)return;
    btn.classList.toggle("away",!!(narrow&&narrow.matches)&&d>0);
    lastY=y;
  },{passive:true});
  btn.addEventListener("click",()=>{
    window.scrollTo({top:0,behavior:prefersReducedMotion()?"auto":"smooth"});
    const first=document.querySelector("#tSearch");
    if(first)first.focus({preventScroll:true});   // so the keyboard lands somewhere useful too
  });
}
/* ---------- while you were away ----------
   The app is meant to sit in a background tab for days and check by itself, and it
   had no idea of "since you last looked": you came back to the same grid and had
   to spot what had moved on your own.
   Movement is measured against the last reading taken before you left, not against
   the previous check — over a week away an account may have been checked five
   times, and what you want is where it started and where it is now. */
function awaySummary(since){
  if(!since)return null;
  const out={up:[],down:[]};
  for(const a of accounts){
    if(a.archived)continue;
    // Keep Unranked markers in the list so "after" can be recognised as not a
    // climb — but only score pairs that both have a ladder position.
    const hist=(a.history||[]).filter(h=>+h.t);
    if(hist.length<2)continue;
    const after=hist[hist.length-1];
    if(+after.t<=since)continue;                       // nothing new while away
    if(ladderLP(after)===null)continue;                // currently unranked / no LP
    const before=hist.filter(h=>+h.t<=since&&ladderLP(h)!==null).pop();
    if(!before)continue;                               // no reading from before you left
    // A season can reset while you are away. The LP drop across it is real on the
    // ladder and meaningless as a "while you were away" move — same rule as lastDelta.
    if(seasonBreak(before,after))continue;
    const d=ladderLP(after)-ladderLP(before);
    if(!d)continue;
    (d>0?out.up:out.down).push({a,d});
  }
  out.up.sort((x,y)=>y.d-x.d);
  out.down.sort((x,y)=>x.d-y.d);
  return out.up.length||out.down.length?out:null;
}
function renderAwayBand(){
  const el=$("awayBand");
  // An hour, so that closing a tab and reopening it does not announce itself.
  const since=cfg.lastSeenAt&&Date.now()-cfg.lastSeenAt>3600000?cfg.lastSeenAt:0;
  const sum=since?awaySummary(since):null;
  if(!sum){el.classList.add("hidden");el.innerHTML="";return}
  const best=sum.up[0], worst=sum.down[0];
  const bits=[];
  if(sum.up.length)bits.push(`<span class="up">${sum.up.length} climbed</span>`);
  if(sum.down.length)bits.push(`<span class="down">${sum.down.length} fell</span>`);
  const star=best&&(!worst||best.d>=-worst.d)?best:worst;
  setHTML(el,`<span class="away-k">While you were away</span>`
    +`<span>${bits.join(" · ")}${star?` · biggest mover <b>${nameOf(star.a)}</b> `
      +`<span class="${star.d>0?"up":"down"}">${star.d>0?"+":star.d<0?"-":""}${fmtN(Math.abs(star.d))} LP</span>`:""}</span>`
    +`<span class="sp"><button id="awayShow">Sort by movement</button><button id="awayHide">Dismiss</button></span>`);
  el.classList.remove("hidden");
}
$("awayBand").addEventListener("click",e=>{
  if(e.target.closest("#awayShow")){
    // Build the sort from the same window the band just reported — ui.sort=change
    // (lastDelta) is a different question and sorted the wrong accounts after a
    // week of auto-checks.
    const since=cfg.lastSeenAt||0;
    const sum=awaySummary(since);
    awayDelta=new Map();
    if(sum){
      for(const x of sum.up)awayDelta.set(x.a.id,x.d);
      for(const x of sum.down)awayDelta.set(x.a.id,x.d);
    }
    ui.sort="away";
    awaySortOption(true);
    $("tSort").value="away";
    render();
  }
  // Dismissed for good, not until the next render: the visit it was reporting on
  // is over the moment it has been read.
  cfg.lastSeenAt=Date.now();saveCfg();
  $("awayBand").classList.add("hidden");
});
// Stamped when the tab goes away rather than on a timer, so "last seen" means the
// last moment this page was actually in front of somebody. Coming back must
// rebuild the away band — startApp only runs on a full load, so a backgrounded
// tab never showed it. Do not stamp while an unread band is still up: a short
// tab-switch would otherwise erase the visit it was reporting.
document.addEventListener("visibilitychange",()=>{
  if(document.hidden){
    if(!vaultLocked()&&$("awayBand").classList.contains("hidden")){cfg.lastSeenAt=Date.now();saveCfg()}
  }else if(!vaultLocked()){
    renderAwayBand();
  }
});
window.addEventListener("pagehide",()=>{
  if(!vaultLocked()&&$("awayBand").classList.contains("hidden")){cfg.lastSeenAt=Date.now();saveCfg()}
});
function vaultLocked(){return !$("lock").classList.contains("hidden")}

/* ---------- quick find ----------
   Sixty accounts is more than anyone scrolls through to reach one, and the things
   you then want — the password, op.gg, a refresh — are each two more clicks away
   behind a menu. Typing is the shortest path to all of it.
   Accounts are matched on everything that identifies them; commands are matched on
   their own words. Both lists are capped, because a palette that returns sixty
   results has not answered anything. */
let palSel=0, palItems=[];
function palCommands(){
  return [
    {k:"add",n:"Add account",s:"New entry in the vault",i:"plus",run:()=>openForm(null)},
    {k:"check",n:"Check all ranks",s:"Refresh everything currently shown",i:"refresh",run:()=>checkAll()},
    {k:"stale",n:"Refresh stale accounts",s:"Found accounts last read over 3 days ago",i:"refresh",run:checkStale},
    {k:"cards list wall layout",n:"Switch layout",s:"Cards, list, wall",i:"chart",run:()=>{
      const order=["cards","list","wall"];
      ui.density=order[(order.indexOf(ui.density)+1)%order.length];
      cfg.density=ui.density;saveCfg();openInfo.clear();render();fadeInGrid();
    }},
    {k:"settings",n:"Settings",s:"Rank checks, alerts, security, appearance",i:"gear",run:()=>openSettings()},
    {k:"password check security reused weak leak pwned",n:"Password check-up",s:"Passwords used twice, weak, or in a data leak",i:"alert",run:()=>openSettings("security")},
    {k:"newseason",n:"New season",s:"Move every ranked account's rank into Past seasons",i:"refresh",run:()=>newSeasonAll()},
    {k:"streamer",n:"Streamer mode",s:"Hide Riot IDs, logins, emails and notes on screen (H)",i:"eye",run:()=>setStreamer(!streamerOn())},
    {k:"export backup",n:"Export backup",s:"Download the vault as JSON",i:"clipboard",run:()=>doExport()},
    {k:"help",n:"Help",s:"How this works",i:"note",run:()=>$("bHelp").click()},
  ];
}
function palResults(q){
  const s=q.trim().toLowerCase(), words=s.split(/\s+/).filter(Boolean);
  // each word anywhere, like the search box, and the Riot ID whole: "Lunar Echo#EUW"
  // and "lunar echo #euw" both find it
  const accs=accounts.filter(a=>!a.archived).filter(a=>{
    if(!s)return true;
    const hay=[a.label,a.gameName,a.tagLine,a.gameName+"#"+a.tagLine,a.email,a.login,(a.tags||[]).join(" "),
      a.stats?shortRank(a.stats)||"":""].join(" ").toLowerCase();
    return words.every(w=>hay.includes(w));
  });
  // Favourites first, then the best ranks — the same order the grid uses, so the
  // palette never disagrees with the page behind it.
  accs.sort((x,y)=>(y.fav?1:0)-(x.fav?1:0)||rankValue(y.stats)-rankValue(x.stats));
  const cmds=palCommands().filter(c=>!s||(c.k+" "+c.n).toLowerCase().includes(s));
  /* The top match's login, one Enter away. Landing on the card was half the trip:
     the password was then Login, Copy — the clicks this window exists to save. */
  const top=s&&accs[0], keys=[];
  if(top&&top.login)keys.push({type:"key",c:{n:"Copy username",s:plainName(top),i:"user",run:()=>copyText(top.login,"Username")}});
  if(top&&top.password)keys.push({type:"key",c:{n:"Copy password",s:plainName(top)+" · clears from the clipboard in 30s",i:"key",run:()=>copyText(top.password,"Password",true)}});
  return accs.slice(0,8).map(a=>({type:"acc",a})).concat(keys,cmds.slice(0,6).map(c=>({type:"cmd",c})));
}
function renderPalette(){
  palItems=palResults($("palInput").value);
  if(palSel>=palItems.length)palSel=Math.max(0,palItems.length-1);
  if(!palItems.length){
    setHTML($("palList"),`<div class="pal-empty">Nothing matches that.</div>`);
    return;
  }
  let html="",lastType=null;
  palItems.forEach((it,i)=>{
    if(it.type!==lastType){
      html+=`<div class="pal-g">${it.type==="acc"?"Accounts":it.type==="key"?"Log in":"Commands"}</div>`;
      lastType=it.type;
    }
    const sel=i===palSel?" sel":"";
    if(it.type==="acc"){
      const a=it.a, s=a.stats, col=tierColor(s&&s.tier);
      const url=iconUrl(s);
      const initial=(a.label||a.gameName||"?").trim().charAt(0).toUpperCase()||"?";
      html+=`<button class="pal-i${sel}" data-i="${i}" role="option" aria-selected="${i===palSel}">`
        +`<span class="pal-pic"><b aria-hidden="true">${esc(initial)}</b>${url?`<img src="${esc(url)}" alt="" loading="lazy" data-ico>`:""}`
        +`${isRanked(a)?crest(s.tier):""}</span>`
        +`<span class="pal-t"><span class="pal-n">${nameOf(a)}</span>`
        +`<span class="pal-s">${sens(esc(a.gameName)+"#"+esc(a.tagLine))} · ${esc(a.region)}</span></span>`
        +`<span class="pal-r${isRanked(a)?"":" q"}" style="color:${col}">${esc(isRanked(a)?shortRank(s)||"":isChecked(a)?(notPlaced(a)?"Not placed yet":"Unranked"):"Never checked")}</span>`
        +`</button>`;
    }else{
      const c=it.c;
      html+=`<button class="pal-i${sel}" data-i="${i}" role="option" aria-selected="${i===palSel}">`
        +`<span class="pal-ico">${icon(c.i)}</span>`
        +`<span class="pal-t"><span class="pal-n">${esc(c.n)}</span><span class="pal-s">${esc(c.s)}</span></span>`
        +`</button>`;
    }
  });
  setHTML($("palList"),html);
  const sel=$("palList").querySelector(".sel");
  if(sel&&sel.scrollIntoView)sel.scrollIntoView({block:"nearest"});
}
function openPalette(){
  if(!accounts.length&&!previewMode){toast("Nothing in the vault yet");return}
  closeAllPanels();
  palSel=0;
  $("palInput").value="";
  renderPalette();
  $("palette").classList.remove("hidden");
}
function closePalette(){$("palette").classList.add("hidden")}
function runPalette(i){
  const it=palItems[i];if(!it)return;
  closePalette();
  if(it.type==="cmd"||it.type==="key"){it.c.run();return}
  // An account is a place, not an action: go there, in the layout that can
  // actually show it, and light it up so it is obvious which one you landed on.
  if(ui.density==="wall"){ui.density="cards";cfg.density="cards";saveCfg()}
  revealAccount(it.a.id,true);
}
/* Go to an account and light it up. Quick find did this; a new account did not:
   the page stayed at the top and the card was sorted in somewhere below, so it
   looked as if nothing had been added. `clear` drops every filter on the way
   (Quick find); otherwise filters go only if they hide the account. */
function clearFilters(a){
  ui.search="";ui.tier="";ui.flag="";ui.tag=null;ui.favOnly=false;ui.region="";ui.status="";
  // the Archived view is a view of its own: leave it for a live account, enter it for an archived one
  ui.showArchived=!!(a&&a.archived);
  $("tSearch").value="";syncToggles();
}
function revealAccount(id,clear){
  const a=accounts.find(x=>x.id===id);if(!a)return;
  if(clear||!filtered().some(x=>x.id===id))clearFilters(a);
  flashId=id;render();
  /* Lit up but never reached: this ran while the form that added the account was
     still closing, with the page locked against scrolling, and the focus handed
     back to "+ Add account" just after pulled the page back up to it. The scroll
     waits until that window is gone. */
  setTimeout(()=>{
    const el=$("grid").querySelector(`[data-id="${idSel(id)}"]`);
    if(el&&el.scrollIntoView)el.scrollIntoView({block:"center",behavior:prefersReducedMotion()?"auto":"smooth"});
  },0);
  setTimeout(()=>{if(flashId===id){flashId=null;renderCard(id)}},1600);
}
$("palInput").addEventListener("input",()=>{palSel=0;renderPalette()});
$("palInput").addEventListener("keydown",e=>{
  if(e.key==="ArrowDown"||e.key==="ArrowUp"){
    e.preventDefault();
    if(!palItems.length)return;
    palSel=(palSel+(e.key==="ArrowDown"?1:-1)+palItems.length)%palItems.length;
    renderPalette();
  }else if(e.key==="Enter"){e.preventDefault();runPalette(palSel)}
});
$("palList").addEventListener("click",e=>{
  const b=e.target.closest("[data-i]");if(!b)return;
  runPalette(+b.dataset.i);
});
$("count").addEventListener("click",e=>{
  const b=e.target.closest("[data-flag]");if(!b)return;
  setChoreFlag(b.dataset.flag);
});
$("ribbon").addEventListener("click",e=>{
  const flag=e.target.closest("[data-flag]");
  if(flag){setChoreFlag(flag.dataset.flag);return}
  const st=e.target.closest("[data-status]");
  if(st){setStatusFilter(st.dataset.status);return}
  const seg=e.target.closest("[data-tier]");if(!seg)return;
  setTierFilter(seg.dataset.tier);
});
$("dash").addEventListener("click",e=>{
  const flag=e.target.closest("[data-flag]");
  if(flag){setChoreFlag(flag.dataset.flag);return}
  const next=e.target.closest("[data-next]");
  if(next){zoomToAccount(next.dataset.next);return}
  const tier=e.target.closest("[data-tier]");
  if(tier)setTierFilter(tier.dataset.tier);
});
$("setup").addEventListener("click",e=>{
  const b=e.target.closest("[data-setup]");if(!b)return;
  const a=b.dataset.setup;
  if(a==="add")openForm();
  else if(a==="check")$("bCheckAll").click();
  else if(a==="lock"){openSettings("security");setTimeout(()=>{const f=$("sVaultPass");if(f){f.scrollIntoView&&f.scrollIntoView({block:"center"});f.focus()}},60)}
  else if(a==="backup")vaultPassword?doExportEnc():doExport();
  else if(a==="hide"){cfg.setupHidden=true;saveCfg();renderSetup()}
});
$("chips").addEventListener("click",e=>{
  const b=e.target.closest("[data-clear]");if(!b)return;
  const k=b.dataset.clear;
  if(k==="all")Object.assign(ui,{flag:"",tier:"",tag:null,favOnly:false,search:""});
  else if(k==="tag")ui.tag=null;
  else if(k==="favOnly")ui.favOnly=false;
  else ui[k]="";
  if(!ui.search)$("tSearch").value="";
  syncToggles();
  render();
});
$("density").addEventListener("click",e=>{
  const b=e.target.closest("[data-density]");if(!b)return;
  const changed=ui.density!==b.dataset.density;
  ui.density=b.dataset.density;cfg.density=ui.density;saveCfg();
  openInfo.clear(); // "expanded" means different things across the three layouts
  render();
  if(changed)fadeInGrid();
});
/* A new layout replaces the whole page at once, and a hard cut there read as a
   flicker. 150ms of fade, for this only: filtering and sorting stay instant,
   since there speed is the point. (Reduced motion and Effects: Off skip it.) */
function fadeInGrid(){
  const g=$("grid");
  g.classList.remove("view-in");void g.offsetWidth;g.classList.add("view-in");
  const off=()=>{g.classList.remove("view-in");g.removeEventListener("animationend",off)};
  g.addEventListener("animationend",off);
}
/* There was a Refresh N stale button beside Check all ranks, and "N need a refresh"
   beside both: three controls for one job. The header's count shows those accounts,
   and Check all ranks then says "Check N shown". Quick find keeps the one-step
   version for the keyboard. */
function checkStale(){checkAll(accounts.filter(a=>!a.archived&&isLive(a)&&isStale(a)).map(a=>a.id))}
$("bCancelCheck").addEventListener("click",()=>{if(run){run.stop=true;toast("Stopping after this account…")}});
$("failbar").addEventListener("click",e=>{
  if(e.target.closest("#bDismissFails")){lastFails=null;renderFailbar();return}
  if(e.target.closest("#bShowFails")){setChoreFlag("failed");return}
  if(e.target.closest("#bRetryFails")&&lastFails)checkAll(lastFails.map(f=>f.id));
});
$("dash").addEventListener("change",e=>{
  if(e.target&&e.target.id==="dashMin"){cfg.statsMinTier=e.target.value;saveCfg();renderDash()}
});
$("tagbar").addEventListener("click",e=>{
  if(e.target.closest("[data-tagtoggle]")){
    cfg.tagsOpen=!cfg.tagsOpen;saveCfg();renderTagbar();return;
  }
  const t=e.target.closest("[data-tag]");if(!t)return;
  ui.tag=ui.tag===t.dataset.tag?null:t.dataset.tag;
  render();
});
$("tSelectAll").addEventListener("change",e=>{
  const list=filtered();
  if(e.target.checked)list.forEach(a=>selected.add(a.id));else list.forEach(a=>selected.delete(a.id));
  renderGrid(); // which ends by syncing the bulk bar against the same list
});
$("bulkStatus").addEventListener("change",e=>{
  const v=e.target.value;if(!v)return;
  const n=selected.size;
  accounts.forEach(a=>{if(selected.has(a.id))a.status=v});
  render();
  saveThen("Status set to "+(STATUS[v]||STATUS.active).label+" for "+n+" account"+(n===1?"":"s"));
  e.target.value="";
});
$("bulkTagBtn").addEventListener("click",()=>{
  const t=$("bulkTag").value.trim();if(!t)return;
  const n=selected.size;
  accounts.forEach(a=>{if(selected.has(a.id)){a.tags=a.tags||[];if(!a.tags.includes(t))a.tags.push(t)}});
  render();$("bulkTag").value="";
  saveThen('Tag "'+t+'" added to '+n+" account"+(n===1?"":"s"));
});
$("bulkTag").addEventListener("keydown",e=>{if(e.key==="Enter")$("bulkTagBtn").click()});
$("bulkDelete").addEventListener("click",async()=>{
  const n=selected.size;
  if(!await ask({title:"Delete "+n+" selected account"+(n===1?"":"s")+"?",body:"There's an Undo for a few seconds afterwards.",ok:"Delete",danger:true}))return;
  // kept with their places, so Undo puts each back where it was
  const gone=accounts.map((a,i)=>[i,a]).filter(([,a])=>selected.has(a.id));
  accounts=accounts.filter(a=>!selected.has(a.id));
  selected.clear();lastSelectedId=null;render();
  saveThen(n+" account"+(n===1?"":"s")+" deleted","Undo",()=>{
    if(vaultLocked())return;   // as with one: no passwords back into a locked page
    for(const[i,a]of gone)accounts.splice(Math.min(i,accounts.length),0,a);
    render();saveThen(n+" account"+(n===1?"":"s")+" restored");
  });
});
$("bulkClear").addEventListener("click",()=>{selected.clear();lastSelectedId=null;ui.selecting=false;cmpPick=false;render()});
$("bulkCompare").addEventListener("click",compareSelected);
$("tSelectMode").addEventListener("click",()=>{
  if(ui.selecting||selected.size){ui.selecting=false;selected.clear();lastSelectedId=null;cmpPick=false}
  else ui.selecting=true;
  render();
});

// the note editor lives inside the grid, which re-renders from scratch — so its
// two listeners are delegated like everything else on a card
// The note saves itself as you type — there was never anything for a Save button
// to decide. A short debounce so a sentence is one write to storage, not thirty.
let noteSaveT=0;
/* Keeps the division dropdowns in step while the tier above them is being edited.
   Bound to the rank window as well as the grid — the panel lives in the window
   now, and the list still renders its own selects inside an expanded row. */
function syncDivisionSelects(e){
  const f=e.target&&e.target.dataset&&e.target.dataset.f;
  if(f!=="tier"&&f!=="ptier"&&f!=="gtier")return;
  const panel=e.target.closest(".rankpanel,.login");if(!panel)return;
  for(const[t,d]of[["tier","div"],["ptier","pdiv"],["gtier","gdiv"]]){
    const ts=panel.querySelector('[data-f="'+t+'"]'), ds=panel.querySelector('[data-f="'+d+'"]');
    if(!ts||!ds)continue;
    setDivisionOptions(ds,ts.value);
  }
}
$("grid").addEventListener("change",syncDivisionSelects);
$("rankModal").addEventListener("change",syncDivisionSelects);
// The window carries the account's data-id, so every branch of the card handler
// resolves from in there exactly as it does from inside a card.
$("rankModal").addEventListener("click",onCardClick);
$("rankCancel").addEventListener("click",closeRankModal);
$("grid").addEventListener("input",e=>{
  if(!e.target||!e.target.dataset||e.target.dataset.f!=="notetext")return;
  noteDraft=e.target.value;
  clearTimeout(noteSaveT);
  noteSaveT=setTimeout(()=>writeNote(),400);
});
// Writes the draft through to the account. Split out because three different
// things end an edit — typing, clicking away, Escape — and all of them save.
function writeNote(){
  if(!editingNote)return false;
  const acc=accounts.find(a=>a.id===editingNote);
  if(!acc)return false;
  const v=noteDraft.trim();
  const before=acc.notes||"";
  if(v===before)return false;
  if(v)acc.notes=v;else delete acc.notes;
  saveDB();
  return true;
}
// Leaving the field is the whole gesture: it saves and collapses back to the
// normal display, with no button to hunt for.
function commitNote(){
  if(!editingNote)return;
  clearTimeout(noteSaveT);
  writeNote();
  const id=editingNote, acc=accounts.find(a=>a.id===id);
  editingNote=null;noteDraft="";
  // ".card" only exists in the card layout. In the list the note lives inside an
  // expanded .rw, so this found nothing and the textarea simply stayed open —
  // the edit had been saved, but the card went on looking like it hadn't.
  const card=[...$("grid").querySelectorAll(".card,.rw")].find(c=>c.dataset.id===id);
  if(card&&acc)syncNoteBlock(card,acc);
}
$("grid").addEventListener("focusout",e=>{
  if(!e.target||!e.target.dataset||e.target.dataset.f!=="notetext")return;
  // a click inside the same block (or a re-render) must not count as leaving
  setTimeout(()=>{
    const ta=$("grid").querySelector('[data-f="notetext"]');
    if(!ta||document.activeElement!==ta)commitNote();
  },0);
});
document.addEventListener("pointerdown",e=>{
  if(editingNote&&!e.target.closest(".c-notes"))commitNote();
},true);
$("grid").addEventListener("keydown",e=>{
  // A list row carries role="button" and tabindex="0" but is a <div>, so the
  // browser gives it none of a button's key handling — it could be tabbed to and
  // then not opened. Same for wall tiles. Only when the row/tile itself has focus:
  // the checkbox inside a row has its own meaning for Space.
  const row=e.target&&e.target.classList&&e.target.classList.contains("rw-main")?e.target:null;
  const tile=e.target&&e.target.classList&&e.target.classList.contains("tile")?e.target:null;
  if((row||tile)&&(e.key==="Enter"||e.key===" ")){e.preventDefault();(row||tile).click();return}
  // ArrowDown on a ⋯ goes into its menu — opening it first, if a click has not.
  if(e.key==="ArrowDown"&&e.target&&e.target.dataset&&e.target.dataset.act==="more"){
    const card=e.target.closest("[data-id]");if(!card)return;
    e.preventDefault();
    if(openMore.has(card.dataset.id))focusCardMenuItem(0);
    else openCardMenu(card.dataset.id,e.target,true);
    return;
  }
  const ta=e.target;
  if(!ta||!ta.dataset||ta.dataset.f!=="notetext")return;
  if(e.key==="Escape"){
    e.stopPropagation(); // otherwise the global Esc closes every panel on the page too
    ta.blur();           // which commits, like clicking away does
  }
});
/* Named and shared, because the ⋯ menu is no longer inside the grid: it is one
   floating element on the body carrying the account's data-id, and it binds this
   exact listener. Every branch below resolves the same either way. */
// Every filter that can empty the grid, in one gesture. Not the same as the
// chips' "Clear all", which only drops the ones that have a chip — region and
// status live in dropdowns and have none, and either of them alone can hide
// every account.
/* Bring one account into view and flash it, in whatever layout is showing. A
   filter that hides it is cleared first — there would be nothing to scroll to. */
function zoomToAccount(id){
  const acc=accounts.find(a=>a.id===id);if(!acc)return;
  if(!!acc.archived!==ui.showArchived){ui.showArchived=!!acc.archived;syncToggles()}
  if(!filtered().some(a=>a.id===id)){
    Object.assign(ui,{search:"",region:"",tag:null,favOnly:false,status:"",flag:"",tier:""});
    $("tSearch").value="";syncToggles();
  }
  flashId=id;render();
  const el=$("grid").querySelector(`[data-id="${idSel(id)}"]`);
  // Guarded like the other two places that scroll something into view. Not
  // being guarded here meant an environment without it threw in the middle of
  // this handler, which took the timer below down with it — so the card stayed
  // lit for the rest of the session instead of flashing once.
  if(el&&el.scrollIntoView)el.scrollIntoView({block:"center",behavior:prefersReducedMotion()?"auto":"smooth"});
  setTimeout(()=>{if(flashId===id){flashId=null;renderCard(id)}},1500);
}
function clearFilters(){
  Object.assign(ui,{search:"",region:"",tag:null,favOnly:false,status:"",flag:"",tier:""});
  $("tSearch").value="";
  syncToggles();
  // the full render, not renderFilters(): the region and status dropdowns are
  // resynced by renderFilterOptions(), which the light path does not call, and
  // they would otherwise go on showing a filter that is no longer set.
  render();
}
async function onCardClick(e){
  // closest(), not target.id: a click on the button's icon lands on the svg
  if(e.target.closest("#bDemo")){loadDemo();return}
  if(e.target.closest("#bEmptyAdd")){$("bAdd").click();return}
  if(e.target.closest("#bClearFilters")){clearFilters();return}
  const btn=e.target.closest("[data-act]");if(!btn)return;
  const card=e.target.closest("[data-id]");if(!card)return;
  const id=card.dataset.id, acc=accounts.find(a=>a.id===id);if(!acc)return;
  const act=btn.dataset.act;
  /* Picking anything in a menu closes the menu. That is the whole difference
     between a menu and the toolbar this used to be — a missclick now costs one
     click to undo instead of two, because the thing you mis-picked from has
     already put itself away.
     Delete is the exception: it arms rather than acting, and "Sure? Click again"
     has to stay on screen to be clickable. */
  if(act!=="more"&&act!=="del"&&e.target.closest("#cardMenu"))closeCardMenu();
  if(act==="select"){
    const list=filtered();
    const idx=list.findIndex(x=>x.id===id);
    // Anchor by id, not by the index it had when last clicked — a sort or search
    // that keeps the selection still reshuffles the list, and shift-clicking
    // against a stale index selected the wrong range (or list[k] was undefined).
    if(e.shiftKey&&lastSelectedId!=null){
      const anchor=list.findIndex(x=>x.id===lastSelectedId);
      if(anchor>=0&&idx>=0){
        const[from,to]=[anchor,idx].sort((x,y)=>x-y);
        for(let k=from;k<=to;k++)selected.add(list[k].id);
      }else{
        btn.checked?selected.add(id):selected.delete(id);
      }
      lastSelectedId=id;
      renderGrid(); // ticks the boxes it just filled in and syncs the bar with them
    }else{
      btn.checked?selected.add(id):selected.delete(id);
      lastSelectedId=id;
      // the list is right here: renderBulkBar() with nothing to go on filters and
      // sorts the whole vault again, once per tick of a checkbox
      renderBulkBar(list);
    }
    // the second account of a pick started with "Compare…" opens the comparison
    if(cmpPick&&selected.size===2)compareSelected();
  }
  // A tile is for finding an account, not for acting on one. Clicking it hands
  // you back to the card view at that account and lights it up so it is obvious
  // which of the sixty you landed on.
  else if(act==="zoom"){
    ui.density="cards";cfg.density="cards";saveCfg();
    zoomToAccount(id);
  }
  else if(act==="more"){
    // Enter or Space on a button is a click with no pointer behind it: detail 0
    if(openMore.has(id))closeCardMenu();
    else openCardMenu(id,btn,e.detail===0);
  }
  else if(act==="fav"){
    acc.fav=!acc.fav;reveal=acc.fav?id+":fav":null;saveDB();
    // Favs pin to the top of every sort — rebuild the grid order, not just this card.
    if(ui.favOnly)render();
    else{renderGrid();renderDash()}
  }
  else if(act==="copyid")copyText(acc.gameName+"#"+acc.tagLine,"Riot ID");
  /* Logging in is username, then password, into two boxes in the client. One
     button walks through both: the first press copies the username and the
     button becomes "Copy password"; the second copies that (cleared from the
     clipboard after 30s, like any copied password) and starts over. */
  else if(act==="copyseq"){
    const both=acc.login&&acc.password;
    const pw=!(acc.login&&(!both||!loginSeq.has(id)));
    copyText(pw?acc.password:acc.login,pw?"Password":"Username",pw,true).then(ok=>{
      // only a copy that worked moves on to the next step: a failed one (the toast
      // says so) left the button on "Copy password" with the username never copied
      if(!ok)return;
      if(!pw){if(both)loginSeq.add(id)}else loginSeq.delete(id);
      // copying the login is the closest thing to playing on it this app can see
      acc.lastLoginAt=Date.now();saveDB();
      flashLogin(id,pw);
    });
  }
  else if(act==="addlogin")openForm(acc,"login");
  else if(act==="copylogin")copyText(acc.login,"Username",false,true).then(ok=>{if(ok)flashCopied(btn)});
  else if(act==="copypw")copyText(acc.password,"Password",true,true).then(ok=>{if(ok)flashCopied(btn)});
  else if(act==="copymail")copyText(acc.email,"Email",false,true).then(ok=>{if(ok)flashCopied(btn)});
  else if(act==="copybirth")copyText(acc.birthdate,"Date of birth",false,true).then(ok=>{if(ok)flashCopied(btn)});
  else if(act==="played"){markPlayed(id)}
  else if(act==="compare"){openMore.delete(id);startCompare(id)}
  else if(act==="seasonreset"){
    const inRank=!!e.target.closest("#rankModal");
    ask({title:"Reset this account for a new season?",body:"Its current rank moves into Past seasons.",ok:"Reset"}).then(ok=>{
      if(!ok)return;
      seasonReset(id);
      if(inRank)renderRankBody(id);
    })}
  else if(act==="flag"){
    acc.flagged=!acc.flagged;
    if(ui.flag==="attention")render();
    else{renderCard(id);renderDash();renderChips()}
    saveThen(acc.flagged?"Flagged. The stats count it under Flagged":"Flag cleared")}
  else if(act==="togglepw"){shownPw.has(id)?shownPw.delete(id):shownPw.add(id);renderCard(id)}
  else if(act==="login"){
    const on=togglePanel(id,"login");   // puts ✎ Rank away if it was open
    reveal=on?id+":login":null;
    // Reaching for the credentials is the closest thing this app can observe to
    // actually using the account. "Status: resting" was a label you had to keep up
    // by hand; this is the same fact, kept by itself.
    if(on){acc.lastLoginAt=Date.now();saveDB()}
    loginSeq.delete(id);   // a fresh look at the login starts at the username
    renderCard(id);
  }
  else if(act==="edit")openForm(acc);
  else if(act==="art")openArtPicker(id);
  else if(act==="notefields"){commitNote();openForm(acc,"notes")}
  // Archiving said where the account went, with nothing to take it back: Undo now,
  // like a delete has
  else if(act==="archive"){acc.archived=true;render();
    saveThen("Archived. It's under Archived in the toolbar","Undo",()=>{
      const a=accounts.find(x=>x.id===id);if(!a||vaultLocked())return;
      a.archived=false;render();saveThen("Back in your active accounts");
    })}
  else if(act==="unarchive"){acc.archived=false;render();saveThen("Restored to active accounts")}
  else if(act==="noteedit"){
    if(editingNote===id)return;
    commitNote();            // only one editor open at a time
    editingNote=id;noteDraft=acc.notes||"";
    // from the ⋯ menu, "card" is the menu: the editor opens on the card itself
    const host=card.closest("#cardMenu")?$("grid").querySelector(`[data-id="${idSel(id)}"]`):card;
    if(host)syncNoteBlock(host,acc);
  }

  else if(act==="range"){chartRange.set(id,btn.dataset.r);renderCard(id)}
  else if(act==="info"){const on=!openInfo.has(id);on?openInfo.add(id):openInfo.delete(id);reveal=on?id+":info":null;
    if(on)loadForm(id);renderCard(id)}
  else if(act==="formretry"){formCache.delete(id);loadForm(id);renderCard(id)}
  else if(act==="sec"){const k=id+"|"+btn.dataset.s, set=DRAWER_SECS.has(btn.dataset.s)?shutSec:openSec;set.has(k)?set.delete(k):set.add(k);
    e.target.closest("#rankModal")?renderRankBody(id):renderCard(id)}
  else if(act==="rank")openRankModal(id);
  else if(act==="rankapply"){
    // Bump the check generation so an in-flight Refresh cannot overwrite a manual
    // entry that landed while it was still waiting on the network.
    checkGen.set(id,(checkGen.get(id)||0)+1);
    checking.delete(id);
    const g=f=>card.querySelector('[data-f="'+f+'"]');
    // readDivision carries the above-Master rule now, so mPlus has nothing left to do here.
    const tier=g("tier").value, isU=tier==="UNRANKED";
    const old=acc.stats||{};
    const s={found:true,tier,division:readDivision(tier,g("div")),lp:isU?null:(+g("lp").value||0),
      wins:g("w").value===""?null:+g("w").value,losses:g("l").value===""?null:+g("l").value,
      level:old.level!=null?old.level:null,peak:old.peak||null,
      seasons:old.seasons||null,flex:old.flex||null,champs:old.champs||null,icon:old.icon||null,mmr:old.mmr||null,avgRecent:null,
      uncertain:false,source:null,asOf:"manual entry",note:null,updatedAt:Date.now()};
    /* Both of these now sit behind their own fold, so their fields are simply
       absent when it is closed. Absent has to mean "leave it alone": reading a
       missing select as "UNRANKED" would have deleted a peak or a goal every time
       somebody saved a rank without opening the section it lives in. */
    if(g("ptier")){
      const ptier=g("ptier").value;
      if(ptier==="UNRANKED")delete acc.peakManual;
      else acc.peakManual={tier:ptier,division:readDivision(ptier,g("pdiv")),lp:+g("plp").value||0,at:Date.now()};
    }
    // A goal is a rank, not a rank and an LP figure: nobody sets out to reach
    // Diamond II with exactly 47 LP. The division is as fine as it gets.
    if(g("gtier")){
      const gtier=g("gtier").value;
      if(gtier==="UNRANKED")delete acc.goal;
      // lp stays null, not 0: ladderLP reads it as zero either way, but shortRank
      // prints it, and "Master · 0 LP" is not a goal anybody set.
      else acc.goal={tier:gtier,division:readDivision(gtier,g("gdiv")),lp:null};
    }
    closeRankModal();
    commitStats(id,acc,s);toast("Rank saved");
  }
  else if(act==="check"&&isOffline())toast(OFFLINE_SAY);
  else if(act==="check")check(id).then(r=>{const a=accounts.find(x=>x.id===id);if(r===true&&a&&canForm(a))loadForm(id)});
  else if(act==="del"){
    if(armedDelete===id){
      const idx=accounts.findIndex(a=>a.id===id);const removed=accounts[idx];
      accounts=accounts.filter(a=>a.id!==id);armedDelete=null;
      selected.delete(id);if(lastSelectedId===id)lastSelectedId=null;
      closeCardMenu();   // it was armed from in there, and its card is gone now
      render();
      // Undo must not fire after an auto-lock — that would put passwords back into
      // memory (and the hidden DOM) while the lock screen is up.
      // And no Undo offered for a deletion that never reached the disk: the
      // account is still in the file, so there is nothing to undo and the offer
      // would paint over the storage warning.
      saveThen("Account deleted","Undo",()=>{
        if(vaultLocked())return;
        accounts.splice(Math.min(idx,accounts.length),0,removed);render();
        saveThen("Account restored");
      });
    }
    // renderCardMenu too: the "Sure? Click again" label lives in the menu now, and
    // the menu is not part of the grid it would otherwise be redrawn with.
    else{armedDelete=id;renderGrid();renderCardMenu();
      setTimeout(()=>{if(armedDelete===id){armedDelete=null;renderGrid();renderCardMenu()}},3000)}
  }
}
$("grid").addEventListener("click",onCardClick);
/* A click anywhere that is not the menu and not a ⋯ dismisses it. The grid's own
   listener has already run by the time this does, so an action picked inside the
   menu has been handled — and closed the menu itself — before we get here. */
document.addEventListener("click",e=>{
  if(!openMore.size)return;
  const t=e.target;
  if(t&&t.closest&&(t.closest("#cardMenu")||t.closest('[data-act="more"]')))return;
  closeCardMenu();
});

// ---------- boot ----------
// A failure note is written into the account and then kept forever, so advice
// from an older build outlives the feature it points at — cards were still
// telling people to use "📋 Paste", removed two versions ago. Anything naming a
// control that no longer exists goes.
function migrateStats(){
  let touched=false;
  for(const a of accounts){
    if(a.stats&&a.stats.note&&/paste/i.test(a.stats.note)){
      a.stats.note=a.stats.note.replace(/\s*—.*$/,"")+". Enter it by hand with ✎ Rank";
      touched=true;
    }
    /* Vaults are already carrying divisions on Master, Grandmaster and Challenger
       ranks, and they are in the history too, so the charts and the details drawer
       print them as well. Guarding the display alone would have hidden the value
       while leaving it in the file, and an export would have carried it straight
       back out. Re-checking sixty accounts to correct a field that has no business
       existing is not a fix anybody should have to run, so it is scrubbed on load. */
    const scrub=e=>{
      if(!e||!e.tier)return;
      const d=normDivision(e.tier,e.division);
      if(d!==(e.division||null)){e.division=d;touched=true}
    };
    scrub(a.stats);scrub(a.peakManual);scrub(a.goal);
    if(a.stats){
      scrub(a.stats.peak);scrub(a.stats.flex);scrub(a.stats.lpAt);
      if(a.stats.seasons)for(const k of ["solo","flex"])(Array.isArray(a.stats.seasons[k])?a.stats.seasons[k]:[]).forEach(scrub);
    }
    (Array.isArray(a.history)?a.history:[]).forEach(scrub);
  }
  if(touched)saveDB();
}
/* "Which version am I actually running" was unanswerable from the page — it only
   ever appeared in the one-shot toast after an update, and only for whoever
   happened to be looking. The footer is where a build number belongs, and the
   changelog for that version hangs off it as a tooltip so the number says what it
   means rather than just identifying itself. */
function renderVersion(){
  const el=$("appVer");if(!el)return;
  el.textContent="v"+APP_VERSION;
  const entry=APP_CHANGELOG.find(e=>e.v===APP_VERSION);
  const items=(entry&&entry.items)||[];
  if(items.length)el.title="New in v"+APP_VERSION+":\n• "+items.join("\n• ");
  else el.removeAttribute("title");
}
/* After an update: one short line with a way to read more, not two release notes
   cut off at "…" in a toast. And never at the same time as the master password
   prompt, which asks for something: the note waits until that window closes. */
function showChangelogIfNeeded(){
  if(cfg.lastChangelog===APP_VERSION)return false;
  if(!$("lockPrompt").classList.contains("hidden"))return false;
  const entry=APP_CHANGELOG.find(e=>e.v===APP_VERSION);
  cfg.lastChangelog=APP_VERSION;saveCfg();
  if(!entry||!entry.items||!entry.items.length)return false;
  toast("Updated to v"+entry.v,"What's new",showWhatsNew);
  return true;
}
function showWhatsNew(){
  const entry=APP_CHANGELOG.find(e=>e.v===APP_VERSION);
  if(!entry||!entry.items)return;
  ask({title:"What's new in v"+APP_VERSION,body:"• "+entry.items.join("\n• "),ok:"Got it",cancel:false});
}
function closeLockPrompt(){
  const m=$("lockPrompt"), was=!m.classList.contains("hidden");
  m.classList.add("hidden");
  if(was)showChangelogIfNeeded();
}
// The installed app's icon shortcuts (manifest.json) open the page with
// ?action=…. It is read once and wiped from the address bar, so a reload or a
// bookmark of that address does not do it again; a locked vault runs it after
// the unlock, when startApp first gets to it.
let startAction=null;
try{startAction=new URLSearchParams(location.search).get("action");if(startAction)history.replaceState(null,"",location.pathname+location.hash)}catch(e){}
function runStartAction(){
  const a=startAction;startAction=null;
  if(a==="add")openForm(null);
  else if(a==="checkall"){if(accounts.length)checkAll();else toast("No accounts to check yet. Add one first")}
}
function startApp(){
  $("appRoot").classList.remove("hidden");
  syncLockTimer();
  migrateStats();
  if(cfg.density==="list"||cfg.density==="cards"||cfg.density==="wall")ui.density=cfg.density;
  /* Until a layout is picked, a phone starts in the list: cards there are one or
     two accounts a screen (twenty accounts, ten screens of scrolling), rows six to
     eleven, each with its copy buttons. A wider screen starts in cards. */
  else if(phoneLayout())ui.density="list";
  refreshCutoffs(); // fire and forget; redraws only if a floor actually arrived
  $("grid").classList.add("boot");
  render();
  renderAwayBand();
  setTimeout(()=>$("grid").classList.remove("boot"),1200);
  /* A first visit used to open on "How this works": eleven sections of search
     operators, keyboard keys and privacy notes, over a page with nothing on it
     yet. That is a reference, and it stays one click away on the ?. The empty
     vault itself is the welcome now: what the app does, and the first step. */
  if(startAction)setTimeout(runStartAction,0); // after boot's own first paint
  else maybeLockPrompt();
  const told=showChangelogIfNeeded(); // waits, if the prompt just opened
  if(cfg.watch)setTimeout(()=>syncWatch(false),1500); // at most every ten minutes
  if(cfg.autoCheck&&!isOffline()){   // offline it waits for the next visit, quietly
    const staleAccs=accounts.filter(autoCheckDue);
    if(staleAccs.length){
      // the run bar shows the check either way; the update note is not covered by it
      if(!told)toast("Auto-checking "+staleAccs.length+" stale account"+(staleAccs.length===1?"":"s")+"…");
      // Through checkAll rather than its own loop: this ran as an invisible second
      // runner, so it got no progress bar and no Stop button, and pressing Check
      // all ranks while it was going started a *parallel* pass over the same
      // accounts — two requests each, into the same rate limits.
      checkAll(staleAccs.map(a=>a.id));
    }
  }
  // An unencrypted vault reaches this straight out of boot(), before the load
  // event. An encrypted one reaches it from the Unlock button, minutes after that
  // event has been and gone — so waiting for `load` unconditionally meant anyone
  // with a master password never got the offline cache registered at all.
  if("serviceWorker"in navigator&&location.protocol.startsWith("http")){
    const reg=()=>navigator.serviceWorker.register("sw.js").catch(()=>{});
    if(document.readyState==="complete")reg();
    else window.addEventListener("load",reg,{once:true});
  }
}
async function tryUnlock(){
  if(!currentEnvelope||unlocking)return;
  const pass=$("lockPass").value;
  if(!pass)return;
  if(!await unlockWith(pass))lockError("Wrong password. Try again.");
}
function lockError(msg){
  const el=$("lockErr");el.textContent=msg;el.style.display="block";
  $("lockPass").value="";$("lockPass").focus();
}
async function unlockWith(pass){
  if(!currentEnvelope||unlocking)return false;
  unlocking=true;
  $("lockBtn").disabled=true;$("lockPk").disabled=true;
  // Open what is on disk now. Another tab may have saved since this one locked,
  // and a frozen tab (a phone's background tab) can miss the event saying so.
  // Only a disk envelope replaces the one in hand, as in relock().
  try{const st=readStoredVault(hasStorage?localStorage.getItem(DB_KEY):null);if(st&&st.envelope)currentEnvelope=st.envelope}catch(e){}
  try{
    const data=await decryptData(pass,currentEnvelope);
    accounts=(Array.isArray(data)?data:[]).map(sanitizeAccount).filter(Boolean);
    vaultPassword=pass;
    $("lockErr").style.display="none";
    $("lockPass").value="";
    $("lock").classList.add("hidden");
    lastActivity=Date.now();
    startApp();
    // A vault written with the older, weaker key stretching is rewritten with the
    // current one now that the password is in hand. Same data, same revision —
    // sync must not see the upgrade as an edit.
    if(readSaltField(currentEnvelope.salt).iter<KDF_ITER)saveDB({keepRev:true});
    return true;
  }catch(e){
    return false;
  }finally{
    unlocking=false;
    $("lockBtn").disabled=false;$("lockPk").disabled=false;
  }
}
async function pkUnlock(){
  const r=pkRecord();
  if(!r||!currentEnvelope||unlocking)return;
  $("lockPk").disabled=true;
  let pass;
  try{pass=await pkOpen(r)}
  catch(e){
    $("lockPk").disabled=false;
    lockError(e&&e.name==="NotAllowedError"?"Canceled. Try Face ID / fingerprint again, or type the master password."
      :"This browser couldn't use the passkey. Type the master password instead.");
    return;
  }
  if(!await unlockWith(pass)){
    // it unwrapped, so it is this vault's passkey, holding a password since changed
    pkForget();updateLockPk();
    lockError("The passkey holds an old master password. Type the current one, then set Face ID / fingerprint up again in Settings › Security.");
  }
}
function updateLockPk(){
  const on=!!(pkRecord()&&pkAvailable());
  $("lockPk").classList.toggle("hidden",!on);
  $("lockTxt").textContent=on?"Use Face ID / fingerprint, or enter your master password.":"Enter your master password to open it.";
}
let unlocking=false;
$("lockBtn").addEventListener("click",tryUnlock);
$("lockPk").addEventListener("click",pkUnlock);
$("lockPass").addEventListener("keydown",e=>{if(e.key==="Enter")tryUnlock()});
function showLockScreen(envelope){
  currentEnvelope=envelope;
  $("lockErr").style.display="none";
  $("lockPass").value="";
  updateLockPk();
  $("lock").classList.remove("hidden");
  // with a passkey set up, start on its button: focusing the box opens a phone's keyboard over it
  setTimeout(()=>($("lockPk").classList.contains("hidden")?$("lockPass"):$("lockPk")).focus(),50);
}
/* The grid is emptied on a lock, but render() never rewrites the windows over it.
   An auto-lock that landed while an account was open for editing left its login,
   password and email sitting in the form's fields, and the rank, compare and quick-
   find windows and the ⋯ menu went on naming accounts — hidden, and one devtools
   away from whoever sits down at the keyboard next. Each one is rebuilt from the
   vault when it next opens, so emptying them costs nothing. */
function forgetVaultDom(){
  for(const el of document.querySelectorAll("#form input,#form textarea,#baList,#palInput,#bulkTag,#sVaultPass"))el.value="";
  for(const id of["formSub","rankSub","rankBody","cmpBody","cardMenu","palList","awayBand","toast"]){const el=$(id);if(el)el.textContent=""}
}
function relock(){
  closeCardMenu();   // floats on the body, so hiding #appRoot would leave it on screen
  let envelope=null;
  try{const stored=readStoredVault(hasStorage?localStorage.getItem(DB_KEY):null);envelope=stored&&stored.envelope||null}catch(e){}
  // Disk may briefly lack an envelope (quota mid-write, failed set-password). Prefer
  // the envelope we unlocked with over fail-opening with secrets still in memory.
  if(!envelope)envelope=currentEnvelope;
  // The derived key goes with the password: leaving it behind would keep the one
  // thing that opens the vault sitting in memory across a lock.
  vaultPassword=null;forgetVaultKey();accounts=[];formCache.clear();pwLeaks.clear();pwLeakState=null;pwLeakGen++;pkDropPending();
  dismissToast(); // drop Delete→Undo before it can rehydrate secrets into a locked vault
  // Clear a copied account password if we still know what it was — lock does not
  // mean "leave the last password on the clipboard for thirty seconds". Write
  // empty directly; requiring a successful read first left the secret hanging on
  // browsers that allow write but not read.
  if(lastCopiedSecret){
    const v=lastCopiedSecret;
    try{
      navigator.clipboard.writeText("").then(()=>{if(lastCopiedSecret===v)lastCopiedSecret=null}).catch(()=>{});
    }catch(e){}
  }
  // A run has no business carrying on against a vault nobody can read: it finishes
  // the account it is on and stops, instead of fetching sixty profiles to write
  // their results into an array that has been emptied.
  if(run)run.stop=true;
  // Drop every per-card UI state too — otherwise a password that was revealed
  // before the auto-lock would still be on screen after the next unlock.
  [checking,openInfo,openLogin,shownPw,openRank,selected,openMore,openSec,shutSec].forEach(s=>s.clear());
  checkGen.clear();
  chartRange.clear();
  armedDelete=null;editingId=null;lastSelectedId=null;flashId=null;
  // an unsaved note draft is vault content too, and it was surviving the lock
  editingNote=null;noteDraft="";
  lastFails=null; // the failbar names accounts, and render() below redraws it
  forgetVaultDom();
  // Empty the grid rather than only hiding it. Locking used to leave every card
  // standing in the hidden #appRoot with everything still on it — including a
  // password that had been revealed just before — until the next unlock happened
  // to re-render over the top.
  render();
  closeAllPanels();
  $("appRoot").classList.add("hidden");
  syncLockTimer(); // nothing left to lock until the vault is opened again
  if(envelope)showLockScreen(envelope);
}
// Another tab wrote the vault — lock (or reload plaintext) so this tab cannot
// keep editing a stale in-memory copy and then overwrite the other tab's save.
window.addEventListener("storage",e=>{
  if(snapMode||!e||e.key!==DB_KEY||e.storageArea!==localStorage)return;
  if(previewMode)return;
  if(vaultPassword&&!vaultLocked()){
    relock();
    toast("Vault changed in another tab. Unlock to reload");
    return;
  }
  if(!vaultPassword&&!vaultLocked()){
    const stored=readStoredVault(e.newValue);
    // Not a shape this build can read: keep this tab's vault rather than empty it.
    if(!stored)return;
    if(stored.envelope){showLockScreen(stored.envelope);return}
    accounts=stored.accounts;
    render();
    toast("Vault updated from another tab");
    return;
  }
  /* Locked here while another tab saved. This tab still held the envelope it had
     locked on, so unlocking opened the older vault, and its next save wrote that
     over what the other tab had added. */
  if(vaultLocked()){
    const stored=readStoredVault(e.newValue);
    if(!stored)return;
    if(stored.envelope){currentEnvelope=stored.envelope;return}
    // protection was removed over there: there is nothing left to unlock
    accounts=stored.accounts;vaultPassword=null;
    $("lock").classList.add("hidden");
    lastActivity=Date.now();
    startApp();
    toast("Vault opened: its master password was removed in another tab");
  }
});
/* cfg is one object written whole, and every vault save writes it as well — the
   sync revision lives in it. Each tab held its own copy, so a setting saved in one
   (a sync token just generated, the backend URL) was written straight back out by
   the other the next time it saved anything at all. Adopted as it lands instead. */
// passkey unlock turned on or off in another tab: a lock screen already up here
// must not keep a button whose passkey record is gone, which then did nothing
window.addEventListener("storage",e=>{
  if(snapMode||!e||e.key!==PK_KEY||e.storageArea!==localStorage)return;
  updateLockPk();
  if(!$("settings").classList.contains("hidden"))updatePkStatus();
});
window.addEventListener("storage",e=>{
  if(snapMode||!e||e.key!==CFG_KEY||e.storageArea!==localStorage||!e.newValue)return;
  try{Object.assign(cfg,JSON.parse(e.newValue))}catch(err){return}
  syncLockTimer(); // the auto-lock minutes may be what changed
});
/* Every shape the vault key has been seen holding, read one way. Boot and another
   tab's write each kept their own list, and the cross-tab one mapped anything it
   did not know onto an empty vault. null means "there is something here, and it is
   none of these" — never the same thing as an empty vault. */
function readStoredVault(raw){
  if(!raw)return{accounts:[]};
  let parsed;
  try{parsed=JSON.parse(raw)}catch(e){return null}
  if(parsed==null)return{accounts:[]};
  if(parsed.__enc)return{envelope:parsed};
  /* An export file is {app, version, accounts}, not a bare array. Dropping that
     into localStorage — or restoring a backup with a tool that writes the file
     body straight into the key — used to boot an empty vault: Array.isArray on
     the object is false, and nothing else looked. The next saveDB writes the
     array shape back, so this is only a one-time rescue. */
  const list=Array.isArray(parsed)?parsed:Array.isArray(parsed.accounts)?parsed.accounts:null;
  if(list)return{accounts:list.map(sanitizeAccount).filter(Boolean)};
  // The encrypted export is the same rescue for the other kind of backup file.
  if(parsed.envelope&&parsed.envelope.__enc)return{envelope:parsed.envelope};
  return null;
}
/* Anything boot cannot read used to open as an empty vault, and the first save
   wrote the new one straight over the only copy of the old. It is set aside under
   a key of its own first — once: until something is saved the vault key still holds
   it, and a copy per reload would fill the quota with the same thing. If even one
   copy cannot be written, nothing is written at all this session — an app that
   cannot save is better than one that saves over this. */
function keepUnreadableVault(raw){
  const prefix=DB_KEY+"-unreadable-";
  let side=null;
  try{
    for(let i=0;i<localStorage.length;i++){
      const k=localStorage.key(i);
      if(k&&k.startsWith(prefix)&&localStorage.getItem(k)===raw){side=k;break}
    }
  }catch(e){}
  if(!side){
    const k=prefix+Date.now();
    try{localStorage.setItem(k,raw);side=k}catch(e){}
  }
  if(!side)hasStorage=false;
  $("banner").textContent=side
    ?"The saved vault could not be read, so this opened empty. What was there is kept untouched in this browser's storage as \""+side+"\"."
    :"The saved vault could not be read, and there was no room to keep a copy. Nothing will be saved this session, so the original stays as it was.";
  $("banner").classList.add("show");
}
/* ---------- the move to smurf-tracker.pages.dev ----------
   A browser keeps a vault per address, so one saved at the old address
   (marvinpanvan.github.io, see APP_HOME) does not appear at the new one by
   itself. The old address says so in a band at the top, and hands the vault over
   in one click: it opens the new address, which asks for the vault through
   window.opener, and the two tabs pass it to each other on this computer.
   Nothing goes through a server, an encrypted vault moves as the same
   ciphertext, and the new address takes it only when it holds no vault of its
   own. Face ID / fingerprint unlock, notification permission and storage
   protection belong to an address, so they are set up again there.
   Anyone at the old address with no vault saved there (and anyone opening a
   snapshot link there) is simply sent on to the new one. */
// the old address keeps something worth a band, not a redirect: a vault, even a locked one
function holdsVault(raw){
  if(!raw)return false;
  const st=readStoredVault(raw);
  return !st||!!st.envelope||st.accounts.length>0;   // unreadable counts: never write over it
}
// where to send a visit to the old address, or null to stay
function oldHomeExit(){
  if(!onOldHome())return null;
  const snap=/^#s=/.test(location.hash||"");
  let kept=false;
  try{kept=holdsVault(localStorage.getItem(DB_KEY))}catch(e){}
  if(kept&&!snap)return null;
  return APP_HOME+(startAction&&!snap?"?action="+encodeURIComponent(startAction):"")+(location.hash||"");
}
let moveTab=null, moveTimer=0;
function renderMoveBand(waiting){
  const el=$("moveBand");if(!el)return;
  const host=new URL(APP_HOME).host, moved=Number(cfg.movedAt)>0;
  setHTML(el,moved
    ?`<span class="mv-t">${icon("check")}<span><b>Your vault is at ${esc(host)} now.</b> A copy is still saved at this old address.</span></span>`
      +`<span class="mv-acts"><a class="btn b-teal" href="${esc(APP_HOME)}">Open ${esc(host)}</a><button type="button" id="mvRemove">Remove the copy here</button></span>`
    :waiting
    ?`<span class="mv-t">${icon("external")}<span><b>Opening ${esc(host)}…</b> If no new tab appears, allow pop-ups for this page and try again.</span></span>`
      +`<span class="mv-acts"><button type="button" id="mvGo">Try again</button></span>`
    :`<span class="mv-t">${icon("external")}<span><b>Smurf Tracker has moved to ${esc(host)}.</b> Your vault is saved per address, so it stays here until you move it.</span></span>`
      +`<span class="mv-acts"><button type="button" id="mvGo" class="b-fill">Move my vault there</button><a class="btn" href="${esc(APP_HOME)}">Open ${esc(host)}</a>`
      // moved by hand already (Export, then Import there): the copy here still needs a way out
      +`<button type="button" id="mvRemove" class="mv-quiet" title="Only if your accounts are already at ${esc(host)}">Already moved? Remove it here</button></span>`);
  el.classList.remove("hidden");
}
function moveVaultOut(){
  // not "noopener": the new tab asks for the vault through window.opener
  moveTab=window.open(APP_HOME+"?action=move-in","_blank");
  if(!moveTab){toast("The browser blocked the new tab. Allow pop-ups for this page, or use Export here and Import there");return}
  renderMoveBand(true);
  clearTimeout(moveTimer);
  moveTimer=setTimeout(()=>{if(!moveTab)return;moveTab=null;renderMoveBand();
    toast("The new address didn't answer. Try again, or use Export here and Import there")},30000);
}
// the old address's side: answer only the tab it opened, at the new address
function moveOutMessage(e){
  if(e.origin!==APP_ORIGIN||!moveTab||e.source!==moveTab)return;
  const d=e.data||{};
  if(d.type==="st-move-ready"){
    let db=null,c=null;try{db=localStorage.getItem(DB_KEY);c=localStorage.getItem(CFG_KEY)}catch(x){}
    moveTab.postMessage({type:"st-move",v:1,db,cfg:c},APP_ORIGIN);
  }else if(d.type==="st-move-done"||d.type==="st-move-refused"){
    clearTimeout(moveTimer);moveTab=null;
    if(d.type==="st-move-done"){cfg.movedAt=Date.now();saveCfg()}
    renderMoveBand();
    toast(d.type==="st-move-done"?"Moved. Your vault is open at the new address"
      :d.why==="not-empty"?"The new address already has a vault, so nothing was moved. Use Export here and Import there to add these accounts to it"
      :"The new address could not keep the vault. Use Export here and Import there");
  }
}
async function removeOldCopy(){
  const host=new URL(APP_HOME).host;
  if(!await ask({title:"Remove the vault and settings saved at this old address?",
    body:Number(cfg.movedAt)>0?"The copy at "+host+" stays as it is."
      :"Only do this if your accounts are already at "+host+" (moved with Export and Import). This can't be undone.",
    ok:"Remove",danger:true}))return;
  hasStorage=false;   // nothing on this page may save them back on its way out
  try{for(const k of [DB_KEY,CFG_KEY,PK_KEY])localStorage.removeItem(k)}catch(e){}
  location.replace(APP_HOME);
}
// the new address's side, opened by the old one with ?action=move-in
function listenForMoveIn(){
  if(!window.opener){toast("To bring a vault over, use Move my vault at the old address");return}
  window.addEventListener("message",moveInMessage);
  toast("Bringing your vault over from the old address…");
  try{window.opener.postMessage({type:"st-move-ready"},OLD_ORIGIN)}catch(e){}
}
function moveInMessage(e){
  if(e.origin!==OLD_ORIGIN||!e.source||e.source!==window.opener)return;
  const d=e.data;if(!d||d.type!=="st-move"||d.v!==1)return;
  window.removeEventListener("message",moveInMessage);
  const res=acceptMovedVault(d.db,d.cfg);
  try{e.source.postMessage(res,OLD_ORIGIN)}catch(x){}
  if(res.type==="st-move-done"){
    hasStorage=false;   // this tab's own empty vault and settings must not be saved over what just arrived
    location.reload();
  }else toast(res.why==="not-empty"?"This address already has a vault, so nothing was moved. Use Export at the old address and Import here"
    :"The vault from the old address could not be kept. Use Export there and Import here");
}
function acceptMovedVault(db,cfgRaw){
  if(!hasStorage)return{type:"st-move-refused",why:"storage"};
  let here=null;try{here=localStorage.getItem(DB_KEY)}catch(e){}
  if(holdsVault(here))return{type:"st-move-refused",why:"not-empty"};
  if(typeof db!=="string"||db.length>20e6)return{type:"st-move-refused",why:"unreadable"};
  const st=readStoredVault(db);
  if(!st)return{type:"st-move-refused",why:"unreadable"};
  let c=null;
  if(typeof cfgRaw==="string"&&cfgRaw.length<1e6)try{c=JSON.parse(cfgRaw)}catch(e){c=null}
  try{
    localStorage.setItem(DB_KEY,db);
    if(c&&typeof c==="object"&&!Array.isArray(c)){
      for(const k of ["persistAsked","notify","movedAt"])delete c[k];   // those were the old address's
      localStorage.setItem(CFG_KEY,JSON.stringify(c));
    }
  }catch(e){return{type:"st-move-refused",why:"storage"}}
  return{type:"st-move-done",n:st.accounts?st.accounts.length:null};
}
if(onOldHome()){
  window.addEventListener("message",moveOutMessage);
  $("moveBand").addEventListener("click",e=>{
    const b=e.target.closest("button");if(!b)return;
    if(b.id==="mvGo")moveVaultOut();else if(b.id==="mvRemove")removeOldCopy();
  });
}
function boot(){
  // the old address: on to the new one, unless it holds a vault to hand over
  {const exit=oldHomeExit();if(exit){location.replace(exit);return}}
  // A snapshot link is somebody else's page, opened before this browser's own
  // vault or settings have been read — and they never are, in this tab.
  {const m=/^#s=(.+)$/.exec(location.hash||"");if(m){openSnapshot(m[1]);return}}
  $("fRegion").innerHTML=Object.keys(REGIONS).map(r=>`<option value="${r}">${esc(r)} · ${esc(REGIONS[r].full)}</option>`).join("");
  $("sAutoEvery").innerHTML=AUTO_EVERY.map(o=>`<option value="${o.v}">${esc(o.label)}</option>`).join("");
  fillAutoLock($("sAutoLock"),0);
  $("baRegion").innerHTML=$("fRegion").innerHTML;
  renderVersion();
  hasStorage=storageOK();
  if(!hasStorage){$("banner").classList.add("show")}
  try{
    const c=hasStorage?localStorage.getItem(CFG_KEY):null;
    if(c)cfg=Object.assign(cfg,JSON.parse(c));
    /* "What's new" is only news to somebody who had the version before. A first
       visit — no settings and no vault; a vault without settings is an older
       build's, and its owner is exactly who the changelog is for — used to get a
       toast about the tag handle's count over the welcome window. It records the
       version quietly instead, so the next update is the one it hears about. */
    else if(hasStorage&&!localStorage.getItem(DB_KEY)){cfg.lastChangelog=APP_VERSION;saveCfg()}
  }catch(e){}
  if(MODEL_ALIASES[cfg.model]){cfg.model=MODEL_ALIASES[cfg.model];saveCfg()}
  if(onOldHome())renderMoveBand();
  if(startAction==="move-in")listenForMoveIn();   // startAction stays set: startApp shows no lock prompt over it
  {
    let cfgDirty=false;
    // 2.1's Compact cards was one switch for the chart and the stats; it is now
    // those two parts in the per-part list, so a vault that had it keeps the look
    if(cfg.compactCards===true&&!Array.isArray(cfg.cardHide)){cfg.cardHide=["chart","stats"];cfgDirty=true}
    if("compactCards"in cfg){delete cfg.compactCards;cfgDirty=true}
    const every=coerceAutoEvery(cfg.autoEveryHours);
    if(cfg.autoEveryHours!==every){cfg.autoEveryHours=every;cfgDirty=true}
    if(cfg.discordWebhook){
      const ok=validDiscordWebhook(cfg.discordWebhook);
      if(!ok){cfg.discordWebhook="";cfgDirty=true}
      else if(ok!==cfg.discordWebhook){cfg.discordWebhook=ok;cfgDirty=true}
    }
    if(cfg.backendUrl){
      const ok=validBackendUrl(cfg.backendUrl);
      if(!ok){cfg.backendUrl="";cfgDirty=true}
      else if(ok!==cfg.backendUrl){cfg.backendUrl=ok;cfgDirty=true}
    }
    const days=clampExportDays(cfg.exportRemindDays);
    if(cfg.exportRemindDays!==days){cfg.exportRemindDays=days;cfgDirty=true}
    // So the timer that actually runs is the one the dropdown will show.
    const lock=clampAutoLock(cfg.autoLockMin);
    if((cfg.autoLockMin||0)!==lock){cfg.autoLockMin=lock;cfgDirty=true}
    if(cfgDirty)saveCfg();
  }
  fillAutoLock($("sAutoLock"),cfg.autoLockMin||0);
  if(cfg.accent)applyAccent(cfg.accent);
  if(cfg.accent2)applyAccent2(cfg.accent2);
  applyAtmosphere(cfg.atmosphere||DEFAULT_ATMOSPHERE);applyEffects(cfg.effects);applyTextSize(cfg.textSize);applyCompact();applyStreamer();applyArtOpacity();
  let raw=null;
  try{raw=hasStorage?localStorage.getItem(DB_KEY):null}catch(e){}
  const stored=readStoredVault(raw);
  if(!stored)keepUnreadableVault(raw);
  else if(stored.accounts)accounts=stored.accounts;
  if(stored&&stored.envelope)showLockScreen(stored.envelope);
  else startApp();
}
boot();
