# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/leeugm-create/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/leeugm-create/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar built from a sealed DefiLlama snapshot of 758 protocols. Each category is priced at the market's own median mcap/TVL taken from the snapshot's 129 live-token protocols, shrunk toward the market median by sample size, and implied value = TVL x category multiple x 7d-growth multiplier x maturity multiplier. The board ranks 216 pre-token protocols - all 40 watchlist names plus an early set picked by a radar score rather than raw TVL - each with a concrete farm plan with capital tiers and per-chain gas costs. The dashboard is a fully offline page: sortable columns, category/chain/status filters, and a detail view per protocol showing the model arithmetic.

## Run it

```sh
MAKEFUN_OUTPUT_DIR=out node main.ts --input /path/to/snapshot.json
```

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
