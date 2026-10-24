# 视频 OSS 长期存储（2026-10-24）

按用户确认，Bucket 为 `yxstarshop`，上海地域 `oss-cn-shanghai`，公网 Endpoint 为 `oss-cn-shanghai.aliyuncs.com`。本轮无需新增 SQL，不改变原积分、会员及按次价格。

## 处理与下载

1. 原引擎把视频下载 / 合并到项目 `uploads/video-extractions/<任务 UUID>/` 临时目录。
2. 流式上传到 `yxstarshop/yxshop/video-extractions/users/<用户 ID>/<任务 UUID>/result.mp4`（也支持 WebM / MOV），计算摘要，OSS 验证 MD5，再 HEAD 核对大小、SHA256 元数据和所属用户 / 任务。
3. 同一个数据库事务保存私有云对象信息、完成状态和原有积分 / 次数扣费结果，确认提交之后立即删除整个本地任务目录，包括源音视频和中间文件。
4. 用户登录后点击本人提取记录的下载入口，接口验证归属并 302 跳到 OSS 公网 HTTPS 签名地址，视频由 OSS 直接传给用户，不占用商城的视频下行带宽。

**OSS 成品长期保存，不受原 24 小时成品有效期影响。** 历史记录显示“长期保存”，每次下载重新签发 15 分钟的临时地址，无需重新解析 / 提取，也不再次扣费。复制出的临时链接到期后，回到历史记录点击下载即可。Bucket 保持私有，用户不能通过猜测目录访问其他人的视频。

本地仍需要提取 / 合并 / 上传过程的短期磁盘空间，不在服务器长期存储成品。正常成功和已确认失败的任务都会立即清理本地目录。目录被占用、权限异常或进程中断时，清理器会重试；超过 24 小时的临时 UUID 目录可回收。清理器不会删除 OSS 长期成品或账务历史。

## 服务器配置

先同步代码并安装本次 `ali-oss` 依赖。在服务器项目 `/home/www/yxshop/yxshopdev/.env.mysql` **追加**下面变量，保留原数据库和登录配置：

```dotenv
VIDEO_STORAGE_DRIVER=oss
VIDEO_OSS_BUCKET=yxstarshop
VIDEO_OSS_REGION=oss-cn-shanghai
VIDEO_OSS_PREFIX=yxshop/video-extractions
VIDEO_OSS_ACCESS_KEY_ID=填写RAM账号的AccessKeyId
VIDEO_OSS_ACCESS_KEY_SECRET=填写RAM账号的AccessKeySecret
VIDEO_OSS_STS_TOKEN=
VIDEO_OSS_INTERNAL_UPLOAD=0
```

`VIDEO_OSS_REGION=oss-cn-shanghai.aliyuncs.com` 也能识别并规范为地域名。密钥只存服务器环境文件，不提交 Git，不发到聊天。使用 RAM 子账号；若使用 STS，需由部署环境在过期前更新整组凭据并重新加载进程，当前项目没有自动换取 STS Token 的服务。

上海地域 ECS 可将 `VIDEO_OSS_INTERNAL_UPLOAD` 改为 `1` 使用 OSS 内网上传；非上海 ECS、Windows 本地或其他云主机使用 `0`。下载始终生成公网地址。

Bucket 和对象保持私有、标准存储；**不要给 `yxshop/video-extractions/` 前缀配置到期删除或归档规则**，以免影响长期随时下载。程序显式上传私有对象，不要求改成公共读。RAM 权限仅授权这个前缀，例如：

```json
{
  "Version": "1",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["oss:PutObject", "oss:PutObjectAcl", "oss:GetObject", "oss:DeleteObject"],
    "Resource": ["acs:oss:*:*:yxstarshop/yxshop/video-extractions/*"]
  }]
}
```

GetObject 同时用于 HEAD 校验和签名下载，DeleteObject 仅用于明确未完成任务的上传补偿；定时清理不删除成功成品。服务端不需要列举或管理整个 Bucket 的权限。具体 RAM 策略需与 Bucket 策略、跨账号权限和已有访问限制共同生效。

填写后按原方式发布：

```bash
cd /home/www/yxshop/yxshopdev
bash upgrade.sh
```

`upgrade.sh` 不会自动写入 OSS 密钥，不需要修改 Nginx 或重新安装视频引擎。已经完成本次依赖安装 / 构建、只修改环境变量时，按原 stop.sh / start.sh 重启即可。Windows 本地调试也需为 Node 进程加载同一组服务端 OSS 环境变量。

默认使用 OSS；配置不完整时禁止新建提取任务，不会悄悄转回本地成品存储。旧本地成品仍按原有效期兼容下载。显式 `VIDEO_STORAGE_DRIVER=local` 仅用于有意恢复原存储方案，不符合本次“云端长期保存、本地只作临时处理”的部署目标。

## 旧视频迁移

此前的成品不会仅凭已有数据库记录自动变成 OSS 文件。需要把**本机仍实际存在的旧成品**迁移时，在已配好 OSS 的那台机器执行：

```bash
node --env-file=.env.mysql scripts/migrate-video-files-to-oss.mjs
```

命令只处理已完成的视频，不重新提取、不改价格 / 已扣积分 / 会员次数。上传校验后条件保存云记录，读回确认一致才删除本地。迁移后的旧视频也长期保留。可重复执行；已经云存储的记录跳过。文件在另一台机器或已删除的记录会跳过，无法凭空恢复。程序会输出 `migrated / skipped / failed` 数量，不输出密钥或源站私密地址。

## 临时文件维护

视频权益接口首次读取或首次开始任务时立即尝试维护，并在进程存活期间每 15 分钟重试；每次任务结束也触发维护。不新增监听端口或常驻独立服务。

手动维护或需要在商城进程停止时仍由已有运维调度执行：

```bash
node --env-file=.env.mysql scripts/cleanup-video-storage.mjs
```

该命令仅删除已保存 OSS 的本地副本、超过 24 小时的临时任务目录及过期解析缓存，**不删除 OSS 成品**。不需要每次升级人工执行。只处理项目内固定 UUID 目录，不跟随指向其他位置的目录链接。

## 失败与验收

- 上传失败自动重试最多 3 次，每次重开流；原生 MD5 及 HEAD 验证通过前不扣费。
- 上传成功、写库 / 扣费失败时事务回滚；确认未完成后回收云对象和本地临时文件。数据库提交响应丢失时先读回状态，不能删除可能已成功收费的云文件。
- 数据库完全不可达、进程崩溃或 OSS 回收不可达等不确定场景，可能有残留对象 / 临时文件；保留真实状态供恢复，不能保证跨 OSS / MySQL / 本地文件系统的分布式原子提交。定时器及维护命令可回收本地遗留副本；不对整个 Bucket 盲目扫删。
- 已完成 OSS 文件本地清理失败不会使成功任务变为失败、退回收费或重复扣费，维护时继续重试。
- 历史记录、所有权和云对象路径仍依赖现有数据库，需保留原数据库备份。

代码检查覆盖模拟 OSS 流式上传 / 校验 / 重试、真实 SDK 离线 V4 签名、事务扣费 / 回滚、提交响应丢失、302 下载鉴权、永久保留与本地清理、旧记录迁移；未提供真实 AccessKey，因此没有连接用户 Bucket、上传真实业务视频、执行迁移或真实扣费。部署后需实际完成一次提取，确认历史可下载、OSS 有文件、本地任务目录已消失。

官方参考：[阿里云 OSS Node SDK](https://github.com/ali-sdk/ali-oss)、[V4 签名 URL](https://www.alibabacloud.com/help/en/oss/developer-reference/upload-objects-using-a-signed-url-generated-with-oss-sdk-for-node-js)。
