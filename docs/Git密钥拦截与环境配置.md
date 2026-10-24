# GitHub 密钥拦截与环境配置

2026-10-24 用户填入真实 OSS AccessKey 后提交，GitHub Push Protection 拒绝推送。本地提交成功不代表远程已接收；在后续提交中删掉值，也无法消除之前提交中的密钥，需要清理包含它的未推送提交。参见 [GitHub 官方说明](https://docs.github.com/en/code-security/how-tos/secure-your-secrets/work-with-leak-prevention/push-protection-on-the-command-line)。

## 当前修复

- 实际 `.env.local`、`.env.mysql` 已退出 Git 跟踪，磁盘文件保留原样，并由现有 `.gitignore` 忽略。填写密钥后不会被正常的 `git add` / 提交纳入仓库。
- 代码库只维护不含真实 OSS 密钥的 `.env.mysql.example`。新机器首次配置可复制为所需的实际环境文件，再填密码和 AccessKey；已有环境文件不要用模板覆盖。
- 本次涉及密钥的两条未推送提交只改动实际环境文件，已替换为取消跟踪的修复提交，其他开发历史保留，不改写 GitHub 已有历史。原对象可能仍存在本机 Git 恢复记录中，但不再属于待推送分支历史；不要用旧含密钥提交创建 / 推送新分支。
- `.env.local` 用于本地 `pnpm dev`；Linux `start.sh` 和指定 `--env-file=.env.mysql` 的命令读取 `.env.mysql`。配置仍须在各机器保留，不会再随 Git 发布。填写后重启对应进程。

可用以下命令检查：

```bash
git ls-files -- .env.local .env.mysql
git check-ignore .env.local .env.mysql
```

第一条应没有输出，第二条应显示两个文件名，不需要打印文件内容。

清理后的主分支仍基于远程现有 main，可正常推送，不需要强推或解除 GitHub 密钥拦截：

```bash
git push origin main:main
```

密钥已进入过 Git 提交，建议在 RAM 创建替代密钥、更新实际环境配置并验证后禁用旧密钥；不把新密钥提交或发到聊天。参见 [阿里云轮换说明](https://help.aliyun.com/zh/ram/user-guide/solution-to-accesskey-leakage)。本次助手未操作阿里云账号或执行密钥轮换。

## Linux 第一次同步本次修复

旧服务器仍跟踪 `.env.mysql` 时，旧版 `upgrade.sh` 内的 `git reset --hard` 可能删除它。新版入口在停服前将两份环境文件备份到项目内权限为 700 的随机私有目录，reset 后原样恢复；失败退出也尝试恢复。恢复失败时保留备份并中断，成功后删除两份固定备份文件和空目录，不递归删除。整个过程不输出配置值。

**首次先取新版升级脚本，再让它升级其余代码。** 先将本次代码发布到服务器实际使用的代码源；以下命令适用于此前日志已确认从 `origin/master` 发布的服务器：

```bash
cd /home/www/yxshop/yxshopdev
git fetch origin &&
git show origin/master:upgrade.sh > upgrade.sh.next &&
mv -- upgrade.sh.next upgrade.sh &&
bash upgrade.sh
```

如果服务器实际跟踪其他分支，使用对应 ref。GitHub 本地 main 与服务器自建仓库 master 是不同代码源，不能假定 GitHub 推送后自建 master 已自动更新。

以后仍然只执行 `bash upgrade.sh`，没有新增升级模式。视频依赖仍只调用独立 sh，不改数据库 / Nginx，也不把环境文件重新加入 Git。
