import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/* ─────────────────────────────────────────────
   本地资产账本读写 API（仅 dev 生效，不进产物）
   GET  /api/portfolio  -> 返回 data/portfolio.json
   POST /api/portfolio  -> 覆盖写入，写前当日首次自动备份
───────────────────────────────────────────── */

const ROOT       = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR   = path.join(ROOT, 'data')
const DATA_FILE  = path.join(DATA_DIR, 'portfolio.json')
const BACKUP_DIR = path.join(DATA_DIR, 'backups')

const EMPTY = {
  version: 1,
  updatedAt: null,
  accounts: [
    { id: 'boc',    name: '中国银行', type: 'bank' },
    { id: 'alipay', name: '支付宝',   type: 'platform' },
    { id: 'broker', name: '券商',     type: 'broker' }
  ],
  holdings: [],
  transactions: [],
  snapshots: []
}

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(EMPTY, null, 2), 'utf8')
  }
}

function backupOncePerDay() {
  if (!fs.existsSync(DATA_FILE)) return
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true })
  const d = new Date()
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  const target = path.join(BACKUP_DIR, `portfolio-${stamp}.json`)
  if (!fs.existsSync(target)) fs.copyFileSync(DATA_FILE, target)
}

function portfolioApi() {
  return {
    name: 'kensight-portfolio-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/portfolio', (req, res) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.setHeader('Cache-Control', 'no-store')

        try {
          if (req.method === 'GET') {
            ensureFile()
            res.end(fs.readFileSync(DATA_FILE, 'utf8'))
            return
          }

          if (req.method === 'POST') {
            let body = ''
            req.setEncoding('utf8')
            req.on('data', chunk => { body += chunk })
            req.on('end', () => {
              try {
                const parsed = JSON.parse(body)
                if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.holdings)) {
                  res.statusCode = 400
                  res.end(JSON.stringify({ error: '数据格式非法：缺少 holdings 数组' }))
                  return
                }
                ensureFile()
                backupOncePerDay()
                const tmp = DATA_FILE + '.tmp'
                fs.writeFileSync(tmp, JSON.stringify(parsed, null, 2), 'utf8')
                fs.renameSync(tmp, DATA_FILE)   // 原子替换，写坏不会丢原文件
                res.end(JSON.stringify({ ok: true }))
              } catch (e) {
                res.statusCode = 400
                res.end(JSON.stringify({ error: String((e && e.message) || e) }))
              }
            })
            return
          }

          res.statusCode = 405
          res.end(JSON.stringify({ error: 'Method Not Allowed' }))
        } catch (e) {
          res.statusCode = 500
          res.end(JSON.stringify({ error: String((e && e.message) || e) }))
        }
      })
    }
  }
}

export default defineConfig({
  plugins: [react(), portfolioApi()],
})
