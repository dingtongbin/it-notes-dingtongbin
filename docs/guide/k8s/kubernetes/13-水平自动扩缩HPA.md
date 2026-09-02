# 水平自动扩缩 HPA

负载上来了能不能自动加副本，掉了能不能自动减？HPA 就是干这个的。它根据指标（通常 CPU）自动调整 Deployment 的副本数。这一篇讲 HPA 的原理、配置和配套条件。

## HPA 是什么

HorizontalPodAutoscaler 持续观测 Pod 的指标，和设定的目标值比，按比例调整副本数。指标高就扩，低就缩。

```
HPA
 ├─ 读取指标（当前 CPU 用率）
 ├─ 对比目标（比如 50%）
 └─ 调整 Deployment 的 replicas
```

要让它工作，先要有能提供指标的组件（metrics-server），否则取不到 CPU 用率。

## 配置 HPA

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: web-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: web
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 50
```

配置里最关键的是：目标 Deployment、最小最大副本数、以及用什么指标和目标是多高。

## 它是怎么算的

HPA 定期算"当前平均 CPU 用率 / 目标用率"，按这个比值调副本数。比如当前平均 75%，目标是 50%，比值是 1.5，就把副本数乘以 1.5。还考虑缩放时要稳定，避免抖动过猛。

## 前提条件与限制

- 需要 metrics-server 提供资源指标，或自定义指标 API。
- Deployment 的容器要设 requests，否则算不出"用率"百分比。
- 扩容通常快、缩容慢（有稳定窗口），防止负载抖动就砍。
- 设了 min/max，不会扩到无限，也不会缩到零。

## 观察与排参

```bash
kubectl get hpa
kubectl describe hpa web-hpa
```

describe 能看到 HPA 每次计算的目标副本数和原因。扩容不影响但没反应，多半是没 metrics-server 或 requests 没设。

## 生产建议

| 要点 | 说明 |
|---|---|
| 设置合理 min/max | 防止抖动和超预算 |
| 基于多指标扩缩 | 可加内存、请求数等，别只盯 CPU |
| 配合 readiness | 扩出来的无就绪不让接流量 |
| 和整体容量规划结合 | 节点资源不足时扩了也白扩 |

## 常见坑

1. HPA 不工作：没 metrics-server 或没设 requests，describe 会提示。
2. 只扩不减或只减不扩：稳定窗口参数影响，或指标一直不达标。
3. 集群没资源了还在扩：节点挤满，扩了也调度不进去。
4. 目标设得太低导致频繁扩容：合理评估实际用率。

## 小结

HPA 把"看流量调副本"从人工变成自动化。它的基础是指标准确和 requests 声明合理，配合 max 上限，就能既扛住流量又不失控。