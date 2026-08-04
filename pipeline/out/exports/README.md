# Roh-Exports der Extension — das Original-Archiv

Hier liegt **jeder** Export der Chrome-Extension, unverändert, Byte für Byte wie exportiert.

**Warum das der wichtigste Ordner im Repo ist:** `db.json`, `history.jsonl` und `aggregate.jsonl`
sind *abgeleitet*. Googles Transparenz-Hinweis ist eine rollierende 365-Tage-Summe — der Stand eines
vergangenen Monats lässt sich **nicht erneut abfragen**. Fällt später ein Ingest-Fehler auf, oder
braucht eine neue Kennzahl ein Feld, das `ingest.mjs` heute wegwirft, ist der Roh-Export der einzige
Weg zurück. Geht er verloren, ist der Monat dauerhaft weg.

## Regel

```bash
node pipeline/archive-export.mjs <export.json>   # VOR jedem Ingest
```

Steht so auch im Runbook. Nie überspringen, auch nicht bei „nur mal kurz testen".

## Wie der Bestand organisiert ist

Dateiname: `<Capture-Datum>_<Typ>_<Datensätze>r-<checks>c_<sha256-Präfix>.<ext>`

| Typ | Bedeutung |
|---|---|
| `panel` | Nachmessung bekannter Betriebe, Trefferquote ~100 % — **checks nie in die Prävalenz** |
| `screening` | vollständige Kandidatenliste — nur diese Läufe liefern die Prävalenz |
| `mixed` | Datensätze ohne verwertbares checks-Log |
| `probe` | Versions-Testlauf mit wenigen URLs |
| `csv-no-checks` | CSV-Export der Frühphase — enthält keine checks, nur Datensätze |

`MANIFEST.json` führt Buch über alles: sha256, Größe, Datensatz- und check-Zahlen, Trefferquote,
Extension-Version, Capture-Zeitraum, Ursprungsdateiname.

Drei Eigenheiten, die dort bewusst festgehalten statt aufgelöst werden:

- **`alsoSeenAs`** — inhaltsgleiche Dateien (identischer sha256) werden nur einmal gespeichert, die
  weiteren Dateinamen bleiben vermerkt.
- **`containedIn`** — die Extension exportiert kumulativ, wenn das Popup nicht geleert wurde. Ein
  späterer Export kann einen früheren vollständig enthalten. **Beide bleiben liegen** — der größere
  ersetzt den kleineren nicht, weil die Zwischenstände den Verlauf des Laufs dokumentieren.
- **`stored: false`** — leere Exports werden nicht gespeichert, aber verzeichnet, damit die
  Lauf-Historie keine stillen Lücken hat.

Prüfen, ob Manifest und Dateibestand auseinanderlaufen:

```bash
node pipeline/archive-export.mjs --relink
```

## Herkunft des Altbestands

Die Exports vom 29.06. bis 03.08.2026 lagen bis zum 04.08.2026 ausschließlich in `~/Downloads` und
wurden an diesem Tag nachträglich hier eingesammelt. Es ging nichts verloren, aber es hing an einem
Ordner, den ein Aufräumen jederzeit hätte leeren können.
