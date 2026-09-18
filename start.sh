#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$APP_DIR/.env.mysql"
PID_FILE="$APP_DIR/.yxstarshop.pid"
LOG_FILE="$APP_DIR/yxstarshop.log"
NODE_BIN="${NODE_BIN:-/usr/local/bin/node}"
VINEXT_CLI="$APP_DIR/node_modules/vinext/dist/cli.js"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "缺少 $ENV_FILE，未启动。"
  exit 1
fi

if [[ ! -x "$NODE_BIN" || ! -f "$VINEXT_CLI" ]]; then
  echo "Node 或项目依赖未就绪，请先执行 pnpm install --frozen-lockfile。"
  exit 1
fi

if [[ -s "$PID_FILE" ]]; then
  PID="$(<"$PID_FILE")"
  if kill -0 "$PID" 2>/dev/null; then
    echo "商城已在运行，PID：$PID"
    exit 0
  fi
  rm -f "$PID_FILE"
fi

cd "$APP_DIR"
nohup env PORT="${PORT:-3000}" "$NODE_BIN" --env-file="$ENV_FILE" "$VINEXT_CLI" start >"$LOG_FILE" 2>&1 &
PID=$!
echo "$PID" >"$PID_FILE"

sleep 1
if ! kill -0 "$PID" 2>/dev/null; then
  echo "商城启动失败，最近日志："
  tail -n 40 "$LOG_FILE" || true
  rm -f "$PID_FILE"
  exit 1
fi

echo "商城已启动，PID：$PID，端口：${PORT:-3000}"
echo "日志：$LOG_FILE"
