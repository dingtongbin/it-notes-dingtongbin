# 磁盘配额 quota

一台多用户服务器，任何一个用户跑个失控脚本把日志写爆根分区，所有人跟着遭殃。磁盘配额（quota）就是给用户或组设"硬盘用量上限"，超了就写不进去。这一篇以 xfs 自带的 xfs_quota 为主讲配额的启用与日常管理。

## 两种配额类型

| 类型 | 限制什么 | 说明 |
| --- | --- | --- |
| 容量配额 | 总字节数（blocks） | 用户最多能占多少空间 |
| 文件数配额 | inode 数 | 用户最多能建多少个文件 |

配额又有软限制与硬限制：软限制超出后进入宽限期（默认七天），期间还能写但每次警告；宽限期一过，软限制当硬限制执行。硬限制是绝对红线，立刻拒绝写入。

## xfs 文件系统启用配额

xfs 的配额在挂载选项里开启。编辑 /etc/fstab 给目标挂载点加 uquota（用户配额）、gquota（组配额）：

```text
UUID=xxxx  /mnt/data  xfs  defaults,uquota,gquota  0  2
```

重新挂载生效：

```bash
sudo umount /mnt/data
sudo mount -a
mount | grep quota
```

## 设置用户配额

给用户 tom 设 10G 硬限制、8G 软限制：

```bash
sudo xfs_quota -x -c 'limit bsoft=8g bhard=10g tom' /mnt/data
```

限制文件数则是 isoft/ihard：

```bash
sudo xfs_quota -x -c 'limit ihard=100000 tom' /mnt/data
```

给目录设限额（xfs 较新内核支持项目配额 project quota），先给目录打上项目标记，再对项目限额，适合"每个租户一个目录"的场景。

## 查看配额使用

```bash
sudo xfs_quota -x -c 'report -h' /mnt/data
```

输出各用户已用空间与软硬限制，-h 人类可读单位。看单个用户：

```bash
sudo xfs_quota -x -c 'quota -h -u tom' /mnt/data
```

## ext4 的做法

ext4 走 quota 工具集，步骤略繁：

```bash
sudo apt install quota
# fstab 选项加 usrquota,grpquota 后重新挂载
sudo quotacheck -cum /mnt/data
sudo quotaon /mnt/data
sudo edquota tom      # 交互式编辑限制
sudo repquota -h /mnt/data
```

日常监控主要用 repquota 汇总各用户用量。

## 宽限期管理

软限制的宽限期默认七天，可调整：

```bash
sudo xfs_quota -x -c 'timer -b 3d' /mnt/data
```

宽限期归零后软限制升级为强制。用户被硬限制挡住时，写入直接报 No space left on device， rm 掉一些文件即可恢复。

## 常见错误自查

- 设置后不生效 → 挂载选项没加 uquota，或没重新挂载。
- report 全是 0 → 没跑 quotaon（ext4）或挂载点路径给错（xfs_quota 命令尾部的路径必须是挂载点）。
- 用户报 No space left on device 但 df -h 还有空间 → 大概率是 inode 配额或文件数限制打满，看 report 的 -i 输出。
- Docker/K8s 场景配额不生效 → 容器内文件计入挂载点所属项目或用户的配额，规划时把容器存储单独分区。

## 小结

配额防的是"一个人写爆全员的盘"。xfs 用挂载选项 uquota 加 xfs_quota limit/report 两板斧；ext4 用 quotacheck、quotaon、edquota、repquota 套件。记住软限制有宽限期、硬限制是红线，被挡住先看是容量还是文件数打满。配额与加密、LVM 互相独立，按需组合。