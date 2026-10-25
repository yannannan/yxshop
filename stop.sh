#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$APP_DIR/.yxstarshop.pid"
bash "$APP_DIR/scripts/site-analysis-worker.sh" stop || echo "站长采集进程停止失败，请检查采集 PID；继续停止商城。"

if [[ ! -s "$PID_FILE" ]]; then
  echo "未找到 PID 文件，商城未通过 start.sh 启动或已经停止。"
  exit 0
fi

PID="$(<"$PID_FILE")"
if ! kill -0 "$PID" 2>/dev/null; then
  rm -f "$PID_FILE"
  echo "商城进程已停止。"
  exit 0
fi

COMMAND_LINE="$(tr '\0' ' ' </proc/"$PID"/cmdline 2>/dev/null || true)"
if [[ "$COMMAND_LINE" != *"$APP_DIR/node_modules/vinext/dist/cli.js"* ]]; then
  echo "PID $PID 不属于当前商城进程，已拒绝停止。"
  exit 1
fi

kill "$PID"
for _ in {1..15}; do
  if ! kill -0 "$PID" 2>/dev/null; then
    rm -f "$PID_FILE"
    echo "商城已停止。"
    exit 0
  fi
  sleep 1
done

kill -KILL "$PID"
rm -f "$PID_FILE"
echo "商城已强制停止。"
