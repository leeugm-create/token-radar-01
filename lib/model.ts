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
export const MODEL_VERSION = 'radar-2';

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

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  global_multiple: number;
  multiples: CategoryMultiple[];
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
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
 * The market's own multiples, from the snapshot's live-token protocols: each category's median
 * mcap/TVL, shrunk toward the market-wide median in proportion to its sample, then clamped.
 * A category the market has never priced falls back to the market-wide median itself.
 */
export function categoryMultiples(snapshot: Snapshot, model: ModelConstants = MODEL): { byCategory: Map<string, CategoryPricing>; global: number } {
  const ratios = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of snapshot.protocols) {
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
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
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
  return scored.map((s, i) => ({
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
    model: {
      base_multiple: round4(s.baseMultiple),
      comparables: s.comparables,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
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

/** The gas estimate for one interaction on `chain`, as words a plan can carry. */
function gasWords(chain: string): string {
  const gas = CHAIN_GAS[chain] ?? 0.5;
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
    base_multiple: row.model.base_multiple,
    comparables: row.model.comparables,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    watchlist: watchlist.has(row.slug),
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const pricing = categoryMultiples(snapshot, model);
  const watchlist = new Set(snapshot.watchlist);
  const early = board.filter((r) => !watchlist.has(r.slug)).length;
  const multiples: CategoryMultiple[] = [...pricing.byCategory.entries()]
    .map(([category, v]) => ({ category, multiple: round4(v.multiple), comparables: v.comparables }))
    .sort((a, b) => b.comparables - a.comparables || (a.category < b.category ? -1 : 1))
    .slice(0, 14);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    global_multiple: round4(pricing.global),
    multiples,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
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
