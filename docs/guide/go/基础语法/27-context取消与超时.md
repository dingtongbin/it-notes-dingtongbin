# context：取消与超时

context 是 Go 传递"取消信号、超时、请求级数据"的标准机制，贯穿 HTTP 请求链，控制 goroutine 生命周期。签名 ctx context.Context 作为第一个参数是 Go 工程的铁律。

## 为什么需要 context

没有取消机制时，goroutine 泄漏和超时失控是常态。context 给每个 goroutine 一个"该停了"的信号源：

```go
ctx, cancel := context.WithTimeout(ctx, 3*time.Second)
defer cancel()

go func() {
	select {
	case <-ctx.Done():              // 收到取消/超时信号
		return
	case result := <-workDone:      // 正常完成
		handle(result)
	}
}()
```

Context 接口有四个方法：

```go
type Context interface {
	Deadline() (deadline time.Time, ok bool)   // 截止时间
	Done() <-chan struct{}                      // 关闭=已取消（信号通道）
	Err() error                                 // Done 后的原因：Canceled / DeadlineExceeded
	Value(key any) any                          // 请求级数据（克制使用）
}
```

## 四种创建方式

```go
// 1. 根：Background（main/服务顶层）或 TODO（占位未定）
ctx := context.Background()

// 2. 手动取消
ctx, cancel := context.WithCancel(parent)
defer cancel()                       // 必须！不调 cancel 就泄漏
go worker(ctx)

// 3. 超时
ctx, cancel := context.WithTimeout(parent, 5*time.Second)
defer cancel()                       // 提前完成也调（释放定时器资源）

// 4. 截止时刻
ctx, cancel := context.WithDeadline(parent, someTime)
defer cancel()
```

ctx 是一棵树：WithCancel、WithTimeout 从父 ctx 派生，父取消则全部子孙取消。HTTP 请求断开时整条调用链自动收到取消，就是这个机制。

## 监听取消：select 模式

长任务的标准骨架：

```go
func worker(ctx context.Context) error {
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()            // Canceled / DeadlineExceeded
		default:
		}
		// 干一段活
		select {
		case <-ctx.Done():
			return ctx.Err()
		case data := <-input:
			process(data)
		}
	}
}
```

阻塞调用必须走带 ctx 的 API 才能被取消：http.NewRequestWithContext、database/sql 的 QueryContext、redis 传 ctx。选库先看支不支持 context。

## 超时控制实战

单次调用的超时，用 WithTimeout 从父 ctx 派生更紧的约束：

```go
func queryUser(ctx context.Context, id int) (*User, error) {
	ctx, cancel := context.WithTimeout(ctx, 500*time.Millisecond)
	defer cancel()
	return db.QueryRowContext(ctx, "...").Scan(...)
}
```

超时预算思想：上游给下游的 ctx 剩余时间是递减的。网关 2s、服务 A 1s、数据库 300ms，各层 WithTimeout 派生而不是重新开满。

## 常见坑

第一个坑：不 cancel 泄漏。WithTimeout、WithCancel 的资源要 cancel 释放，defer cancel 成对写。

第二个坑：把 ctx 存进结构体。ctx 的生命周期是"一次调用"，不是对象字段，作为函数第一个参数传递。

第三个坑：循环任务忽略 Done。循环必须有 <-ctx.Done() 出口，否则取消无效。

第四个坑：用已取消的 ctx 重试永远失败，重试循环里要基于父 ctx 重新 WithTimeout。