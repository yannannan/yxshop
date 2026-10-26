#!/usr/bin/env bash
# Node 业务依赖由迁移主入口按锁安装；本步骤只确认站长依赖可解析，不连接业务库或安装浏览器。
set -Eeuo pipefail
APP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)"
cd "$APP_DIR"
"${NODE_BIN:-/usr/local/bin/node}" --input-type=module -e 'await Promise.all([import("tsx"),import("cheerio"),import("robots-parser"),import("tldts")]);console.log("站长采集依赖已就绪；请确认10号与11号增量SQL已依次执行。");'
