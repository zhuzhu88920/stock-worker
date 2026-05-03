# D1 数据库手动设置指南

由于 API Token 权限限制，需要手动创建 D1 数据库。

## 步骤 1：创建 D1 数据库

1. 访问 Cloudflare Dashboard: https://dash.cloudflare.com/
2. 选择你的账户
3. 进入 **Workers & Pages** → **D1**
4. 点击 **Create database**
5. 数据库名称输入：`stock-worker-db`
6. 点击 **Create**

## 步骤 2：获取数据库 ID

创建完成后，你会看到数据库 ID，格式类似：`xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`

## 步骤 3：更新 wrangler.toml

将获取到的数据库 ID 更新到 `wrangler.toml` 文件中：

```toml
# D1 数据库绑定
[[d1_databases]]
binding = "DB"
database_name = "stock-worker-db"
database_id = "你的数据库ID"
```

## 步骤 4：初始化数据库表

在本地运行以下命令初始化数据库表：

```bash
npx wrangler d1 execute stock-worker-db --file=schema.sql
```

## 步骤 5：重新部署

```bash
npx wrangler deploy
```

## API Token 权限问题

如果遇到 API Token 权限问题，请：

1. 访问 https://dash.cloudflare.com/profile/api-tokens
2. 创建新的 API Token
3. 选择 **Edit Cloudflare Workers** 模板
4. 确保包含以下权限：
   - Account - Cloudflare Workers - Edit
   - Account - Workers KV Storage - Edit
   - Account - D1 - Edit
   - Account - Account Settings - Read
5. 更新 GitHub Secrets 中的 `CLOUDFLARE_API_TOKEN`
