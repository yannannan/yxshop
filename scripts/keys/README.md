# CentOS 7 安装公钥

仅用于视频依赖的独立 yum 配置，保留 RPM 签名验证。公钥从 CentOS 官方网站下载，随代码发布，安装时不需要再次访问公钥网站。脚本校验下列文件的 SHA256；更新文件时必须重新核对官方指纹并同步校验值。

| 文件 | 官方指纹 | SHA256 |
| --- | --- | --- |
| RPM-GPG-KEY-CentOS-7 | 6341AB2753D78A78A7C27BB124C6A8A7F4A80EB5 | 8b48b04b336bd725b9e611c441c65456a4168083c4febc28e88828d8ec14827f |
| RPM-GPG-KEY-CentOS-SIG-SCLo | C4DBD535B1FBBA14F8BA64A84EB84E71F2EE9D55 | 1402b1ea263cd0e51e7fe77c89ab98d64dd08fdc54e7a4afe27b2782ddfc351c |

来源与指纹：[CentOS 官方公钥列表](https://www.centos.org/keys/)、[CentOS 7 公钥](https://www.centos.org/keys/RPM-GPG-KEY-CentOS-7)、[SCLo 公钥](https://www.centos.org/keys/RPM-GPG-KEY-CentOS-SIG-SCLo)。下载与核对日期：2026-10-24。
