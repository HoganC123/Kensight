import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { fetchKlines } from './src/utils/eastmoney.js'

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

/* ─────────────────────────────────────────────
   行情报价 API（仅 dev 生效，不进产物）
   GET /api/quote?stock=601899,002309&fund=002963
   HTTP 恒为 200，逐 code 独立成败，失败写进 errors
───────────────────────────────────────────── */

const QUOTE_TTL   = 60 * 1000
const QUOTE_CACHE = new Map()   // code -> { data, ts }
const UPSTREAM_MS = 8000

function quoteCacheGet(code) {
  const hit = QUOTE_CACHE.get(code)
  if (hit && Date.now() - hit.ts < QUOTE_TTL) return hit.data
  return null
}

function quoteCacheSet(code, data) {
  QUOTE_CACHE.set(code, { data, ts: Date.now() })
}

/* fetchKlines 内部自己 fetch，拿不到 signal，只能在外层卡时间 */
function withTimeout(promise, ms) {
  let timer
  const guard = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('超时')), ms)
  })
  return Promise.race([promise, guard]).finally(() => clearTimeout(timer))
}

function todayDash() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/* 今天往前 15 个自然日，YYYYMMDD */
function begStamp() {
  const d = new Date(Date.now() - 15 * 24 * 3600 * 1000)
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}

async function quoteStock(code) {
  const rows = await withTimeout(fetchKlines(code, begStamp(), '20500101'), UPSTREAM_MS)
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('K 线为空')
  const last = rows[rows.length - 1]
  return { price: last.close, asOf: last.date, source: 'kline', pctChg: last.pctChg }
}

/* 主路径：盘中估值接口，返回 jsonpgz({...}); 需要剥壳 */
async function fundByGz(code) {
  const r = await fetch(`https://fundgz.1234567.com.cn/js/${code}.js?rt=${Date.now()}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Referer': 'https://fund.eastmoney.com/'
    },
    signal: AbortSignal.timeout(UPSTREAM_MS)
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  const text = await r.text()
  const m = text.match(/jsonpgz\(\s*(\{[\s\S]*\})\s*\)/)
  if (!m) throw new Error('返回体不含 jsonpgz')
  const o = JSON.parse(m[1])

  if (o.gsz && String(o.gztime || '').slice(0, 10) === todayDash()) {
    return { price: Number(o.gsz), asOf: o.gztime, source: 'gz', pctChg: Number(o.gszzl) }
  }
  return { price: Number(o.dwjz), asOf: o.jzrq, source: 'nav', pctChg: null }
}

/* 回退路径：历史净值接口，Referer 不对会被直接拒 */
async function fundByLsjz(code) {
  const r = await fetch(`https://api.fund.eastmoney.com/f10/lsjz?fundCode=${code}&pageIndex=1&pageSize=1`, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Referer': 'https://fundf10.eastmoney.com/'
    },
    signal: AbortSignal.timeout(UPSTREAM_MS)
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  const j = await r.json()
  const row = j && j.Data && Array.isArray(j.Data.LSJZList) ? j.Data.LSJZList[0] : null
  if (!row) throw new Error('历史净值为空')
  return { price: Number(row.DWJZ), asOf: row.FSRQ, source: 'nav', pctChg: null }
}

async function quoteFund(code) {
  try {
    return await fundByGz(code)
  } catch (_) {
    return await fundByLsjz(code)
  }
}

function splitCodes(v) {
  return String(v || '').split(',').map(x => x.trim()).filter(Boolean)
}

function quotesApi() {
  return {
    name: 'kensight-quotes-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/quote', async (req, res) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.setHeader('Cache-Control', 'no-store')

        if (req.method !== 'GET') {
          res.statusCode = 405
          res.end(JSON.stringify({ error: 'Method Not Allowed' }))
          return
        }

        const q       = new URL(req.url, 'http://localhost').searchParams
        const stocks  = splitCodes(q.get('stock'))
        const funds   = splitCodes(q.get('fund'))
        const results = {}
        const errors  = {}

        const jobs = [
          ...stocks.map(code => ({ code, kind: 'stock' })),
          ...funds.map(code  => ({ code, kind: 'fund'  }))
        ].map(async ({ code, kind }) => {
          try {
            const cached = quoteCacheGet(code)
            if (cached) { results[code] = cached; return }
            const data = kind === 'stock' ? await quoteStock(code) : await quoteFund(code)
            quoteCacheSet(code, data)
            results[code] = data
          } catch (e) {
            const m = String((e && e.message) || e)
            errors[code] = /abort|timeout|超时/i.test(m) ? '超时' : m
          }
        })

        await Promise.all(jobs)
        res.end(JSON.stringify({ results, errors }))
      })
    }
  }
}

export default defineConfig({
  plugins: [react(), portfolioApi(), quotesApi()],
})
