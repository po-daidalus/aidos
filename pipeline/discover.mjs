// aidos.de discovery: use Apify SEARCH to auto-generate the candidate place list (no manual URLs).
// Writes candidates.json (URL + full metadata) and candidate_urls.txt (paste into the extension loader).
// Usage: node pipeline/discover.mjs [perSearch=30]
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const ROOT = new URL('..', import.meta.url);
const TOKEN = (fs.readFileSync(new URL('.env', ROOT), 'utf8').match(/APIFY_TOKEN=(.+)/) || [])[1]?.trim();
if (!TOKEN) throw new Error('APIFY_TOKEN not found in .env');

// --- scope: edit these to change coverage ---
const CITIES = ['Berlin'];
const INDUSTRIES = [
  'Fitnessstudio', 'Restaurant', 'Zahnarzt', 'Arzt', 'Anwalt', 'Steuerberater',
  'Autohaus', 'Hotel', 'Friseur', 'Kosmetikstudio', 'Immobilienmakler', 'Tierarzt',
];
const PER = Number(process.argv[2] || 15); // places per search (protects Apify free credits)

const searches = [];
for (const c of CITIES) for (const i of INDUSTRIES) searches.push(`${i} ${c}`);
console.log(`searches (${searches.length}): ${searches.join(' | ')}  | perSearch: ${PER}`);

// One sync call per search (the sync endpoint caps at 300s, so we keep each call small).
const URL_SYNC = `https://api.apify.com/v2/acts/compass~crawler-google-places/run-sync-get-dataset-items?token=${TOKEN}`;
const map = new Map();
for (const s of searches) {
  process.stdout.write(`  ${s} … `);
  try {
    const res = await fetch(URL_SYNC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ searchStringsArray: [s], language: 'de', maxReviews: 0, maxCrawledPlacesPerSearch: PER }),
    });
    const places = await res.json();
    if (Array.isArray(places)) {
      let added = 0;
      for (const p of places) if (p.fid && !map.has(p.fid)) { map.set(p.fid, p); added++; }
      console.log(`${places.length} found (+${added} new)`);
    } else {
      console.log('error:', JSON.stringify(places).slice(0, 120));
    }
  } catch (e) {
    console.log('failed:', e.message);
  }
}
if (!map.size) { console.error('no candidates found'); process.exit(1); }

const candidates = [...map.values()].map((p) => ({
  key: p.fid,
  name: p.title,
  category: p.categoryName,
  city: p.city,
  postal_code: p.postalCode,
  state: p.state,
  address: p.address,
  rating: p.totalScore ?? null,
  reviews: p.reviewsCount ?? null,
  distribution: p.reviewsDistribution || null,
  image: p.imageUrl || null,
  website: p.website || null,
  phone: p.phone || null,
  lat: p.location?.lat ?? null,
  lng: p.location?.lng ?? null,
  url: p.url,
  search: p.searchString,
}));

fs.mkdirSync(new URL('pipeline/out/', ROOT), { recursive: true });
fs.writeFileSync(new URL('pipeline/out/candidates.json', ROOT), JSON.stringify(candidates, null, 2));
const urlList = candidates.map((c) => c.url).join('\n');
fs.writeFileSync(new URL('pipeline/out/candidate_urls.txt', ROOT), urlList);
try { execSync('pbcopy', { input: urlList }); console.log('(✓ candidate URLs copied to your clipboard — paste into the loader)'); } catch {}

console.log(`\ncandidates: ${candidates.length} unique places`);
const byCat = {};
candidates.forEach((c) => (byCat[c.category] = (byCat[c.category] || 0) + 1));
Object.entries(byCat).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${v}  ${k}`));
console.log(`\nwrote: pipeline/out/candidates.json\n       pipeline/out/candidate_urls.txt  (paste into the extension loader)`);
