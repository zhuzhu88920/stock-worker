-- Stock Worker 数据库初始化脚本
-- 使用方法: wrangler d1 execute stock-worker-db --file=./schema.sql

-- 创建股票数据表
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

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_code_market ON stock_data(code, market);
CREATE INDEX IF NOT EXISTS idx_updated_at ON stock_data(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_market ON stock_data(market);

-- 创建推送记录表
CREATE TABLE IF NOT EXISTS push_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  markets TEXT NOT NULL,
  pushed_at TEXT NOT NULL
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_pushed_at ON push_log(pushed_at DESC);
