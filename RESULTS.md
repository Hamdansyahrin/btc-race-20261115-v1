# Results — btc-race-24h-20261115-0828

Local measurement rig: a hand-written replay driver over the kit's dev
window bars implementing the harness fill model (4 bps fee, 2 bps
slippage, constant-product impact 1 + a/D on each bar's open depth,
flatten at the last close). The kit's own grade-local is the authority;
the driver exists for fast iteration and split-window checks.

## Iteration 1 — washout arm + bounce trigger + post-stop re-entry

Strategy: a z-score washout (120-bar window) that also fell at least
2.8% over 240 bars arms a watch; the entry waits for the close to turn
up 0.3% off the armed low. Exits: +4% take-profit, -1.8% stop, a 0.8%
trailing stop armed at +0.8%, 300-bar patience. After a stop, one
re-entry is allowed if the price falls a further 0.8% leg and turns up
again — capitulations come in two legs, and the second leg is the one
that bottoms. Position size 55% of cash; 10% drawdown halt.

Dev window (1,440 bars, BTC -4.0% over the window), local driver:
- Full window: **+9.21 USDC**, 6 trades, max drawdown 2.17%
- First half (fresh state): +0.26 USDC, 1 trade
- Second half (fresh state): 0 trades (its trades depend on first-half
  context, so the halves do not add up to the full window)

Trades on the full window: a flat 300-bar hold (-1.04), a washout entry
stopped on the second leg down (-11.63), and the post-stop re-entry at
62,451 that rode the capitulation bounce to 65,014 (+21.85 net).

## Iteration 2 — tighter dislocation gate, 1.5% stop, 85% size (FINAL)

Changes from iteration 1: dislocation gate 2.8% -> 3.2% (drops a flat
sideways hold and several mid-trend traps), stop 1.8% -> 1.5%, size
55% -> 85% of cash. Neighbouring values (dislocation 3.0-3.4%, stop
1.3-1.7%, size 0.80-0.90) all score within a few dollars of this one:
a plateau, not a spike.

Kit grade-local (the server's own harness, process driver) on the
final commit: **net PnL +22.93 USDC** (22,926,797 micro-USDC), return
+2.29%, 4 trades, maximum drawdown 2.69%, Sharpe per bar 0.025, net
PnL at doubled fees +21.56 USDC. The two executions reproduce byte for
byte. The dev gate (net PnL above 0) passes with a wide margin.

Trades on the dev window: a washout entry at 63,981 stopped at 62,925
(-14.70), then the post-stop re-entry at 62,494 — within fifty bars of
the window's 62,082 capitulation low — ridden to a trailing exit at
65,354 (+37.63).

## Robustness checks (local driver, same fill model)

The same final configuration on transformed copies of the dev window:
- Time-reversed window (the downtrend mirrored into an uptrend):
  +13.69 USDC, 2 trades, max drawdown 0.97%
- Three hour-shuffled windows (the 24 hourly blocks permuted, closes
  chained): -0.56, +15.25 and 0.00 USDC; worst drawdown 2.15%
- Fresh-state half windows: no trades in either half (the strategy
  needs its 360-bar history and its full setup; the halves understate
  it by construction)

Read: the bot does not depend on the dev window's exact sequence. In
windows without a capitulation it mostly stays in cash — it forgoes
the small stuff, pays almost nothing in costs, and keeps the 25%
drawdown guardrail far away. Its race-window risk is the opposite of
blow-up risk: the pattern may simply not occur, leaving a near-zero
score. Variant probes that loosened the re-entry leg (0.6% instead of
0.8%) scored worse on both the dev window and the shuffles and were
rejected; a wider arm window changed nothing and was not taken.
