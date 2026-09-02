# 网络配置netplan与网络诊断

服务器离开网络寸步难行。这一篇讲 Ubuntu 的网络配置方式 netplan、怎么设静态 IP 和网关，以及一套从连通性查到 DNS 的网络诊断方法。

## Ubuntu 用什么配网络

较新的 Ubuntu 用 netplan 管理网络：用 YAML 文件描述网卡和 IP，配置在 /etc/netplan/ 下，文件名类似 01-netcfg.yaml 或 50-cloud-init.yaml。

DHCP 自动获取 IP 的最小配置：

```yaml
network:
  version: 2
  ethernets:
    eth0:
      dhcp4: true
```

静态 IP 配置：

```yaml
network:
  version: 2
  ethernets:
    eth0:
      dhcp4: false
      addresses:
        - 192.168.1.100/24
      routes:
        - to: default
          via: 192.168.1.1
      nameservers:
        addresses:
          - 8.8.8.8
          - 1.1.1.1
```

改完应用：

```bash
sudo netplan apply
```

注意 YAML 缩进必须用空格（不能用 Tab），层级错了 netplan 直接报错。

## 查看网卡与 IP

```bash
ip addr        # 所有网卡和 IP（等价 ip a）
ip link        # 只看网卡状态
ip route       # 路由表（默认网关在这）
```

网卡名不一定是 eth0，常见的还有 ens3、ens33、enp0s3，以 ip addr 的输出为准。

## 网络诊断一条链

连不上网时按这个顺序排查，层层收窄：

```bash
# 1. 网卡是否 UP、有没有 IP
ip addr

# 2. 看默认网关
ip route

# 3. ping 网关（内网连通性）
ping -c 4 192.168.1.1

# 4. ping 公网 IP（外网连通性）
ping -c 4 8.8.8.8

# 5. 测 DNS 解析
nslookup example.com
```

定位方法：
- 网卡没 IP → netplan 配置或物理连接问题
- 有 IP 但 ping 不通网关 → 内网链路问题
- 通网关但 ping 不通外网 → 出网或防火墙问题
- 能 ping 通 IP 但域名解析失败 → DNS 问题

## 端口层排查

网络通了但连不上服务，查端口：

```bash
ss -tlnp                 # 本机监听中的端口及进程
curl -v http://example.com   # 测试能否访问某 URL
nc -zv 1.2.3.4 80        # 测目标端口通不通
```

ss 替代了旧的 netstat，排查"端口有没有监听、是哪个进程在监听"全靠它。网络通了但服务连不上，90% 是服务没监听或防火墙没放行。

## 临时改 IP（重启失效）

快速测试可以直接用 ip 命令，不动配置文件：

```bash
sudo ip addr add 192.168.1.200/24 dev eth0
sudo ip route add default via 192.168.1.1
```

## 小结

Ubuntu 网络用 netplan（YAML + netplan apply），注意缩进用空格。查看用 ip addr、ip route。诊断一条链：网卡 IP → ping 网关 → ping 外网 → DNS → 端口（ss -tlnp）。大部分连不上的问题都能在这条链上定位到具体层级，最后剩防火墙的坑在下一篇展开。