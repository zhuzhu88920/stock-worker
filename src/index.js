/**
 * Stock Worker - 股价监控推送服务
 * 主入口文件
 */

import { Config } from './config.js';
import { Scheduler } from './scheduler.js';
import { Fetcher } from './fetcher.js';
import { Storage } from './storage.js';
import { Pusher } from './pusher.js';
import { TemplateParser } from './template-parser.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 健康检查
    if (url.pathname === '/health') {
      return new Response('OK', { status: 200 });
    }

    // 手动触发
    if (url.pathname === '/trigger') {
      return await handleTrigger(env);
    }

    // 本地开发用：写入KV配置
    if (url.pathname === '/setup' && request.method === 'POST') {
      const body = await request.json();
      if (body.config) {
        await env.CONFIG.put('config', body.config);
      }
      if (body.template) {
        await env.CONFIG.put('template', body.template);
      }
      // 清空上次股价（用于强制首次触发推送）
      if (body.reset_storage) {
        await env.CONFIG.delete('all_data_latest');
      }
      return new Response(JSON.stringify({ status: 'ok', keys: Object.keys(body) }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 其他请求返回404
    return new Response('Not Found', { status: 404 });
  },

  async scheduled(event, env, ctx) {
    // Cron 触发器调用
    await handleTrigger(env);
  }
};

/**
 * 处理触发请求
 */
async function handleTrigger(env) {
  try {
    // 初始化各模块
    const config = new Config(env);
    await config.getConfig(); // 加载配置
    const scheduler = new Scheduler(config);
    const fetcher = new Fetcher(config, env);
    const storage = new Storage(env.CONFIG);
    const pusher = new Pusher(env.BARK_URL);

    // 加载模板配置
    const templateParser = new TemplateParser();
    const templateStr = await env.CONFIG.get('template');
    if (templateStr) {
      templateParser.loadFromString(templateStr);
    }

    // 获取当前时间
    const now = new Date();
    const timeStr = now.toLocaleString('zh-CN', {
      timeZone: 'Asia/Shanghai',
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });

    // 检查哪些市场开市（仅用于推送标题状态显示）
    const openMarkets = scheduler.getOpenMarkets(now);

    // 如果没有任何市场开市，不抓取、不更新KV、不推送
    if (openMarkets.length === 0) {
      console.log(`[${timeStr}] 所有市场休市，不推送`);
      return new Response(JSON.stringify({ status: 'no_market_open' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log(`[${timeStr}] 开市市场: ${openMarkets.join(', ')}`);

    // 仅获取开市市场的股票（未开市市场保留KV旧数据，不抓取）
    const openMarketStocks = config.getStocksByMarkets(openMarkets);

    // 抓取开市市场的数据
    const currentData = await fetcher.fetchAll(openMarketStocks, now);

    // 获取所有已配置的股票（用于合并、推送）
    const allStocks = config.getAllStocks();

    // 获取所有股票的历史数据（用于对比 + 推送内容）
    const lastDataAll = await storage.getLastData(allStocks);

    console.log(`[${timeStr}] Current data:`, JSON.stringify(currentData));
    console.log(`[${timeStr}] Last data (all):`, JSON.stringify(lastDataAll));

    // 仅对比本次抓取的数据是否有变化
    const hasChanges = compareData(currentData, lastDataAll);
    console.log(`[${timeStr}] Has changes:`, hasChanges);

    // 如果没有变化，不推送
    if (!hasChanges) {
      console.log(`[${timeStr}] 数据无变化，不推送`);
      return new Response(JSON.stringify({ status: 'no_change' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 合并数据：用本次抓取的开市数据覆盖，其余保留历史数据
    const allDataToSave = mergeData(currentData, lastDataAll, allStocks);

    // 保存合并后的数据
    await storage.saveData(allDataToSave);

    // 构建推送内容（包含所有股票）
    const pushData = buildPushData(openMarkets, allDataToSave, lastDataAll, timeStr, config, templateParser);

    // 推送（失败不影响主流程）
    let pushResult = 'skipped';
    try {
      await pusher.push(pushData);
      pushResult = 'ok';
    } catch (pushErr) {
      pushResult = pushErr.message;
      console.warn(`[${timeStr}] 推送失败:`, pushErr.message);
    }

    console.log(`[${timeStr}] 推送结果: ${pushResult}`);

    return new Response(JSON.stringify({
      status: 'success',
      markets: openMarkets,
      push: pushResult,
      title: pushData.title,
      body: pushData.body
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ status: 'error', message: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * 合并数据：用本次抓取数据覆盖，其余保留历史数据
 */
function mergeData(currentData, lastData, allStocks) {
  const map = new Map();
  // 先放入所有历史数据
  for (const item of lastData) {
    map.set(`${item.market}_${item.code}`, item);
  }
  // 用本次抓取数据覆盖（仅覆盖抓取成功的数据，避免null覆盖有效值）
  for (const item of currentData) {
    if (item.price !== null && item.price !== undefined) {
      map.set(`${item.market}_${item.code}`, item);
    }
  }
  // 确保所有已配置股票都在结果中（无数据的留空）
  for (const s of allStocks) {
    const key = `${s.market}_${s.code}`;
    if (!map.has(key)) {
      map.set(key, {
        code: s.code,
        name: s.name,
        market: s.market,
        price: null,
        change_amount: null,
        change_percent: null,
        nav_date: null,
        updated_at: new Date().toISOString()
      });
    }
  }
  return Array.from(map.values());
}

/**
 * 对比数据是否有变化
 */
function compareData(currentData, lastData) {
  if (!currentData || currentData.length === 0) {
    return false; // 当前没有数据，视为无变化
  }
  if (!lastData || lastData.length === 0) {
    return true; // 第一次抓取，视为有变化
  }

  const lastMap = new Map();
  lastData.forEach(item => {
    lastMap.set(`${item.market}_${item.code}`, item);
  });

  for (const current of currentData) {
    // 跳过抓取失败的数据（price为null），避免误触发推送
    if (current.price === null || current.price === undefined) {
      continue;
    }

    const key = `${current.market}_${current.code}`;
    const last = lastMap.get(key);

    if (!last) {
      return true; // 新增股票
    }

    // 对比关键字段
    if (current.price !== last.price ||
        current.change_amount !== last.change_amount ||
        current.change_percent !== last.change_percent ||
        current.nav_date !== last.nav_date) {
      return true;
    }
  }

  return false;
}

/**
 * 构建推送数据（包含所有已配置股票）
 */
function buildPushData(openMarkets, allData, lastData, timeStr, config, templateParser) {
  const now = new Date();
  const dateStr = now.toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour12: false,
    month: '2-digit',
    day: '2-digit'
  });
  const timeOnly = now.toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit'
  });

  // 构建标题 - 显示所有市场状态（顺序：港股 → 韩股 → A股基金 → 美股）
  const allMarkets = ['hk', 'kr', 'cn_fund', 'us'];
  const marketStatus = allMarkets.map(market => {
    const marketConfig = config.getMarketConfig(market);
    const isOpen = openMarkets.includes(market);
    const status = isOpen ? '开' : '休';
    return `${marketConfig.flag}${status}`;
  }).join('  ');

  // 使用模板渲染标题
  let title;
  if (templateParser && templateParser.getTemplates().title) {
    title = templateParser.renderTitle({
      market_status: marketStatus,
      date: dateStr,
      time: timeOnly
    });
  } else {
    title = `${marketStatus}   📅 ${dateStr}  ⏰ ${timeOnly}`;
  }

  // 按固定市场顺序排列：港股 → 韩股 → A股基金 → 美股
  const marketOrder = ['hk', 'kr', 'cn_fund', 'us'];
  const dataMap = new Map();
  (allData || []).forEach(item => {
    dataMap.set(`${item.market}_${item.code}`, item);
  });

  // 按市场顺序遍历所有已配置股票
  const allStocks = config.getAllStocks();
  const sortedData = [];
  for (const market of marketOrder) {
    for (const stock of allStocks) {
      if (stock.market === market) {
        const item = dataMap.get(`${stock.market}_${stock.code}`);
        if (item) sortedData.push(item);
      }
    }
  }

  // 构建内容：按排序后的顺序遍历
  const lastMap = new Map();
  (lastData || []).forEach(item => {
    lastMap.set(`${item.market}_${item.code}`, item);
  });

  const content = sortedData.map(item => {
    const marketConfig = config.getMarketConfig(item.market);

    // 简化基金名称
    let name = item.name;
    if (item.market === 'cn_fund') {
      name = name.replace(/\([^)]*\)/g, '').trim();
    }

    // 使用模板简化名称
    if (templateParser) {
      name = templateParser.simplifyName(name);
    }

    // 涨跌方向图标
    const changePercent = parseFloat(item.change_percent) || 0;
    const trend = changePercent > 0 ? '📈' : changePercent < 0 ? '📉' : '➡️';

    // 格式化净值日期
    let navDateShort = '';
    if (item.nav_date) {
      const dateParts = item.nav_date.split('-');
      if (dateParts.length === 3) {
        navDateShort = `${dateParts[1]}-${dateParts[2]}`;
      }
    }

    // 韩股价格格式化：去掉后面3个0，用 K 表示（如 1,574,000.00 → 1,574K）
    let price = item.price;
    let changeAmount = item.change_amount || '';
    if (item.market === 'kr') {
      price = formatKrPrice(price);
      changeAmount = formatKrPrice(changeAmount);
    }

    // 使用模板渲染内容
    if (templateParser && templateParser.getTemplates().content[item.market]) {
      return templateParser.renderContent(item.market, {
        flag: marketConfig.flag,
        name: name,
        code: item.code,
        price: price,
        change_amount: changeAmount,
        change_percent: item.change_percent,
        trend: trend,
        nav_date: item.nav_date || '',
        nav_date_short: navDateShort
      });
    } else {
      // 默认格式
      if (item.market === 'cn_fund') {
        return `${marketConfig.flag} ${name} 💰${price} ${trend}${item.change_percent} | ${item.nav_date}`;
      } else {
        return `${marketConfig.flag} ${name} 💰${price} ${trend}${changeAmount}(${item.change_percent})`;
      }
    }
  }).join('\n');

  return { title, body: content };
}

/**
 * 韩股价格格式化：去掉后面3个0，用 K 表示
 * 如 1,574,000.00 → 1,574K，0.00 → 0
 */
function formatKrPrice(value) {
  if (!value && value !== 0) return '';
  // 去掉逗号再解析（韩股价格可能带千分位如 "1,585,000.00"）
  const num = parseFloat(String(value).replace(/,/g, ''));
  if (isNaN(num) || num === 0) return '0';
  if (Math.abs(num) >= 1000) {
    const kVal = num / 1000;
    return Math.round(kVal).toLocaleString('en-US') + 'K';
  }
  return String(value).replace(/,/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
