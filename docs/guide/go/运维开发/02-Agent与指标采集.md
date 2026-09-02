# Agent 与指标采集

架构图画完，开始施工：造 gomon-agent，也就是部署在目标机上的采集端。读完你会有一个完整骨架的 agent：gopsutil 采集 CPU/内存/磁盘、面向接口的 Collector 架构、跨平台容错。它是调度器和存储的数据源头。

## 白盒采集与拨测探活

获取"目标是否健康"有两条路：白盒（本章）是目标机装 agent 从内部读真实状态，回答"为什么慢"；拨测是从监控机主动探测，回答"用户视角是否可达"。两条路互补且不可替代：agent 自己挂了只能靠拨测发现，进程活着但 CPU 100% 只有 agent 知道。

采集清单（USE 方法落地）：

| 类别 | 关键字段 | 说明 |
|---|---|---|
| CPU | cpu.percent、load1/5/15 | 负载除以核数才是饱和度 |
| 内存 | available / used_pct、swap | available 比 free 更接近"还能用多少" |
| 磁盘空间 | 每挂载点 used_pct | 维度必须带挂载点 |
| 磁盘 IO | read/write 累计字节数 | 计数器，需 delta 算速率 |
| 网络 | 每网卡收发累计字节、TCP 状态 | 计数器，需 delta |
| 进程 | 按名匹配的进程数、CPU、RSS | 关键业务进程存活 |
| 自观测 | uptime、采集耗时、缓冲丢弃数 | agent 自己的健康 |

## gopsutil 实战

```
go get github.com/shirou/gopsutil/v4
```

gopsutil 按子包组织：cpu、mem、disk、net、load、host、process，分别读 /proc 或 Windows API，纯 Go 无 CGO。

### cpu.Percent 的两种语义（最常踩的坑）

```go
// 写法一：interval > 0 —— 阻塞这么久，测的是这段时间的真实均值
// 准确但调用方被卡住：放进 ticker 循环会拖垮节奏
pcts, err := cpu.Percent(time.Second, false) // false=总体，true=每核
if err != nil {
    return // 生产代码错误必须处理，绝不能 panic 拖死整个 agent
}

// 写法二：interval == 0 —— 立即返回"自上次调用以来"的均值
// 非阻塞，适合 ticker：两次调用的间隔才是真正的统计窗口
_ = pcts
pcts, _ = cpu.Percent(0, false) // 首次调用返回自进程启动以来的均值
time.Sleep(2 * time.Second)
pcts, _ = cpu.Percent(0, false) // 这次是上面 sleep 的 2 秒的均值
```

agent 的用法：ticker 每 10s 触发一次 interval=0 的调用，返回值正是这 10s 的均值。前提是全局只在这一处调用——两处各调一次，统计窗口互相污染，数值就不可信了。

### 内存 / 磁盘 / 网络速览

```go
v, _ := mem.VirtualMemory()
// Linux 的 used 含 buffer/cache，available 才是"进程还能申请多少"
fmt.Printf("available=%.1fG pct=%.1f\n", float64(v.Available)/(1<<30), v.UsedPercent)
swap, _ := mem.SwapMemory() // swap 持续增长 = 内存饱和的信号
loads, _ := load.Avg()      // load1/5/15；除以核数才能跨机器比较

// 容量类是瞬时水位，直接报；掉线的 NFS 挂载点报错就跳过，
// 绝不能让一个挂载点失败拖垮整轮采集
if parts, err := disk.Partitions(false); err == nil { // false=跳过 proc/sysfs
    for _, p := range parts {
        if u, err := disk.Usage(p.Mountpoint); err == nil {
            fmt.Printf("%s used=%.1f%%\n", p.Mountpoint, u.UsedPercent)
        }
    }
}

// TCP 状态：ss 命令的程序化版本；CLOSE_WAIT 堆积 = 应用层 bug 的铁证
conns, _ := net.Connections("tcp")
var closeWait int
for _, c := range conns {
    if c.Status == "CLOSE_WAIT" {
        closeWait++
    }
}
```

磁盘 IO 与网卡流量是计数器（开机以来的累计值），必须两次采样相减除以间隔才是速率，这在本章 Collector 一节会完整实现。计数器要 delta 是时序监控第一课。host 包的 Info/Uptime 用于注册上报与重启抑制期。

## 跨平台：Windows 与 Linux 差异

agent 要装进异构机房，差异必须代码级容错：单类指标取不到只返回空切片，绝不让一台 Windows 机器因为 load 不可用而整轮采集失败。

| 差异点 | Linux | Windows |
|---|---|---|
| 磁盘标识 | 挂载点 /data | 盘符 C: |
| load average | 有 | 无（load 包直接报错，容错跳过） |
| 磁盘 IO 计数 | 按块设备 sda | 按物理盘号 |
| inode / ICMP 权限 | 有 / root 或 setcap | 无 / 管理员 |

交叉编译一行命令（原理见 go 基础语法的环境搭建篇）：

```
$env:GOOS="linux";   $env:GOARCH="amd64";  go build -o gomon-agent ./cmd/agent
$env:GOOS="windows"; $env:GOARCH="amd64";  go build -o gomon-agent.exe ./cmd/agent
$env:GOOS="linux";   $env:GOARCH="arm64";  go build -o gomon-agent-arm64 ./cmd/agent
```

## 进程监控

"nginx 还活着吗"是最高频诉求。两条路：进程存在性（本节）与端口可达（拨测篇 TCP 探活），生产里两个都要——进程在但端口起不来是常态。

```go
// watchProcess 按名字统计：实例数、累计 CPU%、累计 RSS（nginx prefork 要聚合）
func watchProcess(name string) (count int, cpuPct, memMB float64, err error) {
    pids, err := process.Pids()
    if err != nil {
        return 0, 0, 0, err
    }
    for _, pid := range pids {
        p, err := process.NewProcess(pid)
        if err != nil {
            continue // 进程恰好退出了：跳过而不是失败
        }
        if pn, err := p.Name(); err != nil || pn != name {
            continue
        }
        count++
        cpuPct += p.CPUPercent0()   // 同 cpu.Percent 的窗口语义：两次调用才有意义
        if m, err := p.MemoryInfo(); err == nil {
            memMB += float64(m.RSS) / (1 << 20)
        }
    }
    return count, cpuPct, memMB, nil
}
```

名字匹配在 Windows 上大小写不敏感、Linux 敏感（nginx.exe 与 nginx 是两个名字）。更精确的匹配是 cmdline 正则，但每个进程都要读一次 /proc 文件——500 进程的机器上要控制采集频率。

## Collector 接口：面向接口的采集

采集器用接口统一，为的是两件事：加新采集器不动主循环，单测可以注入 fake。核心就一个 Go 接口：

```go
type Metric struct {
    Name  string
    Tags  map[string]string
    Value float64
    TsMs  int64
}

// Collector 统一抽象：面向接口，单测注入 fake，加新采集器不动主循环
type Collector interface {
    Name() string                         // 用于日志与自观测计数
    Collect(ctx context.Context) []Metric // 超时由调用方统一控制，实现里不许 Sleep
}

func NewMetric(name string, value float64, tags map[string]string) Metric {
    return Metric{Name: name, Value: value, Tags: tags, TsMs: time.Now().UnixMilli()}
}
```

CPUCollector：调 cpu.Percent(0, false) 报 cpu.percent，调 load.Avg() 报 load1（Windows 上 load 报错就跳过）；单项失败返回空切片，不影响其他 collector。MemCollector 同构（available/used_pct 水位值）。DiskCollector 多一步计数器 delta，核心片段：

```go
cur, _ := disk.IOCounters()
if secs := time.Since(d.lastAt).Seconds(); d.lastIO != nil && secs > 0 {
    for name, c := range cur {
        if p, ok := d.lastIO[name]; ok && c.WriteBytes >= p.WriteBytes {
            // 反向说明设备重启清零，跳过本轮；delta 除以间隔才是速率
            ms = append(ms, NewMetric("disk.io.write_bps",
                float64(c.WriteBytes-p.WriteBytes)/secs,
                map[string]string{"disk": name}))
        }
    }
}
d.lastIO, d.lastAt = cur, time.Now() // 无论是否算出速率都要更新基线
```

容量部分与 CPU 同构：disk.Partitions 遍历挂载点，used_pct 带 mount 标签。

## 一根 ticker 还是每采集器一个 goroutine

| 方案 | 优点 | 缺点 |
|---|---|---|
| 统一 ticker 顺序采集（gomon 选它） | 同轮数据时间戳天然对齐；cpu.Percent(0) 的窗口语义只在单线程下成立；代码最简 | 一个 collector 慢拖整轮——统一超时兜底 |
| 每 collector 独立 goroutine | 互不阻塞 | 时间戳错开；cpu.Percent(0) 全局窗口被污染（要加锁）；goroutine 生命周期管理变复杂 |

agent 的采集都是毫秒级系统调用、10s 一轮，顺序采集绰绰有余。真出现慢采集（如全量进程扫描）再单拆 goroutine，入库时间戳仍统一。

## 常见坑

第一个坑是时间戳用谁的时钟：agent 打时间戳受时钟漂移污染（NTP 失步的机器数据"来自未来"）；全用 server 接收时间又掩盖网络延迟。gomon 的取舍：agent 打戳 + server 记接收时间双存，告警按 agent 时间，延迟分析按差值。

第二个坑是 collector 阻塞拖垮 ticker：disk.Usage 对掉线的 NFS 挂载点可能挂几分钟。采集内部必须可中断——统一 ctx 超时，卡死的项宁可这轮缺数据。

第三个坑是采集太频繁，agent 自己先把 CPU 打满：10s 一次系统调用可忽略，1s 一次全量进程扫描在千进程机器上就是灾难。采集频率跟着指标变化速度走。

第四个坑是 agent_id 每次启动随机生成：重启一次资产翻倍、历史断线、告警重置。必须落盘持久化，重装系统才允许换新。

第五个坑是流断了无感知：TCP 半死连接（对端断电不发 FIN）让流假活几小时。Keepalive 参数是必需品不是调优项。

第六个坑是缓冲无界"先收着"：断网一天，无界缓冲把 agent 内存吃穿。有界 + 丢旧保新 + 丢弃计数上报，丢得明明白白比 OOM 强。