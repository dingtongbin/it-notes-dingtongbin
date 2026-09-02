# goroutine 与 channel

goroutine 是 Go 的招牌：go fn() 就起一个轻量协程，单机轻松几十万并发。channel 是 goroutine 之间的传值管道。Go 的并发哲学一句话：不要通过共享内存来通信，而要通过通信来共享内存。

## goroutine：超轻量线程

```go
func worker(id int) {
	for i := 0; i < 3; i++ {
		fmt.Printf("worker %d: %d\n", id, i)
		time.Sleep(100 * time.Millisecond)
	}
}

func main() {
	go worker(1)                 // 就这一个关键字
	go worker(2)
	time.Sleep(500 * time.Millisecond)   // 等 worker 跑完（生产用 WaitGroup）
}
```

对比线程：OS 线程栈约 1MB、内核调度、切换贵；goroutine 起步 2KB 栈、Go runtime 调度、切换极便宜，十万 goroutine 是常态。

两个立即要懂的规则：

第一，main 退出等于所有 goroutine 全死，main 里 sleep 只是 demo，生产用同步手段等 worker。

第二，goroutine 的 panic 会崩掉整个进程，每个 worker 要兜底。

## channel：类型化的管道

无缓冲和有缓冲两种：

```go
ch := make(chan int)             // 无缓冲：发送阻塞到有人接收
ch := make(chan int, 10)         // 有缓冲：缓冲满才阻塞

ch <- 42                         // 发送
v := <-ch                        // 接收
close(ch)                        // 关闭（发送方关）

v, ok := <-ch                    // ok=false 表示通道已关闭且排空
for v := range ch {              // 循环接收直到通道关闭
	fmt.Println(v)
}
```

无缓冲通道是同步点：ch <- v 会阻塞直到对方接收，天然的两 goroutine 握手。chan struct{} 是"纯信号通道"的惯用类型，struct{} 零字节：

```go
done := make(chan struct{})
go func() {
	fmt.Println("干活")
	close(done)                  // 用关闭表示"完成"信号
}()
<-done                           // 阻塞等待完成
```

## 用 channel 等待一组任务

```go
func fetchAll(urls []string) []string {
	results := make(chan string, len(urls))       // 有缓冲：发送不阻塞

	for _, u := range urls {
		go func(url string) {
			defer func() { recover() }()           // worker 兜底
			results <- doFetch(url)
		}(u)
	}

	var out []string
	for range urls {                               // 恰好收 N 个结果
		out = append(out, <-results)
	}
	return out
}
```

Go 1.22 之后循环变量每轮独立，闭包不用再显式传参数，但跨版本写字习惯传参也无害。

## 生产者-消费者完整示例

```go
func main() {
	jobs := make(chan int, 100)
	results := make(chan int, 100)
	var wg sync.WaitGroup

	// 3 个消费者
	for w := 1; w <= 3; w++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			for j := range jobs {          // 通道排空时循环结束
				results <- j * j
			}
		}(w)
	}

	// 生产者
	for i := 1; i <= 9; i++ {
		jobs <- i
	}
	close(jobs)                            // 关闭后消费者 range 自然退出

	go func() {
		wg.Wait()
		close(results)                     // 全部干完后关结果通道
	}()

	for r := range results {               // 主 goroutine 收结果
		fmt.Println(r)
	}
}
```

通道关闭的所有权纪律：只有发送方 close；多发送方用 WaitGroup 等齐后由协调者 close。接收方永远不 close。

## 常见坑

第一个坑：main 直接跑完 worker 没执行，忘了等待同步。

第二个坑：无缓冲通道收发不匹配导致死锁（fatal error: all goroutines are asleep）。

第三个坑：goroutine 阻塞在没人接收的通道上泄漏，所有通道都要有"谁来收"的答案，长期任务接 context。

第四个坑：把 close 当取消信号，close 只表示"不再发送"，取消用 context。