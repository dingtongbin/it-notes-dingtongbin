# LVM 扩容与缩容

LVM 最常用的场景就是在线扩容：LV 空间不够了，加盘、扩卷、撑文件系统，全程业务不停。这一篇讲扩容的完整链路，以及高风险的缩容操作怎么做才安全。

## 扩容的三种情形

| 情形 | 做法 |
| --- | --- |
| VG 还有剩余空间 | 直接 lvextend |
| VG 没空间但有新盘 | pvcreate + vgextend 后再扩 LV |
| 原盘是虚拟机磁盘 | 先在虚拟化平台扩盘，再扩 PV |

## 情形一：VG 有剩余，直接扩 LV

```bash
sudo vgs                      # 看 VFree 还有多少
sudo lvextend -L +50G /dev/datavg/datalv
```

-L +50G 表示在现有基础上加 50G；-L 150G 则是"扩到 150G"的绝对写法，两者别混。

扩完 LV 只是块设备变大了，上面的文件系统还不知道，必须再撑一步。

## 扩文件系统

ext4 系列：

```bash
sudo resize2fs /dev/datavg/datalv
df -h /mnt/data
```

xfs 系列：

```bash
sudo xfs_growfs /mnt/data
```

注意两者对象不同：resize2fs 接设备路径，xfs_growfs 接挂载点，且 xfs 只能扩不能缩。

也可以一条命令到位，lvextend 自带 -r 参数自动调文件系统：

```bash
sudo lvextend -r -L +50G /dev/datavg/datalv
```

生产上建议永远带 -r，忘掉 resize 这一步是最常见的"扩了没生效"事故。

## 情形二：加新盘扩容

```bash
sudo pvcreate /dev/sdc
sudo vgextend datavg /dev/sdc
sudo lvextend -r -l +100%FREE /dev/datavg/datalv
```

三步串起来：新盘变 PV，入池 VG，然后把池里的空闲空间全给 LV 并同步扩文件系统。

## 情形三：虚拟机盘扩容

先在 VMware/KVM/云平台上把虚拟盘扩大，重启或 echo 1 > /sys/class/block/sdb/device/rescan 让内核识别新容量，然后：

```bash
sudo growpart /dev/sdb 1          # 扩分区（cloud-utils 包）
sudo pvresize /dev/sdb1           # PV 跟着盘变大
sudo lvextend -r -l +100%FREE /dev/datavg/datalv
```

## 缩容：高危操作

缩容方向相反：先缩文件系统，再缩 LV。顺序反了或算错数，数据直接损毁。ext4 缩容必须先卸载：

```bash
sudo umount /mnt/data
sudo e2fsck -f /dev/datavg/datalv     # 强制检查
sudo resize2fs /dev/datavg/datalv 50G # 文件系统缩到 50G
sudo lvreduce -L 50G /dev/datavg/datalv
sudo mount /dev/datavg/datalv /mnt/data
```

铁律：文件系统缩到的大小 ≥ lvreduce 的目标大小，且两者都必须大于已用数据量。xfs 不支持缩容，要缩只能备份数据后重建。

生产建议：缩容前先做快照（见下一篇），确认数字无误再动手；拿不准就备份重建，别硬缩。

## 数据迁移：pvmove

想把某块旧盘从 VG 里摘掉（换盘、下线），用 pvmove 把它的数据挪到其他 PV：

```bash
sudo pvmove /dev/sdb
sudo vgreduce datavg /dev/sdb
sudo pvremove /dev/sdb
```

pvmove 可以在线做，数据边搬业务边跑。搬完的盘就从 VG 里安全退场了。

## 常见错误自查

- lvextend 后 df -h 没变化 → 忘了 resize2fs/xfs_growfs，或没用 -r。
- xfs_growfs 报 is not a mounted XFS filesystem → 参数应传挂载点不是设备路径。
- resize2fs 缩容报 on-line shrinking not supported → 缩容必须先 umount。
- lvreduce 后文件系统打不开 → 缩容顺序或大小算错，从快照/备份恢复。
- growpart 找不到命令 → apt install cloud-guest-utils。

## 小结

扩容链路：VG 没空间就加 PV 入池，lvextend -r 一步扩 LV 加文件系统。缩容是高危操作：先 umount、e2fsck、resize2fs 缩文件系统，再 lvreduce，数字必须精心核算，动手前先做快照。换盘下线用 pvmove 在线迁移。记住"扩容随意、缩容谨慎"，LVM 就用对了一大半。