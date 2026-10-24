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

## FFmpeg 慢速下载补装

2026-10-24 用户进一步贴出 curl 日志：11.4MiB 文件平均约14KiB/s，下载到72%时满600秒中断，提示 `Throwing away 8719802 bytes`，之后从头下载。这对应独立sh第4/6步的FFmpeg源码，不是已经修复的yt-dlp下载；按该速度下载完整源码约需14分钟，旧600秒上限不足。

最新sh通过 `scripts/lib/video-download.sh` 下载FFmpeg三份文件，移除600秒总时长和旧curl内建retry；使用CentOS 7 curl 7.29已有的 `--continue-at -`，每轮重试按实际磁盘长度续传，连接超时20秒，连续120秒低于1字节/秒才中断。每次最多3轮，网络失败保留 `.part`，成功缓存源文件；编译临时目录另行清理，不删除下载进度或完整源码。HTTPS / 证书校验继续开启，续传被源站拒绝时安全重下，空响应 / 大小超限不会当成成功。所有缓存、离线文件在编译前都要通过GPG签名和固定官方指纹 `FCF986EA15E6E293A5644F10B4322F04D67658D8`；验证失败停止编译，清除未通过的三份下载缓存，保留原FFmpeg程序。

本机准备了被Git忽略的 `vendor/video-engine/offline-bundles/ffmpeg-centos-source-9.0.2.tar.gz`。先将本次完整代码同步到服务器（包括新helper文件），结束仍在运行的旧安装，再把包上传到服务器项目根目录，执行：

```bash
cd /home/www/yxshop/yxshopdev
tar -xzf ffmpeg-centos-source-9.0.2.tar.gz
bash upgrade.sh
```

`upgrade.sh`仍仅调用一次原独立video sh，之后继续构建并启动商城；只需补装且商城已正常运行时，继续使用 `bash scripts/install-video-deps-centos.sh`。解包后文件为：

```text
vendor/video-engine/downloads/ffmpeg/9.0.2/ffmpeg-9.0.2.tar.xz
vendor/video-engine/downloads/ffmpeg/9.0.2/ffmpeg-9.0.2.tar.xz.asc
vendor/video-engine/downloads/ffmpeg/9.0.2/ffmpeg-devel.asc
```

压缩包SHA256：`adfc22343248c7a83ec9fb15c54e19ee5acf56fdd3c696c892da8829f4180bd3`；源码12040788字节，SHA256：`8c3850283eb25fa026482078a04051e0be17347b09ef81a0849bec15a96e002e`。包内仅上述三个普通文件，重新读包核对路径与摘要。本机访问FFmpeg官网时，系统DNS返回172.29.0.67，两个公共DNS均返回另一公网地址；不据此推断用户服务器DNS有问题，不修改系统DNS。此次源码通过MacPorts分发镜像获取，签名和公钥取自FFmpeg官方网站，再由本机GPG实际验证源码并匹配脚本固定指纹；未替换为其他版本或未经验证的构建。验证方法参见 [FFmpeg官方说明](https://www.ffmpeg.org/download.html)，curl兼容选项参见 [curl 7.29官方手册](https://github.com/curl/curl/blob/curl-7_29_0/docs/curl.1)。安装脚本本身仍从FFmpeg官网获取新下载文件，离线包可绕过这次源码下载。

本次53项下载 / 升级 / CentOS回归、修改测试ESLint和两份Bash脚本语法检查通过，新增检查覆盖中断重试、跨进程续传、缓存复用、源站拒绝续传、空文件 / 大小限制、签名 / 指纹失败不编译及编译失败缓存保留。测试使用替身网络 / 编译器，不安装系统包、不运行真实业务或SQL；实际PGP验证单独完成。此包仅含源码 / 签名 / 公钥，仍需在用户CentOS上编译，后续Firefox安装和实际启动仍以服务器验收为准。修复按约定提交并合并本地main，不自动推送。

### 已解压仍下载：核对升级覆盖

用户已贴出两个离线包在服务器项目根目录并分别解压成功，后续不能继续当成“没上传 / 没解压”。本地源码核对确认，`upgrade.sh`会先fetch再reset远程发布分支，随后执行工作区的video sh。如果服务器远程master未包含6aaeb51，即便手动覆盖本地新版sh，也可能在升级时被旧远程代码覆盖；忽略目录vendor中的离线文件仍在，但旧脚本不读取该缓存。本次没有服务器远程文件输出，不能把“远程仍旧”表述为已实机证实。

为在同步发布分支前先完成补装，已准备本机忽略产物 `vendor/video-engine/offline-bundles/video-installer-fix-6aaeb51.tar.gz`（5860字节），只含最新 `scripts/install-video-deps-centos.sh` 和 `scripts/lib/video-download.sh`，LF换行。两个脚本逐字节与本地对应版本一致（只规范换行），Bash语法检查通过，不含环境文件或业务代码。SHA256：`e0b869d847b0e5fa4e386a2e2bafc340a33732fa15b10afec94ef78a5306f320`。

先结束仍运行的旧安装。把脚本更新包上传到服务器项目根目录，然后执行；此时不经过Git拉取 / reset：

```bash
cd /home/www/yxshop/yxshopdev
tar -xzf video-installer-fix-6aaeb51.tar.gz
bash scripts/install-video-deps-centos.sh
```

FFmpeg阶段应复用此前已解压的三个文件，然后签名验证、编译；不需重新传或解压源码包。Firefox首次未安装时仍需下载，这是另一阶段。之后应将6aaeb51及后续修复同步到服务器实际使用的远程master，再恢复日常 `bash upgrade.sh`。独立补装不构建 / 启停商城；若之前中断升级停了商城，完成补装后按原构建 / 启动流程恢复。本包只为解决本次旧脚本补装，不增加新的upgrade参数或入口。

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

2026-10-24 用户最新完整日志进一步确认：系统库和 devtoolset 已安装，当前失败发生在第3/6步下载 yt-dlp 2026.10.21，原脚本超过120秒中断；FFmpeg / Firefox 后续步骤尚未执行。商城仍完成构建并启动（PID14682），所以反复进入补装的原因是依赖安装未完成。日志中的 `No package libX11-xcb available` 未使本轮 yum 退出，不是本次中止位置。

用户后续日志显示，即使将下载上限改为600秒，慢速链路仍可能只收到5MB便超时，旧重试会重新从头开始。最新修复使用稳定的版本级 `.part` 断点文件，重试 / 再次执行按已有长度发送 Range；仅在连接响应超过60秒或连续120秒没有收到数据时中断，持续接收数据不再受600秒总时长限制。最多尝试3次，失败后仍保留已写入断点。官方地址返回206时核对 Content-Range 起点、总大小和响应长度再追加；忽略Range返回200时重新写入完整文件，避免重复拼接；摘要错误的完整文件删除，不能执行。

已可运行的 yt-dlp 直接保留，不下载或自动更新；缺失时流式下载，优先使用 GitHub 官方资产 API 的二进制接口，官方发行地址作为回退，不使用第三方下载代理或关闭 TLS 校验。下载必须通过同一发行版本 SHA256 / 长度校验，并验证版本命令能运行后，才原子替换目标。小型元数据 / 校验清单也重试。

版本、清单和已校验下载保存在 `vendor/video-engine/downloads/yt-dlp/`；重跑复用完整缓存或同版本断点，旧引擎保留。版本自检超时为30秒，失败会显示检查路径及错误代码，便于区分缺文件和启动异常。FFmpeg 继续保留现有可运行文件，Firefox 安装器复用本机对应版本缓存。不要同时运行两个安装进程；当前正在运行的旧脚本不会自动加载新下载逻辑，需先结束该次安装再同步代码、重跑。

同步本次完整代码后，可只执行下面命令补装，不需要再次停止已经启动的商城：

```bash
bash scripts/install-video-deps-centos.sh
```

如果服务器始终无法下载 GitHub 文件，可在能访问官方发行页的电脑取得**同一版本**的 Linux x64 `yt-dlp_linux` 和 `SHA2-256SUMS`，上传至服务器以下目录，再重跑相同 sh，无需新安装模式或 Docker：

```text
vendor/video-engine/downloads/yt-dlp/offline/yt-dlp_linux
vendor/video-engine/downloads/yt-dlp/offline/SHA2-256SUMS
```

离线包仍逐字节验证 SHA256，错误清单或不匹配文件拒绝安装。当前日志版本为 [官方2026.10.21发行页](https://github.com/yt-dlp/yt-dlp/releases/tag/2026.10.21)，不能拿 Windows 的 yt-dlp.exe 放到 Linux。官方 API 下载方式见 [GitHub 文档](https://docs.github.com/en/rest/releases/assets#get-a-release-asset)。

本机另已准备 `vendor/video-engine/offline-bundles/yt-dlp-linux-x64-2026.10.21.tar.gz`，只含官方Linux x64程序及同版本校验清单，解包路径即上面两个文件。该产物被Git忽略，不会随拉代码自动上传。将它上传到服务器项目根目录后执行：

```bash
cd /home/www/yxshop/yxshopdev
tar -xzf yt-dlp-linux-x64-2026.10.21.tar.gz
bash scripts/install-video-deps-centos.sh
```

本包只解决当前yt-dlp下载卡点；后续FFmpeg / Firefox仍由同一sh检查、补装。包内程序40569080字节，ELF64 x86-64；SHA256为 `d8bd33fca9d5b23bd5b9952b3fca36db5c46331933fda9f598a3da14ce2c243f`。外层tar.gz的SHA256为 `b388b6df7f1add068ea27a2996a5b7010e955286fb11b87c82983fbb5cdd6bf1`，同目录提供 `.sha256` 文件。已重新读包核对仅有两个普通文件、路径正确、摘要匹配；未在Windows执行Linux文件。

本次45项下载 / 升级 / CentOS后端回归、修改脚本ESLint通过。真实官方Linux下载完成并校验；另准备1MiB断点再请求官方资产接口，收到HTTP206 / `bytes 1048576-40569079/40569080`，续传成品完整SHA256通过，验证目录已删除。此前Windows对应程序实际版本命令也已通过。这不等于用户CentOS服务器上的网络、FFmpeg编译或Firefox启动已验收；仍以服务器最后显示“视频提取依赖安装及启动检查通过”为准。

本轮在 Windows 上通过新 Firefox 后端实际提取并下载抖音公开作品 `7692515320217407402`，无需抖音登录。另有模拟 CentOS / root 账号、代理、失败清理、权限限制和跨系统路径的回归检查，以及 Bash 语法检查。

助手没有连接用户服务器执行系统安装，尚未在用户这台 CentOS 7 / 3.10 内核上实机验收。最终以脚本在服务器上的系统库安装、FFmpeg 编译和实际 Firefox 启动检查结果为准；不能将本地下载成功说成服务器部署已经成功。

本次 403 修复：在当前 Windows 环境通过实际 HTTPS 请求读取了阿里云和华为云各三个仓库的 `repomd.xml`，六个均返回有效仓库元数据；两份公钥的 OpenPGP v4 指纹与 CentOS 官方发布值一致。14 项隔离 Git / Bash / video 回归通过，新增检查真实脚本生成的多地址配置、本地公钥验证、缺失 / 损坏公钥拒绝安装、yum 失败保留现有引擎且不操作商城。实际 yum 由替身拦截，没有安装当前主机或服务器的软件包；这些检查不等于用户服务器上的安装已通过。

依赖安装不需要新 SQL。已有站点的视频业务表仍沿用 `sql/08_video_extractor_20261024003237.sql`，仅未执行过时按原迁移说明补齐。依赖通过不代表所有平台都能提取：源站的公开权限、地区和访问验证仍适用。

参考：[Firefox 系统要求](https://www.firefox.com/en-US/firefox/system-requirements/)、[Puppeteer Firefox / BiDi](https://pptr.dev/faq)、[FFmpeg 官方下载及签名](https://ffmpeg.org/download.html)、[yt-dlp Linux 独立版本](https://github.com/yt-dlp/yt-dlp#release-files)。

本次归档源与公钥：[阿里云 CentOS 7.9 归档](https://mirrors.aliyun.com/centos-vault/7.9.2009/)、[华为云 CentOS 7.9 归档](https://repo.huaweicloud.com/centos-vault/7.9.2009/)、[CentOS 官方公钥与指纹](https://www.centos.org/keys/)。
