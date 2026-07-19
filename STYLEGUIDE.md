# aidos — Styleguide

Ein reduziertes **Datenjournalismus-Design**: die Zurückhaltung von NYT/Economist,
die Lesbarkeit von Medium. Tinte auf Papier, **ein** Bordeaux-Akzent, Serifen-Display +
neutrale Sans für Fließtext, **Haarlinien statt Schatten**. Kein Google-Look, kein
Material Design, keine Emoji, keine erfundenen „AI-vibe"-Verläufe.

Single source of truth: `dashboard/site.css`. Jede Seite lädt `fonts/fonts.css` → `site.css`.

## Prinzipien
1. **Seriosität durch Subtraktion.** Weniger Farbe, weniger Kästen, mehr Weißraum und Typografie.
2. **Jede Zahl ist datiert.** Stand-/Erhebungsdatum an jeder veröffentlichten Kennzahl (`.asof`).
3. **Die Daten sind der Schmuck.** Farbe fast nur in Datenvisualisierung und Schlüsselzahlen.
4. **Eine Container-Breite** (`--wrap` 1080px; Lesetexte `--wrap-narrow` 720px).
5. **Kein fremdes Bildmaterial** (keine Google-Assets, keine Nutzerfotos) — rechtlich sauber.

## Farben (Tokens)
| Token | Wert | Einsatz |
|---|---|---|
| `--ink` | `#1a1a1a` | Primärtext, Wortmarke, Tabellenkopf-Linie |
| `--ink-2` | `#4a4a48` | Sekundärtext |
| `--ink-3` | `#7a7a76` | Captions, „muted", Stand-Datum |
| `--paper` | `#fbfbf9` | Seitenhintergrund |
| `--paper-2` | `#f4f2ec` | dezente Fläche (Stat-Band, Zebra, Hover) |
| `--rule` / `--rule-2` | `#e2ded4` / `#cfcabb` | Haarlinien / stärkere Linien |
| **`--accent`** | **`#a61e22`** | Bordeaux: Links, Schlüsselzahlen, Chart-Linien, aktive Nav |
| `--accent-d` | `#7f171a` | Akzent-Hover |
| `--accent-w` | `#f3e6e4` | Wash hinter aktiver Nav / Tags |

Nur **eine** Akzentfarbe. Rot/Grün-Wertungen vermeiden (kein „Ampel"-Framing über Firmen).

## Typografie
- **Display/Headlines/Kennzahlen:** `Newsreader` (Serif, 600 / 500-italic) — selbst gehostet.
- **Fließtext/UI/Zahlen:** `Roboto` (400/500/700) — selbst gehostet, neutrale Grotesk (kein „Google Sans").
- H1 `clamp(30–46px)`, H2 `clamp(23–30px)`, Body 17px/1.65, Lesetext-Prosa 18px/1.7.
- Zahlen immer `font-variant-numeric: tabular-nums` (`.mono-num`).

## Wortmarke & Logo
- **Wortmarke:** `.wordmark` — `aidos` in Newsreader 600, einfarbig Tinte, `.tech` in Bordeaux.
  **Nie** in Google-Farben, nie mehrfarbig pro Buchstabe.
- **Bildzeichen (Platzhalter):** ein eigenes, minimales SVG — zwei gestapelte Messstriche
  unterschiedlicher Länge (Motiv „gemessene Spanne", passend zum Range-Konzept der Daten).
  Frei gezeichnet, keine Kopie. Wird ausgetauscht, sobald ein lizenziertes aidos-Bildzeichen vorliegt.

```html
<a class="wordmark" href="index.html">
  <svg class="glyph" viewBox="0 0 26 26" aria-hidden="true">
    <rect x="3"  y="8"  width="20" height="2.6" rx="1" fill="#1a1a1a"/>
    <rect x="3"  y="15" width="12" height="2.6" rx="1" fill="#a61e22"/>
  </svg>
  aidos<span class="tld">.tech</span>
</a>
```

## Branchen-Icons & Markenlogos
- **Branchen-Icons:** eigenes Set in `dashboard/branch-icons.js` (`aidosBranchIcon(branch, px)`) —
  im Duktus des Bildzeichens: geometrische Grundformen, eine Strichstärke (1.7), runde Kappen,
  `currentColor`. Einsatz: Avatare in Listen/Widgets (weiß auf Branchenfarbe), Fallback auf Profilseiten.
- **Markenlogos:** NUR auf der jeweiligen Unternehmens-Profilseite, rein zur Identifikation
  (referenzielle Nutzung). Zur Build-Zeit geladen und **selbst gehostet**
  (`node pipeline/fetch-logos.mjs` → `dashboard/assets/logos/` + `manifest.json`) — nie gehotlinkt.
  Kein Logo im Manifest → Branchen-Icon. Social-Plattform-Icons (Instagram & Co.) sind ausgeschlossen.

## Komponenten (in `site.css`)
- `.masthead` / `.masthead-inner` / `.nav a.on` — 2px-Tinte-Unterkante, sticky, keine Schatten.
- `.kicker` (Bordeaux-Versalien) · `.deck` (Serif-Vorspann) · `.byline` · `.sec-head` + `.hint`.
- `.lead-figure` — die große Δ-/Leitzahl (Bordeaux-Serif).
- `.band` / `.stat` — Kennzahlen-Band (Haarlinien-Raster).
- `table.rank` — Ranking (Versalien-Kopf, Zebra-Hover, tabellarische Ziffern, `.rank-num` Serif).
- `.score` / `.bar` — Statistik-Index **immer mit n** (`title="Rang X von N erfassten…"`).
- `.dbar` — horizontale Datenbalken (Branchenstärke).
- `.card` / `.grid-3` / `.grid-2` — umrandete Karten (nie Schatten).
- `.btn` `.btn-primary` `.btn-ghost` · `.tag` · `.lookup-box`.
- `.asof` (Stand-Datum) · `.notice` (Hinweis-Kasten) · `.crumbs` · `.prose` (Lesetext).
- `.site-foot` — 2px-Tinte-Oberkante, vollständige Navigation + Rechtshinweis.

## Verbindliche Don'ts
- ❌ Google-Markenfarben, `'Google Sans'`, Material-Elevation/Schatten.
- ❌ Emoji als Icon/Ranking-Schmuck.
- ❌ Fremde Fotos, gehotlinkte Favicons/Static-Maps. (Einzige Ausnahme: selbst gehostete Markenlogos auf Profilseiten, s. o.)
- ❌ Kennzahl ohne Stand-Datum; Score/Index ohne sichtbares `n`.
- ❌ Erfundene Artikel-Karten/Lesezeiten für nicht existierende Inhalte.

Vorschau aller Komponenten: `dashboard/_styleguide.html`.
