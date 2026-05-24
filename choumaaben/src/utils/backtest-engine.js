// 内部手续费计算函数（A股通用）
function calcFee(price, qty, direction) {
  const amt = price * qty;
  const comm = Math.max(amt * 0.0003, 5);
  const tax = direction === 'sell' ? amt * 0.001 : 0;
  return comm + tax;
}

/** 均线交叉策略 */
export function runMACrossover(klines, { shortPeriod = 5, longPeriod = 20, initialCapital = 100000, tradeQty = 1000 } = {}) {
  const n = klines.length;
  const shortMA = new Array(n);
  const longMA = new Array(n);

  for (let i = 0; i < n; i++) {
    if (i >= shortPeriod - 1) {
      let sum = 0;
      for (let j = i - shortPeriod + 1; j <= i; j++) sum += klines[j].close;
      shortMA[i] = sum / shortPeriod;
    }
    if (i >= longPeriod - 1) {
      let sum = 0;
      for (let j = i - longPeriod + 1; j <= i; j++) sum += klines[j].close;
      longMA[i] = sum / longPeriod;
    }
  }

  let cash = initialCapital;
  let shares = 0;
  let buyDate = null;
  let buyPrice = 0;
  let buyCost = 0;

  const trades = [];
  const dailyValues = [];

  for (let i = 0; i < n; i++) {
    const k = klines[i];
    const close = k.close;

    if (i >= Math.max(shortPeriod, longPeriod)) {
      const prevShort = shortMA[i - 1];
      const prevLong = longMA[i - 1];
      const currShort = shortMA[i];
      const currLong = longMA[i];

      // 金叉买入
      if (
        prevShort <= prevLong &&
        currShort > currLong &&
        shares === 0
      ) {
        const need = close * tradeQty + calcFee(close, tradeQty, 'buy');
        if (cash >= need) {
          const fee = calcFee(close, tradeQty, 'buy');
          cash -= need;
          shares = tradeQty;
          buyDate = k.date;
          buyPrice = close;
          buyCost = close * tradeQty + fee;
          trades.push({ date: k.date, type: 'buy', price: close, qty: tradeQty, fee, profit: 0 });
        }
      }

      // 死叉卖出
      if (
        prevShort >= prevLong &&
        currShort < currLong &&
        shares > 0 &&
        k.date !== buyDate
      ) {
        const fee = calcFee(close, shares, 'sell');
        const proceeds = close * shares - fee;
        const profit = proceeds - buyCost;
        cash += proceeds;
        trades.push({ date: k.date, type: 'sell', price: close, qty: shares, fee, profit });
        shares = 0;
        buyDate = null;
        buyCost = 0;
        buyPrice = 0;
      }
    }

    // 最后一天强制清仓
    if (i === n - 1 && shares > 0) {
      const fee = calcFee(close, shares, 'sell');
      const proceeds = close * shares - fee;
      const profit = proceeds - buyCost;
      cash += proceeds;
      trades.push({ date: k.date, type: 'sell', price: close, qty: shares, fee, profit });
      shares = 0;
      buyDate = null;
      buyCost = 0;
      buyPrice = 0;
    }

    const value = cash + shares * close;
    dailyValues.push({ date: k.date, value });
  }

  const finalValue = dailyValues.length > 0 ? dailyValues[dailyValues.length - 1].value : initialCapital;
  const totalReturn = finalValue - initialCapital;
  const totalReturnPct = (totalReturn / initialCapital) * 100;

  const sellTrades = trades.filter(t => t.type === 'sell');
  const winCount = sellTrades.filter(t => t.profit > 0).length;
  const sellCount = sellTrades.length;
  const winRate = sellCount > 0 ? (winCount / sellCount) * 100 : 0;

  let maxDrawdown = 0;
  let peak = dailyValues[0]?.value ?? initialCapital;
  for (const dv of dailyValues) {
    if (dv.value > peak) peak = dv.value;
    const dd = ((peak - dv.value) / peak) * 100;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  const annualReturn = (Math.pow(finalValue / initialCapital, 250 / n) - 1) * 100;

  const stats = {
    totalReturn,
    totalReturnPct,
    tradeCount: trades.length,
    winCount,
    winRate,
    maxDrawdown,
    annualReturn
  };

  return { trades, dailyValues, stats };
}

/** 网格策略 */
export function runGridStrategy(klines, { buyDip = 3, sellRise = 3, initialCapital = 100000, tradeQty = 1000 } = {}) {
  let cash = initialCapital;
  let shares = 0;
  let buyDate = null;
  let buyPrice = 0;
  let buyCost = 0;

  const trades = [];
  const dailyValues = [];

  for (let i = 0; i < klines.length; i++) {
    const k = klines[i];
    const close = k.close;
    const prev = i > 0 ? klines[i - 1] : null;

    // 买入
    if (shares === 0 && prev) {
      const targetPrice = prev.close * (1 - buyDip / 100);
      if (k.low <= targetPrice) {
        const fee = calcFee(targetPrice, tradeQty, 'buy');
        const need = targetPrice * tradeQty + fee;
        if (cash >= need) {
          cash -= need;
          shares = tradeQty;
          buyDate = k.date;
          buyPrice = targetPrice;
          buyCost = targetPrice * tradeQty + fee;
          trades.push({ date: k.date, type: 'buy', price: targetPrice, qty: tradeQty, fee, profit: 0 });
        }
      }
    }

    // 卖出
    if (shares > 0 && k.date !== buyDate) {
      const sellPrice = buyPrice * (1 + sellRise / 100);
      if (k.high >= sellPrice) {
        const fee = calcFee(sellPrice, shares, 'sell');
        const proceeds = sellPrice * shares - fee;
        const profit = proceeds - buyCost;
        cash += proceeds;
        trades.push({ date: k.date, type: 'sell', price: sellPrice, qty: shares, fee, profit });
        shares = 0;
        buyDate = null;
        buyCost = 0;
        buyPrice = 0;
      }
    }

    // 最后一天强制平仓
    if (i === klines.length - 1 && shares > 0) {
      const fee = calcFee(close, shares, 'sell');
      const proceeds = close * shares - fee;
      const profit = proceeds - buyCost;
      cash += proceeds;
      trades.push({ date: k.date, type: 'sell', price: close, qty: shares, fee, profit });
      shares = 0;
      buyDate = null;
      buyCost = 0;
      buyPrice = 0;
    }

    const value = cash + shares * close;
    dailyValues.push({ date: k.date, value });
  }

  const finalValue = dailyValues.length > 0 ? dailyValues[dailyValues.length - 1].value : initialCapital;
  const totalReturn = finalValue - initialCapital;
  const totalReturnPct = (totalReturn / initialCapital) * 100;

  const sellTrades = trades.filter(t => t.type === 'sell');
  const winCount = sellTrades.filter(t => t.profit > 0).length;
  const sellCount = sellTrades.length;
  const winRate = sellCount > 0 ? (winCount / sellCount) * 100 : 0;

  let maxDrawdown = 0;
  let peak = dailyValues[0]?.value ?? initialCapital;
  for (const dv of dailyValues) {
    if (dv.value > peak) peak = dv.value;
    const dd = ((peak - dv.value) / peak) * 100;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  const annualReturn = (Math.pow(finalValue / initialCapital, 250 / klines.length) - 1) * 100;

  const stats = {
    totalReturn,
    totalReturnPct,
    tradeCount: trades.length,
    winCount,
    winRate,
    maxDrawdown,
    annualReturn
  };

  return { trades, dailyValues, stats };
}
