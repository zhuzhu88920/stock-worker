/**
 * 存储模块
 * 使用 Cloudflare D1 数据库存储历史数据
 */

export class Storage {
  constructor(db) {
    this.db = db;
  }

  /**
   * 初始化数据库表
   */
  async init() {
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS stock_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        market TEXT NOT NULL,
        price TEXT,
        change_amount TEXT,
        change_percent TEXT,
        nav_date TEXT,
        updated_at TEXT NOT NULL,
        UNIQUE(code, market, updated_at)
      );

      CREATE INDEX IF NOT EXISTS idx_code_market ON stock_data(code, market);
      CREATE INDEX IF NOT EXISTS idx_updated_at ON stock_data(updated_at DESC);
    `);
  }

  /**
   * 保存数据
   */
  async saveData(data) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO stock_data
      (code, name, market, price, change_amount, change_percent, nav_date, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const item of data) {
      await stmt.bind(
        item.code,
        item.name,
        item.market,
        item.price,
        item.change_amount,
        item.change_percent,
        item.nav_date,
        item.updated_at
      ).run();
    }
  }

  /**
   * 获取上次数据
   */
  async getLastData(stocks) {
    if (!stocks || stocks.length === 0) {
      return [];
    }

    // 构建查询条件
    const conditions = stocks.map(s => `(code = '${s.code}' AND market = '${s.market}')`).join(' OR ');

    const result = await this.db.prepare(`
      SELECT * FROM stock_data
      WHERE ${conditions}
      ORDER BY updated_at DESC
      LIMIT 1000
    `).all();

    // 去重，每个股票只取最新的一条
    const latestMap = new Map();
    for (const row of result.results) {
      const key = `${row.market}_${row.code}`;
      if (!latestMap.has(key)) {
        latestMap.set(key, row);
      }
    }

    return Array.from(latestMap.values());
  }

  /**
   * 获取历史数据
   */
  async getHistory(code, market, limit = 100) {
    const result = await this.db.prepare(`
      SELECT * FROM stock_data
      WHERE code = ? AND market = ?
      ORDER BY updated_at DESC
      LIMIT ?
    `).bind(code, market, limit).all();

    return result.results;
  }

  /**
   * 清理旧数据 (保留最近30天)
   */
  async cleanup() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    await this.db.prepare(`
      DELETE FROM stock_data
      WHERE updated_at < ?
    `).bind(thirtyDaysAgo.toISOString()).run();
  }

  /**
   * 获取所有股票的最新数据
   */
  async getAllLatestData() {
    const result = await this.db.prepare(`
      SELECT * FROM stock_data
      WHERE (code, market, updated_at) IN (
        SELECT code, market, MAX(updated_at)
        FROM stock_data
        GROUP BY code, market
      )
      ORDER BY market, code
    `).all();

    return result.results;
  }
}
