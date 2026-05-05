# Stock Worker - 股价监控推送服务

[English](README.md) | 简体中文

基于 Cloudflare Workers 的股价监控服务，支持多市场股票/基金实时监控，通过 Bark 推送到手机。

## 功能特性

- 支持多市场：A股基金、港股、韩股、美股
- 智能交易时段检测（含盘前盘后）
- 自动休假日判断
- 数据变化检测，仅推送有变化的数据
- 每5分钟自动抓取，收市价不漏推
- 推送到手机 Bark
- **自定义推送模板**：支持通过模板文件自定义推送格式
- **名称简化规则**：自动缩短过长的股票/基金名称

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

详见 [README.md](README.md)

## 推送效果

### 推送标题
```
🇨🇳开  🇭🇰开  🇰🇷开  🇺🇸休  ⏰ 20:25
```

### 推送内容
```
🇨🇳 华夏全球科技 💰2.95 📈 +1.86% 📅 04-29
🇨🇳 摩根新兴动力 💰12.38 📉 -0.01% 📅 04-30
🇨🇳 摩根标普500 💰1.61 ➡️ +0.00% 📅 04-29
🇨🇳 摩根纳指100 💰1.64 📈 +0.57% 📅 04-29
🇭🇰 2x海力士 💰47.60 📈0.20(+0.42%)
🇰🇷 海力士 💰1,286,000.00 📉-7000.00(-0.54%)
```

## 交易时段（北京时间）

> 注：程序判断收市时间 +1 分钟（如港股 16:01），确保 cron 能抓到收市价。

| 市场 | 盘前竞价 | 开盘 | 收盘 | 盘后 | 特殊时段 |
|------|----------|------|------|------|----------|
| A股基金 | - | - | - | - | 净值更新: 19:00-21:01 |
| 港股 | 09:00-09:30 | 09:30 | 16:00 | - | - |
| 韩股 | - | 09:00 | 15:30 | 15:30-16:01 | - |
| 美股 | 21:30-22:30 | 22:30 | 05:00(次日) | 05:00-08:01 | 夏令时/冬令时自动切换 |

## 配置文件说明

### config.toml - 股票配置

```toml
# 股票列表
[stocks]
cn_fund = [
  "005698,华夏全球科技",
  "377240,摩根新兴动力",
  "017641,摩根标普500",
  "019172,摩根纳指100",
]
hk = ["07709,2x海力士"]
kr = ["000660,海力士"]
us = ["RKLB,Rocket Lab", "TSLA,Tesla"]

# 市场配置
[markets.cn_fund]
name = "A股基金"
flag = "🇨🇳"
timezone = "Asia/Shanghai"
trading_hours = [{ start = "19:00", end = "21:00" }]
datasource = "https://fundmobapi.eastmoney.com/FundMNewApi/FundMNFInfo?pageIndex=1&pageSize=1&plat=Android&appType=ttjj&product=EFund&Version=1&Fcodes={code}&deviceid={timestamp}"

# 休假日
[holidays.cn]
year = 2026
dates = ["2026-01-01", "2026-02-16", ...]
```

### push-template.toml - 推送模板

```toml
# 标题模板
[title]
template = "{market_status}  ⏰ {time}"

# 内容模板
[content]
cn_fund = "{flag} {name} 💰{price} {trend} {change_percent} 📅 {nav_date_short}"
hk = "{flag} {name} 💰{price} {trend}{change_amount}({change_percent})"
kr = "{flag} {name} 💰{price} {trend}{change_amount}({change_percent})"
us = "{flag} {name} 💰{price} {trend}{change_amount}({change_percent})"

# 名称简化规则
[name_rules]
华夏全球科技先锋混合 = 华夏全球科技
摩根新兴动力混合A = 摩根新兴动力
(QDII) =
(人民币) =
```

**可用占位符：**
- `{market_status}` - 市场状态 (如: 🇨🇳开  🇭🇰开  🇰🇷开  🇺🇸休)
- `{date}` - 日期 (如: 05/03)
- `{time}` - 时间 (如: 20:25)
- `{flag}` - 市场国旗 (如: 🇨🇳)
- `{name}` - 股票/基金名称
- `{code}` - 股票/基金代码
- `{price}` - 价格/净值
- `{change_amount}` - 涨跌额
- `{change_percent}` - 涨跌幅
- `{trend}` - 涨跌图标 (📈/📉/➡️)
- `{nav_date}` - 净值日期 (仅基金)
- `{nav_date_short}` - 净值日期简写 (如: 04-29)

## 自定义配置

### 添加/删除股票

编辑 `config.toml` 文件的 `[stocks]` 部分：

```toml
[stocks]
cn_fund = [
  "005698,华夏全球科技",
  "000001,新基金名称",  # 添加新股票
]
```

### 修改推送格式

编辑 `push-template.toml` 文件：

```toml
[content]
cn_fund = "{flag} {name} 💰{price} {trend} {change_percent} 📅 {nav_date_short}"
```

### 添加名称简化规则

编辑 `push-template.toml` 文件的 `[name_rules]` 部分：

```toml
[name_rules]
华夏全球科技先锋混合 = 华夏全球科技
(QDII) =
(人民币) =
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

### 模板系统

- **标题模板**：使用占位符自定义标题格式
- **内容模板**：为不同市场设置不同的内容格式
- **名称简化**：自动应用名称简化规则，缩短过长的名称

## 数据存储

- **配置 + 数据共用一个 KV**：使用 Cloudflare KV（CONFIG binding）同时存储配置文件和历史股价数据
- **数据存储**：使用 Cloudflare KV 存储历史数据（key: `all_data_latest`）
- **写入频率**：每天最多约400次（交易时段内每5分钟一次）

## 数据源

| 市场 | 数据源 | 说明 |
|------|--------|------|
| A股基金 | 东方财富 | 基金净值数据 |
| 港股 | 腾讯行情 | 实时股价（GBK编码） |
| 韩股 | Naver | 实时股价 |
| 美股 | Finnhub | 实时股价 |

## 注意事项

1. **休假日更新**：每年初需要更新各市场的休假日
2. **API 限制**：Finnhub 免费版每分钟60次请求，足够5分钟抓取一次
3. **时区处理**：美股夏令时/冬令时自动切换
4. **数据延迟**：各市场数据源可能有1-5分钟延迟
5. **编码问题**：港股数据源使用 GBK 编码，已自动处理

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

### 模板不生效

1. 检查 `push-template.toml` 文件格式是否正确
2. 确认占位符拼写是否正确
3. 查看日志确认模板加载情况

## 常见问题

详见 [FAQ.md](FAQ.md)

## 贡献

欢迎提交 Issue 和 Pull Request！详见 [CONTRIBUTING.md](CONTRIBUTING.md)

## 许可证

MIT
