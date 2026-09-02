# 告警规则与 Alertmanager

监控告警是"数据出错后要把人叫醒"。Prometheus 用告警规则判断哪些序列异常，Alertmanager 负责把告警去重、分组、路由，最终通知到人。这一篇讲告警从产生到通知的整条链路。

## 告警是怎么产生的

告警的源头是 Prometheus 里配的一堆告警规则。每条规则是一个 PromQL 表达式加一个持续时间：表达式持续成立足够久就触发告警。

```yaml
groups:
  - name: nodes
    rules:
      - alert: NodeDown
        expr: up == 0
        for: 2m                 # 持续 2 分钟才告警
        labels:
          severity: critical
        annotations:
          summary: 节点 {{ $labels.instance }} 不可达
```

for 字段很关键：防止瞬时抖动就报警。表达式持续成立 for 指定的时长后，Prometheus 才把它标记为告警发给 Alertmanager。

## 表达式持续的含义

- 表达式从"正常变异常"开始计时，到 for 到期才触发。
- 中途恢复就不触发。
- 一旦触发，异常继续就一直是 firing，恢复正常后变成 resolved。

## Alertmanager 在干什么

告警规则触发后不是直接发消息，而是送到 Alertmanager。它收编所有告警然后做三件事：

| 功能 | 作用 |
|---|---|
| 分组 | 相近的告警合并成一组，避免刷屏 |
| 抑制 | 高优先级告警能隐藏相关的低优先告警 |
| 路由 | 按规则把告警送到不同接收人不 |

## 配置一个通知接收

以 webhook 为例，Alertmanager 配置通知：

```yaml
route:
  group_by: ["alertname"]
  receiver: "default"

receivers:
  - name: default
    webhook_configs:
      - url: http://oncall/api/webhook
```

它把告警按 alertname 分组，默认通过 webhook 发出去。接收人可以是 webhook、邮件、企业微信/钉钉这类通知工具。

## 一条完整的告警链路

```
Prometheus 规则引擎
   ├─ 发现异常并持续 for 时长
   ├─ 标记 firing，发到 Alertmanager
Alertmanager
   ├─ 分组 / 去重 / 路由
   └─ 通知 邮件 / webhook / 即时通讯
```

## 写规则要避免的坑

1. 别用裸指标当规则：比如直接用 node_memory_Active_bytes 比较，要转成合适的量。
2. for 设太短容易抖：抖动误报会让人不再相信告警。
3. 不写 annotations：人收到告警不知道怎么回事，summary 要可读。
4. 规则触发就漫天刷：不加分组，一次故障几十条加起来。

## 小结

告警 = 指标异常 + 持续时长 + 通知。Prometheus 负责"when（何时）"和"what（什么）"，Alertmanager 负责"to whom（通知谁）、怎么组织"。把表达式、for、分组路由配好，告警才能真正救人而不是烦人。