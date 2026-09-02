# panic 与 recover

panic 表示程序遇到无法继续的严重问题：停止当前函数、逐层向上展开、执行所有 defer、没有 recover 就整个进程崩溃。这一篇讲机制、recover 的正确用途和与 error 的边界。

## panic 的传播

panic 后当前函数停止，逐层向上展开：

```go
func a() {
	fmt.Println("a start")
	b()
	fmt.Println("a end")           // 不会执行
}

func b() {
	fmt.Println("b start")
	c()
	fmt.Println("b end")           // 不会执行
}

func c() {
	panic("boom")                  // 从这里开始向上展开
}
// 输出：a start / b start / panic: boom / goroutine 栈回溯
```

panic 展开时逐层执行 defer，这就是 recover 能起作用的原因。

## 常见运行时 panic

```go
var p *int
*p = 1                    // panic: nil pointer dereference（最高频）

s := []int{1, 2, 3}
_ = s[10]                 // panic: index out of range

var m map[string]int
m["a"] = 1                // panic: assignment to entry in nil map

var x any = "str"
_ = x.(int)               // panic: interface conversion

var ch chan int
close(ch)                 // panic: close of nil channel
```

这些不是"要处理的错误"，是代码 bug。修复靠 review 和测试，不靠 recover 吞掉。

## recover：拦截 panic

recover 只在 defer 的函数里有效，其他位置调用返回 nil：

```go
func safeDivide(a, b int) (result int, err error) {
	defer func() {
		if r := recover(); r != nil {          // 拦截 panic
			err = fmt.Errorf("panic: %v", r)   // 转成 error
		}
	}()
	return a / b, nil
}
```

原理：panic 展开经过 defer 时，recover 捕获它，展开停止，函数正常返回。配合命名返回值把 panic 转成 error。

## recover 的正当用途

第一大场景：HTTP 服务兜底。一个 handler panic 不能崩掉整个服务，net/http 内部和 Web 框架都内置了这个中间件：

```go
func middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if r := recover(); r != nil {
				log.Printf("panic in %s: %v\n%s", r.URL.Path, r, debug.Stack())
				http.Error(w, "Internal Server Error", 500)
			}
		}()
		next.ServeHTTP(w, r)
	})
}
```

注意要打日志，吞 panic 无日志就是事故隐身。

第二大场景：保护 goroutine。goroutine 里的 panic 没有 recover 会崩掉整个进程，每个可能出错的 goroutine 都要自带 recover，这是 worker 池框架的标准件。

不正当用法是禁止的：把 panic 当控制流，比如吞掉一切异常返回 0，应该返回 error。

## 主动 panic 的合理场景

命名惯例：MustXxx 是 panic 版，Xxx 是 error 版，成对提供。

```go
// 1. 程序员错误（配置写错，崩得越早越好）
func MustParse(s string) time.Duration {
	d, err := time.ParseDuration(s)
	if err != nil {
		panic("invalid duration: " + s)
	}
	return d
}

// 2. 不可恢复的初始化失败
// 3. 标准库的 Must 系列：regexp.MustCompile、template.Must
var re = regexp.MustCompile(`^\d+$`)        // 包级初始化，错了没法处理
```

## 常见坑

第一个坑：recover 不在 defer 里，调用永远返回 nil。

第二个坑：recover 后不打日志，bug 被静默吞掉，比崩溃更难查。recover 必带 log 和 stack。

第三个坑：goroutine 的 panic 逃逸，worker 里没有 recover，一个任务崩掉全部服务。

第四个坑：把 recover 当 try/catch 用。Go 的错误处理主线是 error 返回值，recover 只属于"故障隔离"层。