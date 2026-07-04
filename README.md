# aidos.de

Transparency site ranking German companies by the number of Google Maps reviews
removed due to **defamation complaints under German law** (the banner Google has
shown on German business profiles since 2026-04-26).

## Status
Proof-of-data spike. Go/no-go question: does Apify's `compass/crawler-google-places`
actor return the defamation-removal banner in its output?

Known-positive test case: **Holmes Place Fitness – Neuköln (Berlin)** → expect
range "151 bis 200".

## Method (planned)
- **Data source:** Apify Google Maps scraper (`compass/crawler-google-places`).
- **Seed:** narrow, high-suspicion industries (health, legal, trades, food, automotive, fitness) in top German cities.
- **Ranking:** parse banner range ("X bis Y" / "über 250") → range_min/range_max; sort desc.
- **Site (later):** Astro static, data baked at build time.

## Setup
Copy `.env.example` to `.env` and set `APIFY_TOKEN`. Never commit `.env`.

## Legal
Republishes Google's own public banner data. Neutral framing + methodology page;
ranges are not exact counts; 365-day rolling window; German-law defamation only.
