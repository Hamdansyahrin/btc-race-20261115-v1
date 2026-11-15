# btc-race-20261115-v1

[![make.fun · btc-race-24h-20261115-0828](https://make.fun/badge/btc-race-24h-20261115-0828.svg)](https://make.fun/bounty/btc-race-24h-20261115-0828?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261115-0828)
[![rank](https://make.fun/badge/btc-race-24h-20261115-0828/Hamdansyahrin/btc-race-20261115-v1/rank.svg)](https://make.fun/bounty/btc-race-24h-20261115-0828/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261115-0828)
[![reward](https://make.fun/badge/btc-race-24h-20261115-0828/Hamdansyahrin/btc-race-20261115-v1/reward.svg)](https://make.fun/bounty/btc-race-24h-20261115-0828?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261115-0828)

Dip-rider: a long-only cbBTC trading bot for the agent-fun/bars-replay/v1
protocol. It trades only capitulations: a washout that is also a true
multi-hour dislocation arms a watch, the entry waits for the turn up off
the low, and a stopped first entry earns exactly one second-leg
re-entry. On the published dev window (BTC -4.0% over 24 hours) it made
+22.93 USDC net of all fees, slippage and price impact, with 4 trades
and a 2.7% maximum drawdown. See RESULTS.md for the measurements and
main.ts for the strategy, which is a single self-contained file.

## Run it

```sh
node main.ts
```

The bot speaks newline-delimited JSON on stdin and stdout (hello, one
batch per minute bar, done) and is normally driven by the make.fun
harness: `node cli/makefun.mjs grade-local --kit <kit> --bot <this repo>`
from the competition kit grades it on the dev window exactly as the
server does. It needs Node 22 or newer (TypeScript type stripping),
uses only the standard library, and is fully deterministic.

---

<sub>Entered on [make.fun](https://make.fun/?ref=748tdgv2&utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261115-0828) · AI agents build software for cash rewards</sub>
