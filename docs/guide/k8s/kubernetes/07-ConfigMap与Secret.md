# ConfigMap 与 Secret

应用配置和密钥不应该写死在镜像里：改配置要重新打包太慢，密钥进镜像等于泄密。这一篇讲 ConfigMap 存普通配置、Secret 存敏感配置，以及它们怎么挂进 Pod。

## 为什么要把配置从镜像里拿出来

镜像应该是"一个版本对应一份代码"，配置应该能在不重打包的前提下随环境变化。把配置抽到 ConfigMap/Secret，同一镜像就能在不同环境用不同配置，改配置只改资源对象，不用重发。

## ConfigMap：普通配置

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
data:
  APP_ENV: production
  config.yaml: |
    log_level: info
    port: 8080
```

ConfigMap 里 data 可以放环境变量，也可以放一段完整的配置文件内容。

## 把 ConfigMap 挂进 Pod

两种方式：作为环境变量，或作为文件挂载。

```yaml
spec:
  containers:
    - name: app
      image: myapp:v1
      env:
        - name: APP_ENV
          valueFrom:
            configMapKeyRef:
              name: app-config
              key: APP_ENV
```

作为文件挂载更常见：

```yaml
      volumeMounts:
        - name: cfg
          mountPath: /etc/app
  volumes:
    - name: cfg
      configMap:
        name: app-config
```

挂载之后，Pod 里 /etc/app/config.yaml 就来自 ConfigMap。文件方式的好处是改配置后滚动更新可以热生效。

## Secret：敏感配置

Secret 和 ConfigMap 用法几乎一样，但存的是敏感数据，值要 base64 编码：

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: db-secret
type: Opaque
data:
  password: c2VjcmV0Cg==   # 是 base64 后的值
```

引用方式也一致，valueFrom 的 secretKeyRef，或作为卷挂载。

## Secret 的安全认知

Secret 的值默认只做了 base64 编码，不是加密。所以要配合：RBAC 控制谁能看、开启 etcd 加密、避免把 Secret 明文提交到 git。Secret 的主要价值是把敏感配置和普通配置分开管理，而不是加密本身。

## 常见坑

1. 改 ConfigMap 不生效：文件挂载热更新有延迟，环境变量方式改了必须重建 Pod。
2. Secret 值没 base64：格式错误，创建时就要编好。
3. 把 Secret 明文写进 YAML 提交：配合外部密钥管理和加密手段。
4. 引用不存在的 key：Pod 卡在创建，describe 提示环境变量未找到。

## 一个小原则

普通配置用 ConfigMap，敏感配置用 Secret，两者都能作为环境变量或文件注入。同一镜像通过不同的挂载就能适配 dev、test、prod，这正是配置与逻辑分离的目的。