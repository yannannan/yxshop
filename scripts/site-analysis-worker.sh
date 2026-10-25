#!/usr/bin/env bash
set -Eeuo pipefail
APP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="$APP_DIR/.site-analysis-worker.pid"
LOG_FILE="$APP_DIR/site-analysis-worker.log"
WORKER="$APP_DIR/scripts/site-analysis-worker.ts"
NODE_BIN="${NODE_BIN:-/usr/local/bin/node}"
case "${1:-start}" in
  start)
    if [[ -s "$PID_FILE" ]]; then
      PID="$(<"$PID_FILE")"
      if [[ "$PID" =~ ^[0-9]+$ ]] && kill -0 "$PID" 2>/dev/null; then
        COMMAND_LINE="$(tr '\0' ' ' </proc/"$PID"/cmdline 2>/dev/null || true)"
        if [[ "$COMMAND_LINE" == *"$WORKER"* ]]; then echo "站长采集进程已在运行，PID：$PID"; exit 0; fi
        echo "站长采集 PID 文件指向其他进程，已拒绝覆盖"; exit 1
      fi
      rm -f "$PID_FILE"
    fi
    [[ -x "$NODE_BIN" && -f "$APP_DIR/.env.mysql" ]] || { echo "站长采集缺少 Node 或 .env.mysql"; exit 1; }
    cd "$APP_DIR"
    nohup env NODE_ENV=production "$NODE_BIN" --env-file="$APP_DIR/.env.mysql" --import tsx "$WORKER" >>"$LOG_FILE" 2>&1 &
    PID=$!; echo "$PID" >"$PID_FILE"
    sleep 1
    if ! kill -0 "$PID" 2>/dev/null; then echo "站长采集启动失败，请查看 $LOG_FILE"; rm -f "$PID_FILE"; exit 1; fi
    echo "站长采集进程已启动，PID：$PID；日志：$LOG_FILE"
    ;;
  stop)
    [[ -s "$PID_FILE" ]] || exit 0
    PID="$(<"$PID_FILE")"
    if [[ ! "$PID" =~ ^[0-9]+$ ]]; then echo "站长采集 PID 文件无效"; exit 1; fi
    if ! kill -0 "$PID" 2>/dev/null; then rm -f "$PID_FILE"; exit 0; fi
    COMMAND_LINE="$(tr '\0' ' ' </proc/"$PID"/cmdline 2>/dev/null || true)"
    [[ "$COMMAND_LINE" == *"$WORKER"* ]] || { echo "PID $PID 不属于当前站长采集进程，已拒绝停止"; exit 1; }
    kill -TERM "$PID"
    for _ in {1..20}; do
      if ! kill -0 "$PID" 2>/dev/null; then rm -f "$PID_FILE"; echo "站长采集进程已停止"; exit 0; fi
      sleep 1
    done
    kill -KILL "$PID"; rm -f "$PID_FILE"; echo "站长采集进程已停止，未完成任务稍后可恢复"
    ;;
  *) echo "用法：bash scripts/site-analysis-worker.sh [start|stop]"; exit 2 ;;
esac
