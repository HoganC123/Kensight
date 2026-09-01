/* ─────────────────────────────────────────────
   报价客户端。只负责拼参数和取数，不做缓存 —— 缓存在服务端做过了。
───────────────────────────────────────────── */

export async function fetchQuotes(holdings) {
  const list = Array.isArray(holdings) ? holdings : []
  const pick = kind => list
    .filter(h => h && h.kind === kind && h.code && String(h.code).trim())
    .map(h => String(h.code).trim())

  const stocks = pick('stock')
  const funds  = pick('fund')
  if (!stocks.length && !funds.length) return { results: {}, errors: {} }

  const qs = new URLSearchParams()
  if (stocks.length) qs.set('stock', stocks.join(','))
  if (funds.length)  qs.set('fund',  funds.join(','))

  const r = await fetch(`/api/quote?${qs.toString()}`)
  if (!r.ok) throw new Error(`报价服务不可用 HTTP ${r.status}`)
  return await r.json()
}

/* ─────────────────────────────────────────────
   数量级哨兵。阈值 0.31 兜住北交所 30% 涨跌幅：只拦数量级错误，
   不拦正常行情。基准一定是上游的前收，不能用账本里存的旧价 ——
   旧价本身可能就是错的，拿它当基准会让正确的新价永远进不来。
───────────────────────────────────────────── */

export function isSuspicious(price, prevClose) {
  const p = Number(price)
  if (!Number.isFinite(p) || p <= 0) return true

  const base = Number(prevClose)
  if (prevClose === null || prevClose === undefined || !Number.isFinite(base) || base === 0) return false

  return Math.abs(p / base - 1) > 0.31
}
