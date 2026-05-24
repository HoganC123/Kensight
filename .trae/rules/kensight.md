规则 1：项目基础约定（必装）
【项目】Kensight（筹码本）— A股散户决策支持工具
【技术栈】React 19 + Vite 8 + React Router 7，纯 CSS（非 Tailwind），lucide-react 图标
【目录结构】
  src/
    App.jsx          — 路由 + ThemeContext
    main.jsx         — 入口
    index.css        — 全局样式（CSS 变量驱动，支持 dark/light）
    pages/           — T0Page.jsx, PositionPage.jsx, BacktestPage.jsx
    components/      — UI.jsx（所有通用组件）, Navbar.jsx
    utils/           — calc.js（计算函数）
  public/            — logo-black.png, logo-white.png

【编码规范】
- 组件用函数式 + Hooks，不用 class 组件
- 状态管理用 useState/useContext，不引入 Redux/Zustand
- 样式全部写在 index.css，用 CSS 变量（var(--xxx)），不用 inline style 做主题色
- 数字输入统一用 parseNum() 解析（来自 calc.js），空值返回 0
- 金额格式化用 fmt/fmtSign/fmtComma（来自 calc.js）
- 组件导入统一从 '../components/UI.jsx'，计算函数从 '../utils/calc.js'

规则 2：A股交易计算规则（必装）
【A股手续费规则 — 所有计算必须遵守】
- 佣金：买卖双向收取，费率万分之三（0.0003），最低 5 元/笔
  公式：Math.max(金额 * 0.0003, 5)
- 印花税：仅卖出时收取，税率千分之一（0.001）
  公式：卖出金额 * 0.001
- 买入无印花税
- 股票最小交易单位：100 股（1 手），数量必须是 100 的整数倍
  取整公式：Math.floor(数量 / 100) * 100
- 卖出逻辑：统一用均价计算，不用 FIFO（先进先出）

【保本价公式】
- 正T保本卖出价 = (买入金额 + 买入佣金) / (数量 × 0.9987)
  其中 0.9987 = 1 - 0.0003(卖出佣金率) - 0.001(印花税率)
- 反T保本回补价 = (卖出金额 - 卖出佣金 - 印花税) / (数量 × 1.0003)
  其中 1.0003 = 1 + 0.0003(买入佣金率)

【calc.js 已有函数，直接调用不要重写】
- calcFees(buyAmount, sellAmount) → { buyComm, sellComm, stampTax, total }
- posFees(buyPx, exitPx, qty) → { buyComm, sellComm, stamp, total }
- parseNum(v) → number（空/NaN 返回 0）
- fmt(n, decimals) / fmtSign(n, decimals) / fmtComma(n, decimals)

规则 3：UI 组件和样式约定（必装）
【UI 组件 — 从 UI.jsx 导入，不要自己造轮子】
- MetricCard({ label, value, color })  — 结果指标卡，color: 'up'|'down'|undefined
- BEBoxSell / BEBoxBuy({ label, price, note })  — 保本价大卡
- CompareCard({ label, isGood, text })  — 对比结果卡
- InputField({ label, value, onChange, step })  — 输入框
- Divider()  — 分隔（实际是 48px 间距）
- SectionHeading({ children })  — 区块标题
- FeeDetail({ buyComm, sellComm, stampTax, totalFee, grossProfit })  — 可折叠手续费明细
- Banner({ type, children })  — 横幅提示，type: 'info'|'warning'|'success'|'error'
- PctHint({ price, refPrice, labelUp, labelDn })  — 百分比提示

【CSS 变量（index.css 中定义，所有样式必须用这些变量）】
颜色：--bg, --bg-secondary, --bg-card, --border, --text-primary, --text-secondary, --text-hint
语义色：--up（红涨 #e63946）, --dn（绿跌 #2ecc71）
注意：A股红涨绿跌，和欧美相反

【布局 class】
- .input-grid（3列）, .input-grid-2（2列）
- .metric-grid（4列）, .metric-grid-2, .metric-grid-3
- .be-grid（2列保本价卡）
- 移动端 @media (max-width: 768px) 自动降为 1-2 列

【新增页面模板】
新页面放 src/pages/XxxPage.jsx，导出 default function
在 App.jsx 添加 Route，在 Navbar.jsx 的 NAV_ITEMS 添加底部导航项

规则 4：踩坑记录（推荐装）
【历史 Bug 和禁忌操作】
1. 绝对不要在代码里硬编码 127.0.0.1:7890（代理地址）
   — 曾因代理变量污染导致后端 httpx 请求失败
2. Supabase 密钥格式是 sb_secret_ 开头，旧格式 JWT key 已禁用
3. 股票数据源用 baostock，不用 akshare（已弃用），超时设 8 秒
4. 不要引入 FIFO 卖出逻辑，统一均价卖出
5. CSS 不要用 Tailwind class，项目用纯 CSS + CSS 变量
6. 不要动 ThemeContext 的结构（App.jsx 中 isDark + toggle）
7. localStorage key 固定用 'kensight-theme'，不要改

规则 5：Git 操作（可选）
【Git 约定】
- 代理已全局配置，直接 git push 即可
- commit message 用中文，格式：[模块] 描述
  例：[T0] 修复正T保本价计算精度
      [UI] 新增 Banner error 类型
      [仓位] 添加分批建仓表格
- 不要 force push main 分支