# Service 与集群内服务发现

Pod 的 IP 是临时的，会随着重建变。要让别的 Pod 或外部稳定地访问一组 Pod，需要 Service。这一篇讲 Service 是什么、几种类型、以及集群内怎么通过名字互相访问。

## 为什么需要 Service

Pod 会死会重建，IP 每次都可能不同。直接记 Pod IP 不现实。Service 给一组 Pod 提供一个稳定的虚拟入口：一个固定的 IP 和名字，流量转发到后面的 Pod。

```
外部/其他应用
    ↓ 访问 Service 的名字或虚拟 IP
  Service（虚拟 IP + 负载均衡）
    ├─▶ Pod1
    ├─▶ Pod2
    └─▶ Pod3
```

## 一个 Service 声明

```yaml
apiVersion: v1
kind: Service
metadata:
  name: web
spec:
  selector:
    app: web          # 转发给打了这个标签的 Pod
  ports:
    - port: 80        # Service 对外端口
      targetPort: 8080  # 转发到 Pod 的端口
```

selector 决定了它把流量转给哪一组 Pod。port 是别人访问 Service 的端口，targetPort 是 Pod 内容器的端口。

## Service 的类型

| 类型 | 访问方式 | 说明 |
|---|---|---|
| ClusterIP | 集群内 | 默认，Service 有个集群内虚拟 IP |
| NodePort | 集群外：节点:端口 | 在每台节点上开一个固定端口 |
| LoadBalancer | 集群外：云 LoadBalancer | 云厂商分配公网入口，通常基于 NodePort |

ClusterIP 只在集群内可达，是服务间调用的标准方式。NodePort 把 Service 暴露到节点的一个端口，方便开发调试。LoadBalancer 适合云上对外服务。

## 集群内的服务发现

K8s 自带 DNS，集群内的服务能直接按名字访问：

- 在同命名空间：直接用服务名 web。
- 跨命名空间：web.default 或全名 web.default.svc.cluster.local。

所以一个 Pod 想调另一个服务，代码里用服务名当地址就行，K8s 负责解析和负载均衡。这是微服务能互相调用的基础。

## headless Service

某些场景不想让 Service 做负载均衡，只想拿一组真实 Pod 的 IP，比如和 StatefulSet 配合。做法是不设 ClusterIP：

```yaml
spec:
  clusterIP: None        # headless
```

它会直接用 Pod 自己的 IP 做 DNS 解析，常用于 StatefulSet 的稳定身份访问。

## 查看与排查

```bash
kubectl get svc                 # 看 Service 和类型
kubectl get endpoints web       # 看 Service 实际转发到哪些 Pod
kubectl describe svc web        # 看详情
```

endpoints 很关键：它反映 Service 后端的真实 Pod 列表。如果 endpoints 是空的，说明 selector 没匹配到任何 Pod。

## 常见坑

1. Service 后端口对不上：port 和 targetPort 混淆，流量进不来。
2. endpoints 为空：selector 和 Pod 标签不匹配，先查标签。
3. 跨命名空间访问忘带名字空间：只用短名只能在本命名空间内解析。
4. 本地调试 NodePort 端口不安全：只在测试环境开 NodePort。

## 小结

Service 是稳定入口 + 负载均衡 + 服务发现的统一抽象。理解"selector 挑 Pod、port/targetPort 定转发"就抓住了核心，再往上就是外部接入的 Ingress。