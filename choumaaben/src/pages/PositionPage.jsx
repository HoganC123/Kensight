import React, { useState } from 'react'
import { posFees, parseNum, fmt, fmtSign, fmtComma } from '../utils/calc.js'
import {
  MetricCard, InputField, Divider, SectionHeading, Banner
} from '../components/UI.jsx'

export default function PositionPage() {
  const [capital,  setCapital]  = useState('')
  const [maxLoss,  setMaxLoss]  = useState('')
  const [buyPx,    setBuyPx]    = useState('')
  const [stopPx,   setStopPx]   = useState('')
  const [targetPx, setTargetPx] = useState('')
  const [batches,  setBatches]  = useState(2)

  const cap  = parseNum(capital)
  const ml   = parseNum(maxLoss)
  const bp   = parseNum(buyPx)
  const sp   = parseNum(stopPx)
  const tp   = parseNum(targetPx)

  const canCalc = cap > 0 && ml > 0 && bp > 0 && sp > 0

  let result = null
  let err    = null

  if (canCalc) {
    if (sp >= bp) {
      err = '止损价格必须低于买入价格。'
    } else if (tp > 0 && tp <= bp) {
      err = '目标价格必须高于买入价格。'
    } else {
      const riskPerShare   = bp - sp
      const shares         = Math.floor(ml / riskPerShare / 100) * 100
      if (shares === 0) {
        err = '按当前参数计算，建议仓位不足 100 股。请增大最大亏损或缩小止损距离。'
      } else {
        const buyAmount    = shares * bp
        const capRatio     = buyAmount / cap * 100
        const feesStop     = posFees(bp, sp, shares)
        const stopLossNet  = shares * riskPerShare + feesStop.total

        let profitNet = null, rr = null, stopPct = null, targetPct = null
        if (tp > 0) {
          const feesWin = posFees(bp, tp, shares)
          profitNet     = shares * (tp - bp) - feesWin.total
          rr            = stopLossNet > 0 ? profitNet / stopLossNet : 0
          stopPct       = (bp - sp) / bp * 100
          targetPct     = (tp - bp) / bp * 100
        }

        result = { shares, buyAmount, capRatio, feesStop, stopLossNet, profitNet, rr, stopPct, targetPct }
      }
    }
  }

  /* Batched position plan */
  let batchPlan = []
  if (result) {
    const riskPerShare = bp - sp
    const priceStep    = riskPerShare * 0.15
    const perBatch     = Math.max(100, Math.floor(result.shares / batches / 100) * 100)
    const allocated    = perBatch * batches
    const extraLots    = Math.floor((result.shares - allocated) / 100)
    const batchQtys    = Array.from({ length: batches }, (_, i) =>
      perBatch + (i < extraLots ? 100 : 0)
    )
    let cumShares = 0, cumCost = 0
    batchPlan = batchQtys.map((qty, i) => {
      const refPx  = Math.max(bp - i * priceStep, sp * 1.02)
      const bCost  = qty * refPx
      cumShares   += qty
      cumCost     += bCost
      return { batch: i + 1, qty, refPx, bCost, cumShares, avgCost: cumCost / cumShares }
    })
  }

  return (
    <div className="page">
      <h1 className="page-title">仓位与止损计算器</h1>
      <p className="page-subtitle" style={{ marginBottom: '32px', color: 'var(--text-secondary)' }}>
        根据资金规模与风险承受能力，计算合理仓位和止损金额。
      </p>

      <Divider />
      <SectionHeading>输入区</SectionHeading>

      {/* Flat input-grid — row-major order: 总资金|买入价|目标价 / 最大亏损|止损价 */}
      <div className="input-grid">
        <InputField label="总资金（元）"             value={capital}  onChange={setCapital}  step="10000" />
        <InputField label="计划买入价格（元）"        value={buyPx}    onChange={setBuyPx}    step="0.01" />
        <InputField label="目标价格（元，可选）"      value={targetPx} onChange={setTargetPx} step="0.01" />
        <InputField label="单笔最大可承受亏损（元）"  value={maxLoss}  onChange={setMaxLoss}  step="100" />
        <InputField label="止损价格（元）"            value={stopPx}   onChange={setStopPx}   step="0.01" />
      </div>

      {!canCalc ? (
        <>
          <Divider />
          <Banner type="info">请填写全部必填项：总资金、最大亏损、买入价、止损价。</Banner>
        </>
      ) : err ? (
        <>
          <Divider />
          <Banner type={err.includes('不足') ? 'warning' : 'error'}>{err}</Banner>
        </>
      ) : (
        <>
          <Divider />
          <SectionHeading>核心结果</SectionHeading>

          <div className="metric-grid">
            <MetricCard label="建议买入数量"        value={`${result.shares.toLocaleString()} 股`} />
            <MetricCard label="实际动用资金"         value={`${fmtComma(result.buyAmount)} 元`} />
            <MetricCard label="占总资金比例"         value={`${result.capRatio.toFixed(1)}%`} />
            <MetricCard
              label="止损金额（含手续费）"
              value={`${result.stopLossNet.toFixed(2)} 元`}
            />
          </div>

          {/* Risk level */}
          <div style={{ marginTop: '12px' }}>
            {result.capRatio < 30 ? (
              <Banner type="success">✅ 轻仓操作（{result.capRatio.toFixed(1)}%）— 风险可控</Banner>
            ) : result.capRatio < 60 ? (
              <Banner type="info">ℹ️ 中等仓位（{result.capRatio.toFixed(1)}%）— 注意止损执行</Banner>
            ) : result.capRatio < 80 ? (
              <Banner type="warning">⚠️ 重仓操作（{result.capRatio.toFixed(1)}%）— 严格执行止损</Banner>
            ) : (
              <Banner type="error">🚨 接近满仓（{result.capRatio.toFixed(1)}%）— 风险极高，谨慎操作</Banner>
            )}
          </div>

          {/* P&L ratio when target given */}
          {tp > 0 && result.rr !== null && (
            <>
              <Divider />
              <SectionHeading>盈亏分析</SectionHeading>
              <div className="metric-grid">
                <MetricCard
                  label="目标盈利（税后）"
                  value={`${fmtSign(result.profitNet)} 元`}
                  color="up"
                />
                <MetricCard
                  label="盈亏比（收益:风险）"
                  value={`${result.rr.toFixed(2)} : 1`}
                  color={result.rr >= 2 ? 'down' : result.rr >= 1.5 ? 'neutral' : 'up'}
                />
                <MetricCard
                  label="止损距离"
                  value={`-${result.stopPct.toFixed(2)}%`}
                  color="down"
                />
                <MetricCard
                  label="目标涨幅"
                  value={`+${result.targetPct.toFixed(2)}%`}
                  color="up"
                />
              </div>
              {result.rr < 1.5 && (
                <div style={{ marginTop: '12px' }}>
                  <Banner type="warning">
                    盈亏比 {result.rr.toFixed(2)}:1 偏低，建议 ≥ 2:1，可考虑上移止损或调低目标价来改善。
                  </Banner>
                </div>
              )}
            </>
          )}

          {/* Fee detail */}
          <Divider />
          <SectionHeading>手续费明细（止损情景）</SectionHeading>
          <div className="metric-grid">
            {[
              ['买入佣金',   result.feesStop.buyComm],
              ['卖出佣金',   result.feesStop.sellComm],
              ['印花税',     result.feesStop.stamp],
              ['手续费合计', result.feesStop.total],
            ].map(([k, v]) => (
              <MetricCard key={k} label={k} value={`${v.toFixed(2)} 元`} />
            ))}
          </div>
          <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--text-secondary)' }}>
            不含手续费止损额 {(result.shares * (bp - sp)).toFixed(2)} 元
            &nbsp;+&nbsp;手续费 {result.feesStop.total.toFixed(2)} 元
            &nbsp;= 实际损失 <strong style={{ color: 'var(--text-primary)' }}>{result.stopLossNet.toFixed(2)} 元</strong>
          </div>

          {/* Batched plan */}
          <Divider />
          <SectionHeading>分批建仓计划</SectionHeading>
          <div style={{ display: 'flex', gap: '24px', marginBottom: '16px' }}>
            {[2, 3, 4, 5].map(n => (
              <button
                key={n}
                className={`tab-btn ${batches === n ? 'active' : ''}`}
                onClick={() => setBatches(n)}
              >
                {n} 批
              </button>
            ))}
          </div>

          {/* Batch table — horizontal scroll on mobile */}
          <div style={{ overflowX: 'auto' }}>
            <div style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              overflow: 'hidden',
              minWidth: '560px',
            }}>
              {/* Header */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '60px 1fr 1fr 1fr 1fr 1fr',
                padding: '10px 16px',
                borderBottom: '1px solid var(--border)',
                fontSize: '11px',
                color: 'var(--text-secondary)',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}>
                {['批次', '数量（股）', '参考价格（元）', '本批资金（元）', '累计股数', '累计均价（元）'].map(h => (
                  <div key={h}>{h}</div>
                ))}
              </div>
              {batchPlan.map((b, i) => (
                <div
                  key={i}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '60px 1fr 1fr 1fr 1fr 1fr',
                    padding: '12px 16px',
                    borderBottom: i < batchPlan.length - 1 ? '1px solid var(--border)' : 'none',
                    fontSize: '13px',
                    fontVariantNumeric: 'tabular-nums',
                    background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                  }}
                >
                  <div style={{ color: 'var(--text-secondary)' }}>第 {b.batch} 批</div>
                  <div style={{ fontWeight: 500 }}>{b.qty.toLocaleString()}</div>
                  <div>≤ <strong>{fmt(b.refPx, 3)}</strong></div>
                  <div>{fmtComma(b.bCost)}</div>
                  <div>{b.cumShares.toLocaleString()}</div>
                  <div style={{ fontWeight: 500 }}>{fmt(b.avgCost, 3)}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--text-secondary)' }}>
            每批参考买入价逐步降低，越跌越买以摊薄成本；无论分几批建仓，触及止损价时的最大亏损始终不超过你设定的上限。
          </div>
        </>
      )}

      <div style={{ marginTop: '48px', paddingTop: '16px', borderTop: '1px solid var(--border)', fontSize: '12px', color: 'var(--text-secondary)' }}>
        本工具仅用于辅助计算，不构成投资建议。佣金按万分之三计算，最低5元/笔；印花税0.1%仅卖出时收取。
      </div>
    </div>
  )
}
