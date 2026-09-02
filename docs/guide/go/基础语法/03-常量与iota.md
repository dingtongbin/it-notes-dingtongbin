# 常量与 iota

常量是不变的量，iota 是 Go 生成枚举序列的利器。这一篇讲常量的定义和 iota 的实际用法。

## 常量定义

```go
const Pi = 3.14159
const MaxRetries = 5
```

常量可以做运算和比较，但必须是编译期能确定的字面量，不能是函数调用结果。

## iota：自增枚举生成器

在 const 分组里，iota 从 0 开始，每行自动加一。常用于定义状态码：

```go
const (
	StatusPending = iota + 1   // 1
	StatusProcessing           // 2
	StatusDone                 // 3
	_                          // 4（用下划线跳过）
	StatusRejected             // 5
)
```

用下划线可以跳过某个序号，让数字序列保持想要的间隔。

## 实践：枚举类型加 String 方法

光用裸 int 当枚举，打印出来是一堆数字，很难读。工程上惯用做法：定义有名字的类型，再给它写一个返回字符串的方法。

```go
// 定义类型
type Status int

const (
	Pending Status = iota
	Processing
	Done
)

// String 方法让状态可打印
func (s Status) String() string {
	switch s {
	case Pending:
		return "pending"
	case Processing:
		return "processing"
	case Done:
		return "done"
	}
	return "unknown"
}
```

这样打印 Pending、Processing 这些值时会自动调用 String 方法，输出可读的字符串，而不是数字。这种"定义类型 + 方法"的组合是 Go 处理枚举的惯用姿势。

String 方法背后其实是 fmt.Stringer 接口，接口篇会讲它如何控制任意类型的打印形态。