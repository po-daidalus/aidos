// aidos.de — Germany-wide aggregation & insight engine for the homepage dashboard.
// Reads the anonymized aggregate feed (pipeline/out/aggregate.jsonl — NO personal identifiers)
// and derives industry/city statistics plus auto-generated, data-grounded "newspaper" insights.
// Trend-over-time insights activate automatically once ≥2 monthly snapshots exist (Method D).
// Output: dashboard/aggregates.js (window.AIDOS_AGG). Usage: node pipeline/aggregate.mjs
import fs from 'node:fs';

const ROOT = new URL('..', import.meta.url);
const AGG_PATH = new URL('pipeline/out/aggregate.jsonl', ROOT);
const rows = fs.existsSync(AGG_PATH)
  ? fs.readFileSync(AGG_PATH, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))
  : [];

const nowYM = new Date().toISOString().slice(0, 7);
const mid = (r) => (r.range_min != null ? (r.range_min + (r.range_max ?? r.range_min)) / 2 : 0);
const isCap = (r) => r.range_min >= 250 && (r.range_max == null); // "über 250" — display maximum hit
const r0 = (x) => Math.round(x);
const r1 = (x) => Math.round(x * 10) / 10;
const de = (x) => r0(x).toLocaleString('de-DE');
const de1 = (x) => r1(x).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

// --- cross-section (the rolling cross-section) = latest observation PER entity ---
// NOT rows.filter(date === latest): that would drop every city scraped in an earlier month the
// moment a new month's sweep begins (Berlin ingested July would vanish once Köln lands in August),
// conflating coverage growth with real change. Instead take each aid's most recent snapshot, and
// drop observations older than STALE_MONTHS so a city we stopped re-scraping doesn't linger forever.
const months = [...new Set(rows.map((r) => r.date))].sort();
const latest = months[months.length - 1] || nowYM;
const STALE_MONTHS = 4;
const monthIdx = (ym) => { const [y, m] = ym.split('-').map(Number); return y * 12 + (m - 1); };
const latestIdx = monthIdx(latest);
const latestByAid = new Map();
for (const r of rows) { const p = latestByAid.get(r.aid); if (!p || r.date > p.date) latestByAid.set(r.aid, r); }
const cur = [...latestByAid.values()].filter((r) => latestIdx - monthIdx(r.date) <= STALE_MONTHS);

function group(list, key) {
  const m = {};
  for (const r of list) {
    const k = r[key] || 'Unbekannt';
    (m[k] ||= { key: k, n: 0, removed: 0, cap: 0, dropSum: 0, dropN: 0 });
    const g = m[k];
    g.n++; g.removed += mid(r); if (isCap(r)) g.cap++;
    if (r.rating_drop != null) { g.dropSum += r.rating_drop; g.dropN++; }
  }
  return Object.values(m).map((g) => ({ ...g, perLoc: g.n ? g.removed / g.n : 0, avgDrop: g.dropN ? g.dropSum / g.dropN : null }));
}

const branchesAll = group(cur, 'branch').sort((a, b) => b.removed - a.removed);
const branches = branchesAll.filter((b) => b.key !== 'Unbekannt');
const cities = group(cur, 'city').filter((c) => c.key !== 'Unbekannt').sort((a, b) => b.removed - a.removed);

// aidos-Index (branch level): neutral 0–100 conspicuousness of an industry by removed reviews per
// location, normalised so the most conspicuous industry in the dataset = 100. Purely descriptive.
const maxPerLoc = Math.max(1, ...branches.map((b) => b.perLoc));
branches.forEach((b) => (b.aidos_index = Math.round((100 * b.perLoc) / maxPerLoc)));

const totalRemoved = cur.reduce((s, r) => s + mid(r), 0);
const totalCap = cur.filter(isCap).length;
const drops = cur.filter((r) => r.rating_drop != null);
const avgDrop = drops.length ? drops.reduce((s, r) => s + r.rating_drop, 0) / drops.length : null;

// branch share of total removals (for the ranking table)
branches.forEach((b) => (b.share = totalRemoved ? Math.round((100 * b.removed) / totalRemoved) : 0));

// per-city: conspicuousness score (0–10) + industry "hotspot" (top branch by removals in that city)
const hotspotOf = (cityKey) => {
  const g = group(cur.filter((r) => (r.city || 'Unbekannt') === cityKey), 'branch').filter((x) => x.key !== 'Unbekannt').sort((a, b) => b.removed - a.removed);
  return g.slice(0, 2).map((x) => x.key);
};
const maxCityPer = Math.max(1, ...cities.map((c) => c.perLoc));
cities.forEach((c) => { c.hotspot = hotspotOf(c.key); c.score = Math.round((100 * c.perLoc) / maxCityPer) / 10; });

// The cross-section is NOT one month's snapshot: it takes each entity's most recent observation,
// so a city not re-scanned this month still carries last month's figure. Labelling the whole thing
// with a single month ("Basismessung 2026-08") claimed a freshness 42% of the rows did not have —
// and "Basismessung" moved to the newest month every run, which is the opposite of a baseline.
// Report the actual span plus how much of it was re-measured in the newest month.
const curMonths = [...new Set(cur.map((r) => r.date))].sort();
const totals = {
  month: latest, businesses: cur.length, nameable: cur.filter((r) => r.nameable).length,
  spanFrom: curMonths[0] || latest, spanTo: curMonths[curMonths.length - 1] || latest,
  freshN: cur.filter((r) => r.date === latest).length, // re-measured in the newest month
  removed: r0(totalRemoved), capCount: totalCap, industries: branches.length, cities: cities.length,
  avgDrop: avgDrop != null ? r1(avgDrop) : null,
};
// "Juli–August 2026" / "August 2026" — the honest label for a rolling survey.
const monthName = (ym, lang) => new Date(ym + '-01T00:00:00Z').toLocaleDateString(lang === 'en' ? 'en-GB' : 'de-DE', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const spanLabel = (lang) => (totals.spanFrom === totals.spanTo
  ? monthName(totals.spanTo, lang)
  : monthName(totals.spanFrom, lang).replace(/ \d{4}$/, '') + '–' + monthName(totals.spanTo, lang));

// --- insight engine: build candidate insights, score by "interestingness", keep the strongest ---
const insights = [];
const add = (score, tag, headline, body, stat) => insights.push({ score, tag, headline, body, stat });

// 1) Head figure
add(100, 'Gesamtbild',
  `Google entfernte bei ${de(cur.length)} untersuchten Unternehmen geschätzt ${de(totalRemoved)} Bewertungen wegen Diffamierung`,
  `Erhebungsstand ${spanLabel('de')}. Jeder Eintrag trägt sein eigenes Stand-Datum; ${de(totals.freshN)} der ${de(cur.length)} Profile wurden im ${monthName(latest, 'de')} nachgemessen. Die Zahlen sind eine konservative Untergrenze: Google zeigt nur die letzten 365 Tage und nur Spannen (z. B. „151 bis 200").`,
  de(totalRemoved));

// 2) Strongest rating distortion by industry (avgDrop vs overall)
const overallDrop = avgDrop || 0;
for (const b of branches.filter((b) => b.dropN >= 2 && b.avgDrop != null)) {
  const factor = overallDrop ? b.avgDrop / overallDrop : 0;
  if (b.avgDrop >= 0.3 && factor >= 1.3) {
    add(60 + b.avgDrop * 30 + factor * 5, 'Bewertungsverzerrung',
      `${b.key}: die angezeigte Bewertung liegt geschätzt ${de1(b.avgDrop)}★ über dem um Entfernungen bereinigten Wert`,
      `Rechnet man die entfernten Bewertungen mit ein, wäre die Durchschnittsnote in dieser Branche rund ${de1(b.avgDrop)}★ niedriger — das ${de1(factor)}-fache des Branchendurchschnitts (${de1(overallDrop)}★). Ein Hinweis, dass Entfernungen hier die öffentliche Wahrnehmung besonders stark verschieben.`,
      `+${de1(b.avgDrop)}★`);
  }
}

// 2b) aidos-Index — most conspicuous industry
if (branches.length) {
  const top = [...branches].sort((a, b) => b.aidos_index - a.aidos_index)[0];
  add(72, 'aidos-Index',
    `${top.key} ist nach dem aidos-Index die auffälligste Branche (${top.aidos_index}/100)`,
    `Der aidos-Index misst neutral die Zahl entfernter Bewertungen pro Standort im Branchenvergleich — 100 = auffälligste Branche im erfassten Datensatz, kein Werturteil.`,
    `${top.aidos_index}`);
}

// 3) Highest removals per location
if (branches.length) {
  const top = [...branches].sort((a, b) => b.perLoc - a.perLoc)[0];
  if (top && top.n >= 3) {
    const rest = branches.filter((b) => b.key !== top.key);
    const restAvg = rest.length ? rest.reduce((s, b) => s + b.perLoc, 0) / rest.length : 0;
    add(70 + top.perLoc / 5, 'Branchenvergleich',
      `Pro Standort entfernte Google bei ${top.key} im Schnitt ~${de(top.perLoc)} Bewertungen`,
      `Das ist ${restAvg ? de1(top.perLoc / restAvg) + '-mal' : 'deutlich'} so viel wie im Mittel der übrigen Branchen (~${de(restAvg)}). Betrachtet werden ${top.n} Standorte dieser Branche.`,
      `~${de(top.perLoc)}`);
  }
}

// 4) Share of total by leading industry
if (branches.length && totalRemoved > 0) {
  const lead = branches[0];
  const share = (lead.removed / totalRemoved) * 100;
  if (share >= 20) add(55 + share, 'Verteilung',
    `${lead.key} steht für rund ${r0(share)} % aller erfassten Entfernungen`,
    `Von geschätzt ${de(totalRemoved)} entfernten Bewertungen entfallen ~${de(lead.removed)} auf diese eine Branche (${lead.n} Standorte) — die größte Einzelgruppe im Datensatz.`,
    `${r0(share)} %`);
}

// 5) Display-cap ("über 250") businesses — the true number is hidden above this
if (totalCap >= 1) add(50 + totalCap * 3, 'Dunkelziffer',
  `${de(totalCap)} Unternehmen haben das Anzeige-Maximum „über 250" erreicht`,
  `Bei diesen Einträgen deckelt Google die Anzeige — die tatsächliche Zahl entfernter Bewertungen liegt vermutlich deutlich höher und ist öffentlich nicht sichtbar.`,
  `>250`);

// 6) City focus (once we have city data)
if (cities.length) {
  const c = cities[0];
  add(45, 'Regional',
    `${c.key}: ~${de(c.removed)} entfernte Bewertungen bei ${c.n} untersuchten Unternehmen`,
    `${c.key} ist der aktuelle Schwerpunkt der Datenerhebung. Weitere Städte folgen, sodass sich Regionen künftig vergleichen lassen.`,
    de(c.removed));
}

// --- trend module (Method D): activates with ≥2 months ---
// Ein Monatsvergleich braucht ein Panel, das die Erhebung trägt. Der Panel-Lauf liefert ~670
// Betriebe; ein Screening-Monat allein kann auf wenige Dutzend fallen (Köln: 41).
const MIN_PANEL = 200;
let thin = false;
let trend = { available: false, months, note: `Erhebungsstand ${spanLabel('de')}. Monatliche Snapshots ab sofort — Trends (z. B. „+40 % seit Jahresbeginn") erscheinen automatisch, sobald ≥2 Messpunkte vorliegen.` };
if (months.length >= 2) {
  // SAME-PANEL comparison only: entities present in BOTH months, so the change reflects real
  // movement - never the arrival of a new city.
  //
  // THE HEADLINE IS A COUNT OF BAND CROSSINGS, NOT A SUM OF REVIEWS. Google publishes only ranges
  // ("151 bis 200"), so a month-over-month difference of range midpoints measures BAND WIDTH, not
  // removals: one business moving 151-200 -> 201-250 fabricates "+50" when the true increase may
  // be 1, and every change INSIDE a band is invisible. That midpoint delta is neither an upper nor
  // a lower bound - it is an artifact and must never be published as a review count. What IS a hard
  // fact from Google's own display: how many businesses crossed a published band boundary, and in
  // which direction. The mid* figures below are kept for internal reference only.
  // Compare against the newest EARLIER month that still shares a usable panel. Under the screening
  // rotation a month can consist of a single city — September opened with Köln alone, whose overlap
  // with August was 41 businesses. Comparing against that would have put "1 von 41" on the home page
  // and read as standstill, when the only thing missing was that month's panel run.
  const byMonth = (ym) => new Map(rows.filter((r) => r.date === ym).map((r) => [r.aid, r]));
  const B = byMonth(latest);
  const overlap = (ym) => [...B.keys()].filter((aid) => byMonth(ym).has(aid));
  let prevM = months[months.length - 2], panel = overlap(prevM);
  for (let i = months.length - 3; i >= 0 && panel.length < MIN_PANEL; i--) {
    const p = overlap(months[i]);
    if (p.length > panel.length) { prevM = months[i]; panel = p; }
  }
  const A = byMonth(prevM);
  thin = panel.length < MIN_PANEL;
  if (thin) console.log(`trend: Panel ${panel.length} (${prevM} → ${latest}) unter der Schwelle ${MIN_PANEL} — Monatsvergleich zurückgehalten, Panel-Lauf fehlt`);
  const a = panel.reduce((s, aid) => s + mid(A.get(aid)), 0);
  const b = panel.reduce((s, aid) => s + mid(B.get(aid)), 0);
  let up = 0, down = 0;
  for (const aid of panel) { const d = mid(B.get(aid)) - mid(A.get(aid)); if (d > 0) up++; else if (d < 0) down++; }
  const moved = up + down, flat = panel.length - moved;
  // Shipped to the browser: the publishable facts only.
  trend = thin
    ? { available: false, months, panelSize: panel.length, pending: true,
        note: 'Der Monatsvergleich erscheint, sobald der Panel-Lauf dieses Monats vorliegt — ohne ihn sind zu wenige Betriebe in beiden Monaten erfasst, um zu vergleichen.' }
    : { available: true, months, prev: prevM, latest, panelSize: panel.length, up, down, moved, flat };
  // The midpoint sums stay OUT of dashboard/aggregates.js. They are a quantization artifact, not a
  // review count, and anything sitting in a public file gets quoted sooner or later. Kept here for
  // internal calibration only - pipeline/out/ is tracked but never served.
  fs.writeFileSync(new URL('pipeline/out/trend-internal.json', ROOT), JSON.stringify({
    note: 'INTERNAL ONLY. midDelta is the difference of range midpoints = a measure of Google\'s band widths, NOT removed reviews. Never publish, never quote. The publishable figure is up/down/flat.',
    prev: prevM, latest, panelSize: panel.length, up, down, moved, flat,
    midPrev: r0(a), midLatest: r0(b), midDelta: r0(b - a), midChangePct: r1(a ? ((b - a) / a) * 100 : 0),
  }, null, 2) + '\n');
  const dir = down === 0 && up > 0 ? 'keiner sank' : up === 0 && down > 0 ? 'keiner stieg' : `${de(down)} sanken`;
  if (!thin) add(95, "Momentum",
    `Bei ${de(up)} von ${de(panel.length)} durchgehend erfassten Betrieben stieg die Zahl entfernter Bewertungen über eine Bereichsgrenze — ${dir}`,
    `Vergleich derselben ${de(panel.length)} Betriebe in beiden Monaten (${prevM} → ${latest}). Google veröffentlicht nur Spannen, deshalb ist der Wechsel in einen höheren Bereich das kleinste sicher messbare Ereignis. Bei ${de(flat)} Betrieben blieb die Angabe im selben Bereich — das schließt Veränderungen unterhalb der Spannenbreite ein. Neu hinzugekommene Städte fließen bewusst nicht ein.`,
    `${de(up)}/${de(panel.length)}`);
}

insights.sort((a, b) => b.score - a.score);

// MEASURED coverage from the extension's per-URL outcome log (checks.jsonl, aggregated per
// month+city at ingest). This is the honest denominator: hits / actually-checked profiles —
// only cities with a real v1.1 checks log appear here; earlier cities have none and claim none.
let coverage = [];
try {
  const chk = fs.readFileSync(new URL('pipeline/out/checks.jsonl', ROOT), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  // LATEST measurement per city, not "measurement in the latest month". A screening round takes
  // ~10 nights for 20 cities, so at any given time most cities were last measured a month ago.
  // Filtering on `date === latest` wiped all 16 July cities the moment the August panel run made
  // August the newest month, and would then have shown only the 3 cities screened so far — reading
  // as if the survey had shrunk. Each row carries the month it was measured in; the front end says so.
  const byCity = new Map();
  for (const c of chk.filter((c) => c.checked >= 200).sort((a, b) => a.date.localeCompare(b.date))) byCity.set(c.city, c);
  coverage = [...byCity.values()].map((c) => ({
    city: c.city, month: c.date, checked: c.checked, hit: c.hit, prevalencePct: r1((100 * c.hit) / Math.max(1, c.hit + c.no_banner)),
  })).sort((a, b) => b.checked - a.checked);
} catch { /* no checks yet */ }

const out = { totals, branches, cities, coverage, insights: insights.slice(0, 8), trend, generated: new Date().toISOString() };
fs.writeFileSync(new URL('dashboard/aggregates.js', ROOT), 'window.AIDOS_AGG = ' + JSON.stringify(out) + ';\n');
console.log(`aggregates: ${cur.length} anon rows (${latest}) | ${branches.length} branches | ${cities.length} cities | ${out.insights.length} insights | trend ${trend.available ? 'ON' : 'baseline'}`);
