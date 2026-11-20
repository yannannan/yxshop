# 上门技术服务展示图片

2026-11-21：由同目录既有原图生成轻量展示文件，原图保留，不替换人物或构图。

| 用途 | 原文件 | 展示文件 | 分辨率 | 大小（字节） |
| --- | --- | --- | --- | --- |
| 张伟列表头像 | provider-zhangwei-v1.png | provider-zhangwei-card-v2.webp | 216×216 | 3972 |
| 李娜列表头像 | provider-lina-v1.png | provider-lina-card-v2.webp | 216×216 | 4182 |
| 王强列表头像 | provider-wangqiang-v1.png | provider-wangqiang-card-v2.webp | 216×216 | 4300 |
| 张伟详情头像 | provider-zhangwei-v1.png | provider-zhangwei-portrait-v2.webp | 640×640 | 20914 |
| 李娜详情头像 | provider-lina-v1.png | provider-lina-portrait-v2.webp | 640×640 | 23306 |
| 王强详情头像 | provider-wangqiang-v1.png | provider-wangqiang-portrait-v2.webp | 640×640 | 29692 |
| 详情横幅/插图 | ai-technical-service-hero-v1.png | ai-technical-service-hero-v2.webp | 1536×1024 | 122788 |

三个原头像合计6078810字节；列表版本12454字节，减少99.8%。横幅从1486024字节减少到122788字节，保留原尺寸和透明度。此为文件体积对比，不代表线上加载时间测量。

重建：在安装Pillow的开发环境执行`python scripts/optimize-technical-images.py`。使用WebP quality=85、method=6；头像等比缩小，原图不修改。生产部署直接使用已提交文件，无需Python或在线转码。

`lib/technical-images.ts`仅将三个已知原头像地址映射到对应版本，兼容数据库已有PNG地址；后台自定义头像原样使用。`next.config.ts`仅对这7个版本化WebP设置长期缓存。未来替换素材时须同步升级文件名版本、映射及生成脚本，勿覆盖已发布的v2文件。
