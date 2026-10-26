# 业务迁移步骤

`migration_upgrade.sh` 在拉取代码、安装项目依赖之后，构建启动之前，按文件名顺序执行本目录的 `两位数字-模块名.sh`。

- `10-video-deps.sh`：调用 `bash scripts/install-video-deps-centos.sh`，安装或复用视频依赖。
- `20-site-analysis.sh`：只检查站长分析的项目依赖，并提示按顺序执行10号站长分析、11号站点管理增量SQL；不连接数据库或自动执行SQL。接入步骤见 `docs/站点管理与统计接入.md`。
- 新增模块可添加 `20-example-deps.sh`、`30-example-setup.sh` 等，统一由迁移入口调用。
- 每个步骤应先检测已有状态，支持重复执行；成功返回 0，失败返回非 0。失败会中断部署，修复后重跑入口。
- 脚本通过自身路径定位项目，遵守项目环境文件保护约定，不在输出中打印密钥。不将其他服务器的视频二进制提交到 Git。
- 本目录不由日常 `upgrade.sh` 调用。添加文件不会让日常升级自动安装业务依赖。

以下为新步骤的基本结构：

```bash
#!/usr/bin/env bash
set -Eeuo pipefail
APP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)"
cd "$APP_DIR"
# 检查并准备当前模块所需依赖。
```
