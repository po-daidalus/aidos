// aidos.de — the counterfactual rating model, in one place.
//
// Question: what would a profile's Google rating be if the reviews Google removed after defamation
// complaints still counted? Arithmetically the removed reviews are put back into the displayed
// average:
//
//     ρ' = (S + R·a) / (N + R)      S = ρ·N (displayed star sum), R = removals, a = their star value
//
// TWO UNKNOWNS, VERY DIFFERENT WEIGHT:
//
// `a` — unobservable, because the removed reviews are gone. Removals happen on defamation
//   complaints, so they are negative by construction; the support is 1★–2★. A_MID is measured, not
//   guessed: across all profiles with a star distribution, surviving 1★ outnumber 2★ by 1.98 : 1,
//   which gives a mean of 1.335★ (`node pipeline/measure-star-mix.mjs` reproduces it). 3★ are
//   excluded on purpose — they are 58 % of the 1–3★ pool, so including them would pull the mean to
//   2.3★ and roughly halve the reported effect, and a middling 3★ is essentially never removed as
//   defamatory. Sweeping `a` across its entire range moves the median effect by only ~0.1★.
//
// `R` — this is where the uncertainty actually lives. Google publishes a RANGE ("151 bis 200"),
//   and for the heaviest cases only a cap ("über 250") with no upper bound at all. R's published
//   range moves the estimate more than `a` does for 93 % of profiles.
//
// Hence the corridor pairs the extremes so it is a genuine envelope, not a decorative band:
//   est_high = fewest removals × mildest stars  → the effect is AT LEAST this large
//   est_low  = most removals   × harshest stars → and at most this large (undefined when capped)
export const A_LOW = 1, A_MID = 1.335, A_HIGH = 2;

const r2 = (x) => (x == null ? null : Math.round(x * 100) / 100);

/** Counterfactual rating for a given removal count and assumed star value. */
export const cfRating = (S, N, R, a) => (S + R * a) / (N + R);

/**
 * Corridor for one profile from its displayed rating/count and Google's published range.
 * `est_low === null` with `est_open === true` means "über 250": no upper bound exists, so the
 * corridor is open-ended. The old model silently substituted rmax = rmin there, which collapsed the
 * band to `a`-width alone and gave the most heavily affected profiles the NARROWEST corridor.
 */
export function estimate(rating, reviews, rmin, rmax) {
  const S = rating != null && reviews != null ? rating * reviews : null, N = reviews;
  if (S == null || !N || !rmin) return { est_low: null, est_mid: null, est_high: null, est_open: false };
  const capped = !rmax;
  return {
    est_high: r2(cfRating(S, N, rmin, A_HIGH)),
    est_mid: r2(cfRating(S, N, capped ? rmin : (rmin + rmax) / 2, A_MID)),
    est_low: capped ? null : r2(cfRating(S, N, rmax, A_LOW)),
    est_open: capped,
  };
}

/**
 * Lower bound on the number of reviews removed across our OWN monthly snapshots.
 *
 * Google reports a ROLLING 365-day sum, so two readings a month apart overlap by 11/12 — adding
 * them up would be plain wrong ("151–200" in July and again in August is usually the SAME removals,
 * not 400). What is derivable: with W_t the window read in month t and r(m) the unknown removals in
 * calendar month m,
 *
 *     W_t − W_{t−1} = r(t) − r(t−12)   and   r(t−12) ≥ 0   ⇒   r(t) ≥ W_t − W_{t−1}
 *
 * so the total over the observed span is at least the first window plus every observed INCREASE:
 *
 *     cum_min = L_first + Σ_{t>first} max(0, L_t − U_{t−1})
 *
 * Lower band edge for L, upper band edge for U keeps it a true bound. A capped reading has U = ∞
 * and therefore contributes nothing — it can never inflate the figure.
 *
 * With only two months on record this equals the single-window figure for nearly every profile.
 * It diverges as snapshots accumulate, and that divergence is precisely why we measure monthly:
 * removals that aged out of Google's window are invisible to Google's own number but still weigh
 * on the all-time average a visitor sees.
 *
 * @param {Array<{date:string,range_min:number,range_max:number|null}>} snapshots one profile's history
 */
export function cumulativeMin(snapshots) {
  const rows = (snapshots || []).filter((s) => s.range_min != null).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  if (!rows.length) return null;

  // (a) Every single window is a subset of the total, so the largest one read so far is a floor.
  const single = Math.max(...rows.map((s) => s.range_min));

  // (b) First window plus every observed increase (derivation above). Sharper than (a) whenever a
  //     profile keeps gaining removals faster than old ones age out.
  let incremental = rows[0].range_min;
  for (let i = 1; i < rows.length; i++) {
    const U = rows[i - 1].range_max ?? Infinity;
    if (Number.isFinite(U)) incremental += Math.max(0, rows[i].range_min - U);
  }

  // (c) Windows that do not overlap count fully and independently. Adjacent differences telescope
  //     and lose that, so pick greedily from the oldest reading onwards in ≥12-month steps. Needs a
  //     year of snapshots before it can beat (a) or (b) — this is the term that keeps the floor
  //     rising for a profile whose removals merely continue at a steady rate.
  const mi = (d) => { const [y, m] = String(d).split('-').map(Number); return y * 12 + (m - 1); };
  let disjoint = 0, lastTaken = -Infinity;
  for (const s of rows) if (mi(s.date) - lastTaken >= 12) { disjoint += s.range_min; lastTaken = mi(s.date); }

  return Math.max(single, incremental, disjoint);
}
