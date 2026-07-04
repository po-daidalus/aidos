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

// --- latest-month cross-section (the "Basismessung") ---
const months = [...new Set(rows.map((r) => r.date))].sort();
const latest = months[months.length - 1] || nowYM;
const cur = rows.filter((r) => r.date === latest);

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

const totals = {
  month: latest, businesses: cur.length, nameable: cur.filter((r) => r.nameable).length,
  removed: r0(totalRemoved), capCount: totalCap, industries: branches.length, cities: cities.length,
  avgDrop: avgDrop != null ? r1(avgDrop) : null,
};

// --- insight engine: build candidate insights, score by "interestingness", keep the strongest ---
const insights = [];
const add = (score, tag, headline, body, stat) => insights.push({ score, tag, headline, body, stat });

// 1) Head figure
add(100, 'Gesamtbild',
  `Google entfernte bei ${de(cur.length)} untersuchten Unternehmen geschätzt ${de(totalRemoved)} Bewertungen wegen Diffamierung`,
  `Basismessung ${latest}. Die Zahlen sind eine konservative Untergrenze: Google zeigt nur die letzten 365 Tage und nur Spannen (z. B. „151 bis 200").`,
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
let trend = { available: false, months, note: `Basismessung ${latest}. Monatliche Snapshots ab sofort — Trends (z. B. „+40 % seit Jahresbeginn") erscheinen automatisch, sobald ≥2 Messpunkte vorliegen.` };
if (months.length >= 2) {
  const prev = months[months.length - 2];
  const sumBy = (ym) => rows.filter((r) => r.date === ym).reduce((s, r) => s + mid(r), 0);
  const a = sumBy(prev), b = sumBy(latest), pct = a ? ((b - a) / a) * 100 : 0;
  trend = { available: true, months, prev, latest, prevRemoved: r0(a), latestRemoved: r0(b), changePct: r1(pct) };
  add(90, 'Trend',
    `Entfernte Bewertungen ${pct >= 0 ? 'stiegen' : 'sanken'} gegenüber ${prev} um ${de1(Math.abs(pct))} %`,
    `Von geschätzt ${de(a)} auf ${de(b)} entfernte Bewertungen im erfassten Bestand.`,
    `${pct >= 0 ? '+' : '−'}${de1(Math.abs(pct))} %`);
}

insights.sort((a, b) => b.score - a.score);

const out = { totals, branches, cities, insights: insights.slice(0, 8), trend, generated: new Date().toISOString() };
fs.writeFileSync(new URL('dashboard/aggregates.js', ROOT), 'window.AIDOS_AGG = ' + JSON.stringify(out) + ';\n');
console.log(`aggregates: ${cur.length} anon rows (${latest}) | ${branches.length} branches | ${cities.length} cities | ${out.insights.length} insights | trend ${trend.available ? 'ON' : 'baseline'}`);
