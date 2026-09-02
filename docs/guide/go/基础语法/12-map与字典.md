# map 与字典

map 是 Go 的哈希表。核心要记住三点：写之前必须初始化、不存在的键返回零值、并发不安全的纪律。这一篇把 map 讲清楚。

## 创建与基本操作

```go
m1 := map[string]int{"apple": 1, "banana": 2}
m2 := make(map[string]int, 16)          // 预设容量
var m3 map[string]int                   // nil map：读安全，写 panic！

fmt.Println(m1["apple"])                // 1
m1["cherry"] = 3                        // 增/改
delete(m1, "banana")                    // 删（键不存在不报错）
```

关键：var m3 声明出的 nil map 可以读但不能写，写入会 panic。创建后第一次写之前必须先 make。

## 零值语义与逗号-ok

不存在的键返回对应类型的零值，不报错也不返回 undefined：

```go
fmt.Println(m1["notexist"])             // 0
```

但"没有"和"值是 0"被混淆了，需要区分时用逗号-ok：

```go
v, ok := m1["apple"]
if ok {
	fmt.Println("有", v)
} else {
	fmt.Println("没有")
}
```

## map 是引用语义

赋值、传参共享同一张哈希表，函数里修改调用方看得到：

```go
func addKey(m map[string]int) { m["new"] = 1 }
addKey(m1)
fmt.Println(m1["new"])                  // 1
```

这跟切片不一样，map 没有"值/引用"的犹豫，就是引用语义。

## 遍历顺序与排序

map 遍历顺序是随机的（Go 故意打乱）。需要顺序就先把 key 收集排序：

```go
for k, v := range m1 {
	fmt.Println(k, v)
}

keys := make([]string, 0, len(m1))
for k := range m1 {
	keys = append(keys, k)
}
sort.Strings(keys)
for _, k := range keys {
	fmt.Println(k, m1[k])
}
```

## 典型用法

Go 没有 set 类型，用 map[string]struct{} 模拟，struct{} 是零字节省内存：

```go
seen := make(map[string]struct{})
if _, dup := seen[x]; !dup {
	seen[x] = struct{}{}
}
```

map 存函数做成命令路由器，替代长长的 switch：

```go
routes := map[string]func(){
	"start": startHandler,
	"stop":  stopHandler,
}
if fn, ok := routes[cmd]; ok {
	fn()
}
```

## 常见坑

第一个坑：nil map 写入 panic，先 make。

第二个坑：map 不是并发安全的，多 goroutine 同时读写会直接 fatal error，且不可 recover。有并发访问必须加锁或用 sync.Map，并发安全篇细讲。

第三个坑：依赖遍历顺序的逻辑必须显式排序。