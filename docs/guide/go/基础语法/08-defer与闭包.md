# defer 与闭包

defer 把函数调用推迟到当前函数返回前执行，是对标 Python with / finally 的资源管理手段。闭包则让函数捕获并记住外部变量。这一篇分别讲透。

## defer：延迟执行

无论从哪个 return 退出，defer 注册的调用都会执行。最常用的是关闭资源：

```go
func readFile(path string) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()            // 无论怎么 return，Close 都会执行

	data, err := io.ReadAll(f)
	if err != nil {
		return err             // 这里 return 后 Close 自动执行
	}
	return process(data)       // 这里 return 后 Close 也执行
}
```

三个规则（面试常问）：

第一，defer 在函数返回前执行，多个 defer 后进先出（栈序）：

```go
func demo() {
	defer fmt.Println("1")
	defer fmt.Println("2")
	fmt.Println("3")
}
// 输出：3 2 1
```

第二，defer 的参数在 defer 语句那一刻求值，不是执行时：

```go
x := 10
defer fmt.Println(x)      // 打印 10（此刻已固定）
x = 20
```

第三，命名返回值可以被 defer 修改，这是 recover 实现的基础：

```go
func change() (result int) {
	defer func() { result++ }()   // 匿名函数闭包引用 result
	return 5                      // 实际返回 6
}
```

defer 的资源管理三件套：文件 Close、锁 Unlock、数据库连接回还。

## 闭包

闭包捕获外部变量，形成记忆：

```go
func makeCounter() func() int {
	count := 0
	return func() int {
		count++                 // 闭包捕获 count
		return count
	}
}

c := makeCounter()
fmt.Println(c(), c(), c())      // 1 2 3
```

Go 没有装饰器语法，但"接收函数返回函数"的普通函数就能实现装饰器效果：

```go
func timed(fn func()) func() {
	return func() {
		start := time.Now()
		fn()
		fmt.Printf("耗时 %v\n", time.Since(start))
	}
}
timed(someTask)()                // 手动调用包装
```

## 常见坑

第一个坑：在循环里 defer 关闭文件，句柄会攒到函数结束才释放，可能耗尽文件描述符。循环内手动 Close 或抽成函数。

第二个坑：defer 闭包捕获循环变量时要小心，Go 1.22 之后循环变量每轮独立，但习惯上仍建议以参数传入。

第三个坑：defer 里的错误常被丢弃，严谨的写法是用命名返回值把 Close 的错误也包装进返回值。