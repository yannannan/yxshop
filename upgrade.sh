#!/usr/bin/env bash
# video-upgrade-policy: check-only-v1
set -Eeuo pipefail

APP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
cd "$APP_DIR"
if (( $# )); then
    echo '升级入口不需要参数，请执行 bash upgrade.sh' >&2
    exit 2
fi
trap 'echo "升级失败（第 $LINENO 行），请检查上方错误并修复后重跑。" >&2' ERR

# 兼容旧版本仍跟踪环境文件的服务器。reset 前私有备份，之后原样恢复。
ENV_BACKUP_DIR=''
ENV_BACKUP_FILES=()
ENV_RESTORED=0
restore_environment() {
    [[ -n "$ENV_BACKUP_DIR" && "$ENV_RESTORED" -eq 0 ]] || return 0
    local name
    for name in "${ENV_BACKUP_FILES[@]}"; do
        if [[ -L "$APP_DIR/$name" || ( -e "$APP_DIR/$name" && ! -f "$APP_DIR/$name" ) ]]; then
            echo "环境文件位置异常，未覆盖：$name" >&2
            return 1
        fi
        if ! cmp -s -- "$ENV_BACKUP_DIR/$name" "$APP_DIR/$name"; then
            cp -p -- "$ENV_BACKUP_DIR/$name" "$APP_DIR/$name" || return 1
        fi
    done
    ENV_RESTORED=1
}
finish_upgrade() {
    local exit_status=$?
    trap - EXIT
    if ! restore_environment; then
        echo "环境文件恢复失败，私有备份保留在：$ENV_BACKUP_DIR" >&2
        exit 1
    fi
    if [[ -n "$ENV_BACKUP_DIR" ]]; then
        # 只删除本次 mktemp 在项目内生成的两份固定名称备份，不递归删除。
        if [[ "$ENV_BACKUP_DIR" == "$APP_DIR"/.env.upgrade.* && -d "$ENV_BACKUP_DIR" && ! -L "$ENV_BACKUP_DIR" ]]; then
            if ! { rm -f -- "$ENV_BACKUP_DIR/.env.local" "$ENV_BACKUP_DIR/.env.mysql" && rmdir -- "$ENV_BACKUP_DIR"; }; then
                echo "环境文件已恢复，私有备份目录清理失败：$ENV_BACKUP_DIR" >&2
            fi
        fi
    fi
    exit "$exit_status"
}
trap finish_upgrade EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
backup_environment() {
    local name
    for name in .env.local .env.mysql; do
        [[ -e "$APP_DIR/$name" || -L "$APP_DIR/$name" ]] || continue
        if [[ -L "$APP_DIR/$name" || ! -f "$APP_DIR/$name" ]]; then
            echo "环境文件必须是项目内的普通文件：$name。商城尚未停止。" >&2
            return 1
        fi
        if [[ -z "$ENV_BACKUP_DIR" ]]; then
            ENV_BACKUP_DIR="$(mktemp -d "$APP_DIR/.env.upgrade.XXXXXXXX")" || return 1
        fi
        cp -p -- "$APP_DIR/$name" "$ENV_BACKUP_DIR/$name" || return 1
        ENV_BACKUP_FILES+=("$name")
    done
}

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
PROJECT_PREFIX="$(git rev-parse --show-prefix)"
if ! git show "$UPGRADE_REF:${PROJECT_PREFIX}upgrade.sh" | grep -Fx '# video-upgrade-policy: check-only-v1' >/dev/null; then
    echo "远程 $UPGRADE_REF 的 ${PROJECT_PREFIX}upgrade.sh 尚未包含视频依赖仅检查策略。请先将本轮完整代码同步到该远程分支，再运行升级。商城尚未停止。" >&2
    exit 1
fi
if [[ -n "$(git ls-tree --full-tree -r --name-only "$UPGRADE_REF" -- "${PROJECT_PREFIX}vendor/video-engine")" ]]; then
    echo '远程代码包含视频引擎目录，可能覆盖本机程序。请先从版本管理移除 vendor/video-engine；商城尚未停止。' >&2
    exit 1
fi
echo "本次同步目标：$UPGRADE_REF"

backup_environment

echo '[2/7] 停止服务...'
bash ./stop.sh

echo "[3/7] 同步 $UPGRADE_REF..."
# 沿用原有强制同步方式：会覆盖已跟踪文件的本地修改。
git reset --hard "$UPGRADE_REF"
restore_environment

echo '[4/7] 安装项目依赖...'
pnpm install --frozen-lockfile --prod=false

echo '[5/7] 检查已安装的视频依赖（不下载、不安装、不更新引擎）...'
VIDEO_READY=1
if ! bash ./scripts/install-video-deps-centos.sh --check; then
    VIDEO_READY=0
    echo '提示：视频依赖检查未通过；保留现有引擎和离线缓存，不自动下载或修复，继续构建并启动商城。' >&2
fi

echo '[6/7] 构建生产版本...'
pnpm build

echo '[7/7] 启动服务...'
bash ./start.sh

if (( VIDEO_READY )); then
    echo 'yxshop 升级发布完成。'
else
    echo '商城已启动；视频依赖检查未通过，请保留上方错误另行排查。本次未自动安装或更新视频引擎。'
fi
