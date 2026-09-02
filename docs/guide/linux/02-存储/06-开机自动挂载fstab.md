# 开机自动挂载 fstab

上一章的 mount 只对本次运行有效，重启后挂载就失效了。这篇文档解决如何让磁盘在开机时自动挂载：/etc/fstab 的六个字段含义、如何用 UUID 与 blkid 安全引用设备、以及 fstab 写错导致起不来时怎么救。

## fstab 是六列配置表

/etc/fstab 的每一行描述一个"要挂载的东西"，每行六个字段，用空白或制表符分隔：

```bash
<设备>  <挂载点>  <文件系统类型>  <挂载选项>  <dump>  <fsck>
```

| 字段 | 含义 | 例子 |
| --- | --- | --- |
| 设备 | 要挂载的设备 | UUID=xxx、/dev/sdb1、LABEL=xxx |
| 挂载点 | 挂到哪个目录 | /mnt/data |
| 类型 | 文件系统类型 | ext4、xfs、btrfs、swap |
| 选项 | 同 mount -o 的参数 | defaults、noatime |
| dump | 是否备份（一般 0） | 0 |
| fsck | 开机检查顺序，根必须 1，其余数据盘 2，不做检查 0 | 0 |

一个完整示例：

```bash
UUID=7f8f...e2a1  /mnt/data  ext4  defaults,noatime  0  2
```

关键的坑在于：fsck 字段数字语义，根分区是 1，其他需要检查的分区是 2，swap 和不做检查填 0。顺序错误不影响挂载，但影响开机检查阶段是否执行 fsck。

## 用 UUID 而非设备名

生产上严禁在 fstab 里写 /dev/sda1 这类设备路径，因为重启后盘名可能交换。做法是用 blkid 读出真实 UUID：

```bash
sudo blkid
```

```bash
sudo blkid /dev/sdb1
```

输出形如 UUID=7f8f...e2a1，把这串写进 fstab 第一列即可。也可以写 LABEL=卷标，但 UUID 在磁盘间冲突概率更低，更值得作为首选。

## 编写与生效

编写 fstab 时，先创建好挂载点目录，再加一行：

```bash
sudo mkdir -p /mnt/data
sudo mount -a
```

mount -a 会按 fstab 把所有条目重新挂一遍，落成挂载后再 df -h 确认。

写好之后建议用下面的命令做一遍语法预检，判断每一条是否可挂：

```bash
sudo mount -a
echo $?
```

返回 0 说明这条 fstab 至少能挂上，重启前才敢放心。

## 写错 fstab 导致起不来怎么办

fstab 写错（比如 UUID 敲错、挂载点目录不存在）后，重启时 init 会在挂载阶段进入维护模式，报出无法挂载的错误。典型的处理办法是随后重建正确的 fstab。

走恢复模式，在单用户 shell 里把 fstab 回退：把损坏行注释掉或改成正确值，然后重新尝试。如果仍然失败，可以以只读方式启动，手动执行 mount -o remount,rw / 后编辑 /etc/fstab，再重启恢复。

超时值也值得背下来：默认系统等待 fstab 挂载超时需要较长时间，故障排查时主要找打印出的挂载失败行，再针对那行修正。

## 常见错误自查

- 首列写了 /dev/sda1 但重启后盘名变化 → 改用 UUID。
- fsck 字段给数据盘写了 1 → 开机每次都会执行 fsck，数据盘应写 2。
- 挂载点目录的权限与文件系统根权限不一致 → 用 ls -ld 查两个目录权限。
- 用了不存在的文件系统类型字段 → 检查 fstab 第三列与 blkid 的 TYPE 是否一致。
- fstab 末尾有额外空格或隐藏字符 → 检查，并避免复制粘贴引入断行问题。

## 小结

fstab 用六列描述自动挂载：设备最好用 blkid 出来的 UUID，文件系统类型与选项务必和真实分区一致，dump 一般写 0，根分区 fsck 写 1、数据盘写 2。写完用 mount -a 预检，确认 echo $? 为 0 再重启。fstab 写错进不了系统时，从恢复模式纠正该行或注释掉。牢记"引用尽量用 UUID、每次改动都重启前预检"这两条就万无一失。