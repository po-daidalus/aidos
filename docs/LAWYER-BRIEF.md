# aidos.tech — Briefing für anwaltliche Erstberatung

**Stand:** 2026-07-24 · **Ansprechpartner:** Markus Meixner (Kontaktdaten s. Impressum aidos.tech/impressum.html)
**Ausführliche technische/rechtliche Dokumentation:** `PRD-legal-review.md` (Datenflüsse, Mitigations, Änderungshistorie). Dieses Briefing kondensiert daraus die **offenen Fragen, die anwaltliche Einschätzung erfordern**.

---

## 1. Was aidos ist (Kurzfassung)

aidos.tech ist ein nicht-kommerzielles datenjournalistisches Projekt. Es wertet die **öffentlichen Transparenz-Hinweise auf Google-Maps-Profilen** aus, die Google seit April 2026 in Deutschland anzeigt („X bis Y Bewertungen wurden in den letzten 365 Tagen nach Diffamierungs-Beschwerden entfernt"). Die Site aggregiert diese Zahlen nach Branchen und Städten (20 Städte, ~1.150 erfasste Profile) und benennt einzelne Unternehmen — **ausschließlich juristische Personen und größere Ketten, keine natürlichen Personen** (automatischer Filter + Pseudonymisierung im Datenbestand). Keine Werbung, kein Verkauf, keine Bezahlangebote.

**Bereits umgesetzt** (Details in PRD §7/§7a): Impressum + Datenschutzerklärung; Ausschluss natürlicher Personen auf Anzeige-Ebene inkl. Pseudonymisierung intern; Disclaimer auf jeder Unternehmens-/Branchen-/Stadtseite („hohe Zahl ≠ Fehlverhalten; Unternehmen sind häufig Ziel unberechtigter Fake-Bewertungskampagnen"); Melde-/Korrekturformular mit 5-tägiger vorsorglicher Entfernung (Takedown-Registry, greift bei jedem Build); keine Bewertungsinhalte oder -verfasser gespeichert; neutrale Sprache ohne Superlative/Schuldzuweisungen (redaktionelle Regel, dokumentiert); selbst gehostete Fonts, keine Drittanbieter-Einbindungen.

---

## 2. Prüffragen (Kern des Mandats)

### F1 — Speicherung eigener Zeitreihen über Googles 365-Tage-Fenster hinaus ⭐ wichtigste Frage
Google zeigt die Entfernungszahl nur als **rollierendes 365-Tage-Fenster**; ältere Werte verschwinden dort. aidos erhebt **monatliche eigene Momentaufnahmen** und kann so Entwicklungen über >12 Monate zeigen — d. h. eine negative Information bleibt bei uns sichtbar, nachdem sie bei Google „verjährt" ist.
**Frage:** Ist die fortdauernde namentliche Anzeige historischer Werte (a) unbegrenzt, (b) begrenzt (z. B. 24/36 Monate), (c) nur noch **aggregiert ohne Namensnennung** zulässig? Maßstab vermutlich Verhältnismäßigkeit / „Prangerwirkung" bei wahren Tatsachenbehauptungen über Unternehmen (Unternehmenspersönlichkeitsrecht, § 823 BGB).
**Unsere Präferenz:** Variante mit klarer zeitlicher Regel, notfalls (c).

### F2 — Eponyme juristische Personen (Firmenname enthält Personennamen)
Der Filter lässt juristische Personen zu — auch wenn der Firmenname eine natürliche Person identifiziert (Beispiel im Bestand: „ever young Dr. Kramer GmbH"). Grenzfälle: Einzelunternehmen mit Nachnamen ohne Rechtsform („Hair Studio Stasch"), Praxen mit Initial + Nachname („Tierarztpraxis M. Radev"), Marken-Personas mit Titel („DR. RICK & DR. NICK", Kette Aesthetify).
**Frage:** Wo ist die Grenze zu ziehen? Findet die DSGVO auf Firmennamen mit Personenbezug Anwendung (EuGH-Linie zu Angaben über juristische Personen, die natürliche Personen identifizieren)? Reicht unsere Praxis „im Zweifel ausschließen"?
**Unsere Präferenz:** Praxen/Einzelunternehmen mit erkennbarem Personennamen entfernen (technisch vorbereitet); Entscheidung für eponyme GmbHs und Ketten-Personas erbeten.

### F3 — aidos-Score / aidos-Index (0–100)
Pro Unternehmen/Branche berechnen wir einen **Perzentil-Score** der Entfernungszahlen, ausgewiesen als „beschreibender statistischer Index, kein Werturteil".
**Frage:** Zulässige Meinungsäußerung auf wahrer Tatsachengrundlage bzw. zulässige Tatsachendarstellung? Kennzeichnung ausreichend?

### F4 — „Was-wäre-wenn"-Schätzung (kontrafaktisches Rating)
Auf Profilseiten zeigen wir eine **rechnerische Schätzung**, wie das Sterne-Rating ohne die entfernten Bewertungen aussähe (Annahmen inline offengelegt, Kennzeichnung „rechnerische Schätzung, keine Tatsachenbehauptung", konservative Untergrenzen).
**Frage:** Genügt die Kennzeichnung, oder ist das Konstrukt selbst angreifbar (unwahre Tatsachenbehauptung vs. erkennbares Rechenmodell)?

### F5 — Melde-/Takedown-Prozess
Beanstandete Einträge werden binnen 5 Tagen **vorsorglich entfernt** und erst nach Prüfung ggf. wieder aufgenommen.
**Frage:** Genügt das, um Störer-/Verbreiterhaftung ab Kenntnis zu vermeiden? Formale Anforderungen an den Prüfprozess?

### F6 — Journalistisches Privileg & UWG-Exposition
Das Projekt versteht sich als Datenjournalismus (Einordnungstexte, Monatsreports, Methodikseite), hat aber keine klassische Redaktion.
**Frage:** (a) Greift das Medienprivileg (Art. 85 DSGVO i. V. m. Landesrecht) für die Datenverarbeitung? (b) Solange keinerlei Monetarisierung erfolgt: UWG-Anwendbarkeit realistisch? Was ändert sich bei späterer Monetarisierung (Spenden, API-Zugang, Pro-Reports)?

### F7 — Formalia
Kurzprüfung Impressum (§ 5 DDG, § 18 MStV) und Datenschutzerklärung auf Vollständigkeit für diesen Dienst.

### F8 — Aufbewahrung des unveröffentlichten Rohmaterials ⭐ neu, 04.08.2026
Wir bewahren jeden Roh-Export der Erhebung unverändert auf (`pipeline/out/exports/`, aktuell 35 Dateien,
25,8 MB, Zeitraum 29.06.–03.08.2026). Grund ist die Nachprüfbarkeit: Googles Hinweis ist eine rollierende
365-Tage-Summe, ein vergangener Monat lässt sich **nicht erneut abfragen**. Alle veröffentlichten Daten
sind daraus abgeleitet; ohne das Rohmaterial wäre weder ein Erhebungsfehler korrigierbar noch eine
Angabe gegenüber einem Betroffenen belegbar.

**Wichtig für die Bewertung — das Rohmaterial ist deutlich personenbezogener als die Veröffentlichung:**

- **917 von 4.505** archivierten Datensätzen betreffen **natürliche Personen** (nach unserem eigenen
  Namensfilter), jeweils mit Klarname, Anschrift, Telefonnummer, Koordinaten und Google-Permalink.
- Genau diese Gruppe wird in der veröffentlichten Datenbank **pseudonymisiert** (gesalzener Einweg-Hash,
  kein Name, keine URL, keine Adresse) und erscheint auf der Website ausschließlich in Aggregaten.
- Das Rohmaterial liegt also bewusst in einer Form vor, die wir öffentlich gerade vermeiden.
- Ablage derzeit: privates Git-Repository (GitHub) plus Arbeitsrechner, **unverschlüsselt at rest**,
  Zugriff nur Betreiber.

**Fragen:** (a) Ist die unbefristete Aufbewahrung des Rohmaterials zu Nachweis- und Korrekturzwecken
zulässig — trägt das Medienprivileg (vgl. F6) auch die *nicht veröffentlichten* Rohdaten? (b) Falls ja:
ist eine Löschfrist geboten, und welche? (c) Welches Schutzniveau ist gefordert — genügt ein privates
Repository, oder ist Verschlüsselung at rest bzw. Trennung von Rohmaterial und Auswertung erforderlich?
(d) Wie ist mit einem Auskunfts- oder Löschverlangen umzugehen, wenn die betroffene Person in der
veröffentlichten Datenbank nur pseudonym vorkommt, im Rohmaterial aber im Klartext?

**Unsere Vorbereitung:** Ein Umzug der Roh-Exports in verschlüsselten Objektspeicher (nur die
Prüfsummen-Liste bliebe im Repository) ist vorbereitet und wartet bewusst auf diese Einschätzung,
damit die Aufbewahrungsentscheidung nicht durch technische Zufälle vorweggenommen wird.

---

## 3. Konkrete Einzelfälle zur Entscheidung (Anhang zu F2)

| Eintrag | Typ | Unsere Einschätzung |
|---|---|---|
| Tierarztpraxis M. Radev (Münster) | Praxis, Initial + Nachname | entfernen (Filterlücke: Initiale) |
| Hair Studio Stasch (Bonn) | Einzelsalon mit Nachnamen | entfernen (Filterlücke: „Friseur" nicht als Berufswort erfasst) |
| Aesthetify \| DR. RICK & DR. NICK (Düsseldorf) | Kette, Marken-Personas mit Dr.-Titel | Grenzfall — Marke vs. identifizierbare Ärzte |
| ever young Dr. Kramer GmbH (Nürnberg) | GmbH mit Personennamen | Grenzfall — juristische Person, aber eponym |

---

*Alle Aussagen zur Funktionsweise sind in `PRD-legal-review.md` (§§ 1–7, Change log § 10) belegt; bitte dortige Sachverhaltsdarstellung als maßgeblich behandeln und Abweichungen flaggen.*
