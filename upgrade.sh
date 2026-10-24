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

echo '[1/7] 获取最新代码并检查同步分支...'
CURRENT_BRANCH="$(git symbolic-ref --quiet --short HEAD || true)"
if [[ -z "$CURRENT_BRANCH" ]]; then
    echo '当前处于游离 HEAD，请先切换到要发布的分支。商城尚未停止。' >&2
    exit 1
fi
UPGRADE_REF="$(git rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' 2>/dev/null || true)"
UPGRADE_REF="${UPGRADE_REF:-origin/$CURRENT_BRANCH}"
if [[ "$UPGRADE_REF" != origin/* ]]; then
    echo "当前分支跟踪 $UPGRADE_REF，升级脚本只从 origin 更新。请先确认分支配置。商城尚未停止。" >&2
    exit 1
fi
git fetch origin
if ! git rev-parse --verify --quiet "refs/remotes/$UPGRADE_REF^{commit}" >/dev/null; then
    echo "未找到远程分支 $UPGRADE_REF，请检查当前分支和 origin 配置。商城尚未停止。" >&2
    exit 1
fi
echo "本次同步目标：$UPGRADE_REF"

echo '[2/7] 停止服务...'
bash ./stop.sh

echo "[3/7] 同步 $UPGRADE_REF..."
# 沿用原有强制同步方式：会覆盖已跟踪文件的本地修改。
git reset --hard "$UPGRADE_REF"

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
