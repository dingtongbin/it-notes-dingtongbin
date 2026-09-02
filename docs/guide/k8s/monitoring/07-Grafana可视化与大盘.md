# Grafana 可视化与大盘

Prometheus 查数据方便，但做面向人的界面和长期看的看板，还是用 Grafana。这一篇讲 Grafana 怎么接 Prometheus、怎么配一个简单图表和常用变量，让数据真正能被看懂。

## Grafana 是什么

Grafana 是一个通用可视化面板，能连接 Prometheus（还有 MySQL、日志系统等）作为数据源，把查询结果画成图表，并支持看板、权限、告警。Prometheus 是存储和查询，Grafana 是展示，两者常一起用。

## 接入 Prometheus 数据源

1. 在 Grafana 里添加数据源，类型选 Prometheus。
2. 填 Prometheus 的地址，比如 http://prometheus:9090。
3. 保存后，数据源里就能选 Prometheus 查指标。

接入一个数据源后，所有面板都用它取数，一盘多用。

## 画第一个图

1. 新建一个 Dashboard。
2. 添加 Panel（面板）。
3. 面板的查询框里写 PromQL，比如每小时请求速率：

```
sum(rate(http_requests_total[5m]))
```

选择一个合理的图类型，保存即可。数值变化立刻可视化。

## 用变量把看板做活

写死的查询只能看某种维度，把查询里的维度抽成变量，就能用下拉框切换。

比如加一个变量 instance，取值来自：

```
label_values(node_memory_Active_bytes, instance)
```

然后在查询里引用：

```
node_memory_Active_bytes{instance="$instance"}
```

改下拉框值，图就跟着切换目标机器。这让一块板复用给所有节点、所有服务。

## 常用面板设计建议

| 面板 | 推荐 PromQL 形态 |
|---|---|
| QPS | rate(计数器[5m]) |
| 时延 P99 | histogram_quantile(0.99, rate(桶[5m])) |
| 资源用率 | 当前值或百分比 |
| 错误率 | sum(rate(错误[5m])) / sum(rate(总[5m])) |

做监控板的原则：先关心"是不是出事了"的几块关键图，再往下钻，别一上来一堆没人看的图。

## Grafana 告警

Grafana 也能配告警，直接在面板上设阈值、发通知。有些团队用它统一承载 Prometheus 之外（如日志）的告警。这里记一笔：组织规模大时，告警规则会回收到统一入口。

## 常见坑

1. 数据源没填对地址，面板一直取不到数。
2. 变量没引用到查询里，图没跟着变量走。
3. 大盘设计贪多，关键五块被淹没。
4. 忘了时间范围，对比趋势看不出来。

## 小结

Grafana 把 Prometheus 里散的数字组织成直观的看板。接入数据源、会写 PromQL 面板、用变量复用看板，监控体系的可视化部分就完整了。至此，采集、查询、告警、展示的监控闭环就串起来了。