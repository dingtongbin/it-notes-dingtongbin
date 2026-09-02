# 配置与日志：viper 与 slog

裸 main 写到三百行就开始疼：配置硬编码在代码里、日志全是 fmt.Println 没法采集。这一篇用 viper（配置）和标准库 slog（结构化日志）搭出生产级项目骨架。两者都是纯 Go，无 cgo。上手后，你的服务就能吃配置文件、打可采集的结构化日志。

## 裸 main 的三大痛

```go
// 反例：配置即代码
func main() {
	addr := ":8080"                  // 改端口要重新编译发版
	dsn := "dev:dev@tcp(...)/ops"    // 密码进了 git，永久留底
	fmt.Println("server started")    // 无级别、无结构、无时间戳
	// ...
}
```

三个痛点对应三样工具：viper 管配置来源与覆盖、slog 管结构化输出。和 Python 生态对照：viper 约等于 pydantic-settings，slog 约等于 structlog。

## viper：配置的读取与覆盖

约定配置文件用 yaml，然后 SetDefault 兜底、文件覆盖、环境变量再覆盖，优先级从低到高：

```go
package config

import (
	"fmt"
	"strings"
	"time"

	"github.com/spf13/viper"
)

type Config struct {
	Server Server   `mapstructure:"server"`
	MySQL  MySQL    `mapstructure:"mysql"`
	Log    Log      `mapstructure:"log"`
}

type Server struct {
	Addr        string        `mapstructure:"addr"`
	ReadTimeout time.Duration `mapstructure:"read_timeout"`
}

type MySQL struct {
	DSN          string `mapstructure:"dsn"`
	MaxOpenConns int    `mapstructure:"max_open_conns"`
}

type Log struct {
	Level  string `mapstructure:"level"`
	Format string `mapstructure:"format"`
}

func Load(path string) (*Config, error) {
	v := viper.New()

	// 1. 默认值：兜底，也是让字段"可见"的注册动作
	v.SetDefault("server.addr", ":8080")
	v.SetDefault("log.level", "info")
	v.SetDefault("log.format", "json")

	// 2. 环境变量覆盖：MYAPI_SERVER_ADDR=":9000" 覆盖 server.addr
	v.SetEnvPrefix("MYAPI")
	v.AutomaticEnv()
	v.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))

	// 3. 配置文件
	v.SetConfigFile(path)
	if err := v.ReadInConfig(); err != nil {
		return nil, fmt.Errorf("read config %s: %w", path, err)
	}

	var cfg Config
	if err := v.Unmarshal(&cfg); err != nil {
		return nil, fmt.Errorf("unmarshal config: %w", err)
	}
	return &cfg, nil
}
```

标签是 mapstructure 不是 json，这点最容易漏。配置文件无法读取会直接报错而不是静默降级——静默降级比启动失败难排查得多。

配置文件的长相：

```yaml
server:
  addr: ":8080"
  read_timeout: 5s
mysql:
  dsn: "app:secret@tcp(127.0.0.1:3306)/monitor?parseTime=true"
  max_open_conns: 20
log:
  level: info
  format: json
```

热更新：v.WatchConfig() 在文件变化时触发回调，但它只通知不更新已 Unmarshal 的 struct，需要自己处理。轻量字段像日志级别单独读，整份配置重新 Unmarshal 后原子替换。

## slog：结构化日志

fmt.Println 的日志在采集系统里等于黑洞。slog 输出键值对，机器可检索：

```go
logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
	Level: slog.LevelInfo,
}))
slog.SetDefault(logger) // 换掉全局，库代码里的 slog.Info 也走这套

logger.Info("host created", "id", 42, "name", "web-01")
```

级别 Debug、Info、Warn、Error，低于 Handler 设定级别的日志被丢弃。JSON 格式给生产采集，Text 给开发终端看。

动态级别用 LevelVar，配合 viper 的热更新运行中调整级别不重启：

```go
var level slog.LevelVar
logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: &level}))
level.Set(slog.LevelDebug) // 任何时刻切级别
```

With 给一组日志打固定标签，WithContext 带上 ctx 里的字段：

```go
svcLog := logger.With("app", "myapi", "component", "collector")
svcLog.Info("started")

// 请求级日志：中间件塞 trace_id 进 ctx，用 InfoContext 自动带上
logger.InfoContext(ctx, "handled", "path", "/api/v1/hosts")
```

slog 与 zap 的取舍一句话：默认 slog，标准库、生态收敛、性能够；等日志量到每秒百万级且 profile 证明日志是热点，再换 zap。

## 配置加载与日志初始化的顺序

初始化顺序很重要：配置要读日志的级别，但读配置失败时又最需要打日志。解法是两段式：

```go
func main() {
	cfg, err := config.Load("/etc/myapi/config.yaml")
	if err != nil {
		log.Fatal(err) // 读失败阶段用进程默认 logger 就够了
	}
	initLogger(cfg.Log.Level, cfg.Log.Format) // 配置成功后再初始化正式 logger
	// ...
}
```


## 完整组装：一个 Gin 项目骨架

把配置、日志、数据库、Gin 组装起来看一遍整体布局：

```
myapi/
├── main.go                  # 只做组装与退出码
├── configs/config.yaml      # 配置文件
├── internal/
│   ├── config/config.go     # viper 加载
│   ├── log/log.go           # slog 初始化
│   ├── db/db.go             # 数据库连接
│   └── web/                 # 路由、handler、中间件
└── go.mod
```

main.go 的组装顺序就是依赖顺序：配置、日志、数据库、路由：

```go
func main() {
	cfg, err := config.Load("configs/config.yaml")
	if err != nil {
		log.Fatal(err)
	}

	// 数据库
	db, err := gorm.Open(mysql.Open(cfg.MySQL.DSN), &gorm.Config{})
	if err != nil {
		log.Fatalf("open db: %v", err)
	}

	// Gin 引擎
	r := gin.Default()
	registerRoutes(r, db)

	// 优雅退出
	srv := &http.Server{Addr: cfg.Server.Addr, Handler: r}
	go func() {
		if err := srv.ListenAndServe(); err != nil &&
			err != http.ErrServerClosed {
			log.Fatalf("listen: %v", err)
		}
	}()
	// ... 信号处理同优雅退出章节
	_ = db
	_ = cfg
}
```

## 敏感配置不要进 git

配置与代码分离的核心原则：同一份镜像跑所有环境，行为差异全部由外部注入。

| 敏感度 | 放哪里 | 例子 |
|---|---|---|
| 可公开 | yaml 进 git | server.addr、log.level |
| 环境差异 | 每环境一份 | mysql 地址、日志级别 |
| 敏感 | 环境变量，绝不进 yaml | DSN 密码、API token |

判断标准：这条配置泄露了要不要立刻改密码？要，它就不该出现在任何会被 git 记住的地方。

## 常见坑

第一个坑是 viper 键大小写不敏感，内部全部小写化。yaml 里写 Server: 和 server: 两个顶层键会互相覆盖，mapstructure 标签统一小写加下划线最稳。

第二个坑是 AutomaticEnv 与 Unmarshal 的盲区。Unmarshal 只输出 viper 认识的键，纯环境变量注入、而文件和 SetDefault 里都没出现过的键会被静默丢弃。为每个键都 SetDefault，既是兜底也是注册。

第三个坑是日志初始化时机。日志级别写在配置文件里，但读配置失败时最需要打日志。两段式：起先默认 logger，Load 成功后再 Init 正式 logger。

第四个坑是全局 logger 切换不追溯。slog.SetDefault 换了全局，但之前 With 派生并保存的旧 logger 不会跟着换。先把最终 logger 定下来再到处 With。

第五个坑是 WatchConfig 不刷新 struct。回调只是通知，已 Unmarshal 的结构体原地不动，轻量字段单独处理，整份配置用原子指针替换。