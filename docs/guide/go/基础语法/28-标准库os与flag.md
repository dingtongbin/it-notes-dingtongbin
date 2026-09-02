# 标准库：os 与 flag

Go 标准库覆盖面惊人，"标准库优先"是默认策略。这一篇按高频场景精讲 os、flag、文件操作和外部命令。

## os 与文件操作

环境变量：

```go
port := os.Getenv("PORT")                    // 不存在返回 ""
if port == "" {
	port = "8080"
}
home, ok := os.LookupEnv("HOME")             // 区分"空值"与"未设置"
```

文件操作：

```go
data, err := os.ReadFile("config.json")      // 小文件一步到位
os.WriteFile("out.txt", data, 0644)
f, _ := os.Open("big.log")                   // 大文件流式
defer f.Close()
os.MkdirAll("a/b/c", 0755)
os.Remove("tmp")
```

## os/exec：执行外部命令

执行系统命令是对标 Python subprocess 的能力：

```go
import "os/exec"

cmd := exec.CommandContext(ctx, "ping", "-c", "2", "127.0.0.1")
out, err := cmd.Output()                     // 拿 stdout
fmt.Println(string(out))
```

CommandContext 让它同时受 context 控制，命令超时会被取消。

## flag：命令行参数

标准库 flag 解析命令行参数：

```go
import "flag"

port := flag.Int("port", 8080, "listen port")
name := flag.String("name", "go", "your name")
flag.Parse()                       // 必须调用才生效
fmt.Println(*port, *name)

// 调用：app -port 9090 -name tom
```

## 常见坑

第一个坑：flag 定义后忘了 flag.Parse()，参数不生效。

第二个坑：exec 命令注入，参数要传列表形式（不经过 shell 解释），把字符串拼进 bash -c 是注入入口。

第三个坑：os.ReadFile 适合小文件，大文件用文件句柄流式读，避免读到内存爆掉。