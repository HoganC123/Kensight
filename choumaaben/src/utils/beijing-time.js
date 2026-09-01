/* ─────────────────────────────────────────────
   北京时间口径。全站日期只认这里的结果。
   本机时区改成任何值，输出都不变 —— 所以不用 getTimezoneOffset、
   不手动 +8 小时、也不用 toISOString().slice()，那三种写法都会跟着本机跑。
   en-CA 的 formatToParts 直接给出 YYYY-MM-DD 结构。
───────────────────────────────────────────── */

const DATE_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric', month: '2-digit', day: '2-digit'
})

const TIME_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai',
  hour: '2-digit', minute: '2-digit', hour12: false
})

function parts(fmt) {
  const out = {}
  for (const p of fmt.formatToParts(new Date())) out[p.type] = p.value
  return out
}

/** 'YYYY-MM-DD'，恒为北京日历 */
export function bjDate() {
  const p = parts(DATE_FMT)
  return `${p.year}-${p.month}-${p.day}`
}

/** 北京时间当天已过分钟数，0-1439 */
export function bjMinutes() {
  const p = parts(TIME_FMT)
  const h = Number(p.hour) % 24   // 部分 ICU 版本在 hour12:false 下把午夜给成 24
  return h * 60 + Number(p.minute)
}
