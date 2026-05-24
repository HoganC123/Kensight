import React, { useState } from 'react'
import { calcFees, parseNum, fmt, fmtSign, fmtComma } from '../utils/calc.js'
import {
  MetricCard, BEBoxSell, BEBoxBuy, CompareCard,
  InputField, Divider, SectionHeading, FeeDetail, PctHint, Banner
} from '../components/UI.jsx'

/* ════════════════════════════════════════
   正T（机动仓做T：先买后卖）
════════════════════════════════════════ */
function ZhengT() {
  const [holding,  setHolding]  = useState('')
  const [avgCost,  setAvgCost]  = useState('')
  const [funds,    setFunds]    = useState('')
  const [buyPx,    setBuyPx]    = useState('')
  const [sellPx,   setSellPx]   = useState('')
  const [buyQty,   setBuyQty]   = useState('')

  const h   = parseNum(holding)
  const ac  = parseNum(avgCost)
  const f   = parseNum(funds)
  const bp  = parseNum(buyPx)
  const sp  = parseNum(sellPx)
  const q   = Math.floor(parseNum(buyQty) / 100) * 100

  const maxByFund = bp > 0 ? Math.floor(f / bp / 100) * 100 : 0

  const canCalc = q > 0 && bp > 0

  let result = null
  if (canCalc) {
    const buyAmt    = q * bp
    const sellAmt   = q * sp
    const fees      = calcFees(buyAmt, sellAmt)
    const gross     = sellAmt - buyAmt
    const net       = gross - fees.total
    const dilution  = h > 0 ? net / h : 0
    const newAvg    = h > 0 ? ac - dilution : ac
    const beSell    = (buyAmt + fees.buyComm) / (q * 0.9987)

    const stuckTotal = h + q
    const stuckAvg   = stuckTotal > 0 ? (h * ac + buyAmt) / stuckTotal : 0

    result = { buyAmt, sellAmt, fees, gross, net, dilution, newAvg, beSell, stuckTotal, stuckAvg }
  }

  return (
    <div>
      <div style={{ marginBottom: '8px', color: 'var(--text-secondary)', fontSize: '13px' }}>
        先买入机动仓，等涨后卖出，用盈利摊薄原持仓成本。
      </div>

      <Divider />
      <SectionHeading>输入区</SectionHeading>

      <div className="input-grid">
        <InputField label="原有持仓数量（股）" value={holding} onChange={setHolding} step="100" />
        <InputField label="原有持仓均价/成本（元）" value={avgCost} onChange={setAvgCost} step="0.001" />
        <InputField label="机动仓可用资金（元）" value={funds} onChange={setFunds} step="1000" />
        <InputField label="计划买入价格（元）" value={buyPx} onChange={setBuyPx} step="0.01" />
        <div>
          <InputField label="买入数量（股）" value={buyQty} onChange={setBuyQty} step="100" />
          <div className="field-hint">资金上限 {maxByFund.toLocaleString()} 股</div>
        </div>
        <div>
          <InputField label="计划卖出价格（元）" value={sellPx} onChange={setSellPx} step="0.01" />
          <PctHint price={parseNum(sellPx)} refPrice={parseNum(buyPx)} labelUp="高于买入价" labelDn="低于买入价，将亏损" />
        </div>
      </div>

      {!canCalc ? (
        <>
          <Banner type="info">请输入有效的买入数量（至少 100 股）。</Banner>
        </>
      ) : (
        <>
          <SectionHeading>✅ 顺利完成T（买入后成功卖出）</SectionHeading>

          <div className="metric-grid">
            <MetricCard label="实际动用资金（元）" value={fmtComma(result.buyAmt)} />
            <MetricCard
              label="本次T净盈利（税后）"
              value={`${result.net >= 0 ? '+' : ''}${result.net.toFixed(2)} 元`}
              color={result.net >= 0 ? 'up' : 'down'}
            />
            <MetricCard
              label="原持仓成本摊薄（元/股）"
              value={`${fmt(result.dilution, 4)} 元`}
            />
            <MetricCard
              label="操作后综合均价（元）"
              value={`${fmt(result.newAvg, 3)} 元`}
            />
          </div>

          <FeeDetail
            buyComm={result.fees.buyComm}
            sellComm={result.fees.sellComm}
            stampTax={result.fees.stampTax}
            totalFee={result.fees.total}
            grossProfit={result.gross}
          />

          <div style={{ marginTop: '16px' }}>
            <div className="be-grid">
              <BEBoxSell
                label="保本卖出价（正T）"
                price={`${fmt(result.beSell, 3)} 元`}
                note={`卖出价至少达到此价格，才能覆盖买入成本及全部手续费（买入佣金 ${result.fees.buyComm.toFixed(2)} 元）。`}
              />
              <CompareCard
                label="计划卖出价 vs 保本价"
                isGood={parseNum(sellPx) >= result.beSell}
                text={parseNum(sellPx) >= result.beSell
                  ? `▲ 高于保本价　${(parseNum(sellPx) - result.beSell).toFixed(3)} 元`
                  : `▼ 低于保本价，将亏损　${(result.beSell - parseNum(sellPx)).toFixed(3)} 元`}
              />
            </div>
          </div>

          <div style={{ height: '16px' }} />
          <SectionHeading>⚠️ 风险情景：机动仓被套，卖不掉</SectionHeading>
          <Banner type="warning">
            若无法卖出，机动仓 <strong>{q.toLocaleString()} 股</strong> 并入原仓，
            总持仓 <strong>{result.stuckTotal.toLocaleString()} 股</strong>，
            综合均价 <strong>{fmt(parseNum(avgCost), 3)}</strong> → <strong>{fmt(result.stuckAvg, 3)} 元</strong>。
          </Banner>

          <div style={{ marginTop: '12px' }}>
            <div className="metric-grid metric-grid-3">
              {[[0.03, '跌3%'], [0.05, '跌5%'], [0.10, '跌10%']].map(([pct, label]) => {
                const pxAt = parseNum(buyPx) * (1 - pct)
                const loss = (pxAt - result.stuckAvg) * result.stuckTotal
                return (
                  <MetricCard
                    key={label}
                    label={`较买入价${label}（${pxAt.toFixed(3)}元）额外亏损`}
                    value={`${fmtSign(loss)} 元`}
                    color={loss >= 0 ? 'up' : 'down'}
                  />
                )
              })}
            </div>
          </div>

          {parseNum(sellPx) <= parseNum(buyPx) && (
            <div style={{ marginTop: '12px' }}>
              <Banner type="error">卖出价不高于买入价，扣除手续费后本次T必然亏损！</Banner>
            </div>
          )}
        </>
      )}
    </div>
  )
}

/* ════════════════════════════════════════
   反T（先卖后买）
════════════════════════════════════════ */
function FanT() {
  const [holdingQty,   setHoldingQty]   = useState('')
  const [avgCost,      setAvgCost]      = useState('')
  const [sellQty,      setSellQty]      = useState('')
  const [sellPrice,    setSellPrice]    = useState('')
  const [targetRebuy,  setTargetRebuy]  = useState('')
  const [useRebuy,     setUseRebuy]     = useState(true)

  const h   = parseNum(holdingQty)
  const ac  = parseNum(avgCost)
  const sq  = parseNum(sellQty)
  const sp  = parseNum(sellPrice)
  const tr  = parseNum(targetRebuy)

  const canCalc = h > 0 && sq > 0 && sq <= h && sp > 0

  let result = null
  if (canCalc) {
    const remaining  = h - sq
    const sellAmt    = sq * sp
    const sellComm   = Math.max(sellAmt * 0.0003, 5)
    const stampTax   = sellAmt * 0.001
    const netSell    = sellAmt - sellComm - stampTax
    const beRebuy    = netSell / (sq * 1.0003)
    const grossT1    = sq * (sp - ac)
    const noRebuyAvg = remaining > 0 ? (h * ac - sq * sp) / remaining : 0

    let fees, rtGross, rtNet, newAvg
    if (useRebuy && tr > 0) {
      const rebuyAmt  = sq * tr
      const rebuyComm = Math.max(rebuyAmt * 0.0003, 5)
      fees    = { buyComm: rebuyComm, sellComm, stampTax, total: rebuyComm + sellComm + stampTax }
      rtGross = sq * (sp - tr)
      rtNet   = rtGross - fees.total
      newAvg  = remaining === 0 ? tr : (remaining * noRebuyAvg + sq * tr) / h
    } else {
      fees    = { buyComm: 0, sellComm, stampTax, total: sellComm + stampTax }
      rtGross = grossT1
      rtNet   = grossT1 - fees.total
      newAvg  = noRebuyAvg
    }

    result = { remaining, sellAmt, sellComm, stampTax, netSell, beRebuy, grossT1, noRebuyAvg, fees, rtGross, rtNet, newAvg }
  }

  return (
    <div>
      <div style={{ marginBottom: '8px', color: 'var(--text-secondary)', fontSize: '13px' }}>
        先卖出部分持仓，等跌后低价回补，赚取价差。
      </div>

      <Divider />
      <SectionHeading>输入区</SectionHeading>

      <div className="input-grid-2">
        <InputField label="当前持仓数量（股）" value={holdingQty} onChange={setHoldingQty} step="100" />
        <InputField label="持仓均价/成本（元）" value={avgCost} onChange={setAvgCost} step="0.001" />
        <InputField label="计划卖出数量（股）" value={sellQty} onChange={setSellQty} step="100" />
        <div>
          <InputField label="卖出价格（元）" value={sellPrice} onChange={setSellPrice} step="0.01" />
          <PctHint price={parseNum(sellPrice)} refPrice={parseNum(avgCost)} labelUp="高于成本" labelDn="低于成本，卖出亏损" />
        </div>
        <div>
          <InputField label="目标回补价格（元，可选）" value={targetRebuy} onChange={setTargetRebuy} step="0.01" />
          <PctHint price={parseNum(targetRebuy)} refPrice={parseNum(sellPrice)} labelUp="高于卖出价，将亏损" labelDn="低于卖出价，有利润空间" />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
          <input type="checkbox" checked={useRebuy} onChange={e => setUseRebuy(e.target.checked)} />
          启用目标回补价格
        </label>
      </div>

      {!canCalc ? (
        <>
          <Divider />
          <Banner type="info">请输入有效的持仓和卖出数量。</Banner>
        </>
      ) : sq > h ? (
        <>
          <Divider />
          <Banner type="error">卖出数量不能大于持仓数量。</Banner>
        </>
      ) : (
        <>
          <Divider />
          <SectionHeading>计算结果</SectionHeading>

          <div className="metric-grid metric-grid-3">
            <MetricCard
              label="卖出毛利润"
              value={`${fmtSign(result.grossT1)} 元`}
              color={result.grossT1 >= 0 ? 'up' : 'down'}
            />
            <MetricCard
              label="不回补新均价"
              value={result.remaining > 0 ? `${fmt(result.noRebuyAvg, 3)} 元` : '全部卖出'}
            />
            <MetricCard label="剩余持仓" value={`${result.remaining.toLocaleString()} 股`} />
          </div>

          <div style={{ marginTop: '16px' }}>
            <FeeDetail
              buyComm={result.fees.buyComm}
              sellComm={result.fees.sellComm}
              stampTax={result.fees.stampTax}
              totalFee={result.fees.total}
              grossProfit={result.rtGross}
            />
          </div>

          <div style={{ marginTop: '16px' }}>
            <div className="be-grid">
              <BEBoxBuy
                label="保本回补价（反T）"
                price={`${fmt(result.beRebuy, 3)} 元`}
                note={`回补价不超过此价格，卖出操作至少不亏（已含卖出手续费 ${(result.sellComm + result.stampTax).toFixed(2)} 元）。`}
              />
              {useRebuy && tr > 0 && (
                <CompareCard
                  label="计划回补价 vs 保本回补价"
                  isGood={tr <= result.beRebuy}
                  text={tr <= result.beRebuy
                    ? `✓ 低于保本价，有利润空间　${(result.beRebuy - tr).toFixed(3)} 元`
                    : `✗ 高于保本价，将亏损　${(tr - result.beRebuy).toFixed(3)} 元`}
                />
              )}
            </div>
          </div>

          {result.remaining > 0 && (
            <>
              <Divider />
              <SectionHeading>⚠️ 若股价继续上涨、无法回补</SectionHeading>
              <div className="metric-grid metric-grid-2">
                <MetricCard label="失去的筹码（股）" value={`${sq.toLocaleString()} 股`} />
                <MetricCard
                  label="不回补剩余持仓均价变化"
                  value={`${fmtSign(result.noRebuyAvg - ac, 3)} 元/股`}
                />
              </div>
            </>
          )}

          {useRebuy && tr > 0 && (
            <>
              <Divider />
              <SectionHeading>✅ 回补后综合成本</SectionHeading>
              <div className="metric-grid metric-grid-3">
                <MetricCard
                  label="新综合均价（元）"
                  value={`${fmt(result.newAvg, 3)} 元`}
                />
                <MetricCard
                  label="本次T净盈利（税后）"
                  value={`${fmtSign(result.rtNet)} 元`}
                  color={result.rtNet >= 0 ? 'up' : 'down'}
                />
                <MetricCard
                  label="成本变化（元/股）"
                  value={`${fmtSign(result.newAvg - ac, 3)} 元/股`}
                />
              </div>
              {tr > sp && (
                <div style={{ marginTop: '12px' }}>
                  <Banner type="warning">回补价高于卖出价，本次T+0将亏损！</Banner>
                </div>
              )}
              {tr > result.beRebuy && (
                <div style={{ marginTop: '8px' }}>
                  <Banner type="error">
                    计划回补价（{fmt(tr, 3)}）高于保本回补价（{fmt(result.beRebuy, 3)}），回补后将净亏损！
                  </Banner>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}

/* ════════════════════════════════════════
   反向计算（降低成本）
════════════════════════════════════════ */
function ReverseCalc() {
  const [mode, setMode] = useState('A')

  return (
    <div>
      <div className="tabs" style={{ marginBottom: '24px' }}>
        <button className={`tab-btn ${mode === 'A' ? 'active' : ''}`} onClick={() => setMode('A')}>
          卖出降成本
        </button>
        <button className={`tab-btn ${mode === 'B' ? 'active' : ''}`} onClick={() => setMode('B')}>
          买入摊薄
        </button>
      </div>

      {mode === 'A' ? <RevModeA /> : <RevModeB />}
    </div>
  )
}

function RevModeA() {
  const [rvH,  setRvH]  = useState('')
  const [rvA,  setRvA]  = useState('')
  const [rvR,  setRvR]  = useState('')
  const [rvB,  setRvB]  = useState('')
  const [rvSp, setRvSp] = useState('')

  const h  = parseNum(rvH)
  const a  = parseNum(rvA)
  const r  = parseNum(rvR)
  const b  = parseNum(rvB)
  const sp = parseNum(rvSp)
  const gap = sp - b

  const canCalc = sp > 0 && b > 0 && r > 0

  let result = null
  if (canCalc) {
    if (b >= sp) {
      result = { error: '回补价格必须低于卖出价格，否则低买高卖无法盈利。' }
    } else {
      const nS       = Math.round(h * r / gap / 100) * 100
      const actRed   = h > 0 ? nS * gap / h : 0
      const newAvg   = a - actRed
      const sellAmt  = nS * sp
      const rebuyAmt = nS * b
      const fees     = calcFees(rebuyAmt, sellAmt)
      const gross    = nS * (sp - b)
      const net      = gross - fees.total
      const sc       = Math.max(sellAmt * 0.0003, 5)
      const st       = sellAmt * 0.001
      const beR      = nS > 0 ? (sellAmt - sc - st) / (nS * 1.0003) : 0
      result = { nS, actRed, newAvg, fees, gross, net, beR, sc, st }
    }
  }

  return (
    <div>
      <div style={{ marginBottom: '8px', color: 'var(--text-secondary)', fontSize: '13px' }}>
        我想卖出一部分再低价回补，让成本降低 X 元
      </div>
      <Divider />
      <SectionHeading>输入区</SectionHeading>

      <div className="input-grid">
        <InputField label="当前持仓（股）" value={rvH} onChange={setRvH} step="100" />
        <InputField label="当前均价（元）" value={rvA} onChange={setRvA} step="0.001" />
        <InputField label="卖出价格（元）" value={rvSp} onChange={setRvSp} step="0.01" />
        <InputField label="计划回补价格（元）" value={rvB} onChange={setRvB} step="0.01" />
        <InputField label="目标降低成本（元/股）" value={rvR} onChange={setRvR} step="0.01" />
      </div>

      {!canCalc ? (
        <><Divider /><Banner type="info">请输入卖出价格、回补价格和目标降幅。</Banner></>
      ) : result.error ? (
        <><Divider /><Banner type="error">{result.error}</Banner></>
      ) : (
        <>
          <Divider />
          <div className="metric-grid">
            <MetricCard label="需卖出股数（股）" value={`${result.nS.toLocaleString()} 股`} />
            <MetricCard label="实际可降成本（元/股）" value={`${fmt(result.actRed, 3)} 元`} />
            <MetricCard
              label="操作后新均价（元）"
              value={`${fmt(result.newAvg, 3)} 元`}
            />
            <MetricCard
              label="T净盈利（税后）"
              value={`${fmtSign(result.net)} 元`}
              color={result.net >= 0 ? 'up' : 'down'}
            />
          </div>

          <div style={{ marginTop: '16px' }}>
            <FeeDetail
              buyComm={result.fees.buyComm}
              sellComm={result.fees.sellComm}
              stampTax={result.fees.stampTax}
              totalFee={result.fees.total}
              grossProfit={result.gross}
            />
          </div>

          <div style={{ marginTop: '16px' }}>
            <div className="be-grid">
              <BEBoxBuy
                label="保本回补价（卖出降成本）"
                price={`${fmt(result.beR, 3)} 元`}
                note={`回补价不超过此价格时，本次T操作至少保本（卖出手续费 ${(result.sc + result.st).toFixed(2)} 元已含）。`}
              />
              <CompareCard
                label="计划回补价 vs 保本回补价"
                isGood={b <= result.beR}
                text={b <= result.beR
                  ? `✓ 低于保本价，有利润空间　${(result.beR - b).toFixed(3)} 元`
                  : `✗ 高于保本价，将亏损　${(b - result.beR).toFixed(3)} 元`}
              />
            </div>
          </div>

          {h > 0 && result.nS > h && (
            <div style={{ marginTop: '12px' }}>
              <Banner type="error">
                需卖出 {result.nS.toLocaleString()} 股，超过持仓！请降低目标降幅或提高回补价格。
              </Banner>
            </div>
          )}

          {h > 0 && result.nS <= h && (
            <div style={{ marginTop: '12px' }}>
              <Banner type="success">
                卖出 <strong>{result.nS.toLocaleString()} 股</strong>（占持仓 {(result.nS / h * 100).toFixed(1)}%），
                在 <strong>{fmt(b, 3)} 元</strong> 回补后，
                均价从 <strong>{fmt(a, 3)}</strong> 降至 <strong>{fmt(result.newAvg, 3)} 元</strong>。
              </Banner>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function RevModeB() {
  const [biH,  setBiH]  = useState('')
  const [biA,  setBiA]  = useState('')
  const [biR,  setBiR]  = useState('')
  const [biBp, setBiBp] = useState('')

  const h   = parseNum(biH)
  const a   = parseNum(biA)
  const r   = parseNum(biR)
  const bp  = parseNum(biBp)
  const gapBi = a - bp

  const canCalc = bp > 0 && r > 0 && a > 0

  let result = null
  if (canCalc) {
    if (gapBi <= 0) {
      result = { error: '买入价格必须低于当前均价，否则不能摊薄成本。' }
    } else if (r >= gapBi) {
      result = { error: `目标降幅（${fmt(r, 3)}）不能超过均价与买入价之差（${fmt(gapBi, 3)}），否则需无限加仓。` }
    } else {
      const nBuy     = (Math.floor(h * r / (gapBi - r) / 100) + 1) * 100
      const newAvg   = (h * a + nBuy * bp) / (h + nBuy)
      const actRed   = a - newAvg
      const reqCap   = nBuy * bp
      const buyComm  = Math.max(reqCap * 0.0003, 5)
      const beSell   = (reqCap + buyComm) / (nBuy * 0.9987)
      const newTotal = h + nBuy
      result = { nBuy, newAvg, actRed, reqCap, buyComm, beSell, newTotal }
    }
  }

  return (
    <div>
      <div style={{ marginBottom: '8px', color: 'var(--text-secondary)', fontSize: '13px' }}>
        我想通过额外买入来摊薄成本，降低 X 元/股
      </div>
      <Divider />
      <SectionHeading>输入区</SectionHeading>

      <div className="input-grid-2">
        <InputField label="当前持仓数量（股）" value={biH} onChange={setBiH} step="100" />
        <InputField label="目标成本降低幅度（元/股）" value={biR} onChange={setBiR} step="0.01" />
        <InputField label="当前持仓均价（元）" value={biA} onChange={setBiA} step="0.001" />
        <InputField label="计划买入价格（元）" value={biBp} onChange={setBiBp} step="0.01" />
      </div>

      {!canCalc ? (
        <><Divider /><Banner type="info">请输入持仓信息、降低幅度和买入价格。</Banner></>
      ) : result.error ? (
        <><Divider /><Banner type="error">{result.error}</Banner></>
      ) : (
        <>
          <Divider />
          <SectionHeading>✅ 核心结果</SectionHeading>

          <div className="metric-grid">
            <MetricCard label="需买入数量（股）" value={`${result.nBuy.toLocaleString()} 股`} />
            <MetricCard label="实际可降成本（元/股）" value={`${fmt(result.actRed, 3)} 元`} />
            <MetricCard
              label="操作后新均价（元）"
              value={`${fmt(result.newAvg, 3)} 元`}
            />
            <MetricCard label="需动用资金（元）" value={`${fmtComma(result.reqCap)} 元`} />
          </div>

          <div style={{ marginTop: '16px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '14px 16px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '10px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>手续费明细</div>
            <div className="metric-grid metric-grid-2">
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>买入佣金</div>
                <div style={{ fontSize: '15px', fontVariantNumeric: 'tabular-nums' }}>{result.buyComm.toFixed(2)} 元</div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>印花税</div>
                <div style={{ fontSize: '15px', fontVariantNumeric: 'tabular-nums' }}>0.00 元</div>
              </div>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', borderTop: '1px solid var(--border)', paddingTop: '8px', marginTop: '10px' }}>
              买入手续费 {result.buyComm.toFixed(2)} 元，实际动用资金 {(result.reqCap + result.buyComm).toFixed(2)} 元（含佣金）。
            </div>
          </div>

          <div style={{ marginTop: '16px' }}>
            <div className="be-grid">
              <BEBoxSell
                label="保本卖出价（新买入部分）"
                price={`${fmt(result.beSell, 3)} 元`}
                note={`若未来需卖出这 ${result.nBuy.toLocaleString()} 股，至少达到此价格才不亏（含买入佣金 ${result.buyComm.toFixed(2)} 元及卖出手续费）。`}
              />
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '16px 18px' }}>
                <div style={{ fontSize: '11px', fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  摊薄后新均价 vs 保本卖出价
                </div>
                <div style={{ fontSize: '14px', fontVariantNumeric: 'tabular-nums' }}>
                  新均价 {fmt(result.newAvg, 3)} 元　保本价 {fmt(result.beSell, 3)} 元
                </div>
              </div>
            </div>
          </div>

          <div style={{ marginTop: '12px' }}>
            <Banner type="success">
              买入 <strong>{result.nBuy.toLocaleString()} 股</strong>（{fmt(bp, 3)} 元），
              均价从 <strong>{fmt(a, 3)}</strong> 降至 <strong>{fmt(result.newAvg, 3)} 元</strong>，
              实际降低 <strong>{fmt(result.actRed, 3)} 元/股</strong>。
            </Banner>
          </div>

          <Divider />
          <SectionHeading>⚠️ 风险提示：买入后若股价继续下跌</SectionHeading>
          <Banner type="warning">
            买入后总持仓 <strong>{result.newTotal.toLocaleString()} 股</strong>，
            总市值约 <strong>{fmtComma(result.newTotal * result.newAvg)} 元</strong>（按新均价计）。
          </Banner>
          <div style={{ marginTop: '12px' }}>
            <div className="metric-grid metric-grid-3">
              {[[0.03, '跌3%'], [0.05, '跌5%'], [0.10, '跌10%']].map(([pct, label]) => {
                const pxAt = bp * (1 - pct)
                const loss = (pxAt - bp) * result.nBuy
                return (
                  <MetricCard
                    key={label}
                    label={`较买入价${label}（${pxAt.toFixed(3)}元）额外亏损`}
                    value={`${fmtSign(loss)} 元`}
                    color="down"
                  />
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

/* ════════════════════════════════════════
   T0Page — tab container
════════════════════════════════════════ */
const TABS = [
  { id: 'zheng', label: '正 T' },
  { id: 'fan',   label: '反 T' },
  { id: 'rev',   label: '反向计算' },
]

export default function T0Page() {
  const [activeTab, setActiveTab] = useState('zheng')

  return (
    <div className="page">
      <h1 className="page-title">T+0 计算器</h1>

      {/* Tab bar */}
      <div className="tabs">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'zheng' && <ZhengT />}
      {activeTab === 'fan'   && <FanT />}
      {activeTab === 'rev'   && <ReverseCalc />}

      <div style={{ marginTop: '48px', paddingTop: '16px', borderTop: '1px solid var(--border)', fontSize: '12px', color: 'var(--text-secondary)' }}>
        本工具仅用于辅助计算，不构成投资建议。佣金按万分之三计算，最低5元/笔；印花税0.1%仅卖出时收取。
      </div>
    </div>
  )
}
