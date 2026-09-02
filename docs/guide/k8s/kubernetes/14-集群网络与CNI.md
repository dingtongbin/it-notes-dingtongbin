# 集群网络模型与 CNI

K8s 里的网络一开始容易懵：Pod 怎么就有自己的 IP 了，跨节点的 Pod 怎么互通？这套由 CNI 网络插件实现。这一篇讲 K8s 的网络模型约定、CNI 是什么、以及常见的实现。

## K8s 的网络约定

K8s 对网络有一条硬性模型：

- 每个 Pod 都有一个集群内可路由的 IP。
- 任意两个 Pod 可以直接通信，不需要 NAT。
- 跨节点也一样，像在一个大局域网里。

这套约定由网络插件通过 CNI 实现，插件负责给 Pod 分配 IP、建虚拟网卡、维护节点间路由。

## CNI 是什么

CNI 是容器网络的接口标准，定义 K8s 怎么调用插件给容器配网。K8s 本身不实现网络，它把这块交给 CNI 插件。选哪个插件直接决定网络的性能、能力和特性。

## 常见的 CNI 实现

| 插件 | 特点 |
|---|---|
| Calico | 用 BGP/overlay 路由，性能好，支持网络策略，最常见之一 |
| Flannel | 轻量 overlay（VXLAN），简单易用，性能一般 |
| Cilium | 基于 eBPF，性能强、可观测性高，支持高级网络策略 |
| Weave | overlay，简单，性能一般 |

生产里 Calico 最主流，性能偏好的用 Cilium。选型看性能和功能需求。

## 网络策略 NetworkPolicy

K8s 还允许通过网络策略控制流量的允许/拒绝，是安全访问控制的重要一层：

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: web-policy
spec:
  podSelector:
    matchLabels: { app: web }
  policyTypes: [Ingress]
  ingress:
    - from:
        - podSelector:
            matchLabels: { app: frontend }
```

意思是只允许带 frontend 标签的 Pod 访问 web。没有策略时默认全放通，加了策略后按声明收紧。这个特性依赖 CNI 支持，Calico 和 Cilium 都有。

## kube-proxy 和流量转发

Pod 间通信靠真实 IP 直接路由，Service 的虚拟 IP 则是 kube-proxy 处理的。kube-proxy 通过 iptables 或 IPVS 维护转发规则：访问 Service IP 的流量被转到其后端的实际 Pod IP。IPVS 相比 iptables 更高效，适合大规模。

## 排查思路

```
Pod 之间不通：
  1. 先看 CNI 是否正常部署（kube-system 里的网络 pod）
  2. 看是否被 NetworkPolicy 挡住
  3. 看 kube-proxy 转发规则是否还在
  4. 看 Service endpoints 是否为空
```

## 小结

K8s 的"每个 Pod 一个 IP、全网互通"由 CNI 实现，Service 的负载均衡由 kube-proxy 实现。理解这两层，网络问题的排查就有了主线，也为后面的服务网格打好基础。