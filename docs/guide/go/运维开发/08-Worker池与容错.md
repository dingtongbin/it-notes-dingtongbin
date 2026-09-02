# Worker 池与容错

调度器只管"准时派发"，真正执行探活的是 worker 池。这一节解决三个问题：慢任务如何隔离不绑架快任务、队列满时怎么办、以及调度器怎么被自己监控。worker 池是调度循环背后的马力，也是 panic 兜底的最后防线。

## worker 池与慢任务隔离

一个全局池的问题是：30 秒的 SNMP Walk 占满 worker，1 秒后到期的 ICMP 全在排队——慢协议"绑架"了快协议。gomon 按类型分池，慢任务只在自己池里排队：

| 池 | 典型耗时 | worker 数 | 队列容量 | 说明 |
|---|---|---|---|---|
| icmp | 毫秒级 | 64 | 128 | 量大、快 |
| tcp | 毫秒级 | 32 | 64 | 量大、快 |
| http | 100ms~2s | 32 | 64 | 带超时 |
| snmp | 1~30s | 8 | 16 | Walk 很慢，独立小池 |
| agent | 1~5s | 16 | 32 | 被动模式拉取 |

```go
// scheduler/pool.go
package scheduler

import (
    "context"
    "log/slog"
    "sync"
    "time"

    "gomon/probe"
)

// Pool 单一类型的执行池：固定 worker + 有界队列
type Pool struct {
    name    string
    jobs    chan job
    wg      sync.WaitGroup
    timeout time.Duration // 池级兜底超时：防单个 Check 忘配 Timeout
}

func NewPool(name string, workers, queue int, fallback time.Duration) *Pool {
    p := &Pool{
        name:    name,
        jobs:    make(chan job, queue),
        timeout: fallback,
    }
    p.wg.Add(workers)
    for i := 0; i < workers; i++ {
        go p.worker()
    }
    return p
}

func (p *Pool) worker() {
    defer p.wg.Done()
    for j := range p.jobs { // jobs 关闭且排空后 worker 自然退出
        p.run(j)
    }
}

// run 一个任务一个函数调用：recover 必须放在函数边界才能兜住本轮 panic
func (p *Pool) run(j job) {
    defer func() {
        if r := recover(); r != nil {
            // 探活实现的 bug 只能死一个任务，绝不能死 worker（更不能死进程）
            slog.Error("探活 panic 已兜住", "pool", p.name, "check", j.check.ID, "panic", r)
        }
    }()
    timeout := j.check.Timeout
    if timeout <= 0 {
        timeout = p.timeout
    }
    // 每任务独立超时：ctx 全链路传递，超时即放弃等待结果
    ctx, cancel := context.WithTimeout(context.Background(), timeout)
    defer cancel()
    res := probe.Run(ctx, j.check) // 按类型分发到前面写的探活实现
    _ = res                        // 结果交给写管道
}

// Stop 优雅退出：关 jobs 让 worker 排空存量后退出
func (p *Pool) Stop() {
    close(p.jobs)
    p.wg.Wait()
}
```

每个池同时是四个参数的组合：worker 数决定并行度，队列容量决定积压上限，池级兜底超时防漏配，类型隔离决定慢任务不影响快任务。超时包装的真实含义要弄清：ctx 到期只是"放弃等待结果"，真正的退出依赖探活实现尊重 ctx——探活函数必须接受 ctx 且内部 I/O 设 deadline，否则超时后 goroutine 还挂在系统调用上，池子会被这种"僵尸任务"占满。

## 漏采与补偿：跳过优于排队

池队列满时，gomon 的策略是跳过本轮并计数，绝不排队等待。为什么：

排队意味着延迟累积：排 30 秒队再执行，拿到的是 30 秒前的旧状态，还占着下一轮的名额，雪崩时队列越排越长。

跳过保住调度节拍：本轮丢了，下一轮准时来。监控要的是趋势完整性，偶缺一个采样点无伤大雅——曲线少一个点 vs 曲线整体右移 30 秒，前者无害得多。

跳过数本身是信号：skipped 持续增长说明容量不足，该扩 worker 或拆池，而不是靠排队掩盖。

这与 agent 缓冲"丢旧保新"是同一哲学：有界 + 明确的丢弃策略 + 丢弃计数可观测，永远优于无界排队。

## 自我观测

调度器自己的健康必须先于被监控对象可观测。三个核心指标：

```go
// scheduler/stats.go
package scheduler

import (
    "sync/atomic"
    "time"
)

type Stats struct {
    skipped  atomic.Uint64 // 累计跳过轮数：> 0 且持续增长 = 容量不足
    lagMaxNS atomic.Int64  // 最大调度延迟（纳秒）
    lagLast  atomic.Int64  // 最近一次调度延迟
}

func (s *Stats) ObserveLag(d time.Duration) {
    ns := int64(d)
    s.lagLast.Store(ns)
    for { // 无锁更新 max：CAS 直到成功
        old := s.lagMaxNS.Load()
        if ns <= old || s.lagMaxNS.CompareAndSwap(old, ns) {
            return
        }
    }
}

func (s *Stats) Snapshot() (skipped uint64, lagMax, lagLast time.Duration) {
    return s.skipped.Load(),
        time.Duration(s.lagMaxNS.Load()), time.Duration(s.lagLast.Load())
}

// QueueDepth 各池队列深度：判断该扩哪个池
func (s *Scheduler) QueueDepth() map[string]int {
    m := make(map[string]int, len(s.pools))
    for t, p := range s.pools {
        m[t] = len(p.jobs) // chan 长度是瞬时近似值，监控场景足够
    }
    return m
}
```

lagMax 用无锁 CAS 更新最大值，避免每次观测都抢锁。告警规则示范：lagMax 持续超过 interval 的一半，或 skipped 每分钟新增超过检查项总数的 1%，就该扩容了。

## Zabbix 对照：poller 与 trapper

| 维度 | Zabbix | gomon |
|---|---|---|
| 主动轮询 | poller 进程（StartPollers=N） | 每类型一个 Pool |
| 被动接收 | trapper（10051 端口收 zabbix_sender） | gRPC 流 + 被动模式 |
| 不可达重试 | unreachable poller 独立进程 | snmp/慢探活独立池隔离 |
| 队列观测 | zabbix[queue] 内部监控项 | Stats 三指标 |
| 调度间隔 | 每监控项自定义 interval | Check.Interval |

Zabbix 的 poller 是"从内部队列领任务的工作进程"，server 每秒把到期监控项派给它——与本文"堆顶到期→投池"完全同构；gomon 用 goroutine 池替代多进程，但隔离思路照搬：慢协议单独成池，等价于 Zabbix 把 unreachable poller 拆出独立进程的原因。

## 常见坑

第一个坑是 worker 里不 recover：一个探活函数的数组越界 panic 会沿 goroutine 栈炸掉整个进程，全部检查项瞬间停摆。recover 必须放在"每任务一个函数调用"的边界上，放在 worker 外层循环是兜不住单次任务后续逻辑的。

第二个坑是超时包装的 goroutine 泄漏：ctx 超时只是"放弃等待结果"，如果底层是裸的 conn.Read（不接 ctx、不设 deadline），超时后 goroutine 仍挂在系统调用上，池被慢慢占满。验证方法：压测后用 pprof 看 goroutine 数是否回落。

第三个坑是 panic 兜底放进 worker 循环而不是 run：recover 一旦放在 for 外层，本轮后面的任务都跟着受影响。recover 必须贴近每个任务自己的调用。

第四个坑是池参数靠拍脑袋：worker 数太小探活排队，太大抢占 CPU。从表格里的起点开始，用 QueueDepth 观测实际积压再调，而不是一上来就堆 worker。

第五个坑是 Stop 之后还往里投递：调度循环和 Pool.Stop 并发时，对已关闭的 jobs 通道发送会 panic。Stop 必须先停调度循环（ctx 取消），再关池子。