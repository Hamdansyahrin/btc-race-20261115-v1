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
