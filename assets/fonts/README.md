# 印章渲染字体

以下三种原版字体用于服务端生成中文印章 PNG。随项目分发，运行时不扫描系统字体目录，不依赖 Windows / Linux 是否安装中文字体。

| 页面名称 | 文件 / 原始来源 | SIL Open Font License 1.1 许可证 |
| --- | --- | --- |
| 宋体 | [NotoSerifCJKsc-Regular.otf](https://github.com/notofonts/noto-cjk/blob/main/Serif/OTF/SimplifiedChinese/NotoSerifCJKsc-Regular.otf) | `OFL.txt` |
| 黑体 | [NotoSansCJKsc-Regular.otf](https://github.com/notofonts/noto-cjk/blob/main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf) | `NotoSans-OFL.txt` |
| 霞鹜文楷 | [LXGWWenKai-Regular.ttf](https://github.com/lxgw/LxgwWenKai/blob/main/fonts/TTF/LXGWWenKai-Regular.ttf) | `LXGWWenKai-OFL.txt` |

渲染器为 `@resvg/resvg-wasm`，使用 WebAssembly，不需要额外安装本机编译工具或图形服务。按选择加载字体并缓存文件；宋体同时为罕用汉字和预览水印提供后备字体。印章名称、辅助文字及编号使用相同的字体选择，预览水印保留宋体。

部署需保留本目录全部字体、许可证及项目依赖。字体只由服务端读取，不会随工具页加载到浏览器，也不依赖在线字体 CDN。
