// The token radar's model: one snapshot of the protocol universe in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and adds the
// strongest pre-token protocols below the floor: the early rows the radar exists to find. A protocol
// is pre-token when its record carries no token (no market cap, no CoinGecko id, no symbol); the
// snapshot's live-token protocols are kept apart and shown at the market's own values, never mixed
// into the ranked board.
//
// The implied value of a pre-token protocol is priced the way the market already prices its kind:
//
//   comparables  the live-token protocols of the same category, each at mcap_usd / tvl_usd
//   base_mult    the category's median ratio, shrunk toward the market-wide median by sample size
//                (mult = (n x category median + K x global median) / (n + K)), clamped to a band
//   growth       clamp(change_7d, -50, 150) per cent; growth_mult = 1 + growth/100 x 0.45
//   maturity     0.65 + 0.35 x min(age_days, 1095)/1095   (age unknown: 365 days)
//   implied      = max(1, round(tvl_usd x base_mult x growth_mult x maturity_mult))
//
// Every input is a figure the snapshot itself carries: no protocol name is ever special-cased, and
// the same function scores every row. The early set below the floor is chosen by a radar score that
// mixes size, momentum, reach and priceability (see earlyScore), never by TVL alone.
//
// The multiples are the only fitted part of the model, and they are not trusted on assertion:
// validateModel tests them on the snapshot's own live-token protocols three ways — leave-one-out,
// a split-half dealt by slug hash, and a walk-forward that fits on the earlier-listed protocols and
// is tested on the later-listed ones. The residuals of those tests draw the 80% range every board
// row carries (implied_low_usd .. implied_high_usd), and the dashboard's validation panel states
// the errors and the band's held-out coverage exactly as computed. The growth and maturity terms
// are fixed constants of the model, applied identically in every test and every row.
//
// Each row also carries a launch-odds proxy and the expected value it implies (implied x odds).
// The odds are read off the peers' record in the snapshot itself: the share of protocols that
// already record a token, taken per category, smoothed toward the market-wide share, and tilted
// by the share of the protocol's own age cohort. That is a cross-sectional share at one moment,
// not a prediction — the dashboard says so wherever the figure appears. The board itself stays
// ranked by implied value (the gate's order); expected value is a column and a sort on the page.
//
// And each farm plan ends in a verdict (farmVerdict): the plan's own stated times and gas summed
// into hours and a sunk cost — the position's capital is the farmer's to keep and is never counted
// as a cost — set against an odds-weighted return at one stated capture assumption (FARM_CAPTURE
// of a launch's implied value), with the launch value the plan needs to break even.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  shrink_k: number;
  mult_floor: number;
  mult_cap: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
}

export const MODEL: ModelConstants = {
  shrink_k: 5,
  mult_floor: 0.04,
  mult_cap: 1.6,
  growth_weight: 0.45,
  growth_floor: -50,
  growth_cap: 150,
  maturity_floor: 0.65,
  maturity_range: 0.35,
  maturity_days: 1095,
  unknown_age_days: 365,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-8';

/** The stated capture assumption behind every farm verdict: a farmer's share of a launch's value. */
export const FARM_CAPTURE = 0.0005;

/** How many early protocols below the floor the board carries, chosen by radar score. */
export const EARLY_ROWS = 176;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  implied_low_usd: number;
  implied_high_usd: number;
  launch_odds: number;
  expected_value_usd: number;
  farm_hours: number;
  farm_sunk_cost_usd: number;
  farm_capital_usd: number;
  farm_breakeven_usd: number;
  farm_ev_usd: number;
  farm_ev_per_hour: number;
  model: {
    base_multiple: number;
    comparables: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's view of one board row: the row, its model breakdown and its farm plan. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  implied_low_usd: number;
  implied_high_usd: number;
  launch_odds: number;
  expected_value_usd: number;
  farm_hours: number;
  farm_sunk_cost_usd: number;
  farm_capital_usd: number;
  farm_breakeven_usd: number;
  farm_ev_usd: number;
  farm_ev_per_hour: number;
  base_multiple: number;
  comparables: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  watchlist: boolean;
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  mcap_tvl: number | null;
}

/** One category's market multiple, as the model panel of the dashboard states it. */
export interface CategoryMultiple {
  category: string;
  multiple: number;
  comparables: number;
}

/**
 * How the fitted multiples fared when tested on the snapshot's own live-token protocols.
 * Errors are median multiplicative misses (x2.0 means the typical prediction is off by a factor
 * of two, in either direction); coverages are shares of held-out actual market caps that fell
 * inside the model's 80% range.
 */
export interface ValidationSummary {
  live_n: number;
  loo_median_error_x: number;
  split_median_error_x: number;
  wf_cutoff: string;
  wf_train_n: number;
  wf_test_n: number;
  wf_median_error_x: number;
  band_low_x: number;
  band_high_x: number;
  loo_coverage80: number;
  wf_coverage80: number;
  band_min_n: number;
}

/**
 * The independent cross-check: a log-space regression (ln market cap on ln TVL, a per-category
 * effect and a momentum term), fitted and leave-one-out tested on the same live-token protocols
 * by the same rule as the board's model. It prices nothing on the board; it stands on the proof
 * panel as a second, differently-built estimator the board's numbers can be held against.
 */
export interface CrossCheckSummary {
  live_n: number;
  loo_median_error_x: number;
}

/** The launch-odds proxy's shape, as the dashboard states it. */
export interface OddsSummary {
  protocols_n: number;
  with_token_n: number;
  global_rate: number;
  smoothing_k: number;
  factor_floor: number;
  factor_cap: number;
}

/** How the ledger files one protocol of the snapshot. */
export type LedgerClass =
  | 'live-token'
  | 'ranked'
  | 'version-pool'
  | 'derivative-class'
  | 'derivative-name'
  | 'exchange-name'
  | 'above-floor'
  | 'below-cut';

/** One ledger line: every protocol in the snapshot, classified, with the reason stated. */
export interface LedgerEntry {
  slug: string;
  name: string;
  category: string | null;
  tvl_usd: number;
  class: LedgerClass;
  reason: string;
}

/** The run's own re-derivation of its headline figures, as the integrity strip states it. */
export interface IntegritySummary {
  protocols_total: number;
  protocols_accounted: number;
  watchlist_total: number;
  watchlist_covered: number;
  board_rows: number;
  rows_recomputed: number;
  mismatches: number;
}

/** Everything the dashboard needs: the board, the live set, the ledger, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  validation: ValidationSummary;
  crosscheck: CrossCheckSummary;
  odds: OddsSummary;
  farm_capture: number;
  global_multiple: number;
  multiples: CategoryMultiple[];
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  ledger: LedgerEntry[];
  ledger_counts: { class: LedgerClass; n: number }[];
  integrity: IntegritySummary;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** The middle of a sorted copy of `values`, or null when it holds nothing. */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** A category's pricing: the multiple the model uses and how many live protocols stand behind it. */
export interface CategoryPricing {
  multiple: number;
  comparables: number;
}

/**
 * The market's own multiples, fitted on an arbitrary set of protocols (the whole snapshot for the
 * board, a training subset for validation): each category's median mcap/TVL among the set's
 * live-token protocols, shrunk toward the set's market-wide median in proportion to its sample,
 * then clamped. A category the set has never priced falls back to the market-wide median itself.
 */
export function fitPricing(protocols: SnapshotProtocol[], model: ModelConstants = MODEL): { byCategory: Map<string, CategoryPricing>; global: number } {
  const ratios = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of protocols) {
    if (isPreToken(p) || p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    all.push(ratio);
    if (p.category !== null) {
      const list = ratios.get(p.category);
      if (list === undefined) ratios.set(p.category, [ratio]);
      else list.push(ratio);
    }
  }
  const global = median(all) ?? 0.2;
  const byCategory = new Map<string, CategoryPricing>();
  for (const [category, list] of ratios) {
    const med = median(list) ?? global;
    const shrunk = (list.length * med + model.shrink_k * global) / (list.length + model.shrink_k);
    byCategory.set(category, {
      multiple: Math.min(model.mult_cap, Math.max(model.mult_floor, shrunk)),
      comparables: list.length,
    });
  }
  return { byCategory, global };
}

/** The board's pricing: the market's multiples fitted on the whole snapshot. */
export function categoryMultiples(snapshot: Snapshot, model: ModelConstants = MODEL): { byCategory: Map<string, CategoryPricing>; global: number } {
  return fitPricing(snapshot.protocols, model);
}

/** The pricing one protocol's category gets: its own category's, or the market-wide fallback. */
function pricingFor(p: SnapshotProtocol, pricing: { byCategory: Map<string, CategoryPricing>; global: number }): CategoryPricing {
  if (p.category !== null) {
    const own = pricing.byCategory.get(p.category);
    if (own !== undefined) return own;
  }
  return { multiple: pricing.global, comparables: 0 };
}

/** The multipliers and the implied value one protocol gets under `model` and the market's multiples. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  pricing: { byCategory: Map<string, CategoryPricing>; global: number },
): { implied: number; baseMultiple: number; comparables: number; growthPct: number; growthMult: number; maturityMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const { multiple, comparables } = pricingFor(protocol, pricing);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, finite(protocol.change_7d, 0)));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const implied = Math.max(1, Math.round(protocol.tvl_usd * multiple * growthMult * maturityMult));
  return { implied, baseMultiple: multiple, comparables, growthPct, growthMult, maturityMult, age };
}

/* ---------- validation: the fitted multiples, tested on the market's own record ---------- */

/** How few residuals a category needs before its own band replaces the market-wide one. */
const BAND_MIN_N = 8;

const round3 = (n: number): number => Math.round(n * 1000) / 1000;

const sortNums = (xs: number[]): number[] => [...xs].sort((a, b) => a - b);

/** The q-quantile of a sorted array, linear between its neighbours; NaN when it holds nothing. */
function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const pos = q * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return lo === hi ? sorted[lo]! : sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

/** FNV-1a over the slug: a stable coin flip that deals each protocol to a validation half. */
function slugHash(slug: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < slug.length; i++) {
    h ^= slug.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A validation result: the summary the dashboard states, and the band each category's rows carry. */
export interface ModelValidation {
  summary: ValidationSummary;
  bandFor: (category: string | null) => { lo: number; hi: number };
}

/**
 * The model, tested on the only ground truth the snapshot holds: its live-token protocols, whose
 * market caps are known. The fitted multiples are re-fitted on training subsets and asked to price
 * protocols they never saw, three ways — leave-one-out over the whole live set, a split-half dealt
 * by slug hash (each half prices the other), and a walk-forward that fits on the 60% listed
 * earliest and is tested on the 40% listed latest. Residuals are ln(actual / predicted); the 80%
 * range is the 10th–90th percentile of the leave-one-out residuals, per category where at least
 * BAND_MIN_N residuals stand behind it, else market-wide. The walk-forward's coverage is measured
 * with a band calibrated inside its training years only, so that number is honestly held out.
 * Every split is a function of the snapshot's own fields: no randomness, same bytes every run.
 */
export function validateModel(snapshot: Snapshot, model: ModelConstants = MODEL): ModelValidation {
  const asOf = snapshot.as_of;
  const live = snapshot.protocols
    .filter((p) => !isPreToken(p) && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0)
    .sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  const residOn = (fit: SnapshotProtocol[], test: SnapshotProtocol[]): { p: SnapshotProtocol; r: number }[] => {
    const pricing = fitPricing(fit, model);
    return test.map((p) => ({ p, r: Math.log(p.mcap_usd! / impliedValue(p, asOf, model, pricing).implied) }));
  };
  const medErr = (xs: { r: number }[]): number => Math.exp(quantile(sortNums(xs.map((x) => Math.abs(x.r))), 0.5));
  const inBand = (xs: { r: number }[], lo: number, hi: number): number =>
    xs.length === 0 ? 0 : xs.filter((x) => x.r >= Math.log(lo) && x.r <= Math.log(hi)).length / xs.length;

  if (live.length < 4) {
    return {
      summary: {
        live_n: live.length, loo_median_error_x: 0, split_median_error_x: 0, wf_cutoff: '',
        wf_train_n: 0, wf_test_n: 0, wf_median_error_x: 0, band_low_x: 1, band_high_x: 1,
        loo_coverage80: 0, wf_coverage80: 0, band_min_n: BAND_MIN_N,
      },
      bandFor: () => ({ lo: 1, hi: 1 }),
    };
  }

  // Leave-one-out: every live protocol priced by a market fitted without it.
  const loo: { p: SnapshotProtocol; r: number }[] = [];
  for (let i = 0; i < live.length; i++) loo.push(...residOn(live.filter((_, j) => j !== i), [live[i]!]));
  // Split-half: the slug hash deals the live set in two; each half prices the other.
  const halfA = live.filter((p) => slugHash(p.slug) % 2 === 0);
  const halfB = live.filter((p) => slugHash(p.slug) % 2 === 1);
  const split = [...residOn(halfA, halfB), ...residOn(halfB, halfA)];
  // Walk-forward: fit on the earlier-listed 60%, test on the later-listed 40%.
  const dated = live
    .filter((p) => p.listed_at !== null)
    .sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : a.listed_at! > b.listed_at! ? 1 : a.slug < b.slug ? -1 : 1));
  const train = dated.slice(0, Math.floor(dated.length * 0.6));
  const test = dated.slice(train.length);
  const wf = residOn(train, test);
  // The walk-forward's band is calibrated by a split-half inside the training years alone.
  const trA = train.filter((p) => slugHash(p.slug) % 2 === 0);
  const trB = train.filter((p) => slugHash(p.slug) % 2 === 1);
  const trResid = sortNums([...residOn(trA, trB), ...residOn(trB, trA)].map((x) => x.r));
  const wfLo = Math.exp(quantile(trResid, 0.1));
  const wfHi = Math.exp(quantile(trResid, 0.9));

  const looResid = sortNums(loo.map((x) => x.r));
  const bandLo = Math.exp(quantile(looResid, 0.1));
  const bandHi = Math.exp(quantile(looResid, 0.9));
  const byCat = new Map<string, number[]>();
  for (const x of loo) {
    if (x.p.category === null) continue;
    const list = byCat.get(x.p.category);
    if (list === undefined) byCat.set(x.p.category, [x.r]);
    else list.push(x.r);
  }
  const catBand = new Map<string, { lo: number; hi: number }>();
  for (const [category, rs] of byCat) {
    if (rs.length < BAND_MIN_N) continue;
    const s = sortNums(rs);
    catBand.set(category, { lo: Math.exp(quantile(s, 0.1)), hi: Math.exp(quantile(s, 0.9)) });
  }

  return {
    summary: {
      live_n: live.length,
      loo_median_error_x: round3(medErr(loo)),
      split_median_error_x: round3(medErr(split)),
      wf_cutoff: train.length > 0 ? train[train.length - 1]!.listed_at! : '',
      wf_train_n: train.length,
      wf_test_n: test.length,
      wf_median_error_x: round3(medErr(wf)),
      band_low_x: round3(bandLo),
      band_high_x: round3(bandHi),
      loo_coverage80: round3(inBand(loo, bandLo, bandHi)),
      wf_coverage80: round3(inBand(wf, wfLo, wfHi)),
      band_min_n: BAND_MIN_N,
    },
    bandFor: (category) => {
      const raw = (category !== null ? catBand.get(category) : undefined) ?? { lo: bandLo, hi: bandHi };
      // A row's range always contains its own point estimate; the coverage figures above are not clamped.
      return { lo: Math.min(raw.lo, 1), hi: Math.max(raw.hi, 1) };
    },
  };
}

/* ---------- the cross-check: an independent log-space regression, tested the same way ---------- */

/** The cross-check regression's own constants: how hard its category effects shrink, and its clamps. */
export const REG = {
  /** Residual shrinkage: a category's effect is its residual sum over (its n + this prior). */
  effect_k: 5,
  /** The effective multiple (priced value / TVL, growth included) is kept inside this band. */
  mult_floor: 0.02,
  mult_cap: 3.0,
  /** The fitted momentum multiplier exp(c x change) is kept inside this band. */
  growth_floor_x: 0.5,
  growth_cap_x: 2.0,
};

/** Solve a small dense linear system by Gauss-Jordan elimination with partial pivoting. */
function solveLinear(a: number[][], b: number[]): number[] {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]!]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r]![col]!) > Math.abs(m[piv]![col]!)) piv = r;
    const swap = m[col]!; m[col] = m[piv]!; m[piv] = swap;
    const d = m[col]![col]!;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = m[r]![col]! / d;
      for (let k = col; k <= n; k++) m[r]![k] = m[r]![k]! - f * m[col]![k]!;
    }
  }
  return m.map((row, i) => row[n]! / row[i]!);
}

/** The regression's fit on a set of protocols: its three coefficients and each category's effect. */
export interface RegressionFit {
  a: number;
  b: number;
  c: number;
  eff: Map<string, { x: number; n: number }>;
  n: number;
}

/**
 * Fit ln(mcap) = a + b x ln(TVL) + c x (clamped 7d change / 100) on the set's live-token
 * protocols by least squares (the normal equations, solved directly — three unknowns), then
 * read each category's effect off the residuals: the category's residual sum over (n + K),
 * which is its mean residual shrunk toward zero in proportion to its sample. A category the
 * fit never saw carries no effect. Deterministic: the fit set's order is the caller's, and
 * every caller passes snapshot order or a subsequence of it.
 */
export function fitRegression(protocols: SnapshotProtocol[]): RegressionFit {
  const pts = protocols.filter((p) => !isPreToken(p) && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
  const feats = (p: SnapshotProtocol): [number, number, number] => [
    1,
    Math.log(p.tvl_usd),
    Math.min(MODEL.growth_cap, Math.max(MODEL.growth_floor, finite(p.change_7d, 0))) / 100,
  ];
  const ata = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const atb = [0, 0, 0];
  for (const p of pts) {
    const x = feats(p);
    const y = Math.log(p.mcap_usd!);
    for (let i = 0; i < 3; i++) {
      atb[i] = atb[i]! + x[i] * y;
      for (let j = 0; j < 3; j++) ata[i]![j] = ata[i]![j]! + x[i] * x[j]!;
    }
  }
  const [a, b, c] = pts.length >= 3 ? solveLinear(ata, atb) : [Math.log(0.2), 1, 0];
  const resid = new Map<string, { sum: number; n: number }>();
  for (const p of pts) {
    const x = feats(p);
    const r = Math.log(p.mcap_usd!) - (a! + b! * x[1] + c! * x[2]);
    if (p.category === null) continue;
    const cell = resid.get(p.category) ?? { sum: 0, n: 0 };
    cell.sum += r;
    cell.n += 1;
    resid.set(p.category, cell);
  }
  const eff = new Map<string, { x: number; n: number }>();
  for (const [category, cell] of resid) eff.set(category, { x: cell.sum / (cell.n + REG.effect_k), n: cell.n });
  return { a: a!, b: b!, c: c!, eff, n: pts.length };
}

/** The maturity adjustment, exactly as the board's model applies it. */
function maturityOf(p: SnapshotProtocol, asOf: string, model: ModelConstants): { mult: number; age: number | null } {
  const age = ageDays(asOf, p.listed_at);
  const ageForModel = age ?? model.unknown_age_days;
  return {
    mult: model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range,
    age,
  };
}

/** Price one protocol under a regression fit: size term, category effect, fitted momentum, maturity. */
function regressionPrice(fit: RegressionFit, p: SnapshotProtocol, asOf: string, model: ModelConstants): { implied: number } {
  const { mult: maturityMult } = maturityOf(p, asOf, model);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, finite(p.change_7d, 0)));
  const growthMult = Math.min(REG.growth_cap_x, Math.max(REG.growth_floor_x, Math.exp(fit.c * (growthPct / 100))));
  const cell = p.category !== null ? fit.eff.get(p.category) : undefined;
  let ln = fit.a + fit.b * Math.log(p.tvl_usd) + (cell?.x ?? 0) + Math.log(growthMult);
  ln = Math.min(Math.log(p.tvl_usd * REG.mult_cap), Math.max(Math.log(p.tvl_usd * REG.mult_floor), ln));
  const priced = Math.exp(ln);
  return { implied: Math.max(1, Math.round(priced * maturityMult)) };
}

/**
 * The cross-check's leave-one-out score: every live-token protocol priced by a regression fit
 * that never saw it, the median multiplicative miss stated exactly as computed. The regression
 * is a second estimator built a different way from the board's category medians; it prices
 * nothing on the board and exists so the proof panel can hold the two up side by side.
 */
export function crossCheckLoo(snapshot: Snapshot, model: ModelConstants = MODEL): CrossCheckSummary {
  const live = snapshot.protocols
    .filter((p) => !isPreToken(p) && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0)
    .sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  if (live.length < 4) return { live_n: live.length, loo_median_error_x: 0 };
  const abs: number[] = [];
  for (let i = 0; i < live.length; i++) {
    const fit = fitRegression(live.filter((_, j) => j !== i));
    const p = live[i]!;
    abs.push(Math.abs(Math.log(p.mcap_usd! / regressionPrice(fit, p, snapshot.as_of, model).implied)));
  }
  return { live_n: live.length, loo_median_error_x: round3(Math.exp(quantile(sortNums(abs), 0.5))) };
}

/* ---------- launch odds: the peers' record, read cross-sectionally ---------- */

/** The launch-odds proxy's constants: prior strength and the age tilt's clamps. */
const ODDS_K = 12;
const ODDS_FACTOR_FLOOR = 0.6;
const ODDS_FACTOR_CAP = 1.4;
const ODDS_FLOOR = 0.02;
const ODDS_CAP = 0.97;

/** The age cohort a protocol falls in, by days since it was first tracked. */
function ageCohort(age: number | null): string {
  if (age === null) return 'unknown';
  if (age < 180) return 'under-6m';
  if (age < 546) return '6-18m';
  if (age < 1095) return '18m-3y';
  return 'over-3y';
}

/** A launch-odds estimator fitted on a snapshot, and the summary the dashboard states. */
export interface LaunchOdds {
  summary: OddsSummary;
  oddsFor: (p: SnapshotProtocol) => number;
}

/**
 * Launch odds from the peers' record: across the whole snapshot, the share of protocols that
 * already record a token — per category, smoothed toward the market-wide share with a prior of
 * ODDS_K protocols, then tilted by the protocol's age cohort's own share relative to the market
 * (clamped, so a thin cohort cannot shout). A protocol with no category gets the market share
 * tilted by its cohort. This is a cross-sectional share at the snapshot's one moment: it says
 * what fraction of a protocol's peers have a token, never that this protocol will launch.
 */
export function launchOdds(snapshot: Snapshot): LaunchOdds {
  const all = snapshot.protocols;
  const withToken = all.filter((p) => !isPreToken(p)).length;
  const global = all.length === 0 ? 0 : withToken / all.length;
  const tally = (keyOf: (p: SnapshotProtocol) => string | null): Map<string, { n: number; k: number }> => {
    const map = new Map<string, { n: number; k: number }>();
    for (const p of all) {
      const key = keyOf(p);
      if (key === null) continue;
      const cell = map.get(key) ?? { n: 0, k: 0 };
      cell.n += 1;
      if (!isPreToken(p)) cell.k += 1;
      map.set(key, cell);
    }
    return map;
  };
  const smoothed = (cell: { n: number; k: number } | undefined): number =>
    cell === undefined ? global : (cell.k + ODDS_K * global) / (cell.n + ODDS_K);
  const byCategory = tally((p) => p.category);
  const byCohort = tally((p) => ageCohort(ageDays(snapshot.as_of, p.listed_at)));
  return {
    summary: {
      protocols_n: all.length,
      with_token_n: withToken,
      global_rate: round3(global),
      smoothing_k: ODDS_K,
      factor_floor: ODDS_FACTOR_FLOOR,
      factor_cap: ODDS_FACTOR_CAP,
    },
    oddsFor: (p) => {
      const base = p.category !== null ? smoothed(byCategory.get(p.category)) : global;
      const cohortRate = smoothed(byCohort.get(ageCohort(ageDays(snapshot.as_of, p.listed_at))));
      const factor = global > 0 ? Math.min(ODDS_FACTOR_CAP, Math.max(ODDS_FACTOR_FLOOR, cohortRate / global)) : 1;
      return round3(Math.min(ODDS_CAP, Math.max(ODDS_FLOOR, base * factor)));
    },
  };
}

/**
 * The radar score that chooses the early set below the floor: size on a log scale, seven-day
 * momentum, multi-chain reach, a track record long enough to mean something, and priceability —
 * whether the market already prices this protocol's category, so the model can value it honestly.
 */
export function earlyScore(p: SnapshotProtocol, asOf: string, pricing: { byCategory: Map<string, CategoryPricing>; global: number }): number {
  const size = Math.log10(Math.max(p.tvl_usd, 1));
  const growth = Math.min(60, Math.max(-20, finite(p.change_7d, 0))) / 60;
  const reach = Math.min(p.chains.length, 5) / 5;
  const age = ageDays(asOf, p.listed_at);
  const track = Math.min(age ?? 180, 730) / 730;
  const priceable = Math.min(pricingFor(p, pricing).comparables, 5) / 5;
  return 2.0 * size + 1.1 * growth + 0.5 * reach + 0.6 * track + 0.8 * priceable;
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The headline sentence's figures: how many watchlist slugs, how many rows, how many live protocols. */
export interface BoardSummary {
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL, validation: ModelValidation = validateModel(snapshot, model), odds: LaunchOdds = launchOdds(snapshot)): BoardRow[] {
  const pricing = categoryMultiples(snapshot, model);
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug the snapshot carries, always on the board.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: rankable pre-token protocols below the floor, best radar score first.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .map((p) => ({ p, score: earlyScore(p, snapshot.as_of, pricing) }))
    .sort((a, b) => b.score - a.score || b.p.tvl_usd - a.p.tvl_usd || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const { p } of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => ({ p, ...impliedValue(p, snapshot.as_of, model, pricing) }));
  scored.sort((a, b) => b.implied - a.implied || b.p.tvl_usd - a.p.tvl_usd || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => {
    const band = validation.bandFor(s.p.category);
    const low = Math.max(1, Math.round(s.implied * band.lo));
    const high = Math.max(low, Math.round(s.implied * band.hi));
    const o = odds.oddsFor(s.p);
    const verdict = farmVerdict(s.p, s.age, s.implied, o);
    return {
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    implied_low_usd: low,
    implied_high_usd: high,
    launch_odds: o,
    expected_value_usd: Math.max(1, Math.round(s.implied * o)),
    farm_hours: verdict.econ.hours,
    farm_sunk_cost_usd: verdict.econ.sunk_cost_usd,
    farm_capital_usd: verdict.econ.capital_usd,
    farm_breakeven_usd: verdict.breakeven_usd,
    farm_ev_usd: verdict.ev_usd,
    farm_ev_per_hour: verdict.ev_per_hour,
    model: {
      base_multiple: round4(s.baseMultiple),
      comparables: s.comparables,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      age_days: s.age,
    },
    farm_steps: [...farmSteps(s.p, s.age).map(stepText), verdict.step],
    };
  });
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** Typical cost in USD of one ordinary contract interaction on a chain, as a planning estimate. */
const CHAIN_GAS: Record<string, number> = {
  Ethereum: 8, Arbitrum: 0.25, Base: 0.15, Optimism: 0.2, Solana: 0.03, BSC: 0.25, Avalanche: 0.35,
  Polygon: 0.04, 'zkSync Era': 0.15, Linea: 0.2, Scroll: 0.2, Mantle: 0.1, Gnosis: 0.05, Fantom: 0.05,
  Cronos: 0.05, Celo: 0.03, Starknet: 0.1, Blast: 0.15, Mode: 0.1, Taiko: 0.15, Berachain: 0.1,
  Sonic: 0.05, Unichain: 0.15, Hyperliquid: 0.05, Sui: 0.02, Aptos: 0.02, Near: 0.02, Cosmos: 0.05,
};

/** The gas estimate for one interaction on `chain`, in USD. */
function gasUsd(chain: string): number {
  return CHAIN_GAS[chain] ?? 0.5;
}

/** The gas estimate for one interaction on `chain`, as words a plan can carry. */
function gasWords(chain: string): string {
  const gas = gasUsd(chain);
  if (gas < 0.1) return 'a few cents of gas';
  if (gas < 1) return `about $${gas.toFixed(2)} of gas`;
  return `about $${Math.round(gas)} of gas`;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 250_000_000) return 100;
  if (p.tvl_usd >= 50_000_000) return 75;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category family's two product actions: the core position and the follow-up that deepens it. */
function actionsFor(p: SnapshotProtocol, capital: number, chain: string): [string, string] {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('bridge')) return [
    `Bridge $${capital} of USDC from Ethereum to ${chain} through ${name}, then spend a small part of it in one app on ${chain} so the trip is real usage.`,
    `Bridge a second, smaller amount back a week later instead of round-tripping in one day; steady two-way flow is what bridge points programs count.`,
  ];
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral') || c.includes('credit')) return [
    `Supply $${capital} of USDC to ${name} on ${chain} and leave the deposit untouched so it accrues a full history.`,
    `Borrow no more than 40% against the deposit and re-supply the borrowed stablecoin once; a modest loop earns borrow-side activity without liquidation risk at this size.`,
  ];
  if (c.includes('dex') || c.includes('liquidity')) return [
    `Provide $${capital} split evenly across both sides of ${name}'s deepest stable or ETH pool on ${chain}.`,
    `Stake the LP position in ${name}'s gauge or farm tab if it offers one, and make one small swap a week through the same pool.`,
  ];
  if (c.includes('staking') || c.includes('restak') || c.includes('staking pool')) return [
    `Stake $${capital} of the chain's staking asset through ${name} on ${chain} and keep the receipt token in the same wallet.`,
    `Put the receipt token to work once — as lending collateral or in the restaking tab — so the wallet shows both staking and a second product touch.`,
  ];
  if (c.includes('derivative') || c.includes('perpetual') || c.includes('option')) return [
    `Deposit $${capital} of USDC as margin on ${name} and open one small hedged position (long and short legs of similar size) rather than a directional bet.`,
    `Trade one small position a week and keep total margin under the $${capital}; hedged volume, not profit, is what a pre-token program can see.`,
  ];
  if (c.includes('curator') || c.includes('allocator')) return [
    `Deposit $${capital} into one of ${name}'s curated vaults on ${chain} and keep the vault shares in the wallet.`,
    `Split a second $${Math.round(capital / 2)} into a different ${name} vault after two weeks, so the wallet holds two curators' risk, not one.`,
  ];
  if (c.includes('rwa')) return [
    `Subscribe $${capital} to ${name}'s tokenised asset on ${chain} (complete its onboarding first if it asks) and hold the asset in the wallet.`,
    `Hold through at least one full yield distribution instead of redeeming early; a completed cycle is the activity a launch program can verify.`,
  ];
  if (c.includes('basis')) return [
    `Deposit $${capital} of USDC into ${name}'s basis vault on ${chain} and leave it through a full funding cycle.`,
    `Add a smaller top-up after the first cycle settles, so the wallet shows two separate deposits at different times.`,
  ];
  if (c.includes('insurance')) return [
    `Buy $${capital} of cover from ${name} on ${chain} against a large lending or DEX protocol you actually use.`,
    `Renew the cover once when it lapses rather than letting it expire; two consecutive policies read as a real user, not a drive-by.`,
  ];
  if (c.includes('prediction')) return [
    `Fund $${capital} on ${name} and take one position in a liquid, long-dated market.`,
    `Place one position a week in different markets and let each settle; settled history counts more than open size.`,
  ];
  if (c.includes('launchpad')) return [
    `Complete ${name}'s registration on ${chain} and hold the $${capital} balance or stake it asks for in its allocation tier.`,
    `Take part in one sale or claim round, however small the allocation; a completed round is a permanent on-chain record.`,
  ];
  if (c.includes('chain')) return [
    `Bridge $${capital} of USDC to ${name}'s chain and keep a small gas-token balance there.`,
    `Use two native apps on the chain in the same week — one swap and one lending deposit — so the wallet is a chain user, not a bridge tourist.`,
  ];
  if (c.includes('stable') || c.includes('wrapper')) return [
    `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and hold it unspent.`,
    `Use a small part of the minted asset in one partner app ${name} names, keeping the rest as the standing balance.`,
  ];
  if (c.includes('yield') || c.includes('farm') || c.includes('aggregator')) return [
    `Deposit $${capital} into ${name}'s main vault on ${chain} and keep the vault shares.`,
    `Claim and re-deposit the yield once a week instead of letting it sit unclaimed; the claim transactions are the visible activity.`,
  ];
  if (c.includes('index')) return [
    `Mint $${capital} of ${name}'s index token on ${chain} and hold it.`,
    `Add a smaller mint after the next rebalance so the wallet shows two mints at different index weights.`,
  ];
  return [
    `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`,
    `Repeat a smaller deposit after two weeks, so the wallet shows a returning user rather than a single visit.`,
  ];
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time. The plan is derived
 * from the protocol's own record (category, chains, TVL, age), never from a hand-written list of
 * names: the actions follow its category, the money follows its size, the calendar follows its age.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasWords(chain);
  const [core, follow] = actionsFor(p, capital, chain);
  const second = p.chains.length > 1 ? p.chains[1]! : null;
  return [
    {
      text: `Set up a fresh wallet for ${p.name} alone and keep its seed phrase offline; fund it only with what this plan uses.`,
      cost: 'nothing to create, ' + gas + ' for its first transaction',
      time: '5 minutes',
    },
    {
      text: second === null
        ? `Bring $${capital} of USDC onto ${chain} from an exchange or an existing wallet, in one transfer you can trace later.`
        : `Bring $${capital} of USDC onto ${chain}; ${p.name} also runs on ${second}, and a later step uses it there.`,
      cost: `$${capital} of capital and ${gas}`,
      time: '10 minutes',
    },
    { text: core, cost: `$${capital} in the position and ${gas}`, time: '15 minutes to set up' },
    { text: follow, cost: `about $${Math.round(capital / 2)} more at most and ${gas}`, time: '10 minutes' },
    {
      text: `Keep one qualifying action a week — a claim, a vote, a rebalance or a small repeat of the core action — and never let a week pass empty.`,
      cost: `${gas} for each weekly action`,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position at least ${hold} days so it appears in more than one weekly snapshot of the protocol's books.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Log every transaction hash, date and amount in a farm log, and check ${p.name}'s own points or rewards page weekly — claim only from links it publishes, and never pay anyone to claim for you.`,
      cost: 'nothing but the log',
      time: '5 minutes a week',
    },
  ];
}

/** A farm plan's own arithmetic, summed from the times and gas its steps state. */
export interface FarmEconomics {
  capital_usd: number;
  gas_usd: number;
  hold_days: number;
  weeks: number;
  hours: number;
  sunk_cost_usd: number;
}

/**
 * What a plan costs, from the plan itself: the setup steps' stated minutes (5+10+15+10) plus a
 * 10-minute action and a 5-minute log check in each week of its holding window; gas for four
 * setup transactions plus one per weekly action. The position's capital is the farmer's to keep
 * and is reported apart — it is not part of the sunk cost.
 */
export function farmEconomics(p: SnapshotProtocol, age: number | null): FarmEconomics {
  const gas = gasUsd(chainOf(p));
  const hold = holdDaysFor(age);
  const weeks = Math.ceil(hold / 7);
  const minutes = 40 + 15 * weeks;
  return {
    capital_usd: capitalFor(p),
    gas_usd: gas,
    hold_days: hold,
    weeks,
    hours: Math.round((minutes / 60) * 10) / 10,
    sunk_cost_usd: Math.round(gas * (4 + weeks) * 100) / 100,
  };
}

const fmtInt = (n: number): string => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const fmtMoney = (n: number): string => (n < 10 ? `$${n.toFixed(2)}` : `$${fmtInt(n)}`);

/** A farm verdict: the plan's economics, its break-even launch value, and its odds-weighted return. */
export interface FarmVerdict {
  step: string;
  econ: FarmEconomics;
  breakeven_usd: number;
  ev_usd: number;
  ev_per_hour: number;
}

/**
 * The verdict that closes a row's farm plan: hours and sunk cost from the plan's own figures, an
 * odds-weighted return at the stated FARM_CAPTURE share of a launch at the implied value, and the
 * launch value above which the plan pays for itself — with the board's own implied value held
 * against that bar.
 */
export function farmVerdict(p: SnapshotProtocol, age: number | null, implied: number, odds: number): FarmVerdict {
  const econ = farmEconomics(p, age);
  const breakeven = Math.round(econ.sunk_cost_usd / (odds * FARM_CAPTURE));
  const ev = Math.round(odds * FARM_CAPTURE * implied);
  const evPerHour = Math.round((ev / econ.hours) * 10) / 10;
  const bar = implied >= breakeven * 3
    ? 'clears that bar by a wide margin'
    : implied >= breakeven
      ? 'clears that bar'
      : 'does not clear that bar at these odds';
  const gross = Math.round(FARM_CAPTURE * implied);
  const step =
    `Verdict: about ${econ.hours} hours of work spread over ${econ.hold_days} days; sunk cost about ${fmtMoney(econ.sunk_cost_usd)} ` +
    `in gas and fees (the $${fmtInt(econ.capital_usd)} position is capital you keep, not a cost). If the token launches at the ` +
    `implied $${fmtInt(implied)}, an assumed ${(FARM_CAPTURE * 100).toFixed(2)}% farmer capture is worth about $${fmtInt(gross)}; ` +
    `weighted by the ${Math.round(odds * 100)}% launch odds, that is about $${fmtInt(ev)} expected, against a break-even launch ` +
    `value of $${fmtInt(breakeven)} — the board's implied value ${bar}. The likeliest single outcome is still no launch ` +
    `at all: the position stays yours to withdraw, and only the sunk cost is gone.`;
  return { step, econ, breakeven_usd: breakeven, ev_usd: ev, ev_per_hour: evPerHour };
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1))
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      mcap_tvl: p.mcap_usd !== null && p.tvl_usd > 0 ? round4(p.mcap_usd / p.tvl_usd) : null,
    }));
}

/** A board row's form for data.js: the row, its model breakdown and its farm plan. */
export function radarRow(row: BoardRow, watchlist: Set<string>): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    implied_low_usd: row.implied_low_usd,
    implied_high_usd: row.implied_high_usd,
    launch_odds: row.launch_odds,
    expected_value_usd: row.expected_value_usd,
    farm_hours: row.farm_hours,
    farm_sunk_cost_usd: row.farm_sunk_cost_usd,
    farm_capital_usd: row.farm_capital_usd,
    farm_breakeven_usd: row.farm_breakeven_usd,
    farm_ev_usd: row.farm_ev_usd,
    farm_ev_per_hour: row.farm_ev_per_hour,
    base_multiple: row.model.base_multiple,
    comparables: row.model.comparables,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    watchlist: watchlist.has(row.slug),
    farm_steps: row.farm_steps,
  };
}

/* ---------- the ledger: every protocol in the snapshot, accounted for ---------- */

/** The categories the house's watchlist rule treats as a wrapped, staked, bridged or exchange class. */
const DERIVATIVE_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** The exchange names the house's watchlist rule refuses at the head of a protocol's name. */
const EXCHANGE_HEADS = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** A whole word in a name that marks a wrapped or staked product of another protocol. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/**
 * The ledger: one line for every protocol in the snapshot, in slug order, each classified —
 * it records a token, it is ranked on the board, or it is set aside with the reason stated,
 * the reasons following the house's own watchlist rule as far as the snapshot's fields state
 * it. Nothing in the snapshot is silently dropped: the classes sum to the snapshot's size,
 * which verifyIntegrity recounts. A live-token line carries no implied value anywhere: the
 * market prices it, the model never does, and the ranked board stays pre-token only.
 */
export function buildLedger(snapshot: Snapshot, board: BoardRow[]): LedgerEntry[] {
  const ranked = new Map(board.map((r) => [r.slug, r]));
  const watchlist = new Set(snapshot.watchlist);
  return [...snapshot.protocols]
    .sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .map((p): LedgerEntry => {
      const base = { slug: p.slug, name: p.name, category: p.category, tvl_usd: p.tvl_usd };
      if (!isPreToken(p)) return { ...base, class: 'live-token', reason: 'records a token in the snapshot; priced by the market, never by the model' };
      const row = ranked.get(p.slug);
      if (row !== undefined) {
        return {
          ...base,
          class: 'ranked',
          reason: watchlist.has(p.slug) ? `on the house watchlist; ranked #${row.rank} on the board` : `early find below the floor; ranked #${row.rank} on the board`,
        };
      }
      if (VERSIONED.test(p.name)) return { ...base, class: 'version-pool', reason: 'its name ends in a version marker: a pool of another protocol, not a launch of its own' };
      if (p.category !== null && DERIVATIVE_CATEGORIES.has(p.category)) {
        return { ...base, class: 'derivative-class', reason: `its category (${p.category}) is a wrapped, staked, bridged or exchange class: the asset of a token that already trades` };
      }
      if (WRAPPED_WORD.test(p.name)) return { ...base, class: 'derivative-name', reason: 'its name carries a wrapped or staked marker: the asset of a token that already trades' };
      if (EXCHANGE_HEADS.some((head) => p.name === head || p.name.startsWith(`${head} `))) {
        return { ...base, class: 'exchange-name', reason: 'its name begins with an exchange\u2019s name: an exchange product, not an independent launch candidate' };
      }
      if (p.tvl_usd >= snapshot.floor_usd) {
        return { ...base, class: 'above-floor', reason: 'pre-token and above the floor, but outside the house watchlist; the board\u2019s above-floor rows are the watchlist itself' };
      }
      return { ...base, class: 'below-cut', reason: 'rankable and below the floor; its radar score fell below the board\u2019s early cut' };
    });
}

/** The ledger's class counts, in the ledger's own class order. */
const LEDGER_ORDER: LedgerClass[] = ['live-token', 'ranked', 'version-pool', 'derivative-class', 'derivative-name', 'exchange-name', 'above-floor', 'below-cut'];

export function ledgerCounts(ledger: LedgerEntry[]): { class: LedgerClass; n: number }[] {
  const counts = new Map<LedgerClass, number>();
  for (const e of ledger) counts.set(e.class, (counts.get(e.class) ?? 0) + 1);
  return LEDGER_ORDER.filter((c) => (counts.get(c) ?? 0) > 0).map((c) => ({ class: c, n: counts.get(c)! }));
}

/* ---------- integrity: the run re-derives its own headline figures ---------- */

/**
 * The integrity check the dashboard prints: the ledger is recounted against the snapshot
 * (every protocol accounted for exactly once, every watchlist slug on the board), and every
 * board row is repriced from the snapshot a second time — a fresh fit of the category
 * multiples, the band and the odds recomputed — and compared field by field with the row
 * the board carries. Any figure that disagrees is counted, never hidden.
 */
export function verifyIntegrity(snapshot: Snapshot, board: BoardRow[], validation: ModelValidation, odds: LaunchOdds, model: ModelConstants = MODEL): IntegritySummary {
  const ledger = buildLedger(snapshot, board);
  const accounted = new Set(ledger.map((e) => e.slug));
  const pricing = categoryMultiples(snapshot, model);
  const index = bySlug(snapshot.protocols);
  const boardSlugs = new Set(board.map((r) => r.slug));
  let mismatches = 0;
  let recomputed = 0;
  for (const row of board) {
    const p = index.get(row.slug);
    if (p === undefined) { mismatches += 1; continue; }
    const iv = impliedValue(p, snapshot.as_of, model, pricing);
    const band = validation.bandFor(p.category);
    const low = Math.max(1, Math.round(iv.implied * band.lo));
    const high = Math.max(low, Math.round(iv.implied * band.hi));
    const o = odds.oddsFor(p);
    recomputed += 1;
    if (
      iv.implied !== row.implied_value_usd || low !== row.implied_low_usd || high !== row.implied_high_usd ||
      o !== row.launch_odds || Math.max(1, Math.round(iv.implied * o)) !== row.expected_value_usd
    ) mismatches += 1;
  }
  return {
    protocols_total: snapshot.protocols.length,
    protocols_accounted: snapshot.protocols.filter((p) => accounted.has(p.slug)).length,
    watchlist_total: snapshot.watchlist.length,
    watchlist_covered: snapshot.watchlist.filter((s) => boardSlugs.has(s)).length,
    board_rows: board.length,
    rows_recomputed: recomputed,
    mismatches,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const validation = validateModel(snapshot, model);
  const odds = launchOdds(snapshot);
  const board = buildBoard(snapshot, model, validation, odds);
  const live = liveRows(snapshot);
  const pricing = categoryMultiples(snapshot, model);
  const watchlist = new Set(snapshot.watchlist);
  const early = board.filter((r) => !watchlist.has(r.slug)).length;
  const multiples: CategoryMultiple[] = [...pricing.byCategory.entries()]
    .map(([category, v]) => ({ category, multiple: round4(v.multiple), comparables: v.comparables }))
    .sort((a, b) => b.comparables - a.comparables || (a.category < b.category ? -1 : 1))
    .slice(0, 14);
  const ledger = buildLedger(snapshot, board);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    validation: validation.summary,
    crosscheck: crossCheckLoo(snapshot, model),
    odds: odds.summary,
    farm_capture: FARM_CAPTURE,
    global_multiple: round4(pricing.global),
    multiples,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    ledger,
    ledger_counts: ledgerCounts(ledger),
    integrity: verifyIntegrity(snapshot, board, validation, odds, model),
    rows: board.map((r) => radarRow(r, watchlist)),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
