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
// ("Frankfurt", "Frankfurt am Main-Innenstadt I", "Leipzig-Ost", "Wandsbek") — map them
// onto the survey city so aggregates/pages don't split one city into several.
const CITY_DISTRICTS = [
  [/^(wandsbek|altona|eimsbüttel|harburg|bergedorf)$/i, 'Hamburg'],
  [/^(ehrenfeld|nippes|porz|kalk|lindenthal)$/i, 'Köln'],
];
export function canonCity(c) {
  if (!c) return c;
  const t = c.trim();
  for (const [re, canon] of CITY_DISTRICTS) if (re.test(t)) return canon;
  // generic: a known city name, optionally followed by a district suffix ("Leipzig-Ost",
  // "Frankfurt am Main-Innenstadt I", "München-Schwabing") → the city itself
  for (const base of CITIES) {
    if (t.toLowerCase() === base.toLowerCase() || new RegExp('^' + base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\s-]', 'i').test(t)) {
      return base === 'Frankfurt' ? 'Frankfurt am Main' : base;
    }
  }
  if (/^frankfurt\s*am\s*main/i.test(t)) return 'Frankfurt am Main';
  return t;
}
// PLZ → survey city (covers the swept cities; used when the captured city field is a bare
// district name like "Neustadt"/"Feuerbach" that canonCity cannot safely map by name alone).
export function plzCity(plz) {
  const p = parseInt(plz, 10);
  if (!p) return null;
  if (p >= 10115 && p <= 14199) return 'Berlin';
  if (p >= 20095 && p <= 22769) return 'Hamburg';
  if (p >= 80331 && p <= 81929) return 'München';
  if (p >= 50667 && p <= 51149) return 'Köln';
  if ((p >= 60306 && p <= 60599) || (p >= 65929 && p <= 65936)) return 'Frankfurt am Main';
  if (p >= 70173 && p <= 70629) return 'Stuttgart';
  if (p >= 40210 && p <= 40629) return 'Düsseldorf';
  if (p >= 4103 && p <= 4357) return 'Leipzig';
  if (p >= 1067 && p <= 1328) return 'Dresden';
  if (p >= 30159 && p <= 30669) return 'Hannover';
  if (p >= 90402 && p <= 90491) return 'Nürnberg';
  if (p >= 28195 && p <= 28779) return 'Bremen';
  if (p >= 45127 && p <= 45359) return 'Essen';
  if (p >= 44135 && p <= 44388) return 'Dortmund';
  if (p >= 44787 && p <= 44894) return 'Bochum';
  if (p >= 47051 && p <= 47279) return 'Duisburg';
  return null;
}
const KNOWN = new Set(CITIES.concat('Frankfurt am Main').map((c) => c.toLowerCase()));
export function cityOf(name = '', city = '', address = '') {
  if (city && city.trim()) {
    const canon = canonCity(city);
    if (KNOWN.has(canon.toLowerCase())) return canon;
    // bare district name ("Neustadt", "Feuerbach") → resolve via the address PLZ if possible
    const plz = (address || '').match(/\b(\d{5})\b/);
    const byPlz = plz && plzCity(plz[1]);
    if (byPlz) return byPlz;
    return canon;
  }
  const plz = (address || '').match(/\b(\d{5})\b/);
  const byPlz = plz && plzCity(plz[1]);
  if (byPlz) return byPlz;
  const hay = ((address || '') + ' ' + (name || '')).toLowerCase();
  for (const c of CITIES) if (hay.includes(c.toLowerCase())) return canonCity(c);
  if (BERLIN_HINTS.some((h) => hay.includes(h))) return 'Berlin';
  return null;
}
