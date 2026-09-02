# 探活模型与 ICMP

agent 是白盒，装不进交换机、也证明不了"用户视角是否可达"。这一章补上另一条腿：拨测（blackbox）——ICMP / TCP / HTTP 三种探活，外加网络设备标配的 SNMP 采集。本节先定统一结果模型，再实现最常见也最底层的 ICMP。

## 拨测模型：统一结果先行

三种探活方式差异很大，但下游（调度、存储、告警）不该关心细节。先定统一模型：

```go
// probe/probe.go
package probe

import "time"

// 状态刻意不用布尔：DEGRADED 表达"活着但体验劣化"——
// 丢包 30% 的链路，ping 通了，但谁也不敢说它健康
const (
    StatusUp       = "UP"
    StatusDown     = "DOWN"
    StatusDegraded = "DEGRADED"
)

// ProbeResult 所有探活方式的统一结果：
// 调度器按它编排，存储按它建表，告警按它的状态跳变触发
type ProbeResult struct {
    Target string        `json:"target"` // IP / 域名 / URL
    Method string        `json:"method"` // icmp / tcp / http / snmp
    Status string        `json:"status"` // UP / DOWN / DEGRADED
    RTT    time.Duration `json:"rtt"`    // 往返时延；DOWN 时无意义
    Loss   float64       `json:"loss"`   // 多包探测的丢包率（%）
    Detail string        `json:"detail"` // 错误详情：DOWN 的原因必须看得懂
    Ts     time.Time     `json:"ts"`
}
```

Detail 字段是灵魂：探活器最大的价值不只是说 DOWN，而是说清楚为什么 DOWN——超时、拒绝、证书过期、关键词缺失，各自的处置路径完全不同。

## ICMP：原理与权限

ping 发 ICMP echo request（type 8），目标内核直接回 echo reply（type 0），全程不碰端口——这是"机器活着吗"最底层的问法。IP 头的 TTL 每过一跳路由减一，减到 0 被丢弃并回 time exceeded 报文——traceroute 就靠它逐跳测绘路径。

原始 ICMP 套接字的权限是第一道坎，也是"全军覆没假告警"的头号来源：

| 平台 | 要求 | 解法 |
|---|---|---|
| Linux | root 或 CAP_NET_RAW | setcap cap_net_raw=+ep gomon-agent 一次性授权，别拿 root 跑服务 |
| Linux 普通用户 | sysctl 放开 | net.ipv4.ping_group_range 允许非特权组用数据报式 ICMP |
| Windows | 管理员 | 提权运行，或降级调系统 ping.exe 解析输出 |

## x/net/icmp：完整实现

```
go get golang.org/x/net/icmp
```

### 单目标 ping

```go
package main

import (
    "fmt"
    "net"
    "os"
    "time"

    "golang.org/x/net/icmp"
    "golang.org/x/net/ipv4"
)

// ping4 单目标一次往返：构包 → 发送 → 收包 → ID/Seq 双校验
func ping4(ip net.IP, timeout time.Duration) (time.Duration, error) {
    // "ip4:icmp" 是原始套接字：需要上面的权限
    conn, err := icmp.ListenPacket("ip4:icmp", "0.0.0.0")
    if err != nil {
        return 0, fmt.Errorf("打开 ICMP 套接字失败（大概率是权限）: %w", err)
    }
    defer conn.Close()

    echoID := os.Getpid() & 0xffff // 进程号当 echo ID：同机多个探活进程不串包
    const seq = 1
    req := icmp.Message{
        Type: ipv4.ICMPTypeEcho,
        Body: &icmp.Echo{ID: echoID, Seq: seq, Data: []byte("gomon-probe")},
    }
    wb, err := req.Marshal(nil)
    if err != nil {
        return 0, err
    }

    start := time.Now()
    if _, err := conn.WriteTo(wb, &net.IPAddr{IP: ip}); err != nil {
        return 0, err
    }
    // 收包必须带截止时间：目标 DOWN 时没人回话，不带超时就永远挂在这
    conn.SetReadDeadline(start.Add(timeout))

    buf := make([]byte, 1500)
    for {
        n, peer, err := conn.ReadFrom(buf)
        if err != nil {
            return 0, fmt.Errorf("等待回包超时: %w", err)
        }
        if peer.String() != ip.String() {
            continue // 本机其他 ICMP 流量（别的进程在 ping），不是我们的包
        }
        if n < 28 { // 20 字节 IPv4 头 + 8 字节 ICMP 头，原始套接字收到的帧带头
            continue
        }
        rm, err := icmp.ParseMessage(1, buf[20:n]) // 1 = ICMP for IPv4
        if err != nil || rm.Type != ipv4.ICMPTypeEchoReply {
            continue // 例如目标不可达时路由器回的 type 3 报文
        }
        echo, ok := rm.Body.(*icmp.Echo)
        if !ok || echo.ID != echoID || echo.Seq != seq {
            continue // ID/Seq 双校验：确认回的确实是我们发的那个包
        }
        return time.Since(start), nil
    }
}

func main() {
    rtt, err := ping4(net.ParseIP("192.168.1.1"), 2*time.Second)
    if err != nil {
        fmt.Println("DOWN:", err)
        return
    }
    fmt.Printf("UP: %v\n", rtt)
}
```

收包循环里的三道过滤缺一不可：源地址过滤排除无关 ICMP 流量，包头长度过滤跳过短帧，ID/Seq 双校验确保回的确实是自己的包。任何一个漏了，探活结果都可能被别的进程的 ping 污染。

### 丢包率与 RTT 统计

单包判定太脆：一次网络抖动就触发告警，运维会被假警报练出免疫。生产做法：发一小批包统计。

```go
// pingStats 发 count 包取丢包率与 RTT——降级逻辑就在这里：丢一半就是 DEGRADED
func pingStats(ip net.IP, count int, interval, timeout time.Duration) ProbeResult {
    var ok int
    var total, minR, maxR time.Duration
    for i := 0; i < count; i++ {
        rtt, err := ping4(ip, timeout)
        if err == nil {
            ok++
            total += rtt
            if minR == 0 || rtt < minR {
                minR = rtt
            }
            if rtt > maxR {
                maxR = rtt
            }
        }
        time.Sleep(interval) // 间隔要小于超时，否则包还没判定就发下一个
    }
    res := ProbeResult{
        Target: ip.String(), Method: "icmp", Ts: time.Now(),
        Loss: float64(count-ok) / float64(count) * 100,
    }
    switch {
    case ok == count:
        res.Status = StatusUp
    case ok == 0:
        res.Status = StatusDown
    default:
        res.Status = StatusDegraded
    }
    if ok > 0 {
        res.RTT = total / time.Duration(ok) // 平均 RTT 够用，P99 留给存储层算
        res.Detail = fmt.Sprintf("min=%v avg=%v max=%v", minR, res.RTT, maxR)
    }
    return res
}
```

### 批量 ping：goroutine 池

1000 个目标同时 ping 会把文件描述符和内存同时打爆——有界是一切的前提：

```go
// batchPing 固定 worker 池：并发恒定，目标再多也不失控
func batchPing(ctx context.Context, ips []net.IP, workers int, timeout time.Duration) []ProbeResult {
    jobs := make(chan net.IP)                   // 无缓冲：worker 拉一个做一个，天然背压
    results := make(chan ProbeResult, len(ips)) // 有缓冲：发送不阻塞

    var wg sync.WaitGroup
    for i := 0; i < workers; i++ {
        wg.Add(1)
        go func() {
            defer wg.Done()
            for ip := range jobs { // jobs 关闭且排空后 worker 自然退出
                res := pingStats(ip, 3, 200*time.Millisecond, time.Second)
                results <- res
            }
        }()
    }

    go func() {
        defer close(jobs)
        for _, ip := range ips {
            select {
            case jobs <- ip:
            case <-ctx.Done():
                return // 取消：停止派发，未派发目标留给上层记"未探测"
            }
        }
    }()

    go func() {
        wg.Wait()
        close(results) // 全部收工后关结果通道，主循环的 range 才能结束
    }()

    var out []ProbeResult
    for r := range results {
        out = append(out, r)
    }
    return out
}
```

每个目标独立开 socket，简单可靠；更高并发可共享一个 conn 用 seq 分发（go-ping 库的做法），代价是代码复杂度翻倍。jobs 通道无缓冲是刻意的：worker 拉一个做一个就是天然背压，目标再多也不失控。

## 常见坑

第一个坑是 ICMP 无权限导致全军覆没：权限不足时 ListenPacket 直接报错，所有目标"集体 DOWN"，凌晨全网告警。探活器启动必须先做自检：先 ping 网关或 127.0.0.1，失败就拒绝启动并明说权限问题。

第二个坑是收包时把别人的包当成自己的：同一台机器多个探活进程共享原始套接字，不校验源 IP 和 ID/Seq 就统计，RTT 和丢包率全错。三道过滤缺一不可。

第三个坑是单包判定太脆：一次抖动就告警，运维被假警报练出免疫，真告警也被顺手静音。生产必须发一小批取丢包率，丢一半给 DEGRADED 而不是直接 DOWN。

第四个坑是收包不带超时：目标 DOWN 时没人回话，没有 ReadDeadline 的 Read 会永远挂着，goroutine 越积越多。所有 I/O 必须带截止时间。

第五个坑是批量 ping 无限制并发：目标一多就无脑开 goroutine，文件描述符与内存同时到顶。固定 worker 池 + 每目标独立超时，并发数是配置项不是运气。