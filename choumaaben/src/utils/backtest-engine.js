// ════════════════════════════════════════════════════════════════
//  Kensight 回测引擎  v2
//  ───────────────────────────────────────────────────────────────
//  三个策略：
//    1. runMACrossover  —— 均线交叉（短线/波段，分批加仓 + 止损止盈）
//    2. runGridStrategy —— 真·网格（多档均价持仓）
//    3. runDCA          —— 定投（长线，周期固定投入，长期持有）
//
//  设计原则（已固化）：
//    · 每个参数对应散户实盘真做的动作
//    · 默认值即安全值，用户不改也能跑出可信结果
//    · 不暴露制造收益幻觉的旋钮（无限加仓被档数封顶堵死）
//    · 止损优先级高于加仓：跌穿止损先清仓，不补
//    · 加仓受现金约束：钱不够就停止加仓并记录，不是无限弹药
//
//  A股规则：佣金 0.03% 最低 5 元；印花税 0.1% 仅卖出；红涨绿跌（UI 层处理）
// ════════════════════════════════════════════════════════════════

/* ────────────────────────────────────────────────
   手续费（A股通用）
──────────────────────────────────────────────── */
function calcFee(price, qty, direction) {
  const amt = price * qty
  const comm = Math.max(amt * 0.0003, 5)
  const tax = direction === 'sell' ? amt * 0.001 : 0
  return comm + tax
}

/* ────────────────────────────────────────────────
   交易风格预设
   UI 选「短线 / 波段 / 长线」时，套用对应默认值。
   用户仍可在选定预设后手动微调任一参数。
──────────────────────────────────────────────── */
export const PRESETS = {
  // 短线：持仓几天，止损紧、止盈近
  short: {
    label: '短线',
    ma:   { shortPeriod: 5,  longPeriod: 20, stopLoss: 5,  takeProfit: 8 },
    grid: { gridGap: 2, maxLots: 4 },
  },
  // 波段：持仓几周到几月，止损松、止盈远（0 = 不设，让趋势跑）
  swing: {
    label: '波段',
    ma:   { shortPeriod: 10, longPeriod: 30, stopLoss: 8,  takeProfit: 0 },
    grid: { gridGap: 4, maxLots: 5 },
  },
  // 长线：定投，独立参数集
  long: {
    label: '长线定投',
    dca:  { intervalDays: 20, investAmount: 5000 },
  },
}

/* ────────────────────────────────────────────────
   通用统计计算
   接收 dailyValues / trades，产出统一的 stats。
   所有策略复用，保证指标口径一致。
──────────────────────────────────────────────── */
function computeStats(dailyValues, trades, initialCapital, n, extra = {}) {
  const finalValue = dailyValues.length
    ? dailyValues[dailyValues.length - 1].value
    : initialCapital

  const totalReturn = finalValue - initialCapital
  const totalReturnPct = initialCapital > 0 ? (totalReturn / initialCapital) * 100 : 0

  // 胜率：仅对有卖出的策略有意义（定投没有卖出，winRate 记 null）
  const sellTrades = trades.filter(t => t.type === 'sell')
  const sellCount = sellTrades.length
  const winCount = sellTrades.filter(t => t.profit > 0).length
  const winRate = sellCount > 0 ? (winCount / sellCount) * 100 : null

  // 最大回撤
  let maxDrawdown = 0
  let peak = dailyValues[0]?.value ?? initialCapital
  for (const dv of dailyValues) {
    if (dv.value > peak) peak = dv.value
    const dd = peak > 0 ? ((peak - dv.value) / peak) * 100 : 0
    if (dd > maxDrawdown) maxDrawdown = dd
  }

  // 年化（按 250 交易日折算）
  const annualReturn = (n > 0 && initialCapital > 0 && finalValue > 0)
    ? (Math.pow(finalValue / initialCapital, 250 / n) - 1) * 100
    : 0

  return {
    totalReturn,
    totalReturnPct,
    tradeCount: trades.length,
    winCount,
    sellCount,
    winRate,
    maxDrawdown,
    annualReturn,
    finalValue,
    ...extra,
  }
}

/* ════════════════════════════════════════════════════════════════
   共用持仓状态机
   ───────────────────────────────────────────────────────────────
   均线 / 网格策略共用。维护：
     · lots[]      每一档买入记录 { qty, price, cost(含买入费) }
     · totalShares 当前总持股
     · avgCost     当前持仓均价（含买入费摊入，卖出时据此算盈亏）
     · cash        现金
   提供 buy / sellAll / markToMarket 三个操作。
   止损止盈、加仓判定由各策略主循环调用，不在状态机内写死。
──────────────────────────────────────────────── */
class Position {
  constructor(initialCapital) {
    this.cash = initialCapital
    this.lots = []
    this.totalShares = 0
    this.totalCost = 0 // 含买入手续费的总成本
  }

  get avgCost() {
    return this.totalShares > 0 ? this.totalCost / this.totalShares : 0
  }

  get lotCount() {
    return this.lots.length
  }

  // 尝试买入一档；现金不足返回 null（调用方据此停止加仓）
  buy(date, price, qty) {
    const fee = calcFee(price, qty, 'buy')
    const need = price * qty + fee
    if (this.cash < need) return null
    this.cash -= need
    this.lots.push({ qty, price, cost: price * qty + fee })
    this.totalShares += qty
    this.totalCost += price * qty + fee
    return { date, type: 'buy', price, qty, fee, profit: 0 }
  }

  // 全部卖出，按均价算盈亏
  sellAll(date, price) {
    if (this.totalShares === 0) return null
    const qty = this.totalShares
    const fee = calcFee(price, qty, 'sell')
    const proceeds = price * qty - fee
    const profit = proceeds - this.totalCost
    this.cash += proceeds
    const trade = { date, type: 'sell', price, qty, fee, profit }
    this.lots = []
    this.totalShares = 0
    this.totalCost = 0
    return trade
  }

  // 卖出最早一档（网格用：涨一格卖一档）
  sellOneLot(date, price) {
    if (this.lots.length === 0) return null
    const lot = this.lots.shift()
    const fee = calcFee(price, lot.qty, 'sell')
    const proceeds = price * lot.qty - fee
    const profit = proceeds - lot.cost
    this.cash += proceeds
    this.totalShares -= lot.qty
    this.totalCost -= lot.cost
    return { date, type: 'sell', price, qty: lot.qty, fee, profit }
  }

  marketValue(price) {
    return this.cash + this.totalShares * price
  }
}

/* ════════════════════════════════════════════════════════════════
   策略 1：均线交叉（趋势跟随，单档）
   ───────────────────────────────────────────────────────────────
   · 金叉建仓
   · 止损：价格跌破 均价 ×(1 - stopLoss%) → 清仓（优先级最高）
   · 止盈：takeProfit>0 且 价格涨破 均价 ×(1 + takeProfit%) → 清仓
   · 死叉：清仓
   · 最后一天：强制清仓
   设计说明：均线交叉是趋势跟随策略，纪律是「错了就走」，
   不做逆势加仓（逆势加仓是网格的逻辑，见策略2）。
──────────────────────────────────────────────── */
export function runMACrossover(klines, params = {}) {
  const {
    shortPeriod = 5,
    longPeriod = 20,
    initialCapital = 100000,
    tradeQty = 1000,
    stopLoss = 5,      // %
    takeProfit = 8,    // %，0 = 不设
  } = params

  const n = klines.length
  const shortMA = new Array(n)
  const longMA = new Array(n)
  for (let i = 0; i < n; i++) {
    if (i >= shortPeriod - 1) {
      let s = 0
      for (let j = i - shortPeriod + 1; j <= i; j++) s += klines[j].close
      shortMA[i] = s / shortPeriod
    }
    if (i >= longPeriod - 1) {
      let s = 0
      for (let j = i - longPeriod + 1; j <= i; j++) s += klines[j].close
      longMA[i] = s / longPeriod
    }
  }

  const pos = new Position(initialCapital)
  const trades = []
  const dailyValues = []
  const warmup = Math.max(shortPeriod, longPeriod)

  for (let i = 0; i < n; i++) {
    const k = klines[i]
    const close = k.close

    if (i >= warmup) {
      const prevShort = shortMA[i - 1], prevLong = longMA[i - 1]
      const currShort = shortMA[i], currLong = longMA[i]
      const goldCross = prevShort <= prevLong && currShort > currLong
      const deadCross = prevShort >= prevLong && currShort < currLong

      // ── 持仓中：止损/止盈/死叉 ──
      if (pos.totalShares > 0) {
        const avg = pos.avgCost
        const stopLine = avg * (1 - stopLoss / 100)
        const tpLine = takeProfit > 0 ? avg * (1 + takeProfit / 100) : Infinity

        // 1) 止损优先（跳空低开则按开盘价成交，更接近实盘）
        if (k.low <= stopLine) {
          const fillPx = Math.min(k.open, stopLine)
          const t = pos.sellAll(k.date, fillPx)
          if (t) { t.reason = 'stop'; trades.push(t) }
        }
        // 2) 止盈（跳空高开则按开盘价成交）
        else if (k.high >= tpLine) {
          const fillPx = Math.max(k.open, tpLine)
          const t = pos.sellAll(k.date, fillPx)
          if (t) { t.reason = 'profit'; trades.push(t) }
        }
        // 3) 死叉清仓
        else if (deadCross) {
          const t = pos.sellAll(k.date, close)
          if (t) { t.reason = 'dead'; trades.push(t) }
        }
      }
      // ── 空仓中：金叉 → 次日开盘价建仓（消除未来函数；最后一天无次日则放弃） ──
      else if (goldCross && i + 1 < n) {
        const nk = klines[i + 1]
        const t = pos.buy(nk.date, nk.open, tradeQty)
        if (t) { t.reason = 'open'; trades.push(t) }
      }
    }

    // 最后一天强制清仓
    if (i === n - 1 && pos.totalShares > 0) {
      const t = pos.sellAll(k.date, close)
      if (t) { t.reason = 'final'; trades.push(t) }
    }

    dailyValues.push({ date: k.date, value: pos.marketValue(close) })
  }

  const stats = computeStats(dailyValues, trades, initialCapital, n)
  return { trades, dailyValues, stats }
}

/* ════════════════════════════════════════════════════════════════
   策略 2：真·网格
   ───────────────────────────────────────────────────────────────
   · 以首日收盘价为基准锚点 anchor
   · 每较 anchor 下跌一格(gridGap%)买一档，锚点下移
   · 每较 上一买入档 上涨一格卖一档（卖最早一档，先进先出）
   · maxLots 封顶持仓档数，防止无限补仓
   · 最后一天清仓
   注：网格不设止损（网格的本质就是承受波动赚震荡），
       但用 maxLots 和现金约束防止极端下跌爆仓。
──────────────────────────────────────────────── */
export function runGridStrategy(klines, params = {}) {
  const {
    gridGap = 3,       // % 每格间距
    maxLots = 5,
    initialCapital = 100000,
    tradeQty = 1000,
  } = params

  const n = klines.length
  const pos = new Position(initialCapital)
  const trades = []
  const dailyValues = []

  if (n === 0) {
    return { trades, dailyValues, stats: computeStats(dailyValues, trades, initialCapital, n) }
  }

  let anchor = klines[0].close // 买入基准，买一档后下移

  for (let i = 0; i < n; i++) {
    const k = klines[i]
    const close = k.close

    // ── 卖出：持仓中，价格涨破「最早一档买入价 ×(1+gridGap%)」卖该档 ──
    if (pos.lots.length > 0) {
      const earliest = pos.lots[0]
      const sellLine = earliest.price * (1 + gridGap / 100)
      if (k.high >= sellLine) {
        const t = pos.sellOneLot(k.date, sellLine)
        if (t) { t.reason = 'grid-sell'; trades.push(t) }
      }
    }

    // ── 买入：价格跌破「anchor ×(1-gridGap%)」买一档，anchor 下移 ──
    if (pos.lotCount < maxLots) {
      const buyLine = anchor * (1 - gridGap / 100)
      if (k.low <= buyLine) {
        const t = pos.buy(k.date, buyLine, tradeQty)
        if (t) { t.reason = 'grid-buy'; trades.push(t); anchor = buyLine }
      }
    }

    // 最后一天清仓
    if (i === n - 1 && pos.totalShares > 0) {
      const t = pos.sellAll(k.date, close)
      if (t) { t.reason = 'final'; trades.push(t) }
    }

    dailyValues.push({ date: k.date, value: pos.marketValue(close) })
  }

  const stats = computeStats(dailyValues, trades, initialCapital, n)
  return { trades, dailyValues, stats }
}

/* ════════════════════════════════════════════════════════════════
   策略 3：定投 DCA（长线）
   ───────────────────────────────────────────────────────────────
   · 每隔 intervalDays 个交易日，投入 investAmount 元买入（按当日收盘价，取整百股）
   · 长期持有，不止损不止盈不卖出
   · 最后一天不强制卖出（定投的逻辑就是持有；卖出与否交给用户现实判断）
   · 核心指标不同：胜率无意义；关注 累计投入 / 当前市值 / 平均成本 / 定投收益率
   · initialCapital 此处理解为「计划总投入资金池」，分批投完为止；不足一档则停止
──────────────────────────────────────────────── */
export function runDCA(klines, params = {}) {
  const {
    intervalDays = 20,
    investAmount = 5000,
    initialCapital = 100000, // 资金池上限
  } = params

  const n = klines.length
  const pos = new Position(initialCapital)
  const trades = []
  const dailyValues = []
  let totalInvested = 0 // 实际投入本金（不含留存现金）

  for (let i = 0; i < n; i++) {
    const k = klines[i]
    const close = k.close

    // 每隔 intervalDays 定投一次（第 0 天即首投）
    if (i % intervalDays === 0) {
      const qty = Math.floor(investAmount / close / 100) * 100
      if (qty > 0) {
        const t = pos.buy(k.date, close, qty)
        if (t) {
          t.reason = 'dca'
          trades.push(t)
          totalInvested += close * qty + t.fee
        }
      }
    }

    dailyValues.push({ date: k.date, value: pos.marketValue(close) })
  }

  const lastClose = n > 0 ? klines[n - 1].close : 0
  const holdingValue = pos.totalShares * lastClose
  const avgCost = pos.avgCost

  // 定投专属指标
  const dcaReturn = holdingValue - totalInvested            // 浮动盈亏（基于投入本金）
  const dcaReturnPct = totalInvested > 0 ? (dcaReturn / totalInvested) * 100 : 0

  const stats = computeStats(dailyValues, trades, initialCapital, n, {
    isDCA: true,
    totalInvested,
    holdingValue,
    holdingShares: pos.totalShares,
    avgCost,
    dcaReturn,
    dcaReturnPct,
  })

  return { trades, dailyValues, stats }
}
