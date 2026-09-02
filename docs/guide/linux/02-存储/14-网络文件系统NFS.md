# 网络文件系统 NFS

数据要被多台机器共享：网站集群的静态目录、AI 训练的数据集、共享的家目录。NFS（Network File System）是 Unix 侧最经典的答案：服务端导出一个目录，客户端挂进来当本地盘用。这一篇讲 Ubuntu 上的服务端与客户端配置。

## 架构一句话

NFS 服务端把目录"导出"（export），客户端经网络挂载。读写发生在服务端磁盘上，客户端看到的就是个普通目录（性能受网络影响）。

## 服务端配置

安装并启动：

```bash
sudo apt install nfs-kernel-server
```

准备要共享的目录并写导出配置 /etc/exports：

```bash
sudo mkdir -p /srv/share
```

```text
/srv/share  192.168.1.0/24(rw,sync,no_subtree_check)
```

这行的语义：把 /srv/share 导出给 192.168.1.0/24 网段，可读写、写操作落盘后确认、允许目录结构检查放宽。

常用选项速查：

| 选项 | 含义 |
| --- | --- |
| rw / ro | 可读写 / 只读 |
| sync / async | 同步落盘（安全） / 异步（快但断电可能丢数据） |
| no_root_squash | 允许客户端 root 拥有 root 权限（危险，慎用） |
| root_squash | 默认值，客户端 root 压缩为匿名用户 |
| no_subtree_check | 跳过子树检查，兼容性更好 |

生效并验证：

```bash
sudo exportfs -ra
sudo exportfs -v
showmount -e localhost
```

## 客户端挂载

```bash
sudo apt install nfs-common
sudo mkdir -p /mnt/share
sudo mount -t nfs 192.168.1.10:/srv/share /mnt/share
df -h /mnt/share
```

开机自动挂载写 /etc/fstab，加 _netdev 选项表示等网络就绪再挂：

```text
192.168.1.10:/srv/share  /mnt/share  nfs  defaults,_netdev  0  0
```

## 权限模型：uid 对齐

NFS 的权限按 uid/gid 比对：客户端上的用户 uid 若与服务端文件属主 uid 一致，就拥有对应权限。多机协同时要保证各机 uid 分配一致，或统一用 LDAP/AD 管账号。

常见现象：客户端 root 建的文件在服务端显示为 nobody:nogroup，这就是 root_squash 在起作用，属正常安全行为。

## 性能与稳定性建议

- 挂载加 rsize=65536,wsize=65536 提高吞吐（现代默认已较大，按需调）。
- 大量小文件元数据操作是 NFS 弱项，数据库、git 仓库别放 NFS 上。
- 跨公网用 NFS 明文传输既不安全也不稳定，需要远程访问请走 VPN 或换 SSHFS/S3。

## 常见错误自查

- mount 报 access denied → 服务端 exports 的网段没覆盖客户端 IP，或 exportfs -ra 没执行。
- mount 卡住很久 → 服务端防火墙挡了 2049 端口，或 NFSv4 端口未放行。
- 挂上了但无法写入 → 服务端目录属主与客户端 uid 不匹配，或导出是 ro。
- 重启后挂载失败拖慢开机 → fstab 缺 _netdev，或网络未就绪，考虑改 autofs 按需挂载。
- 服务端改了 exports 客户端没变化 → umount 后重新 mount。

## 小结

NFS 三步走：服务端 exports 写配置加 exportfs -ra，客户端 mount -t nfs 挂载，fstab 用 _netdev 持久化。权限靠 uid 对齐，root_squash 是安全默认。局域网共享大目录用它最顺，公网和高频小文件场景请换方案。下一篇讲块级别的网络存储 iSCSI。