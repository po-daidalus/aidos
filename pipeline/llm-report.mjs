// aidos.de — LLM editorial layer for the monthly DSA report (Claude Fable 5).
// The model writes the PROSE / Einordnung around figures it is given; it never invents numbers.
// A fact-verifier then checks every number in the output against the allowed set derived from the
// real aggregates — any unknown figure rejects the whole draft and the caller falls back to the
// deterministic template. This is how we get real journalism without fabrication risk.
//
// Requires ANTHROPIC_API_KEY in the environment (.env). If absent or the call fails, returns null.
import Anthropic from '@anthropic-ai/sdk';

// Build the FACTS the model is allowed to use — every number here is real (from aggregates).
export function buildFacts(agg) {
  const T = agg.totals || {};
  const branches = (agg.branches || []).map((b) => ({ branche: b.key, betroffene_profile: b.n, entfernt_geschaetzt: Math.round(b.removed), anteil_prozent: b.share, index: b.aidos_index }));
  const cities = (agg.cities || []).filter((c) => c.n >= 3).map((c) => ({ stadt: c.key, profile: c.n, index_0_10: Math.round(c.score * 10) / 10, schwerpunkt: (c.hotspot || []).join(' & ') }));
  const top = [...(agg.branches || [])].sort((a, b) => b.aidos_index - a.aidos_index)[0];
  // measured prevalence per city (extension outcome log) — real, citable figures
  const messung = (agg.coverage || []).map((c) => ({ stadt: c.city, geprueft: c.checked, mit_hinweis: c.hit, quote_prozent: c.prevalencePct }));
  return {
    monat: T.month, erfasste_profile: T.businesses, entfernt_gesamt_geschaetzt: T.removed,
    profile_ueber_250: T.capCount, anzeige_deckel: 250, // Google caps the public figure at "über 250"
    auffaelligste_branche: top ? top.key : null, auffaelligster_index: top ? top.aidos_index : null,
    branchen: branches, staedte: cities, messung_banner_quote: messung.length ? messung : null,
    momentum: (agg.trend && agg.trend.available) ? { delta: agg.trend.delta, vormonat: agg.trend.prev, panel: agg.trend.panelSize } : null,
  };
}

// Every number the model may legitimately use, normalized (digits only). Anything else = fabrication.
function allowedNumberSet(facts) {
  const set = new Set();
  const add = (v) => { if (v == null) return; const n = String(v).replace(/[.,\s]/g, ''); if (n) set.add(n); };
  const walk = (o) => { if (o == null) return; if (typeof o === 'number' || typeof o === 'string') return add(o); if (Array.isArray(o)) return o.forEach(walk); if (typeof o === 'object') return Object.values(o).forEach(walk); };
  walk(facts);
  return set;
}

// Reject the draft if it contains a number that isn't in the facts (allow small ordinals ≤ 20 and
// years 2020–2027, which are safe structural numbers, not data claims).
export function verifyNumbers(text, facts) {
  const allowed = allowedNumberSet(facts);
  const bad = [];
  for (const m of text.matchAll(/\d[\d.,]*/g)) {
    const raw = m[0];
    const norm = raw.replace(/[.,]/g, '');
    const val = parseInt(norm, 10);
    if (allowed.has(norm)) continue;
    if (val <= 20) continue;               // ordinals, "5 Werktage", list counts
    if (val >= 2020 && val <= 2027) continue; // years
    if (/^\d{4}$/.test(norm) && facts.monat && facts.monat.startsWith(norm.slice(0, 4))) continue;
    bad.push(raw);
  }
  return { ok: bad.length === 0, bad };
}

const SYSTEM = `Du bist Datenjournalist:in bei aidos, einem neutralen Transparenzprojekt zur Bewertungs-Ökonomie.
Schreibe einen sachlichen, gut lesbaren monatlichen DSA-Report auf Deutsch — im Ton seriöser Datenjournalismus (NZZ/Zeit-Datenteam), nicht reißerisch.

HARTE REGELN (nicht verhandelbar):
- Verwende AUSSCHLIESSLICH die Zahlen aus dem gelieferten FACTS-Objekt — und zwar WÖRTLICH. Rechne NICHT selbst: keine Summen, keine Rundungen ("rund 47.000"), keine selbst abgeleiteten Prozente oder Verhältnisse. Jede Ziffernfolge in deinem Text muss exakt so im FACTS-Objekt stehen (nur deutsche Tausenderpunkte darfst du einfügen: 47204 → 47.204). Erfinde NIEMALS eine Zahl oder einen Namen.
- Attribuiere Entfernungen immer an Google und den Meldeprozess: "Google entfernte", "nach Diffamierungs-Beschwerden". Schreibe NIE, ein Unternehmen habe "löschen lassen" (wer die Beschwerde einreichte, ist nicht bekannt).
- Nenne KEINE einzelnen Unternehmen oder Personen — nur Branchen, Städte, Aggregate.
- Kein Werturteil. Eine hohe Zahl ist kein Beweis für Fehlverhalten (Fake-Kampagnen sind häufig). Der Index ist eine neutrale Statistik.
- Werte inkl. entfernter Bewertungen sind Schätzungen, keine Tatsachen.

Antworte NUR mit einem JSON-Objekt, ohne Markdown-Fences:
{"kicker":"kurzer Kicker","sections":[{"h":"Überschrift","p":"1–3 Sätze Fließtext"}]}
Schreibe 4–6 Sektionen (Gesamtbild, auffälligste Branche, Verteilung, Dunkelziffer „über 250" falls vorhanden, regionaler Schwerpunkt, ggf. Momentum).`;

export async function generateLLMReport(agg, { model = 'claude-fable-5' } = {}) {
  if (!process.env.ANTHROPIC_API_KEY) return null; // no key → caller uses deterministic template
  const facts = buildFacts(agg);
  const client = new Anthropic();
  try {
    const resp = await client.beta.messages.create({
      model,
      max_tokens: 4000,
      // Fable 5: thinking is always on — omit the param; steer depth via effort.
      output_config: { effort: 'high' },
      // Fable 5 may decline benign requests → opt into a same-call fallback to Opus 4.8 by default.
      betas: ['server-side-fallback-2026-06-01'],
      fallbacks: [{ model: 'claude-opus-4-8' }],
      system: SYSTEM,
      messages: [{ role: 'user', content: 'Hier sind die verifizierten Kennzahlen (FACTS). Schreibe den Report ausschließlich auf ihrer Basis:\n\n' + JSON.stringify(facts, null, 2) }],
    });
    if (resp.stop_reason === 'refusal') { console.warn('llm-report: refused by classifier, using template'); return null; }
    const textBlock = resp.content.find((b) => b.type === 'text');
    if (!textBlock) return null;
    let parsed;
    try { parsed = JSON.parse(textBlock.text.replace(/^```json\s*|\s*```$/g, '').trim()); }
    catch { console.warn('llm-report: unparseable output, using template'); return null; }

    // FACT-VERIFIER: every number in the prose must trace to the real facts, else reject.
    const joined = (parsed.kicker || '') + ' ' + (parsed.sections || []).map((s) => s.h + ' ' + s.p).join(' ');
    const check = verifyNumbers(joined, facts);
    if (!check.ok) { console.warn(`llm-report: REJECTED — unverifiable numbers ${check.bad.join(', ')} → using template`); return null; }
    console.log(`llm-report: ✓ ${model} draft verified (${(parsed.sections || []).length} sections, model served: ${resp.model})`);
    return parsed;
  } catch (e) {
    console.warn('llm-report: API error → using template:', e.message);
    return null;
  }
}
