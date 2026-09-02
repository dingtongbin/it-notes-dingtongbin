# 在 Kubernetes 里监控集群

前面的监控知识在理论层面都很通用，这一篇把它们落进 Kubernetes：监控三个层面——节点、Pod 应用、以及集群组件，各用什么手段。这是做 K8s 运维最常接触的监控配套。

## 监控的三个层面

K8s 里的监控通常分三块：

| 层面 | 看什么 | 用什么 |
|---|---|---|
| 节点 | CPU、内存、磁盘、网络 | node_exporter |
| 应用/Pod | 业务指标、容器资源 | 应用指标 + cAdvisor 类 |
| 集群组件 | API Server、调度器、控制器状态 | 组件自带的 /metrics |

## 节点指标：node_exporter

每个节点上跑一个 node_exporter（通常用 DaemonSet），收集系统指标并被 Prometheus 抓取。关键指标：

- node_cpu_seconds_total：CPU 用时，配合 rate 算用率。
- node_memory_MemAvailable_bytes：可用内存。
- node_filesystem_*：磁盘用率。
- node_network_*：网络流量。

## 应用指标：应用自己暴露

业务指标要靠应用自己埋点暴露 /metrics，比如每个接口的 QPS、时延、错误率。用到的是 Kubernetes 服务发现 + 注解，前面已经讲过，应用加了注解就被自动抓到。

## 容器资源指标：cAdvisor 等

容器层面的 CPU、内存被 cAdvisor 采集，或在较新方案里被 kube-state-metrics 等覆盖。配套的还有：

- kube-state-metrics：把 K8s 状态（Pod 数、副本数、状态）变成指标，比如看有没有 Pod 一直 CrashLoopBackOff。
- metrics-server：提供内置资源指标，供 kubectl top 和 HPA 使用。

## 完整部署形态

一般用一个监控栈（常见 Prometheus Operator / kube-prometheus）把整套东西铺好：

```
node_exporter（每节点）   ─┐
kube-state-metrics        ─┤→ Prometheus → Grafana（大盘）
应用 /metrics             ─┘
Alertmanager → 通知
```

它会自动部署好发现、告警规则和现成的大盘模板，开箱即用。

## 关键集群监控点

- 节点 NotReady 数 > 0 要告警。
- 某个工作负载副本数长期低于期望，说明在反复崩溃。
- API Server 延迟和错误率，是整个集群的咽喉。

## 小结

K8s 监控 = 节点（node_exporter）+ 应用（自身埋点）+ 集群状态（kube-state-metrics）三路合一。生产里通常直接上 kube-prometheus 这类打包方案，省去手工拼装。掌握了前面各部件，再用这些打包方案时就能看懂它们在配什么。