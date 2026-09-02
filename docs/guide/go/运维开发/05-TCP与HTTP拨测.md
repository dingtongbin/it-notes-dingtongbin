# TCP 与 HTTP 拨测

ICMP 证明了"机器活着"，但还说服不了"服务可用"。TCP 拨测验证端口上有进程在听，HTTP 拨测更进一步验证业务语义：状态码、响应时间、内容、证书。这一节把从"主机活着"到"用户访问没问题"的两级递进补齐。

## TCP 探活：端口视角

TCP 握手成功（SYN/SYN-ACK/ACK 完成）意味着端口上有进程在听。它比 ping 更接近"服务可用"：

```go
func tcpProbe(ctx context.Context, addr string, timeout time.Duration) ProbeResult {
    res := ProbeResult{Target: addr, Method: "tcp", Ts: time.Now()}
    d := net.Dialer{Timeout: timeout} // Dialer 自带超时，再叠加 ctx 双保险
    conn, err := d.DialContext(ctx, "tcp", addr)
    if err != nil {
        res.Status = StatusDown
        res.Detail = err.Error() // detail 藏着定位线索（见下表）
        return res
    }
    conn.Close() // 只验握手立即关闭，不发任何应用层数据
    res.Status = StatusUp
    return res
}
```

| 错误信息 | 网络语义 | 典型原因 |
|---|---|---|
| i/o timeout | SYN 发出无应答 | 防火墙 DROP、IP 不存在、链路断 |
| connection refused | 目标回 RST | IP 活着但端口没进程：服务挂了 |
| no route to host | 本机路由失败 | 路由缺失、ARP 不通 |
| network is unreachable | 无出口路由 | 本机网络配置问题 |

这张表是探活模块最值钱的部分：DROP 是网络路径问题（找网工），refused 是服务问题（找应用）——一把尺子区分两个团队的事。根因是防火墙策略的差异：DROP 静默丢包（等超时），REJECT 礼貌回绝（立刻 refused），耗时上也能感知到：前者通常等满超时，后者毫秒级返回。

## HTTP(S) 拨测：最接近用户

HTTP 拨测在"活着"之上追加业务语义：状态码对不对、返回快不快、内容对不对、证书还剩几天。

```go
type HTTPOpts struct {
    ExpectStatus int           // 预期状态码，如 200
    ExpectBody   string        // 可选：body 必须包含的关键词
    Host         string        // 可选：覆盖 Host 头（拨 LB 后端单机时必备）
    Timeout      time.Duration
}

func httpProbe(ctx context.Context, url string, opt HTTPOpts) ProbeResult {
    res := ProbeResult{Target: url, Method: "http", Ts: time.Now()}

    // httptrace 把一次请求拆成五段：慢在哪一目了然（dns/connect/tls/ttfb/content）
    var dnsAt, connAt, tlsAt, ttfbAt, doneAt time.Time
    start := time.Now()
    trace := &httptrace.ClientTrace{
        DNSDone:              func(httptrace.DNSDoneInfo) { dnsAt = time.Now() },
        ConnectDone:          func(_, _ string, error) { connAt = time.Now() },
        TLSHandshakeDone:     func(tls.ConnectionState, error) { tlsAt = time.Now() },
        GotFirstResponseByte: func() { ttfbAt = time.Now() },
    }
    ctx = httptrace.WithClientTrace(ctx, trace)

    req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
    if err != nil {
        res.Status, res.Detail = StatusDown, err.Error()
        return res
    }
    if opt.Host != "" {
        req.Host = opt.Host // LB 场景：URL 打 LB 地址，Host 头决定路由到哪个站点
    }

    client := &http.Client{
        Timeout: opt.Timeout,
        // 拨测默认不跟随重定向：3xx 是"活着但行为变了"，要暴露而非自动追
        CheckRedirect: func(*http.Request, []*http.Request) error {
            return http.ErrUseLastResponse
        },
    }
    resp, err := client.Do(req)
    if err != nil {
        res.Status, res.Detail = StatusDown, err.Error()
        return res
    }
    defer resp.Body.Close()
    doneAt = time.Now()
    res.RTT = doneAt.Sub(start)

    // body 断言限量读取：超大 body 会拖死探测
    body, _ := io.ReadAll(io.LimitReader(resp.Body, 64<<10))

    seg := func(a, b time.Time) time.Duration {
        if b.Before(a) {
            return 0 // 未发生该阶段（如 HTTP 无 TLS 握手）
        }
        return b.Sub(a)
    }
    timing := fmt.Sprintf("dns=%v connect=%v tls=%v ttfb=%v content=%v",
        seg(start, dnsAt), seg(dnsAt, connAt), seg(connAt, tlsAt),
        seg(tlsAt, ttfbAt), seg(ttfbAt, doneAt))

    // 证书剩余天数：TLS 握手完成后从连接状态里顺手拿——运维刚需；
    // 纯 HTTP 没有 TLS，视为无忧
    daysLeft := 1e9
    if resp.TLS != nil && len(resp.TLS.PeerCertificates) > 0 {
        daysLeft = time.Until(resp.TLS.PeerCertificates[0].NotAfter).Hours() / 24
    }

    // 判定顺序：DOWN（状态码/关键词）优先于 DEGRADED（证书）——更严重的先报，
    // 否则"500 + 证书将过期"会被降级报告，掩盖真故障
    switch {
    case resp.StatusCode != opt.ExpectStatus:
        res.Status, res.Detail = StatusDown,
            fmt.Sprintf("状态码 %d，预期 %d", resp.StatusCode, opt.ExpectStatus)
    case opt.ExpectBody != "" && !bytes.Contains(body, []byte(opt.ExpectBody)):
        res.Status, res.Detail = StatusDown, "body 缺少关键词 "+opt.ExpectBody
    case daysLeft < 14:
        res.Status, res.Detail = StatusDegraded, // 服务活着但证书即将出事
            fmt.Sprintf("证书剩余 %.0f 天 %s", daysLeft, timing)
    default:
        res.Status, res.Detail = StatusUp, timing
    }
    return res
}
```

五段耗时就是归因表：dns 慢查解析器，connect 慢查网络，tls 慢查证书链与加密套件，ttfb 慢查服务端处理，content 慢查带宽——同一个"HTTP 慢"被拆成五种完全不同的工单。

默认不跟随重定向是刻意的：3xx 表示"活着但行为变了"，拨测要暴露这个事实而不是自动追过去掩盖它。下载超大 body 只读 64KB 就够做关键词断言，避免把探测线程拖死。

## 常见坑

第一个坑是 HTTP 拨测被 LB 干扰：LB 默认按轮询分流量，拨测请求可能落到异常后端造成间歇性告警。必须固定路径与预期码，必要时带 Host 头直探后端，或让拨测路径绕过缓存层。

第二个坑是证书链校验失败与证书过期是两回事：前者是本机缺中间证书或系统时间不对（x509 链错误），后者是 NotAfter 已过。拨测要分开上报，处置路径完全不同——一个修客户端，一个换证书。

第三个坑是跟随重定向掩盖真实状态：302 跳走了，拨测跟过去拿到 200，还以为服务健康。拨测要用 CheckRedirect 返回 ErrUseLastResponse，让 3xx 暴露出来。

第四个坑是 body 断言不设上限：超大响应体被 ReadAll 全量读进内存，探测线程被拖死。用 io.LimitReader 限量读取，够做关键词断言即可。

第五个坑是 TCP 拨测只发数据不做判断就收工：发完立即关闭，不读任何字节。有些服务在收到 CRLF 才回应，纯握手验活就够了——只验握手立即关闭是最干净的语义。如果你需要验应用层，那是 HTTP 拨测的职责。

第六个坑是超时配置不当：TCP Dialer 的 Timeout 和 ctx 是双保险，缺任一都会出问题——没有 Timeout 时，黑洞网络让它挂满系统默认的两分钟。