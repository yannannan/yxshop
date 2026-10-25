#!/usr/bin/env bash
# migration-upgrade-policy: modules-v1
# 新服务器迁移部署入口；日常升级继续使用 upgrade.sh。
# 一次解析执行块，避免 git reset 覆盖入口文件后混读新旧脚本。
{
set -Eeuo pipefail

APP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
cd "$APP_DIR"
if (( $# )); then
    echo '迁移部署入口不需要参数，请执行 bash migration_upgrade.sh' >&2
    exit 2
fi
CURRENT_STEP='检查基础环境'
trap 'echo "迁移部署失败（阶段：$CURRENT_STEP，第 $LINENO 行）。请修复上方错误后重新执行 bash migration_upgrade.sh。" >&2' ERR

# 与日常升级保持相同的配置保护：reset 前私有备份，之后原样恢复。
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
finish_migration() {
    local exit_status=$?
    trap - EXIT
    if ! restore_environment; then
        echo "环境文件恢复失败，私有备份保留在：$ENV_BACKUP_DIR" >&2
        exit 1
    fi
    if [[ -n "$ENV_BACKUP_DIR" ]]; then
        if [[ "$ENV_BACKUP_DIR" == "$APP_DIR"/.env.migration.* && -d "$ENV_BACKUP_DIR" && ! -L "$ENV_BACKUP_DIR" ]]; then
            if ! { rm -f -- "$ENV_BACKUP_DIR/.env.local" "$ENV_BACKUP_DIR/.env.mysql" && rmdir -- "$ENV_BACKUP_DIR"; }; then
                echo "环境文件已恢复，私有备份目录清理失败：$ENV_BACKUP_DIR" >&2
            fi
        fi
    fi
    exit "$exit_status"
}
trap finish_migration EXIT
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
            ENV_BACKUP_DIR="$(mktemp -d "$APP_DIR/.env.migration.XXXXXXXX")" || return 1
        fi
        cp -p -- "$APP_DIR/$name" "$ENV_BACKUP_DIR/$name" || return 1
        ENV_BACKUP_FILES+=("$name")
    done
}

echo '======================================'
echo ' 宇星商城 yxshop 新服务器迁移部署'
echo '======================================'

echo '[1/8] 检查基础运行环境和配置...'
[[ "$(uname -s)" == Linux ]] || { echo '迁移部署脚本用于 Linux 服务器。' >&2; exit 1; }
for dependency in git pnpm; do
    command -v "$dependency" >/dev/null || { echo "缺少 $dependency，请先准备基础运行环境。商城尚未停止。" >&2; exit 1; }
done
NODE_BIN="${NODE_BIN:-$(command -v node || true)}"
[[ -n "$NODE_BIN" && -x "$NODE_BIN" ]] || { echo '请先准备项目所需的 Node >=22.13。商城尚未停止。' >&2; exit 1; }
"$NODE_BIN" -e 'const [a,b]=process.versions.node.split(".").map(Number); if(a<22||(a===22&&b<13))process.exit(1)' || { echo 'Node 版本需 >=22.13。商城尚未停止。' >&2; exit 1; }
export NODE_BIN
[[ -f .env.mysql && ! -L .env.mysql ]] || { echo '请先在本机准备 .env.mysql（普通文件），配置数据库和服务密钥。商城尚未停止。' >&2; exit 1; }

CURRENT_STEP='获取代码并验证部署目标'
echo '[2/8] 获取最新代码并检查同步分支...'
CURRENT_BRANCH="$(git symbolic-ref --quiet --short HEAD || true)"
if [[ -z "$CURRENT_BRANCH" ]]; then
    echo '当前处于游离 HEAD，请先切换到要发布的分支。商城尚未停止。' >&2
    exit 1
fi
UPGRADE_REF="$(git rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' 2>/dev/null || true)"
UPGRADE_REF="${UPGRADE_REF:-origin/$CURRENT_BRANCH}"
if [[ "$UPGRADE_REF" != origin/* ]]; then
    echo "当前分支跟踪 $UPGRADE_REF，迁移脚本只从 origin 更新。商城尚未停止。" >&2
    exit 1
fi
git fetch origin
if ! git rev-parse --verify --quiet "refs/remotes/$UPGRADE_REF^{commit}" >/dev/null; then
    echo "未找到远程分支 $UPGRADE_REF，请检查当前分支和 origin 配置。商城尚未停止。" >&2
    exit 1
fi
PROJECT_PREFIX="$(git rev-parse --show-prefix)"
if ! git show "$UPGRADE_REF:${PROJECT_PREFIX}migration_upgrade.sh" | grep -Fx '# migration-upgrade-policy: modules-v1' >/dev/null; then
    echo "远程 $UPGRADE_REF 的 ${PROJECT_PREFIX}migration_upgrade.sh 尚未包含迁移入口，请先同步完整代码。商城尚未停止。" >&2
    exit 1
fi
if ! git show "$UPGRADE_REF:${PROJECT_PREFIX}upgrade.sh" | grep -Fx '# video-upgrade-policy: check-only-v1' >/dev/null; then
    echo "远程 $UPGRADE_REF 尚未包含视频依赖仅检查的日常升级策略，请先同步完整代码。商城尚未停止。" >&2
    exit 1
fi
if [[ -n "$(git ls-tree --full-tree -r --name-only "$UPGRADE_REF" -- "${PROJECT_PREFIX}vendor/video-engine")" ]]; then
    echo '远程代码包含视频引擎目录，请先从版本管理移除 vendor/video-engine，避免覆盖本机程序。商城尚未停止。' >&2
    exit 1
fi
git cat-file -e "$UPGRADE_REF:${PROJECT_PREFIX}scripts/migrations/10-video-deps.sh" || { echo '远程缺少视频依赖迁移步骤，请同步完整代码。商城尚未停止。' >&2; exit 1; }
echo "本次同步目标：$UPGRADE_REF"

CURRENT_STEP='备份配置并停止商城'
echo '[3/8] 备份本机配置并停止服务...'
backup_environment
bash ./stop.sh

CURRENT_STEP='同步项目代码'
echo "[4/8] 同步 $UPGRADE_REF..."
# 与 upgrade.sh 一样会覆盖已跟踪文件的本地修改，不清理忽略的引擎和上传文件。
git reset --hard "$UPGRADE_REF"
restore_environment

CURRENT_STEP='安装项目依赖'
echo '[5/8] 按锁文件安装项目依赖...'
pnpm install --frozen-lockfile --prod=false

echo '[6/8] 按编号执行业务迁移及依赖安装...'
# 扩展位置：新增 scripts/migrations/20-模块名.sh 等，无需修改 upgrade.sh。
# 此处在代码同步后读取列表，确保本次新发布的模块也能执行。
[[ -d scripts/migrations && ! -L scripts/migrations ]] || { echo '缺少普通目录 scripts/migrations。' >&2; exit 1; }
shopt -s nullglob
MIGRATION_STEPS=(scripts/migrations/[0-9][0-9]-*.sh)
shopt -u nullglob
(( ${#MIGRATION_STEPS[@]} > 0 )) || { echo '没有找到业务迁移步骤。' >&2; exit 1; }
for migration_step in "${MIGRATION_STEPS[@]}"; do
    CURRENT_STEP="业务迁移：$migration_step"
    [[ -f "$migration_step" && ! -L "$migration_step" ]] || { echo "迁移步骤必须是普通文件：$migration_step" >&2; exit 1; }
    echo "执行 $migration_step"
    bash "$migration_step"
done

CURRENT_STEP='构建生产版本'
echo '[7/8] 构建生产版本...'
pnpm build

CURRENT_STEP='启动商城'
echo '[8/8] 启动服务...'
bash ./start.sh
echo 'yxshop 迁移部署完成。后续日常升级执行 bash upgrade.sh。'
exit 0
}
