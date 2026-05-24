import React, { useContext, useState, useEffect, useRef } from 'react'
import { NavLink } from 'react-router-dom'
import { Calculator, Target, TrendingUp } from 'lucide-react'
import { ThemeContext } from '../App.jsx'

const SunIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5"/>
    <line x1="12" y1="1" x2="12" y2="3"/>
    <line x1="12" y1="21" x2="12" y2="23"/>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
    <line x1="1" y1="12" x2="3" y2="12"/>
    <line x1="21" y1="12" x2="23" y2="12"/>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
  </svg>
)

const MoonIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>
)

const NAV_ITEMS = [
  { to: '/',         end: true,  icon: <Calculator size={20} strokeWidth={1.5} />, label: 'T+0' },
  { to: '/position', end: false, icon: <Target     size={20} strokeWidth={1.5} />, label: '仓位' },
  { to: '/backtest', end: false, icon: <TrendingUp size={20} strokeWidth={1.5} />, label: '回测' },
]

export function BottomNav() {
  const [visible, setVisible] = useState(true)
  const lastScrollY = useRef(0)
  const ticking = useRef(false)

  useEffect(() => {
    const handleScroll = () => {
      if (!ticking.current) {
        requestAnimationFrame(() => {
          const currentScrollY = window.scrollY
          if (currentScrollY > lastScrollY.current + 8) {
            setVisible(false)
          } else if (currentScrollY < lastScrollY.current - 4) {
            setVisible(true)
          }
          lastScrollY.current = currentScrollY
          ticking.current = false
        })
        ticking.current = true
      }
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <nav className={`bottom-nav ${visible ? 'bottom-nav-visible' : 'bottom-nav-hidden'}`}>
      {NAV_ITEMS.map(({ to, end, icon, label }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) => `bottom-nav-item ${isActive ? 'active' : ''}`}
        >
          {icon}
          <span className="bottom-nav-label">{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}

export default function Navbar() {
  const { isDark, toggle } = useContext(ThemeContext)
  const [hoverToggle, setHoverToggle] = useState(false)

  const navStyle = ({ isActive }) => ({
    fontSize: '13px',
    fontWeight: 400,
    letterSpacing: '0.01em',
    color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
    textDecoration: 'none',
    paddingBottom: '18px',
    borderBottom: isActive ? '2px solid var(--text-primary)' : '2px solid transparent',
    marginBottom: '-1px',
    transition: 'color 0.12s, border-color 0.12s',
    display: 'inline-block',
  })

  return (
    <header className="navbar" style={{
      height: '56px',
      background: 'var(--bg)',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
    }}>
      {/* Left: Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '9px', flex: 1 }}>
        <img
          src={isDark ? '/logo-white.png' : '/logo-black.png'}
          alt="Kensight"
          style={{ height: '26px', width: 'auto', display: 'block' }}
        />
        <span style={{
          fontFamily: 'Inter, sans-serif',
          fontSize: '12px',
          fontWeight: 500,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--text-primary)',
        }}>
          KENSIGHT
        </span>
      </div>

      {/* Center: Nav — hidden on mobile via .navbar-links CSS rule */}
      <nav className="navbar-links" style={{ gap: '32px', alignSelf: 'stretch' }}>
        <NavLink to="/" style={navStyle} end>T+0 计算器</NavLink>
        <NavLink to="/position" style={navStyle}>仓位计算</NavLink>
        <NavLink to="/backtest" style={navStyle}>回测模拟</NavLink>
      </nav>

      {/* Right: Theme toggle */}
      <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={toggle}
          onMouseEnter={() => setHoverToggle(true)}
          onMouseLeave={() => setHoverToggle(false)}
          title={isDark ? '切换浅色模式' : '切换深色模式'}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: hoverToggle ? 'var(--text-primary)' : 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '28px',
            height: '28px',
            transition: 'color 0.12s',
          }}
        >
          {isDark ? <SunIcon /> : <MoonIcon />}
        </button>
      </div>
    </header>
  )
}
