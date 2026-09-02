# 安装 Prometheus 与配置采集

理解数据模型之后，把 Prometheus 真正装起来并配置抓取是下一步。这一篇讲典型的部署方式、采集配置怎么写、以及怎么验证抓到了数据。

## 部署方式

Prometheus 是一个 Go 写的单二进制程序，部署方式很灵活：

- 二进制：单机开发最简单，下个可执行文件直接跑。
- 容器：docker run 一条命令起一个 docker-compose。
- Kubernetes：部署成 Deployment + Service，挂配置文件，是生产主流。

在容器编排环境里，用 Helm chart 或 manifest 把它部署进集群，采集集群内部的指标最方便。

## 核心配置：抓取目标

Prometheus 的配置在 prometheus.yml，核心是 scrape_configs 定义抓哪些目标、多久抓一次：

```yaml
global:
  scrape_interval: 15s     # 全局抓取间隔

scrape_configs:
  - job_name: node
    static_configs:
      - targets: ["localhost:9100"]
  - job_name: myapp
    metrics_path: /metrics
    static_configs:
      - targets: ["192.168.1.10:8080"]
```

每个 job 定义一群目标，Prometheus 按 scrape_interval 定时去每个目标抓 /metrics（或指定的 metrics_path）。

## 让应用暴露指标

要被抓，目标得向外暴露 /metrics。方式有两种：

- 用官方客户端库：在应用里埋点统计，暴露 /metrics，例如 node_exporter 就是用它报告系统指标。
- 用 exporter：应用不改造，用一个旁路组件转接它的状态成指标，Prometheus 抓 exporter。

## 验证抓取

Prometheus 自带 Web UI：

```
Prometheus 状态 → Targets，看每个目标的状态是 UP 还是 DOWN
Graph 页：输入指标名，能查到数据就是抓到了
```

Targets 页是排查"抓不到"的第一站，上面会直接显示目标抓取是否成功、错误是什么。

## 常用 exporter

| 对象 | exporter |
|---|---|
| 机器节点 | node_exporter |
| MySQL | mysqld_exporter |
| Redis | redis_exporter |
| 容器 | cAdvisor 或迁移的 metrics-path |

exporter 把别人难于直接暴露的东西转成 Prometheus 认识的指标，是生态的重要组成部分。

## 配置的热加载

改完 prometheus.yml 不一定要重启，可触发热加载：

```bash
curl -X POST localhost:9090/-/reload
```

生产环境常在 CI 里改配置后自动 reload。

## 常见坑

1. 目标 DOWN：网络不通、端口没开、/metrics 路径不对，看 Targets 的错误。
2. 抓不到自己 app：客户端库没引入或没启动埋点。
3. 改配置没生效：检查是否 reload 或权限问题。
4. 抓取间隔太大导致数据稀疏：按指标变化快慢调整。

## 小结

Prometheus 核心是"配置抓取目标 + 定时拉指标"。装上、配上、验证 Targets 全 UP，采集这一环就通了，接下来是查询。