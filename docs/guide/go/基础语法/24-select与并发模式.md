# select 与并发模式

select 是 channel 的 switch，是多路等待的核心结构。这一篇讲 select 的用法和经典并发模式。

## select：多路等待

```go
select {
case v := <-ch1:
	fmt.Println("收到", v)
case ch2 <- x:
	fmt.Println("发出去了")
case <-time.After(3 * time.Second):
	fmt.Println("超时")
case <-ctx.Done():
	return ctx.Err()               // 取消信号
}
```

要点：多个 case 就绪时随机选一个（避免饥饿）；无 default 时阻塞，有 default 时不阻塞（非阻塞探测）。

经典模式：工作循环加优雅退出：

```go
for {
	select {
	case job := <-jobs:
		process(job)
	case <-quit:
		return
	}
}
```

## 带超时的调用

select + time.After 实现"结果/超时二选一"：

```go
func fetch(url string) (string, error) {
	ch := make(chan string, 1)
	go func() {
		ch <- doFetch(url)
	}()
	select {
	case v := <-ch:
		return v, nil
	case <-time.After(2 * time.Second):
		return "", errors.New("timeout")
	}
}
```

## 并发竞争：谁快用谁

多个副本并发请求，取最先返回的：

```go
func fastest(replicas []string) (string, error) {
	ch := make(chan string, len(replicas))
	for _, r := range replicas {
		go func(addr string) {
			if data, err := fetchOne(addr); err == nil {
				ch <- data
			}
		}(r)
	}
	return <-ch, nil
}
```

第二个返回值（错误）用 select 组合 context 可以更优雅，context 篇细讲。

## 常见坑

第一个坑：探测场景忘了写 default，select 会一直阻塞卡死。

第二个坑：select 的 case 全阻塞又没 default，且没有其他 goroutine 会唤醒时死锁。

第三个坑：随机选择导致分支执行顺序不确定，涉及顺序逻辑不要依赖 select 分支顺序。