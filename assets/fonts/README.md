# 印章渲染字体

以下四种原版字体用于服务端生成中文印章 PNG、JPG及轮廓化SVG。随项目分发，运行时不扫描系统字体目录，不依赖 Windows / Linux 是否安装中文字体。

| 页面名称 | 文件 / 原始来源 | SIL Open Font License 1.1 许可证 |
| --- | --- | --- |
| 宋体 | [NotoSerifCJKsc-Regular.otf](https://github.com/notofonts/noto-cjk/blob/main/Serif/OTF/SimplifiedChinese/NotoSerifCJKsc-Regular.otf) | `OFL.txt` |
| 黑体 | [NotoSansCJKsc-Regular.otf](https://github.com/notofonts/noto-cjk/blob/main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf) | `NotoSans-OFL.txt` |
| 霞鹜文楷 | [LXGWWenKai-Regular.ttf](https://github.com/lxgw/LxgwWenKai/blob/main/fonts/TTF/LXGWWenKai-Regular.ttf) | `LXGWWenKai-OFL.txt` |
| 朱雀仿宋 | [ZhuqueFangsong-Regular.ttf，v0.212](https://github.com/TrionesType/zhuque/releases/tag/v0.212) | `ZhuqueFangsong-OFL.txt` |

朱雀仿宋原版来自发布包 `ZhuqueFangsong-v0.212.zip`（技术预览版本），用于接近用户所示的细长仿宋印章风格，不声称识别了截图中的原字体。字体内部家族名称为 `Zhuque Fangsong (technical preview)`，缺字继续使用宋体后备。字体文件按发布包原样保存，未修改内容；许可证取自该版本提交 [803217b](https://github.com/TrionesType/zhuque/blob/803217b/LICENSE.txt)。

- 字体：8824084字节，SHA256 `558c62730844fe54ba220146ed62f859d4e2880188d92d985f8921c6e3743bc4`。
- 原始ZIP：SHA256 `bb8b661a7643d2296a72d9d10530a00949419c4e527fb61783f73c2ba1a8c062`。
- 许可证：4389字节，SHA256 `66cc01ad4df62fca6936431a426104cb32a52ce8da49de9a7d643e02d7659043`。

渲染器为 `@resvg/resvg-wasm`，使用 WebAssembly，不需要额外安装本机编译工具或图形服务。按选择加载字体并缓存文件；宋体同时为罕用汉字和预览水印提供后备字体。印章名称、辅助文字及编号使用相同的字体选择，预览水印保留宋体。

部署需保留本目录全部字体、许可证及项目依赖。字体只由服务端读取，不会随工具页加载到浏览器，也不依赖在线字体 CDN。
