#!/bin/bash
# start.sh — WPS AI翻译插件一键启动脚本
# 同时启动：前端静态服务器(8080) + 后端翻译服务器(3000)

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "🚀 WPS AI 智能翻译插件 — 启动中..."
echo ""

# ─── 检查 .env ───────────────────────────────────────────────────────────────
if [ ! -f "$SCRIPT_DIR/server/.env" ]; then
    echo "⚠️  未找到 server/.env，正在从模板创建..."
    cp "$SCRIPT_DIR/server/.env.example" "$SCRIPT_DIR/server/.env"
    echo "❗ 请先编辑 server/.env 填入你的 LLM_API_KEY，然后重新运行此脚本。"
    echo "   打开文件: open $SCRIPT_DIR/server/.env"
    exit 1
fi

# ─── 检查 node_modules ───────────────────────────────────────────────────────
if [ ! -d "$SCRIPT_DIR/server/node_modules" ]; then
    echo "📦 安装后端依赖..."
    (cd "$SCRIPT_DIR/server" && npm install)
fi

# ─── 清理旧进程 ───────────────────────────────────────────────────────────────
echo "🧹 清理旧进程..."
lsof -ti:8080 | xargs kill -9 2>/dev/null || true
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
sleep 1

# ─── 启动前端服务器 ───────────────────────────────────────────────────────────
echo "🌐 启动前端服务器 → http://localhost:8080"
node "$SCRIPT_DIR/client-server.js" &
FRONTEND_PID=$!

# ─── 启动后端服务器 ───────────────────────────────────────────────────────────
echo "⚙️  启动后端服务器 → http://localhost:3000"
(cd "$SCRIPT_DIR/server" && node server.js) &
BACKEND_PID=$!

# ─── 等待启动 ─────────────────────────────────────────────────────────────────
sleep 2

# ─── 验证 ─────────────────────────────────────────────────────────────────────
echo ""
HEALTH=$(curl -s http://localhost:3000/api/health 2>/dev/null)
FRONTEND_OK=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/ribbon.xml 2>/dev/null)

echo "── 状态检查 ──────────────────────────────────────────────"
if [ "$FRONTEND_OK" = "200" ]; then
    echo "✅ 前端服务器：正常 (http://localhost:8080)"
else
    echo "❌ 前端服务器：异常"
fi

if echo "$HEALTH" | grep -q '"status":"ok"'; then
    MODEL=$(echo "$HEALTH" | sed 's/.*"model":"\([^"]*\)".*/\1/')
    echo "✅ 后端服务器：正常 (http://localhost:3000) — 模型: $MODEL"
else
    echo "❌ 后端服务器：异常（检查 server/.env 中的 LLM_API_KEY）"
fi
echo "──────────────────────────────────────────────────────────"
echo ""
echo "📋 WPS 使用步骤："
echo "   1. 完全退出 WPS Office（⌘Q）"
echo "   2. 重新打开 WPS Office"
echo "   3. 打开任意 .docx 文档"
echo "   4. 在顶部功能区找到 [AI Translation] 选项卡"
echo "   5. 点击 [Translate Full Document]"
echo ""
echo "按 Ctrl+C 停止所有服务..."
echo ""

# ─── 等待 Ctrl+C ─────────────────────────────────────────────────────────────
trap "echo ''; echo '🛑 停止中...'; kill $FRONTEND_PID $BACKEND_PID 2>/dev/null; exit 0" INT TERM
wait
