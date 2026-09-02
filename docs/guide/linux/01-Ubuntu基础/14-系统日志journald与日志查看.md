# 系统日志journald与日志查看

系统出问题时，日志是唯一诚实的地图。Ubuntu 用 systemd 的 journald 收集日志，用 journalctl 查看。这一篇讲日志在哪、怎么看、怎么实时跟踪、怎么清理。

## 日志在哪

Ubuntu 的日志分两类：

- journald：systemd 统管的日志，二进制格式，用 journalctl 查看。
- 传统文本日志：/var/log/ 目录下，如 syslog、auth.log、kern.log。

应用日志也习惯写到 /var/log/ 下的文件。journald 默认日志存内存、重启即丢，要持久化需改配置。

## journalctl 基础用法

```bash
journalctl                       # 本次启动以来的所有日志
journalctl -e                    # 跳到日志尾部
journalctl -f                    # 实时跟踪新日志（类似 tail -f）
journalctl -u nginx              # 只看某服务的日志
journalctl --since "1 hour ago"  # 只看最近一小时
journalctl --since today         # 只看今天
journalctl -p err                # 只看 err 及以上级别
journalctl -b                    # 只看本次启动的日志
```

排查服务挂掉，第一条命令就是：

```bash
journalctl -u 服务名 -f
```

实时滚动看它报什么、哪里崩了。

## 查看文本日志

```bash
tail -f /var/log/syslog        # 系统综合日志，实时跟踪
tail -100 /var/log/auth.log    # 登录认证日志
grep Failed /var/log/auth.log  # 看有没有人在撞密码
```

登录相关的排查（暴力破解、异常登录）重点看 /var/log/auth.log。

## 日志级别

| 级别 | 含义 |
|---|---|
| emerg / alert / crit | 系统级紧急 |
| err | 错误，通常需要处理 |
| warning | 警告，值得留意 |
| notice / info | 常规信息 |
| debug | 调试细节 |

用 -p 过滤级别，能快速把错误从海量信息里捞出来。

## 让 journald 日志持久化

默认日志存内存，重启丢失。持久化保存到磁盘：

```bash
sudo mkdir -p /var/log/journal
sudo systemd-tmpfiles --create --prefix /var/log/journal
sudo systemctl restart systemd-journald
```

之后日志重启不丢，排查跨重启的问题才有依据。

## 查看占用与清理

```bash
journalctl --disk-usage              # 看日志占多少磁盘
sudo journalctl --vacuum-size=500M   # 只保留最近 500M
sudo journalctl --vacuum-time=7d     # 只保留最近 7 天
```

日志会持续累积，磁盘紧张时清一清是常规运维操作。

## 小结

journald 是 Ubuntu 的日志中心，journalctl 是查看入口：-u 看某服务、-f 实时跟踪、-p 按级别过滤、--since 按时间查。传统日志在 /var/log/ 下用 tail 和 grep。持久化建 /var/log/journal，磁盘紧张用 --vacuum 清理。出问题先看日志，比瞎猜快一百倍。