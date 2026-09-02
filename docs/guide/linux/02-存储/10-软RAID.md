# 软 RAID

RAID 把多块盘组合成一个逻辑盘，换来性能、冗余或两者兼有。Linux 内核自带的 mdadm 能不依赖 RAID 卡直接做软 RAID。这一篇讲常用 RAID 级别的原理与 mdadm 实操。

## RAID 级别速览

| 级别 | 做法 | 容量利用率 | 容错 | 典型用途 |
| --- | --- | --- | --- | --- |
| RAID 0 | 条带化，数据分片写到各盘 | 100% | 无，坏一块全完 | 追求速度的临时数据 |
| RAID 1 | 镜像，每块盘内容相同 | 50% | 可坏一半盘（不含同盘） | 系统盘、小容量高可靠 |
| RAID 5 | 条带加分布式校验 | (N-1)/N | 可坏一块 | 读多写少的通用盘组 |
| RAID 10 | 先镜像后条带 | 50% | 每组可坏一块 | 数据库等高性能高可靠 |

生产上系统盘用 RAID 1，数据盘按写入压力在 RAID 5 与 RAID 10 之间选。RAID 0 只用于可随时丢失的临时数据。

## 创建 RAID

以四块盘做 RAID 10 为例：

```bash
sudo apt install mdadm
sudo mdadm --create /dev/md0 --level=10 --raid-devices=4 /dev/sd[b-e]
```

- --level 指定级别，--raid-devices 指定成员盘数。
- /dev/sd[b-e] 是 bash 展开写法，等于 sdb sdc sdd sde。

创建后查看初始化进度（同步各盘）：

```bash
cat /proc/mdstat
sudo mdadm --detail /dev/md0
```

## 格式化与挂载

RAID 阵列就是一个块设备，直接当普通盘用：

```bash
sudo mkfs.ext4 /dev/md0
sudo mount /dev/md0 /mnt/raid
df -h /mnt/raid
```

开机自动挂载同样写 fstab，用 blkid 查 md0 的 UUID。

## 保存配置

装好后把阵列信息写进配置文件，否则重启后阵列名可能漂移：

```bash
sudo mdadm --detail --scan | sudo tee -a /etc/mdadm/mdadm.conf
sudo update-initramfs -u
```

## 模拟故障与换盘

运维必须演练。手动标记一块盘故障：

```bash
sudo mdadm /dev/md0 --fail /dev/sdb
sudo mdadm /dev/md0 --remove /dev/sdb
cat /proc/mdstat        # 观察降级状态
```

插入新盘后加入阵列，自动开始重建：

```bash
sudo mdadm /dev/md0 --add /dev/sdb
cat /proc/mdstat        # recovery 进度
```

重建期间阵列性能下降，属于正常现象；重建完成前再坏一块（RAID 5 场景）数据就没了，尽快换盘是纪律。

## 常见错误自查

- 重启后 /dev/md0 变成 /dev/md127 → 没做 mdadm.conf 持久化，按上面的 --scan 步骤补。
- 成员盘上有旧超级块导致创建失败 → 先 wipefs -a 清掉旧 RAID 信息。
- 重建速度极慢 → cat /proc/sys/dev/raid/speed_limit_min 调整重建限速。
- 误拔好盘导致阵列降级 → mdadm --re-add 重新加回。
- RAID 卡硬阵列与 mdadm 软阵列混用分不清 → lsblk 看 TYPE 列，raid1/raid10 类型的是 md 设备。

## 小结

软 RAID 用 mdadm：--create 建阵列、mkfs 后当普通盘挂载、配置务必 --scan 进 mdadm.conf 并更新 initramfs。级别选择记"系统盘 RAID 1、通用 RAID 5、重写入 RAID 10"。换盘三步 --fail、--remove、--add，平时主动演练。下一篇把 LVM 与 RAID 放一起对比选型。