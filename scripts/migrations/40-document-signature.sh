#!/usr/bin/env bash
set -Eeuo pipefail
APP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)"
cd "$APP_DIR"
"${NODE_BIN:-/usr/local/bin/node}" --env-file=.env.mysql --input-type=module -e '
await Promise.all([import("pdf-lib"),import("pngjs"),import("yauzl")]);
const { signatureWordReady } = await import("./lib/signature-word.mjs");
const { signatureStorage } = await import("./lib/signature-oss.mjs");
console.log("文件签名依赖已就绪，请确认13号增量SQL已执行。");
console.log(signatureStorage.ready() ? "签名OSS配置已读取。" : "签名OSS尚未配置，生成签署文件前请配置。");
console.log(await signatureWordReady() ? "Word转换程序已检测到，请验收沙箱。" : "启用DOCX需安装Linux转换依赖并设置SIGNATURE_WORD_ENABLED=1。");
'
