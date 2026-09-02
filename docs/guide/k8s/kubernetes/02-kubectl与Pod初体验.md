# kubectl 与 Pod 初体验

弄懂架构后第一个动手对象是 kubectl 和 Pod。这一篇教怎样用 kubectl 操作集群、Pod 是什么、怎么写一个最小的 Pod 声明。Pod 是 K8s 里可调度的最小单元，几乎所有概念都绕着它。

## kubectl：唯一入口

所有操作都通过 kubectl 打给 API Server。

```bash
kubectl get nodes                 # 看节点
kubectl get pods                  # 看默认命名空间的 Pod
kubectl get pod -n kube-system    # 指定命名空间
kubectl apply -f pod.yaml         # 用声明文件生效
kubectl delete -f pod.yaml        # 按声明删除
```

kubectl 的核心习惯是 get 查状态、apply 用文件生效、describe 看详情、logs 看日志。

## Pod 是最小调度单元

一个 Pod 是 K8s 里能调度的最小单位，里面可以有一个或多个容器。同一 Pod 的容器共享网络命名空间（共用一个 IP）和存储卷，天生适合"强耦合的多个进程"：比如一个 web 容器加一个 sidecar 日志收集容器。

但日常使用大多数是一个 Pod 只放一个容器。Pod 是"调度"和"生命周期"的单位，容器是"进程"单位。

## 最小的 Pod 声明

```yaml
# pod.yaml
apiVersion: v1
kind: Pod
metadata:
  name: nginx
spec:
  containers:
    - name: nginx
      image: nginx:1.27
      ports:
        - containerPort: 80
```

字段拆开：apiVersion 是资源版本，kind 是资源类型，metadata 放名字和标签，spec 是期望状态，这里声明了一个跑 nginx 的容器。

## 生命周期与重启策略

Pod 是一个保障，不是一个永驻抽象。Pod 本身先创建、分配节点，容器在里面跑。Pod 可能被调度到别的节点、可能因为节点故障被迁移。Pod 的重启策略决定了容器挂了之后怎么处理：

| 策略 | 行为 |
|---|---|
| Always | 容器退出就自动重启（默认） |
| OnFailure | 只有失败退出才重启 |
| Never | 不重启 |

这是 K8s 自愈的起点：容器崩了，按策略拉起来。

## 查看与进入 Pod

```bash
kubectl get pod -o wide           # 看 Pod 在哪个节点、什么 IP
kubectl describe pod nginx        # 看事件、状态、容器详情
kubectl logs nginx                # 看日志
kubectl exec -it nginx -- bash    # 进容器
kubectl delete pod nginx          # 删除
```

describe 里的事件最能反映"为什么起不来"，排查第一站。

## 常见坑

1. 忘写命名空间用错：kubectl 默认操作 default 命名空间，别的要 -n 指定。
2. 直接操作 Pod 而不经 Deployment：手动 rm Pod 不会自动拉起，生产里用工作负载管理。
3. Pod 起不来依赖 describe 事件：get 只给状态，原因在 describe 和 logs。

## 从 Pod 到工作负载

裸 Pod 无人值守：手动删了就没了，节点挂了也不会被重建。真正的生产用法是把它交给 Deployment 这类工作负载托管，由控制器保证副本数。下一篇进入 Deployment。