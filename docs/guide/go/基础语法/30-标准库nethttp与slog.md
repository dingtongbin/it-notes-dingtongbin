# 标准库：net/http 客户端与 slog

对外发 HTTP 请求、输出结构化日志，是服务和运维工具的共同底座。这一篇精讲 net/http 客户端三件套和 log/slog。

## net/http 客户端

发请求的三件套纪律：Timeout 必设、用 RequestWithContext、defer Body.Close。

```go
client := &http.Client{ Timeout: 10 * time.Second }    // 必设超时！

req, err := http.NewRequestWithContext(ctx, "POST", "https://api.example.com/orders", body)
req.Header.Set("Content-Type", "application/json")
req.Header.Set("Authorization", "Bearer "+token)

resp, err := client.Do(req)
if err != nil {
	// 超时/网络错误在这
}
defer resp.Body.Close()                // 必须关！

if resp.StatusCode != 200 {
	b, _ := io.ReadAll(resp.Body)
	return fmt.Errorf("http %d: %s", resp.StatusCode, b)
}
data, err := io.ReadAll(resp.Body)
```

漏掉任一件都是事故：不设 Timeout 会无限等待，不关 Body 会连接泄漏。

## log/slog：结构化日志

slog 是 Go 1.21+ 的结构化日志，键值对参数直接成为日志字段：

```go
import "log/slog"

slog.Info("server started", "port", 8080, "mode", "prod")
slog.Error("db failed", "err", err, "host", host)
slog.Warn("slow request", "path", path, "ms", 1234)
```

生产环境常配 JSON 输出，便于采集：

```go
logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
	Level: slog.LevelInfo,
}))
slog.SetDefault(logger)
```

带上下文的日志让 request_id 贯穿链路：

```go
logger.InfoContext(ctx, "handled", "path", r.URL.Path)

// 子 logger 预置公共字段
reqLog := logger.With("request_id", rid)
reqLog.Info("handler done")
```

对比 Python logging：slog 键值对即结构化字段，无需先配 formatter，生产默认 JSON handler。

## 常见坑

第一个坑：http.Client 不设 Timeout，默认永不超时，是 goroutine 泄漏的温床。

第二个坑：resp.Body 读了还要 close，否则连接不归还池，句柄耗尽。

第三个坑：exec 命令注入，参数传列表形式，禁止拼接进 shell。

第四个坑：slog 键值对被落单，key 后面必须跟 value，用规范写法。