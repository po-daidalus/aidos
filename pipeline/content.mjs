// aidos.de — editorial content automation (template-only v1, deterministic & safe).
// Generates a monthly "DSA-Report" article page from the REAL aggregates — every number comes from
// the data, never from an LLM, never fabricated. Neutral wording + mandatory disclaimer baked in.
// Writes dashboard/report/YYYY-MM.html and dashboard/articles.js (homepage article index).
// (An optional LLM "Einordnung" pass can be added later behind a --llm flag with fact-verification.)
// Usage: node pipeline/content.mjs   (run after aggregate.mjs; before pages.mjs so it lands in sitemap)
import fs from 'node:fs';

const ROOT = new URL('..', import.meta.url);
const OUT = new URL('dashboard/', ROOT);
const agg = JSON.parse(fs.readFileSync(new URL('dashboard/aggregates.js', ROOT), 'utf8').replace('window.AIDOS_AGG = ', '').replace(/;\s*$/, ''));
const T = agg.totals || {};

const de = (n) => (n == null ? '–' : Number(n).toLocaleString('de-DE'));
const de1 = (n) => (n == null ? '–' : Number(n).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const slug = (s) => (s || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/&/g, ' und ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const EMO = { 'Fitness & Sport': '🏋️', 'Gesundheit': '⚕️', 'Recht & Beratung': '⚖️', 'Gastronomie & Hotel': '🍽️', 'Automobil': '🚗', 'Beauty & Wellness': '💇', 'Immobilien': '🏠', 'Einzelhandel': '🛍️', 'Sonstige': '🏢' };
const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const month = T.month || new Date().toISOString().slice(0, 7);
const [yy, mm] = month.split('-').map(Number);
const monthLabel = `${MONTHS[mm - 1]} ${yy}`;

const branches = agg.branches || [], cities = (agg.cities || []).filter((c) => c.n >= 3);
const topByIdx = [...branches].sort((a, b) => b.aidos_index - a.aidos_index)[0];
const lead = branches[0];
const topCity = cities[0];

// ---------- deterministic report body (all figures from real aggregates) ----------
const sections = [];
sections.push(`<p class="sub">Basismessung ${monthLabel}. Google hat bei <b>${de(T.businesses)}</b> untersuchten Profilen mit aktivem Lösch-Hinweis im vergangenen Jahr geschätzt <b>${de(T.removed)}</b> Bewertungen wegen Diffamierung entfernt. Alle Zahlen stammen von den öffentlichen Transparenz-Bannern von Google Maps.</p>`);

if (lead) sections.push(`<div class="card"><h2>Gastgewerbe und Autohandel führen</h2><p>Die meisten erfassten Entfernungen entfallen auf <b>${esc(lead.key)}</b> – rund <b>${de(Math.round(lead.removed))}</b> Bewertungen (${lead.share}&nbsp;% aller erfassten Entfernungen) über ${lead.n} Profile. <a href="../branche/${slug(lead.key)}.html">Zur Branchenseite →</a></p></div>`);

if (topByIdx) sections.push(`<div class="card"><h2>Höchste Auffälligkeit: ${esc(topByIdx.key)}</h2><p>Nach dem aidos-Index – der Zahl entfernter Bewertungen je Standort – ist <b>${esc(topByIdx.key)}</b> mit <b>${topByIdx.aidos_index}/100</b> die auffälligste Branche im Datensatz. Der Index ist eine neutrale statistische Kennzahl und kein Werturteil.</p></div>`);

if (T.capCount >= 1) sections.push(`<div class="card"><h2>Die Dunkelziffer</h2><p>Bei <b>${de(T.capCount)}</b> Profilen erreicht die Anzeige das Maximum „über 250". Dort deckelt Google die Zahl – die tatsächliche Menge entfernter Bewertungen liegt vermutlich höher und ist öffentlich nicht sichtbar.</p></div>`);

if (topCity) sections.push(`<div class="card"><h2>Regionaler Schwerpunkt: ${esc(topCity.key)}</h2><p>Der aktuelle Erhebungsschwerpunkt liegt auf <b>${esc(topCity.key)}</b> (${topCity.n} Profile, Auffälligkeits-Score ${de1(topCity.score)}/10). Die Erhebung wird auf weitere Städte ausgeweitet. <a href="../stadt/${slug(topCity.key)}.html">Zur Stadtseite →</a></p></div>`);

sections.push(`<table class="rank"><thead><tr><th>Branche</th><th>Entfernt (geschätzt)</th><th>aidos-Index</th></tr></thead><tbody>` +
  branches.map((b) => `<tr><td><a href="../branche/${slug(b.key)}.html">${esc(b.key)}</a></td><td class="num">${de(Math.round(b.removed))}</td><td class="num">${b.aidos_index}</td></tr>`).join('') + `</tbody></table>`);

const title = `DSA-Report ${monthLabel}: ${de(T.removed)} entfernte Google-Bewertungen | aidos`;
const desc = `DSA-Report ${monthLabel}: Google entfernte bei ${de(T.businesses)} Profilen geschätzt ${de(T.removed)} Bewertungen wegen Diffamierung. Auffälligste Branche: ${topByIdx ? topByIdx.key : '–'}.`;
const rel = `report/${month}.html`, BASE = 'https://aidos.tech';

const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/><title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}"/><link rel="canonical" href="${BASE}/${rel}"/>
<meta property="og:type" content="article"/><meta property="og:title" content="${esc(title)}"/><meta property="og:description" content="${esc(desc)}"/><meta name="twitter:card" content="summary_large_image"/>
<link href="../fonts/fonts.css" rel="stylesheet"/><link href="../pages.css" rel="stylesheet"/>
<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'NewsArticle', headline: title, datePublished: month + '-01', author: { '@type': 'Organization', name: 'aidos' }, publisher: { '@type': 'Organization', name: 'aidos' } })}</script></head>
<body><header class="masthead"><div class="masthead-inner">
<a class="wordmark" href="../index.html"><svg class="glyph" viewBox="0 0 26 26" aria-hidden="true"><rect x="3" y="8" width="20" height="2.6" rx="1" fill="#171719"/><rect x="3" y="15" width="12" height="2.6" rx="1" fill="#b31e26"/></svg>aidos<span class="tld">.tech</span></a>
<nav class="nav"><a href="../index.html">Übersicht</a><a href="../listing.html">Unternehmen &amp; Ketten</a><a href="../ueber-aidos.html">Über aidos</a><a href="../rechtslage.html">Rechtslage</a></nav></div></header>
<div class="wrap"><div class="crumbs"><a href="../index.html">aidos</a> › DSA-Report › ${monthLabel}</div>
<div class="kicker">DSA-Report · automatisch aus den Daten erstellt, redaktionell verantwortet</div>
<h1>DSA-Report ${monthLabel}</h1><span class="motif"><b></b><i></i></span>
${sections.join('\n')}
<div class="notice"><b>Methodik &amp; Hinweis:</b> Dieser Report wird automatisch aus den erfassten Aggregatdaten erzeugt; alle Zahlen stammen aus den öffentlichen Google-Maps-Transparenz-Bannern (rollierende 365 Tage). Eine hohe Zahl entfernter Bewertungen ist <b>kein</b> Beweis für unlauteres Verhalten – Unternehmen sind häufig Ziel unberechtigter Fake-Bewertungskampagnen. Es werden keine Namen von Einzelpersonen genannt.</div>
</div>
<footer class="site-foot"><div class="site-foot-inner">
<a class="wordmark" href="../index.html"><svg class="glyph" viewBox="0 0 26 26" aria-hidden="true"><rect x="3" y="8" width="20" height="2.6" rx="1" fill="#fff"/><rect x="3" y="15" width="12" height="2.6" rx="1" fill="#b31e26"/></svg>aidos<span class="tld">.tech</span></a>
<div class="foot-nav"><a href="../index.html">Übersicht</a><a href="../listing.html">Unternehmen &amp; Ketten</a><a href="../ueber-aidos.html">Über aidos</a><a href="../rechtslage.html">Rechtslage</a><a href="../impressum.html">Impressum</a><a href="../impressum.html#datenschutz">Datenschutz</a><a href="../daten-melden.html">Daten melden</a></div>
<div class="foot-meta">Automatisch generiert aus den Aggregatdaten · keine Rechtsberatung · © 2026 aidos</div>
</div></footer>
</body></html>`;

fs.mkdirSync(new URL('report/', OUT), { recursive: true });
fs.writeFileSync(new URL(rel, OUT), html);

// homepage article index: the fresh monthly report first, then the evergreen explainers
// data-viz cover: bar heights from the real branch distribution (no photos, no stock)
const maxRem = Math.max(1, ...branches.map((b) => b.removed || 0));
const bars = branches.slice(0, 7).map((b) => Math.max(12, Math.round((100 * (b.removed || 0)) / maxRem)));
const articles = [
  { title: `DSA-Report ${monthLabel}`, teaser: `Google entfernte bei ${de(T.businesses)} Profilen geschätzt ${de(T.removed)} Bewertungen. Auffälligste Branche: ${topByIdx ? topByIdx.key : '–'}.`, url: rel, tag: 'Report', bars },
];
fs.writeFileSync(new URL('articles.js', OUT), 'window.AIDOS_ARTICLES = ' + JSON.stringify(articles) + ';\n');

console.log(`content: wrote ${rel} (${sections.length} sections) + articles.js`);
