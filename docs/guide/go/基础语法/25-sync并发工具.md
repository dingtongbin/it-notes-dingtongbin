# sync 并发工具

channel 走通信路线，sync 包是"共享内存"路线的工具箱：WaitGroup、Mutex、RWMutex、atomic、Once。两条路线都常用。这一篇把每件的用法和适用判断讲清。

## WaitGroup：等待一组 goroutine

```go
var wg sync.WaitGroup

for i := 1; i <= 5; i++ {
	wg.Add(1)                       // 计数 +1（必须在 go 语句前）
	go func(id int) {
		defer wg.Done()             // 计数 -1（必须 defer）
		time.Sleep(time.Duration(id*100) * time.Millisecond)
		fmt.Println("worker", id, "done")
	}(i)
}

wg.Wait()                           // 阻塞到计数归零
fmt.Println("全部完成")
```

三条纪律：Add 在启动前调用，Done 必须 defer（防 panic 跳过），Wait 返回之后读结果安全（Wait 提供 happens-before 保证）。

## Mutex：互斥锁

```go
type Counter struct {
	mu    sync.Mutex
	count map[string]int
}

func (c *Counter) Inc(key string) {
	c.mu.Lock()
	defer c.mu.Unlock()             // 永远 defer Unlock（panic 安全）
	c.count[key]++
}

func (c *Counter) Get(key string) int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.count[key]
}
```

锁的纪律：临界区尽量小，锁内不做 IO、不发请求；defer Unlock；多把锁防死锁，全局固定加锁顺序。

RWMutex 适合读多写少的场景，读锁并发共享，写锁独占：

```go
type Config struct {
	mu   sync.RWMutex
	data map[string]string
}

func (c *Config) Get(k string) string {
	c.mu.RLock()                    // 读锁：并发读共享
	defer c.mu.RUnlock()
	return c.data[k]
}

func (c *Config) Set(k, v string) {
	c.mu.Lock()                     // 写锁：独占
	defer c.mu.Unlock()
	c.data[k] = v
}
```

## atomic：无锁原子操作

单值计数用类型化原子 API：

```go
var counter atomic.Int64
counter.Add(1)
n := counter.Load()
counter.Store(100)
old := counter.Swap(0)

// 原子布尔：优雅退出标志
var running atomic.Bool
running.Store(true)
go func() {
	for running.Load() {
		doWork()
	}
}()
running.Store(false)               // 通知退出
```

atomic 的边界：只做单个数值的增减和读写。复合逻辑（改两个字段、检查再设置复杂对象）要用锁。

## sync.Once：只执行一次

```go
var (
	instance *Config
	once     sync.Once
)

func GetConfig() *Config {
	once.Do(func() {                // 并发调用也只执行一次
		instance = loadConfig()
	})
	return instance
}
```

单例的标准实现，线程安全，无需手写锁，也用于懒初始化连接池。

## 合作选择

共享状态设计优先级：

第一，不共享：每 goroutine 处理独立数据，最后 channel 汇总。

第二，不可变：共享数据构建后只读，map 包一层只读 API。

第三，单值计数：atomic。

第四，复合状态：Mutex 或 RWMutex，小临界区。

第五，任务流水线：channel 加 worker 池。

## 常见坑

第一个坑：Lock 后 panic 没 Unlock，defer Unlock 是铁律。

第二个坑：含 Mutex 的结构体按值传递会拷贝锁状态，go vet 的 copylocks 能查，持有锁的类型永远用指针传递。

第三个坑：RWMutex 写饥饿，读锁持续叠加时写锁等不到，写多的场景直接用 Mutex。