# aidos

Live at **[aidos.tech](https://aidos.tech)** — independent data journalism on Google Maps reviews
removed after **defamation complaints under German law**. Since 2026-04-26 Google shows a
transparency notice on German business profiles ("X bis Y Bewertungen … entfernt"). aidos
records that notice systematically, city by city, and also counts the profiles **without** it,
so the share of affected businesses is measured rather than guessed.

Mission and tone: neutral, no verdicts, every figure traceable to a capture. Methodology is
public at [aidos.tech/methodik](https://aidos.tech/methodik).

## How the data is collected

There is no scraping API. Capture runs in Chrome through the extension in `extension/`
(Manifest V3, currently v1.2.7): it opens each profile from a URL list, reads the notice, the
star distribution and the review history, and exports a JSON file.

Two runs, described in [`docs/RUNBOOK-monthly-sweep.md`](docs/RUNBOOK-monthly-sweep.md):

| Run | Cadence | What it measures |
|---|---|---|
| **Panel** | every month | the same known businesses again — the time series of every public profile |
| **Screening** | rotating between cities | every candidate profile of one city, notice or not — finds new cases and the share per city |

Google only publishes a rolling 365-day range, so a missed panel month can never be recovered.

## Pipeline

```bash
node pipeline/make-sweep.mjs <YYYY-MM>          # URL lists for panel + screening
node pipeline/archive-export.mjs <export.json>  # always first: keep the raw export
node pipeline/split-run.mjs <export.json>       # one file per city
node pipeline/ingest.mjs <file> --city=<Stadt> [--no-checks for panel runs]
node pipeline/aggregate.mjs && node pipeline/build.mjs && node pipeline/measure-star-mix.mjs
node pipeline/content.mjs --llm                 # monthly report; needs ANTHROPIC_API_KEY
node pipeline/og-image.mjs && node pipeline/fetch-logos.mjs && node pipeline/pages.mjs
node pipeline/traffic.mjs                       # tracker-free visitor numbers from Cloudflare
```

`pipeline/out/` is tracked on purpose: `db.json` and `history.jsonl` are the irreplaceable panel.

## Site

Static files in `dashboard/` (DE + `/en/`), deployed to Cloudflare Pages project `aidos`.
Every change goes to the `preview` branch first and is reviewed before production:

```bash
npx wrangler pages deploy dashboard --project-name=aidos --branch=preview --commit-dirty=true
```

No trackers, no cookies, self-hosted fonts — the privacy promise on every page depends on it.

## Setup

Copy `.env.example` to `.env` and set `ANTHROPIC_API_KEY`. Never commit `.env` or
`pipeline/.salt`.

## Legal

aidos republishes Google's own public notice. Ranges are not exact counts, the window is a
rolling 365 days, natural persons are excluded, and every profile carries a disclaimer. Open
points for counsel: [`docs/LAWYER-BRIEF.md`](docs/LAWYER-BRIEF.md).
