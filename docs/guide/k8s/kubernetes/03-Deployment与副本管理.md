# Deployment 与副本管理

裸 Pod 不会自愈，生产里几乎不会直接管 Pod，而是管 Deployment。这一篇讲 Deployment 怎么管理副本、怎么滚动升级、怎么回滚。它是日常发布的主场景。

## Deployment 是什么

Deployment 描述"我要多少份同样的 Pod"，并负责维持这个数目。它有了一套完整的发布和被管理的能力：扩容缩容、滚动更新、失败回滚。

```
Deployment
   └── ReplicaSet（某一时刻描述"期望多少个 Pod"）
        └── 一组 Pod（实际在跑的工作负载）
```

Deployment 管理 ReplicaSet，ReplicaSet 管理 Pod 的副本数。平时你只需要写 Deployment。

## 一个 Deployment 声明

```yaml
# deploy.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  replicas: 3                    # 期望 3 个副本
  selector:
    matchLabels:
      app: web                   # 挑哪些 Pod 归它管
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
        - name: web
          image: myapp:v1
          ports:
            - containerPort: 8080
```

关键是 template，它定义要创建的 Pod 长什么样，里面必须有和 selector 匹配的标签。selector 决定了 Deployment 知道该去管谁。

## 副本自愈

replicas: 3 表示期望永远是 3 个。某个 Pod 挂了，控制器发现现状是 2，自动补 1 个恢复到 3；节点故障，Pod 也会在新的节点被调度重建。这是 K8s 相对裸 Docker 最直观的增强，把"保证 N 个在跑"变成内置能力。

## 滚动更新

改镜像版本后 apply，Deployment 会滚动更新：一批一批替换，而不是全部一起换，保证服务不中断。

```bash
kubectl set image deployment/web web=myapp:v2   # 改镜像触发滚动更新
kubectl rollout status deployment/web           # 看更新进度
```

更新策略里可以控制最大不可用和额外副本数，调更新节奏。

## 回滚

新版本出了问题，一键回到上个版本：

```bash
kubectl rollout history deployment/web   # 看版本历史
kubectl rollout undo deployment/web      # 回滚到上一个
kubectl rollout undo deployment/web --to-revision=2   # 回滚到指定版本
```

每一次 rollout 是一个版本，存有历史，方便出问题快速恢复。

## 扩容缩容

```bash
kubectl scale deployment/web --replicas=5   # 手动扩到 5
```

配合 HPA 可以按负载自动扩缩，这个后面单独讲。

## 常见坑

1. selector 和 template 标签不匹配：Deployment 创建后不能改 selector，先想好。
2. 更新失败堆那不动：看 rollout status 和 Pod 的 describe 事件。
3. 以为手动删 Pod 就自动跑：这正是 Deployment 的价值，删了会自动重建。
4. 直接改 template 就 apply：更新要走镜像或配置变更，别手改运行中的策略导致混乱。

## 小结

Deployment 是发布与自愈的载体。理解它，就理解了 K8s 里绝大多数工作负载角色的核心：声明副本数，收敛实际到期望，坏一个补一个，升级滚动、出错回滚。