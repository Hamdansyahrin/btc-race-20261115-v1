// Dip-rider: a long-only cbBTC bot for the agent-fun/bars-replay/v1 protocol.
//
// Idea in one paragraph: on one-minute bars this pool drifts in short
// stretches and snaps back just as often. The bot waits until the close
// sits well below its own recent average (a dip, measured as a z-score
// over the last Z_WIN closes), checks the longer trend is not in free
// fall, buys a fixed fraction of cash, and sells when the price reverts
// toward the mean, when a profit or loss bound is hit, or when the hold
// runs too long. A drawdown halt flattens everything and parks the bot
// if the window turns against it. Every decision uses only the bars and
// the account the harness sends; nothing reads a clock or a random
// source, so two runs over the same bars answer identically.
//
// Wire notes (from protocol.schema.json): prices are integer strings at
// price_scale (USDC per coin, scaled), quantities at qty_scale, cash at
// quote_scale. Orders decided on a batch fill at the next bar's open,
// less the fee, the modelled slippage and the pool's price impact.

interface BarIn {
  symbol: string;
  t: number;
  o: string;
  h: string;
  l: string;
  c: string;
}

interface AccountIn {
  cash_quote_units: string;
  positions: { symbol: string; qty: string; cost_quote_units: string }[];
  equity_quote_units: string;
}

interface BatchIn {
  type: string;
  seq: number;
  t: number;
  bars: BarIn[];
  account: AccountIn;
}

interface OrderOut {
  side: string;
  client_id: string;
  symbol: string;
  notional_quote_units?: string;
  qty?: string;
  max_slippage_bps: number;
}

// ---- tunable configuration (one place, changed only between runs) ----
const CFG = {
  zWin: 120, // closes in the dip-measurement window
  zIn: 2.2, // a washout this deep arms the entry watch
  armWin: 45, // bars the watch stays armed after the washout
  bounceTrig: 0.003, // enter once the close is this far off the armed low
  dislocWin: 240, // bars in the dislocation check
  dislocMin: 0.028, // arm only if price fell at least this over dislocWin
  trendWin: 360, // bars in the trend check
  trendMin: -0.045, // skip only the most vertical long crashes
  sizeFrac: 0.55, // share of cash spent on one entry
  takeProfit: 0.04, // exit at this gain over the entry price
  stopLoss: 0.018, // exit at this loss under the entry price
  trailArm: 0.008, // trailing stop arms at this gain
  trail: 0.008, // exit this far under the best close once armed
  maxHold: 300, // exit after this many bars in the position
  cooldownWin: 15, // bars to wait after a winning or flat exit
  cooldownLoss: 35, // bars to wait after a stopped exit (no waterfall re-entry)
  ddHalt: 0.1, // flatten and stop at this peak-to-trough drawdown
  slipCap: 500, // max_slippage_bps sent with every order
  symbol: "CBBTC",
};

// ---- run state ----
let priceScale = 5; // set from hello; 5 for CBBTC per the kit manifest
let closes: number[] = []; // every close seen, in USDC (float)
let orderSeq = 0; // counter for unique client ids
let entryPrice = 0; // average cost of the open position, USDC per coin
let entrySeq = -1; // batch seq at which the position was first seen
let wasHolding = false; // position presence on the previous batch
let lastExitSeq = -100000; // batch seq of the most recent exit fill
let peakEquity = 0; // highest equity_quote_units seen (micro-USDC)
let halted = false; // true once the drawdown halt has fired
let armed = false; // a washout has been seen; watching for the bounce
let armLow = 0; // lowest close since the watch was armed
let armSeq = -1; // batch seq at which the watch was armed
let highSinceEntry = 0; // best close since the position opened
let cooldownUntil = -1; // no new entry before this batch seq
let exitKind = ""; // why the current exit was sent: "stop" or "other"
let stopClose = 0; // close at which the last stop exit was decided
let stopSeq = -1; // batch seq of that stop decision
let rearmLow = 0; // lowest close since the stop (0 = not tracking)
let rearmUsed = false; // the single post-stop re-entry has been spent

// Mean and population standard deviation of the last n closes.
function windowStats(n: number): { mean: number; sd: number } {
  const start = closes.length - n;
  let sum = 0;
  for (let i = start; i < closes.length; i++) sum += closes[i];
  const mean = sum / n;
  let sq = 0;
  for (let i = start; i < closes.length; i++) {
    const d = closes[i] - mean;
    sq += d * d;
  }
  return { mean, sd: Math.sqrt(sq / n) };
}

// A sell order that empties the whole position at the given raw qty.
function sellAll(qtyRaw: string): OrderOut {
  orderSeq += 1;
  return {
    side: "sell",
    client_id: "dip-s" + orderSeq,
    symbol: CFG.symbol,
    qty: qtyRaw,
    max_slippage_bps: CFG.slipCap,
  };
}

// Decide this batch's orders from the bars and the account it carried.
// Pure function of state built from earlier batches: deterministic.
function decide(batch: BatchIn): OrderOut[] {
  const orders: OrderOut[] = [];
  const bar = batch.bars.find((b) => b.symbol === CFG.symbol);
  if (!bar) return orders;
  const close = Number(bar.c) / 10 ** priceScale;
  closes.push(close);

  const acct = batch.account;
  const cash = Number(acct.cash_quote_units);
  const equity = Number(acct.equity_quote_units);
  if (equity > peakEquity) peakEquity = equity;
  const pos = acct.positions.find((p) => p.symbol === CFG.symbol);
  const holding = !!pos && Number(pos.qty) > 0;

  // Track position openings and closings from the account itself, so a
  // rejected or partial fill can never desync the strategy's book.
  if (holding && !wasHolding && pos) {
    const qtyCoins = Number(pos.qty) / 1e8;
    entryPrice = qtyCoins > 0 ? Number(pos.cost_quote_units) / 1e6 / qtyCoins : close;
    entrySeq = batch.seq;
    highSinceEntry = close;
  }
  if (holding && close > highSinceEntry) highSinceEntry = close;
  if (!holding && wasHolding) {
    lastExitSeq = batch.seq;
    entrySeq = -1;
    cooldownUntil = batch.seq + (exitKind === "stop" ? CFG.cooldownLoss : CFG.cooldownWin);
    exitKind = "";
  }
  wasHolding = holding;

  // Drawdown halt: protect the guardrail first, profit second.
  if (!halted && peakEquity > 0 && equity < peakEquity * (1 - CFG.ddHalt)) {
    halted = true;
    if (holding && pos) orders.push(sellAll(pos.qty));
    return orders;
  }
  if (halted) return orders;

  if (holding && pos) {
    // Exit checks: hard bounds first, then the trailing stop that lets
    // a real bounce run, then patience.
    const pnl = close / entryPrice - 1;
    let exit = pnl >= CFG.takeProfit || pnl <= -CFG.stopLoss;
    if (!exit && pnl >= CFG.trailArm && close <= highSinceEntry * (1 - CFG.trail)) exit = true;
    if (!exit && batch.seq - entrySeq >= CFG.maxHold) exit = true;
    if (exit) {
      exitKind = pnl <= -CFG.stopLoss ? "stop" : "other";
      if (exitKind === "stop") {
        stopClose = close;
        stopSeq = batch.seq;
        rearmLow = close;
      }
      orders.push(sellAll(pos.qty));
    }
    return orders;
  }

  // Flat: run the washout watch. A deep dip arms the watch; the entry
  // itself waits until the price has actually turned up off the low,
  // so we buy the first steps of the recovery, not the falling knife.
  if (closes.length < Math.max(CFG.zWin, CFG.trendWin) + 1) return orders;

  // Post-stop re-entry: a stop often means we bought the first leg of
  // a capitulation, not a bad idea. If the price falls a further leg
  // below the stop and turns up off that deeper low, take one more
  // entry at the same size; the second leg is where bottoms form.
  if (stopClose > 0 && !rearmUsed && batch.seq - stopSeq <= 180) {
    if (close < rearmLow) rearmLow = close;
    const deeper = rearmLow <= stopClose * (1 - 0.008);
    const turnedUp = close >= rearmLow * (1 + CFG.bounceTrig) && close > closes[closes.length - 2];
    if (deeper && turnedUp) {
      const notional = Math.floor(cash * CFG.sizeFrac);
      if (notional >= 1000000) {
        rearmUsed = true;
        stopClose = 0;
        orderSeq += 1;
        orders.push({
          side: "buy",
          client_id: "dip-b" + orderSeq,
          symbol: CFG.symbol,
          notional_quote_units: String(notional),
          max_slippage_bps: CFG.slipCap,
        });
        return orders;
      }
    }
  }
  const st = windowStats(CFG.zWin);
  if (st.sd <= 0) return orders;
  const z = (close - st.mean) / st.sd;
  if (!armed && z <= -CFG.zIn) {
    // Arm only on a true dislocation: a mid-trend pause at the same
    // z-score is a trap, so the fall over the longer window must be deep.
    const disloc = close / closes[closes.length - 1 - CFG.dislocWin] - 1;
    if (disloc <= -CFG.dislocMin) {
      armed = true;
      armLow = close;
      armSeq = batch.seq;
    }
  }
  if (!armed) return orders;
  if (close < armLow) armLow = close;
  if (batch.seq - armSeq > CFG.armWin) {
    armed = false; // the bounce never came; forget this washout
    return orders;
  }
  if (batch.seq < cooldownUntil) return orders;
  const trendRet = close / closes[closes.length - 1 - CFG.trendWin] - 1;
  if (trendRet < CFG.trendMin) return orders;
  const turned = close >= armLow * (1 + CFG.bounceTrig) && close > closes[closes.length - 2];
  if (!turned) return orders;
  const notional = Math.floor(cash * CFG.sizeFrac);
  if (notional < 1000000) return orders; // below the 1 USDC minimum
  armed = false;
  stopClose = 0; // a fresh washout cycle begins; forget the old stop
  rearmUsed = false;
  orderSeq += 1;
  orders.push({
    side: "buy",
    client_id: "dip-b" + orderSeq,
    symbol: CFG.symbol,
    notional_quote_units: String(notional),
    max_slippage_bps: CFG.slipCap,
  });
  return orders;
}

// ---- protocol loop: newline-delimited JSON on stdin and stdout ----
// hello arrives once (learn the price scale), then one batch per bar,
// then done. Every batch gets exactly one reply echoing its seq.
let buffer = "";

function handleLine(line: string): void {
  if (!line.trim()) return;
  let msg: { type?: string; seq?: number; symbols?: { symbol: string; price_scale: number }[] };
  try {
    msg = JSON.parse(line);
  } catch {
    return; // a malformed line is the harness's problem, never ours
  }
  if (msg.type === "hello") {
    const sym = (msg.symbols || []).find((s) => s.symbol === CFG.symbol);
    if (sym) priceScale = sym.price_scale;
    return;
  }
  if (msg.type === "batch") {
    const batch = msg as BatchIn;
    const reply = { type: "reply", seq: batch.seq, orders: decide(batch) };
    process.stdout.write(JSON.stringify(reply) + "\n");
    return;
  }
  if (msg.type === "done") {
    process.exit(0);
  }
}

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk: string) => {
  buffer += chunk;
  let idx = buffer.indexOf("\n");
  while (idx >= 0) {
    const line = buffer.slice(0, idx);
    buffer = buffer.slice(idx + 1);
    handleLine(line);
    idx = buffer.indexOf("\n");
  }
});
process.stdin.on("end", () => {
  if (buffer.trim()) handleLine(buffer);
  process.exit(0);
});
