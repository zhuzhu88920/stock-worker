/**
 * 存储模块
 * 使用 Cloudflare KV（CONFIG binding）存储历史数据
 * 所有股价合并存入单一 key，最小化 KV 读写次数
 */

export class Storage {
  constructor(kv) {
    this.kv = kv;
  }

  /**
   * 保存数据
   * 所有股票写入同一个 key，每次有变化只写 1 次 KV
   */
  async saveData(data) {
    const now = new Date();
    const timestamp = now.toISOString();

    const payload = data.map(item => ({ ...item, updated_at: timestamp }));
    await this.kv.put('all_data_latest', JSON.stringify(payload));
  }

  /**
   * 获取上次数据
   * 一次读取全部，按 market+code 过滤出当前关心的股票
   */
  async getLastData(stocks) {
    if (!stocks || stocks.length === 0) {
      return [];
    }

    const all = await this.kv.get('all_data_latest', { type: 'json' });
    if (!all || !Array.isArray(all)) {
      return [];
    }

    // 只返回本次关心的股票
    const keySet = new Set(stocks.map(s => `${s.market}_${s.code}`));
    return all.filter(item => keySet.has(`${item.market}_${item.code}`));
  }
}
