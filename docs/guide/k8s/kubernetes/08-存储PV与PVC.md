# 存储：PV 与 PVC

容器文件消失的问题在 Docker 篇讲过。在 K8s，有状态数据由存储抽象解决：用户声明要多大存储（PVC），系统用底层真正的存储（PV）满足它。这一篇讲 PV、PVC 和 StorageClass 怎么配合。

## 三层抽象

K8s 把存储拆成声明和使用两层：

```
StorageClass（动态供应规则）
   └── PV（真实存储，一块可用的存储资源）
        ├── 与 PVC 绑定
PVC（用户申请"我要这么大"）
   ├── 绑定到一个满足条件的 PV
   └── Pod 挂载这个 PVC
```

- PV 是集群里的存储资源，像一个"存储池里的一块"。
- PVC 是应用的存储凭证，声明需求：大小、访问模式。
- StorageClass 定义怎么动态创建 PV，由云厂商或 NFS 等提供方实现。

## 最简单的用法：让系统动态提供

大多场景不手动建 PV，用 StorageClass 动态创建：

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: data
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 10Gi
```

然后 Pod 挂载这个 PVC：

```yaml
spec:
  containers:
    - name: app
      image: myapp:v1
      volumeMounts:
        - name: data
          mountPath: /data
  volumes:
    - name: data
      persistentVolumeClaim:
        claimName: data
```

有 StorageClass 时，系统自动建一个 PV 满足这个 PVC。对使用者来说，就像申请到了一块持久盘。

## 访问模式

| 模式 | 能同时挂载它的节点数 |
|---|---|
| ReadWriteOnce | 只能一个节点写 |
| ReadWriteMany | 多个节点读写 |
| ReadOnlyMany | 多个节点只读 |

根据数据是否会被多节点共享选择。数据库单个副本一般 ReadWriteOnce，集群文件共享要 ReadWriteMany。

## StorageClass

StorageClass 决定了底层存储的类型和自动供应策略：

```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: fast
provisioner: kubernetes.io/aws-ebs   # 或者 nfs、ceph-rbd 等
```

集群里通常会预装几个 StorageClass。选哪个类决定数据落在哪种存储上。

## 空路径与临时存储

还有两类卷无需 PV：

| 卷类型 | 说明 |
|---|---|
| emptyDir | Pod 内临时目录，同 Pod 容器共享，Pod 重建即清空 |
| hostPath | 直接用节点上的目录，仅适合单节点或特殊场景 |

emptyDir 适合缓存、容器间共享临时数据；hostPath 因不跨节点，生产少用。

## 常见坑

1. PVC 卡在 Pending：没有匹配的 StorageClass 或 PV，检查 storageClassName。
2. 绑定错误：accessModes 和大小不匹配绑不到 PV。
3. 用 hostPath 部署多实例：数据不共享、不迁移，跨节点就错了。
4. 忘删除 PVC：删除 StatefulSet 不一定自动删 PVC，数据会留着。

## 小结

理解存储的关键是分清"谁声明"和"谁提供"：PVC 声明需求、PV 提供资源、StorageClass 负责按需造。这样 Pod 才能拿到能活过重建的持久数据。