/**
 * 推送模块
 * 使用 Bark 推送到手机
 */

export class Pusher {
  constructor(barkUrl) {
    this.barkUrl = barkUrl;
  }

  /**
   * 推送通知
   */
  async push({ title, body, sound = 'default', group = 'stock' }) {
    if (!this.barkUrl) {
      console.warn('Bark URL not configured, skipping push');
      return;
    }

    try {
      // Bark API 格式: https://api.day.app/{key}/{title}/{body}?group={group}
      const url = `${this.barkUrl}/${encodeURIComponent(title)}/${encodeURIComponent(body)}?group=${encodeURIComponent(group)}`;

      console.log('Push URL:', url);

      const response = await fetch(url);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Push error response:', errorText);
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('Push result:', result);

      return result;
    } catch (error) {
      console.error('Error pushing notification:', error);
      throw error;
    }
  }

  /**
   * 推送股票更新
   */
  async pushStockUpdate(markets, stocks, timeStr) {
    const now = new Date();
    const dateStr = now.toLocaleString('zh-CN', {
      timeZone: 'Asia/Shanghai',
      hour12: false,
      year: 'numeric',
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
      const flag = this.getMarketFlag(market);
      const isOpen = markets.includes(market);
      const status = isOpen ? '开' : '休';
      return `${flag}${status}`;
    }).join('  ');

    const title = `${marketStatus}  ⏰ ${timeOnly}`;

    // 构建内容
    const body = stocks.map(stock => {
      const flag = this.getMarketFlag(stock.market);

      // 简化基金名称
      let name = stock.name;
      if (stock.market === 'cn_fund') {
        // 去掉括号内容
        name = name.replace(/\([^)]*\)/g, '').trim();
      }

      // 涨跌方向图标
      const changePercent = parseFloat(stock.change_percent) || 0;
      const trendIcon = changePercent > 0 ? '📈' : changePercent < 0 ? '📉' : '➡️';

      if (stock.market === 'cn_fund') {
        // 基金格式: 🇨🇳 基金名 💰净值 📈涨跌幅 | 净值日期
        return `${flag} ${name} 💰${stock.price} ${trendIcon}${stock.change_percent} | ${stock.nav_date}`;
      } else {
        // 股票格式: 🇰🇷 股票名 💰价格 📈涨跌额(涨跌幅)
        return `${flag} ${name} 💰${stock.price} ${trendIcon}${stock.change_amount}(${stock.change_percent})`;
      }
    }).join('\n');

    // 推送
    return await this.push({
      title,
      body,
      sound: 'default',
      group: 'stock'
    });
  }

  /**
   * 获取市场国旗
   */
  getMarketFlag(market) {
    const flags = {
      'cn_fund': '🇨🇳',
      'hk': '🇭🇰',
      'kr': '🇰🇷',
      'us': '🇺🇸'
    };
    return flags[market] || '📊';
  }

  /**
   * 获取市场名称
   */
  getMarketName(market) {
    const names = {
      'cn_fund': 'A股基金',
      'hk': '港股',
      'kr': '韩股',
      'us': '美股'
    };
    return names[market] || market;
  }

  /**
   * 推送错误通知
   */
  async pushError(message) {
    return await this.push({
      title: '❌ Stock Worker 错误',
      body: message,
      sound: 'alarm',
      group: 'stock-error'
    });
  }

  /**
   * 推送测试通知
   */
  async pushTest() {
    return await this.push({
      title: '✅ Stock Worker 测试',
      body: '推送服务正常工作',
      sound: 'default',
      group: 'stock-test'
    });
  }
}
