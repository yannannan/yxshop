#!/usr/bin/env bash
# 使用项目既有纯JS / WASM依赖与本地字体，不下载原生图像程序，不连接业务数据库。
set -Eeuo pipefail
APP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)"
cd "$APP_DIR"
"${NODE_BIN:-/usr/local/bin/node}" --input-type=module -e 'await Promise.all([import("jpeg-js"),import("@resvg/resvg-wasm"),import("node:fs/promises").then(fs=>fs.access("assets/fonts/NotoSansCJKsc-Regular.otf"))]);console.log("图片处理依赖已就绪；请确认12号增量SQL已执行。");'
