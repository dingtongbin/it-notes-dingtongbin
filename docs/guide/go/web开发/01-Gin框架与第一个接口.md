# Gin 框架与第一个接口

Go 写 Web 服务的生态里，Gin 是最流行的轻量框架：路由、参数绑定、中间件、JSON 处理全都内置，把标准库 net/http 最啰嗦的部分抽出来。这一篇装好 Gin，跑通一个返回 JSON 的最小接口，并搞懂它和标准库的区别。

全文基于 Go 1.25 与 Gin v1.10。

## 安装与最小程序

Gin 通过 go get 安装，所有依赖都是纯 Go，不需要 cgo，也不需要任何系统库。

```bash
mkdir api && cd api
go mod init yourname/api
go get github.com/gin-gonic/gin
```

装完后 go.mod 里会出现 gin 及其依赖。写第一个入口文件：

```go
// main.go
package main

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func main() {
	r := gin.Default()
	r.GET("/ping", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"message": "pong",
		})
	})
	r.Run(":8080")
}
```

运行：

```bash
go run main.go
curl http://localhost:8080/ping
```

curl 会收到 {"message":"pong"}。

逐行拆解：gin.Default() 创建路由引擎，它自带了两个有用的中间件（日志和 panic 恢复）；r.GET 注册一个 GET 接口，路径是 /ping，处理函数收到一个 *gin.Context；c.JSON 写出一个 JSON 响应，StateStatusOK 是 200 的常量；r.Run 在指定地址上启动 HTTP 服务。

## gin.Context 是什么

处理函数的唯一参数 *gin.Context 是 Gin 的核心，它把 HTTP 请求和响应揉成一个大对象，几乎所有能力都从它身上拿：读参数、读请求头、读 body、写 JSON、设置状态码、取中间件塞进去的上下文值。

它和标准库的 http.ResponseWriter 加 *http.Request 是一一对应的，Gin 只是把两者合并，这样做的结果是不用再写重复的样板：

| 动作 | 标准库 | Gin |
|---|---|---|
| 读路径参数 | r.PathValue("id") | c.Param("id") |
| 读查询参数 | r.URL.Query().Get("page") | c.Query("page") |
| 读请求头 | r.Header.Get("X") | c.GetHeader("X") |
| 写 JSON | json.NewEncoder(w).Encode(v) | c.JSON(code, v) |
| 设置状态码 | w.WriteHeader(code) | c.Status(code) |

下一批接口会逐个用上。

## 返回 JSON：map、切片、结构体

gin.H 是一个 map[string]any 的别名，适合随手拼几个字段：

```go
r.GET("/hello", func(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"name": "ding",
		"age":  18,
	})
})
```

但工程上更推荐返回结构体，字段名和 JSON 键由 tag 控制，可读性和可维护性都更好，也方便复用：

```go
type User struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
}

r.GET("/users/me", func(c *gin.Context) {
	c.JSON(http.StatusOK, User{ID: 1, Name: "ding"})
})
```

c.JSON 内部自动做 json.Marshal，并帮你把头写成 application/json。想缩进美化调试用 c.IndentedJSON，生产直接用 JSON。

## 动态参数与分组

路由里用 :冒号 声明动态段，占位名用 c.Param 取出来：

```go
r.GET("/users/:id", func(c *gin.Context) {
	id := c.Param("id") // 拿到的总是字符串
	c.JSON(http.StatusOK, gin.H{"id": id})
})
```

同一路径的不同请求方法要分开注册。当路径能同时命中静态和动态段时，静态优先：/users/me 这个精确匹配会盖过 /users/:id。

相关接口可以用分组把前缀收进来：

```go
v1 := r.Group("/api/v1")
{
	v1.GET("/users/:id", getUser)
	v1.POST("/users", createUser)
	v1.DELETE("/users/:id", deleteUser)
}
```

分组只统一前缀，不影响里面每个接口的注册方式。分组的真正价值是给某组整体挂中间件，后面章节展开。

## 路由的三种引擎模式

gin.Default() 用的是 debug 模式，请求时终端会打一堆日志。发布时切换到 release 模式，去掉调试日志，性能也略好：

```go
gin.SetMode(gin.ReleaseMode) // 必须在创建引擎之前调用
r := gin.Default()
```

空白的 gin.New() 不带任何 middleware，适合想完全自己控制中间件链的场景，后面中间件章节会用它来精确组装。

## 与标准库的关系

Gin 底层依然是标准库 net/http 的 http.Server，它只是把 Handler 那一层做得更好用。理解了标准库（基础语法章节的 net/http 篇），再回来看 Gin 就只是记 API；反过来如果直接上手 Gin，遇到诡异的性能或优雅退出问题，还是得回到底层排查。框架替你写样板，但不懂底层你会被样板卡住。

## 常见坑

第一个坑是 gin.H 和结构体混用导致 JSON 字段名不一致。gin.H 的键原样输出，结构体字段则受 json tag 控制，两个写在同一接口里容易出现对不上的情况，定下一个接口全用结构体或全用 gin.H 最好。

第二个坑是漏了 gin.SetMode。开发机没设也正常，但部署到生产时 debug 模式会打满日志还慢一点，记得在 main 里切换。

第三个坑是端口被占用或没监听成功就调 curl，拿到 connection refused 就去查是不是另一个进程占了 8080，而不是怀疑路由写错。

第四个坑是只挑了 hello world 就以为会了 Gin。路由的动态段、分组、参数绑定、中间件才是日常主力，把这一篇之后的几篇都读下来再写正式项目。