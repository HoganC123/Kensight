/** 计算手续费（与 app.py 完全对应） */
export function calcFees(buyAmount, sellAmount) {
  const buyComm  = buyAmount  > 0 ? Math.max(buyAmount  * 0.0003, 5) : 0
  const sellComm = sellAmount > 0 ? Math.max(sellAmount * 0.0003, 5) : 0
  const stampTax = sellAmount * 0.001
  return { buyComm, sellComm, stampTax, total: buyComm + sellComm + stampTax }
}

/** 格式化为保留 n 位小数的字符串 */
export function fmt(n, decimals = 2) {
  if (n === null || n === undefined || isNaN(n)) return '—'
  return n.toFixed(decimals)
}

/** 格式化为带符号的字符串 */
export function fmtSign(n, decimals = 2) {
  if (n === null || n === undefined || isNaN(n)) return '—'
  return (n >= 0 ? '+' : '') + n.toFixed(decimals)
}

/** 千分位格式化 */
export function fmtComma(n, decimals = 2) {
  if (n === null || n === undefined || isNaN(n)) return '—'
  return n.toLocaleString('zh-CN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

/** 解析输入，空/NaN 返回 0 */
export function parseNum(v) {
  const n = parseFloat(v)
  return isNaN(n) ? 0 : n
}

/** 仓位止损手续费 */
export function posFees(buyPx, exitPx, qty) {
  const buyAmt  = buyPx  * qty
  const sellAmt = exitPx * qty
  const buyComm  = Math.max(buyAmt  * 0.0003, 5)
  const sellComm = Math.max(sellAmt * 0.0003, 5)
  const stamp    = sellAmt * 0.001
  return { buyComm, sellComm, stamp, total: buyComm + sellComm + stamp }
}
