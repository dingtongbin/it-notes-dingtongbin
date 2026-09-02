# SNMP 采集

交换机、路由器装不了 agent，白盒路线在网络设备前断了。SNMP（Simple Network Management Protocol）服役 30 多年，是网络设备暴露指标的唯一通用协议。这一节讲清 SNMP 的角色、版本、常用 OID，再用纯 Go 的 gosnmp 库把设备状态拉回来。

## SNMP 基础

角色与术语：

NMS（管理者）：我们的 server，发起请求。

Agent：设备内置的 SNMP 服务，UDP 161 端口应答。

OID：指标的全球唯一编号，如 1.3.6.1.2.1.1.5.0 是设备名。

MIB：OID 到人类可读名字的翻译字典（sysName.0 就是上面那串数字）。

| 版本 | 认证 | 加密 | 现状 |
|---|---|---|---|
| v1 | community 明文 | 无 | 极老设备兼容 |
| v2c | community 明文 | 无 | 事实主流（community 当口令用） |
| v3 | USM 用户认证 | 有（AES/DES） | 安全要求高的环境 |

v2c 的 community 本质是明文口令：内网可接受，跨公网必须 v3。

常用 OID 速查（记住这张表能应付九成网络监控）：

| 指标 | OID | 说明 |
|---|---|---|
| sysUpTime | 1.3.6.1.2.1.1.3.0 | 设备运行时长（检测重启） |
| sysName | 1.3.6.1.2.1.1.5.0 | 设备名 |
| sysDescr | 1.3.6.1.2.1.1.1.0 | 型号与版本描述 |
| ifDescr | 1.3.6.1.2.1.2.2.1.2.i | 第 i 个端口名 |
| ifOperStatus | 1.3.6.1.2.1.2.2.1.8.i | 端口状态：1=up 2=down |
| ifInOctets | 1.3.6.1.2.1.2.2.1.10.i | 入方向累计字节（32 位计数器） |
| ifOutOctets | 1.3.6.1.2.1.2.2.1.16.i | 出方向累计字节（32 位计数器） |
| ifHCInOctets | 1.3.6.1.2.1.31.1.1.1.6.i | 64 位计数器：高速端口必用 |
| hrProcessorLoad | 1.3.6.1.2.1.25.3.3.1.2.i | 设备 CPU 利用率（HOST-RESOURCES-MIB） |

ifInOctets 是 32 位计数器，最大约 4G 字节——千兆口跑满约 34 秒就回绕一次。千兆以上的端口必须用 64 位的 ifHCInOctets，否则 delta 算出来的速率周期性变成负数或天文数字。

## gosnmp 实战

```
go get github.com/gosnmp/gosnmp
```

### 连接与 Get

```go
package main

import (
    "fmt"
    "time"

    "github.com/gosnmp/gosnmp"
)

func newSNMP(target, community string) *gosnmp.GoSNMP {
    return &gosnmp.GoSNMP{
        Target:    target,               // 交换机管理 IP
        Port:      161,                  // SNMP 标准端口
        Community: community,            // v2c community
        Version:   gosnmp.Version2c,
        Timeout:   2 * time.Second,      // 单请求超时
        Retries:   2,                    // 重试 2 次：UDP 丢包是常态，显著降假 DOWN
        MaxOids:   16,                   // 单次 Get 的 OID 上限：设备能力不一，取保守值
    }
}

func main() {
    g := newSNMP("192.168.1.1", "public")
    if err := g.Connect(); err != nil { // UDP 无真连接：Connect 只是建好 socket
        panic(err)
    }
    defer g.Conn.Close()

    // Get：一次请求取多个 OID（1 号端口的入/出流量）
    res, err := g.Get([]string{
        "1.3.6.1.2.1.2.2.1.10.1", // ifInOctets.1
        "1.3.6.1.2.1.2.2.1.16.1", // ifOutOctets.1
    })
    if err != nil {
        panic(err) // community 错也表现为 timeout（见常见坑）
    }
    for _, v := range res.Variables {
        // Value 是 any：Counter/Gauge/OctetString 各自断言，Counter 用 ToBigInt 最稳
        fmt.Printf("%s = %v\n", v.Name, gosnmp.ToBigInt(v.Value))
    }
}
```

### 两次采样算端口速率

ifInOctets 与磁盘 IO 同款计数器逻辑：delta 除以间隔才是速率。

```go
type portSample struct {
    ifIn, ifOut uint64
    at          time.Time
}

func fetchPort(g *gosnmp.GoSNMP, ifIndex int) (portSample, error) {
    res, err := g.Get([]string{
        fmt.Sprintf("1.3.6.1.2.1.2.2.1.10.%d", ifIndex),
        fmt.Sprintf("1.3.6.1.2.1.2.2.1.16.%d", ifIndex),
    })
    if err != nil {
        return portSample{}, err
    }
    s := portSample{at: time.Now()}
    for i, v := range res.Variables {
        if i == 0 {
            s.ifIn = gosnmp.ToBigInt(v.Value).Uint64()
        } else {
            s.ifOut = gosnmp.ToBigInt(v.Value).Uint64()
        }
    }
    return s, nil
}

func main() {
    g := newSNMP("192.168.1.1", "public")
    if err := g.Connect(); err != nil {
        panic(err)
    }
    defer g.Conn.Close()

    s1, err := fetchPort(g, 1)
    if err != nil {
        panic(err)
    }
    time.Sleep(30 * time.Second) // 采样间隔要远大于回绕周期才有意义
    s2, err := fetchPort(g, 1)
    if err != nil {
        panic(err)
    }

    secs := s2.at.Sub(s1.at).Seconds()
    // 字节差 × 8 bit ÷ 秒 = bps；回绕或重启清零时 s2 < s1，跳过本轮
    if s2.ifIn >= s1.ifIn && s2.ifOut >= s1.ifOut {
        inBps := float64(s2.ifIn-s1.ifIn) * 8 / secs
        outBps := float64(s2.ifOut-s1.ifOut) * 8 / secs
        fmt.Printf("in=%.1f Mbps out=%.1f Mbps 利用率in=%.1f%%\n",
            inBps/1e6, outBps/1e6, inBps/1e9*100) // 千兆口
    }
}
```

delta 必须在 s2 大于等于 s1 时才计算：计数器回绕或设备重启清零后，s2 会比 s1 小，直接用减法会得到巨大的负数速率。

### Walk 批量取 ifTable

交换机 48 个口逐口 Get 要 48 个往返；Walk 按前缀一趟全拿回来：

```go
// Walk 遍历整棵子树：每个结果回调一次
err := g.Walk("1.3.6.1.2.1.2.2.1.2", func(pdu gosnmp.SnmpPDU) error {
    fmt.Printf("%s = %v\n", pdu.Name, pdu.Value) // 每个端口名一条
    return nil // 返回非 nil 可提前终止遍历
})
if err != nil {
    panic(err)
}
```

超时与重试的调法：Timeout 2s + Retries 2 是安全起点；大批量轮询时把 walk 拆段（MaxOids 控制），否则一次 Walk 占用 agent 数十秒，设备 CPU 会被问爆——网络设备先于监控系统倒下就不体面了。

## 常见坑

第一个坑是 SNMP community 错误表现为 timeout：v2c 没有认证失败应答，community 不对设备直接不回包，与网络不通一模一样。排查顺序：先 ping 通、再用 snmpwalk 命令行验证 community，最后才怀疑代码。

第二个坑是 32 位计数器回绕当故障：千兆口用 ifInOctets，几十秒回绕一次，delta 出负数被当成异常速率。高速端口一律 ifHCInOctets（64 位），delta 前还要判断 s2 大于等于 s1。

第三个坑是单次 Get 的 OID 太多：不同设备对单请求 OID 上限容忍不同，超了整包拒绝。MaxOids 取保守值 16，大批量用 Walk 而非一次 Get。

第四个坑是 UDP 丢包只看单次请求：SNMP 走 UDP，丢一次包就判 DOWN 会满屏假告警。Retries 设置 2 次，显著降低假 DOWN。

第五个坑是采样间隔小于回绕周期就毫无意义：32 位计数器几十秒就回绕，30 秒采一次能拿到完整 delta，1 秒采一次全是回绕噪声。采样间隔永远要远大于计数器回绕周期。

第六个坑是把 v2c 的 community 当加密口令：它是明文口令，跨公网传输会被抓包还原。内网可用，走公网必须换 SNMP v3 加密。