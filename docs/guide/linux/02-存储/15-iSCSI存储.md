# iSCSI 存储

NFS 共享的是"目录"（文件级），iSCSI 共享的是"整块盘"（块级）：服务端把一块磁盘或 LUN 通过网络模拟成 SCSI 设备，客户端认出来就是一块本地盘，想怎么分区格式化都行。数据库、虚拟化平台常用它接存储。

## 文件级与块级的区别

| 维度 | NFS | iSCSI |
| --- | --- | --- |
| 共享粒度 | 目录（文件级） | 磁盘/LUN（块级） |
| 客户端感知 | 明白的目录 | 一块裸盘，自己格式化 |
| 能否多机同时挂 | 原生支持 | 默认不行，需集群文件系统 |
| 典型用途 | 共享文档、静态资源 | 数据库盘、虚拟机盘 |

iSCSI 盘同时只能给一台机器用（除非上层是 GFS2、OCFS2 这类集群文件系统），这是与 NFS 最大的使用差异。

## 术语速览

- Target：服务端，导出存储的一端。
- Initiator：客户端，消费存储的一端。
- LUN：Target 里编号的逻辑单元，一个 LUN 对应一块"盘"。
- IQN：iSCSI 的全球唯一名字，形如 iqn.2026-01.com.example:server1。

## 服务端（Target）配置

安装并准备一块要导出的盘（可以是整盘 /dev/sdb，也可以是 LV）：

```bash
sudo apt install targetcli-fb
sudo targetcli
```

targetcli 是交互式 shell，创建全流程：

```text
/> backstores/block create share0 /dev/sdb
/> iscsi/ create iqn.2026-01.com.example:server1
/> iscsi/iqn.../tpg1/luns create /backstores/block/share0
/> iscsi/iqn.../tpg1/acls create iqn.2026-01.com.example:client1
/> saveconfig
/> exit
```

acl 那一步把访问权限绑定给指定客户端的 IQN，没登记的 initiator 连不上。

确认监听（默认 3260 端口）：

```bash
sudo ss -tlnp | grep 3260
```

## 客户端（Initiator）配置

```bash
sudo apt install open-iscsi
sudo systemctl enable --now iscsid
```

发现并登录：

```bash
sudo iscsiadm -m discovery -t sendtargets -p 192.168.1.10
sudo iscsiadm -m node --login
lsblk        # 多出来的盘就是 LUN
```

登录成功后 /dev/sdb 这类设备出现，分区、mkfs、挂载全按本地盘操作。开机自动登录：

```bash
sudo iscsiadm -m node --op update -n node.startup -v automatic
```

## 与 LVM 配合

远端 LUN 到手后照样交给 LVM 池化：

```bash
sudo pvcreate /dev/sdb
sudo vgcreate iscsivg /dev/sdb
sudo lvcreate -l 100%FREE -n datalv iscsivg
```

网络存储加上 LVM 的弹性，扩容时在 Target 侧扩大 LUN，客户端 iscsiadm 重新扫描后 pvresize 即可。

## 常见错误自查

- 发现不到 Target → 3260 端口不通或网段不对，先 telnet 192.168.1.10 3260。
- 登录报 authorization failure → 服务端 acl 没登记客户端 IQN。
- 登录成功但 lsblk 没新盘 → 看 dmesg，或 rescan：iscsiadm -m node --rescan。
- 重启后 iSCSI 盘的 fstab 挂载失败 → 用 _netdev 选项并确认 node.startup 为 automatic。
- 两台机器同时格式化同一 LUN → 数据互踩损坏，除非装集群文件系统，否则一 LUN 一主机。

## 小结

iSCSI 把远端盘变成"本地盘"：服务端 targetcli 建 Target 导出 LUN，客户端 iscsiadm 发现登录，之后分区格式化全按本地操作。记住一 LUN 只喂一台机、开机自动登录、fstab 配 _netdev 三个纪律。至此文件级（NFS）与块级（iSCSI）两条网络存储路子都齐了，接下来回到本地排障。