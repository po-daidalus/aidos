// aidos.de — pre-render REAL static pages per company / branch / city (+ sitemap + robots).
// Fixes the "client-rendered, zero indexable content, profiles-as-modals" SEO problem: every entity
// gets a crawlable URL with server-rendered numbers, unique <title>/meta/OG and JSON-LD, and a
// crawlable internal link graph (branch pages list companies; company pages link to branch/city).
// Only NAMEABLE, non-suppressed entities are written — never an individual, never fabricated data.
// Usage: node pipeline/pages.mjs   (run after ingest → aggregate → build)
import fs from 'node:fs';

const ROOT = new URL('..', import.meta.url);
const BASE = 'https://aidos.tech'; // final domain (adjust if it changes)
const OUT = new URL('dashboard/', ROOT);
// Read the SAME data the site ships: data.js is already nameable-only, suppressed, and scored.
const nameableAll = JSON.parse(fs.readFileSync(new URL('dashboard/data.js', ROOT), 'utf8').replace('window.AIDOS_DATA = ', '').replace(/;\s*$/, ''));
const agg = JSON.parse(fs.readFileSync(new URL('dashboard/aggregates.js', ROOT), 'utf8').replace('window.AIDOS_AGG = ', '').replace(/;\s*$/, ''));

const slug = (s) => (s || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/&/g, ' und ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const de = (n) => (n == null ? '–' : Number(n).toLocaleString('de-DE'));
const de1 = (n) => (n == null ? '–' : Number(n).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
const mid = (b) => (b.range_min != null ? (b.range_min + (b.range_max || b.range_min)) / 2 : 0);
const rangeLabel = (mn, mx) => (mn == null ? '?' : mx == null ? 'über ' + mn : mn + '–' + mx);
// Honest aggregate range across locations: if ANY location is capped ("über N"), the true total is
// unbounded → "über {sum of minima}". Never invent a false closed range (e.g. "250–250"). For
// multi-location brands the figure is the SUM of Google's per-location ranges, flagged as such.
function aggRange(locs) {
  const min = locs.reduce((s, d) => s + (d.range_min || 0), 0);
  const anyCap = locs.some((d) => d.range_min != null && d.range_max == null);
  const max = locs.reduce((s, d) => s + (d.range_max || d.range_min || 0), 0);
  const label = anyCap ? 'über ' + min : (min === max ? String(min) : min + '–' + max);
  return { label, min, max: anyCap ? null : max, multi: locs.length > 1 };
}
const EMO = { 'Fitness & Sport': '🏋️', 'Gesundheit': '⚕️', 'Recht & Beratung': '⚖️', 'Gastronomie & Hotel': '🍽️', 'Automobil': '🚗', 'Handwerk & Bau': '🔧', 'Beauty & Wellness': '💇', 'Immobilien': '🏠', 'Einzelhandel': '🛍️', 'Sonstige': '🏢' };
const scoreCol = (s) => (s == null ? '#9aa0a6' : s >= 70 ? '#1967d2' : s >= 40 ? '#5b8dd6' : '#9db9e3');

// ---------- shared shell ----------
function shell({ title, desc, canonical, jsonld, body, active = 'listing' }) {
  // `active` marks the current section in the header nav (entity/branch/city pages
  // all live under the listing section; reports pass their own value).
  const on = (k) => (active === k ? ' class="on"' : '');
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}"/>
<link rel="canonical" href="${esc(canonical)}"/>
<meta property="og:type" content="article"/><meta property="og:title" content="${esc(title)}"/>
<meta property="og:description" content="${esc(desc)}"/><meta property="og:url" content="${esc(canonical)}"/>
<meta property="og:site_name" content="aidos"/><meta name="twitter:card" content="summary_large_image"/>
<link href="../fonts/fonts.css" rel="stylesheet"/><link href="../pages.css" rel="stylesheet"/>
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld)}</script>` : ''}</head>
<body><div class="appbar"><div class="appbar-inner">
<a class="logo" href="../index.html"><span class="b">a</span><span class="i">i</span><span class="d">d</span><span class="o">o</span><span class="s">s</span></a>
<nav class="nav"><a${on('index')} href="../index.html">Übersicht</a><a${on('listing')} href="../listing.html">Unternehmen &amp; Ketten</a><a${on('ueber')} href="../ueber-aidos.html">Über aidos</a><a${on('recht')} href="../rechtslage.html">Rechtslage</a></nav>
</div></div><div class="wrap">${body}
<footer><a href="../index.html">Übersicht</a><a href="../listing.html">Unternehmen &amp; Ketten</a><a href="../ueber-aidos.html">Über aidos</a><a href="../rechtslage.html">Rechtslage</a><a href="../impressum.html">Impressum</a><a href="../impressum.html#datenschutz">Datenschutz</a><a href="../daten-melden.html">Daten melden</a><br/><br/>
Quelle: öffentliche Google-Maps-Profile (Hinweis „… Bewertungen aufgrund von Beschwerden wegen Diffamierung entfernt"). Eine hohe Zahl entfernter Bewertungen ist <b>kein</b> Beweis für unlauteres Verhalten. Keine Rechtsberatung. © 2026 aidos</footer>
</div></body></html>`;
}
const crumbs = (items) => `<div class="crumbs">${items.map((i, n) => (i.href ? `<a href="${i.href}">${esc(i.t)}</a>` : esc(i.t)) + (n < items.length - 1 ? ' › ' : '')).join('')}</div>`;
const breadcrumbLd = (items) => ({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items.map((i, n) => ({ '@type': 'ListItem', position: n + 1, name: i.t, item: BASE + '/' + (i.abs || '') })) });
const disclaimer = '<div class="notice"><b>Hinweis:</b> Die Zahl entfernter Bewertungen stammt von Google&nbsp;LLC (öffentliches Google-Maps-Profil, rollierende 365 Tage). Sie bedeutet <b>nicht</b>, dass das Unternehmen rechtswidrig gehandelt hat – Unternehmen sind häufig Ziel unberechtigter Fake-Bewertungskampagnen. Werte inkl. entfernter Rezensionen sind rechnerische Schätzungen, keine Tatsachenbehauptungen. <a href="../daten-melden.html">Daten melden / korrigieren</a>.</div>';

// ---------- group nameable businesses into brands (mirror listing.html) ----------
const normName = (n) => (n || '').split(/ [-–] /)[0].trim();
const rootDomain = (u) => { try { const h = new URL(u).hostname.replace(/^www\./, ''); const p = h.split('.'); return p.length > 2 ? p.slice(-2).join('.') : h; } catch { return null; } };
const brandKey = (b) => (b.website && rootDomain(b.website)) || normName(b.name).toLowerCase() || b.place_id;

const nameable = nameableAll.filter((b) => b.name);
const brandsAll = new Map();
for (const b of nameable) { const k = brandKey(b); (brandsAll.get(k) || brandsAll.set(k, []).get(k)).push(b); }

// Naming policy (mirrors listing.html isListable): public pages name only chains
// (≥2 locations), legal persons (GmbH, AG …), known chain brands, or larger
// single-site operations (≥400 reviews). Everything else stays in the anonymized
// aggregates — promised on ueber-aidos.html and impressum.html.
const LEGAL_FORM_RE = /\b(g?GmbH|mbH|UG|AG|KGaA|KG|OHG|SE|e\.?\s?K\.?|e\.?\s?G\.?|Ltd|Limited|Inc|PartG(?:mbB)?)\b/i;
const CHAIN_NAMES = ['holmes place', 'mcfit', 'fitx', 'clever fit', 'john reed', 'fitness first', 'kieser', 'aspria', 'vapiano', "l'osteria", 'hans im glück', 'peter pane', 'dean & david', 'block house', 'nordsee', 'starbucks', 'mcdonald', 'burger king', 'kfc', 'subway', 'motel one', 'ibis', 'novotel', 'mercure', 'premier inn', 'meininger', 'leonardo', 'radisson', 'hilton', 'a&o', 'mcmakler', 'autoland', 'rossmann', 'edeka', 'rewe', 'aldi', 'lidl', 'citroën', 'citroen'];
function isListable(locs) {
  if (locs.length >= 2) return true;
  const d = locs[0], n = (d.name || '').toLowerCase();
  if (LEGAL_FORM_RE.test(d.name || '')) return true;
  if (CHAIN_NAMES.some((k) => n.includes(k))) return true;
  return locs.reduce((s, x) => s + (x.reviews || 0), 0) >= 400;
}
const brands = new Map([...brandsAll].filter(([, locs]) => isListable(locs)));
const skipped = brandsAll.size - brands.size;

const wavg = (locs, f) => { const r = locs.filter((d) => f(d) != null); const w = r.reduce((s, d) => s + (d.reviews || 0), 0); return w ? r.reduce((s, d) => s + f(d) * (d.reviews || 0), 0) / w : (r.length ? r.reduce((s, d) => s + f(d), 0) / r.length : null); };

// Clean output dirs first: entities can drop out (naming policy, takedowns) and
// their stale pages must not survive a rebuild.
for (const dir of ['unternehmen/', 'branche/', 'stadt/']) {
  fs.rmSync(new URL(dir, OUT), { recursive: true, force: true });
  fs.mkdirSync(new URL(dir, OUT), { recursive: true });
}

const urls = []; const usedSlugs = new Set();
const lookup = []; // compact client-side search index (homepage "Prüfe ein Unternehmen")
const pageMap = {}; // brandKey → relative page url (listing cards link to real pages)
function uniqueSlug(base) { let s = base || 'eintrag', i = 2; while (usedSlugs.has(s)) s = base + '-' + i++; usedSlugs.add(s); return s; }

// ---------- company pages ----------
const companyLinks = {}; // brandName → relative url (for branch/city listings)
for (const [bkey, locs] of brands) {
  const name = normName(locs[0].name) || locs[0].name;
  const cities = [...new Set(locs.map((d) => d.city).filter(Boolean))];
  const branch = locs.map((d) => d.branch).find(Boolean) || 'Sonstige';
  const ar = aggRange(locs); const remMin = ar.min, remMax = ar.max;
  const sumNote = ar.multi ? ' (Summe aller Standorte)' : '';
  const rating = wavg(locs, (d) => d.rating), est = wavg(locs, (d) => d.est_mid);
  const score = Math.max(...locs.map((d) => d.aidos_score ?? 0));
  const sg = uniqueSlug(slug(name + (cities[0] ? '-' + cities[0] : '')));
  const rel = 'unternehmen/' + sg + '.html'; companyLinks[name] = rel;
  const canonical = BASE + '/' + rel;
  const title = `${name}: ${ar.label} entfernte Google-Bewertungen | aidos`;
  const desc = `Laut dem Transparenz-Hinweis von Google Maps wurden bei ${name}${cities.length ? ' (' + cities.join(', ') + ')' : ''} im vergangenen Jahr ${ar.label} Bewertungen wegen Diffamierung entfernt${sumNote}. Branche: ${branch}. aidos-Score ${score}/100.`;
  const hasEst = est != null && rating != null && est <= rating;
  const locList = locs.length > 1 ? `<div class="card"><h2>${locs.length} Standorte</h2><div class="loc-list">${locs.slice().sort((a, b) => (b.range_min || 0) - (a.range_min || 0)).map((d) => `<span class="chip">${esc((d.name || '').split(/ [-–] /).slice(1).join(' – ') || d.city || 'Standort')}: ${rangeLabel(d.range_min, d.range_max)}</span>`).join('')}</div></div>` : '';
  const primary = locs.length === 1 && locs[0].lat && locs[0].lng ? locs[0] : null;
  const mapsUrl = (locs[0].url) || 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(name + ' ' + (cities[0] || ''));
  const body = crumbs([{ t: 'aidos', href: '../index.html', abs: '' }, { t: branch, href: '../branche/' + slug(branch) + '.html', abs: 'branche/' + slug(branch) + '.html' }, { t: name }]) +
    `<div class="kicker">${EMO[branch] || ''} ${esc(branch)}${cities.length ? ' · ' + esc(cities.join(', ')) : ''}</div>` +
    `<h1>${esc(name)}</h1>` +
    `<p class="sub">Google hat bei ${locs.length > 1 ? 'diesen Standorten' : 'diesem Unternehmen'} im vergangenen Jahr <b>${rangeLabel(remMin, remMax)}</b> Bewertungen wegen Diffamierung entfernt.</p>` +
    `<a class="maps-link" href="${esc(mapsUrl)}" target="_blank" rel="noopener">Auf Google Maps ansehen ↗</a>` +
    `<div class="grid">` +
    `<div class="stat"><div class="v red">${rangeLabel(remMin, remMax)}</div><div class="l">entfernte Bewertungen (letzte 365 Tage)</div></div>` +
    `<div class="stat"><div class="v">${rating != null ? de1(rating) + '★' : '–'}</div><div class="l">aktuell angezeigte Bewertung</div></div>` +
    `<div class="stat"><div class="v">${de(locs.reduce((s, d) => s + (d.reviews || 0), 0))}</div><div class="l">sichtbare Bewertungen</div></div>` +
    `<div class="stat"><div class="v" style="color:${scoreCol(score)}">${score}</div><div class="l">aidos-Score (0–100, Perzentil im Datensatz)</div></div>` +
    `</div>` +
    (hasEst ? `<div class="card"><h2>Was-wäre-wenn: Bewertung inkl. der entfernten Rezensionen</h2><p class="est-line">Wenn man annimmt, dass die entfernten Rezensionen 1–2★ hatten, läge die Bewertung rechnerisch bei <b>~${de1(est)}★</b> statt der angezeigten <b>${de1(rating)}★</b>. Nur eine Schätzung – keine exakten Werte.</p></div>` : '') +
    locList +
    (primary ? `<a class="map-snip" href="${esc(mapsUrl)}" target="_blank" rel="noopener"><img src="https://staticmap.openstreetmap.de/staticmap.php?center=${primary.lat},${primary.lng}&zoom=15&size=900x150&markers=${primary.lat},${primary.lng},red-pushpin" alt="Kartenausschnitt" loading="lazy"/><span class="map-attr">© OpenStreetMap-Mitwirkende</span></a>` : '') +
    disclaimer +
    `<p style="font-size:13px;color:var(--g700)">Mehr: <a href="../branche/${slug(branch)}.html">alle ${esc(branch)}-Einträge</a>${cities[0] ? ` · <a href="../stadt/${slug(cities[0])}.html">${esc(cities[0])}</a>` : ''} · <a href="../rechtslage.html">Warum werden Bewertungen entfernt?</a></p>`;
  const jsonld = breadcrumbLd([{ t: 'aidos', abs: '' }, { t: branch, abs: 'branche/' + slug(branch) + '.html' }, { t: name, abs: rel }]);
  fs.writeFileSync(new URL(rel, OUT), shell({ title, desc, canonical, jsonld, body }));
  urls.push({ loc: canonical, removed: (remMin + remMax) / 2 });
  lookup.push({ n: name, c: cities.join(', '), u: rel, r: rangeLabel(remMin, remMax), s: score, b: branch });
  pageMap[bkey] = rel;
  // store brand summary for branch/city listings
  locs._brand = { name, rel, remMin, remMax, cities, branch, score, rating };
}

// helper: list of brands sorted by removed, optionally filtered
const allBrands = [...brands.values()].map((locs) => locs._brand);
function brandTable(list) {
  return `<table class="rank"><thead><tr><th>Unternehmen</th><th>Stadt</th><th>Entfernt (365 T.)</th><th>aidos-Score</th></tr></thead><tbody>` +
    list.map((b) => `<tr><td><a href="../${b.rel}">${esc(b.name)}</a></td><td>${esc(b.cities.join(', '))}</td><td>${rangeLabel(b.remMin, b.remMax)}</td><td style="color:${scoreCol(b.score)};font-weight:500">${b.score}</td></tr>`).join('') +
    `</tbody></table>`;
}

// ---------- branch pages ----------
for (const br of agg.branches) {
  const sg = slug(br.key), rel = 'branche/' + sg + '.html', canonical = BASE + '/' + rel;
  const list = allBrands.filter((b) => b.branch === br.key).sort((a, b) => (b.remMin + b.remMax) - (a.remMin + a.remMax));
  const title = `${br.key}: entfernte Google-Bewertungen im Vergleich | aidos`;
  const desc = `${br.key} in der Auswertung: geschätzt ${de(Math.round(br.removed))} entfernte Bewertungen, aidos-Index ${br.aidos_index}/100. ${list.length} gelistete Unternehmen & Ketten.`;
  const body = crumbs([{ t: 'aidos', href: '../index.html', abs: '' }, { t: 'Branchen' }, { t: br.key }]) +
    `<div class="kicker">${EMO[br.key] || ''} Branche</div><h1>${esc(br.key)}</h1>` +
    `<p class="sub">Geschätzt <b>${de(Math.round(br.removed))}</b> entfernte Bewertungen über ${br.n} erfasste Profile. aidos-Index <b>${br.aidos_index}/100</b>.</p>` +
    `<div class="grid"><div class="stat"><div class="v red">${de(Math.round(br.removed))}</div><div class="l">geschätzt entfernte Bewertungen</div></div>` +
    `<div class="stat"><div class="v">${br.n}</div><div class="l">erfasste Profile</div></div>` +
    `<div class="stat"><div class="v" style="color:${scoreCol(br.aidos_index)}">${br.aidos_index}</div><div class="l">aidos-Index (Auffälligkeit der Branche)</div></div>` +
    `<div class="stat"><div class="v">${br.share} %</div><div class="l">Anteil an allen Entfernungen</div></div></div>` +
    (list.length ? `<div class="card"><h2>Gelistete Unternehmen &amp; Ketten (${list.length})</h2>${brandTable(list)}</div>` : '') +
    disclaimer + `<p style="font-size:13px;color:var(--g700)"><a href="../index.html">← Alle Branchen &amp; Städte</a></p>`;
  fs.writeFileSync(new URL(rel, OUT), shell({ title, desc, canonical, jsonld: breadcrumbLd([{ t: 'aidos', abs: '' }, { t: br.key, abs: rel }]), body }));
  urls.push({ loc: canonical, removed: br.removed });
}

// ---------- city pages ----------
for (const c of agg.cities.filter((c) => c.n >= 3)) {
  const sg = slug(c.key), rel = 'stadt/' + sg + '.html', canonical = BASE + '/' + rel;
  const list = allBrands.filter((b) => b.cities.includes(c.key)).sort((a, b) => (b.remMin + b.remMax) - (a.remMin + a.remMax));
  const title = `Entfernte Google-Bewertungen in ${c.key} | aidos`;
  const desc = `${c.key}: geschätzt ${de(Math.round(c.removed))} entfernte Bewertungen über ${c.n} erfasste Profile. Auffälligkeits-Score ${de1(c.score)}/10. Hotspot: ${(c.hotspot || []).join(', ')}.`;
  const body = crumbs([{ t: 'aidos', href: '../index.html', abs: '' }, { t: 'Städte' }, { t: c.key }]) +
    `<div class="kicker">📍 Stadt</div><h1>Entfernte Bewertungen in ${esc(c.key)}</h1>` +
    `<p class="sub">Geschätzt <b>${de(Math.round(c.removed))}</b> entfernte Bewertungen über ${c.n} erfasste Profile. Auffälligkeits-Score <b>${de1(c.score)}/10</b>${c.hotspot && c.hotspot.length ? `, Schwerpunkt <b>${esc(c.hotspot.join(' & '))}</b>` : ''}.</p>` +
    (list.length ? `<div class="card"><h2>Gelistete Unternehmen &amp; Ketten (${list.length})</h2>${brandTable(list)}</div>` : '') +
    disclaimer + `<p style="font-size:13px;color:var(--g700)"><a href="../index.html">← Übersicht</a></p>`;
  fs.writeFileSync(new URL(rel, OUT), shell({ title, desc, canonical, jsonld: breadcrumbLd([{ t: 'aidos', abs: '' }, { t: c.key, abs: rel }]), body }));
  urls.push({ loc: canonical, removed: c.removed });
}

// include auto-generated monthly report pages (from content.mjs) in the sitemap
try { for (const f of fs.readdirSync(new URL('report/', OUT))) if (f.endsWith('.html')) urls.push({ loc: BASE + '/report/' + f, removed: 1e9 }); } catch { /* no reports yet */ }

// ---------- sitemap + robots ----------
const staticPages = ['index.html', 'listing.html', 'ueber-aidos.html', 'rechtslage.html', 'impressum.html', 'daten-melden.html'];
const today = new Date().toISOString().slice(0, 10);
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  staticPages.map((p) => `  <url><loc>${BASE}/${p === 'index.html' ? '' : p}</loc><lastmod>${today}</lastmod></url>`).join('\n') + '\n' +
  urls.sort((a, b) => b.removed - a.removed).map((u) => `  <url><loc>${u.loc}</loc><lastmod>${today}</lastmod></url>`).join('\n') +
  `\n</urlset>\n`;
fs.writeFileSync(new URL('sitemap.xml', OUT), sitemap);
fs.writeFileSync(new URL('robots.txt', OUT), `User-agent: *\nAllow: /\nSitemap: ${BASE}/sitemap.xml\n`);

// client-side search index + brandKey→page map (consumed by index.html lookup + listing.html cards)
lookup.sort((a, b) => b.s - a.s);
fs.writeFileSync(new URL('lookup.js', OUT), 'window.AIDOS_LOOKUP = ' + JSON.stringify(lookup) + ';\n');
fs.writeFileSync(new URL('pagemap.js', OUT), 'window.AIDOS_PAGES = ' + JSON.stringify(pageMap) + ';\n');

console.log(`pages: ${brands.size} companies (${skipped} below naming threshold → aggregates only), ${agg.branches.length} branches, ${agg.cities.filter((c) => c.n >= 3).length} cities | sitemap: ${urls.length + staticPages.length} URLs | lookup index: ${lookup.length}`);
