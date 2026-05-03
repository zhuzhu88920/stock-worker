#!/bin/bash

# Stock Worker 部署脚本

set -e

echo "========================================="
echo "Stock Worker 部署脚本"
echo "========================================="

# 检查是否已登录
echo "检查 Cloudflare 登录状态..."
if ! wrangler whoami &> /dev/null; then
    echo "请先登录 Cloudflare:"
    wrangler login
fi

# 创建 D1 数据库
echo "创建 D1 数据库..."
wrangler d1 create stock-worker-db || echo "数据库已存在"

# 创建 KV 命名空间
echo "创建 KV 命名空间..."
wrangler kv:namespace create "CONFIG" || echo "KV 命名空间已存在"

# 初始化数据库表
echo "初始化数据库表..."
wrangler d1 execute stock-worker-db --file=./schema.sql

# 上传配置
echo "上传配置文件..."
wrangler kv:key put --namespace-id=$(grep -A 2 'kv_namespaces' wrangler.toml | grep 'id' | cut -d'"' -f4) "config" "$(cat config.toml)"

# 部署 Worker
echo "部署 Worker..."
wrangler deploy

echo "========================================="
echo "部署完成！"
echo "========================================="
echo ""
echo "下一步:"
echo "1. 更新 wrangler.toml 中的 database_id 和 kv namespace id"
echo "2. 配置环境变量 BARK_URL 和 FINNHUB_API_KEY"
echo "3. 测试推送: curl https://your-worker.workers.dev/trigger"
echo ""
