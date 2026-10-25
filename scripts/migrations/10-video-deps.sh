#!/usr/bin/env bash
# 视频迁移步骤：首次安装系统库和引擎，已就绪时由原安装脚本直接复用。
set -Eeuo pipefail
APP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)"
cd "$APP_DIR"
bash scripts/install-video-deps-centos.sh
