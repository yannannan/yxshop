# CentOS 视频提取依赖安装（2026-10-24）

用户现有服务器：CentOS 7.9、x86_64、Linux 3.10、glibc 2.17、Node 22.22.3（`/usr/local/bin/node`）、pnpm 10.32.0。按用户要求保留原生部署，不安装 Docker；本脚本只准备链接视频提取依赖，不发布 / 启停商城，不执行 SQL，不修改 Nginx、系统 Git、现有 Node 或系统 glibc。

2026-10-24 用户最新服务器日志已确认 `origin/master` 同步、pnpm 安装、生产构建和商城启动成功（PID 13365、端口 3000）；视频安装尚未完成，停在官方归档源 `vault.centos.org` 返回 403。pnpm 的依赖脚本警告与构建耗时提示没有阻止本次构建，不将它们当作本次安装失败原因。

## 部署时执行

`upgrade.sh` 只保留 `bash upgrade.sh` 一个入口：获取代码并验证同步分支 → 停止服务 → `git reset --hard` 同步目标分支 → 安装项目依赖 → **调用一次独立 video sh** → 构建 → 启动。分支不再固定为 `origin/main`：优先使用当前分支配置的 `origin` 上游；没有上游时使用 `origin/当前分支名`，兼容本地 `main` 与用户服务器的 `master`。游离 HEAD、跟踪其他远程、拉取失败或远程分支不存在时在停服前退出。仍沿用原来的强制同步，不增加第二种升级模式或视频安装逻辑，不恢复 777 权限。

所有视频检测与安装都在 `scripts/install-video-deps-centos.sh` 内。该脚本默认先自检：依赖已就绪则直接退出，不重复安装；未就绪才进入安装。因此日常只运行 `bash upgrade.sh` 即可，不需要另选参数或手工选择安装方式。首轮仍必须先将新代码推送 / 同步到服务器可访问的代码源；本地开发验收分支为 `main`，服务器目前从本机 SSH Git 仓库的 `master` 发布，两处名称不必一致。

若服务器仍是固定 `origin/main` 的旧脚本，出现本次日志中的 `unknown revision`，说明它已停止服务但尚未同步工作区。可先执行 `bash ./start.sh` 恢复旧商城；在该服务器项目目录临时修正旧入口后重试：

```bash
sed -i.bak 's@origin/main@origin/master@g' upgrade.sh
bash upgrade.sh
```

这条修正仅适用于日志已确认远程发布分支为 `master` 的这台服务器。首次重跑仍按旧脚本顺序停服；新版入口同步到位后，后续升级会自动识别分支并先完成拉取 / 检查。新代码需先同步到服务器的 `origin/master`，本地提交不等于服务器已更新。

视频脚本失败时，升级入口保留明确错误提示，随后继续构建并启动商城；结尾显示“商城已启动；视频依赖未就绪”，不会把视频安装失败报告成完全成功。项目依赖安装、拉取 / 同步、构建或启动本身失败仍按原方式中断，没有自动回滚。原有强制同步会覆盖已跟踪业务代码的本地修改；新版在 reset 前私有备份 `.env.local` / `.env.mysql`，之后恢复，兼容从旧跟踪配置迁移到忽略配置。实际环境文件不再提交 Git，未跟踪上传文件保留，升级不执行数据库迁移。旧服务器首次需先获取新版入口，步骤见 [Git 密钥拦截与环境配置](Git密钥拦截与环境配置.md)。

先把本轮最新代码和锁文件同步到服务器的项目目录，再以 root 执行：

```bash
cd /home/www/yxshop/yxshopdev
bash scripts/install-video-deps-centos.sh
```

运行位置不受当前目录影响，脚本会自行定位项目。依赖已通过自检时直接跳过安装。首次安装会下载系统包、浏览器和源码并编译 FFmpeg，需要等待，默认最多使用 2 个编译进程。内存较小时可以执行 `bash scripts/install-video-deps-centos.sh --jobs=1`。

针对本次 403，已将基础、更新、SCL 三个仓库均改为 HTTPS 多地址：阿里云归档 → 华为云归档 → CentOS 官方 Vault，由 yum 的 `failovermethod=priority` 按顺序回退。独立配置和缓存均留在项目 `vendor/video-engine/`，不需要修改系统 yum 仓库或执行全局清理。两份官方 RPM 公钥位于 `scripts/keys/`，随完整项目同步；安装前先校验固定 SHA256，再由 yum 校验 RPM 签名，避免额外访问公钥网站。公钥缺失 / 被修改会在安装系统包前退出，不禁用 TLS 或 GPG 校验。

商城已经启动时，先同步本次完整修复（包括 `scripts/keys/`），再单独运行视频安装脚本即可补装；它不会停止商城，也不需要重新构建或执行 SQL。日常发布继续使用原来的 `bash upgrade.sh`，仍只调用同一个独立视频脚本。

安装完成后继续原来的项目构建与启动流程。后续发布一般不需要重新安装系统依赖；新增 npm / pnpm 锁文件仍应随版本正常安装。只检查现有依赖：

```bash
bash scripts/install-video-deps-centos.sh --check
```

脚本失败会返回非零状态，不输出“已完成”，也不会以禁用沙箱或 TLS 校验来掩盖问题。需要能够连接 CentOS 归档源、npm、GitHub、Mozilla 和 FFmpeg 官网。网络受限时保留具体失败输出，以便针对实际来源处理，不是重新执行数据库初始化。

## 自动处理的内容

1. 检测系统、x86_64 架构及 Node >=22.13，保留现有 Node 和 pnpm。脚本目标为 CentOS 7 与 Stream 9/10；其他架构和退役的 CentOS Linux 8 暂不自动安装。
2. 安装 Firefox 需要的 GTK / NSS / 字体等系统库。CentOS 7 使用阿里云 / 华为云 / 官方 7.9 归档源按顺序回退，使用随项目提供且已验证的官方公钥进行 RPM 签名校验。配置仅在项目 `vendor/video-engine/centos7-video-yum.conf`，缓存也独立存放，不覆盖 `/etc/yum.repos.d`，不依赖已经失效的 `mirrorlist.centos.org` 和原 SCL 仓库配置。
3. 按项目 `pnpm-lock.yaml` 安装依赖，下载官方 yt-dlp Linux 独立程序并验证发布者 SHA256。
4. 若项目已有可运行的 Linux FFmpeg，保留它；否则从 FFmpeg 官网下载 9.0.2 源码和 PGP 签名，核对固定的官方发布公钥指纹后本机编译。CentOS 7 使用归档的 devtoolset-11 编译器，不替换系统 gcc / glibc。构建禁用网络及外部自动依赖，验证 MP4 音视频生成和解码后原子安装到项目；不依赖仅适配新 glibc 的 Linux 预编译包，也不下载长期未维护的旧静态版本。
5. 安装与锁定 Puppeteer 匹配的 Mozilla 官方 Firefox，使用 WebDriver BiDi；不在 CentOS 7 上硬装新版 Playwright Chromium。Firefox 当前 x64 官方要求 glibc >=2.17，还需要 GTK >=3.14、glib >=2.42 等库，均由脚本准备。保留已有 Chromium 代码路线，Windows 等其他环境仍可继续原方案。
6. 创建无登录权限的专用 `yxshop-video` 账号。若商城仍由 root 启动，仅 Firefox 经 `runuser` 切到该账号，匿名档案单独归属此账号，保持浏览器沙箱；不会强迫用户改整个商城的启动账号。浏览器默认无账号、无历史 Cookie，所有媒体请求仍经过公网校验代理，禁止本机 / 内网目标及直接连接回退。
7. 实际执行 yt-dlp、FFmpeg 版本检查，并用匿名 Firefox 打开 `about:blank` 执行脚本再关闭，确认浏览器能启动；该检查不解析真实站点、不连接业务数据库、不扣积分。

二进制、编译缓存、临时文件和 `browser-runtime.json` 都在被 Git 忽略的 `vendor/video-engine/`。不要将 Windows 的二进制或路径记录覆盖到 Linux；不要给该目录设置 777。`.env.mysql` 中 `VIDEO_BROWSER_PATH` 留空时，应用自动读取当前机器的安装记录，无需手动填 Firefox 路径。若以前手填了 Windows / 失效的引擎路径，需清空相应 VIDEO 路径或填写真实 Linux 路径，否则检查会明确失败；脚本不悄悄改业务环境文件。

## 验收与边界

本轮在 Windows 上通过新 Firefox 后端实际提取并下载抖音公开作品 `7692515320217407402`，无需抖音登录。另有模拟 CentOS / root 账号、代理、失败清理、权限限制和跨系统路径的回归检查，以及 Bash 语法检查。

助手没有连接用户服务器执行系统安装，尚未在用户这台 CentOS 7 / 3.10 内核上实机验收。最终以脚本在服务器上的系统库安装、FFmpeg 编译和实际 Firefox 启动检查结果为准；不能将本地下载成功说成服务器部署已经成功。

本次 403 修复：在当前 Windows 环境通过实际 HTTPS 请求读取了阿里云和华为云各三个仓库的 `repomd.xml`，六个均返回有效仓库元数据；两份公钥的 OpenPGP v4 指纹与 CentOS 官方发布值一致。14 项隔离 Git / Bash / video 回归通过，新增检查真实脚本生成的多地址配置、本地公钥验证、缺失 / 损坏公钥拒绝安装、yum 失败保留现有引擎且不操作商城。实际 yum 由替身拦截，没有安装当前主机或服务器的软件包；这些检查不等于用户服务器上的安装已通过。

依赖安装不需要新 SQL。已有站点的视频业务表仍沿用 `sql/08_video_extractor_20261024003237.sql`，仅未执行过时按原迁移说明补齐。依赖通过不代表所有平台都能提取：源站的公开权限、地区和访问验证仍适用。

参考：[Firefox 系统要求](https://www.firefox.com/en-US/firefox/system-requirements/)、[Puppeteer Firefox / BiDi](https://pptr.dev/faq)、[FFmpeg 官方下载及签名](https://ffmpeg.org/download.html)、[yt-dlp Linux 独立版本](https://github.com/yt-dlp/yt-dlp#release-files)。

本次归档源与公钥：[阿里云 CentOS 7.9 归档](https://mirrors.aliyun.com/centos-vault/7.9.2009/)、[华为云 CentOS 7.9 归档](https://repo.huaweicloud.com/centos-vault/7.9.2009/)、[CentOS 官方公钥与指纹](https://www.centos.org/keys/)。
