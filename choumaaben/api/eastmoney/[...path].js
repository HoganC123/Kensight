export default async function handler(req, res) {
  const pathParts = req.query.path || [];
  const subPath = Array.isArray(pathParts) ? pathParts.join('/') : pathParts;

  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(req.query)) {
    if (k === 'path') continue;
    params.append(k, v);
  }

  const target = `https://push2his.eastmoney.com/api/qt/stock/kline/${subPath}?${params.toString()}`;

  try {
    const upstream = await fetch(target, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://quote.eastmoney.com/',
        'Accept': 'application/json, text/plain, */*',
      },
    });

    if (!upstream.ok) {
      res.status(upstream.status).json({ error: `upstream ${upstream.status}` });
      return;
    }

    const data = await upstream.json();
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.status(200).json(data);
  } catch (e) {
    res.status(502).json({ error: 'proxy_failed', detail: String(e) });
  }
}
