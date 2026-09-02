# 竞态检测与 errgroup

race detector 是 Go 并发代码的 CI 必跑项，errgroup 是并发的现代标准件（WaitGroup 加错误传递加取消传播）。这一篇讲两件事。

## 竞态：为什么会发生

两个 goroutine 无锁写同一个变量就是竞态：

```go
// 坏：两个 goroutine 无锁写同一变量
var n int
for i := 0; i < 2; i++ {
	go func() { n++ }()          // -race 报 DATA RACE；n 最终值不确定
}
```

用 go run -race 或 go test -race 检测：

```bash
go test -race ./...
go run -race main.go
```

修复竞态的三种思路：

```go
// 思路一：atomic
var n atomic.Int64
go func() { n.Add(1) }()

// 思路二：Mutex
var mu sync.Mutex
var count int
go func() { mu.Lock(); count++; mu.Unlock() }()

// 思路三：channel 归集
results := make(chan int)
go func() { results <- 1 }()
n := <-results
```

-race 抓的是真实发生的并发访问时序，比人工 review 可靠。

## errgroup：并发的现代标准件

errgroup 是 WaitGroup 加错误传递加取消传播：

```go
import "golang.org/x/sync/errgroup"      // 扩展库（准官方）

func fetchAll(ctx context.Context, urls []string) error {
	g, ctx := errgroup.WithContext(ctx)   // 带取消的 group
	g.SetLimit(10)                        // 并发上限

	for _, u := range urls {
		u := u
		g.Go(func() error {               // 返回 error 的 goroutine
			resp, err := httpGet(ctx, u)  // 一个失败 -> ctx 取消 -> 其他快速退出
			if err != nil {
				return fmt.Errorf("fetch %s: %w", u, err)
			}
			_ = resp
			return nil
		})
	}
	return g.Wait()                       // 等全部完成，返回第一个错误
}
```

errgroup 比手写 channel 收集省约 30 行，是生产代码的默认选择。

## 常见坑

第一个坑：-race 只抓"发生过"的竞态，跑不到的路径抓不到，测试要覆盖并发路径。

第二个坑：golang.org/x/sync 是扩展库，需要 go get 引入，不是标准库。

第三个坑：atomic 做复合逻辑不安全。check-then-act 场景要用锁或 CAS 循环，atomic 不是万能免锁符。