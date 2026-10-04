// aidos.de — who actually reads the site? Tracker-free traffic from Cloudflare's edge logs.
//
// The site promises "keine Tracker, keine Cookies", so there is deliberately no analytics script.
// Cloudflare already sees every request at the edge, and its GraphQL API exposes that per path —
// without anything running in the visitor's browser. Two limits of the free plan shape this script:
//   - the request-level dataset only reaches back ~30 days, so each finished day is stored once
//     under pipeline/out/traffic/ and the history grows from there;
//   - the referrer is not available, so WHERE visitors come from stays unknown (Search Console).
// Only aggregates are written. Client IPs are used in memory to count distinct visitors per day
// and are never stored.
//
// "Browser" means: an HTML page answered with 200, no verified bot, a recognised browser user
// agent. Unverified bots that fake a Chrome user agent still slip through, so the browser figures
// are an UPPER bound for humans, never a precise human count. Cloudflare also samples this dataset
// on busy hours; the counts are its estimates.
//
// Usage: node pipeline/traffic.mjs [--days=28]
import fs from 'node:fs';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

const ROOT = new URL('..', import.meta.url);
const OUT = new URL('pipeline/out/traffic/', ROOT);
const ZONE = '4df3f7a49a7bb565fad8258215ee237f'; // aidos.tech
const days = Math.min(29, +((process.argv.find((a) => a.startsWith('--days=')) || '=28').split('=')[1]));

// Reuse wrangler's OAuth login. Any wrangler command refreshes an expired token first.
const CFG = `${os.homedir()}/Library/Preferences/.wrangler/config/default.toml`;
const readCfg = (k) => (fs.readFileSync(CFG, 'utf8').match(new RegExp(`^${k}\\s*=\\s*"(.*)"`, 'm')) || [])[1];
if (!readCfg('expiration_time') || new Date(readCfg('expiration_time')) < new Date(Date.now() + 60e3)) {
  execFileSync('npx', ['wrangler', 'whoami'], { stdio: 'ignore' });
}
const TOKEN = readCfg('oauth_token');

async function gql(query) {
  const r = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const d = await r.json();
  if (d.errors) throw new Error(JSON.stringify(d.errors));
  return d.data.viewer.zones[0];
}

// A German-language site: browser traffic from Germany, Austria and Switzerland is the closer
// proxy for real readers. The rest is dominated by unverified bots with browser user agents.
const DACH = new Set(['DE', 'AT', 'CH']);
const NOT_BROWSERS = new Set(['', 'Unknown', 'Curl', 'ChromeHeadless', 'Python', 'Go', 'Java', 'Wget']);
const section = (p) => {
  const s = p.replace(/^\/en(?=\/|$)/, '').split('/')[1] || '';
  return { '': 'Startseite', unternehmen: 'Unternehmen', stadt: 'Stadt', branche: 'Branche', report: 'Report',
    listing: 'Liste', methodik: 'Methodik', methodology: 'Methodik' }[s] || 'Sonstige';
};

async function fetchDay(day) {
  const next = new Date(Date.parse(day) + 864e5).toISOString().slice(0, 10);
  const base = `datetime_geq:"${day}T00:00:00Z",datetime_lt:"${next}T00:00:00Z",requestSource:"eyeball",edgeResponseStatus:200,edgeResponseContentTypeName:"html"`;
  const z = await gql(`{viewer{zones(filter:{zoneTag:"${ZONE}"}){
    hits:httpRequestsAdaptiveGroups(limit:10000,filter:{${base},verifiedBotCategory:""}){count dimensions{clientRequestPath userAgentBrowser clientIP clientCountryName clientDeviceType}}
    bots:httpRequestsAdaptiveGroups(limit:100,filter:{${base},verifiedBotCategory_neq:""}){count dimensions{verifiedBotCategory}}
  }}}`);
  const rows = z.hits.filter((r) => !NOT_BROWSERS.has(r.dimensions.userAgentBrowser));
  const add = (o, k, n) => { o[k] = (o[k] || 0) + n; };
  const out = { day, views: 0, visitors: 0, pages: {}, sections: {}, countries: {}, devices: {}, bots: {},
    dach: { views: 0, visitors: 0, pages: {}, sections: {} } };
  const ips = new Set(), dachIps = new Set();
  for (const { count, dimensions: d } of rows) {
    out.views += count;
    ips.add(d.clientIP);
    add(out.pages, d.clientRequestPath, count);
    add(out.sections, section(d.clientRequestPath), count);
    add(out.countries, d.clientCountryName || '?', count);
    add(out.devices, d.clientDeviceType || '?', count);
    if (DACH.has(d.clientCountryName)) {
      out.dach.views += count;
      dachIps.add(d.clientIP);
      add(out.dach.pages, d.clientRequestPath, count);
      add(out.dach.sections, section(d.clientRequestPath), count);
    }
  }
  out.visitors = ips.size;
  out.dach.visitors = dachIps.size;
  for (const { count, dimensions: d } of z.bots) add(out.bots, d.verifiedBotCategory, count);
  return out;
}

// Store every finished day once; today is still running and gets refetched each time.
fs.mkdirSync(OUT, { recursive: true });
const today = new Date().toISOString().slice(0, 10);
for (let i = days; i >= 1; i--) {
  const day = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
  const file = new URL(`${day}.json`, OUT);
  if (fs.existsSync(file)) continue;
  fs.writeFileSync(file, JSON.stringify(await fetchDay(day), null, 1) + '\n');
}

// Report over everything stored inside the window.
const since = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
const all = fs.readdirSync(OUT).filter((f) => /^\d{4}-\d\d-\d\d\.json$/.test(f) && f >= since && f < today)
  .sort().map((f) => JSON.parse(fs.readFileSync(new URL(f, OUT), 'utf8')));
const sum = (k, pick = (d) => d) => all.reduce((o, d) => { for (const [x, n] of Object.entries(pick(d)[k])) o[x] = (o[x] || 0) + n; return o; }, {});
const top = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n);
const fmt = (n) => n.toLocaleString('de-DE');

console.log(`aidos.tech · ${all[0]?.day} bis ${all.at(-1)?.day} (${all.length} Tage) · Browser-Aufrufe = Obergrenze für Menschen\n`);
console.log(`Seitenaufrufe Browser: ${fmt(all.reduce((s, d) => s + d.views, 0))}  ·  Besucher (Summe der Tageswerte): ${fmt(all.reduce((s, d) => s + d.visitors, 0))}`);
console.log(`Bot-Aufrufe (verifiziert): ${fmt(all.reduce((s, d) => s + Object.values(d.bots).reduce((a, b) => a + b, 0), 0))}\n`);
console.log(`Davon DACH: ${fmt(all.reduce((s, d) => s + d.dach.views, 0))} Aufrufe · ${fmt(all.reduce((s, d) => s + d.dach.visitors, 0))} Besucher (Summe der Tageswerte)\n`);
console.log('Pro Tag (alle Aufrufe / Besucher · DACH Aufrufe / Besucher):');
for (const d of all) console.log(`  ${d.day}  ${String(d.views).padStart(5)} / ${String(d.visitors).padStart(4)}  ·  ${String(d.dach.views).padStart(4)} / ${String(d.dach.visitors).padStart(3)}  ${'▇'.repeat(d.dach.views)}`);
console.log('\nDACH Bereiche:'); for (const [k, n] of top(sum('sections', (d) => d.dach), 10)) console.log(`  ${String(n).padStart(6)}  ${k}`);
console.log('\nDACH Top-Seiten:'); for (const [k, n] of top(sum('pages', (d) => d.dach), 15)) console.log(`  ${String(n).padStart(6)}  ${k}`);
console.log('\nAlle Bereiche:'); for (const [k, n] of top(sum('sections'), 10)) console.log(`  ${String(n).padStart(6)}  ${k}`);
console.log('\nAlle Top-Seiten:'); for (const [k, n] of top(sum('pages'), 15)) console.log(`  ${String(n).padStart(6)}  ${k}`);
console.log('\nLänder:'); for (const [k, n] of top(sum('countries'), 6)) console.log(`  ${String(n).padStart(6)}  ${k}`);
console.log('\nGeräte:'); for (const [k, n] of top(sum('devices'), 4)) console.log(`  ${String(n).padStart(6)}  ${k}`);
console.log('\nBots nach Kategorie:'); for (const [k, n] of top(sum('bots'), 8)) console.log(`  ${String(n).padStart(6)}  ${k}`);
