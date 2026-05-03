#!/bin/bash

# 更新配置文件到 Cloudflare KV

set -e

echo "========================================="
echo "更新配置文件"
echo "========================================="

# 检查配置文件是否存在
if [ ! -f "config.toml" ]; then
    echo "错误: config.toml 文件不存在"
    exit 1
fi

# 获取 KV namespace ID
KV_ID=$(grep -A 2 'kv_namespaces' wrangler.toml | grep 'id' | cut -d'"' -f4)

if [ -z "$KV_ID" ]; then
    echo "错误: 无法从 wrangler.toml 获取 KV namespace ID"
    exit 1
fi

echo "KV Namespace ID: $KV_ID"
echo ""

# 上传配置
echo "上传配置文件..."
wrangler kv:key put --namespace-id="$KV_ID" "config" "$(cat config.toml)"

echo ""
echo "========================================="
echo "配置更新完成!"
echo "========================================="
echo ""
echo "配置将在下次 Cron 触发时生效"
echo "如需立即生效，请手动触发:"
echo "  curl https://your-worker.workers.dev/trigger"
echo ""
