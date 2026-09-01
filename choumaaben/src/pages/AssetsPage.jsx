import React, { useEffect, useMemo, useRef, useState } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import { Plus, Trash2, Save, Camera, Copy, RefreshCw } from 'lucide-react'
import {
  loadPortfolio, savePortfolio, emptyPortfolio,
  summarize, upsertSnapshot,
  holdingValue, holdingPnl, holdingPnlPct,
  newHolding, isAmountKind,
  KINDS, KIND_LABEL, COMMON_FACTORS, FACTOR_LABEL,
  fmtMoney, fmtSigned
} from '../utils/portfolio.js'
import { fetchQuotes, isSuspicious } from '../utils/quotes.js'
import { bjMinutes } from '../utils/beijing-time.js'

const num  = v => (Number.isFinite(Number(v)) ? Number(v) : 0)
const wan  = n => (num(n) / 10000).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const wanS = n => { const v = num(n) / 10000; return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }

/* 15:05（北京）—— 收盘后留 5 分钟给集合竞价数据落定 */
const SNAPSHOT_AFTER = 905

/* 构图条的明度阶，与全站黑白语言一致 */
const STEP = [1, 0.62, 0.38, 0.22, 0.12]

export default function AssetsPage() {
  const [data, setData]         = useState(emptyPortfolio())
  const [loading, setLoading]   = useState(true)
  const [dirty, setDirty]       = useState(false)
  const [msg, setMsg]           = useState('')
  const [err, setErr]           = useState('')
  const [expanded, setExpanded] = useState(null)
  const [quoting, setQuoting]   = useState(false)

  /* StrictMode 下 effect 会跑两次，用 ref 挡住第二次自动拉取 */
  const autoQuoted = useRef(false)

  useEffect(() => {
    loadPortfolio().then(d => {
      setData(d); setErr('')
      const needs = (d.holdings || []).some(h => (h.kind === 'stock' || h.kind === 'fund') && h.code && String(h.code).trim())
      if (needs && !autoQuoted.current) {
        autoQuoted.current = true
        /* 传 d 进去：此刻闭包里的 data 还是初始空账本 */
        refreshQuotes({ silent: true, autoPersist: true, base: d })
      }
    })
      .catch(e => setErr(e.message)).finally(() => setLoading(false))
  }, [])

  const s = useMemo(() => summarize(data), [data])

  const factors = useMemo(() => {
    const map = {}
    for (const h of data.holdings || []) {
      const v = holdingValue(h)
      for (const [key, w] of Object.entries(h.factors || {})) {
        const c = v * num(w)
        if (!c) continue
        if (!map[key]) map[key] = { key, label: FACTOR_LABEL[key] || key, value: 0, from: [] }
        map[key].value += c
        map[key].from.push({ name: h.name || '未命名', value: c })
      }
    }
    return Object.values(map)
      .map(f => ({ ...f, pct: s.totalValue ? (f.value / s.totalValue) * 100 : 0, from: f.from.sort((a, b) => b.value - a.value) }))
      .sort((a, b) => b.value - a.value)
  }, [data, s.totalValue])

  const snaps = useMemo(() => [...(data.snapshots || [])].sort((a, b) => a.date.localeCompare(b.date)), [data])

  const untagged = (data.holdings || []).filter(h => !Object.keys(h.factors || {}).length)
  const untaggedVal = untagged.reduce((a, h) => a + holdingValue(h), 0)
  const maxPct = factors.length ? factors[0].pct : 0

  function mutate(fn) { setData(p => fn(structuredClone(p))); setDirty(true); setMsg('') }
  const update = (id, patch) => mutate(d => { const h = d.holdings.find(x => x.id === id); if (h) Object.assign(h, patch); return d })
  const setFactor = (id, k, w) => mutate(d => {
    const h = d.holdings.find(x => x.id === id); if (!h) return d
    h.factors = h.factors || {}
    const n = Number(w)
    if (!w || !Number.isFinite(n) || n === 0) delete h.factors[k]; else h.factors[k] = n
    return d
  })
  const add    = k  => mutate(d => { d.holdings.push(newHolding(k, d.accounts[0]?.id || 'boc')); return d })
  const remove = id => mutate(d => { d.holdings = d.holdings.filter(x => x.id !== id); return d })

  async function save(snap) {
    try {
      const saved = await savePortfolio(snap ? upsertSnapshot(data) : data)
      setData(saved); setDirty(false); setErr('')
      setMsg(snap ? '已保存，今日快照已记录' : '已保存')
    } catch (e) { setErr(e.message) }
  }

  async function refreshQuotes({ silent = false, autoPersist = false, base = null } = {}) {
    const src      = base || data
    const wasDirty = dirty            // 进函数那一刻的脏状态，后面不再变
    setQuoting(true)
    try {
      const { results, errors, tradingDay } = await fetchQuotes(src.holdings || [])
      const bad     = Object.entries(errors || {})
      const quoteErr = bad.length ? `报价失败：${bad.map(([c, m]) => `${c}(${m})`).join('、')}` : ''

      if (!Object.keys(results || {}).length) {
        setErr(quoteErr)
        if (!silent) setMsg('没有可更新的标的')
        return
      }

      /* 先在本地把 next 算完整，再一次性 setData。
         绝不 mutate 之后去读 data —— 那是上一轮的旧值，落盘会写错东西。 */
      const next    = structuredClone(src)
      const blocked = []
      const applied = []
      for (const h of next.holdings) {
        const q = results[h.code]
        if (!q) continue
        if (isSuspicious(q.price, q.prevClose)) { blocked.push(h.code); continue }
        h.price = q.price
        h.priceAsOf = q.asOf
        h.priceSource = q.source
        applied.push(h.code)
      }

      /* 被拦截的行不改 price，但一定要在界面上说出来 */
      const blockErr = blocked.length
        ? `价格异常已拦截：${blocked.join('、')}，请人工确认后手动保存`
        : ''
      const bothErr = [quoteErr, blockErr].filter(Boolean).join('　')

      const inMemoryOnly = () => {
        setData(next)
        setErr(bothErr)
        if (!silent) setMsg(applied.length ? `已更新 ${applied.length} 个标的现价，记得保存` : '没有可更新的标的')
      }

      /* 按钮点击路径：只改内存、标脏，等用户自己按保存 */
      if (!autoPersist) {
        inMemoryOnly()
        setDirty(true)
        return
      }

      /* a. 进来之前就有没存的手工改动 —— 不替用户做落盘决定 */
      if (wasDirty) { inMemoryOnly(); return }

      /* b. 有拦截 —— 不落盘，留给人工确认 */
      if (blocked.length) { inMemoryOnly(); setDirty(true); return }

      /* c. 都通过 —— 落盘，收盘后顺带记快照 */
      const withSnap = tradingDay === true && bjMinutes() >= SNAPSHOT_AFTER
      const saved = await savePortfolio(withSnap ? upsertSnapshot(next) : next)
      setData(saved); setDirty(false)
      setErr(quoteErr)
      setMsg('已自动更新并写入' + (withSnap ? '，今日快照已记' : ''))
    } catch (e) {
      setErr(e.message)
    } finally {
      setQuoting(false)
    }
  }

  async function copyJson() {
    try { await navigator.clipboard.writeText(JSON.stringify(data, null, 2)); setMsg('账本 JSON 已复制') }
    catch (e) { setErr('复制失败：' + e.message) }
  }

  if (loading) return <div className="page"><Style /><p className="ak-quiet">读取账本…</p></div>

  return (
    <div className="page ak">
      <Style />

      <header className="ak-head">
        <h1 className="page-title">资产账本</h1>
        <p className="ak-quiet">
          {dirty ? '有改动尚未写入磁盘'
            : data.updatedAt ? `上次写入 ${new Date(data.updatedAt).toLocaleString('zh-CN')}`
            : '尚未写入过'}
        </p>
        <div className="ak-actions">
          <button className="ak-btn" onClick={() => refreshQuotes({ silent: false, autoPersist: false })} disabled={quoting}>
            <RefreshCw size={13} />{quoting ? '拉取中…' : '刷新报价'}
          </button>
          <button className="ak-btn ak-btn-solid" onClick={() => save(false)}><Save size={14} />保存</button>
          <button className="ak-btn" onClick={() => save(true)}><Camera size={13} />保存并记快照</button>
          <button className="ak-btn" onClick={copyJson}><Copy size={13} />复制 JSON</button>
        </div>
        {err && <div className="banner error ak-banner">{err}</div>}
        {msg && !err && <div className="banner success ak-banner">{msg}</div>}
      </header>

      {/* 汇总 */}
      <section className="ak-sec">
        <div className="ak-stats">
          <Stat label="总资产"   big={wan(s.totalValue)}  suffix="万" sub={`${fmtMoney(s.totalValue)} 元`} />
          <Stat label="总成本"   big={wan(s.totalCost)}   suffix="万" sub={`${fmtMoney(s.totalCost)} 元`} />
          <Stat label="浮动盈亏" big={wanS(s.pnl)}        suffix="万" sub={`${fmtSigned(s.pnl)} 元`} tone={s.pnl >= 0 ? 'up' : 'dn'} />
          <Stat label="盈亏比例" big={fmtSigned(s.pnlPct)} suffix="%"  sub="对总成本口径" tone={s.pnl >= 0 ? 'up' : 'dn'} />
        </div>
      </section>

      {/* 因子敞口 —— 本页存在的理由 */}
      <section className="ak-sec">
        <div className="ak-sec-head">
          <h2 className="ak-sec-title">因子敞口</h2>
          <span className="ak-quiet">按底层风险来源穿透。一个标的可计入多个因子，扇区会重复计算，所以这里用横条不用环形图</span>
        </div>

        {factors.length === 0 && <p className="ak-quiet">还没有标注因子。在下方持仓表点「标注因子」。</p>}

        <div className="ak-factors">
          {factors.map(f => (
            <div className="ak-factor" key={f.key}>
              <div className="ak-factor-top">
                <span className="ak-factor-name">{f.label}</span>
                <span className="ak-factor-pct">{f.pct.toFixed(1)}<i>%</i></span>
              </div>
              <div className="ak-rail">
                <div className="ak-rail-fill" style={{ width: `${maxPct ? (f.pct / maxPct) * 100 : 0}%` }} />
              </div>
              <div className="ak-factor-from">
                <span className="ak-factor-amt">{fmtMoney(f.value)}</span>
                {f.from.map((x, i) => (
                  <span key={i} className="ak-chip">{x.name}<b>{fmtMoney(x.value)}</b></span>
                ))}
              </div>
            </div>
          ))}
        </div>

        {untagged.length > 0 && (
          <p className="ak-note">
            {untagged.length} 项未标注因子，合计 {fmtMoney(untaggedVal)}
            （{s.totalValue ? (untaggedVal / s.totalValue * 100).toFixed(1) : '0.0'}%）。标注之前，上面的敞口不完整。
          </p>
        )}
      </section>

      {/* 构成 */}
      <section className="ak-sec">
        <div className="ak-sec-head"><h2 className="ak-sec-title">构成</h2></div>
        <div className="ak-splits">
          <Donut title="按类别" map={s.byClass} total={s.totalValue} />
          <Donut title="按账户" map={s.byAccount} total={s.totalValue} />
        </div>
      </section>

      {/* 快照 */}
      <section className="ak-sec">
        <div className="ak-sec-head">
          <h2 className="ak-sec-title">净值曲线<span className="ak-count">{snaps.length} 个快照</span></h2>
          <span className="ak-quiet">点「保存并记快照」记录当日，每天最多一条</span>
        </div>
        {snaps.length === 0 && <p className="ak-quiet">还没有快照。</p>}
        {snaps.length === 1 && (
          <p className="ak-note" style={{ margin: 0 }}>
            只有 {snaps[0].date} 一个快照，总资产 {fmtMoney(snaps[0].total)}。至少两天才画得出曲线。
          </p>
        )}
        {snaps.length >= 2 && (
          <>
            <div className="ak-chart">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={snaps} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
                  <CartesianGrid stroke="var(--ak-hair)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--ak-dim2)' }}
                         axisLine={{ stroke: 'var(--ak-line)' }} tickLine={false} />
                  <YAxis width={54} tick={{ fontSize: 11, fill: 'var(--ak-dim2)' }}
                         axisLine={false} tickLine={false} domain={['auto', 'auto']}
                         tickFormatter={v => (v / 10000).toFixed(0) + '万'} />
                  <Tooltip
                    formatter={(v, n) => [fmtMoney(v) + ' 元', n === 'total' ? '总资产' : '总成本']}
                    contentStyle={{ background: 'var(--bg)', border: '1px solid var(--ak-line)', borderRadius: 3, fontSize: 12 }} />
                  <Line type="monotone" dataKey="cost"  stroke="var(--ak-dim2)" strokeWidth={1}
                        strokeDasharray="3 3" dot={false} />
                  <Line type="monotone" dataKey="total" stroke="var(--text-primary)" strokeWidth={1.5}
                        dot={{ r: 2.5, fill: 'var(--bg)', strokeWidth: 1.5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="ak-snapdelta">
              <span>实线为总资产，虚线为总成本</span>
              <span>
                较首个快照 {fmtSigned(snaps[snaps.length - 1].total - snaps[0].total)} 元
              </span>
            </div>
          </>
        )}
      </section>

      {/* 持仓 */}
      <section className="ak-sec">
        <div className="ak-sec-head">
          <h2 className="ak-sec-title">持仓<span className="ak-count">{data.holdings.length}</span></h2>
          <div className="ak-adds">
            {KINDS.map(k => (
              <button key={k} className="ak-btn ak-btn-xs" onClick={() => add(k)}><Plus size={11} />{KIND_LABEL[k]}</button>
            ))}
          </div>
        </div>

        <div className="ak-scroll">
          <table className="ak-table">
            <colgroup>
              <col style={{ width: '24%' }} /><col style={{ width: '10%' }} /><col style={{ width: '8%' }} />
              <col style={{ width: '13%' }} /><col style={{ width: '10%' }} /><col style={{ width: '10%' }} />
              <col style={{ width: '12%' }} /><col style={{ width: '10%' }} /><col style={{ width: '3%' }} />
            </colgroup>
            <thead>
              <tr>
                <th>标的</th><th>账户</th><th>类别</th>
                <th className="r">数量 / 金额</th><th className="r">成本价</th><th className="r">现价</th>
                <th className="r">市值</th><th className="r">盈亏</th><th />
              </tr>
            </thead>
            <tbody>
              {data.holdings.length === 0 && (
                <tr><td colSpan={9} className="ak-empty">账本是空的。用上方按钮加一行。</td></tr>
              )}
              {data.holdings.map(h => {
                const amt  = isAmountKind(h.kind)
                const pnl  = holdingPnl(h)
                const tags = Object.entries(h.factors || {})
                const open = expanded === h.id
                return (
                  <React.Fragment key={h.id}>
                    <tr className={open ? 'ak-row open' : 'ak-row'}>
                      <td>
                        <Edit value={h.name} onChange={v => update(h.id, { name: v })} placeholder="名称" />
                        <div className="ak-sub">
                          {!amt && <Edit value={h.code} onChange={v => update(h.id, { code: v })} placeholder="代码" small w="72px" />}
                          <button className="ak-tag" onClick={() => setExpanded(open ? null : h.id)}>
                            {tags.length ? tags.map(([k, w]) => `${FACTOR_LABEL[k] || k} ${w}`).join(' · ') : '标注因子'}
                          </button>
                        </div>
                      </td>
                      <td><Pick value={h.account} onChange={v => update(h.id, { account: v })} options={data.accounts.map(a => [a.id, a.name])} /></td>
                      <td><Pick value={h.kind} onChange={v => update(h.id, { kind: v })} options={KINDS.map(k => [k, KIND_LABEL[k]])} /></td>
                      <td className="r"><Edit type="number" align="right" value={amt ? h.amount : h.qty} onChange={v => update(h.id, amt ? { amount: v } : { qty: v })} /></td>
                      <td className="r">{amt ? <i className="ak-dash">—</i> : <Edit type="number" align="right" value={h.cost} onChange={v => update(h.id, { cost: v })} />}</td>
                      <td className="r">{amt ? <i className="ak-dash">—</i> : (
                        <div className="ak-price">
                          <Edit type="number" align="right" value={h.price} onChange={v => update(h.id, { price: v })} />
                          {h.priceAsOf && (
                            <span className="ak-src" title={`${h.priceSource === 'gz' ? '盘中估值' : h.priceSource === 'nav' ? '基金净值' : '日K收盘'} · ${h.priceAsOf}`}>
                              {h.priceAsOf.slice(5, 10)}
                            </span>
                          )}
                        </div>
                      )}</td>
                      <td className="r ak-val">{fmtMoney(holdingValue(h))}</td>
                      <td className={`r ${amt ? 'ak-dash' : pnl >= 0 ? 'ak-up' : 'ak-dn'}`}>
                        {amt ? '—' : <>{fmtSigned(pnl)}<span className="ak-pct">{holdingPnlPct(h).toFixed(2)}%</span></>}
                      </td>
                      <td className="r"><button className="ak-del" title="删除这一行" onClick={() => remove(h.id)}><Trash2 size={13} /></button></td>
                    </tr>
                    {open && (
                      <tr className="ak-expand">
                        <td colSpan={9}>
                          <div className="ak-exp-title">{h.name || '未命名'} — 因子权重</div>
                          <div className="ak-exp-grid">
                            {COMMON_FACTORS.map(k => (
                              <label key={k}>
                                <span>{FACTOR_LABEL[k] || k}</span>
                                <input type="number" step="0.05" placeholder="0" value={h.factors?.[k] ?? ''}
                                       onChange={e => setFactor(h.id, k, e.target.value)} />
                              </label>
                            ))}
                          </div>
                          <p className="ak-exp-hint">
                            权重是这个标的对该因子的暴露程度，不是它在组合里的占比。纯金填 1；
                            金铜矿企按收入或利润结构分摊，可以同时填黄金和铜。
                          </p>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <p className="footer-note">
        账本只存在本机 <code>data/portfolio.json</code>，不上传任何服务器，每日首次写入前自动备份。<br />
        股票与场外基金现价自动拉取（东方财富），现金类金额仍需手动更新。<br />
        交易日 15:05 后首次打开本页会自动记录当日快照，同一天重复打开会覆盖刷新。<br />
        本页只做记录与计算，不构成投资建议。
      </p>
    </div>
  )
}

/* ═════════ 局部组件 ═════════ */

function Stat({ label, big, suffix, sub, tone }) {
  return (
    <div className="ak-stat">
      <div className="ak-stat-label">{label}</div>
      <div className={`ak-stat-big ${tone || ''}`}>{big}{suffix && <i>{suffix}</i>}</div>
      <div className="ak-stat-sub">{sub}</div>
    </div>
  )
}

function Donut({ title, map, total }) {
  const rows = Object.entries(map).map(([name, value]) => ({ name, value }))
    .filter(r => r.value > 0).sort((a, b) => b.value - a.value)
  if (!rows.length) return <div><div className="ak-split-title">{title}</div><p className="ak-quiet">暂无数据</p></div>

  /* 引线标注：名称 + 占比画在扇区外侧，不用单独图例 */
  const label = ({ cx, cy, midAngle, outerRadius, index }) => {
    const RAD = Math.PI / 180
    const cos = Math.cos(-midAngle * RAD), sin = Math.sin(-midAngle * RAD)
    const [x1, y1] = [cx + (outerRadius + 3) * cos,  cy + (outerRadius + 3) * sin]
    const [x2, y2] = [cx + (outerRadius + 20) * cos, cy + (outerRadius + 20) * sin]
    const right = cos >= 0
    const x3 = x2 + (right ? 14 : -14)
    const r = rows[index]
    return (
      <g>
        <polyline points={`${x1},${y1} ${x2},${y2} ${x3},${y2}`} fill="none"
                  stroke="var(--ak-line)" strokeWidth={1} />
        <text x={x3 + (right ? 5 : -5)} y={y2 - 3} textAnchor={right ? 'start' : 'end'}
              fill="var(--text-primary)" fontSize={12}>{r.name}</text>
        <text x={x3 + (right ? 5 : -5)} y={y2 + 12} textAnchor={right ? 'start' : 'end'}
              fill="var(--ak-dim)" fontSize={11} style={{ fontVariantNumeric: 'tabular-nums' }}>
          {total ? ((r.value / total) * 100).toFixed(1) : '0.0'}%　{fmtMoney(r.value)}
        </text>
      </g>
    )
  }

  return (
    <div>
      <div className="ak-split-title">{title}</div>
      <div className="ak-donut">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={rows} dataKey="value" nameKey="name" cx="50%" cy="50%"
                 innerRadius={46} outerRadius={72} paddingAngle={1.5} stroke="none"
                 isAnimationActive={false} labelLine={false} label={label}>
              {rows.map((r, i) => (
                <Cell key={r.name} fill="var(--text-primary)" fillOpacity={STEP[i % STEP.length]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="ak-donut-center">
          <b>{(total / 10000).toLocaleString('zh-CN', { maximumFractionDigits: 1 })}万</b>
          <i>{rows.length} 项</i>
        </div>
      </div>
    </div>
  )
}

function Edit({ value, onChange, type = 'text', align = 'left', placeholder = '', small, w }) {
  return (
    <input className={`ak-input${small ? ' small' : ''}`} type={type} value={value ?? ''} placeholder={placeholder}
           onChange={e => onChange(e.target.value)} style={{ textAlign: align, width: w || '100%' }} />
  )
}

function Pick({ value, onChange, options }) {
  return (
    <select className="ak-select" value={value} onChange={e => onChange(e.target.value)}>
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  )
}

/* ═════════ 作用域样式 ═════════ */

function Style() {
  return <style>{`
.ak{
  /* 全局 --text-secondary/#999 与 --text-hint/#ccc 在白底上对比度不足，本页局部提高 */
  --ak-dim:  color-mix(in srgb, var(--text-primary) 58%, var(--bg));
  --ak-dim2: color-mix(in srgb, var(--text-primary) 38%, var(--bg));
  --ak-line: color-mix(in srgb, var(--text-primary) 12%, var(--bg));
  --ak-hair: color-mix(in srgb, var(--text-primary) 7%, var(--bg));
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum' 1, 'cv05' 1;
}
.ak-quiet{ font-size:13px; color:var(--ak-dim); letter-spacing:.01em; margin:6px 0 0; }

/* 头部 */
.ak-head{ padding-bottom:44px; border-bottom:1px solid var(--ak-line); }
.ak-actions{ display:flex; gap:8px; flex-wrap:wrap; margin-top:26px; }
.ak-banner{ margin-top:18px; }

.ak-btn{
  display:inline-flex; align-items:center; gap:6px; font-family:inherit;
  background:transparent; border:1px solid var(--ak-line); border-radius:3px;
  color:var(--ak-dim); font-size:12px; font-weight:500; letter-spacing:.06em;
  padding:9px 16px; cursor:pointer; transition:color .15s, border-color .15s;
}
.ak-btn:hover{ color:var(--text-primary); border-color:var(--text-primary); }
.ak-btn:focus-visible{ outline:2px solid var(--text-primary); outline-offset:2px; }
.ak-btn-solid{ background:var(--text-primary); border-color:var(--text-primary); color:var(--bg); }
.ak-btn-solid:hover{ opacity:.82; color:var(--bg); }
.ak-btn-xs{ font-size:11px; padding:5px 10px; letter-spacing:.04em; }

/* 分区 */
.ak-sec{ padding:52px 0; border-bottom:1px solid var(--ak-line); }
.ak-sec:last-of-type{ border-bottom:none; }
.ak-sec-head{ display:flex; align-items:baseline; justify-content:space-between; gap:16px; flex-wrap:wrap; margin-bottom:30px; }
.ak-sec-title{
  font-size:12px; font-weight:500; letter-spacing:.16em; text-transform:uppercase;
  color:var(--text-primary); margin:0;
}
.ak-count{ font-size:11px; color:var(--ak-dim2); margin-left:10px; letter-spacing:0; }
.ak-adds{ display:flex; gap:6px; flex-wrap:wrap; }

/* 汇总 */
.ak-stats{ display:grid; grid-template-columns:repeat(4,1fr); gap:1px; background:var(--ak-line); border:1px solid var(--ak-line); }
.ak-stat{ background:var(--bg); padding:24px 22px 20px; }
.ak-stat-label{ font-size:11px; font-weight:500; letter-spacing:.14em; color:var(--ak-dim); margin-bottom:14px; }
.ak-stat-big{ font-size:34px; font-weight:300; letter-spacing:-.025em; line-height:1; color:var(--text-primary); }
.ak-stat-big i{ font-size:17px; font-style:normal; margin-left:2px; letter-spacing:0; }
.ak-stat-big.up{ color:var(--up); } .ak-stat-big.dn{ color:var(--dn); }
.ak-stat-sub{ font-size:12px; color:var(--ak-dim2); margin-top:11px; letter-spacing:.01em; }

/* 因子 */
.ak-factors{ display:flex; flex-direction:column; gap:26px; }
.ak-factor-top{ display:flex; align-items:baseline; justify-content:space-between; margin-bottom:9px; }
.ak-factor-name{ font-size:14px; color:var(--text-primary); letter-spacing:.02em; }
.ak-factor-pct{ font-size:26px; font-weight:300; letter-spacing:-.02em; color:var(--text-primary); }
.ak-factor-pct i{ font-size:13px; font-style:normal; color:var(--ak-dim2); margin-left:2px; }
.ak-rail{ height:2px; background:var(--ak-hair); }
.ak-rail-fill{ height:100%; background:var(--text-primary); }
.ak-factor-from{ display:flex; flex-wrap:wrap; align-items:baseline; gap:6px 14px; margin-top:11px; }
.ak-factor-amt{ font-size:12px; color:var(--ak-dim); min-width:96px; }
.ak-chip{ font-size:12px; color:var(--ak-dim2); letter-spacing:.01em; }
.ak-chip b{ font-weight:400; color:var(--ak-dim); margin-left:6px; }
.ak-note{
  font-size:12px; line-height:1.7; color:var(--ak-dim); margin:30px 0 0;
  padding:13px 16px; border-left:2px solid var(--ak-line); background:var(--bg-secondary);
}

/* 构成 */
.ak-splits{ display:grid; grid-template-columns:repeat(auto-fit,minmax(400px,1fr)); gap:32px; }
.ak-split-title{ font-size:11px; font-weight:500; letter-spacing:.14em; color:var(--ak-dim); margin-bottom:14px; }
.ak-donut{ position:relative; height:270px; }
.ak-donut-center{
  position:absolute; inset:0; display:flex; flex-direction:column;
  align-items:center; justify-content:center; pointer-events:none;
}
.ak-donut-center b{ font-size:21px; font-weight:300; letter-spacing:-.02em; color:var(--text-primary); }
.ak-donut-center i{ font-size:11px; font-style:normal; color:var(--ak-dim2); margin-top:4px; letter-spacing:.06em; }

.ak-chart{ height:240px; margin-top:4px; }
.ak-snapdelta{
  display:flex; justify-content:space-between; gap:16px; flex-wrap:wrap;
  font-size:12px; color:var(--ak-dim); margin-top:14px;
  padding-top:12px; border-top:1px solid var(--ak-hair);
}

/* 表格 */
.ak-scroll{ overflow-x:auto; }
.ak-table{ width:100%; min-width:960px; border-collapse:collapse; table-layout:fixed; }
.ak-table th{
  font-size:11px; font-weight:500; letter-spacing:.12em; color:var(--ak-dim);
  text-align:left; padding:0 10px 12px; border-bottom:1px solid var(--ak-line);
}
.ak-table th.r, .ak-table td.r{ text-align:right; }
.ak-table td{ padding:14px 10px; border-bottom:1px solid var(--ak-hair); font-size:13px; vertical-align:top; color:var(--text-primary); }
.ak-row:hover td{ background:var(--bg-secondary); }
.ak-row.open td{ border-bottom-color:transparent; }
.ak-empty{ color:var(--ak-dim); padding:28px 10px !important; }
.ak-val{ color:var(--text-primary); }
.ak-up{ color:var(--up); } .ak-dn{ color:var(--dn); }
.ak-dash{ color:var(--ak-dim2); font-style:normal; }
.ak-pct{ display:block; font-size:11px; opacity:.72; margin-top:2px; }
.ak-sub{ display:flex; align-items:center; gap:10px; margin-top:5px; }

.ak-input{
  background:transparent; border:none; border-bottom:1px solid transparent; border-radius:0;
  color:var(--text-primary); font-family:inherit; font-size:13px; padding:2px 0;
  outline:none; font-variant-numeric:tabular-nums; width:100%;
}
.ak-price{ display:flex; align-items:baseline; justify-content:flex-end; gap:0; }
.ak-price .ak-input{ flex:1 1 auto; min-width:0; }
.ak-src{ font-size:10px; color:var(--ak-dim2); margin-left:5px; white-space:nowrap; cursor:help; }
.ak-input.small{ font-size:11px; color:var(--ak-dim); }
.ak-input:hover{ border-bottom-color:var(--ak-line); }
.ak-input:focus{ border-bottom-color:var(--text-primary); }
.ak-input::placeholder{ color:var(--ak-dim2); }
.ak-input::-webkit-inner-spin-button,.ak-input::-webkit-outer-spin-button{ -webkit-appearance:none; }
.ak-input[type=number]{ -moz-appearance:textfield; }

.ak-select{
  background:transparent; border:none; outline:none; color:var(--text-primary);
  font-family:inherit; font-size:13px; padding:2px 0; cursor:pointer; width:100%;
}
.ak-tag{
  background:none; border:none; padding:0; cursor:pointer; font-family:inherit;
  font-size:11px; color:var(--ak-dim2); letter-spacing:.02em; text-align:left;
  border-bottom:1px dashed var(--ak-line); transition:color .15s;
}
.ak-tag:hover{ color:var(--text-primary); }
.ak-del{ background:none; border:none; padding:0; cursor:pointer; color:var(--ak-dim2); transition:color .15s; }
.ak-del:hover{ color:var(--up); }

.ak-expand td{ padding:2px 10px 22px; background:var(--bg-secondary); }
.ak-exp-title{ font-size:11px; font-weight:500; letter-spacing:.12em; color:var(--ak-dim); margin-bottom:14px; }
.ak-exp-grid{ display:flex; flex-wrap:wrap; gap:12px 26px; }
.ak-exp-grid label{ display:flex; align-items:center; gap:9px; font-size:12px; color:var(--ak-dim); }
.ak-exp-grid input{
  width:56px; background:transparent; border:none; border-bottom:1px solid var(--ak-line);
  color:var(--text-primary); font-family:inherit; font-size:12px; text-align:right;
  padding:2px 0; outline:none; font-variant-numeric:tabular-nums;
}
.ak-exp-grid input:focus{ border-bottom-color:var(--text-primary); }
.ak-exp-hint{ font-size:11px; line-height:1.8; color:var(--ak-dim2); margin:16px 0 0; max-width:620px; }

@media (max-width:768px){
  .ak-stats{ grid-template-columns:1fr 1fr; }
  .ak-stat{ padding:18px 16px 16px; }
  .ak-stat-big{ font-size:26px; }
  .ak-sec{ padding:38px 0; }
  .ak-splits{ gap:20px; grid-template-columns:1fr; }
  .ak-donut{ height:250px; }
  .ak-chart{ height:200px; }
  .ak-factor-pct{ font-size:22px; }
}
@media (prefers-reduced-motion:reduce){ .ak *{ transition:none !important; } }
`}</style>
}
