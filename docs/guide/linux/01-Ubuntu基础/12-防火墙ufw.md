# 防火墙ufw

服务器暴露在公网上，防火墙是第一道防线。Ubuntu 默认的防火墙是 ufw（Uncomplicated Firewall），上手极快。这一篇讲怎么开启、放行端口、封禁，以及最关键的安全提醒。

## 开启与状态

```bash
sudo ufw status            # 查看状态和规则
sudo ufw status verbose    # 详细模式
sudo ufw enable            # 开启防火墙
sudo ufw disable           # 关闭防火墙
```

新装系统 ufw 默认不启用。生产服务器建议开启，但开启前务必确认 SSH 已放行，否则会把自己锁在外面。

## 放行端口

```bash
sudo ufw allow ssh                        # 按服务名放行（22）
sudo ufw allow 80                         # HTTP
sudo ufw allow 443                        # HTTPS
sudo ufw allow 8080/tcp                   # 指定协议
sudo ufw allow from 1.2.3.4               # 放行某来源 IP 的所有端口
sudo ufw allow from 1.2.3.4 to any port 22   # 只放某 IP 访问 22
```

## 默认策略

ufw 默认对入站连接拒绝、出站放行：

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
```

所以只需手动放行需要的入口，其余一律被挡，这是安全的默认姿态。

## 封禁与删除规则

```bash
sudo ufw deny 23                  # 封禁 23 端口
sudo ufw deny from 1.2.3.4        # 封禁某 IP
sudo ufw delete allow 80          # 删除之前放行的规则
sudo ufw status numbered          # 带编号显示
sudo ufw delete 2                 # 按编号删除
```

## 最关键的提醒：先放 SSH

很多人配 ufw 的翻车现场就是：没放 SSH 就 enable，远程连接立刻断掉，只能去云控制台救援。正确顺序：

```bash
sudo ufw allow ssh     # 第一步永远是它
sudo ufw enable
```

更安全的做法是只允许自己的 IP 连 SSH：

```bash
sudo ufw allow from 你的固定IP to any port 22
```

## 排查思路

网络通了但服务连不上，按顺序查：

```bash
ss -tlnp        # 服务本身在监听吗
sudo ufw status # 防火墙放行了吗
```

防火墙放行了但服务没监听，同样连不上。防火墙只是安全的一环，不是唯一答案。

## 小结

ufw 用法一句话：enable 开启、allow 放行、deny 封禁、default deny incoming + allow outgoing 是合理默认。最要命的是先放 SSH 再 enable，别把自己锁外面。配合 ss 确认服务监听，连接问题基本都能定位。安全原则：宁可小口放开再补，不用 0.0.0.0 全开。