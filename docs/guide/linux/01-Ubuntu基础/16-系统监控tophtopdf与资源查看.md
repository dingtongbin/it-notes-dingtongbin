# 系统监控tophtopdf与资源查看

服务器慢、磁盘满、内存不足，都需要第一时间确认资源状况。这一篇讲用 top/htop 看 CPU 与进程、用 free 看内存、用 df/du 看磁盘，掌握一套快速排查套路。

## CPU 与进程实时监控：top / htop

```bash
top      # 实时刷新 CPU/内存/进程
htop     # 更友好，需先 sudo apt install htop
```

top 界面顶部重点看：
- load average：最近 1/5/15 分钟的负载均值，数字约等于等待 CPU 的任务数
- %Cpu(s)：CPU 使用率分布（us 用户、sy 系统、id 空闲）

进程列表默认按 CPU 排序，一眼看出谁在烧资源。htop 有彩色界面、方向键操作、鼠标点选，上手更顺。

判断系统是否过载：load average 长期高于 CPU 核数就要警惕。

## 内存：free

```bash
free -h    # 查看内存和 swap 用量
```

重点看 available 列（实际可用），不要只看 free 列。Linux 会把空闲内存拿去做缓存，所以 used 看着高、available 可能很充足。真正的内存压力信号是 swap 被大量使用。

## 磁盘：df 与 du

```bash
df -h                  # 各挂载点使用率
df -i                  # inode 使用率
du -sh /var/log        # 某目录占用多少
du -sh * | sort -h     # 当前目录各项大小排序
```

两个经典故障：
- 磁盘满（df 到 100%）：用 du 逐层找最大目录清理。
- df 有空间但写不进文件：inode 满了，df -i 查。海量小文件会吃光 inode。

## 一秒排查套路

怀疑服务器卡，按这个顺序快速看：

```bash
uptime        # 负载
free -h       # 内存
df -h         # 磁盘
top           # CPU 和进程
```

对应的判断：
- load 很高 → 看 top 里的 CPU 和进程
- swap 大量使用 → 内存不足
- 磁盘 100% → 清文件或扩容
- 某进程 CPU 飙高 → 定位到具体进程再处理

## 按内存排序找嫌疑进程

```bash
ps aux --sort=-%mem    # 按内存从高到低列进程
ps aux --sort=-%cpu    # 按 CPU 从高到低
```

排查内存泄漏或异常进程，ps 排序能快速抓到嫌疑犯。

## 小结

监控三件套：top/htop 看 CPU 和进程、free -h 看内存（重点 available 和 swap）、df -h 和 du 看磁盘（别忘了 df -i 查 inode）。排查思路是"负载、内存、磁盘、进程"四层从宏观到微观收窄。磁盘满先 du 找大头，写不进先 df -i 查 inode。