// Reads APP_VERSION and its APP_CHANGELOG entry out of app.js — the same list
// the app's own update toast and footer show — and writes release notes for it.
// Usage: node .github/scripts/release-notes.mjs <notes-out.md>  (prints the version)
import fs from "node:fs";
const src = fs.readFileSync("app.js", "utf8");
const version = src.match(/const APP_VERSION="([^"]+)"/)[1];
const start = src.indexOf(`{v:"${version}",items:[`);
if (start < 0) throw new Error(`no changelog entry for ${version}`);
const body = src.slice(start, src.indexOf("]}", start));
const items = [...body.matchAll(/"((?:[^"\\]|\\.)*)"/g)].slice(1).map(m => JSON.parse(`"${m[1]}"`));
if (!items.length) throw new Error(`the ${version} entry has no items`);
const notes = items.map(i => `- ${i}`).join("\n")
  + "\n\n**[Open the app](https://smurf-tracker.pages.dev/)**: an open tab or installed copy picks this up on its next reload.\n";
fs.writeFileSync(process.argv[2] || "notes.md", notes);
console.log(version);
