# 字符串与 rune

Go 的字符串是 UTF-8 编码的不可变字节序列，很多新手栽在"中文"上：字节和字符是两个概念。这一篇讲字符串的长度、遍历、常用操作和格式化。

## 字节 vs 字符

```go
s := "你好Go"
fmt.Println(len(s))          // 8：字节长度（中文 3 字节 + Go 2 字节）
fmt.Println(len([]rune(s)))  // 4：字符（rune）数
```

这里的坑：len 返回的是字节数而不是字符数。取第一个字符要用 rune 转换：

```go
s[0]            // 数字节，遇到中文首字节是乱码
[]rune(s)[0]    // 得到真正的第一个字符
```

遍历字符串用 range，它按字符迭代，i 是字节下标：

```go
for i, b := range s {
	fmt.Printf("%d %c ", i, b)
}
```

## strings 包的常用操作

```go
import "strings"

strings.ToUpper(s)
strings.Split("a,b", ",")
strings.Join([]string{"a", "b"}, "-")
strings.Contains(s, "好")
strings.TrimSpace("  x  ")
strings.ReplaceAll(s, "o", "0")
```

格式化拼接用 fmt.Sprintf，对标 Python 的 f-string：

```go
msg := fmt.Sprintf("用户 %s 的 %d 号工单", "tom", 42)
```

数值和字符串互转用 strconv 包：

```go
strconv.Itoa(42)                 // "42"
strconv.Atoi("42")               // 42, error（失败返回 error 而不是抛异常）
```

## 常见坑

第一个坑：s[0] 拿到的是 byte（uint8），对中文会得到乱码，想要字符用 []rune(s)[0]。

第二个坑：Atoi 的第二个返回值（error）忘了接，编译能过但错误被丢掉了。

第三个坑：字符串不可变，不能直接改 s[0]，要用 []byte 转换或 strings.Builder 拼接，拼接性能在字符串篇细讲。