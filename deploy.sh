#!/bin/bash

# Stock Worker 部署脚本

set -e

echo "========================================="
echo "Stock Worker 部署脚本"
echo "========================================="

# 检查是否已登录
echo "检查 Cloudflare 登录状态..."
if ! npx wrangler whoami &> /dev/null; then
    echo "请先登录 Cloudflare:"
    npx wrangler login
fi

# 上传配置到 KV（线上）
echo "上传配置文件到线上 KV..."
KV_ID=$(grep -A 2 'kv_namespaces' wrangler.toml | grep 'id' | head -1 | cut -d'"' -f4)
npx wrangler kv key put --namespace-id="$KV_ID" "config" --path=config.toml --remote
npx wrangler kv key put --namespace-id="$KV_ID" "template" --path=push-template.toml --remote

# 部署 Worker（包含 Cron 触发器，配置在 wrangler.toml 的 [triggers] 里）
echo "部署 Worker..."
npx wrangler deploy

# 测试
echo ""
echo "========================================="
echo "部署完成！"
echo "========================================="
echo "Worker URL: https://stock-worker.andox.workers.dev"
echo "Cron: 1/5 * * * * (每5分钟自动触发)"
echo ""
echo "测试推送:"
echo "  curl https://stock-worker.andox.workers.dev/trigger"
echo "  curl https://stock-worker.andox.workers.dev/health"
echo ""
