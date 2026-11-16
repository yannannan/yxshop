# Linux一次性对齐GitHub发布分支

2026-11-16。本地项目仓库根目录为yxshopdev本身，origin为https://github.com/yannannan/yxshop.git。Linux当前使用父仓库/home/www/yxshop/.git，项目位于yxshopdev/子目录，origin是服务器本机裸仓库且跟踪origin/master。两者的仓库结构不同。

采用同一GitHub仓库的yxshop-dev作为固定发布分支。后续由助手在获得明确授权后提交并推送此分支，Linux继续执行原upgrade.sh。本次不修改升级脚本，不采用每次上传修复包的流程。

## 执行前提

- 发布分支须已包含8fa9010：包括中文图片切换及后台AI获客管理修复。仅本地提交不会更新GitHub，推送授权仍需用户确认。
- 在2026-11-16通过不携带凭据的GitHub请求确认仓库公开，读取不需要GitHub密钥；服务器仍需能联网访问GitHub。
- 先保存需要保留、尚未提交到发布分支的源码改动，原upgrade.sh会强制同步已跟踪文件。

## Linux一次性执行

这段命令先在/tmp只克隆Git元数据并检查修复提交，再将元数据放入项目自己的.git。克隆或校验失败时不会停止商城或改源码。父目录旧仓库和本机裸仓库保持原样。

```bash
(
  set -e
  cd /home/www/yxshop/yxshopdev
  if [ -e .git ]; then
    echo '项目已有独立Git仓库，请先核对origin；本次未改动。' >&2
    exit 1
  fi
  yx_release_meta="$(mktemp -d /tmp/yxshop-git.XXXXXXXX)"
  git clone --no-checkout --single-branch --branch yxshop-dev https://github.com/yannannan/yxshop.git "$yx_release_meta"
  if ! (cd "$yx_release_meta" && git merge-base --is-ancestor 8fa9010 HEAD); then
    echo 'GitHub发布分支尚未包含本次修复；商城尚未停止，项目尚未改动。' >&2
    exit 1
  fi
  mv -- "$yx_release_meta/.git" ./.git
  rmdir -- "$yx_release_meta"
  git config --get remote.origin.url
  git rev-parse --abbrev-ref --symbolic-full-name '@{upstream}'
  bash upgrade.sh
)
```

完成后项目origin为GitHub，上游为origin/yxshop-dev，git rev-parse --show-prefix输出为空。今后只在/home/www/yxshop/yxshopdev里运行bash upgrade.sh，它会直接拉取该发布分支。不要在父目录执行旧仓库更新来覆盖此项目。

如果GitHub连接或修复提交校验失败，保留完整输出定位，不关闭SSL校验或强制覆盖分支。

## 验证

tests/upgrade.test.mjs中的独立场景模拟旧父仓库+yxshopdev子项目、独立发布仓库和本机已有环境，验证无检出克隆不会停服，接入项目自己的.git后原upgrade.sh读取origin/yxshop-dev，父仓库HEAD/origin不变，环境文件、上传文件及Linux离线引擎保持原字节。测试中的pnpm/启停/视频检查均为替身，没有访问线上服务或数据库。
