/**
 * 配置管理模块
 * 从 KV 读取配置
 */

import { TomlParser } from './toml-parser.js';

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

    // 使用 TomlParser 解析配置
    this.config = TomlParser.parse(configStr);
    return this.config;
  }

  /**
   * 获取股票列表
   */
  getStocks() {
    return this.config.stocks;
  }

  /**
   * 获取所有已配置的股票（用于推送内容）
   */
  getAllStocks() {
    const all = [];
    const markets = this.getAllMarkets();
    for (const market of markets) {
      const marketStocks = this.config.stocks[market] || [];
      for (const stock of marketStocks) {
        if (!stock.code || !stock.code.trim()) continue;
        all.push({ ...stock, market });
      }
    }
    return all;
  }

  /**
   * 根据市场获取股票列表
   */
  getStocksByMarkets(markets) {
    const stocks = [];
    for (const market of markets) {
      const marketStocks = this.config.stocks[market] || [];
      for (const stock of marketStocks) {
        if (!stock.code || !stock.code.trim()) continue;
        stocks.push({ ...stock, market });
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
