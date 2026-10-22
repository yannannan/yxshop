# 百度站点文件验证

验证站点：`https://www.yxstar.shop`。

用户服务器截图确认：

- 应用目录：`/home/www/yxshop/yxshopdev`。
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

## 2. 添加 Nginx 静态文件规则

先备份服务器现有站点配置：

```bash
cp -p /etc/nginx/conf.d/yxshophttps.conf /etc/nginx/conf.d/yxshophttps.conf.bak.$(date +%Y%m%d%H%M%S)
```

编辑 `/etc/nginx/conf.d/yxshophttps.conf`，在 `listen 443 ssl http2;` 对应的 `server { ... }` 内、现有 `location /` 前面添加：

```nginx
location ~ ^/baidu_verify_[A-Za-z0-9_-]+\.html$ {
    root /home/www;
    default_type text/html;
    try_files $uri =404;
}
```

此 `location` 与原有 `location /` 同级，不能嵌套在其内部，也不能直接放到 `nginx.conf` 的 `http` 外部。原主配置和原反向代理继续使用。

若已按此前方案添加了同名验证规则，将其 `root` 改为 `/home/www` 即可，不要重复添加。`root /home/www` 仅用于此验证文件规则；商城请求继续由 `location /` 反代至 Node，不将 `/home/www` 整体作为可浏览的源码目录。`myhome` 等其他项目的域名和站点配置保持各自独立。

项目内 `deploy/nginx/yxshophttps.conf` 是按截图整理的完整站点参考，已包含上述规则；若服务器还有截图未展示的额外设置，保留它们，只添加验证规则。

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
