# 标准库：json 与 time

JSON 编码和解码、时间处理，是任何一个服务都逃不掉的两个标准库主题。这一篇精讲。

## encoding/json

定义结构体时用标签控制字段名：

```go
type Order struct {
	ID        int       `json:"id"`
	Title     string    `json:"title"`
	Status    string    `json:"status,omitempty"`
	Tags      []string  `json:"tags"`
	CreatedAt time.Time `json:"created_at"`     // time.Time 自动 RFC3339
}
```

序列化和反序列化：

```go
b, _ := json.MarshalIndent(order, "", "  ")
fmt.Println(string(b))

var o Order
if err := json.Unmarshal(b, &o); err != nil {
	// 处理错误
}
```

大文件或 HTTP body 用流式 Decoder：

```go
dec := json.NewDecoder(resp.Body)
var list []Order
dec.Decode(&list)
dec.DisallowUnknownFields()          // 未知字段报错（防契约漂移）
```

动态结构用 map[string]any 加类型断言：

```go
var raw map[string]any
json.Unmarshal(b, &raw)
title, _ := raw["title"].(string)
```

## time：时间处理

Go 的时间格式化用"参考时间"2006-01-02 15:04:05 做模板，要背下来：

```go
now := time.Now()
fmt.Println(now.Format("2006-01-02 15:04:05"))

t, err := time.Parse("2006-01-02", "2026-08-30")
t.AddDate(0, 1, 0)                     // 加一个月
t.Sub(now).Hours()                     // 时长
time.Since(start)                      // 耗时（benchmark 高频）

// 时区
loc, _ := time.LoadLocation("Asia/Shanghai")
local := now.In(loc)

// 定时
time.Sleep(2 * time.Second)
time.After(3 * time.Second)            // 通道（配合 select）
time.NewTicker(500 * time.Millisecond) // 周期任务
```

## 常见坑

第一个坑：time.Parse 的格式串不是任意模板，必须是参考时间 2006-01-02 15:04:05 的变体。

第二个坑：time.Time 内部有墙钟和单调钟两份，== 比较可能出乎意料，比较时间用 .Equal()。

第三个坑：json 的 omitempty 把零值字段（0、false、空串）省略了，与"未传"语义混淆，PATCH 部分更新时要注意。