#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
cd "$APP_DIR"
if (( $# )); then
    echo '升级入口不需要参数，请执行 bash upgrade.sh' >&2
    exit 2
fi
trap 'echo "升级失败（第 $LINENO 行），请检查上方错误并修复后重跑。" >&2' ERR

echo '======================================'
echo ' 宇星商城 yxshop 自动升级'
echo '======================================'

echo '[1/7] 停止服务...'
bash ./stop.sh

echo '[2/7] 获取最新代码...'
git fetch origin

echo '[3/7] 同步 origin/main...'
# 沿用原有强制同步方式：会覆盖已跟踪文件的本地修改。
git reset --hard origin/main

echo '[4/7] 安装项目依赖...'
pnpm install --frozen-lockfile --prod=false

echo '[5/7] 运行独立的视频依赖脚本...'
VIDEO_READY=1
if ! bash ./scripts/install-video-deps-centos.sh; then
    VIDEO_READY=0
    echo '提示：视频依赖安装失败，请保留上方错误；继续构建并启动商城。' >&2
fi

echo '[6/7] 构建生产版本...'
pnpm build

echo '[7/7] 启动服务...'
bash ./start.sh

if (( VIDEO_READY )); then
    echo 'yxshop 升级发布完成。'
else
    echo '商城已启动；视频依赖未就绪，视频提取可能不可用，请稍后单独重试视频安装脚本。'
fi
