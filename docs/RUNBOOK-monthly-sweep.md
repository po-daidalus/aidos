# Runbook — Monats-Sweep (aidos)

Der Monatslauf erzeugt den Datenpunkt, aus dem "Was sich verändert hat" überhaupt erst entsteht.
Google veröffentlicht die Entfernungen nur als rollierende 365-Tage-Summe — **ein verpasster Monat ist
dauerhaft verloren und nicht nachholbar.**

Listen erzeugen:

```bash
node pipeline/make-sweep.mjs 2026-08     # → pipeline/out/sweep-2026-08/
```

---

## Lauf 1 — Panel (zuerst, ~1 Nacht)

**Was:** `sweep-2026-08/panel.txt` — die 675 bekannten, namentlich geführten Betriebe
(668 Google-Permalinks + 7 Namens-Suchen). Das sind exakt die Profile mit öffentlicher Seite.

**Warum zuerst:** liefert den Monatsvergleich für jede Profilseite in einer Nacht, statt erst nach
dem 4-Tage-Screening. Falls irgendwas schiefgeht, ist der wichtigste Teil schon im Kasten.

**Nicht enthalten:** 480 pseudonymisierte Einzelpersonen. Die haben per Datenschutz-Design weder Name
noch URL in der DB und sind aus dem Panel prinzipiell nicht adressierbar — sie werden über Lauf 2
wieder erfasst und fließen weiter nur in die Aggregate.

Ablauf:
1. Extension auf **v1.2.6** prüfen, im Popup **"Löschen"** klicken (keine Reste vom Vormonat).
2. `panel.txt` ins Popup einfügen → Start.
3. **Display an lassen** (`caffeinate -d`), Sweep-Fenster im Vordergrund — Chrome drosselt sonst
   Scroll/Lazy-Load und die Deep-Capture-Historien kommen unvollständig zurück.
4. Dauer grob: ~675 Treffer × ~45 s Deep-Capture ≈ 10–11 h.
5. Export als **JSON** (nicht CSV — CSV hat kein checks-Log).

Ingest — **Archivieren kommt zuerst, immer**:

```bash
node pipeline/archive-export.mjs <export.json>   # ← VOR dem Ingest, nie überspringen
node pipeline/split-run.mjs <export.json>
node pipeline/ingest.mjs pipeline/out/runsplit/<slug>.json --city=<Stadt> --no-checks
```

⚠️ **`--no-checks` ist Pflicht.** Das Panel ist eine Hit-only-Liste (~100 % Trefferquote); ihre checks
würden die echte Prävalenz des Monats überschreiben. `ingest.mjs` bricht bei >50 % Trefferquote
inzwischen von selbst ab, aber verlass dich nicht darauf.

---

## Lauf 2 — Screening (danach, 3–4 Tage)

**Was:** `sweep-2026-08/screening/<stadt>.txt` — die vollständigen OSM-Kandidatenlisten, ~27k URLs
über 20 Städte. Das ist der Lauf, der (a) die Prävalenz misst und (b) Betriebe findet, die den
Hinweis seit dem Vormonat **neu** bekommen haben.

Stadt für Stadt abarbeiten, nicht alles in einem Rutsch — pro Stadt Popup leeren, Liste einfügen,
laufen lassen, exportieren. Der Lauf ist resumierbar (`chrome.alarms`), Abbrüche sind unkritisch.

Ingest je Stadt (**ohne** `--no-checks`, hier sollen die checks landen):

```bash
node pipeline/archive-export.mjs <export.json>   # ← auch hier zuerst
node pipeline/split-run.mjs <export.json>
node pipeline/ingest.mjs pipeline/out/runsplit/<slug>.json --city=<Stadt>
```

Die Screening-Listen sind **deterministisch gemischt** (Seed = Stadt + Monat). Grund: `discover-osm`
fragt Branche für Branche ab, die Rohliste kommt also in 13 zusammenhängenden Branchenblöcken an —
Gastronomie & Hotel, die Branche mit der höchsten Entfernungsrate, steht am Ende. Ein abgebrochener
Lauf hätte sonst nur die vorderen Branchen gemessen und die Prävalenz massiv unterschätzt. Durch die
Mischung ist **jeder Anfangsteil repräsentativ**: bricht eine Nacht ab, ist die gemessene Quote
trotzdem unverzerrt — einfach exportieren, was da ist.

Gemessener Durchsatz (aus dem Juli-Screening, 3.754 checks): **~14,8 s pro URL netto**, unabhängig
vom Ergebnis. Berlin (2.127 URLs) ≈ 8,5–9 h. Ohne `caffeinate -d` gehen zusätzlich Stunden verloren
— im Juli-Lauf waren es 2,27 h reine Schlaf-Pausen.

---

## Nach beiden Läufen

```bash
node pipeline/aggregate.mjs
node pipeline/build.mjs
node pipeline/content.mjs --llm      # Monatsreport (Fable 5, zahlenverifiziert)
node pipeline/og-image.mjs           # Social-Card mit den neuen Zahlen
node pipeline/fetch-logos.mjs        # VOR pages.mjs
node pipeline/pages.mjs              # stempelt am Ende automatisch Content-Hashes auf alle Assets
npx wrangler pages deploy dashboard --project-name=aidos --branch=main --commit-dirty=true
```

Reines Daten-Update ohne UX-Änderung darf direkt live. Alles andere: Preview → Review → Ship.

Danach `pipeline/out/` committen — `db.json` + `history.jsonl` sind das unersetzliche Panel und
liegen bewusst im Repo.

---

## Kandidatenlisten neu erzeugen

Fehlt eine Stadt in `pipeline/out/candidates/`:

```bash
node pipeline/discover-osm.mjs "Wuppertal"
```

Schreibt `candidates/<slug>.txt` (URL-Liste), `candidates/<slug>.json` (Metadaten) und
`coverage/<slug>.json` (Branchen-Nenner). Dauert einige Minuten pro Stadt (Overpass, 14 Branchen-Tags
einzeln). **Die Listen gehören ins Git** — sie sind der Nenner der Prävalenz; gehen sie verloren, ist
der Monatsvergleich der Quote nicht mehr sauber.
