# Ingress 与外部流量入口

Service 的 ClusterIP 只在集群内，NodePort 每台节点都开端口很丑，LoadBalancer 每个服务一个公网入口又贵。想用一条公网入口把很多 HTTP 服务按域名转发到不同 Service，就用 Ingress。这一篇讲 Ingress 是什么、怎么配、以及 TLS。

## Ingress 是什么

Ingress 不是真的负载均衡器，它是一套规则：声明"根据请求的域名或路径，转发到集群里的哪个 Service"。真正的流量入口由 Ingress Controller 实现，常见的是 NGINX Ingress Controller。

```
请求 → 公网入口/LB → Ingress Controller → 按域名/路径路由 → 对应 Service → Pod
```

Ingress Controller 读 Ingress 规则，把进来的 HTTP 请求按要求转发。

## 一个 Ingress 声明

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web-ingress
spec:
  rules:
    - host: app.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: web
                port:
                  number: 80
```

关键字段：rules 下按 host（域名）分流，path 决定路径，backend 指向某个 Service。这就是"按域名 + 路径转发"的声明。

## 一条入口转发多个服务

Ingress 的价值是把一堆服务收敛到一条公网入口：

```yaml
spec:
  rules:
    - host: api.example.com
      http:
        paths:
          - path: /users
            backend: { service: { name: users, port: { number: 80 } } }
          - path: /orders
            backend: { service: { name: orders, port: { number: 80 } } }
```

不同路径路由到不同后台服务，一个域名搞定，运维和证书管理都简单很多。

## TLS 终止

Ingress 常负责 HTTPS。把证书配置成一个 Secret，Ingress 引入它完成 TLS 终止：

```yaml
spec:
  tls:
    - hosts: [app.example.com]
      secretName: app-tls
```

证书放到 Secret 里，Ingress 用它解密 HTTPS，转发给后端走明文。证书过期管理也集中在入口这一层。

## Ingress Controller 与环境

要 Ingress 生效必须装一个 Controller，否则规则只是写了没人执行。不同的 Controller 能力有差异，但核心都要装好、暴露公网。

## 常见坑

1. 只写 Ingress 没装 Controller：规则不生效，先确认有 controller。
2. 转发后证书未终止：TLS 配置错，入口层做 HTTPS，后端不用再管。
3. 域名解析没指向入口：ingress 配了 host，公网 DNS 要指到入口的地址。
4. 路径匹配规则不清：pathType 和前缀匹配容易绕，先用自己的路径验证。

## 小结

Ingress 把路由规则和入口承载分开：Ingress 是声明，Controller 是实现。理解它是"按域名路径转发到 Service 的规则集"，就抓住了外部开放的核心。