/** 获取东方财富日K线数据（直接请求） */
export async function fetchKlines(code, startDate, endDate) {
  const firstChar = code.charAt(0);
  let secid;
  if (['6','5','9'].includes(firstChar)) {
    secid = '1.' + code;
  } else if (['0','3'].includes(firstChar)) {
    secid = '0.' + code;
  } else {
    throw new Error('不支持的股票代码');
  }

  const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}&klt=101&fqt=1&beg=${startDate}&end=${endDate}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61`;

  let res;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    res = await response.json();
  } catch (e) {
    console.error('[fetchKlines] 请求失败:', url, e);
    throw new Error(`数据请求失败：${e.message}`);
  }

  if (!res || !res.data || !res.data.klines || res.data.klines.length === 0) {
    throw new Error('未获取到K线数据，请检查股票代码');
  }

  return res.data.klines.map(line => {
    const parts = line.split(',');
    return {
      date: parts[0],
      open: Number(parts[1]),
      close: Number(parts[2]),
      high: Number(parts[3]),
      low: Number(parts[4]),
      volume: Number(parts[5]),
      amount: Number(parts[6]),
      pctChg: Number(parts[8])
    };
  });
}
