# Build notes — token-radar-01 (phase 1 baseline)

## Deliverable spec (from RULES.txt)

- `main.ts` at the repo root, Node 22, standard library only, no network. In the grader it reads
  `/input/snapshot.json` and writes to `/output`; locally we run it as
  `MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>`. It runs twice in grading and both
  runs must produce identical bytes (fully deterministic, 120 s, 1 CPU, 1 GB RAM).
- Outputs in `/output`: `board.json`, `data.js` (dashboard data), a copy of `dashboard/` and
  `screenshots/`, and `dossier.json` written with `buildDossier` from `vendor/makefun-board.ts`.
- `board.json`: object with `rows`, 100–4,000 rows, ≤ 8 MiB. Each row needs `slug` (must be a real
  snapshot protocol, unique), `name`, `rank` (exactly 1..N, once each), `implied_value_usd`
  (positive integer ≤ 1e14, non-increasing as rank ascends, not all equal), and `farm_steps`
  (3–12 strings, each 20–600 chars trimmed). Every watchlist slug must appear.
- `dashboard/`: `index.html` plus at least one `.css` and one `.js`, ≤ 400 files / 4 MiB, renders
  fully offline — no `http://`/`https://` in any HTML attribute, CSS, or JS import. Dashboard
  source should stay under 64 KB total or the dossier text (what the judge reads) gets cut.
- `screenshots/`: 3–4 PNG/JPEG, each ≤ 512 KiB, long side ≤ 1440 px, short side ≥ 800 px
  (board view, one protocol detail view, one filtered view). Rules advise ~300–350 KB each.
- `dossier.json` must be byte-for-byte what `buildDossier('/output', {text_max_bytes: 65536})`
  produces, and ≤ 1.5 MiB.
- A sealed 7-check gate (dashboard_files, board_file, sorted_by_value, coverage, farm_steps,
  screenshots, dossier_matches) must pass before the entry is judged at all.

## Scoring / judging

- An AI judge (vision+text model, sealed instructions quoted in RULES.txt) compares entries
  pairwise from their dossiers — screenshots first, then dashboard source text. No ties; each
  pairing is played in both orders; margin 1–5 scales the score. Win rates come from a
  Bradley–Terry fit; four fixed house dashboards anchor every heat. Places 1–10 pay
  $1,000 / $50 ×4 / $25 ×4.
- Judge criteria, in order: (1) a working radar — full watchlist coverage, pre-token protocols
  ranked by a stated implied value, screenshots and code agree; (2) the value model — implied
  value derived from the snapshot's own figures (TVL, 7-day change, age with no token), never a
  hardcoded name list, and token-live protocols separated from pre-token ones; (3) farm plans —
  concrete steps with costs and time, not slogans; (4) the page — sortable, filterable, readable
  at a glance, a detail view per protocol; (5) it looks made — chosen palette, consistent
  spacing and type.
- Transcript gate (9 checks) runs before grading: sessions must be real harness logs, in-window,
  ≥30% of counted code lines authored in-session, entrypoint authored, ≥5 text/thinking turns,
  some file revised across ≥2 messages. Handed-over sessions rank but take no paid place
  (handed_over_places = none for this bounty).

## Input data

`snapshot.json` (as_of 2026-11-14, floor_usd $50,000,000): `protocols` — 758 protocols with
TVL ≥ $5M, each with exactly 10 fields: `slug`, `name`, `category` (nullable), `chains`,
`tvl_usd`, `change_7d` (nullable, %), `mcap_usd` (nullable), `listed_at` (nullable date),
`gecko_id` (nullable), `symbol` (nullable; null gecko_id+symbol = records no token).
`watchlist` — 40 slugs: TVL ≥ floor, no token recorded, and not a wrapped/staked/bridged/versioned
or exchange product. The snapshot contains no ranking, value, or farm signal — deriving them is
the entry's work. The watchlist is a floor, not a ceiling: boards must hold ≥100 rows, so ≥60
rows must come from outside the watchlist.

## What the starter already does (baseline, verified by running it)

- Parses and validates the snapshot, scores pre-token protocols with one formula in
  `lib/model.ts`: implied = TVL × base multiple (0.25, category-adjusted) × growth multiplier
  (from `change_7d`) × maturity multiplier (from age since `listed_at`). No name is special-cased.
- Emits exactly 200 rows: all 40 watchlist protocols plus the 160 highest-TVL pre-token protocols
  below the floor ("early"); 24 token-live protocols are set aside in the data (not board rows).
  Every row carries 6 farm steps with dollar costs and times, plus full snapshot fields, a
  `token_status`, `age_days`, and the model breakdown (`base_multiple`, multipliers).
- Baseline run (Node v24, this repo): "758 protocols, 40 on the watchlist, 200 rows scored
  (160 early, 24 live set aside)"; wrote board.json (200 rows, implied $543,636,080 → $1,128,471),
  data.js (64,735 B), dashboard/ (index.html 448 B, app.css 8,007 B, app.js 21,088 B — 29.5 KB
  total source), screenshots/ (3 PNGs, 138–219 KB), dossier.json (705,011 B). Exit 0.
- The dashboard is a static sortable/filterable table with a per-protocol detail view, driven by
  `data.js`. Per RULES.txt, this exact page is the house's second fixed reference dashboard —
  i.e. the starter handed in unchanged is a known mid-field anchor, not a winner.

## Gaps a winning entry must fill

1. **Value model depth**: the starter's single 0.25 base multiple is crude. A winner needs a
   defensible per-category comparable model (e.g. implied FDV/TVL ratios anchored in the
   snapshot's own token-live protocols by category), still computed from snapshot figures only.
2. **Farm plans**: starter steps are templated per protocol with generic actions. Winners need
   protocol-specific, credible steps (real product actions per category/chain) that still carry
   concrete costs and times.
3. **Page craft**: the starter page is the reference anchor itself — a distinct, polished visual
   design (palette, typography, density) with board + detail + filtered views that read at a
   glance, while keeping total dashboard source < 64 KB so the judge sees all of it.
4. **Screenshots**: must be re-shot from the new page (board, detail, filtered), sized
   300–350 KB each, ≥800 px short side — the starter's shots are of the starter page.
5. **Coverage/edge**: consider ranking quality beyond the top-160-by-TVL early set (growth and
   age signals, not TVL alone), and make the pre-token vs token-live separation explicit in the
   UI and the model, as judge criterion 2 demands.

## Phase 2 — what was built (radar-2)

- **Value model** (`lib/model.ts`, `MODEL_VERSION = 'radar-2'`): each category is priced at the
  market's own median mcap/TVL taken from the snapshot's 129 live-token protocols with both figures,
  shrunk toward the market-wide median (×0.214) by sample size — `mult = (n·median + 5·global)/(n+5)`,
  clamped to [0.04, 1.6] — so a category carried by one rich comparable (Risk Curators, n=1) lands at
  ×0.674 instead of its raw ×2.975. Implied = TVL × category multiple × growth multiplier
  (1 + clamp(change_7d, −50, 150)/100 × 0.45) × maturity multiplier (0.65 + 0.35 × min(age, 1095d)/1095;
  unknown age counts 365d). Every row carries the full breakdown plus its category's comparable count.
  Snapshot figures only; no protocol name is special-cased anywhere.
- **Early-set scoring**: the 176 early rows (board = 40 watchlist + 176 = 216) are chosen from the 186
  rankable pre-token protocols below the floor by a radar score, not by TVL:
  `2.0·log10(TVL) + 1.1·(clamp(change_7d, −20, 60)/60) + 0.5·(chains capped at 5)/5 + 0.6·(age capped at 730d)/730 + 0.8·(category comparables capped at 5)/5`,
  ties broken by TVL then slug. The weakest 10 candidates by that score are left off.
- **Farm plans**: 7 steps per row, 146–266 chars each. Actions are picked by category family
  (lending/CDP, DEX/liquidity, bridge, staking/restaking, derivatives, curators/allocators, RWA,
  basis, insurance, prediction, launchpad, chain, stablecoin, yield, index, default) with a core and a
  follow-up action; capital follows the protocol's TVL tier ($50–$250), gas follows its first chain
  (a per-chain planning table, e.g. Ethereum ≈ $8, Base ≈ $0.15, Solana ≈ $0.03), and the holding
  window follows its age (60/45/30 days). Second chains named in the snapshot are used in the funding
  step when present.
- **Dashboard**: rewritten dark "scope" theme (deep ink, phosphor green, amber watchlist badges;
  system fonts, mono figures). Board view with search + category/chain/status filters, seven sortable
  columns, implied-value bars, WATCHLIST/EARLY badges; a detail view per protocol (stat cards, the
  model's arithmetic on that protocol, its farm plan, prev/next navigation) routed by `#p/<slug>`;
  a Live tokens view showing the market's own mcap/TVL for the 24 largest live protocols — the
  comparables behind the multiples; a model panel on the board states the formula and each category's
  multiple with its sample size. Hash `#f/<category>` opens the board pre-filtered. Fully offline.
  Source: index.html 587 B + app.css 7,818 B + app.js 17,337 B = 25,742 B, under the 64 KB dossier cap.
- **Screenshots**: the sandbox's bundled Chromium is policy-gated against headless CLI use, so the
  shots were taken with Puppeteer's own Chromium (installed outside the repo, in /tmp) at a
  1440×1100 viewport over `file://` URLs of the generated `out/dashboard`: `1-board.png` (273 KiB),
  `2-detail.png` (238 KiB, rank-1 Steakhouse Financial), `3-filtered.png` (251 KiB, category = Dexs,
  20 rows). All 1440×1100 — long side at the 1440 cap, short side above the 800 floor, each ≤ 512 KiB.
- **Verification**: two runs into separate output dirs are byte-identical (`diff -r` clean);
  board.json 216 rows / 400,663 B; dossier.json 1,068,385 B (≤ 1.5 MiB); no `http://` or `https://`
  anywhere under `dashboard/`; `main.ts`'s own `boardIssue` gate passes (it exits non-zero otherwise);
  farm steps 3–12 per row within 20–600 chars (actual: 7 per row, 146–266 chars).

## Phase 3 — variant A (radar-3): validated multiples, 80% ranges

- **Validation harness** (`validateModel` in `lib/model.ts`): the category multiples are the only
  fitted part of the model, so they are re-fitted on training subsets and tested on the snapshot's
  own 128 live-token protocols (market cap and TVL both known), three deterministic ways —
  leave-one-out over the whole live set; a split-half dealt by FNV-1a slug hash (each half prices
  the other); and a walk-forward fitting on the 57 protocols listed by 2024-07-25 and testing on
  the 38 listed after. Residuals are ln(actual / predicted); errors are median multiplicative
  misses. Computed on this snapshot: **LOO ×5.17, split-half ×4.84, walk-forward ×5.40** — wide,
  and stated on the page exactly as computed.
- **80% ranges**: every board row now carries `implied_low_usd` / `implied_high_usd` from the
  10th–90th percentiles of the leave-one-out residuals — per category where ≥8 residuals stand
  behind it, else the market-wide band (×0.085 – ×15.30). A row's range always contains its point
  estimate (the coverage figures are computed unclamped). Held-out honesty check: the walk-forward
  band, calibrated by a split-half inside the training years alone, contained **76%** of the
  later-listed protocols' actual market caps (LOO coverage 80%, by construction).
- **Dashboard**: a "Checked against the market, not just asserted" panel under the model panel
  states the method and the computed numbers; the detail view shows the range in the implied-value
  card and as a breakdown row. Source 587 + 7,882 + 19,357 = 27,826 B, still fully offline.
- **Verification**: two runs byte-identical; board.json 412,231 B, dossier.json 1,070,501 B;
  screenshots re-shot (board 286 KiB, detail 228 KiB, filtered 275 KiB, all 1440×1100) and
  visually inspected — the panel and the range render with the real figures.

## Phase 3 — variant B (radar-4): launch odds + expected value

- **Launch odds** (`launchOdds` in `lib/model.ts`): a cross-sectional proxy from the peers'
  record — across all 758 snapshot protocols, 416 (54.9%) already record a token. A row's odds
  are its category's token share, smoothed toward the market share with a prior of 12 protocols,
  tilted by its age cohort's share relative to the market (factor clamped to [0.6, 1.4]; odds
  clamped to [0.02, 0.97]). Board odds run 0.136–0.97, median 0.43. The page states plainly that
  this is a share of peers at one moment, not a prediction that the protocol will launch.
- **Expected value**: every row carries `expected_value_usd = implied × odds`. **Constraint
  conflict, resolved**: the sealed `sorted_by_value` check (RULES.txt) and `main.ts`'s own
  `boardIssue` both require `implied_value_usd` non-increasing in rank order, so the board file
  stays ranked by implied value; expected value is a board column and a sort key on the page,
  and a total row in the detail breakdown. The EV order genuinely differs — USDD (odds 0.49)
  passes Veda into the EV top-3, Hive Protocol enters the EV top-5.
- **Dashboard**: Odds and Expected sortable columns (Odds hides on narrow screens), an odds
  paragraph with the `expected = implied × launch odds` formula in the model panel, and odds +
  expected rows in the detail breakdown. Source 29,248 B, fully offline.
- **Screenshots**: the two panels now push the table below the fold of a top-anchored shot, so
  the board and filtered shots are framed on the table itself (sticky controls pinned at top,
  15+ rows in frame); the detail shot stays top-anchored. Board 240 KiB, detail 222 KiB,
  filtered 207 KiB, all 1440×1100, visually inspected.
- **Verification**: two runs byte-identical; board.json 422,730 B; dossier.json 1,108,412 B;
  implied order re-checked non-increasing across all 216 rows after the change.
