# 备份与 rsync

存储体系最后一道防线是备份。RAID 挡硬件故障，LVM 快照保时间点，但误删除、勒索病毒、机房级别的灾难，只有"另一份独立副本"能救。这一篇讲 rsync 的用法与一套可落地的备份策略。

## rsync 是什么

rsync 的核心能力有两个：增量同步（只传两边有差异的部分）和保留属性（权限、时间戳、属主）。本地复制、跨机同步、目录镜像都是它。

## 基本用法

本地同步：

```bash
rsync -av /srv/data/ /backup/data/
```

跨机推送：

```bash
rsync -av /srv/data/ user@192.168.1.20:/backup/data/
```

跨机拉取：

```bash
rsync -av user@192.168.1.20:/srv/data/ /backup/data/
```

关键参数：

- -a：归档模式，保留权限属主时间戳并递归。
- -v：显示过程。
- -z：传输时压缩，慢网络有用。
- -P：显示进度并支持断点续传。
- --delete：让目标与源完全一致，源里删了目标也删。镜像必备但高危，先加 -n 预演。

## 结尾斜杠的坑

```bash
rsync -av /src/data  /dst/     # 把 data 目录本身放进 /dst，得到 /dst/data
rsync -av /src/data/ /dst/     # 把 data 里的内容放进 /dst，得到 /dst/文件们
```

结尾有没有斜杠语义完全不同，写错轻则目录套目录，重则 --delete 删错东西。用之前永远 -n（--dry-run）预演一遍看要动哪些文件。

## 定时备份：cron 驱动

写个备份脚本 /usr/local/bin/backup.sh：

```bash
#!/bin/bash
rsync -a --delete /srv/data/ /backup/data/
```

```bash
sudo chmod +x /usr/local/bin/backup.sh
sudo crontab -e
```

```text
0 3 * * * /usr/local/bin/backup.sh >> /var/log/backup.log 2>&1
```

每天凌晨三点同步。讲究一点可以在脚本里先给 LVM 拍快照，从快照挂载点往备份盘 rsync，业务写入不干扰一致性（快照篇讲过）。

## 带历史版本：rsync --link-dest

只有一份镜像，源被误删后镜像跟着删，等于没备份。经典方案 --link-dest 用硬链接复用未变文件，几乎不占空间地保留多天历史：

```bash
rsync -a --delete --link-dest=/backup/monday /srv/data/ /backup/tuesday
```

未变化的文件在 tuesday 里只是指向 monday 的硬链接，变化的文件才是真副本。配合每天轮换的日期目录，得到"每天一个完整快照视图，总占用≈最近一次全量加每天增量"。

## 备份策略：3-2-1 原则

- 3 份数据：生产一份，本地备份一份，异地一份。
- 2 种介质：避免同一种介质一起坏。
- 1 份异地：防火灾、机房级灾难。

异地那一份常用 rsync over SSH 推到另一台机器，或推到对象存储（rclone 工具与 rsync 用法神似）。

## 验证备份有效性

没验证过的备份等于没有。定期做恢复演练：

```bash
rsync -a /backup/data/ /tmp/restore-test/
diff -r /srv/data /tmp/restore-test | head
```

同时检查备份日志、目录时间戳，确认 cron 真的在跑。

## 常见错误自查

- 备份目录套了一层目录 → 结尾斜杠语义搞错，用 -n 预演重来。
- --delete 误删了目标文件 → 一定是源目录给错了（比如源挂载失效成空目录），脚本里先检测源目录非空再执行。
- 备份越来越慢 → 没用 --link-dest 或增量策略，全量拷贝每次都重传。
- 跨机要密码没法进 cron → 配置 SSH 免密（ssh-keygen 加 authorized_keys）。
- 备份盘和源盘在同一台机器同一阵列 → 硬件一坏全完，违反 3-2-1，至少异地一份。

## 小结

rsync 增量同步加属性保留，是备份的主力工具。三条纪律：结尾斜杠想清楚、--delete 先 -n 预演、脚本里校验源目录非空。想留历史版本用 --link-dest 硬链接方案。策略上遵循 3-2-1：三份数据、两种介质、一份异地，并定期恢复演练。至此 Linux 存储体系从分区、文件系统、LVM、RAID 到网络存储、故障排查、备份，闭环完成。