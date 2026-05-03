/**
 * 数据抓取模块
 * 从各数据源抓取股价数据
 */

import fetch from 'node-fetch';

export class Fetcher {
  constructor(config, env) {
    this.config = config;
    this.env = env;
  }

  /**
   * 抓取所有股票数据
   */
  async fetchAll(stocks, now = new Date()) {
    const results = [];

    for (const stock of stocks) {
      try {
        const data = await this.fetchStock(stock, now);
        if (data) {
          results.push(data);
        }
      } catch (error) {
        console.error(`Error fetching ${stock.code}:`, error.message);
      }
    }

    return results;
  }

  /**
   * 抓取单个股票数据
   */
  async fetchStock(stock, now = new Date()) {
    const marketConfig = this.config.getMarketConfig(stock.market);
    const datasource = marketConfig.datasource;

    if (!datasource) {
      console.warn(`No datasource for ${stock.market}`);
      return null;
    }

    // 替换模板变量
    const url = this.replaceTemplate(datasource, stock, now);

    console.log(`Fetching ${stock.market} ${stock.code} from: ${url}`);

    // 发起请求
    const response = await fetch(url, {
      headers: this.getHeaders(stock.market)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // 基金数据是JSON格式，需要特殊处理
    // 港股数据是腾讯格式，需要特殊处理
    let data;
    if (stock.market === 'cn_fund') {
      data = await response.json();
    } else if (stock.market === 'hk') {
      const text = await response.text();
      data = this.parseTencentHK(text);
    } else {
      data = await response.json();
    }

    console.log(`Fetched data for ${stock.code}:`, JSON.stringify(data).substring(0, 200));

    // 解析数据
    return this.parseData(data, stock, marketConfig);
  }

  /**
   * 解析腾讯港股格式
   */
  parseTencentHK(text) {
    // 格式: v_hk07709="100~名称~07709~价格~昨收~开盘~..."
    const match = text.match(/v_hk\d+="(.+)"/);
    if (!match) {
      return null;
    }

    const parts = match[1].split('~');
    return {
      name: parts[1],
      code: parts[2],
      price: parseFloat(parts[3]),      // 当前价格
      prev_close: parseFloat(parts[4]), // 昨收价格
      open: parseFloat(parts[5]),       // 开盘价
      high: parseFloat(parts[9]),       // 最高价
      low: parseFloat(parts[19]),       // 最低价
      volume: parseFloat(parts[6]),     // 成交量
      change_amount: parseFloat(parts[31]), // 涨跌额
      change_percent: parseFloat(parts[32])  // 涨跌幅
    };
  }

  /**
   * 替换模板变量
   */
  replaceTemplate(template, stock, now) {
    const timestamp = now.getTime();
    return template
      .replace('{code}', stock.code)
      .replace('{timestamp}', timestamp)
      .replace('{FINNHUB_API_KEY}', this.env?.FINNHUB_API_KEY || '');
  }

  /**
   * 获取请求头
   */
  getHeaders(market) {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Referer': 'https://quote.eastmoney.com/',
      'Origin': 'https://quote.eastmoney.com'
    };

    // 韩股需要 Referer
    if (market === 'kr') {
      headers['Referer'] = 'https://m.stock.naver.com/';
      headers['Origin'] = 'https://m.stock.naver.com';
    }

    return headers;
  }

  /**
   * 解析数据
   */
  parseData(data, stock, marketConfig) {
    let result = {
      code: stock.code,
      name: stock.name,
      market: stock.market,
      price: null,
      change_amount: null,
      change_percent: null,
      nav_date: null,
      updated_at: new Date().toISOString()
    };

    switch (stock.market) {
      case 'cn_fund':
        result = this.parseCNFund(data, result);
        break;
      case 'hk':
        result = this.parseHK(data, result);
        break;
      case 'kr':
        result = this.parseKR(data, result);
        break;
      case 'us':
        result = this.parseUS(data, result);
        break;
      default:
        console.warn(`Unknown market: ${stock.market}`);
    }

    return result;
  }

  /**
   * 解析A股基金数据
   */
  parseCNFund(data, result) {
    try {
      // 新数据源格式: { Datas: [{ FCODE, SHORTNAME, PDATE, NAV, NAVCHGRT, ... }], Success: true }
      if (data && data.Success && data.Datas && data.Datas.length > 0) {
        const fundData = data.Datas[0];
        result.name = fundData.SHORTNAME || result.name;
        result.price = fundData.NAV || '0.0000';
        result.change_percent = fundData.NAVCHGRT !== null && fundData.NAVCHGRT !== undefined ? fundData.NAVCHGRT : '0.00';
        result.nav_date = fundData.PDATE || this.formatDate(new Date());

        // 格式化涨跌幅
        if (result.change_percent && !result.change_percent.includes('%')) {
          result.change_percent = `${result.change_percent}%`;
        }
      }
    } catch (error) {
      console.error('Error parsing CN fund data:', error);
    }

    return result;
  }

  /**
   * 解析港股数据
   */
  parseHK(data, result) {
    try {
      if (data) {
        result.price = this.formatPrice(data.price);
        result.change_amount = this.formatPrice(data.change_amount);
        result.change_percent = this.formatPercent(data.change_percent);
      }
    } catch (error) {
      console.error('Error parsing HK stock data:', error);
    }

    return result;
  }

  /**
   * 解析韩股数据
   */
  parseKR(data, result) {
    try {
      const stockData = data;
      if (stockData) {
        result.price = this.formatPrice(stockData.closePrice || stockData.nowPrice);
        result.change_amount = this.formatPrice(stockData.compareToPreviousClosePrice || stockData.changePrice);
        result.change_percent = this.formatPercent(stockData.fluctuationsRatio || stockData.changeRate);
      }
    } catch (error) {
      console.error('Error parsing KR stock data:', error);
    }

    return result;
  }

  /**
   * 解析美股数据 (Finnhub)
   */
  parseUS(data, result) {
    try {
      const stockData = data;
      if (stockData) {
        result.price = this.formatPrice(stockData.c); // current price
        result.change_amount = this.formatPrice(stockData.d); // change
        result.change_percent = this.formatPercent(stockData.dp); // percent change
      }
    } catch (error) {
      console.error('Error parsing US stock data:', error);
    }

    return result;
  }

  /**
   * 格式化价格
   */
  formatPrice(price) {
    if (price === null || price === undefined) {
      return '0.00';
    }

    // 移除千分位逗号
    const strPrice = String(price).replace(/,/g, '');
    const num = parseFloat(strPrice);
    if (isNaN(num)) {
      return '0.00';
    }

    // 根据数值大小决定格式
    if (num >= 1000) {
      // 大数字用千分位
      return num.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
    } else {
      // 小数字保留2位小数
      return num.toFixed(2);
    }
  }

  /**
   * 格式化百分比
   */
  formatPercent(percent) {
    if (percent === null || percent === undefined) {
      return '0.00%';
    }

    const num = parseFloat(percent);
    if (isNaN(num)) {
      return '0.00%';
    }

    const sign = num >= 0 ? '+' : '';
    return `${sign}${num.toFixed(2)}%`;
  }

  /**
   * 格式化日期
   */
  formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
