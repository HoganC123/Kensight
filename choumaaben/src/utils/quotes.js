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
