# 域名根目录绑定与百度站点文件验证

验证站点：`https://www.yxstar.shop`。

用户服务器截图确认：

- 应用目录：`/home/www/yxshop/yxshopdev`。
- 用户希望域名对应的网站根目录为 `/home/www`，由站点 `server_name www.yxstar.shop` 与 `root /home/www` 配置映射；这是 Nginx 的站点目录设置，不是 DNS 中的目录设置。
- 用户终端确认验证文件已放在 `/home/www/baidu_verify_codeva-pxfWVWjVV4.html`，与 `myhome/`、`yxshop/` 同级。
- Nginx 主配置在 `http` 内包含 `/etc/nginx/conf.d/*.conf`。
- 站点配置：`/etc/nginx/conf.d/yxshophttps.conf`，HTTP 跳转 HTTPS，HTTPS 反向代理至 `127.0.0.1:3000`。
- 本项目实际使用 React + Vinext / Next 风格 Node 服务；验证文件由 Nginx 直接提供，不依赖前端框架或应用构建。

## 1. 保持当前目录结构

商城已经在 `/home/www` 下，无需搬动项目源码。验证文件也继续保留在当前目录：

```text
/home/www/
├── baidu_verify_codeva-pxfWVWjVV4.html
├── myhome/
└── yxshop/
    └── yxshopdev/
```

后续重新下载验证文件，也原样上传至 `/home/www/` 的直接下级。保持百度提供的完整文件名和内容不变。当前只确认用户服务器上有此文件，未读取文件内容或将原始 HTML 添加进本地 Git 项目。

百度所说的“网站根目录”指 URL 根路径。最终访问地址应为：

```text
https://www.yxstar.shop/baidu_verify_codeva-pxfWVWjVV4.html
```

URL 中不包含 `/public/` 或项目磁盘目录。

## 2. 设置域名的网站根目录

先备份服务器现有站点配置：

```bash
cp -p /etc/nginx/conf.d/yxshophttps.conf /etc/nginx/conf.d/yxshophttps.conf.bak.$(date +%Y%m%d%H%M%S)
```

Nginx 主配置中的 `include /etc/nginx/conf.d/*.conf` 已会加载站点，无需调整。编辑 `/etc/nginx/conf.d/yxshophttps.conf`，在 `listen 443 ssl http2;` 对应的 `server { ... }` 内，紧随 `server_name www.yxstar.shop;` 后设置网站根目录：

```nginx
root /home/www;
```

同一个 `server` 内，在现有 `location /` 前面增加根目录 HTML 通用规则：

```nginx
location ~ ^/[A-Za-z0-9_-]+\.html$ {
    default_type text/html;
    try_files $uri =404;
}
```

`root` 是此域名 HTTPS 站点的目录设置，`location` 与原有 `location /` 同级；它们都放在 443 的 `server` 内。`root` 不再仅放在某个百度文件规则内部。

若已添加此前仅匹配 `baidu_verify_*.html` 的规则，将其替换成上述通用规则，并将 `root /home/www;` 移至 `server` 层，不保留两套重复规则。

映射示例：

| 请求路径 | 实际处理 |
| --- | --- |
| `/baidu_verify_codeva-pxfWVWjVV4.html` | 读取 `/home/www/baidu_verify_codeva-pxfWVWjVV4.html` |
| `/about.html` | 读取 `/home/www/about.html`，不存在时返回 404 |
| `/help.html` | 读取 `/home/www/help.html`，不存在时返回 404 |
| `/`、`/tools/video-extractor.html`、`/api/...` | 继续反代 `127.0.0.1:3000` |

此通用规则适用于根目录直接下级、文件名仅包含英文字母 / 数字 / 下划线 / 中划线的 `.html` 文件；没有把商城源码和 `myhome` 等目录整体开放为静态目录。额外静态页的样式、脚本、图片等资源如需由 Nginx 提供，应使用明确的公开资源目录并配置对应路径。

项目内 `deploy/nginx/yxshophttps.conf` 是完整站点参考，已包含域名根目录与上述规则；若服务器还有截图未展示的额外设置，保留它们并合并修改。商城仍是 Node 服务，源代码目录不是浏览器可直接运行的静态构建目录。

域名的百度验证通过后，可提交此站点下的其他页面。现有工具页由应用自动加入站点地图；额外上传的静态 HTML 不会仅因配置 Nginx 就自动出现在应用的站点地图中，需要另行添加链接 / 地图记录。抓取条件不代表保证收录。

## 3. 检查配置并平滑重载

在服务器执行：

```bash
nginx -t && nginx -s reload
```

仅在配置检查成功后执行重载。此方案无需重新构建或重启商城 Node 服务。

## 4. 在百度完成验证

由用户点击百度页面的“确认验证文件可以正常访问”，核对响应为原验证文件内容，而不是商城首页、登录页或 404；随后点击“完成验证”。验证成功后保留该 HTML 文件，后续更新部署也应保留它。

本次只提供项目内配置参考与部署步骤，没有连接服务器、上传验证文件、重载 Nginx 或使用浏览器验收。最终以服务器 `nginx -t` 及百度验证结果为准。

参考：[Nginx root 与 location](https://nginx.org/en/docs/http/ngx_http_core_module.html#root)、[try_files](https://nginx.org/en/docs/http/ngx_http_core_module.html#try_files)、[平滑重载](https://nginx.org/en/docs/control.html)。
