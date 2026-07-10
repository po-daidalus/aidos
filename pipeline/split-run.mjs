// aidos.de — split a multi-city extension export ({records, checks}) into per-city files.
// The combined sweep visits several cities in one run; ingest.mjs attributes checks per city via
// --city, so the export must be split first. City attribution cascade:
//   records: capture lat/lng → geo box · address PLZ · URL/query text
//   checks:  final URL → query text (incl. English city names) · direction target · URL lat/lng
// Output: pipeline/out/runsplit/<slug>.json ({records, checks}) + strays.json (real places that
// resolved OUTSIDE every survey city — ingested without a survey city, never mislabeled).
// Usage: node pipeline/split-run.mjs "<export.json>"
import fs from 'node:fs';

const inPath = process.argv[2];
if (!inPath) throw new Error('pass the export path (.json)');
const ROOT = new URL('..', import.meta.url);
const OUT = new URL('pipeline/out/runsplit/', ROOT);

const CITIES = ['Düsseldorf', 'Dresden', 'Stuttgart', 'Nürnberg', 'Hannover', 'Bremen', 'Essen', 'Dortmund', 'Bochum', 'Duisburg', 'München', 'Berlin', 'Hamburg', 'Köln', 'Leipzig', 'Frankfurt am Main'];
const EN = { nuremberg: 'Nürnberg', munich: 'München', dusseldorf: 'Düsseldorf', duesseldorf: 'Düsseldorf', hanover: 'Hannover', cologne: 'Köln', frankfurt: 'Frankfurt am Main' };
const GEO = {
  'Düsseldorf': [51.1, 51.35, 6.6, 7.0], 'Dresden': [50.95, 51.15, 13.55, 13.95], 'Stuttgart': [48.6, 48.9, 9.0, 9.35],
  'Nürnberg': [49.35, 49.55, 10.95, 11.25], 'Hannover': [52.3, 52.5, 9.6, 9.9], 'Bremen': [53.0, 53.25, 8.6, 9.0],
  'Essen': [51.38, 51.51, 6.9, 7.15], 'Dortmund': [51.45, 51.6, 7.35, 7.65], 'Bochum': [51.4, 51.55, 7.1, 7.35],
  'Duisburg': [51.35, 51.5, 6.65, 6.85], 'München': [48.0, 48.3, 11.3, 11.8], 'Berlin': [52.3, 52.7, 13.1, 13.8],
  'Hamburg': [53.4, 53.75, 9.7, 10.3], 'Köln': [50.83, 51.09, 6.77, 7.16], 'Leipzig': [51.23, 51.45, 12.23, 12.55],
  'Frankfurt am Main': [50.02, 50.23, 8.47, 8.8],
};
const geoCity = (lat, lng) => { for (const [c, [a, b, x, y]] of Object.entries(GEO)) if (lat >= a && lat <= b && lng >= x && lng <= y) return c; return null; };
const PLZ2 = { '40': 'Düsseldorf', '01': 'Dresden', '70': 'Stuttgart', '90': 'Nürnberg', '30': 'Hannover', '28': 'Bremen', '45': 'Essen', '47': 'Duisburg', '04': 'Leipzig', '50': 'Köln', '51': 'Köln', '10': 'Berlin', '12': 'Berlin', '13': 'Berlin', '14': 'Berlin', '20': 'Hamburg', '21': 'Hamburg', '22': 'Hamburg', '60': 'Frankfurt am Main' };

function cityOfUrl(url) {
  let u = ''; try { u = decodeURIComponent(url || '').replace(/\+/g, ' '); } catch { u = url || ''; }
  const q = u.split('/@')[0].toLowerCase();
  for (const c of CITIES) if (q.includes(' ' + c.toLowerCase()) || q.endsWith('/' + c.toLowerCase())) return c;
  for (const [en, de] of Object.entries(EN)) if (q.includes(en)) return de;
  const m = u.match(/\/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (m) return geoCity(+m[1], +m[2]);
  return null;
}
function cityOfRec(r) {
  if (+r.lat) { const g = geoCity(+r.lat, +r.lng); if (g) return g; }
  const plz = (((r.address || '') + ' ' + (r.postal_code || '')).match(/\b(\d{5})\b/) || [])[1];
  if (plz) {
    if (PLZ2[plz.slice(0, 2)]) {
      if (plz.slice(0, 2) === '44') return +plz < 44540 ? 'Dortmund' : 'Bochum';
      return PLZ2[plz.slice(0, 2)];
    }
    if (plz.slice(0, 2) === '44') return +plz < 44540 ? 'Dortmund' : 'Bochum';
    if (plz[0] === '8' && +plz < 82000) return 'München';
  }
  return cityOfUrl(r.url || r.key);
}

const d = JSON.parse(fs.readFileSync(inPath, 'utf8'));
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const buckets = {}; const strays = { records: [], checks: [] };
for (const r of d.records || []) { const c = cityOfRec(r); if (c) (buckets[c] ||= { records: [], checks: [] }).records.push(r); else strays.records.push(r); }
let unChecks = 0;
for (const c of d.checks || []) { const ct = cityOfUrl(c.url); if (ct) (buckets[ct] ||= { records: [], checks: [] }).checks.push(c); else unChecks++; }

const slug = (s) => s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-');
for (const [c, b] of Object.entries(buckets).sort((a, z) => z[1].checks.length - a[1].checks.length)) {
  fs.writeFileSync(new URL(slug(c) + '.json', OUT), JSON.stringify(b));
  const hits = b.checks.filter((x) => x.outcome === 'hit').length;
  console.log(c.padEnd(18), 'records:', String(b.records.length).padStart(4), '| checks:', String(b.checks.length).padStart(5), '| hit-rate:', b.checks.length ? (100 * hits / b.checks.length).toFixed(1) + '%' : '–');
}
if (strays.records.length) { fs.writeFileSync(new URL('strays.json', OUT), JSON.stringify(strays)); console.log('strays (real places outside all survey cities):', strays.records.length); }
console.log(`checks unassigned: ${unChecks} / ${(d.checks || []).length}`);
console.log('→ ingest each: node pipeline/ingest.mjs pipeline/out/runsplit/<slug>.json --city=<Stadt>  (strays.json WITHOUT --city)');
