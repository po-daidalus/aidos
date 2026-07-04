// aidos.de — free candidate discovery from OpenStreetMap (Overpass). No Apify.
// Queries ONE industry tag at a time (the combined query times out on big cities) and accumulates.
// Emits Google-Maps SEARCH URLs to paste into the extension loader.
// Usage: node pipeline/discover-osm.mjs "Berlin" [perTag=180]
//   20 biggest cities: Berlin, Hamburg, München, Köln, Frankfurt am Main, Stuttgart, Düsseldorf,
//   Leipzig, Dortmund, Essen, Bremen, Dresden, Hannover, Nürnberg, Duisburg, Bochum, Wuppertal,
//   Bielefeld, Bonn, Münster
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { classify } from './entity-filter.mjs';
import { branchOf } from './classify-branch.mjs';

const slug = (s) => s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const ROOT = new URL('..', import.meta.url);
const city = process.argv[2] || 'Berlin';
const PER = Number(process.argv[3] || 180); // max businesses per industry

const TAGS = [
  ['amenity', 'dentist'], ['healthcare', 'dentist'], ['amenity', 'doctors'], ['amenity', 'veterinary'],
  ['office', 'lawyer'], ['office', 'tax_advisor'], ['office', 'estate_agent'],
  ['shop', 'car'], ['shop', 'hairdresser'], ['shop', 'beauty'],
  ['leisure', 'fitness_centre'], ['amenity', 'restaurant'], ['amenity', 'fast_food'], ['tourism', 'hotel'],
];
const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];

async function overpass(query) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const url = ENDPOINTS[attempt % ENDPOINTS.length];
    if (attempt) await new Promise((r) => setTimeout(r, 6000 + attempt * 3000));
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'aidos.de-research/0.1 (transparency project)' }, body: 'data=' + encodeURIComponent(query) });
      const ct = res.headers.get('content-type') || '';
      if (res.ok && ct.includes('json')) { const d = await res.json(); if (!d.remark || !/timed out/i.test(d.remark)) return d; }
    } catch { /* retry */ }
  }
  return { elements: [] };
}

const seen = new Set(), cands = [];
let individuals = 0;
console.log(`discovering candidates in ${city} (per industry: ${PER}) …`);
for (const [k, v] of TAGS) {
  const query = `[out:json][timeout:80];
area["name"="${city}"]["admin_level"~"^(4|6)$"]->.a;
nwr["${k}"="${v}"]["name"](area.a);
out tags center ${PER};`;
  process.stdout.write(`  ${k}=${v} … `);
  const data = await overpass(query);
  let added = 0;
  for (const el of data.elements || []) {
    const name = el.tags && el.tags.name; if (!name) continue;
    const kk = name.toLowerCase().trim(); if (seen.has(kk)) continue; seen.add(kk);
    // We scrape EVERYONE (individuals included, so they feed the aggregates). The `nameable` flag
    // only governs whether an entity may later be shown individually on the listing page.
    const cls = classify(name, v);
    if (!cls.keep) individuals++;
    cands.push({ name, city, category: v, nameable: cls.keep, entity_type: cls.type, lat: el.lat ?? el.center?.lat ?? null, lng: el.lon ?? el.center?.lon ?? null, url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name + ' ' + city)}` });
    added++;
  }
  console.log(`${(data.elements || []).length} found (+${added} new)`);
  await new Promise((r) => setTimeout(r, 1500));
}

fs.mkdirSync(new URL('pipeline/out/candidates/', ROOT), { recursive: true });
fs.mkdirSync(new URL('pipeline/out/coverage/', ROOT), { recursive: true });
const cslug = slug(city);
const urls = cands.map((c) => c.url).join('\n');

// per-city URL list + candidate metadata (reusable library, one file per city)
fs.writeFileSync(new URL('pipeline/out/candidates/' + cslug + '.txt', ROOT), urls);
fs.writeFileSync(new URL('pipeline/out/candidates/' + cslug + '.json', ROOT), JSON.stringify(cands, null, 2));

// coverage denominator: how many candidates we will CHECK per branch → enables real "% betroffene"
const perBranch = {};
for (const c of cands) { const b = branchOf(c.name, c.category) || 'Sonstige'; perBranch[b] = (perBranch[b] || 0) + 1; }
fs.writeFileSync(new URL('pipeline/out/coverage/' + cslug + '.json', ROOT), JSON.stringify({ city, slug: cslug, generated: new Date().toISOString(), total: cands.length, perBranch }, null, 2));

// keep the single convenience file + clipboard pointing at the latest city
fs.writeFileSync(new URL('pipeline/out/candidate_urls.txt', ROOT), urls);
try { execSync('pbcopy', { input: urls }); console.log('(✓ candidate URLs copied to clipboard — paste into the extension loader)'); } catch {}
console.log(`\nOSM ${city}: ${cands.length} candidates (incl. ${individuals} individuals — scraped for aggregates, not listed individually) → pipeline/out/candidates/${cslug}.txt`);
console.log('per-branch (denominator):', Object.entries(perBranch).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · '));
