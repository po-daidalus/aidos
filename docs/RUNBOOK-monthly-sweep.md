# Runbook — Monatslauf (aidos)

Google veröffentlicht die Entfernungen nur als rollierende 365-Tage-Summe. Was diesen Monat nicht
gemessen wird, ist **dauerhaft verloren und nicht nachholbar** — aber das gilt scharf nur für das
**Panel**. Deshalb sind die beiden Läufe unterschiedlich dringend:

| Lauf | Rhythmus | Aufwand | Was verloren geht, wenn er ausfällt |
|---|---|---|---|
| **Panel** | **jeden Monat** | 1 Nacht | ein Monat der Zeitreihe jedes öffentlichen Profils — unwiederbringlich |
| **Screening** | Rotation, jede Stadt alle 2–3 Monate | 4–5 Nächte/Monat | nichts Dauerhaftes; neue Betriebe werden später gefunden |

Listen erzeugen (beide Läufe auf einmal):

```bash
node pipeline/make-sweep.mjs 2026-09     # → pipeline/out/sweep-2026-09/
```

---

## Lauf 1 — Panel (Anfang des Monats, ~1 Nacht)

**Was:** `sweep-<Monat>/panel.txt` — die bekannten, namentlich geführten Betriebe (Google-Permalink,
sonst Namens-Suche). Das sind exakt die Profile mit öffentlicher Seite.

**Warum das der eigentliche Monatsartefakt ist:** Nur hier messen wir *dieselben* Betriebe erneut.
Daraus entstehen der Monatsvergleich auf jeder Profilseite, die Grenzübertritts-Zählung und die
kumulative Untergrenze (`cumulativeMin()`), die mit jedem zusätzlichen Monat schärfer wird. Fällt ein
Monat aus, hat diese Zeitreihe eine Lücke, die sich nie schließen lässt.

**Nicht enthalten:** die pseudonymisierten Einzelpersonen. Die haben per Datenschutz-Design weder
Name noch URL in der DB und sind aus dem Panel nicht adressierbar — sie werden über das Screening
wieder erfasst und fließen weiter nur in die Aggregate.

Ablauf:
1. Extension auf **v1.2.6** prüfen, im Popup **„Löschen"** klicken (keine Reste vom Vormonat).
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

## Lauf 2 — Screening (Rotation, 4–5 Nächte im Monat)

**Was:** `sweep-<Monat>/screening/<stadt>.txt` — die vollständige OSM-Kandidatenliste einer Stadt.
Der Lauf misst (a) die Prävalenz und findet (b) Betriebe, die den Hinweis **neu** bekommen haben.

**Welche Stadt als Nächstes:**

```bash
node pipeline/sweep-due.mjs                 # Warteschlange, älteste Messung zuerst
node pipeline/sweep-due.mjs --copy          # dazu die fälligste Liste ins Clipboard
```

### Warum Rotation und nicht jeden Monat alle Städte

Zwei Gründe, beide gemessen:

**Es passt nicht in einen Monat.** 21 Städte sind ~27.000 URLs bei 14,8 s netto = **97 Stunden**,
also 10–13 Nächte. Im Juli wie im August ist das an der Realität gescheitert; geplant wurde jedes Mal
etwas, das in einen Monat nicht hineingeht.

**Ein Monatsvergleich der Quote wäre ohnehin nicht auflösbar.** Prävalenz ist ein Anteil, ihr
Vertrauensintervall hängt an der Stichprobengröße — und die *ist* die Kandidatenliste, mehr gibt es
nicht:

| Stadt | n | Quote | 95-%-Intervall |
|---|---|---|---|
| Berlin | 1.872 | 5,1 % | ± 1,0 pp |
| Hamburg | 1.701 | 3,9 % | ± 0,9 pp |
| Münster | 812 | 5,5 % | ± 1,6 pp |
| bundesweit | 21.135 | 4,3 % | ± 0,27 pp |

Für ±0,5 pp bräuchte eine einzelne Stadt 6.324 URLs — das Dreifache der vorhandenen Liste. Eine
Veränderung von 4,0 auf 4,3 % ist damit grundsätzlich nicht nachweisbar, gleich wie oft gemessen
wird. **Nie eine Monatsdifferenz der Stadtquote behaupten.**

Was das Screening wirklich trägt, hält bei 2–3 Monaten problemlos:
- die **Rangfolge zwischen Städten** (2,7 % Bremen bis 7,1 % Bielefeld — Faktor 2,6, weit außerhalb
  der Intervalle),
- die **bundesweite Quote** (n = 21.135, ± 0,27 pp),
- die **Entdeckung** neu bebannerter Betriebe.

**Obergrenze der Rotation: 120 Tage.** So lange läuft die Staleness-Grenze in `build.mjs`, nach der
ein namentlich geführter Betrieb nicht mehr veröffentlicht wird. Die öffentlichen Profile hält das
monatliche Panel frisch, das Screening muss nur darunter bleiben.

### Ablauf je Stadt

Stadt für Stadt abarbeiten, nicht alles in einem Rutsch — pro Stadt Popup leeren, Liste einfügen,
laufen lassen, exportieren. Der Lauf ist resumierbar (`chrome.alarms`), Abbrüche sind unkritisch.

Ingest (**ohne** `--no-checks`, hier sollen die checks landen):

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

⚠️ **Teil-Läufe nicht nachfahren.** Ein Diff „Liste gegen geprüfte URLs" ist nicht möglich: die Liste
führt `?api=1&query=<OSM-Name>`, der Check die aufgelöste Google-URL mit Googles kanonischem Namen.
Ein Namensabgleich erkennt nur ~61 % wieder, obwohl 88–93 % geprüft sind — ein „Rest"-Lauf
wiederholt also überwiegend Erledigtes. Die Teilmessung ist durch die Mischung ohnehin gültig; die
Stadt kommt beim nächsten Rotationsdurchgang wieder dran.

Gemessener Durchsatz: **~14,8 s pro URL netto**, unabhängig vom Ergebnis. Ohne `caffeinate -d` gehen
zusätzlich Stunden verloren — im Juli-Lauf waren es 2,27 h reine Schlaf-Pausen.

---

## Nach den Läufen

```bash
node pipeline/aggregate.mjs
node pipeline/build.mjs               # rechnet est_* für ALLE Profile neu + kumulative Untergrenze
node pipeline/measure-star-mix.mjs   # 1★:2★-Verhältnis gegenprüfen (siehe unten)
node pipeline/content.mjs --llm      # Monatsreport (Fable 5, zahlenverifiziert)
node pipeline/og-image.mjs           # Social-Card mit den neuen Zahlen
node pipeline/fetch-logos.mjs        # VOR pages.mjs
node pipeline/pages.mjs              # stempelt am Ende automatisch Content-Hashes auf alle Assets
npx wrangler pages deploy dashboard --project-name=aidos --branch=preview --commit-dirty=true
```

**Preview → Review → Prod, ausnahmslos.** Erst nach Markus' Go:

```bash
npx wrangler pages deploy dashboard --project-name=aidos --branch=main --commit-dirty=true
```

💡 Nach einem Prod-Deploy ein paar Sekunden warten. Das erste Laden zieht sonst noch das vorherige
Deployment, und der Browser cacht es 4 h unter der **neuen** `?v=`-URL — das sieht aus wie ein
kaputter Cache-Buster, ist aber nur Propagation. Gegenprüfen im frischen Browser-Kontext oder per
`curl` gegen den Origin.

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
einzeln). **Die Listen gehören ins Git** — sie sind der Nenner der Prävalenz und zugleich das
Erhebungsuniversum, über das `split-run.mjs` Treffer den Städten zuordnet.

⚠️ Bei Stadtstaaten das `admin_level` prüfen: Bremen ist auf `^6$` gepinnt, sonst zieht Level 4 (das
Bundesland) Bremerhaven mit. Hannover hängt an `^8$`.

---

## Das Schätzmodell (`pipeline/counterfactual.mjs`)

Die „Note ohne Entfernungen" lebt in **einem** Modul; `ingest.mjs` und `build.mjs` importieren beide
von dort, damit die Konstanten nicht auseinanderlaufen.

`A_MID = 1.335` ist gemessen, nicht gesetzt: `node pipeline/measure-star-mix.mjs` druckt die
überlebende Sternverteilung und das 1★:2★-Verhältnis, aus dem der Wert stammt. Es pendelt bisher
zwischen 1,97 und 1,98 (Mittelwert 1,336–1,337). **Nach jedem Lauf nachmessen und die Zahl auf der
Methodik-Seite mitziehen — die Konstante selbst bleibt bei 1,335**, der Absatz dort erklärt genau
das. Erst eine dauerhafte Verschiebung über 1,33–1,34 hinaus rechtfertigt, die Konstante anzufassen.

Zwei Fallen, beide schon einmal zugeschnappt:

- **est_\* sind abgeleitet, nicht erhoben.** `build.mjs` rechnet sie bei jedem Lauf aus
  `rating/reviews/range_*` neu. Verlässt man sich auf die bei irgendeinem früheren Ingest
  geschriebenen Werte, mischt die Site zwei Generationen der Formel.
- **`rating_drop` in `aggregate.jsonl` heilt erst beim nächsten Voll-Sweep.** Der anonymisierte Feed
  führt bewusst keine Bewertungszahl mit, die Zeile ist also nicht nachrechenbar. Nur relevant für
  `avgDrop` (eine Nachkommastelle) — Modelländerungen unterhalb ~0,05★ bleiben dort unsichtbar.

Bei „über 250" gibt es **keine** Obergrenze für R. `est_low` bleibt dann `null`, `est_open` ist wahr,
und die Seite zeichnet einen nach unten offenen Korridor. Nie einen Ersatzwert einsetzen: das ließe
ausgerechnet die am stärksten betroffenen Profile am unauffälligsten aussehen.
