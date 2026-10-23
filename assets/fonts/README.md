# 印章渲染字体

`NotoSerifCJKsc-Regular.otf` 为 Noto Serif CJK SC Regular 原版字体，用于服务端生成中文印章 PNG。随项目分发，运行时不扫描系统字体目录，不依赖 Windows / Linux 是否安装中文字体。

- 原文件：https://github.com/notofonts/noto-cjk/blob/main/Serif/OTF/SimplifiedChinese/NotoSerifCJKsc-Regular.otf
- 许可证：SIL Open Font License 1.1，完整文本见同目录 `OFL.txt`。
- 渲染器：`@resvg/resvg-wasm`，使用 WebAssembly，不需要额外安装本机编译工具或图形服务。

部署需保留本目录及项目依赖。字体只由服务端读取，不会随工具页加载到浏览器。
