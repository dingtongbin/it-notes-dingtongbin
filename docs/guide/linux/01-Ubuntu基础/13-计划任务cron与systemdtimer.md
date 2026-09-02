# 计划任务cron与systemdtimer

有些事需要半夜自动做：备份、清理日志、发报告。这一篇讲 Ubuntu 的定时任务机制：传统的 cron 和更现代的 systemd timer。

## cron 是什么

cron 是系统守护进程，按写好的时间表定时执行命令。每个用户有自己的任务列表，用 crontab 管理。

## crontab 基本操作

```bash
crontab -l      # 查看当前用户的定时任务
crontab -e      # 编辑定时任务
crontab -r      # 清空定时任务（慎用）
```

第一次用 crontab -e 会让你选编辑器，选 vim 或 nano 都行。

## crontab 时间格式

一行任务由五个时间字段加命令组成：

```
分 时 日 月 周 命令
```

示例：

```bash
* * * * *  命令        # 每分钟
0 * * * *  命令        # 每小时整点
30 2 * * * 命令        # 每天 02:30
0 3 * * 1 命令         # 每周一 03:00
0 4 1 * * 命令         # 每月 1 号 04:00
*/10 * * * * 命令      # 每 10 分钟
0 9-18 * * * 命令      # 每天 9 到 18 点的整点
```

各字段取值：分 0-59、时 0-23、日 1-31、月 1-12、周 0-7（0 和 7 都是周日）。星号表示"每个"，*/10 表示"每 10 个单位"，逗号列多个值。

## 写 crontab 的注意点

- 命令尽量写全路径（cron 的环境变量很少），比如 /usr/bin/开头。
- 任务输出默认无处可看，重定向到日志便于排查：

```bash
30 2 * * * /usr/local/bin/backup.sh >> /var/log/backup.log 2>&1
```

- 修改保存后立即生效，无需重启。

## 系统级定时任务

系统级任务放在 /etc/crontab 或 /etc/cron.d/ 下，格式比用户 crontab 多一个用户字段：

```
30 2 * * * root /usr/local/bin/clean.sh
```

另外还有几个周期目录：/etc/cron.hourly、/etc/cron.daily、/etc/cron.weekly、/etc/cron.monthly，放进去的可执行文件会按周期自动执行。

## systemd timer：更现代的选择

systemd timer 功能更强：能补办错过的任务（Persistent）、有更强的日志、能和服务状态联动。一个 timer 配一个 service：

定时单元 /etc/systemd/system/backup.timer：

```ini
[Unit]
Description=Run backup daily

[Timer]
OnCalendar=daily
Persistent=true

[Install]
WantedBy=timers.target
```

配套的服务单元 backup.service：

```ini
[Unit]
Description=Daily backup

[Service]
Type=oneshot
ExecStart=/usr/local/bin/backup.sh
```

启用并查看：

```bash
sudo systemctl enable --now backup.timer
systemctl list-timers      # 列出所有 timer 及下次运行时间
```

## cron 还是 timer

绝大多数常规定时任务用 cron 就够，简单直观、到处通用。需要"错过的任务开机补跑、精细的日志和依赖控制"时再上 systemd timer。新项目官方更推荐 timer，但 cron 的学习成本和兼容性依然是优势。

## 小结

cron 用五字段时间表加 crontab -e 管理，命令写全路径、输出重定向到日志是两个防坑关键。systemd timer 是更现代的方案（timer 定时间、service 定动作、enable --now 启用、list-timers 查看）。备份和清理这类到点该做的事，交给计划任务就不用再惦记了。