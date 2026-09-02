# 安装 Istio 与原理概览

理解服务网格的定位后，动手装一套。这一篇讲 Istio 的安装方式、装完的组件结构，以及它是怎么把 sidecar 注入到业务 Pod 的。装上并让它接管业务，是理解一切规则的入口。

## 安装方式

Istio 一般用 istioctl 安装：

```bash
# 下载 istioctl
curl -L https://istio.io/downloadIstio | sh -

# 安装 Istio 往集群里
istioctl install --set profile=default
```

装完后集群里出现 istio-system 命名空间，里面跑着控制面 pod，主要是 istiod。

## 装完的组件

| 组件 | 角色 |
|---|---|
| istiod | 控制面，规则翻译下发 |
| envoy proxy | 数据面，run 在每个业务 Pod 旁 |
| prometheus / grafana / kiali / jaeger 等 | 可观测组件（常由 addon 提供） |

数据面的 Envoy 不是单独部署，而是通过注入塞进每个业务 Pod。

## 启用命名空间的自动注入

要让某个命名空间里的 Pod 自动带 sidecar，给命名空间打个标签：

```bash
kubectl label namespace default istio-injection=enabled
kubectl apply -f deployment.yaml     # 之后新建的 Pod 会自动带 sidecar
```

加了标签后，这个命名空间里新创建的 Pod 都会被自动注入一个 envoy 容器。点一下这个 Pod 会用两个容器：一个业务、一个 envoy。

## sidecar 是怎么注入的

Kubernetes 有个机制叫准入控制器（webhook）。当 Pod 创建时，Istio 的 webhook 改写了 Pod 的定义，往里加进 envoy 容器，这就是"自动注入"。对业务来说零侵入，因为改的是创建时的规格，不是业务代码。

## 数据面和业务流量

```
业务请求 ──▶ sidecar(envoy)
                 ├─ 流量治理（灰度/超时/重试）
                 ├─ 指标采集
                 └─▶ 转发到下游 sidecar ──▶ 下游业务
```

进了网格后，所有进出的 TCP/HTTP 流量都经过 envoy 检查处理，治理能力开始生效。

## 验证安装成功

```bash
istioctl proxy-status    # 看每个 sidecar 和控制面的连接状态
istioctl analyze         # 检查资源配置问题
```

proxy-status 能一眼看出哪些 sidecar 没连上控制面。

## 常见坑

1. 忘了给命名空间打注入标签：Pod 不会自动带 sidecar。
2. 注入只对新建 Pod 生效：已有的要重启或重建。
3. Webhook 没生效：检查 istio 是否装好、命名空间标签属性。

## 小结

Istio 安装 = 装控制面（istiod）+ 通过 webhook 自动注入数据面（envoy）。装好并让业务 Pod 带上 sidecar 后，流量被接管，接下来就能用规则做流量管理、安全和可观测。