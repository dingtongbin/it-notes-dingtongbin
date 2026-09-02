# 进程管理与systemd服务

服务器上跑的每个程序都是一个进程，而 Ubuntu 用 systemd 管理服务的启停和开机自启。这一篇讲怎么查看和关闭进程，以及怎么用 systemctl 管理服务。

## 查看进程

```bash
ps aux              # 当前所有进程的快照，含 CPU/内存占用
top                 # 实时刷新进程列表
htop                # 更友好的交互式实时视图（需安装）
```

看某个进程在不在，用 grep 过滤：

```bash
ps aux | grep nginx
pgrep nginx         # 直接输出匹配进程的 PID
```

## 终止进程

```bash
kill 1234           # 按 PID 结束进程（请求正常退出）
kill -9 1234        # 强制杀死，不到万不得已别用
pkill nginx         # 按名字结束所有匹配进程
```

kill -9 相当于突然断电，进程来不及保存状态和释放资源，可能留下脏数据。能用普通 kill 就不上 -9。

## systemd 与 systemctl

systemd 是 Ubuntu 的第一个进程（PID 1）和系统服务管理器，每个服务对应一个 .service 单元文件，操作服务的命令是 systemctl：

```bash
systemctl status nginx      # 看服务状态（排查第一站）
systemctl start nginx       # 启动服务
systemctl stop nginx        # 停止服务
systemctl restart nginx     # 重启服务
systemctl reload nginx      # 平滑重载配置，不断服务
systemctl enable nginx      # 设置开机自启
systemctl disable nginx     # 取消开机自启
```

status 输出会告诉你：是否 active、最近日志、进程信息。服务出问题基本都从 systemctl status 服务名 开始查。

## enable 和 start 的区别

新手最容易混这两个：

- start：立刻启动服务，仅本次生效。
- enable：设置开机自动启动，不立即启动。

要"现在跑起来且以后开机也自启"，两个都要，或一步到位：

```bash
sudo systemctl enable --now nginx
```

## 查看服务单元文件

服务怎么启动、用什么用户、指向哪个可执行文件，写在单元文件里：

```bash
systemctl cat nginx                          # 查看 nginx 的单元文件内容
ls /etc/systemd/system/                      # 列出（含自定义的）单元文件
systemctl list-unit-files --type=service --state=enabled   # 列出开机自启的服务
```

## 进程与服务的关系

一个 systemd 服务通常会拉起一个或多个进程。看服务层用 systemctl，看具体进程用 ps，两者配合使用。systemctl status 输出里的 CGroup 部分，就列着这个服务管理的所有进程。

## 小结

查进程用 ps/top，结束进程用 kill/pkill（少用 -9）。systemd 管服务，systemctl 是入口：status 查状态、start/stop/restart 控制启停、reload 平滑重载、enable 管开机自启（start+enable 用 enable --now 一步到位）。会看进程也会管服务，这台机器就跑得明明白白。