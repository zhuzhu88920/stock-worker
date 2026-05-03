/**
 * 存储模块
 * 使用 Cloudflare KV 存储历史数据
 */

export class Storage {
  constructor(kv) {
    this.kv = kv;
  }

  /**
   * 保存数据
   */
  async saveData(data) {
    const now = new Date();
    const timestamp = now.toISOString();

    // 保存每只股票的数据
    for (const item of data) {
      const key = `stock_${item.market}_${item.code}`;
      const value = {
        ...item,
        updated_at: timestamp
      };
      await this.kv.put(key, JSON.stringify(value));
    }

    // 保存所有股票的最新数据（用于快速查询）
    const allDataKey = `all_data_${timestamp}`;
    await this.kv.put(allDataKey, JSON.stringify(data));

    // 清理旧数据（保留最近10条）
    await this.cleanup();
  }

  /**
   * 获取上次数据
   */
  async getLastData(stocks) {
    if (!stocks || stocks.length === 0) {
      return [];
    }

    const results = [];

    // 获取每只股票的最新数据
    for (const stock of stocks) {
      const key = `stock_${stock.market}_${stock.code}`;
      const value = await this.kv.get(key, { type: 'json' });

      if (value) {
        results.push(value);
      }
    }

    return results;
  }

  /**
   * 获取历史数据
   */
  async getHistory(code, market, limit = 100) {
    // KV 不支持复杂查询，这里简化实现
    // 实际使用时可以考虑使用 D1 或其他方案
    const key = `stock_${market}_${code}`;
    const value = await this.kv.get(key, { type: 'json' });

    if (value) {
      return [value];
    }

    return [];
  }

  /**
   * 清理旧数据 (保留最近10条)
   */
  async cleanup() {
    // KV 不支持直接列出所有键，这里简化处理
    // 实际使用时可以考虑使用 D1 或其他方案
    // 或者使用 KV 的 list 功能（需要额外配置）
  }

  /**
   * 获取所有股票的最新数据
   */
  async getAllLatestData() {
    // KV 不支持直接查询所有数据，这里简化实现
    // 实际使用时可以考虑使用 D1 或其他方案
    return [];
  }
}
