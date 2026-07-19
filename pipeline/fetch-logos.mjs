// aidos — Brand-Logos (Favicons/Touch-Icons) zur BUILD-Zeit laden und selbst hosten.
// Nur für die Unternehmens-Profilseiten (Identifikation) — nie gehotlinkt (Styleguide).
// Quellen: kuratierte Domains der bekannten Ketten + im Datensatz erfasste Websites.
// Fehlschläge sind ok → die Seite fällt auf das aidos-Branchen-Icon zurück.
// Usage: node pipeline/fetch-logos.mjs   (vor pages.mjs)
import fs from 'node:fs';

const ROOT = new URL('..', import.meta.url);
const OUTDIR = new URL('dashboard/assets/logos/', ROOT);
fs.mkdirSync(OUTDIR, { recursive: true });

// Kuratierte Kandidaten-Domains je Kanon-Markenname (erste mit brauchbarem Icon gewinnt).
const CHAIN_DOMAINS = {
  'Holmes Place': ['holmesplace.de', 'holmesplace.com'],
  'McFIT': ['mcfit.com'],
  'FitX': ['fitx.de'],
  'clever fit': ['clever-fit.com'],
  'JOHN REED': ['johnreed.fitness'],
  'SuperFit': ['superfit.de'],
  'EVO Fitness': ['evofitness.de', 'evofitness.no'],
  'Aspria': ['aspria.com'],
  'AllDent Zahnzentrum': ['alldent.de', 'alldent-zahnzentrum.de'],
  'Autoland': ['autoland.de'],
  'McMakler': ['mcmakler.de'],
  'ibis budget': ['ibis.accor.com', 'all.accor.com'],
  'Motel One': ['motel-one.com'],
  "Mongo's": ['mongos.de'],
};

// Zusätzlich: im Datensatz erfasste Websites (extension capture) → gleiche Markenlogik wie pages.mjs.
const CHAIN_CANON = { 'holmes place': 'Holmes Place', 'mcfit': 'McFIT', 'fitx': 'FitX', 'clever fit': 'clever fit', 'john reed': 'JOHN REED', 'superfit': 'SuperFit', 'evo fitness': 'EVO Fitness', 'aspria': 'Aspria', 'alldent': 'AllDent Zahnzentrum', 'autoland': 'Autoland', 'mcmakler': 'McMakler', 'ibis budget': 'ibis budget', 'motel one': 'Motel One', "mongo's": "Mongo's", 'kult gemüse kebab': 'Kult Gemüse Kebab' };
const chainOf = (n) => { const l = (n || '').toLowerCase(); return Object.keys(CHAIN_CANON).find((c) => l.includes(c)) || null; };
const normName = (n) => (n || '').split(/ [-–] /)[0].trim();
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return null; } };
const slug = (s) => (s || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/&/g, ' und ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

const data = JSON.parse(fs.readFileSync(new URL('dashboard/data.js', ROOT), 'utf8').replace('window.AIDOS_DATA = ', '').replace(/;\s*$/, ''));
const candidates = new Map(Object.entries(CHAIN_DOMAINS));
for (const b of data) {
  if (!b.website || !b.name) continue;
  const ck = chainOf(b.name);
  const brand = ck ? CHAIN_CANON[ck] : normName(b.name);
  const h = hostOf(b.website);
  // Social-Profile als "Website" (Instagram & Co.) liefern nur das Plattform-Logo → nie verwenden
  if (!h || /(^|\.)(instagram|facebook|linktr|tiktok|youtube|x)\.(com|ee)$/i.test(h)) continue;
  const list = candidates.get(brand) || [];
  if (!list.includes(h)) candidates.set(brand, [...list, h]);
}

const UA = { 'user-agent': 'Mozilla/5.0 (compatible; aidos-build/1.0; +https://aidos.tech)' };
const get = (url) => fetch(url, { headers: UA, redirect: 'follow', signal: AbortSignal.timeout(10000) });

// Icon-Kandidaten einer Domain, beste Auflösung zuerst: apple-touch-icon > größtes <link icon> > /favicon.ico
async function iconUrls(domain) {
  const base = 'https://' + domain + '/';
  const out = [];
  try {
    const res = await get(base);
    const html = (await res.text()).slice(0, 200000);
    const links = [...html.matchAll(/<link[^>]+rel=["']?([^"'>\s]*(?:apple-touch-icon|icon)[^"'>\s]*)["']?[^>]*>/gi)].map((m) => {
      const tag = m[0];
      const href = (tag.match(/href=["']?([^"'\s>]+)/i) || [])[1];
      const sizes = parseInt((tag.match(/sizes=["']?(\d+)/i) || [])[1] || '0', 10);
      const apple = /apple-touch-icon/i.test(m[1]);
      return href ? { href: new URL(href, res.url || base).href, score: (apple ? 1000 : 0) + sizes } : null;
    }).filter(Boolean).sort((a, b) => b.score - a.score);
    out.push(...links.map((l) => l.href));
  } catch { /* Seite nicht erreichbar → nur Standardpfade probieren */ }
  out.push(base + 'apple-touch-icon.png', base + 'favicon.ico');
  return [...new Set(out)];
}

const EXT = { 'image/png': 'png', 'image/svg+xml': 'svg', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/x-icon': 'ico', 'image/vnd.microsoft.icon': 'ico', 'image/gif': 'gif' };

const manifest = {};
for (const [brand, domains] of candidates) {
  let saved = false;
  for (const domain of domains) {
    for (const url of await iconUrls(domain)) {
      try {
        const res = await get(url);
        if (!res.ok) continue;
        // Plattform-Icons (Instagram/Facebook-Profil als "Website") sind keine Markenlogos
        if (/cdninstagram\.com|fbcdn\.net|facebook\.com|linktr\.ee/i.test(res.url || url)) continue;
        const buf = Buffer.from(await res.arrayBuffer());
        const type = (res.headers.get('content-type') || '').split(';')[0].trim();
        const ext = EXT[type] || (url.match(/\.(png|svg|ico|jpe?g|webp|gif)(\?|$)/i) || [])[1]?.toLowerCase() || null;
        // Müll aussortieren: HTML-Fehlerseiten, leere Default-Icons
        if (!ext || buf.length < 900 || /^\s*</.test(buf.toString('utf8', 0, 20)) && ext !== 'svg') continue;
        const file = slug(brand) + '.' + ext;
        fs.writeFileSync(new URL(file, OUTDIR), buf);
        manifest[brand] = 'assets/logos/' + file;
        console.log('✓', brand, '←', url, `(${buf.length} B)`);
        saved = true; break;
      } catch { /* nächster Kandidat */ }
    }
    if (saved) break;
  }
  if (!saved) console.log('–', brand, '(kein Logo gefunden → Branchen-Icon)');
}

fs.writeFileSync(new URL('manifest.json', OUTDIR), JSON.stringify(manifest, null, 2) + '\n');
console.log(`\n${Object.keys(manifest).length}/${candidates.size} Logos gespeichert → dashboard/assets/logos/`);
