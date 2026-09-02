# Gin 单元测试

写了接口不测，改起来心里没底。这一篇讲 Gin 接口的测试套路：用 httptest 起内存服务器、用库提供的测试工具发请求、自查状态码和响应体，让每个接口都有保底。测 handler 不需要真的起端口，这也是 Go 接口测试比很多语言顺手的地方。

## httptest 起内存服务器

Gin 的引擎不需要真监听端口，交给 httptest.Server 或直接调用 ServeHTTP 就能测：

```go
package main

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func setupRouter() *gin.Engine {
	r := gin.New()
	r.GET("/ping", func(c *gin.Context) {
		c.JSON(200, gin.H{"message": "pong"})
	})
	return r
}

func TestPing(t *testing.T) {
	r := setupRouter()

	// 构造请求
	req := httptest.NewRequest(http.MethodGet, "/ping", nil)
	// 记录响应
	w := httptest.NewRecorder()
	// 直接调引擎的 ServeHTTP，不打真实端口
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", w.Code)
	}
	if body := w.Body.String(); !strings.Contains(body, "pong") {
		t.Fatalf("body = %q, want contains pong", body)
	}
}
```

httptest.NewRequest 造请求，httptest.NewRecorder 记录响应，r.ServeHTTP 执行。三行组合起来就是完整的请求响应闭环，不需要真网络。

## 表驱动测试

同一个接口的多个情况写成表驱动，每个 case 一条数据，清晰又可扩展：

```go
func TestListHosts(t *testing.T) {
	tests := []struct {
		name     string
		path     string
		wantCode int
		wantBody string
	}{
		{"正常", "/api/v1/hosts?page=1", 200, `"name":"web-1"`},
		{"非法分页", "/api/v1/hosts?page=abc", 400, "page"},
		{"超大页", "/api/v1/hosts?size=99999", 200, `"size":100`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, tt.path, nil)
			w := httptest.NewRecorder()
			setupRouter().ServeHTTP(w, req)

			if w.Code != tt.wantCode {
				t.Errorf("status = %d, want %d", w.Code, tt.wantCode)
			}
			if !strings.Contains(w.Body.String(), tt.wantBody) {
				t.Errorf("body missing %q, got %s", tt.wantBody, w.Body.String())
			}
		})
	}
}
```

gin.SetMode 建议在测试里设为 TestMode，测试日志不会变吵，也避免 debug 模式的额外输出影响断言。

## 带 JSON body 的 POST 测试

创建接口要发 JSON 请求体，用 strings.NewReader 造 body，再声明 Content-Type：

```go
func TestCreateUser(t *testing.T) {
	body := strings.NewReader(`{"name":"ding","email":"ding@example.com"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/users", body)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	setupRouter().ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("status = %d, want 201, body = %s", w.Code, w.Body.String())
	}
}
```

校验失败的用例同样发一个非法 body，断言返回 400 且响应里有校验错误信息：

```go
func TestCreateUserValidationFail(t *testing.T) {
	body := strings.NewReader(`{"name":""}`) // 缺必填 name
	req := httptest.NewRequest(http.MethodPost, "/api/v1/users", body)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	setupRouter().ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", w.Code)
	}
}
```

## 依赖替换：让 handler 不碰真数据库

一体化的 handler 测试如果想不连真库，关键是把 repository 或 service 抽成接口，测试里注入假实现。这正好接上分层章节讲的设计：接口让测试能替换依赖。

```go
// 注册路由时接受一个 service，测试传 fake
func setupRouter(svc *service.HostService) *gin.Engine {
	r := gin.New()
	r.GET("/api/v1/hosts/:id", func(c *gin.Context) {
		host, err := svc.Get(c.Request.Context(), c.Param("id"))
		if err != nil {
			Fail(c, 404, 1, err.Error())
			return
		}
		Success(c, host)
	})
	return r
}

func TestGetHost(t *testing.T) {
	svc := service.NewHostService(newFakeHostRepo()) // fake repo
	r := setupRouter(svc)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/hosts/1", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != 200 {
		t.Fatalf("status = %d, want 200", w.Code)
	}
}
```

这样单测毫秒级跑完，不依赖任何外部服务。fake repo 早在数据访问章节见过，这里把它接进路由测试。

## 运行与竞态

```bash
go test ./...          # 跑所有包的测试
go test -run TestPing -v ./...   # 只跑某个测试，带详细输出
go test -race ./...    # 开竞态检测，测并发问题
```

带 -race 跑很重要：handler 天然并发，多个测试同时跑时如果数据访问不加锁，-race 能立刻暴露数据竞争。

## 测试金字塔回顾

| 层 | 数量 | 依赖 | 速度 | 测什么 |
|---|---|---|---|---|
| 单元（fake repo） | 最多 | 无外部 | 毫秒 | 业务规则、handler 行为 |
| 集成（真 DB） | 少 | 真容器 | 秒 | SQL 正确性、事务 |
| e2e | 最少 | 全环境 | 分钟 | 关键路径 |

业务规则用单元测试就够，这正是分层的红利：handler 用 httptest 测，service 用 fake repo 测，只有真 SQL 的 repository 才有必要起真库做集成测试。

## 常见坑

第一个坑是测试里用 gin.Default() 而非 gin.New()。Default 带日志中间件，测试跑起来日志刷屏还测不到日志本身。测试路由用 gin.New() 精确控制中间件。

第二个坑是断言只看状态码不看 body。状态码对了但响应结构错了照样是 bug，加上 body 含有关键字段的断言。

第三个坑是 handler 里连了真数据库。测试被外部服务牵着走，环境一没有就挂。把依赖抽成接口，测试注入 fake。

第四个坑是忘了 SetMode。测试里没切 TestMode，debug 模式下每次请求打日志拖慢测试。

第五个坑是多个测试共享全局路由互相污染。setupRouter 每次调用都重建，别在包级缓存一个引擎给所有测试用，避免中间件状态泄漏。