# LVM 逻辑卷管理

前面几章的分区是"死"的：多大就多大，改起来要停机。LVM（Logical Volume Manager）在磁盘和文件系统之间加了一层抽象，让"分区"变成可以随时伸缩、可以跨盘的逻辑卷。这一篇讲 LVM 的三层模型与建卷全流程。

## 为什么需要 LVM

传统分区三大痛点：

- 分区大小定死，空间不够只能停机重建。
- 一个分区只能在一块盘上，单盘容量是上限。
- 迁移数据要 umount、复制、改挂载点，业务得停。

LVM 把"空间"从物理盘里抽象出来，动态扩容、跨盘聚合、快照备份都成为运行时操作。

## 三层模型：PV → VG → LV

| 层 | 全称 | 角色 | 类比 |
| --- | --- | --- | --- |
| PV | Physical Volume 物理卷 | 一块磁盘或分区，被 LVM 接管的原料 | 砖头 |
| VG | Volume Group 卷组 | 把多个 PV 池化成一个大盘 | 用砖头砌的料池 |
| LV | Logical Volume 逻辑卷 | 从 VG 里切出来的一块"虚拟分区"，格式化后挂载用 | 从料池里取料做的成品 |

关键思想：VG 是可自由分配的空间池，LV 要多大就从池里舀多少，不够了往池里加 PV 即可。

## 准备环境

LVM 工具一般要装包：

```bash
sudo apt install lvm2
```

假设有一块新盘 /dev/sdb 整盘给 LVM 用。先确认盘上没有分区和数据：

```bash
lsblk /dev/sdb
```

## 创建 PV

```bash
sudo pvcreate /dev/sdb
sudo pvdisplay
sudo pvs
```

pvdisplay 显示详细属性（总大小、PE 大小、属于哪个 VG），pvs 是精简一行的速览版。

PV 的最小分配单位叫 PE（Physical Extent），默认 4MB。VG 内部按 PE 计数分配空间，所以 LV 大小是 PE 的整数倍。

## 创建 VG

```bash
sudo vgcreate datavg /dev/sdb
sudo vgdisplay
sudo vgs
```

datavg 是卷组名，生产上建议用业务命名（如 datavg、logsvg），别用默认的 vg0。

如果之后新加了一块盘，往 VG 里扩：

```bash
sudo vgextend datavg /dev/sdc
```

这一步之后 VG 的可用空间就变大了，为下一篇的 LV 扩容打好了基础。

## 创建 LV

```bash
sudo lvcreate -L 100G -n datalv datavg
sudo lvdisplay
sudo lvs
```

- -L 100G 指定固定大小。
- -l 100%FREE 可以把 VG 剩余空间全部分配。
- -n datalv 指定逻辑卷名。
- datavg 指定从哪个卷组切。

也可以按 PE 数量分配：-l 25600 表示 25600 个 PE（25600 × 4MB = 100GB）。

## 格式化并挂载

LV 对应的设备路径是 /dev/卷组名/逻辑卷名：

```bash
sudo mkfs.ext4 /dev/datavg/datalv
sudo mkdir -p /mnt/data
sudo mount /dev/datavg/datalv /mnt/data
df -h /mnt/data
```

要开机自动挂载，用 blkid 查出 LV 的 UUID 写进 /etc/fstab，做法与普通分区一致，参考上一篇 fstab。

## 三层状态速查命令

日常巡检三件套：

```bash
sudo pvs        # 各 PV 多大、被哪个 VG 用了
sudo vgs        # 各 VG 总量/剩余
sudo lvs        # 各 LV 大小与所在 VG
```

## 常见错误自查

- pvcreate 提示 Device excluded by filter → 磁盘上有旧分区表残留，用 wipefs -a /dev/sdb 清掉重来（会毁数据，先确认）。
- lvcreate 报 Insufficient free space → VG 剩余空间不够，先 vgextend 或改小 -L。
- 误把装着系统的盘 pvcreate → 立即 pvremove 回退，千万别 vgcreate。
- LV 建出来忘了格式化就 mount → 报 wrong fs type，先 mkfs。

## 小结

LVM 三层模型：pvcreate 把磁盘变 PV，vgcreate 池化成 VG，lvcreate 从 VG 切出 LV，再 mkfs 后挂载使用。记住"PV 是砖、VG 是池、LV 是成品"的类比，命令顺序就不会乱。下一篇讲 LV 的扩容与缩容，那是 LVM 最大的价值所在。