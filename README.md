# Stock Worker - 股价监控推送服务

基于 Cloudflare Workers 的股价监控服务，支持多市场股票/基金实时监控，通过 Bark 推送到手机。

## 功能特性

- 支持多市场：A股基金、港股、韩股、美股
- 智能交易时段检测（含盘前盘后）
- 自动休假日判断
- 数据变化检测，仅推送有变化的数据
- 每5分钟自动抓取，收市价不漏推
- 推送到手机 Bark

## 推送效果

### 推送标题
```
A股 开市 港股 开市 韩股 开市 美股 开市 ⏰2026-05-03 09:35
```

### 推送内容
```
🇰🇷 海力士 | 140,000 | +10,000(+1.01%)
🇭🇰 2x海力士 | 47.04 | +2.11(+2.00%)
🇨🇳 华夏全球科技 | 2.9503 | +1.86% | 2026-04-29
🇺🇸 Rocket Lab | 5.23 | +0.15(+2.96%)
🇺🇸 Tesla | 175.50 | +3.20(+1.86%)
```

## 交易时段（北京时间）

> Note: Closing time in code is +1 min (e.g. HK 16:01) to ensure the closing price is captured.

| 市场 | 盘前竞价 | 开盘 | 收盘 | 盘后 | 特殊时段 |
|------|----------|------|------|------|----------|
| A股基金 | - | - | - | - | 净值更新: 19:00-21:01 |
| 港股 | 09:00-09:30 | 09:30 | 16:00 | - | - |
| 韩股 | - | 08:00 | 14:30 | 14:30-16:01 | - |
| 美股 | 21:30-22:30 | 22:30 | 05:00(次日) | 05:00-08:01 | 夏令时/冬令时自动切换 |

## 快速开始

### 一键部署

```bash
# 克隆项目
git clone https://github.com/your-username/stock-worker.git
cd stock-worker

# 运行部署脚本
bash deploy.sh
```

### 手动部署

#### 1. 准备 Cloudflare 账号

- 注册 [Cloudflare](https://dash.cloudflare.com/)
- 安装 Wrangler CLI: `npm install -g wrangler`
- 登录: `wrangler login`

#### 2. 创建资源

```bash

# 创建 KV 命名空间（配置和数据共用）
wrangler kv:namespace create "CONFIG"
```

#### 3. 更新配置

编辑 `wrangler.toml`，替换以下内容：

- `id`: KV 命名空间 ID（只需一个，配置和数据共用）
- `BARK_URL`: 你的 Bark 推送 URL
- `FINNHUB_API_KEY`: Finnhub API Key

#### 5. 上传配置

```bash
wrangler kv:key put --namespace-id=your-kv-id "config" "$(cat config.toml)"
```

#### 6. 部署

```bash
wrangler deploy
```

#### 7. 测试

```bash
# 手动触发
curl https://your-worker.workers.dev/trigger

# 查看日志
wrangler tail
```

## 配置文件说明

### config.toml 结构

```toml
# 股票列表
[stocks]
cn_fund = ["005698,华夏全球科技", ...]
hk = ["07709,2x海力士", ...]
kr = ["000660,海力士", ...]
us = ["RKLB,Rocket Lab", ...]

# 市场配置
[markets.cn_fund]
name = "A股基金"
flag = "🇨🇳"
timezone = "Asia/Shanghai"
trading_hours = [{ start = "19:00", end = "21:00" }]
datasource = "https://..."

# 休假日
[holidays.cn]
year = 2026
dates = ["2026-01-01", ...]
```

### 更新股票列表

编辑 `config.toml` 中的 `[stocks]` 部分：

```toml
[stocks]
cn_fund = [
  "005698,华夏全球科技",
  "377240,摩根新兴动力",
  # 添加新股票: "代码,名称"
]
```

### 更新休假日

每年初更新一次各市场的休假日：

```toml
[holidays.cn]
year = 2026
dates = [
  "2026-01-01",  # 元旦
  "2026-02-16",  # 春节
  # 添加新休假日
]
```

## 工作原理

### 抓取逻辑

1. 每5分钟触发一次
2. 检查当前时间是否在任一市场交易时段内
3. 如果是，仅抓取开市市场的所有股票数据
4. 对比上次存储的数据
5. 如果有变化，推送通知；否则不推送
6. 如果所有市场都休市，或所有股价都没变化，不推送

### 推送规则

- **合并推送**：多个市场同时开市时，合并成一条推送
- **完整数据**：推送内容包含所有股票（即使没变化，显示上次数据）
- **仅推送变化**：只有当至少一个股票数据变化时才推送
- **休市不推送**：所有市场都休市时不推送

### 数据存储

使用 Cloudflare KV 存储配置和历史数据（CONFIG binding 同时用于配置和数据存储）：
- 每次抓取后存储最新数据
- 用于对比检测变化


## 数据源

| 市场 | 数据源 | 说明 |
|------|--------|------|
| A股基金 | 东方财富 | 基金净值数据 |
| 港股 | 东方财富 | 实时股价 |
| 韩股 | Naver | 实时股价 |
| 美股 | Finnhub | 实时股价 |

## 注意事项

1. **休假日更新**：每年初需要更新各市场的休假日
2. **API 限制**：Finnhub 免费版每分钟60次请求，足够5分钟抓取一次
3. **时区处理**：美股夏令时/冬令时自动切换
4. **数据延迟**：各市场数据源可能有1-5分钟延迟

## 故障排查

### 推送未收到

1. 检查 Bark API Key 是否正确
2. 检查手机网络连接
3. 查看 Workers 日志

### 数据未更新

1. 检查当前是否在交易时段
2. 检查是否为休假日
3. 查看数据源是否正常

### Cron 未触发

1. 检查 wrangler.toml 中的 cron 配置
2. 查看 Workers 日志确认触发情况

## 许可证

MIT
