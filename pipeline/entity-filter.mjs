// aidos.de — legal safety filter: keep only legal persons (GmbH, AG, …) and known chains;
// exclude namentlich genannte Privatpersonen (Einzelunternehmer: Ärzte, Anwälte, Handwerker …).
// Rationale: for legal persons the DSGVO does not apply → removes ~50% of the legal risk
// (Abmahnungen by data-protection authorities, personality-rights claims by named individuals).
// Shared by discover-osm.mjs (candidate filtering) and ingest.mjs (defense-in-depth at storage).
//
// Design principle: we exclude a listing ONLY when it clearly names a private individual
// (academic title + name, profession word + surname, or a bare "Vorname Nachname").
// A mere profession/business word ("Zahnzentrum", "Rechtsanwälte", "Döner") does NOT name a
// person and is kept — otherwise we'd lose many legitimate GmbH/MVZ/chain listings.

// German/EU legal-form tokens → clearly a legal person, always KEEP.
// NOTE: deliberately EXCLUDES e.K. and PartG(mbB) — see PERSON_FORM below.
const LEGAL_FORM = /(\bg?GmbH\b|\bmbH\b|\bUG\b|\bAG\b|\bKGaA\b|\bKG\b|\bOHG\b|\b&\s*Co\.?\s*KG\b|\bSE\b|\be\.?\s?G\.?\b|\bLtd\.?\b|\bLimited\b|\bInc\.?\b|\bPLC\b)/i;

// Legal-form tokens that legally denote / must contain a NATURAL PERSON's name → EXCLUDE.
//  • e.K. (eingetragener Kaufmann) = a single natural-person merchant.
//  • PartG / PartGmbB = partnership whose name must (§ 2 PartGG) contain a partner's surname.
// Naming these publicly names an individual, contrary to our stated policy. They still count
// in the anonymized aggregates. (A large PartGmbB wrongly excluded merely loses a listing —
// far cheaper than a personality-rights claim.)
const PERSON_FORM = /(\be\.?\s?K\.?(?:fr)?\b|\bPartG(?:mbB)?\b)/i;

// Known chains / brands that carry no legal form in their Maps name but are legal persons.
// Extend this list as you encounter more chains. Matched case-insensitively as a substring.
const CHAINS = [
  'holmes place', 'mcfit', 'fit/one', 'fitx', 'clever fit', 'cleverfit', 'john reed', 'fitness first',
  'kieser training', 'ai fitness', 'easyfitness', 'jumpers fitness', 'body+soul', 'superfit',
  'vapiano', "l'osteria", 'losteria', 'hans im glück', 'peter pane', 'dean & david', 'dean and david',
  'block house', 'blockhouse', 'nordsee', 'sansibar', 'sausalitos', 'maredo', 'the ash',
  'starbucks', 'mcdonald', 'burger king', 'kfc', 'subway', 'domino', 'pizza hut', 'five guys', 'backwerk',
  'motel one', 'premier inn', 'ibis', 'novotel', 'mercure', 'steigenberger', 'h-hotels', 'h+ hotel',
  'a&o hostel', 'a&o hotel', 'meininger', 'leonardo hotel', 'nh hotel', 'radisson', 'hilton', 'marriott',
  'holiday inn', 'b&b hotel', 'super 8', 'scandic', 'dorint',
  'rossmann', 'dm-drogerie', 'edeka', 'rewe', 'aldi', 'lidl', 'netto', 'kaufland', 'penny',
  'euromaster', 'a.t.u', 'pit stop', 'vergölst', 'first stop',
];

// Academic / personal titles → essentially always attached to an individual's name → EXCLUDE.
const TITLE = /(\bDr\b\.?|\bProf\b\.?|\bDipl\b\.?|\bDDr\b|\bMag\b\.?|\bmed\b\.|\bdent\b\.|\bjur\b\.|\bDDS\b|\bM\.?Sc\b|\bMBA\b)/;

// Profession words that, when directly followed by a personal surname, indicate a named practitioner.
const PROFESSION = /(zahnarzt|zahnärzt|hausarzt|hausärzt|facharzt|fachärzt|kinderarzt|frauenarzt|tierarzt|tierärzt|augenarzt|hautarzt|orthopäd|rechtsanwalt|rechtsanwält|anwaltskanzlei|anwältin|notar|notariat|steuerberater|steuerberatung|steuerkanzlei|heilpraktiker|heilpraktikerin|psychotherapeut|physiotherapeut|logopäd|hebamme|architekt|architektur)/i;

// Non-name tokens: business/legal/geo/particle words. If a token is here it is NOT a person's name.
const STOP = new Set([
  // business / venue words
  'zentrum', 'zahnzentrum', 'mvz', 'praxis', 'gemeinschaftspraxis', 'zahnarztpraxis', 'arztpraxis',
  'tierarztpraxis', 'kanzlei', 'klinik', 'klinikum', 'studio', 'fitness', 'fitnessstudio', 'gym', 'sport',
  'restaurant', 'ristorante', 'café', 'cafe', 'bar', 'bistro', 'imbiss', 'grill', 'pizzeria', 'trattoria',
  'osteria', 'döner', 'doner', 'kebab', 'kebap', 'sushi', 'asia', 'thai', 'china', 'burger', 'steakhouse',
  'hotel', 'hostel', 'pension', 'gasthaus', 'gasthof', 'apotheke', 'salon', 'friseur', 'friseure', 'coiffeur',
  'kosmetik', 'kosmetikstudio', 'barbershop', 'barber', 'nagelstudio', 'autohaus', 'werkstatt', 'kfz', 'garage',
  'company', 'group', 'gruppe', 'associates', 'partner', 'partners', 'kollegen', 'team', 'haus', 'hof',
  'niederlassung', 'filiale', 'standort', 'zentrale', 'deutschland', 'germany', 'international', 'autoland',
  'service', 'services', 'center', 'centre', 'city', 'world', 'shop', 'store', 'markt', 'outlet', 'lounge',
  'stube', 'küche', 'kitchen', 'dentist', 'dentists', 'dental', 'vets', 'zahnärzte', 'ärzte', 'rechtsanwälte',
  // profession words themselves are not surnames
  'zahnarzt', 'zahnärztin', 'zahnärztliche', 'arzt', 'ärztin', 'tierarzt', 'rechtsanwalt', 'notar',
  'steuerberater', 'physiotherapie', 'physiotherapeut', 'heilpraktiker', 'anwalt', 'anwältin',
  // particles / articles / prepositions
  'der', 'die', 'das', 'den', 'dem', 'ein', 'eine', 'einen', 'dein', 'deine', 'ihr', 'ihre', 'mein', 'meine',
  'und', 'the', 'zum', 'zur', 'am', 'an', 'im', 'in', 'auf', 'bei', 'für', 'von', 'vom', 'aus', 'mit', 'de',
  // German cities + Berlin districts (common second tokens like "SuperFit Mitte")
  'berlin', 'hamburg', 'münchen', 'muenchen', 'köln', 'koeln', 'frankfurt', 'stuttgart', 'düsseldorf',
  'duesseldorf', 'leipzig', 'dortmund', 'essen', 'bremen', 'dresden', 'hannover', 'nürnberg', 'nuernberg',
  'duisburg', 'bochum', 'wuppertal', 'bielefeld', 'bonn', 'münster', 'muenster',
  'mitte', 'wedding', 'friedrichshain', 'kreuzberg', 'charlottenburg', 'wilmersdorf', 'neukölln', 'neukoelln',
  'schöneberg', 'schoeneberg', 'steglitz', 'zehlendorf', 'spandau', 'pankow', 'reinickendorf', 'tempelhof',
  'lichtenberg', 'treptow', 'köpenick', 'koepenick', 'marzahn', 'hellersdorf', 'moabit', 'prenzlauer',
]);

const norm = (s) => (s || '').toLowerCase();
const isNameTok = (t) => t.length >= 3 && !STOP.has(t.toLowerCase()) && /^[A-ZÄÖÜ][A-Za-zÄÖÜäöüß'’-]+$/.test(t);

function tokens(name) {
  return name.replace(/[.,&/()]/g, ' ').split(/\s+/).filter(Boolean);
}

// Whole string is just a personal name: 2–3 tokens, all capitalized, none a business/geo word.
function isBarePersonName(name) {
  const toks = tokens(name);
  if (toks.length < 2 || toks.length > 3) return false;
  return toks.every((t) => /^[A-ZÄÖÜ][A-Za-zÄÖÜäöüß.'’-]*$/.test(t) && !STOP.has(t.toLowerCase()));
}

// Two consecutive name-like tokens anywhere (e.g. "Zahnärzte Nicolas Weiss") → a named individual.
function hasEmbeddedFullName(name) {
  const toks = tokens(name);
  for (let i = 0; i < toks.length - 1; i++) if (isNameTok(toks[i]) && isNameTok(toks[i + 1])) return true;
  return false;
}

// Profession word directly followed by a single surname (e.g. "Zahnärztin Witascheck") → named person.
function hasProfessionPlusName(name) {
  const toks = tokens(name);
  for (let i = 0; i < toks.length - 1; i++) {
    if (PROFESSION.test(toks[i]) && isNameTok(toks[i + 1]) && !PROFESSION.test(toks[i + 1])) return true;
  }
  return false;
}
// Reverse: a surname directly followed by a profession word (e.g. "Korte Rechtsanwalt",
// "Gansel Rechtsanwälte") → named practitioner. Errs toward exclusion (safer for individuals).
function hasNamePlusProfession(name) {
  const toks = tokens(name);
  for (let i = 0; i < toks.length - 1; i++) {
    if (isNameTok(toks[i]) && !PROFESSION.test(toks[i]) && PROFESSION.test(toks[i + 1])) return true;
  }
  return false;
}

// classify(name, category?) → { keep: boolean, reason: string, type: 'legal'|'chain'|'person'|'business' }
export function classify(name, category = '') {
  const n = norm(name);
  if (!name || !n.trim()) return { keep: false, reason: 'no name', type: 'person' };
  // Person-denoting legal forms (e.K., PartG) take precedence over the keep-signals below,
  // so an "Autohaus Schmidt e.K." is excluded even though it has no other person marker.
  if (PERSON_FORM.test(name)) return { keep: false, reason: 'person-denoting legal form (e.K./PartG)', type: 'person' };
  if (LEGAL_FORM.test(name)) return { keep: true, reason: 'legal form', type: 'legal' };
  if (CHAINS.some((c) => n.includes(c))) return { keep: true, reason: 'known chain', type: 'chain' };
  if (TITLE.test(name)) return { keep: false, reason: 'academic title + name (Privatperson)', type: 'person' };
  if (isBarePersonName(name)) return { keep: false, reason: 'bare personal name', type: 'person' };
  if (hasProfessionPlusName(name)) return { keep: false, reason: 'profession + surname (Privatperson)', type: 'person' };
  if (hasNamePlusProfession(name)) return { keep: false, reason: 'surname + profession (Privatperson)', type: 'person' };
  if (hasEmbeddedFullName(name)) return { keep: false, reason: 'embedded personal name', type: 'person' };
  return { keep: true, reason: 'business name (no named individual)', type: 'business' };
}

export function keepEntity(name, category = '') {
  return classify(name, category).keep;
}
