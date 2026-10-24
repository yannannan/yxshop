# Linux 页面 500 与工具访问（2026-10-24）

## 本次已确认原因

用户截图中的 `This page couldn’t load` 是 Vinext 的默认错误页面。本轮只读 HTTP 检查复现：首页、工具目录、视频操作页等返回 500，`/api/tools` 和匿名会话接口返回 200；带 www 与不带 www 均复现。工具页面的 RSC 组件数据也正常，错误集中在 HTML 服务端渲染。

常规日志没有异常栈。通过一个不监听端口的临时 Node 进程加载真实生产包，并捕获 React SSR 错误，用户服务器明确返回：

```text
ERR_MODULE_NOT_FOUND: Cannot find package 'ipaddr.js'
imported from .../dist/server/ssr/_next/static/image-VxSzIbFg.js
```

`ipaddr.js` 原本只是 Vinext 的间接依赖；SSR 图片模块在产物中直接引用它，pnpm 的严格依赖目录不会保证根项目可以解析间接依赖。原本本地 npm 提升的依赖可能掩盖缺失；并非用户未登录、Nginx 静态根目录、视频解析引擎或本次数据库缺字段导致此异常。

已将锁中现有的 `ipaddr.js@2.5.0` 声明为正式运行依赖，同步 npm / pnpm 两份锁，不升级其他包。扫描当前完整生产包的静态外部引用后，六个外部包都已声明为直接运行依赖，没有发现其他同类漏项。

## 服务器处理

通常同步本次完整代码后运行原 `bash upgrade.sh` 即可，冻结锁安装会补齐依赖。无需执行新 SQL、修改收费模式或 Nginx。

服务器现有产物已经直接引用此包，需要先恢复访问时，可在项目目录执行：

```bash
pnpm add --save-exact ipaddr.js@2.5.0 &&
bash ./stop.sh &&
bash ./start.sh
```

此临时补包会更新服务器的 package.json 和 pnpm 锁，须与正式修复同步；当前缺失为外部依赖，补包后不要求重新构建，但应重启 Node 清除失败的模块加载状态。

本轮后续再次只读请求线上首页与视频页，已均返回 HTTP 200 且无默认错误页。该结论是 HTTP 访问检查，不代表已完成浏览器点击、视频提取或真实收费验收；助手未登录服务器执行上述命令。

## 工具与登录的关系

- 首页工具卡片进入工具介绍 / 操作页不要求登录。
- 视频工具解析、提取及个人下载需真实登录；免费表示不收费，仍使用账号隔离任务和历史。
- 免费印章可匿名预览 / 制作；会员、按次及积分按各自已有规则校验。
- 显示“入口待配置”的非内置工具，需要管理员配置实际入口；登录不会自动补全入口。
- 打开视频页与安装视频引擎是不同阶段。缺少引擎会在操作页提示，不应导致整个页面因 ipaddr.js 缺失返回 500。

## 首页所有工具点击没有反应（后续问题）

2026-10-24 用户完成Firefox启动修复并重建商城后，反馈所有工具卡片点击“完全没反应”。本轮直接HTTP检查线上首页、公开工具接口及5个工具页面（c-drive-cleaner、video-extractor、document-signature、stamp-maker、yxstar-site-tool）全部200，无默认错误页；视频与印章的HTML包含实际操作面板。两页RSC请求同样200，首页25个直接静态资源及递归检查的38份JavaScript均可读取。这里只做HTTP及源码检查，没有打开浏览器或捕获用户控制台，不能把具体客户端异常说成已经复现。

卡片原本统一使用next/link，其点击处理先preventDefault再等待客户端路由完成。现将ToolDirectory卡片、“更多工具”以及CatalogPagination的链接翻页改成原生a，让已正常返回的独立页面由浏览器打开；首页原有onChange按钮分页继续按原逻辑切换。独立页刷新是预期行为，URL、样式、6 / 12个工具分页、商品12件分页及后台排序均保持原规则。没有修改工具权限、Nginx或依赖。

用户同时说明Linux尚未配置密钥。若指OSS AccessKey，它影响视频成品存储和下载，新提取会被明确阻止；不会阻止首页卡片进入公开工具页。服务器`/home/www/yxshop/yxshopdev/.env.mysql`填写`VIDEO_OSS_ACCESS_KEY_ID`、`VIDEO_OSS_ACCESS_KEY_SECRET`，其他已确认的上海Bucket配置沿用。真实密钥只由用户填写服务器，不发聊天、不提交Git；重启进程后生效。

新忽略产物`vendor/video-engine/offline-bundles/tool-entry-navigation-fix-20261024.tar.gz`为1841字节，SHA256为`e48b9f11ca7f29df59f007896f0ac88be32e4b086e78855a8311629ae349f8a2`；仅包含`components/tool-directory.tsx`和`components/catalog-pagination.tsx`，不含环境文件或视频引擎，不覆盖已通过的Firefox修复。上传服务器项目根后：

```bash
cd /home/www/yxshop/yxshopdev
tar -xzf tool-entry-navigation-fix-20261024.tar.gz &&
bash stop.sh && pnpm build && bash start.sh
```

刷新首页后验证卡片、更多入口和独立页翻页，再测试实际提取与OSS下载。服务器远程master未确认同步全部修复前，不用upgrade的reset覆盖手动补丁。之后需把源码修复同步实际发布代码源，恢复日常升级。本轮无需新SQL或重装视频依赖。

工具 / 首页 / 视频93项回归及3项严格生产渲染检查、源码ESLint与生产构建通过；更新原目录测试，在next/link不可用时验证卡片 / 更多 / 独立目录翻页仍能提供有效原生链接。生产测试使用模拟只读工具数据，不监听端口、打开浏览器或连接真实业务库。当前仅源码及HTTP证据，服务器真实点击结果仍待用户验收。

## 生产渲染回归

```bash
pnpm test:production
```

此命令先构建当前源码，再直接调用生产处理函数，不启动开发 / 预览服务、端口或浏览器。测试限制生产包只能解析正式直接依赖，防止本机 npm 提升间接依赖掩盖问题；工具资料使用模拟的只读数据，没有连接业务库或写 SQL。

验证首页、订单、积分、工具目录、匿名视频页、匿名印章页均为 200；故意拒绝 ipaddr.js 时会真实复现 500，验证检查确实能够捕获这类回归。完整业务回归须在新构建之后运行；直接使用旧版已提交的 dist 不能代表当前源码。

参考：[Vite SSR 外部依赖说明](https://vite.dev/config/ssr-options)、[ipaddr.js 项目](https://github.com/whitequark/ipaddr.js/)。
