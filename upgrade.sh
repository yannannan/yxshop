#!/usr/bin/env bash
set -Eeuo pipefail

main() {
    local app_dir branch=main pull_only=0 argument node_bin git_dir
    app_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
    for argument in "$@"; do
        case "$argument" in
            --pull-only) pull_only=1 ;;
            --help|-h) echo '用法：bash upgrade.sh [--pull-only]（从 origin/main 更新）'; return 0 ;;
            *) echo "未知参数：$argument" >&2; return 2 ;;
        esac
    done
    cd "$app_dir"
    command -v git >/dev/null || { echo '未找到 Git' >&2; return 1; }
    [[ -z "$(git rev-parse --show-prefix)" ]] || { echo 'upgrade.sh 必须位于项目 Git 根目录' >&2; return 1; }
    [[ -n "$(git symbolic-ref --quiet --short HEAD)" ]] || { echo '当前为游离 HEAD，请先切回部署分支' >&2; return 1; }
    git_dir="$(git rev-parse --git-dir)"
    command -v flock >/dev/null || { echo '缺少 flock，请安装 util-linux' >&2; return 1; }
    exec 9>"$git_dir/yxshop-upgrade.lock"
    flock -n 9 || { echo '另一个升级任务正在执行' >&2; return 1; }

    # 本地业务代码必须先保存；环境文件、上传文件不作清理。
    local -a source_paths=(. ':(exclude)dist' ':(exclude).next' ':(exclude).vinext' ':(exclude)tsconfig.tsbuildinfo')
    # 兼容旧脚本 chmod 777 留下的执行位差异，只忽略模式位，仍检查文件内容。
    if ! git -c core.filemode=false diff --quiet HEAD -- "${source_paths[@]}"; then
        echo '存在本地业务代码修改，已停止升级；请先提交或备份这些修改：' >&2
        git -c core.filemode=false diff --name-only HEAD -- "${source_paths[@]}"
        return 1
    fi
    if (( ! pull_only )); then
        node_bin="${NODE_BIN:-$(command -v node || true)}"
        [[ -n "$node_bin" && -x "$node_bin" ]] || { echo '未找到可用 Node' >&2; return 1; }
        command -v pnpm >/dev/null || { echo '未找到 pnpm' >&2; return 1; }
        [[ -f .env.mysql ]] || { echo '缺少 .env.mysql，请保留服务器环境配置' >&2; return 1; }
    fi

    echo '[1/6] 拉取 origin/main（此时商城继续运行）...'
    git fetch --no-tags origin "refs/heads/$branch:refs/remotes/origin/$branch"
    git merge-base --is-ancestor HEAD "refs/remotes/origin/$branch" || {
        echo '本地与 origin/main 已分叉，未覆盖本地提交，也未停止商城；请先处理分支差异。' >&2
        return 1
    }
    # 类型生成文件 / 开发锁 / 编译缓存不参与生产运行，保存补丁后恢复。
    # 不重置 dist；若运行产物与远端冲突，Git 会拒绝合并而保留当前服务。
    local generated_patch path
    if ! git diff --quiet HEAD -- .next .vinext tsconfig.tsbuildinfo; then
        generated_patch="$(mktemp "$git_dir/yxshop-generated-backup.XXXXXX.patch")"
        git diff --binary HEAD -- .next .vinext tsconfig.tsbuildinfo >"$generated_patch"
        echo "生成文件的原改动已备份：$generated_patch"
        for path in .next .vinext tsconfig.tsbuildinfo; do
            if [[ -n "$(git ls-files -- "$path")" ]]; then git checkout HEAD -- "$path"; fi
        done
    fi
    git -c core.filemode=false merge --ff-only "refs/remotes/origin/$branch"
    if (( pull_only )); then
        echo '最新 main 代码已拉取。本次未安装依赖、构建或重启。'
        return 0
    fi

    # 流程放在函数内，拉取时即使 upgrade.sh 自身更新，也使用已解析的当前流程。
    trap 'echo "升级失败（第 $LINENO 行）；请保留上方错误。若服务已停止，修复后重跑 bash upgrade.sh。" >&2' ERR
    echo '[2/6] 停止商城服务...'
    bash "$app_dir/stop.sh"
    echo '[3/6] 安装锁定的项目依赖...'
    pnpm install --frozen-lockfile --prod=false
    echo '[4/6] 检查视频提取依赖...'
    local ID='' VERSION_ID=''
    if [[ -r /etc/os-release ]]; then . /etc/os-release; fi
    case "$ID" in
        centos|rhel|rocky|almalinux)
            if NODE_BIN="$node_bin" bash "$app_dir/scripts/install-video-deps-centos.sh" --check; then
                echo '视频依赖已就绪，跳过重复安装。'
            else
                echo '视频依赖未就绪，执行独立安装插件...'
                NODE_BIN="$node_bin" bash "$app_dir/scripts/install-video-deps-centos.sh"
            fi
            ;;
        *) echo '当前不是 CentOS 系，沿用已配置的视频运行环境。' ;;
    esac
    echo '[5/6] 构建生产版本...'
    pnpm build
    echo '[6/6] 启动商城服务...'
    # 后台服务不能继承升级锁，否则会阻挡下一次升级。
    NODE_BIN="$node_bin" bash "$app_dir/start.sh" 9>&-
    trap - ERR
    echo "yxshop 升级完成：$(git rev-parse --short HEAD)"
}

main "$@"
