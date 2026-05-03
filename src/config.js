/**
 * 配置管理模块
 * 从 KV 或环境变量读取配置
 */

export class Config {
  constructor(env) {
    this.env = env;
    this.config = null;
  }

  /**
   * 获取配置
   */
  async getConfig() {
    if (this.config) {
      return this.config;
    }

    // 从 KV 读取配置
    const configStr = await this.env.CONFIG.get('config');
    if (!configStr) {
      throw new Error('Config not found in KV');
    }

    // 解析 TOML (简化版，实际需要 TOML 解析库)
    this.config = this.parseConfig(configStr);
    return this.config;
  }

  /**
   * 解析配置 (简化版 TOML 解析)
   */
  parseConfig(configStr) {
    const lines = configStr.split('\n');
    const config = {
      stocks: {
        cn_fund: [],
        hk: [],
        kr: [],
        us: []
      },
      markets: {},
      holidays: {}
    };

    let currentSection = null;
    let currentSubsection = null;
    let inArray = false;
    let currentArray = null;
    let arrayContent = [];

    for (const line of lines) {
      const trimmed = line.trim();

      // 跳过注释和空行
      if (trimmed.startsWith('#') || trimmed === '') {
        continue;
      }

      // 解析股票列表数组
      if (trimmed.includes('=') && trimmed.includes('[') && !trimmed.startsWith('[')) {
        // 数组定义，如: cn_fund = [
        const match = trimmed.match(/^(\w+)\s*=\s*\[/);
        if (match) {
          inArray = true;
          currentArray = match[1];
          arrayContent = [];
          continue;
        }
      }

      // 数组结束
      if (inArray && trimmed === ']') {
        inArray = false;
        if (currentArray === 'cn_fund' || currentArray === 'hk' || currentArray === 'kr' || currentArray === 'us') {
          if (!config.stocks[currentArray]) {
            config.stocks[currentArray] = [];
          }
          // 解析数组中的股票
          for (const item of arrayContent) {
            const match = item.match(/"([^,]+),([^"]+)"/);
            if (match) {
              config.stocks[currentArray].push({
                code: match[1],
                name: match[2]
              });
            }
          }
        }
        currentArray = null;
        arrayContent = [];
        continue;
      }

      // 收集数组内容
      if (inArray && currentArray) {
        arrayContent.push(trimmed);
        continue;
      }

      // 解析节
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        const section = trimmed.slice(1, -1);

        if (section === 'stocks') {
          currentSection = 'stocks';
          currentSubsection = null;
        } else if (section.startsWith('stocks.')) {
          currentSection = 'stocks';
          currentSubsection = section.split('.')[1];
        } else if (section.startsWith('markets.')) {
          currentSection = 'markets';
          currentSubsection = section.split('.')[1];
        } else if (section.startsWith('holidays.')) {
          currentSection = 'holidays';
          currentSubsection = section.split('.')[1];
        } else {
          currentSection = section;
          currentSubsection = null;
        }
      } else if (currentSection === 'stocks' && currentSubsection) {
        // 解析股票列表（备用逻辑）
        const match = trimmed.match(/"([^,]+),([^"]+)"/);
        if (match) {
          config.stocks[currentSubsection].push({
            code: match[1],
            name: match[2]
          });
        }
      } else if (currentSection === 'markets' && currentSubsection) {
        // 解析市场配置
        if (trimmed.includes('=')) {
          const firstEqIndex = trimmed.indexOf('=');
          const key = trimmed.substring(0, firstEqIndex).trim();
          const value = trimmed.substring(firstEqIndex + 1).trim();
          if (!config.markets[currentSubsection]) {
            config.markets[currentSubsection] = {};
          }
          config.markets[currentSubsection][key] = this.parseValue(value);
        }
      } else if (currentSection === 'holidays' && currentSubsection) {
        // 解析休假日
        if (trimmed.includes('=')) {
          const firstEqIndex = trimmed.indexOf('=');
          const key = trimmed.substring(0, firstEqIndex).trim();
          const value = trimmed.substring(firstEqIndex + 1).trim();
          if (!config.holidays[currentSubsection]) {
            config.holidays[currentSubsection] = {};
          }
          config.holidays[currentSubsection][key] = this.parseValue(value);
        }
      }
    }

    return config;
  }

  /**
   * 解析值
   */
  parseValue(value) {
    // 去除引号
    value = value.replace(/^["']|["']$/g, '');

    // 尝试解析为数字
    const num = Number(value);
    if (!isNaN(num)) {
      return num;
    }

    // 尝试解析为数组
    if (value.startsWith('[') && value.endsWith(']')) {
      return value.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
    }

    return value;
  }

  /**
   * 获取股票列表
   */
  getStocks() {
    return this.config.stocks;
  }

  /**
   * 根据市场获取股票列表
   */
  getStocksByMarkets(markets) {
    const stocks = [];
    for (const market of markets) {
      const marketStocks = this.config.stocks[market] || [];
      for (const stock of marketStocks) {
        stocks.push({
          ...stock,
          market
        });
      }
    }
    return stocks;
  }

  /**
   * 获取市场配置
   */
  getMarketConfig(market) {
    return this.config.markets[market] || {};
  }

  /**
   * 获取休假日
   */
  getHolidays(market) {
    const holidays = this.config.holidays[market];
    if (!holidays || !holidays.dates) {
      return [];
    }
    return holidays.dates;
  }

  /**
   * 获取所有市场
   */
  getAllMarkets() {
    return Object.keys(this.config.markets);
  }
}
