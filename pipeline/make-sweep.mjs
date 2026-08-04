// aidos.de — build the URL lists for a monthly sweep.
// Two lists, run in this order:
//   1) panel.txt      — the KNOWN businesses from db.json (stored Google permalink, else a
//                       name+city search URL). Guarantees the month-over-month data point for every
//                       public profile page. This is a HIT-ONLY list → its checks must NEVER be
//                       ingested (they would overwrite the month's real prevalence denominator).
//   2) screening/<slug>.txt — the full OSM candidate list per survey city. This is the run that
//                       measures prevalence AND finds businesses that got their banner since last
//                       month. Ingest these WITH --city so checks land in checks.jsonl.
// Individuals (nameable=false) are pseudonymized in the DB — no name, no URL — so they cannot be
// re-visited from the panel. They are re-caught by the screening run and keep feeding aggregates.
// Usage: node pipeline/make-sweep.mjs [YYYY-MM]
import fs from 'node:fs';

const ROOT = new URL('..', import.meta.url);
const month = process.argv[2] || new Date().toISOString().slice(0, 7);
const OUT = new URL(`pipeline/out/sweep-${month}/`, ROOT);
const SCREEN = new URL('screening/', OUT);

const CITIES = ['Berlin', 'Hamburg', 'München', 'Köln', 'Frankfurt am Main', 'Stuttgart', 'Düsseldorf',
  'Leipzig', 'Dortmund', 'Essen', 'Bremen', 'Dresden', 'Hannover', 'Nürnberg', 'Duisburg', 'Bochum',
  'Wuppertal', 'Bielefeld', 'Bonn', 'Münster'];
const slug = (s) => s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

fs.mkdirSync(SCREEN, { recursive: true });

// ---- 1) panel: every known business we can still address ----------------------------------
const db = JSON.parse(fs.readFileSync(new URL('pipeline/out/db.json', ROOT), 'utf8')).businesses;
const panel = [], unreachable = [];
for (const [key, b] of Object.entries(db)) {
  if (b.url) { panel.push(b.url); continue; }
  if (b.name) { panel.push('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(b.name + ' ' + (b.city || ''))); continue; }
  unreachable.push(key); // pseudonymized individual — screening run only
}
fs.writeFileSync(new URL('panel.txt', OUT), panel.join('\n') + '\n');

// ---- 2) screening: the frozen candidate set for this month ---------------------------------
let total = 0; const missing = [], perCity = [];
for (const c of CITIES) {
  const src = new URL('pipeline/out/candidates/' + slug(c) + '.txt', ROOT);
  if (!fs.existsSync(src)) { missing.push(c); continue; }
  const urls = [...new Set(fs.readFileSync(src, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean))];
  fs.writeFileSync(new URL(slug(c) + '.txt', SCREEN), urls.join('\n') + '\n');
  perCity.push([c, urls.length]); total += urls.length;
}

console.log(`sweep ${month} → pipeline/out/sweep-${month}/`);
console.log(`  panel.txt        ${String(panel.length).padStart(6)} URLs  (${unreachable.length} pseudonymized individuals not addressable — screening only)`);
console.log(`  screening/       ${String(total).padStart(6)} URLs across ${perCity.length} cities`);
for (const [c, n] of perCity.sort((a, b) => a[1] - b[1])) console.log(`    ${c.padEnd(20)} ${String(n).padStart(5)}  → screening/${slug(c)}.txt`);
if (missing.length) console.log(`  ⚠️  no candidate list on disk for: ${missing.join(', ')} — run: node pipeline/discover-osm.mjs "<Stadt>"`);
