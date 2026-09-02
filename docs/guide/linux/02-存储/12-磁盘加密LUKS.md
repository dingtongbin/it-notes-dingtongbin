# 磁盘加密 LUKS

笔记本丢了、硬盘退役了、机器被抱走了——只要有物理接触，未加密的磁盘就是裸奔。LUKS（Linux Unified Key Setup）是 Linux 磁盘加密的事实标准，配合 dm-crypt 内核模块把整块盘或分区加密后再用。

## 原理与层次

LUKS 在块设备层工作：明文数据写入前加密，读出时解密，全程对上层文件系统透明。解锁需要口令或密钥文件，锁着的时候盘上全是密文，拔下来挂到别的机器也读不出内容。

Ubuntu 桌面安装时的"加密主目录/全盘加密"选项，底层就是 LUKS。

## 加密一个分区

以空分区 /dev/sdb1 为例（加密会清空数据，先确认）：

```bash
sudo apt install cryptsetup
sudo cryptsetup luksFormat /dev/sdb1
```

luksFormat 会二次确认并要求设置口令，口令丢了数据就永久打不开，务必记牢。

打开加密层，映射为 /dev/mapper 下的明文设备：

```bash
sudo cryptsetup open /dev/sdb1 vault
```

之后 /dev/mapper/vault 就是一块"看起来普通"的盘，格式化挂载照旧：

```bash
sudo mkfs.ext4 /dev/mapper/vault
sudo mount /dev/mapper/vault /mnt/vault
```

用完关闭：

```bash
sudo umount /mnt/vault
sudo cryptsetup close vault
```

## 开机自动解锁

每次手动敲口令不适合服务器。常规做法是密钥文件放根分区（受系统权限保护），fstab 配自动挂载：

```bash
sudo dd if=/dev/urandom of=/root/vault.key bs=4096 count=1
sudo cryptsetup luksAddKey /dev/sdb1 /root/vault.key
```

在 /etc/crypttab 加一行：

```text
vault  UUID=xxxx  /root/vault.key  luks
```

再在 /etc/fstab 挂 /dev/mapper/vault。重启后系统读密钥自动解锁挂载。

注意：密钥文件与加密盘在同一台机器上时，防的是"盘被单独拿走"，防不了整机被入侵。要更高安全就把密钥放别的介质，开机时手动提供。

## LUKS 上叠 LVM

生产推荐的组合：先 LUKS 加密整块盘，再在解密后的映射设备上建 LVM：

```bash
sudo cryptsetup open /dev/sdb vault
sudo pvcreate /dev/mapper/vault
sudo vgcreate encvg /dev/mapper/vault
sudo lvcreate -L 100G -n datalv encvg
```

顺序是 LUKS 最底、LVM 中间、文件系统最上，扩容快照等 LVM 能力照常可用。

## 更换与销毁

换口令：

```bash
sudo cryptsetup luksChangeKey /dev/sdb1
```

盘要退役彻底销毁数据，最简单的办法是抹掉 LUKS 头（头没了密文永远解不开）：

```bash
sudo cryptsetup luksErase /dev/sdb1
```

比全盘 dd 覆写快得多。若加密前盘上有旧明文数据，仍需全盘覆写才保险。

## 常见错误自查

- cryptsetup open 报 no key available → 口令错误，或密钥文件未用 luksAddKey 注册。
- 重启后卡在输口令 → 检查 /etc/crypttab 的 UUID 是否正确（用 blkid 查）。
- 误把系统根分区 luksFormat → 立即停止，不要重启，寻求专业恢复。
- 性能明显下降 → 加密有 CPU 开销属正常，确认 CPU 有 AES-NI（lscpu 看 aes）。
- 加密盘上直接 pvcreate 了 → 应建在 /dev/mapper 映射上而不是原始分区。

## 小结

LUKS 在块设备层透明加密：luksFormat 建盘、open 映射、格式化挂载照常。服务器自动解锁用密钥文件加 crypttab。推荐 LUKS 底、LVM 中、文件系统上的三明治结构。口令即一切，丢了没救；退役盘用 luksErase 抹头即可。下一篇讲配额管理。