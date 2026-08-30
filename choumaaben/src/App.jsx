import React, { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Navbar, { BottomNav } from './components/Navbar.jsx'
import T0Page from './pages/T0Page.jsx'
import PositionPage from './pages/PositionPage.jsx'
import BacktestPage from './pages/BacktestPage.jsx'
import AssetsPage from './pages/AssetsPage.jsx'

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
            <Routes>
              <Route path="/" element={<T0Page />} />
              <Route path="/position" element={<PositionPage />} />
              <Route path="/backtest" element={<BacktestPage />} />
              <Route path="/assets" element={<AssetsPage />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </ThemeContext.Provider>
  )
}
