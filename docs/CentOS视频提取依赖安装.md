# CentOS 视频提取依赖安装（2026-10-24）

用户现有服务器：CentOS 7.9、x86_64、Linux 3.10、glibc 2.17、Node 22.22.3（`/usr/local/bin/node`）、pnpm 10.32.0。按用户要求保留原生部署，不安装 Docker；本脚本只准备链接视频提取依赖，不发布 / 启停商城，不执行 SQL，不修改 Nginx、系统 Git、现有 Node 或系统 glibc。

## 部署时执行

按用户最新要求，`upgrade.sh` 已恢复原来的直线升级流程，只保留 `bash upgrade.sh` 一个入口：停止服务 → 获取代码 → `git reset --hard origin/main` 同步 → 安装项目依赖 → **调用一次独立 video sh** → 构建 → 启动。已移除仅拉代码模式、升级入口中的系统判断 / 视频自检 / 安装分支和生成文件备份等额外流程。仍使用实际发布分支 `main`，不恢复 777 权限。

所有视频检测与安装都在 `scripts/install-video-deps-centos.sh` 内。该脚本默认先自检：依赖已就绪则直接退出，不重复安装；未就绪才进入安装。因此日常只运行 `bash upgrade.sh` 即可，不需要另选参数或手工选择安装方式。首轮仍必须先将本地 `main` 推送 / 同步到服务器可访问的代码源。

视频脚本失败时，升级入口保留明确错误提示，随后继续构建并启动商城；结尾显示“商城已启动；视频依赖未就绪”，不会把视频安装失败报告成完全成功。项目依赖安装、拉取 / 同步、构建或启动本身失败仍按原方式中断，没有自动回滚。原有强制同步会覆盖已跟踪文件的本地修改；`.env.mysql` 和未跟踪的上传文件不会被主动清理。升级不执行数据库迁移。

先把本轮最新代码和锁文件同步到服务器的项目目录，再以 root 执行：

```bash
cd /home/www/yxshop/yxshopdev
bash scripts/install-video-deps-centos.sh
```

运行位置不受当前目录影响，脚本会自行定位项目。依赖已通过自检时直接跳过安装。首次安装会下载系统包、浏览器和源码并编译 FFmpeg，需要等待，默认最多使用 2 个编译进程。内存较小时可以执行 `bash scripts/install-video-deps-centos.sh --jobs=1`。

安装完成后继续原来的项目构建与启动流程。后续发布一般不需要重新安装系统依赖；新增 npm / pnpm 锁文件仍应随版本正常安装。只检查现有依赖：

```bash
bash scripts/install-video-deps-centos.sh --check
```

脚本失败会返回非零状态，不输出“已完成”，也不会以禁用沙箱或 TLS 校验来掩盖问题。需要能够连接 CentOS 归档源、npm、GitHub、Mozilla 和 FFmpeg 官网。网络受限时保留具体失败输出，以便针对实际来源处理，不是重新执行数据库初始化。

## 自动处理的内容

1. 检测系统、x86_64 架构及 Node >=22.13，保留现有 Node 和 pnpm。脚本目标为 CentOS 7 与 Stream 9/10；其他架构和退役的 CentOS Linux 8 暂不自动安装。
2. 安装 Firefox 需要的 GTK / NSS / 字体等系统库。CentOS 7 使用官方 7.9 归档源及 GPG 校验，配置仅在项目 `vendor/video-engine/centos7-video-yum.conf`，不覆盖 `/etc/yum.repos.d`，也不依赖已经失效的 `mirrorlist.centos.org` 和原 SCL 仓库配置。
3. 按项目 `pnpm-lock.yaml` 安装依赖，下载官方 yt-dlp Linux 独立程序并验证发布者 SHA256。
4. 若项目已有可运行的 Linux FFmpeg，保留它；否则从 FFmpeg 官网下载 9.0.2 源码和 PGP 签名，核对固定的官方发布公钥指纹后本机编译。CentOS 7 使用归档的 devtoolset-11 编译器，不替换系统 gcc / glibc。构建禁用网络及外部自动依赖，验证 MP4 音视频生成和解码后原子安装到项目；不依赖仅适配新 glibc 的 Linux 预编译包，也不下载长期未维护的旧静态版本。
5. 安装与锁定 Puppeteer 匹配的 Mozilla 官方 Firefox，使用 WebDriver BiDi；不在 CentOS 7 上硬装新版 Playwright Chromium。Firefox 当前 x64 官方要求 glibc >=2.17，还需要 GTK >=3.14、glib >=2.42 等库，均由脚本准备。保留已有 Chromium 代码路线，Windows 等其他环境仍可继续原方案。
6. 创建无登录权限的专用 `yxshop-video` 账号。若商城仍由 root 启动，仅 Firefox 经 `runuser` 切到该账号，匿名档案单独归属此账号，保持浏览器沙箱；不会强迫用户改整个商城的启动账号。浏览器默认无账号、无历史 Cookie，所有媒体请求仍经过公网校验代理，禁止本机 / 内网目标及直接连接回退。
7. 实际执行 yt-dlp、FFmpeg 版本检查，并用匿名 Firefox 打开 `about:blank` 执行脚本再关闭，确认浏览器能启动；该检查不解析真实站点、不连接业务数据库、不扣积分。

二进制、编译缓存、临时文件和 `browser-runtime.json` 都在被 Git 忽略的 `vendor/video-engine/`。不要将 Windows 的二进制或路径记录覆盖到 Linux；不要给该目录设置 777。`.env.mysql` 中 `VIDEO_BROWSER_PATH` 留空时，应用自动读取当前机器的安装记录，无需手动填 Firefox 路径。若以前手填了 Windows / 失效的引擎路径，需清空相应 VIDEO 路径或填写真实 Linux 路径，否则检查会明确失败；脚本不悄悄改业务环境文件。

## 验收与边界

本轮在 Windows 上通过新 Firefox 后端实际提取并下载抖音公开作品 `7692515320217407402`，无需抖音登录。另有模拟 CentOS / root 账号、代理、失败清理、权限限制和跨系统路径的回归检查，以及 Bash 语法检查。

助手没有连接用户服务器执行系统安装，尚未在用户这台 CentOS 7 / 3.10 内核上实机验收。最终以脚本在服务器上的系统库安装、FFmpeg 编译和实际 Firefox 启动检查结果为准；不能将本地下载成功说成服务器部署已经成功。

依赖安装不需要新 SQL。已有站点的视频业务表仍沿用 `sql/08_video_extractor_20261024003237.sql`，仅未执行过时按原迁移说明补齐。依赖通过不代表所有平台都能提取：源站的公开权限、地区和访问验证仍适用。

参考：[Firefox 系统要求](https://www.firefox.com/en-US/firefox/system-requirements/)、[Puppeteer Firefox / BiDi](https://pptr.dev/faq)、[FFmpeg 官方下载及签名](https://ffmpeg.org/download.html)、[yt-dlp Linux 独立版本](https://github.com/yt-dlp/yt-dlp#release-files)。
