#!/usr/bin/env bash
set -Eeuo pipefail
APP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)"
cd "$APP_DIR"
"${NODE_BIN:-/usr/local/bin/node}" --env-file=.env.mysql --input-type=module -e '
await Promise.all([import("pdf-lib"),import("pngjs"),import("yauzl")]);
const { signatureWordReadiness } = await import("./lib/signature-word.mjs");
const { signatureStorage } = await import("./lib/signature-oss.mjs");
console.log("文件签名依赖已就绪，请确认13号增量SQL已执行。");
console.log(signatureStorage.ready() ? "签名OSS配置已读取。" : "签名OSS尚未配置，生成签署文件前请配置。");
const word = await signatureWordReadiness();
console.log(word.ready ? "DOCX 转换已就绪，请用测试文档验收。" : "DOCX 暂不可用，请执行 scripts/check-signature-word.mjs 检查配置。");
'
