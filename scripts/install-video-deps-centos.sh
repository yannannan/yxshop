#!/usr/bin/env bash
# 仅安装视频提取依赖；不操作数据库、Nginx、Git 或商城启停。
set -Eeuo pipefail
umask 022
APP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
ENGINE="$APP_DIR/vendor/video-engine"
CHECK_ONLY=0
JOBS=2
BUILD_DIR=""
for argument in "$@"; do
    case "$argument" in
        --check) CHECK_ONLY=1 ;;
        --jobs=*) JOBS="${argument#*=}" ;;
        --help|-h) echo '用法：bash scripts/install-video-deps-centos.sh [--check] [--jobs=2]'; exit 0 ;;
        *) echo "未知参数：$argument" >&2; exit 2 ;;
    esac
done
[[ "$JOBS" =~ ^[1-8]$ ]] || { echo '--jobs 只能为 1～8' >&2; exit 2; }
fail() { echo "错误：$*" >&2; exit 1; }
trap 'echo "视频依赖安装失败（第 $LINENO 行）。未启动或停止商城；修复错误后可重跑。" >&2' ERR
[[ "$(uname -s)" == Linux ]] || fail '此脚本只适用于 CentOS / RHEL 系 Linux'
[[ "$(uname -m)" == x86_64 ]] || fail '本脚本目前适配 x86_64；不冒充 ARM64 / 32 位兼容'
[[ -r /etc/os-release ]] || fail '缺少 /etc/os-release'
# 发行版提供的本地系统文件，并非网页或用户输入。
. /etc/os-release
case "${ID:-}" in centos|rhel|rocky|almalinux) ;; *) fail "不支持的发行版：${ID:-unknown}" ;; esac
MAJOR="${VERSION_ID%%.*}"
case "$MAJOR" in 7|9|10) ;; *) fail "脚本适配 CentOS 7 与 Stream 9/10；当前版本：$VERSION_ID" ;; esac
NODE_BIN="${NODE_BIN:-$(command -v node || true)}"
[[ -n "$NODE_BIN" && -x "$NODE_BIN" ]] || fail '请先准备项目所需的 Node >=22.13；不会覆盖现有 Node'
"$NODE_BIN" -e 'const [a,b]=process.versions.node.split(".").map(Number); if(a<22||(a===22&&b<13))process.exit(1)' || fail 'Node 版本需 >=22.13'
cd "$APP_DIR"
ENV_ARGS=()
[[ ! -f .env.mysql ]] || ENV_ARGS=(--env-file=.env.mysql)
check_engines() {
    "$NODE_BIN" "${ENV_ARGS[@]}" scripts/setup-video-engine.mjs --check || return
    "$NODE_BIN" "${ENV_ARGS[@]}" scripts/check-video-link.mjs --runtime || return
}
if (( CHECK_ONLY )); then check_engines; exit 0; fi
echo '检查现有视频依赖...'
if check_engines; then
    echo '视频依赖已就绪，跳过重复安装。'
    exit 0
fi
[[ "$EUID" -eq 0 ]] || fail '首次安装系统库请使用 root 或 sudo bash 执行；商城进程不会被重启'
command -v pnpm >/dev/null || fail '未找到 pnpm；你现有的 pnpm 10.32.0 可直接沿用'
mkdir -p "$ENGINE"
[[ "$(readlink -f "$ENGINE")" == "$APP_DIR/vendor/video-engine" ]] || fail '引擎目录必须是项目内实际目录，不能使用链接'
exec 9>"$ENGINE/.install.lock"
flock -n 9 || fail '另一个视频依赖安装任务正在运行'
echo "[1/6] $PRETTY_NAME；Node $("$NODE_BIN" -v)；安装系统库（保持浏览器沙箱）"
PACKAGE_MANAGER=()
if [[ "$ID" == centos && "$MAJOR" == 7 ]]; then
    # CentOS 7 原 mirrorlist 已退役。镜像按优先级回退，仍校验官方 RPM 签名。
    KEY_DIR="$APP_DIR/scripts/keys"
    for key in RPM-GPG-KEY-CentOS-7 RPM-GPG-KEY-CentOS-SIG-SCLo; do
        [[ -r "$KEY_DIR/$key" ]] || fail "缺少官方公钥 scripts/keys/$key，请同步完整项目后重试"
    done
    (
        cd "$KEY_DIR"
        sha256sum --check --status <<'KEY_HASHES'
8b48b04b336bd725b9e611c441c65456a4168083c4febc28e88828d8ec14827f  RPM-GPG-KEY-CentOS-7
1402b1ea263cd0e51e7fe77c89ab98d64dd08fdc54e7a4afe27b2782ddfc351c  RPM-GPG-KEY-CentOS-SIG-SCLo
KEY_HASHES
    ) || fail '项目内 CentOS 公钥校验失败，请重新同步 scripts/keys，不能跳过签名验证'
    # 独立配置与缓存，不改 /etc/yum.repos.d 或复用全局失效仓库缓存。
    cat >"$ENGINE/centos7-video-yum.conf" <<REPOSITORIES
[main]
cachedir=$ENGINE/yum-cache/\$basearch/\$releasever
keepcache=0
debuglevel=2
gpgcheck=1
plugins=0
reposdir=/dev/null
sslverify=1
timeout=20
retries=2
[video-c7-base]
name=CentOS 7.9 archive base (video dependencies only)
failovermethod=priority
baseurl=https://mirrors.aliyun.com/centos-vault/7.9.2009/os/\$basearch/
        https://repo.huaweicloud.com/centos-vault/7.9.2009/os/\$basearch/
        https://vault.centos.org/7.9.2009/os/\$basearch/
enabled=1
gpgcheck=1
gpgkey=file://$KEY_DIR/RPM-GPG-KEY-CentOS-7
[video-c7-updates]
name=CentOS 7.9 archive updates (video dependencies only)
failovermethod=priority
baseurl=https://mirrors.aliyun.com/centos-vault/7.9.2009/updates/\$basearch/
        https://repo.huaweicloud.com/centos-vault/7.9.2009/updates/\$basearch/
        https://vault.centos.org/7.9.2009/updates/\$basearch/
enabled=1
gpgcheck=1
gpgkey=file://$KEY_DIR/RPM-GPG-KEY-CentOS-7
[video-c7-scl]
name=CentOS 7 SCL archive (C compiler for FFmpeg)
failovermethod=priority
baseurl=https://mirrors.aliyun.com/centos-vault/7.9.2009/sclo/\$basearch/rh/
        https://repo.huaweicloud.com/centos-vault/7.9.2009/sclo/\$basearch/rh/
        https://vault.centos.org/7.9.2009/sclo/\$basearch/rh/
enabled=1
gpgcheck=1
gpgkey=file://$KEY_DIR/RPM-GPG-KEY-CentOS-SIG-SCLo
REPOSITORIES
    echo 'CentOS 7 归档源：阿里云 → 华为云 → CentOS Vault；官方公钥校验已通过。'
    PACKAGE_MANAGER=(yum -c "$ENGINE/centos7-video-yum.conf")
elif command -v dnf >/dev/null; then
    PACKAGE_MANAGER=(dnf)
else
    PACKAGE_MANAGER=(yum)
fi
"${PACKAGE_MANAGER[@]}" install -y ca-certificates curl xz tar make gcc gcc-c++ pkgconfig gnupg2 util-linux \
    gtk3 glib2 nss dbus-glib libXt libX11-xcb libXcomposite libXdamage libXrandr alsa-lib \
    fontconfig dejavu-sans-fonts
if [[ "$MAJOR" == 7 ]]; then
    "${PACKAGE_MANAGER[@]}" install -y devtoolset-11-gcc devtoolset-11-gcc-c++
    # 只调整本脚本的编译器 PATH，不替换系统 gcc / glibc。
    export PATH="/opt/rh/devtoolset-11/root/usr/bin:$PATH"
    export LD_LIBRARY_PATH="/opt/rh/devtoolset-11/root/usr/lib64:${LD_LIBRARY_PATH:-}"
fi
echo '[2/6] 按项目锁文件安装 JavaScript 依赖'
pnpm install --frozen-lockfile --prod=false
echo '[3/6] 检查 / 安装官方 yt-dlp（已可用则保留，下载校验 SHA256）'
"$NODE_BIN" scripts/setup-video-engine.mjs
echo '[4/6] 准备 Linux FFmpeg（从签名源码本机编译，兼容当前 glibc）'
FFMPEG_VERSION=9.0.2
if [[ -x "$ENGINE/ffmpeg" ]] && "$ENGINE/ffmpeg" -version >/dev/null 2>&1; then
    echo '保留项目中已经可运行的 FFmpeg。'
else
    BUILD_DIR="$(mktemp -d "$ENGINE/.ffmpeg-build.XXXXXX")"
    cleanup_build() {
        [[ -n "$BUILD_DIR" && -d "$BUILD_DIR" ]] || return 0
        local actual
        actual="$(readlink -f "$BUILD_DIR")"
        case "$actual" in "$ENGINE"/.ffmpeg-build.*) rm -rf -- "$actual" ;; *) echo '跳过不安全的临时目录清理' >&2 ;; esac
    }
    trap cleanup_build EXIT
    download() { curl --fail --location --show-error --retry 3 --connect-timeout 20 --max-time 600 --proto '=https' --proto-redir '=https' "$1" -o "$2"; }
    download "https://ffmpeg.org/releases/ffmpeg-$FFMPEG_VERSION.tar.xz" "$BUILD_DIR/source.tar.xz"
    download "https://ffmpeg.org/releases/ffmpeg-$FFMPEG_VERSION.tar.xz.asc" "$BUILD_DIR/source.tar.xz.asc"
    download 'https://ffmpeg.org/ffmpeg-devel.asc' "$BUILD_DIR/release-key.asc"
    mkdir -m 700 "$BUILD_DIR/gnupg"
    gpg --batch --homedir "$BUILD_DIR/gnupg" --import "$BUILD_DIR/release-key.asc"
    gpg --batch --homedir "$BUILD_DIR/gnupg" --status-fd 1 --verify "$BUILD_DIR/source.tar.xz.asc" "$BUILD_DIR/source.tar.xz" >"$BUILD_DIR/signature.txt"
    grep -q '^\[GNUPG:\] VALIDSIG FCF986EA15E6E293A5644F10B4322F04D67658D8 ' "$BUILD_DIR/signature.txt" || fail 'FFmpeg 官方签名指纹不匹配'
    tar -xJf "$BUILD_DIR/source.tar.xz" --no-same-owner -C "$BUILD_DIR"
    (
        cd "$BUILD_DIR/ffmpeg-$FFMPEG_VERSION"
        # 仅本地媒体处理；禁用网络、外部自动探测和汇编依赖，不需要 Docker。
        ./configure --disable-network --disable-autodetect --disable-doc --disable-debug \
            --disable-x86asm --disable-ffplay --disable-ffprobe --extra-cflags=-O2
        make -j"$JOBS"
        ./ffmpeg -version
        ./ffmpeg -nostdin -hide_banner -loglevel error -f lavfi -i 'color=c=black:s=32x32:r=1' \
            -f lavfi -i 'anullsrc=r=44100:cl=mono' -t 1 -c:v mpeg4 -c:a aac "$BUILD_DIR/verify.mp4"
        ./ffmpeg -nostdin -hide_banner -loglevel error -i "$BUILD_DIR/verify.mp4" -map 0:v:0 -map 0:a:0 -f null -
        # 先在原位检查后原子替换，失败时不破坏旧引擎。
        install -m 755 ffmpeg "$ENGINE/ffmpeg.new"
        mv -f "$ENGINE/ffmpeg.new" "$ENGINE/ffmpeg"
    )
    cleanup_build
    BUILD_DIR=""
fi
echo '[5/6] 准备 Mozilla Firefox 原生兼容引擎（复用已安装版本缓存）'
export YX_VIDEO_WORKER=yxshop-video
if ! id "$YX_VIDEO_WORKER" >/dev/null 2>&1; then
    useradd --system --no-create-home --home-dir /nonexistent --shell /sbin/nologin "$YX_VIDEO_WORKER"
fi
[[ "$(id -u "$YX_VIDEO_WORKER")" -gt 0 ]] || fail '解析账号不能是 root'
RUNTIME_BACKUP="$(mktemp "$ENGINE/.browser-runtime-backup.XXXXXX")"
HAD_RUNTIME=0
if [[ -f "$ENGINE/browser-runtime.json" ]]; then cp -p "$ENGINE/browser-runtime.json" "$RUNTIME_BACKUP"; HAD_RUNTIME=1; fi
restore_runtime() {
    if (( HAD_RUNTIME )); then cp -p "$RUNTIME_BACKUP" "$ENGINE/browser-runtime.json"; else rm -f -- "$ENGINE/browser-runtime.json"; fi
    rm -f -- "$RUNTIME_BACKUP"
}
if ! "$NODE_BIN" scripts/setup-video-engine.mjs --browser --firefox; then restore_runtime; fail 'Firefox 安装失败，已恢复原浏览器运行记录'; fi
echo '[6/6] 检查二进制版本和实际浏览器启动（不解析网站、不扣费）'
if ! check_engines; then restore_runtime; fail '依赖自检失败，已恢复原浏览器运行记录；请保留上方具体错误'; fi
rm -f -- "$RUNTIME_BACKUP"
echo '视频提取依赖安装及启动检查通过。'
echo '继续你原来的项目构建 / 启动流程即可；本脚本没有操作数据库、Nginx 或商城启停。'
echo '以后检查：bash scripts/install-video-deps-centos.sh --check'
