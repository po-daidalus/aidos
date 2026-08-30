// aidos.de — which cities are due for a screening run?
//
// The screening rotation replaced the monthly all-cities plan: 21 cities are ~97 h of laptop time,
// which never fit into a month, and a monthly prevalence comparison is not resolvable anyway (even
// a full city list of ~1.900 URLs gives a 95 % interval of about ±1 pp, while a real month-over-
// month change is a fraction of that). What the screening genuinely delivers — the ranking between
// cities and the discovery of newly bannered profiles — holds up fine at a 2–3 month cadence.
//
// This script answers the only question the rotation needs: which city has waited longest.
// Usage: node pipeline/sweep-due.mjs [--copy] [--month=YYYY-MM] [--top=N]
//   --copy   put the most overdue city's URL list in the clipboard (macOS pbcopy)
//   --month  which sweep folder the lists come from (default: current month)
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const ROOT = new URL('..', import.meta.url);
const arg = (n, d) => (process.argv.find((a) => a.startsWith(`--${n}=`)) || `=${d}`).split('=')[1];
const month = arg('month', new Date().toISOString().slice(0, 7));
const top = +arg('top', 6);
const doCopy = process.argv.includes('--copy');

const CITIES = ['Berlin', 'Hamburg', 'München', 'Köln', 'Frankfurt am Main', 'Stuttgart', 'Düsseldorf',
  'Leipzig', 'Dortmund', 'Essen', 'Bremen', 'Dresden', 'Hannover', 'Nürnberg', 'Duisburg', 'Bochum',
  'Wuppertal', 'Bielefeld', 'Bonn', 'Münster'];
const slug = (s) => s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// checks.jsonl only ever receives screening runs — the panel is ingested with --no-checks — so its
// newest row per city IS that city's last screening. The >=200 floor is the same one aggregate.mjs
// uses for coverage: a handful of checks is a stray, not a measurement.
const rows = fs.readFileSync(new URL('pipeline/out/checks.jsonl', ROOT), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const last = new Map();
for (const c of rows.filter((r) => r.checked >= 200).sort((a, b) => a.date.localeCompare(b.date))) last.set(c.city, c);

const mi = (m) => { const [y, mo] = m.split('-').map(Number); return y * 12 + (mo - 1); };
const now = mi(month);
const SEC_PER_URL = 14.8; // measured net throughput, unchanged since the July screening

const queue = CITIES.map((city) => {
  const l = last.get(city);
  const p = new URL(`pipeline/out/sweep-${month}/screening/${slug(city)}.txt`, ROOT);
  const urls = fs.existsSync(p) ? fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).length : 0;
  return { city, path: p, urls, month: l ? l.date : null, age: l ? now - mi(l.date) : 99,
           rate: l ? (100 * l.hit) / (l.hit + l.no_banner) : null };
}).sort((a, b) => b.age - a.age || b.urls - a.urls);

console.log(`Screening-Rotation, Stand ${month} — ${queue.filter((q) => q.age >= 2).length} von ${CITIES.length} Städten fällig (>=2 Monate)\n`);
console.log('  Stadt              zuletzt    Alter   URLs    ~Dauer   Quote');
for (const q of queue.slice(0, top)) {
  const h = (q.urls * SEC_PER_URL) / 3600;
  console.log('  ' + q.city.padEnd(18) + (q.month || 'nie').padEnd(11) +
    (q.age === 99 ? '  —  ' : String(q.age) + ' Mon').padEnd(8) +
    String(q.urls).padStart(5) + '   ' + h.toFixed(1).padStart(5) + ' h   ' +
    (q.rate != null ? q.rate.toFixed(1) + ' %' : '—'));
}
const rest = queue.slice(top);
if (rest.length) console.log(`\n  … dahinter: ${rest.map((q) => q.city).join(', ')}`);

if (doCopy) {
  const n = queue[0];
  if (!n.urls) throw new Error(`keine Liste für ${n.city} — erst node pipeline/make-sweep.mjs ${month}`);
  execFileSync('pbcopy', { input: fs.readFileSync(n.path) });
  console.log(`\n→ ${n.city} im Clipboard (${n.urls} URLs, ~${((n.urls * SEC_PER_URL) / 3600).toFixed(1)} h)`);
}
