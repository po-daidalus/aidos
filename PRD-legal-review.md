# aidos.de — Product Requirements Document (for Legal Review)

**Version:** 1.1
**Date:** 2026-07-02 (updated)
**Owner:** Markus Meixner
**Purpose of this document:** Give a legal reviewer a complete, accurate picture of what aidos.de does, what data it collects, from where, how that data is processed and displayed, and where the legal risk sits. This is written specifically to support a data-protection (DSGVO/GDPR), press/defamation, and platform-law assessment under German and EU law.

> **Note to reviewer:** aidos.de is **pre-launch**. Nothing described here is public yet. No production data has been published. This document describes the intended product and the current prototype pipeline so that legal issues can be caught *before* go-live.

---

## 1. Product summary

**Mission (v1.3):** aidos.de is an **objective, neutral data-journalism platform**. Its purpose is to bring **transparency** to Google ratings and to the **impact of defamation-based review removals** on the picture consumers see. It **does not blame** individuals or very small businesses; the editorial focus is **industries, chains and larger companies, and aggregate patterns**. Every product and data decision is made to avoid legal exposure for named individuals or legal persons. *(This mission governs all subsequent decisions.)*

**aidos.de** is a transparency / data-journalism website. It publishes a ranking of German companies (businesses with a Google Maps / Google Business Profile listing) ordered by the **number of their Google Maps reviews that Google itself removed for defamation** ("Bewertungen aufgrund von Beschwerden wegen Diffamierung entfernt"), plus a **Germany-wide aggregated homepage** with industry-level insights.

The core observation the project rests on: since **26 April 2026**, Google displays a public banner on the Maps listing of affected businesses stating how many reviews were removed due to defamation complaints, expressed as a **range** (e.g. "151 bis 200", "über 250") over a **rolling last-365-days window**.

The editorial thesis: a high count of defamation-removed reviews is a **public-interest signal** — it can indicate a business that is systematically getting negative reviews suppressed, and it lets the public see, per industry and city, where this is happening most. The site name refers to *Aidos*, the Greek goddess of shame/modesty (used editorially/satirically, not as an accusation of fact against any individual business).

**What the site is NOT:** It does not republish the removed reviews, their text, their authors, or any allegation contained in them. That content is deleted by Google and is never accessible to us (see §4.4).

---

## 2. Data sources

All data originates from **publicly visible information on Google Maps / Google Business Profile listings** and from **open geographic data**. There is no scraping of private accounts, no login-walled content, and no purchase of third-party datasets about individuals.

| # | Source | What we take | Nature |
|---|--------|--------------|--------|
| 1 | **Google Maps public listing** (the business's own profile page) | The defamation-removal **banner range** (min/max count), business name, category, address, city, postal code, aggregate star rating, total review count, website, phone, public listing photo (og:image), plus code, coordinates | Public business (commercial) data + one aggregate moderation statistic Google chose to publish publicly |
| 2 | **OpenStreetMap / Overpass API** | Candidate business **names + coordinates** by city and industry tag, used only to build a *list of listings to check* | Open data (ODbL) |
| 3 | *(Optional, currently paused)* **Apify `compass/crawler-google-places`** | Aggregate metadata + historical review **counts over time** (for a rating-trend chart) | Public listing metadata via a third-party scraper |

**Key point for the reviewer:** the *distinguishing* datum of this project — the removal count — is **a statistic Google publishes on the public listing itself**. We are re-presenting a number Google already shows to any visitor, aggregated across businesses.

---

## 3. How the data is collected (technical flow)

### 3.1 Candidate discovery (free, no personal data)
`discover-osm.mjs` queries OpenStreetMap's Overpass API per industry tag (dentists, doctors, lawyers, restaurants, gyms, hotels, etc.) within a city boundary and produces a list of Google Maps **search URLs** — essentially "go look at this business's listing." Output for Berlin: ~2,127 candidate businesses. No personal data is collected in this step; it is just a to-do list of public listings to visit.

### 3.2 Banner harvesting (Chrome extension, in a real browser)
A **Manifest V3 Chrome extension** ("the harvester") runs in the operator's own signed-in Chrome. Google serves a "restricted view" (no banner) to logged-out/automated sessions, so a real signed-in browser is required to see the public banner at all.

- A **content script** reads the already-rendered public listing page: it regex-matches the banner text, and reads the visible name, category, address, rating, review count, website, image, coordinates.
- A **background loader** walks the candidate list one URL at a time, waits for each page, records the result, and advances (15 s timeout per page).
- Results are stored locally in `chrome.storage.local`, keyed by the business's `place_id` (dedup).
- The operator exports the accumulated results as JSON/CSV.

**Account used:** a dedicated **throwaway Google account** (not a personal account) is used to browse, to avoid the operator's personal account being flagged for automated browsing. The extension only *reads what is already on screen* — it does not post, edit, or interact with any listing.

### 3.3 Ingest & build (local, no cloud)
`ingest.mjs` upserts each export into a local `db.json` (dedup by `place_id`) and appends a monthly snapshot to `history.jsonl`. `build.mjs` regenerates the static dashboard data. Everything is local files; there is currently no server-side database.

---

## 4. How **review data** specifically is used  ← (the key legal question)

This is the section most relevant to defamation / personality-rights review. Please read carefully because the answer is narrower than it may first appear.

### 4.1 We do NOT process the content of any review
We never collect, store, display, or infer the **text**, **author identity**, **rating**, or **allegations** of any individual review — neither the removed ones nor the surviving ones. Individual reviews are not part of the dataset.

### 4.2 What we actually use about reviews — three aggregate numbers per business
1. **Removal count (range)** — Google's own published banner, e.g. "151 bis 200". A rolling 365-day aggregate. **This is a Google-authored statistic, not our claim.**
2. **Current aggregate star rating** — e.g. 4.3 stars — the single public average Google shows.
3. **Total surviving review count** — e.g. 1,035 reviews — the single public total Google shows.

That's it. All three are **aggregate figures already displayed publicly on the listing**. None identifies a reviewer or reproduces review content.

### 4.3 The "uncensored rating" estimate (derived, clearly labelled as an estimate)
From the three aggregates above we compute an **illustrative estimate** of what the business's rating *might* look like if the removed reviews had counted, shown as a **range with explicit uncertainty**, not a precise figure:

```
est_low  = (S + Rmax × 1)   / (N + Rmax)
est_mid  = (S + Rmid × 1.5) / (N + Rmid)
est_high = (S + Rmin × 2)   / (N + Rmin)
```
where `S` = rating × review count (star sum), `N` = review count, `Rmin/Rmax` = the banner range, and 1–2 = assumed star value of a removed (defamation-flagged, presumably negative) review.

**Legal framing of this feature:** it is presented as a **statistical estimate / hypothetical** ("what the rating *could* be if removed reviews were counted"), always as a **range**, always with a visible uncertainty band, and never as a statement of fact that the business's "true" rating *is* X. It does not assert that any removed review was true, justified, or that the business did anything wrong.

### 4.4 The removed reviews' content is permanently inaccessible
Once Google removes a review it is deleted from the public listing. We have **no technical means** to retrieve its text or author, and we do not attempt to. So there is no path by which a defamatory statement contained in a removed review could be republished by aidos.de.

### 4.5 Optional survivor-trend chart (currently paused)
A planned feature (Method B/D) shows a chart of the business's *surviving* review **count over time** (an aggregate volume line, from Apify or from our own monthly snapshots). Again: counts and averages over time, never individual review content. This is currently paused (no live third-party data pull).

---

## 5. What gets published on the site

**Funnel (v1.3):** the site is now three tiers — **(1) Homepage** = Germany-wide **aggregated** dashboard (industry/city statistics + auto-generated newspaper-style insights; **no individual business is named here**); **(2) Listing page** = searchable/filterable list of the **nameable** businesses, chains and larger companies; **(3) Profile page** = per-business detail. Users move home → listing → profile.

**Aggregate homepage data (anonymized).** Homepage statistics are computed from an **anonymized feed** (`pipeline/out/aggregate.jsonl`) that stores, for every harvested listing (including excluded individuals/small businesses), **only** {one-way hash id, month, industry, city, removal range, rating drop} — **no name, no address, no place_id**. This lets the aggregate insights reflect the full dataset while **never naming a natural person**, keeping the homepage DSGVO-safe. Insights are **computed from real data, not fabricated**; time-trend insights (e.g. "+40 % since 2026") **activate automatically only once ≥2 monthly snapshots exist** (Method D) — until then the homepage shows a labelled "Basismessung" (baseline) and no invented trend numbers.

Per business (listing/profile), the public dashboard would show:
- Business name, category/industry, city (public commercial identity)
- Google's aggregate star rating and total review count (as shown on Google)
- **Google's defamation-removal banner range** (re-presenting Google's public statistic)
- The **estimated "uncensored" rating range** (labelled as an estimate, §4.3)
- Public listing photo, a link back to the Google listing
- Grouping of chain locations under one brand
- Filters by city / industry; a ranking
- A **prominent per-entry disclaimer** ("Wichtiger Hinweis zu den Moderations-Daten") stating that the removal data is Google's, that a high count does **not** mean the business acted unlawfully, and that businesses are often victims of unjustified fake-review campaigns and use lawful means to protect their reputation (full text in §9).

> **Removed as of v1.1 (2026-07-02):** the earlier satirical **"aidos verdict"** (goddess-of-shame emblem + editorial comment) has been **removed from all entry/profile pages** because it carried the highest defamation/Schmähkritik risk. It no longer renders anywhere on the site.

A prominent expandable notice links to **Google's own explanation** of the defamation-removal program (support.google.com/contributionpolicy/answer/16997273) and makes clear the removal figure is **Google's**, over a rolling 365-day window, and is a conservative floor.

---

## 6. Personal-data (DSGVO/GDPR) considerations — for reviewer input

Areas we want the reviewer to assess:

1. **Business vs. personal data.** Most listings are companies (legal persons). Some are **sole practitioners named as individuals** (e.g. "Dr. Beate Lengert", a named dentist or lawyer). **Mitigation added in v1.1:** the pipeline now **automatically excludes namentlich genannte Privatpersonen** (see §7a) — academic-title-plus-name ("Dr. …"), profession-plus-surname ("Zahnärztin Witascheck"), and bare personal names are dropped at both discovery and ingest, so only legal persons (GmbH, AG, KG …) and known chains enter the ranking. This removes the bulk of the DSGVO/personality-rights exposure. *Residual question: are there named-individual cases the heuristic can miss (e.g. a GbR trading under two surnames), and is a manual review step advisable before publication?*
2. **Lawful basis.** If not fully covered by the media privilege: is **Art. 6(1)(f) legitimate interest** (public interest in transparency) defensible, and what balancing/mitigations are needed?
3. **Data-subject rights & takedown.** Do we need a documented **notice-and-takedown / correction** process for a business that disputes its inclusion or the estimate?
4. **The estimate as opinion vs. fact.** Is the "uncensored rating estimate" clearly enough framed as **opinion/estimate (Meinungsäußerung)** rather than a **false statement of fact (Tatsachenbehauptung)** that could be actionable? What labelling makes it safe?
5. **~~The "aidos verdict" / shame framing.~~** *(Resolved in v1.1 — the satirical verdict was removed entirely; see §5. No longer an open item.)*
6. **Google ToS.** Reading a publicly rendered page in a real browser and re-presenting an aggregate statistic Google publishes — assess exposure under Google's Terms of Service (contractual, not necessarily a legal-rights issue, but worth flagging).
7. **Imprint / Impressum & disclaimers.** § 5 DDG (ex-TMG) imprint, and journalistic-diligence (§ 19 MStV) obligations.
8. **OpenStreetMap ODbL** attribution obligations for the candidate data.

---

## 7. What we deliberately do NOT do (risk mitigations already in place)

- ❌ We do not store, display, or republish **any individual review's text, rating, or author** — removed or surviving.
- ❌ We do not claim any removed review was **true or justified**, nor that a business **acted wrongfully**.
- ❌ We do not present the estimated rating as the business's **actual** rating — always a labelled **range/estimate** with an uncertainty band.
- ❌ We do not scrape private, login-gated, or non-public data.
- ❌ We do not access the removed-review content (it is technically impossible; it is deleted).
- ✅ We re-present a **removal statistic Google itself publishes** on the public listing.
- ✅ We link to Google's official explanation and state the figure is Google's, rolling-365-day, a conservative floor.
- ✅ We use aggregate, public, largely commercial data.
- ✅ **(v1.1)** We **exclude named private individuals** automatically (see §7a) — only legal persons and chains are ranked.
- ✅ **(v1.1)** We show a **per-entry disclaimer** clarifying the data is Google's and that a high count is not proof of wrongdoing (see §9).
- ✅ **(v1.1)** We **removed the satirical "shame verdict"** entirely.

### 7a. Handling of named natural persons — display-layer exclusion (updated v1.9)
**Revised model (2026-07-02):** individuals ARE scraped and stored in the **internal** database (`db.json`) and are counted **anonymously** in the Germany-wide aggregates — because their removal data is part of the industry statistics. What the classifier now controls is **display only**: an individual (`nameable: false`) is **never shipped to the browser** (`build.mjs` filters `data.js` to nameable-only, so no individual's name/address is downloadable in the page source) and **never shown individually** on the listing/profile pages. Net effect for the public site is unchanged (no individual is named publicly); the difference is that the internal DB now retains the full record so it can enrich the anonymized statistics.

> **For the reviewer:** this means aidos *does* store some personal data (public business listings of named sole traders) in its internal database, justified by the journalistic/statistical purpose and mitigated by (a) never publishing it individually, (b) shipping only anonymized aggregates + nameable legal persons to the public, (c) public-source-only data. Please assess whether this internal retention is acceptable under the journalistic exemption / Art. 6(1)(f), or whether individuals should be stored without direct identifiers (name/address) even internally.

`entity-filter.mjs` `classify()` marks an entity **non-nameable** (individual) when its name indicates a named person:
- **Academic/personal title + name** — "Dr.", "Prof.", "Dipl.", "med.", "dent.", "jur." → e.g. *Dr. Beate Lengert*.
- **Profession word + surname** — e.g. *Zahnärztin Witascheck*, *mgp Merla Ganschow & Partner Steuerberater*.
- **Bare personal name** — 2–3 capitalized name tokens, e.g. *A. Nejad*, *Serpil Hartfiel*.

A listing is **kept** only if it is a **legal person** (name contains GmbH / AG / UG / KG / OHG / SE / e.K. / e.G. / Ltd / PartGmbB …) or a **known chain** (allow-list: Holmes Place, McFit, FitX, Vapiano, Motel One, …). Descriptive business names without a named individual (e.g. *Zahnzentrum Wedding*, *Restaurant Milano*) are kept. **The filter deliberately errs toward exclusion** on ambiguous "X & Y" names (e.g. *Sanft & Schön*), accepting some loss of legitimate businesses to minimize the risk of ever ranking a natural person. On the Berlin candidate set this excluded **~838 of 2,128** discovery candidates as named individuals.

---

## 8. Current status / scope for this review

- **Stage:** prototype pipeline + static dashboard, **not live**.
- **Data captured so far:** ~28–31 real Berlin businesses (test set); a full Berlin sweep of ~2,127 candidate listings is in progress.
- **Planned scale:** Germany's 20 largest cities × common industries, refreshed with monthly snapshots.
- **Ask of legal review:** identify blocking issues and required mitigations (esp. §6 items 1–5) **before** any public launch.

---

---

## 9. Per-entry disclaimer (live text on every entry, v1.1)

> **Wichtiger Hinweis zu den Moderations-Daten**
> Die hier dargestellten Daten zu entfernten Bewertungen wegen Diffamierung werden von der Google LLC auf den öffentlichen Profilen von Google Maps bereitgestellt. aidos.de spiegelt diese Daten lediglich im Rahmen der Berichterstattung wider.
> Bitte beachten Sie: Die Anzahl der entfernten Bewertungen besagt **nicht**, dass das Unternehmen rechtswidrig gehandelt hat. In vielen Fällen sind Unternehmen Opfer von unberechtigten Fake-Bewertungskampagnen (z. B. durch Mitbewerber oder Bots) und nutzen rechtliche Mittel, um ihr geschäftliches Ansehen zu schützen. Die Löschung durch Google bestätigt lediglich, dass die betroffenen Bewertungen gegen geltendes Recht oder die Google-Richtlinien verstoßen haben.

**Data-retention sentence — DECIDED (option A, 2026-07-02):** the recommended disclaimer template contained a final sentence: *"Es werden keine historischen Daten über das von Google vorgegebene 12-Monats-Fenster hinaus gespeichert."* This sentence is **deliberately NOT used**, because it **would be untrue**: aidos.de intentionally stores its **own monthly snapshots** (`history.jsonl`, "Method D") to reconstruct the cumulative removal trend **beyond** Google's rolling 12-month window — a core feature. **Decision:** keep Method D **for now, until a fuller dedicated legal review of the whole project**; a retention statement will be worded to reflect that we store our own periodic snapshots. **Parked design idea to revisit at that review:** expose beyond-12-month data only in **aggregated/abstract form per industry**, with drill-down breakdowns enabled later, rather than per-business raw history.

---

## 10. Change log

| Date | Version | Change | Legal effect |
|------|---------|--------|--------------|
| 2026-07-02 | 1.0 | Initial PRD for legal review. | — |
| 2026-07-02 | 1.1 | Removed satirical "aidos verdict" from all entry pages. | Removes Schmähkritik/defamation risk of editorial comment. |
| 2026-07-02 | 1.1 | Added `entity-filter.mjs`: auto-exclude namentlich genannte Privatpersonen at discovery + ingest; keep only legal persons & chains. Purged existing DB accordingly (Berlin test set 31 → 23). | Removes bulk of DSGVO / personality-rights exposure. |
| 2026-07-02 | 1.1 | Added per-entry "Wichtiger Hinweis zu den Moderations-Daten" disclaimer. | Clarifies data provenance; rebuts inference of wrongdoing. |
| 2026-07-02 | 1.1 | Flagged conflict: recommended "no storage beyond 12 months" sentence vs. Method D snapshotting. | — |
| 2026-07-02 | 1.2 | **Decided option A**: keep Method D self-collected history until a full dedicated legal review; parked idea to aggregate beyond-12-month data per industry with later drill-downs. | Retention wording deferred to full review. |
| 2026-07-03 | 2.2 | **Consumer-magnet sprint parts B–C.** (Lookup) Homepage "Prüfe ein Unternehmen" search over a generated `lookup.js` index → matches link to entity pages; misses offer a "Unternehmen einreichen" mailto (demand-driven dataset growth). (Linking) `pagemap.js` lets listing modals link to the real entity pages ("Als Seite öffnen"). (Content engine) New `pipeline/content.mjs` auto-generates a **monthly DSA-Report** (`/report/YYYY-MM.html`) — template-only, every figure from real aggregates, neutral wording + disclaimer baked in, NewsArticle JSON-LD; `articles.js` surfaces it on the homepage; included in sitemap. Pipeline: ingest → aggregate → build → content → pages. | Adds the engagement hook + auto content without any fabrication or naming of individuals. |
| 2026-07-03 | 2.1 | **SEO / entity-pages build (consumer-magnet sprint, part A).** New `pipeline/pages.mjs` pre-renders REAL static pages: 67 companies (`/unternehmen/…`), 7 branches (`/branche/…`), city pages (`/stadt/…`), each with server-rendered numbers, unique title/meta-description/OG, JSON-LD BreadcrumbList, canonical, disclaimer, and a crawlable internal link graph (branch pages list companies; company pages link to branch/city). Generated `sitemap.xml` (81 URLs) + `robots.txt`. Homepage branch rows & city cards now link into these pages; added meta/OG to homepage + listing. Reads data.js (nameable-only, suppressed, scored) so no individual/fabricated/suppressed data is ever pre-rendered. Pipeline: ingest → aggregate → build → pages. | Fixes the "zero indexable content / profiles-as-modals" problem without exposing PII. |
| 2026-07-03 | 2.0 | **Legal-hardening pass after Fable review.** (a) CRITICAL: removed all synthetic/placeholder trend charts — build ships ONLY real captured series (0 synthetic), UI hard-gates on `!placeholder`; fabrication disabled in code. (b) Fixed entity-filter gap (name-then-profession) that leaked "Korte Rechtsanwalt"; purged from data.js. (c) **Pseudonymized non-nameable records** — individuals keep NO name/address/contact/coords in db.json, only branch/city/range/rating for stats. (d) Added **Impressum** (§5 DDG, §18 MStV) + **Datenschutzerklärung draft** + **"Daten melden" form** + **takedown registry** (`takedowns.mjs`) with automatic 5-day vorsorgliche Entfernung applied on every build. (e) **Self-hosted fonts** (removed all Google-Fonts hotlinks → 12 local woff2). (f) OSM map ODbL attribution. (g) Neutral wording (no "löschen am meisten"/"stecken dahinter"/trophy), neutral (non-red) score colors, purged dead satirical-verdict code, estimate reframed as "Was-wäre-wenn" scenario w/ inline assumption, corrected the "Google bestätigt … verstoßen" overstatement. | Removes the abmahnfähige items: fabricated charts, leaked individual, missing Impressum/DSE, remote Google Fonts. Still TODO before launch: confirm address/email, de-Google logo colors, lawyer sign-off, per-entity SEO pages. |
| 2026-07-02 | 1.9 | **Person-handling moved from data-layer to display-layer** (per product decision): individuals are now scraped, stored in the internal DB, and counted anonymously in aggregates — but excluded from the browser-shipped `data.js` and from individual display. discover-osm scrapes everyone; ingest stores everyone with a `nameable` flag; build.mjs ships only nameable to `data.js`. Discovery now emits per-city URL lists + per-branch candidate counts (denominator for real "% betroffene"). | Public site still names no individual; internal DB now retains individuals' public records — see §7a note for reviewer. |
| 2026-07-02 | 1.8 | Homepage rebuilt as an **editorial/magazine front page** (NYT/Medium style: masthead, lead story, stat band, branch ranking table, Städte-Auffälligkeits-Index, "DSA-Insights & Analysen" article cards, animated visuals, scroll-reveal, count-ups). **All figures come from real aggregates** (Basismessung Berlin) — the illustrative 142k/84k example numbers were deliberately NOT used; unavailable data (12-month trend, other cities, %-of-all-profiles) is shown as labelled "Basismessung"/"in Erhebung" placeholders, never fabricated. Editorial serif reintroduced for headlines only. | Upholds no-fabrication mission while delivering the requested editorial look. |
| 2026-07-02 | 1.7 | Added two explainer subpages linked in the footer: **"Über aidos"** (`ueber-aidos.html` — mission, how the data analysis & aidos-Score work, explicit "Transparenz statt Anprangern") and **"Rechtslage & Hintergrund"** (`rechtslage.html` — plain-language explanation of why/how companies can get reviews removed: Google policies, German law §§185–187 StGB / §§823,1004 BGB, DSA Art. 16, process, Meinung-vs-Tatsache, pros/cons, links to Google/EU/Gesetze-im-Internet/Verbraucherzentrale). Both carry a "keine Rechtsberatung" disclaimer. | Strengthens neutral-journalism positioning; educates users that removals are legitimate & not proof of wrongdoing. |
| 2026-07-02 | 1.6 | **Neutral/objective reframing** (mission-critical): removed all remaining shame/verdict code & "unzensiert" wording; introduced the **aidos-Score** (per business, neutral 0–100 percentile of removed reviews) shown on profiles, and the **aidos-Index** (per industry, conspicuousness 0–100) on the homepage — both framed as descriptive statistical indices, explicitly "kein Werturteil". Editorial headlines switched from serif to sans. Google-Maps link shortened & moved. | Replaces satirical framing with neutral statistical language — lowers defamation risk, supports the objective-journalism positioning. |
| 2026-07-02 | 1.5 | Extension hardened to **v0.5** (reliable rating/reviews, real photos not map-tiles, reliable website) + forward-looking capture for meta-analysis: full star distribution (dist_1..5), price level, business status. Profile pages now link to Google Maps + show a free OpenStreetMap map snippet. Applied a **Material Design 3** styling layer (shape scale, elevation, state layers, Material chips/buttons/app bar) across both pages. | No legal change; capture stays public-data-only. |
| 2026-07-02 | 1.4 | Data-quality fixes: discard ratings that are misparsed German-thousands review counts (showed false low stars); fixed brand-rating aggregation that treated missing ratings as 0★ (Holmes Place showed 0,9 → now 4,5); drop Google static-map thumbnails as avatars, restore brand logos for chains; removed rank-number badges from listing icons. **Single-location small businesses (e.g. Arztpraxen) are no longer listed individually** — only chains, legal persons (GmbH/AG…) and larger operations (≥400 reviews) appear on the listing; the rest count only in the anonymized aggregates. | Reinforces "analyzed, not named"; narrows individual naming to chains/larger companies. |
| 2026-07-02 | 1.3 | Added **mission statement** (objective/neutral data journalism; focus industries/chains/aggregates, not individuals). Restructured to **home (aggregated) → listing → profile** funnel. New **anonymized aggregate feed** (`aggregate.jsonl`, no personal identifiers) powering a Germany-wide insight homepage; insights computed (not fabricated), trends gated to ≥2 snapshots. Name-based industry/city inference. | Aggregate insights include full dataset without naming any natural person. |

*Prepared for external legal review. Please flag any factual inaccuracy about the data flows so it can be corrected — the mitigations in §7/§7a are load-bearing for the risk assessment. This document is updated as decisions are made; see the change log in §10 for the latest state.*
