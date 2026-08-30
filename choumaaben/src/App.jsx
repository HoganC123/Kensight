import React, { useState, useEffect, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Navbar, { BottomNav } from './components/Navbar.jsx'

const T0Page       = lazy(() => import('./pages/T0Page.jsx'))
const PositionPage = lazy(() => import('./pages/PositionPage.jsx'))
const BacktestPage = lazy(() => import('./pages/BacktestPage.jsx'))
const AssetsPage   = lazy(() => import('./pages/AssetsPage.jsx'))

function RouteFallback() {
  return <div style={{ padding: '40px 20px', color: 'var(--text-secondary)' }}>加载中…</div>
}

export const ThemeContext = React.createContext({ isDark: true, toggle: () => {} })

export default function App() {
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('kensight-theme')
    return saved ? saved === 'dark' : true
  })

  useEffect(() => {
    const root = document.documentElement
    if (isDark) {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
    localStorage.setItem('kensight-theme', isDark ? 'dark' : 'light')
  }, [isDark])

  const toggle = () => setIsDark(v => !v)

  return (
    <ThemeContext.Provider value={{ isDark, toggle }}>
      <BrowserRouter>
        <div style={{ background: 'var(--bg)', minHeight: '100vh', color: 'var(--text-primary)' }}>
          <Navbar />
          <BottomNav />
          <main className="main-content">
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/" element={<T0Page />} />
                <Route path="/position" element={<PositionPage />} />
                <Route path="/backtest" element={<BacktestPage />} />
                <Route path="/assets" element={<AssetsPage />} />
              </Routes>
            </Suspense>
          </main>
        </div>
      </BrowserRouter>
    </ThemeContext.Provider>
  )
}
