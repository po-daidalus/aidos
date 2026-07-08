// aidos.de — infer industry (branch) and city from category, name and address.
// Used by ingest.mjs (per-business branch) and the anonymized aggregate feed.
// Name-based inference matters because ~60% of harvested listings lack a category field.

const BRANCHES = [
  ['Fitness & Sport', ['fitness', 'gym', 'sport', 'yoga', 'crossfit', 'holmes place', 'mcfit', 'fitx', 'clever fit', 'superfit', 'super fit', 'john reed', 'kieser', 'aspria', 'boulder', 'kletter', 'tanzschule', 'pilates']],
  ['Gesundheit', ['arzt', 'ärzt', 'zahnarzt', 'zahnärzt', 'zahnzentrum', 'dental', 'dentist', 'klinik', 'klinikum', 'clinic', 'medical', 'praxis', 'apotheke', 'physio', 'therap', 'medizin', 'tierarzt', 'tierärzt', 'veterinary', 'mvz', 'reha', 'ergo', 'logopäd', 'heilpraktiker', 'orthop', 'radiolog', 'augen', 'hautarzt', 'hebamme']],
  ['Recht & Beratung', ['anwalt', 'anwält', 'kanzlei', 'rechtsanwalt', 'notar', 'steuerberat', 'steuerkanzlei', 'wirtschaftsprüf', 'unternehmensberat', 'consulting']],
  ['Gastronomie & Hotel', ['restaurant', 'café', 'cafe', 'bar ', 'imbiss', 'bistro', 'pizz', 'hotel', 'hostel', 'pension', 'gasthaus', 'gasthof', 'gastr', 'döner', 'doner', 'kebab', 'kebap', 'küche', 'kitchen', 'grill', 'steakhouse', 'sushi', 'burger', 'ibis', 'motel', 'novotel', 'mercure', 'hilton', 'marriott', 'radisson', 'biergarten', 'brauhaus', 'trattoria', 'osteria', 'ristorante', 'resturant', 'snack', 'food', 'eiscafé', 'eis ', 'bakery', 'bäckerei', 'konditorei', 'wirtshaus', 'tapas', 'lounge', 'club', 'thai', 'sushi', 'ramen', 'noodle', 'curry', 'vietnam', 'asiatisch', 'asia ', 'tibet', 'indian', 'indisch', 'mexican', 'taco']],
  ['Automobil', ['auto', 'kfz', 'autohaus', 'werkstatt', 'reifen', 'car', 'motor', 'karosserie', 'lackier', 'mercedes', 'bmw', 'audi', 'volkswagen', 'toyota', 'ford', 'opel', 'renault', 'skoda', 'seat', 'tesla', 'autoland', 'a.t.u', 'pit stop', 'lamborghini', 'ferrari', 'porsche', 'mobility', 'e-drive']],
  ['Handwerk & Bau', ['dachdecker', 'sanitär', 'elektr', 'maler', 'baugesch', 'bauunternehm', 'handwerk', 'tischler', 'schreiner', 'installat', 'heizung', 'garten', 'landschaftsbau', 'umzug', 'gerüst', 'fliesen', 'zimmerei', 'schlosser', 'metallbau']],
  ['Beauty & Wellness', ['friseur', 'coiffeur', 'kosmetik', 'beauty', 'nagel', 'spa', 'tattoo', 'barber', 'wellness', 'massage', 'sonnenstudio', 'waxing', 'brow', 'lash', 'nail', 'nagelstudio']],
  ['Immobilien', ['immobilie', 'makler', 'hausverwalt', 'real estate', 'estate', 'wohnungs', 'property']],
  ['Einzelhandel', ['shop', 'store', 'markt', 'supermarkt', 'edeka', 'rewe', 'aldi', 'lidl', 'netto', 'kaufland', 'penny', 'rossmann', 'dm ', 'drogerie', 'boutique', 'möbel', 'juwelier', 'optiker', 'apotheke']],
];

// Berlin districts / landmarks → Berlin. Extend with more cities as the sweep grows.
const CITIES = ['Berlin', 'Hamburg', 'München', 'Köln', 'Frankfurt', 'Stuttgart', 'Düsseldorf', 'Leipzig', 'Dortmund', 'Essen', 'Bremen', 'Dresden', 'Hannover', 'Nürnberg', 'Duisburg', 'Bochum', 'Wuppertal', 'Bielefeld', 'Bonn', 'Münster', 'Schönefeld', 'Potsdam'];
const BERLIN_HINTS = ['mitte', 'wedding', 'friedrichshain', 'kreuzberg', 'charlottenburg', 'wilmersdorf', 'neukölln', 'schöneberg', 'steglitz', 'zehlendorf', 'spandau', 'pankow', 'reinickendorf', 'tempelhof', 'lichtenberg', 'treptow', 'köpenick', 'marzahn', 'hellersdorf', 'moabit', 'prenzlauer', "ku'damm", 'ku’damm', 'kudamm', 'kurfürstendamm', 'alexanderplatz', 'potsdamer platz'];

export function branchOf(name = '', category = '') {
  const hay = ((category || '') + ' ' + (name || '')).toLowerCase();
  if (!hay.trim()) return null;
  for (const [branch, words] of BRANCHES) if (words.some((w) => hay.includes(w))) return branch;
  return category ? 'Sonstige' : null;
}

// Canonicalize captured city strings: Google addresses mix district/short variants
// ("Frankfurt", "Frankfurt am Main-Innenstadt I", "Wandsbek", "Ehrenfeld") — map them
// onto the survey city so aggregates/pages don't split one city into several.
const CITY_CANON = [
  [/^frankfurt(\s*am\s*main)?([\s-].*)?$/i, 'Frankfurt am Main'],
  [/^(wandsbek|altona|eimsbüttel|harburg|bergedorf|hamburg([\s-].*)?)$/i, 'Hamburg'],
  [/^(ehrenfeld|nippes|porz|kalk|lindenthal|köln([\s-].*)?)$/i, 'Köln'],
  [/^münchen([\s-].*)?$/i, 'München'],
  [/^berlin([\s-].*)?$/i, 'Berlin'],
];
export function canonCity(c) {
  if (!c) return c;
  const t = c.trim();
  for (const [re, canon] of CITY_CANON) if (re.test(t)) return canon;
  return t;
}
export function cityOf(name = '', city = '', address = '') {
  if (city && city.trim()) return canonCity(city);
  const hay = ((address || '') + ' ' + (name || '')).toLowerCase();
  for (const c of CITIES) if (hay.includes(c.toLowerCase())) return canonCity(c);
  if (BERLIN_HINTS.some((h) => hay.includes(h))) return 'Berlin';
  return null;
}
