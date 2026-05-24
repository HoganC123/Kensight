import React, { useState } from 'react'

/* ─────────────────────────────────────────────
   Colour resolver
───────────────────────────────────────────── */
function resolveColor(color) {
  if (color === 'up')      return 'var(--up)'
  if (color === 'down')    return 'var(--down)'
  if (color === 'muted')   return 'var(--text-secondary)'
  return 'var(--text-primary)'
}

/* ─────────────────────────────────────────────
   Format helpers
───────────────────────────────────────────── */
function sign(n) {
  if (n > 0) return '+'
  if (n < 0) return '−'
  return ''
}
function abs(n) { return Math.abs(n) }

/* ─────────────────────────────────────────────
   MetricCard — large result display
   value: already-formatted string OR { raw: number, suffix: string, decimals: number }
───────────────────────────────────────────── */
export function MetricCard({ label, value, color, raw }) {
  let display = value
  if (raw !== undefined) {
    const n = Number(raw)
    const prefix = n > 0 ? '+' : n < 0 ? '−' : ''
    display = prefix + abs(n).toFixed(2)
  }

  const valClass = color === 'up' ? 'metric-value up'
    : color === 'down' ? 'metric-value dn'
    : 'metric-value'

  return (
    <div className="metric-card">
      <div className="metric-label">{label}</div>
      <div className={valClass}>{display}</div>
    </div>
  )
}

/* ─────────────────────────────────────────────
   BEBoxSell / BEBoxBuy
───────────────────────────────────────────── */
export function BEBoxSell({ label, price, note }) {
  return (
    <div className="be-box sell">
      <div className="be-label">{label}</div>
      <div className="be-price">{price}</div>
      {note && <div className="be-note">{note}</div>}
    </div>
  )
}

export function BEBoxBuy({ label, price, note }) {
  return (
    <div className="be-box buy">
      <div className="be-label">{label}</div>
      <div className="be-price">{price}</div>
      {note && <div className="be-note">{note}</div>}
    </div>
  )
}

/* ─────────────────────────────────────────────
   CompareCard — outcome comparison
───────────────────────────────────────────── */
export function CompareCard({ label, isGood, text }) {
  return (
    <div className="result-card">
      <div className="result-card__label">{label}</div>
      <div style={{
        fontSize: '17px',
        fontWeight: 400,
        color: isGood ? 'var(--up)' : 'var(--down)',
        lineHeight: 1.3,
        marginTop: '4px',
      }}>
        {text}
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────
   InputField — label + bottom-border-only input
───────────────────────────────────────────── */
export function InputField({ label, value, onChange, placeholder = '', step = 'any', min = '0' }) {
  return (
    <div>
      <label className="field-label">{label}</label>
      <input
        className="field-input"
        type="number"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        step={step}
        min={min}
      />
    </div>
  )
}

/* ─────────────────────────────────────────────
   SectionHeading
───────────────────────────────────────────── */
export function SectionHeading({ children }) {
  return <div className="section-heading">{children}</div>
}

/* ─────────────────────────────────────────────
   Grid — responsive column layout
───────────────────────────────────────────── */
export function Grid({ cols = 2, gap = 16, children }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${cols}, 1fr)`,
      gap: `${gap}px`,
    }}>
      {children}
    </div>
  )
}

/* ─────────────────────────────────────────────
   Spacer — replaces Divider
───────────────────────────────────────────── */
export function Spacer({ size = 48 }) {
  return <div style={{ height: `${size}px` }} />
}

/* ─────────────────────────────────────────────
   PctHint — small pct annotation below input
───────────────────────────────────────────── */
export function PctHint({ price, refPrice, labelUp, labelDn }) {
  if (!price || !refPrice || price <= 0 || refPrice <= 0) return null
  const pct = (price - refPrice) / refPrice * 100
  const up  = pct >= 0
  return (
    <div className="pct-hint" style={{ color: up ? 'var(--up)' : 'var(--down)' }}>
      {up ? '▲' : '▼'} {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%&nbsp;&nbsp;{up ? labelUp : labelDn}
    </div>
  )
}

/* ─────────────────────────────────────────────
   Banner
───────────────────────────────────────────── */
export function Banner({ type = 'info', children }) {
  return (
    <div className={`banner banner--${type}`}>
      {children}
    </div>
  )
}

/* ─────────────────────────────────────────────
   FeeDetail — collapsible fee breakdown
───────────────────────────────────────────── */
export function FeeDetail({ buyComm, sellComm, stampTax, totalFee, grossProfit }) {
  const [open, setOpen] = useState(false)
  const net = grossProfit - totalFee
  const netSign = net > 0 ? '+' : net < 0 ? '−' : ''

  return (
    <div>
      <button className="fee-toggle" onClick={() => setOpen(v => !v)}>
        <span style={{
          display: 'inline-block',
          transform: open ? 'rotate(90deg)' : 'none',
          transition: 'transform 0.15s',
          fontSize: '9px',
        }}>
          ▶
        </span>
        手续费明细
      </button>

      {open && (
        <div style={{ marginTop: '16px', background: 'var(--bg-card)', padding: '20px 24px' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '24px',
            marginBottom: '16px',
          }}>
            {[
              ['买入佣金',   buyComm],
              ['卖出佣金',   sellComm],
              ['印花税',     stampTax],
              ['合计手续费', totalFee],
            ].map(([k, v]) => (
              <div key={k}>
                <div className="result-card__label" style={{ marginBottom: '6px' }}>{k}</div>
                <div style={{ fontSize: '22px', fontWeight: 300, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
                  {v.toFixed(2)}
                </div>
              </div>
            ))}
          </div>
          <div style={{
            paddingTop: '14px',
            borderTop: '1px solid var(--border)',
            fontSize: '12px',
            color: 'var(--text-secondary)',
          }}>
            毛利润&nbsp;
            <span style={{ color: 'var(--text-primary)' }}>
              {grossProfit >= 0 ? '+' : '−'}{Math.abs(grossProfit).toFixed(2)}
            </span>
            &nbsp;−&nbsp;手续费&nbsp;
            <span style={{ color: 'var(--text-primary)' }}>{totalFee.toFixed(2)}</span>
            &nbsp;=&nbsp;税后实际盈利&nbsp;
            <span style={{ color: net >= 0 ? 'var(--up)' : 'var(--down)', fontWeight: 500 }}>
              {netSign}{Math.abs(net).toFixed(2)} 元
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

/* legacy alias — kept for imports that still use Divider */
export function Divider() { return <Spacer size={48} /> }
