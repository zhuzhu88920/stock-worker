/**
 * 交易日历 API 模块
 * 调用 trading-calendar-api.andox.workers.dev
 *
 * 市场代码映射（config.toml → API）：
 *   cn_fund → XSHG
 *   hk      → HKEX
 *   us      → NYSE
 *   kr      → XKRX
 */

const API_BASE = 'https://trading-calendar-api.z8j.cc.cd';

const MARKET_API_MAP = {
  cn_fund: 'XSHG',
  hk: 'HKEX',
  us: 'NYSE',
  kr: 'XKRX',
};

/**
 * 获取指定市场今日状态
 * @param {string} market - cn_fund/hk/us/kr
 * @returns {Promise<object>} { is_trading_day, status, status_text, trading_sessions, current_time_beijing }
 */
export async function fetchMarketCalendar(market) {
  const apiCode = MARKET_API_MAP[market];
  if (!apiCode) {
    return { is_trading_day: false, status: 'closed', status_text: '未知市场', trading_sessions: [] };
  }

  try {
    const url = `${API_BASE}/market-status?market=${apiCode}`;
    console.log(`[calendar-api] Fetching ${apiCode} from ${url}`);
    const res = await fetch(url, { headers: { 'User-Agent': 'stock-worker/1.0' } });
    console.log(`[calendar-api] ${apiCode} response status: ${res.status}`);

    if (!res.ok) {
      console.warn(`[calendar-api] ${apiCode} HTTP ${res.status}，降级为休市`);
      return { is_trading_day: false, status: 'closed', status_text: 'API错误', trading_sessions: [] };
    }

    const data = await res.json();
    console.log(`[calendar-api] ${apiCode} data:`, JSON.stringify(data).substring(0, 200));
    return data;
  } catch (err) {
    console.warn(`[calendar-api] ${market} 调用失败:`, err.message);
    return { is_trading_day: false, status: 'closed', status_text: '网络错误', trading_sessions: [] };
  }
}

/**
 * 判断市场是否处于开市状态（含缓冲期）
 * @param {string} market
 * @param {Date} now
 * @param {number} bufferMin - 收盘后缓冲分钟数
 * @returns {Promise<boolean>}
 */
export async function isMarketOpenWithBuffer(market, now, bufferMin = 5) {
  const cal = await fetchMarketCalendar(market);

  if (!cal.is_trading_day) return false;

  // 获取 API 返回的北京时间
  const beijingTime = cal.current_time_beijing || '00:00';
  const [h, m] = beijingTime.split(':').map(Number);
  const curMin = h * 60 + m;

  // 检查是否在任一交易时段内
  const sessions = cal.trading_sessions || [];
  for (const s of sessions) {
    const [sh, sm] = s.start.split(':').map(Number);
    const [eh, em] = s.end.split(':').map(Number);
    const sMin = sh * 60 + sm;
    const eMin = eh * 60 + em;

    if (sMin <= eMin) {
      // 普通时段（当天内）
      if (curMin >= sMin && curMin <= eMin) return true;
    } else {
      // 跨夜时段（如 NYSE 21:30-04:00）
      if (curMin >= sMin || curMin <= eMin) return true;
    }
  }

  // 不在任何时段内，检查是否在缓冲期内
  if (sessions.length > 0) {
    const lastSession = sessions[sessions.length - 1];
    const [eh, em] = lastSession.end.split(':').map(Number);
    const closeMin = eh * 60 + em;

    // 计算距收盘的分钟数
    let diff;
    const [lsH, lsM] = lastSession.start.split(':').map(Number);
    const lastStartMin = lsH * 60 + lsM;
    const [leH, leM] = lastSession.end.split(':').map(Number);
    const lastEndMin = leH * 60 + leM;

    if (lastStartMin <= lastEndMin) {
      // 普通时段
      diff = curMin - lastEndMin;
    } else {
      // 跨夜时段：收盘在次日
      if (curMin >= lastStartMin) {
        diff = curMin - lastEndMin;
      } else {
        // 当前在北京时间 00:00-04:00 区间
        diff = (curMin + 1440) - lastEndMin;
      }
    }

    if (diff >= 0 && diff <= bufferMin) return true;
  }

  return false;
}

/**
 * 获取所有市场状态（用于推送标题显示）
 * @returns {Promise<{cn_fund, hk, us, kr}>} 每个市场的 status_text
 */
export async function getAllMarketStatusText() {
  const markets = ['cn_fund', 'hk', 'us', 'kr'];
  const results = await Promise.all(
    markets.map(async (m) => {
      const cal = await fetchMarketCalendar(m);
      return [m, cal.status_text || (cal.is_trading_day ? '交易中' : '已收盘')];
    })
  );
  return Object.fromEntries(results);
}
