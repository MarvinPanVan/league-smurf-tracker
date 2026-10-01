// Reads APP_VERSION and its APP_CHANGELOG entry out of index.html — the same list
// the app's own update toast and footer show — and writes release notes for it.
// Usage: node .github/scripts/release-notes.mjs <notes-out.md>  (prints the version)
import fs from "node:fs";
const html = fs.readFileSync("index.html", "utf8");
const version = html.match(/const APP_VERSION="([^"]+)"/)[1];
const start = html.indexOf(`{v:"${version}",items:[`);
if (start < 0) throw new Error(`no changelog entry for ${version}`);
const body = html.slice(start, html.indexOf("]}", start));
const items = [...body.matchAll(/"((?:[^"\\]|\\.)*)"/g)].slice(1).map(m => JSON.parse(`"${m[1]}"`));
if (!items.length) throw new Error(`the ${version} entry has no items`);
const notes = items.map(i => `- ${i}`).join("\n")
  + "\n\n**[Open the app](https://marvinpanvan.github.io/league-smurf-tracker/)**: an open tab or installed copy picks this up on its next reload.\n";
fs.writeFileSync(process.argv[2] || "notes.md", notes);
console.log(version);
