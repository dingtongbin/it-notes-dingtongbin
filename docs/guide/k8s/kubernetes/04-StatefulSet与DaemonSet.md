# 其他工作负载：StatefulSet 与 DaemonSet

Deployment 适合无状态应用，但集群里不只有无状态服务。有些服务要稳定的网络标识和存储（数据库），有些服务要每台节点都跑一份（日志、监控代理）。这一篇讲 StatefulSet 和 DaemonSet 这两个重要角色。

## StatefulSet：有状态服务

数据库、消息队列这类有状态服务，要求每个实例身份稳定（固定的网络标识、固定的持久卷）。

| 特点 | 说明 |
|---|---|
| 稳定网络标识 | Pod 名字是 序号式，如 db-0、db-1，主机名可预测 |
| 稳定的存储 | 每个 Pod 绑定自己的 PersistentVolumeClaim，重新调度也能找回 |
| 顺序部署/删除 | 按序号逐个创建、删除，避免集群脑裂 |
| 用于 | 需要固定身份和存储的有状态服务 |

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: db
spec:
  serviceName: db      # 配合 headless Service 提供服务发现
  replicas: 2
  selector:
    matchLabels: { app: db }
  template:
    metadata:
      labels: { app: db }
    spec:
      containers:
        - name: db
          image: postgres:16
```

StatefulSet 就得配 headless Service，用 序号名 让集群内其他 Pod 找到它，比如 db-0.db。

## DaemonSet：每台节点一份

日志采集、监控代理、网络插件这类需要在每个节点都跑一个实例的东西，用 DaemonSet。它的保证是：每台节点上正好一个 Pod，新增节点自动补，移除节点自动清。

```yaml
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: filebeat
spec:
  selector:
    matchLabels: { app: filebeat }
  template:
    metadata:
      labels: { app: filebeat }
    spec:
      containers:
        - name: filebeat
          image: elastic/filebeat:8.15
```

它不用写 replicas，集群里有多少节点就自然有多少副本。节点只要健康，它上面就会有一个。

## 补充：Job 与 CronJob

还没说完：

- Job：跑一次就退出的一次性任务，比如数据清洗、初始化。跑完即达完成态。
- CronJob：按 cron 定时生成 Job，比如每天凌晨备份。

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: backup
spec:
  schedule: "0 2 * * *"     # 每天 2 点
  jobTemplate:
    spec:
      template:
        spec:
          containers:
            - name: backup
              image: my-backup:1
          restartPolicy: Never
```

## 选择工作负载的清单

| 场景 | 用哪个 |
|---|---|
| 无状态 Web/API | Deployment |
| 有状态、要稳定标识和存储 | StatefulSet |
| 每节点都要一个的守护类 | DaemonSet |
| 跑一次的任务 | Job |
| 定时任务 | CronJob |

## 小结

五种工作负载对应五类需求。选错会导致身份、存储、部署时机都不对。按"是否有状态、是否每节点、是否定时"来判断该用哪个，是 K8s 日常工作都会碰到的选择。