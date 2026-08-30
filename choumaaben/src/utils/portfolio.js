/* ─────────────────────────────────────────────
   资产账本数据层
   持仓（holdings）是唯一事实来源，手动对齐券商/银行显示。
   流水（transactions）只做增量日志，供 XIRR 与决策复盘使用。
───────────────────────────────────────────── */

const API = '/api/portfolio'

export const KINDS = ['stock', 'fund', 'metal', 'cash', 'other']

export const KIND_LABEL = {
  stock: '股票',
  fund:  '基金',
  metal: '贵金属',
  cash:  '现金',
  other: '其他'
}

/* 常用因子，可自由增删 */
export const COMMON_FACTORS = ['gold', 'copper', 'cn_equity', 'cn_bond', 'usd', 'gbp', 'cash']

export const FACTOR_LABEL = {
  gold:      '黄金',
  copper:    '铜',
  cn_equity: 'A股权益',
  cn_bond:   '债券',
  usd:       '美元',
  gbp:       '英镑',
  cash:      '现金'
}

export function emptyPortfolio() {
  return {
    version: 1,
    updatedAt: null,
    accounts: [
      { id: 'boc',    name: '中国银行', type: 'bank' },
      { id: 'alipay', name: '支付宝',   type: 'platform' },
      { id: 'broker', name: '券商',     type: 'broker' }
    ],
    holdings: [],
    transactions: [],
    snapshots: []
  }
}

function num(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function normalize(d) {
  const base = emptyPortfolio()
  if (!d || typeof d !== 'object') return base
  return {
    version:      d.version || 1,
    updatedAt:    d.updatedAt || null,
    accounts:     Array.isArray(d.accounts) && d.accounts.length ? d.accounts : base.accounts,
    holdings:     Array.isArray(d.holdings)     ? d.holdings     : [],
    transactions: Array.isArray(d.transactions) ? d.transactions : [],
    snapshots:    Array.isArray(d.snapshots)    ? d.snapshots    : []
  }
}

/* ── 读写 ───────────────────────────────── */

export async function loadPortfolio() {
  const r = await fetch(API)
  if (!r.ok) throw new Error(`读取失败 HTTP ${r.status}（确认是 npm run dev，不是 vite preview）`)
  return normalize(await r.json())
}

export async function savePortfolio(data) {
  const payload = { ...normalize(data), updatedAt: new Date().toISOString() }
  const r = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  if (!r.ok) {
    let msg = `HTTP ${r.status}`
    try { msg = (await r.json()).error || msg } catch (_) {}
    throw new Error(`保存失败：${msg}`)
  }
  return payload
}

/* ── 单条持仓派生值 ───────────────────────── */

export function isAmountKind(kind) {
  return kind === 'cash' || kind === 'other'
}

export function holdingValue(h) {
  if (!h) return 0
  return isAmountKind(h.kind) ? num(h.amount) : num(h.qty) * num(h.price)
}

export function holdingCost(h) {
  if (!h) return 0
  return isAmountKind(h.kind) ? num(h.amount) : num(h.qty) * num(h.cost)
}

export function holdingPnl(h) {
  return holdingValue(h) - holdingCost(h)
}

export function holdingPnlPct(h) {
  const c = holdingCost(h)
  return c === 0 ? 0 : (holdingPnl(h) / c) * 100
}

export function newHolding(kind, accountId) {
  const base = { id: `h_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, kind, account: accountId, name: '', factors: {} }
  if (isAmountKind(kind)) return { ...base, amount: 0 }
  return { ...base, code: '', qty: 0, cost: 0, price: 0 }
}

/* ── 汇总 ─────────────────────────────────── */

export function summarize(p) {
  const holdings = (p && p.holdings) || []
  const accounts = (p && p.accounts) || []

  const totalValue = holdings.reduce((s, h) => s + holdingValue(h), 0)
  const totalCost  = holdings.reduce((s, h) => s + holdingCost(h), 0)
  const pnl        = totalValue - totalCost
  const pnlPct     = totalCost === 0 ? 0 : (pnl / totalCost) * 100

  const byClass = {}
  const byAccount = {}
  const byFactor = {}

  for (const h of holdings) {
    const v = holdingValue(h)

    const k = KIND_LABEL[h.kind] || '其他'
    byClass[k] = (byClass[k] || 0) + v

    const acc = accounts.find(a => a.id === h.account)
    const an = acc ? acc.name : (h.account || '未归类')
    byAccount[an] = (byAccount[an] || 0) + v

    const f = h.factors || {}
    for (const key of Object.keys(f)) {
      const w = num(f[key])
      if (w === 0) continue
      byFactor[key] = (byFactor[key] || 0) + v * w
    }
  }

  return { totalValue, totalCost, pnl, pnlPct, byClass, byAccount, byFactor }
}

/* 因子敞口占总资产比例。敞口可重叠，合计可超 100% —— 这是刻意的。 */
export function factorExposure(p) {
  const { totalValue, byFactor } = summarize(p)
  return Object.keys(byFactor)
    .map(k => ({
      key: k,
      label: FACTOR_LABEL[k] || k,
      value: byFactor[k],
      pct: totalValue === 0 ? 0 : (byFactor[k] / totalValue) * 100
    }))
    .sort((a, b) => b.value - a.value)
}

/* ── 每日快照 ─────────────────────────────── */

export function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function upsertSnapshot(p) {
  const s = summarize(p)
  const date = todayStr()
  const snap = {
    date,
    total: Number(s.totalValue.toFixed(2)),
    cost:  Number(s.totalCost.toFixed(2)),
    byAccount: s.byAccount,
    byClass:   s.byClass
  }
  const rest = (p.snapshots || []).filter(x => x.date !== date)
  return { ...p, snapshots: [...rest, snap].sort((a, b) => a.date.localeCompare(b.date)) }
}

/* ── 格式化 ───────────────────────────────── */

export function fmtMoney(n) {
  const v = num(n)
  return v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function fmtSigned(n) {
  const v = num(n)
  const sign = v > 0 ? '+' : v < 0 ? '−' : ''
  return sign + Math.abs(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
