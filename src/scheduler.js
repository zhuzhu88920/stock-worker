/**
 * 调度器模块
 * 调用 trading-calendar-api 判断市场状态
 * 本地仅保留 getOpenMarkets 作为调用入口
 */

import { isMarketOpenWithBuffer, getAllMarketStatusText } from './calendar-api.js';

export class Scheduler {
  constructor(config) {
    this.config = config;
  }

  /**
   * 获取当前开市的市场（含缓冲期）
   * @param {Date} now
   * @param {number} bufferMin - 收盘后缓冲分钟数
   */
  async getOpenMarkets(now = new Date(), bufferMin = 5) {
    const markets = this.config.getAllMarkets();
    const openMarkets = [];

    for (const market of markets) {
      if (await this.isMarketOpen(market, now, bufferMin)) {
        openMarkets.push(market);
      }
    }

    return openMarkets;
  }

  /**
   * 判断市场是否开市（含缓冲期）
   * 调用 calendar-api 模块
   */
  async isMarketOpen(market, now = new Date(), bufferMin = 5) {
    return await isMarketOpenWithBuffer(market, now, bufferMin);
  }

  /**
   * 获取所有市场的状态文本（用于推送标题）
   * @returns {Promise<object>} { cn_fund, hk, us, kr }
   */
  async getAllMarketStatusText() {
    return await getAllMarketStatusText();
  }
}
