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

    // Cron 触发
    return await handleTrigger(env);
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
    const fetcher = new Fetcher(config);
    const storage = new Storage(env.STORAGE);
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

    // 检查哪些市场开市
    const openMarkets = scheduler.getOpenMarkets(now);

    // 如果没有市场开市，不推送
    if (openMarkets.length === 0) {
      console.log(`[${timeStr}] 所有市场休市，不推送`);
      return new Response(JSON.stringify({ status: 'no_market_open' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log(`[${timeStr}] 开市市场: ${openMarkets.join(', ')}`);

    // 获取开市市场的股票列表
    const stocks = config.getStocksByMarkets(openMarkets);

    // 抓取数据
    const currentData = await fetcher.fetchAll(stocks, now);

    // 获取上次数据
    const lastData = await storage.getLastData(stocks);

    // 对比数据
    const hasChanges = compareData(currentData, lastData);

    // 如果没有变化，不推送
    if (!hasChanges) {
      console.log(`[${timeStr}] 数据无变化，不推送`);
      return new Response(JSON.stringify({ status: 'no_change' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 保存当前数据
    await storage.saveData(currentData);

    // 构建推送内容
    const pushData = buildPushData(openMarkets, currentData, lastData, timeStr, config, templateParser);

    // 推送
    await pusher.push(pushData);

    console.log(`[${timeStr}] 推送成功`);

    return new Response(JSON.stringify({ status: 'success', markets: openMarkets }), {
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
 * 对比数据是否有变化
 */
function compareData(currentData, lastData) {
  if (!lastData || lastData.length === 0) {
    return true; // 第一次抓取，视为有变化
  }

  const lastMap = new Map();
  lastData.forEach(item => {
    lastMap.set(`${item.market}_${item.code}`, item);
  });

  for (const current of currentData) {
    const key = `${current.market}_${item.code}`;
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
 * 构建推送数据
 */
function buildPushData(openMarkets, currentData, lastData, timeStr, config, templateParser) {
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

  // 构建标题 - 显示所有市场状态
  const allMarkets = ['cn_fund', 'hk', 'kr', 'us'];
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

  // 构建内容
  const content = currentData.map(item => {
    const marketConfig = config.getMarketConfig(item.market);

    // 简化基金名称
    let name = item.name;
    if (item.market === 'cn_fund') {
      // 去掉括号内容
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

    // 使用模板渲染内容
    if (templateParser && templateParser.getTemplates().content[item.market]) {
      return templateParser.renderContent(item.market, {
        flag: marketConfig.flag,
        name: name,
        code: item.code,
        price: item.price,
        change_amount: item.change_amount || '',
        change_percent: item.change_percent,
        trend: trend,
        nav_date: item.nav_date || '',
        nav_date_short: navDateShort
      });
    } else {
      // 默认格式
      if (item.market === 'cn_fund') {
        return `${marketConfig.flag} ${name} 💰${item.price} ${trend}${item.change_percent} | ${item.nav_date}`;
      } else {
        return `${marketConfig.flag} ${name} 💰${item.price} ${trend}${item.change_amount}(${item.change_percent})`;
      }
    }
  }).join('\n');

  return { title, content };
}
