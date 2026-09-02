# PromQL 查询语言

数据进来了，怎么把它变成有用的查询？PromQL 是 Prometheus 的查询语言，拿来选指标、算速率、做聚合、算分布。这一篇从最常用的查询写法讲起，能用起来是目标。

## 选一个指标

最简单的查询就是挑一个时间序列：

```
http_requests_total
http_requests_total{method="GET"}       # 用标签筛选
http_requests_total{method=~"GET|POST"} # 正则匹配
http_requests_total{status!="500"}      # 排除
```

## rate：把计数器变成速率

Counter 只增不减，直接看没意义。看"每秒多少"要用 rate：

```
rate(http_requests_total[5m])
```

意思是 5 分钟窗口里的平均每秒增长率。这是最常用的查询，几乎所有的"每秒 X"都来自 rate。

## 聚合函数

把一堆序列合起来看：

| 函数 | 作用 |
|---|---|
| sum | 求和 |
| avg | 平均 |
| max / min | 最大 / 最小 |
| count | 计数 |
| topk(n, ...) | 取前 n |

例如算所有接口的总 QPS：

```
sum(rate(http_requests_total[5m]))
```

去掉一维标签再看：用 by 指定保留哪些维度、without 去掉哪些维度。

```
sum by (method) (rate(http_requests_total[5m]))   # 按 method 分组求和
```

## Gauge 的常用函数

```
node_memory_Active_bytes / 1024 / 1024        # 直接运算
max_over_time(node_load1[1h])                 # 看一段时间内的峰值
```

## 算分布时延

配合 Histogram，用 histogram_quantile 算分位数。P99 时延：

```
histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))
```

含义是取 99% 百分位的时延值。这是"长尾变慢"最重要的告警来源。

## 常用内置函数速查

| 函数 | 用途 |
|---|---|
| rate | 计数器速率 |
| increase | 一段时间增量 |
| histogram_quantile | 分位数 |
| predict_linear | 趋势预测（提前发现容量） |
| up | 目标是否在线（配合告警） |

## 写在告警规则里的查询

PromQL 不只是手动查，还能写进告警规则。下一篇的告警本质上就是"持续满足某个 PromQL 表达式就报警"。

## 常见坑

1. 对 Counter 直接 max/sum 不看 rate：数值没有参考意义。
2. 窗口写太短：rate 抖动大，选合适窗口。
3. histogram_quantile 用错维度：要点是保留 le 标签聚合。

## 小结

PromQL 的核心三板斧：rate 把计数变速率、sum/avg 做聚合、histogram_quantile 看分布。把这几个练熟，绝大多数查询和告警都能写出来。