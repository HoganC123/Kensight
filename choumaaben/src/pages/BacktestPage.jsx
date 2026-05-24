import React, { useState } from 'react'
import { fetchKlines } from '../utils/eastmoney.js'
import { runMACrossover, runGridStrategy } from '../utils/backtest-engine.js'
import { MetricCard, InputField, Divider, SectionHeading, Banner } from '../components/UI.jsx'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { fmtSign, fmtComma } from '../utils/calc.js'

export default function BacktestPage() {
  const [strategy, setStrategy] = useState('ma')
  const [code, setCode] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [initialCapital, setInitialCapital] = useState('100000')
  const [tradeQty, setTradeQty] = useState('1000')
  const [shortPeriod, setShortPeriod] = useState('5')
  const [longPeriod, setLongPeriod] = useState('20')
  const [buyDip, setBuyDip] = useState('3')
  const [sellRise, setSellRise] = useState('3')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [showAll, setShowAll] = useState(false)

  const handleRun = async () => {
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      if (!code || !startDate || !endDate) {
        throw new Error('请填写股票代码、开始日期和结束日期')
      }

      const klines = await fetchKlines(code, startDate, endDate)

      const maParams = {
        shortPeriod: Number(shortPeriod) || 5,
        longPeriod: Number(longPeriod) || 20,
        initialCapital: Number(initialCapital) || 100000,
        tradeQty: Number(tradeQty) || 1000,
      }
      const gridParams = {
        buyDip: Number(buyDip) || 3,
        sellRise: Number(sellRise) || 3,
        initialCapital: Number(initialCapital) || 100000,
        tradeQty: Number(tradeQty) || 1000,
      }

      const res = strategy === 'ma'
        ? runMACrossover(klines, maParams)
        : runGridStrategy(klines, gridParams)

      setResult(res)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  // 交易明细显示
  const displayTrades = (result && result.trades)
    ? (showAll ? result.trades : result.trades.slice(0, 20))
    : []

  return (
    <div className="page">
      <h1 className="page-title">回测模拟器</h1>
      <p className="page-sub">选择策略、输入参数，基于历史K线数据模拟交易表现。</p>

      {/* 策略选择 Tab */}
      <div className="tabs" style={{ marginBottom: '32px' }}>
        <button
          className={`tab-btn ${strategy === 'ma' ? 'active' : ''}`}
          onClick={() => setStrategy('ma')}
        >
          均线交叉
        </button>
        <button
          className={`tab-btn ${strategy === 'grid' ? 'active' : ''}`}
          onClick={() => setStrategy('grid')}
        >
          网格波段
        </button>
      </div>

      <SectionHeading>输入区</SectionHeading>
      <div className="input-grid" style={{ marginBottom: '24px' }}>
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
          <div className="field-label">开始日期（YYYYMMDD）</div>
          <input
            type="text"
            className="field-input"
            placeholder="如 20240101"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
          />
        </div>
        <div>
          <div className="field-label">结束日期（YYYYMMDD）</div>
          <input
            type="text"
            className="field-input"
            placeholder="如 20241231"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
          />
        </div>
        <InputField
          label="初始资金（元）"
          type="number"
          step="10000"
          value={initialCapital}
          onChange={e => setInitialCapital(e.target.value)}
        />
        <InputField
          label="每次交易数量（股）"
          type="number"
          step="100"
          value={tradeQty}
          onChange={e => setTradeQty(e.target.value)}
        />

        {strategy === 'ma' && (
          <>
            <InputField
              label="短期均线天数"
              type="number"
              step="1"
              value={shortPeriod}
              onChange={e => setShortPeriod(e.target.value)}
            />
            <InputField
              label="长期均线天数"
              type="number"
              step="1"
              value={longPeriod}
              onChange={e => setLongPeriod(e.target.value)}
            />
          </>
        )}

        {strategy === 'grid' && (
          <>
            <InputField
              label="买入跌幅阈值（%）"
              type="number"
              step="0.5"
              value={buyDip}
              onChange={e => setBuyDip(e.target.value)}
            />
            <InputField
              label="卖出涨幅阈值（%）"
              type="number"
              step="0.5"
              value={sellRise}
              onChange={e => setSellRise(e.target.value)}
            />
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
              value={`${result.stats.winRate.toFixed(1)}%`}
            />
            <MetricCard
              label="最大回撤"
              value={`-${result.stats.maxDrawdown.toFixed(2)}%`}
              color="down"
            />
            <MetricCard
              label="交易次数"
              value={`${result.stats.tradeCount} 次`}
            />
            <MetricCard
              label="年化收益率"
              value={`${fmtSign(result.stats.annualReturn)}%`}
              color={result.stats.annualReturn >= 0 ? 'up' : 'down'}
            />
          </div>

          <Divider />
          <SectionHeading>资金曲线</SectionHeading>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={result.dailyValues}>
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
                tickCount={6}
              />
              <YAxis
                tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
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
              {/* 表头 */}
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

              {/* 数据行 */}
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
                  <span
                    style={{
                      color: t.type === 'buy' ? 'var(--dn)' : 'var(--up)',
                    }}
                  >
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
                    {t.type === 'buy' ? '—' : t.profit.toFixed(2)}
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
      </div>
    </div>
  )
}
