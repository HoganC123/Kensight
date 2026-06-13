import React, { useState } from 'react'
import { fetchKlines } from '../utils/eastmoney.js'
import { runMACrossover, runGridStrategy, runDCA, PRESETS } from '../utils/backtest-engine.js'
import { MetricCard, InputField, Divider, SectionHeading, Banner } from '../components/UI.jsx'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { fmtSign, fmtComma } from '../utils/calc.js'

/* ────────────────────────────────────────────────
   策略与预设的组织：
   · 短线 / 波段 两个预设共用「均线 / 网格」两个策略，只是默认参数不同
   · 长线预设对应「定投」策略
   用户先选交易风格（预设），再在该风格下选具体策略（短线/波段时）。
──────────────────────────────────────────────── */
const STYLES = [
  { id: 'short', label: '短线', desc: '持仓几天，止损紧、止盈近' },
  { id: 'swing', label: '波段', desc: '持仓几周到几月，止损松、让趋势跑' },
  { id: 'long',  label: '长线定投', desc: '周期定额买入，长期持有不择时' },
]

export default function BacktestPage() {
  // 交易风格（预设）
  const [style, setStyle] = useState('short')
  // 短线/波段下的具体策略
  const [strategy, setStrategy] = useState('ma')

  // 通用输入
  const [code, setCode] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [initialCapital, setInitialCapital] = useState('100000')
  const [tradeQty, setTradeQty] = useState('1000')

  // 均线参数
  const [shortPeriod, setShortPeriod] = useState('5')
  const [longPeriod, setLongPeriod] = useState('20')
  const [stopLoss, setStopLoss] = useState('5')
  const [takeProfit, setTakeProfit] = useState('8')

  // 网格参数
  const [gridGap, setGridGap] = useState('2')
  const [maxLots, setMaxLots] = useState('4')

  // 定投参数
  const [intervalDays, setIntervalDays] = useState('20')
  const [investAmount, setInvestAmount] = useState('5000')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [showAll, setShowAll] = useState(false)

  // 切换交易风格时，把参数重置为该风格的预设默认值
  const applyStyle = (id) => {
    setStyle(id)
    setResult(null)
    setError(null)
    const p = PRESETS[id]
    if (id === 'long') {
      setIntervalDays(String(p.dca.intervalDays))
      setInvestAmount(String(p.dca.investAmount))
    } else {
      setShortPeriod(String(p.ma.shortPeriod))
      setLongPeriod(String(p.ma.longPeriod))
      setStopLoss(String(p.ma.stopLoss))
      setTakeProfit(String(p.ma.takeProfit))
      setGridGap(String(p.grid.gridGap))
      setMaxLots(String(p.grid.maxLots))
    }
  }

  const handleRun = async () => {
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      if (!code || !startDate || !endDate) {
        throw new Error('请填写股票代码、开始日期和结束日期')
      }
      // 日期选择器输出 YYYY-MM-DD，东方财富 API 需要 YYYYMMDD
      const beg = startDate.replace(/-/g, '')
      const end = endDate.replace(/-/g, '')

      const klines = await fetchKlines(code, beg, end)

      const baseCapital = Number(initialCapital) || 100000
      const baseQty = Number(tradeQty) || 1000

      let res
      if (style === 'long') {
        res = runDCA(klines, {
          intervalDays: Number(intervalDays) || 20,
          investAmount: Number(investAmount) || 5000,
          initialCapital: baseCapital,
        })
      } else if (strategy === 'ma') {
        res = runMACrossover(klines, {
          shortPeriod: Number(shortPeriod) || 5,
          longPeriod: Number(longPeriod) || 20,
          stopLoss: Number(stopLoss) || 0,
          takeProfit: Number(takeProfit) || 0,
          initialCapital: baseCapital,
          tradeQty: baseQty,
        })
      } else {
        res = runGridStrategy(klines, {
          gridGap: Number(gridGap) || 3,
          maxLots: Number(maxLots) || 5,
          initialCapital: baseCapital,
          tradeQty: baseQty,
        })
      }
      setResult(res)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const displayTrades = (result && result.trades)
    ? (showAll ? result.trades : result.trades.slice(0, 20))
    : []

  const isDCA = result && result.stats && result.stats.isDCA

  return (
    <div className="page">
      <h1 className="page-title">回测模拟器</h1>
      <p className="page-sub">选择交易风格与策略，基于历史K线数据模拟交易表现。</p>

      {/* ── 交易风格（预设）切换 ── */}
      <SectionHeading>交易风格</SectionHeading>
      <div className="tabs" style={{ marginBottom: '8px' }}>
        {STYLES.map(s => (
          <button
            key={s.id}
            className={`tab-btn ${style === s.id ? 'active' : ''}`}
            onClick={() => applyStyle(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '32px' }}>
        {STYLES.find(s => s.id === style)?.desc}
      </div>

      {/* ── 短线/波段下的具体策略选择 ── */}
      {style !== 'long' && (
        <div className="tabs" style={{ marginBottom: '32px' }}>
          <button
            className={`tab-btn ${strategy === 'ma' ? 'active' : ''}`}
            onClick={() => { setStrategy('ma'); setResult(null) }}
          >
            均线交叉
          </button>
          <button
            className={`tab-btn ${strategy === 'grid' ? 'active' : ''}`}
            onClick={() => { setStrategy('grid'); setResult(null) }}
          >
            网格波段
          </button>
        </div>
      )}

      <SectionHeading>输入区</SectionHeading>
      <div className="input-grid" style={{ marginBottom: '24px' }}>
        {/* 通用：代码 + 日期 */}
        <div>
          <div className="field-label">股票代码</div>
          <input
            type="text"
            className="field-input"
            placeholder="如 601899"
            value={code}
            onChange={e => setCode(e.target.value)}
          />
        </div>
        <div>
          <div className="field-label">开始日期</div>
          <input
            type="date"
            className="field-input"
            value={startDate}
            max={endDate || undefined}
            onChange={e => setStartDate(e.target.value)}
          />
        </div>
        <div>
          <div className="field-label">结束日期</div>
          <input
            type="date"
            className="field-input"
            value={endDate}
            min={startDate || undefined}
            onChange={e => setEndDate(e.target.value)}
          />
        </div>

        {/* 定投：资金池 + 周期 + 每期金额 */}
        {style === 'long' ? (
          <>
            <InputField label="资金池上限（元）" value={initialCapital} onChange={setInitialCapital} step="10000" />
            <InputField label="定投周期（交易日）" value={intervalDays} onChange={setIntervalDays} step="1" />
            <InputField label="每期投入（元）" value={investAmount} onChange={setInvestAmount} step="500" />
          </>
        ) : (
          <>
            <InputField label="初始资金（元）" value={initialCapital} onChange={setInitialCapital} step="10000" />
            <InputField label="每次交易数量（股）" value={tradeQty} onChange={setTradeQty} step="100" />

            {strategy === 'ma' && (
              <>
                <InputField label="短期均线天数" value={shortPeriod} onChange={setShortPeriod} step="1" />
                <InputField label="长期均线天数" value={longPeriod} onChange={setLongPeriod} step="1" />
                <InputField label="止损线（%）" value={stopLoss} onChange={setStopLoss} step="0.5" />
                <InputField label="止盈线（%，0=不设）" value={takeProfit} onChange={setTakeProfit} step="0.5" />
              </>
            )}

            {strategy === 'grid' && (
              <>
                <InputField label="网格间距（%）" value={gridGap} onChange={setGridGap} step="0.5" />
                <InputField label="最大持仓档数" value={maxLots} onChange={setMaxLots} step="1" />
              </>
            )}
          </>
        )}
      </div>

      <button className="btn-primary" onClick={handleRun} disabled={loading}>
        {loading ? '正在获取数据...' : '开始回测'}
      </button>

      {error && <Banner type="error">{error}</Banner>}

      {result && (
        <>
          <SectionHeading>核心指标</SectionHeading>

          {isDCA ? (
            /* ── 定投专属指标卡（无胜率，看投入vs市值） ── */
            <div className="metric-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
              <MetricCard label="累计投入" value={`${fmtComma(result.stats.totalInvested)} 元`} />
              <MetricCard label="持仓市值" value={`${fmtComma(result.stats.holdingValue)} 元`} />
              <MetricCard
                label="定投收益"
                value={`${fmtSign(result.stats.dcaReturn)} 元`}
                color={result.stats.dcaReturn >= 0 ? 'up' : 'down'}
              />
              <MetricCard
                label="定投收益率"
                value={`${fmtSign(result.stats.dcaReturnPct)}%`}
                color={result.stats.dcaReturnPct >= 0 ? 'up' : 'down'}
              />
              <MetricCard label="持仓股数" value={`${result.stats.holdingShares.toLocaleString()} 股`} />
              <MetricCard label="平均成本" value={`${result.stats.avgCost.toFixed(3)} 元`} />
              <MetricCard label="定投次数" value={`${result.stats.tradeCount} 次`} />
              <MetricCard
                label="最大回撤"
                value={`-${result.stats.maxDrawdown.toFixed(2)}%`}
                color="down"
              />
            </div>
          ) : (
            /* ── 短线/波段指标卡 ── */
            <div className="metric-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
              <MetricCard
                label="总收益"
                value={`${fmtSign(result.stats.totalReturn)} 元`}
                color={result.stats.totalReturn >= 0 ? 'up' : 'down'}
              />
              <MetricCard
                label="总收益率"
                value={`${fmtSign(result.stats.totalReturnPct)}%`}
                color={result.stats.totalReturnPct >= 0 ? 'up' : 'down'}
              />
              <MetricCard
                label="胜率"
                value={result.stats.winRate === null ? '—' : `${result.stats.winRate.toFixed(1)}%`}
              />
              <MetricCard
                label="最大回撤"
                value={`-${result.stats.maxDrawdown.toFixed(2)}%`}
                color="down"
              />
              <MetricCard label="交易次数" value={`${result.stats.tradeCount} 次`} />
              <MetricCard
                label="年化收益率"
                value={result.dailyValues.length < 60 ? '样本过短' : `${fmtSign(result.stats.annualReturn)}%`}
                color={result.stats.annualReturn >= 0 ? 'up' : 'down'}
              />
            </div>
          )}

          <Divider />
          <SectionHeading>资金曲线</SectionHeading>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={result.dailyValues}>
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
                interval={Math.max(0, Math.floor(result.dailyValues.length / 6))}
                angle={-30}
                textAnchor="end"
                height={50}
              />
              <YAxis
                tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
                domain={['dataMin', 'dataMax']}
                tickFormatter={v => (v / 10000).toFixed(1) + '万'}
              />
              <Tooltip
                formatter={(v) => [fmtComma(v) + ' 元', '总资产']}
                labelStyle={{ color: 'var(--text-secondary)' }}
                contentStyle={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  fontSize: '12px',
                }}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#e63946"
                dot={false}
                strokeWidth={1.5}
              />
            </LineChart>
          </ResponsiveContainer>

          <Divider />
          <SectionHeading>交易明细</SectionHeading>
          <div style={{ overflowX: 'auto' }}>
            <div
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                overflow: 'hidden',
                minWidth: '560px',
              }}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 80px 1fr 1fr 1fr 1fr',
                  padding: '10px 16px',
                  borderBottom: '1px solid var(--border)',
                  fontSize: '11px',
                  color: 'var(--text-secondary)',
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                }}
              >
                <span>日期</span>
                <span>方向</span>
                <span>价格（元）</span>
                <span>数量（股）</span>
                <span>手续费（元）</span>
                <span>单笔盈亏（元）</span>
              </div>

              {displayTrades.map((t, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 80px 1fr 1fr 1fr 1fr',
                    padding: '12px 16px',
                    fontSize: '13px',
                    fontVariantNumeric: 'tabular-nums',
                    borderBottom: idx < displayTrades.length - 1 ? '1px solid var(--border)' : 'none',
                  }}
                >
                  <span>{t.date}</span>
                  <span style={{ color: t.type === 'buy' ? 'var(--dn)' : 'var(--up)' }}>
                    {t.type === 'buy' ? '买入' : '卖出'}
                  </span>
                  <span>{t.price.toFixed(3)}</span>
                  <span>{t.qty}</span>
                  <span>{t.fee.toFixed(2)}</span>
                  <span
                    style={{
                      color:
                        t.type === 'buy'
                          ? 'var(--text-secondary)'
                          : t.profit > 0
                          ? 'var(--up)'
                          : t.profit < 0
                          ? 'var(--dn)'
                          : 'var(--text-secondary)',
                    }}
                  >
                    {t.type === 'buy' ? '—' : fmtSign(t.profit)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {result.trades.length > 20 && !showAll && (
            <button
              onClick={() => setShowAll(true)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-secondary)',
                fontSize: '12px',
                cursor: 'pointer',
                marginTop: '8px',
              }}
            >
              显示全部 {result.trades.length} 条
            </button>
          )}
        </>
      )}

      <div
        style={{
          marginTop: '48px',
          paddingTop: '16px',
          borderTop: '1px solid var(--border)',
          fontSize: '12px',
          color: 'var(--text-secondary)',
        }}
      >
        本工具仅用于辅助计算，不构成投资建议。佣金按万分之三计算，最低5元/笔；印花税0.1%仅卖出时收取。
        回测假设理想成交（按信号价撮合，不含滑点），实盘成交价可能更差，实际收益通常低于回测结果。
      </div>
    </div>
  )
}
