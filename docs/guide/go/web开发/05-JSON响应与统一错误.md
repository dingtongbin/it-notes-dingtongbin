# JSON 响应与统一错误

前面的接口各自用 c.JSON 拼字段，错误处理也随手 return。接口一多，返回格式五花八门，前端没法统一处理。这一篇定两个约定：统一的响应包装结构，以及把错误翻译成统一 JSON 的机制。这是所有正规 API 帖子的基础。

## 统一响应结构

先定义一个标准的响应包，成功和失败都走同一个结构，前端只要写一次解析逻辑：

```go
type Resp struct {
	Code    int    `json:"code"`    // 业务码，0 表示成功
	Message string `json:"message"` // 可读描述
	Data    any    `json:"data"`    // 具体数据，可为 null
}
```

写两个助手函数，成功和失败各一个：

```go
func Success(c *gin.Context, data any) {
	c.JSON(200, Resp{Code: 0, Message: "ok", Data: data})
}

func Fail(c *gin.Context, httpStatus, code int, message string) {
	c.JSON(httpStatus, Resp{Code: code, Message: message})
}
```

业务码 code 和 HTTP 状态码分开的意义：HTTP 状态码表达传输层面的成功失败，业务码表达业务层面的具体错误。例如 HTTP 200 但业务码是 1001 表示参数有问题，前端统一看 code 而不是 status。

## 业务错误类型

想让统一错误好维护，需要先把业务错误定义成类型。简单做法用哨兵错误，配合一个翻译规则：

```go
var (
	ErrNotFound   = errors.New("resource not found")
	ErrBadRequest = errors.New("bad request")
	ErrDuplicate  = errors.New("already exists")
)
```

然后写一个专门发错误的函数，内部维护错误到 HTTP 状态码和业务码的映射：

```go
func SendErr(c *gin.Context, err error) {
	code := 500
	msg := "系统繁忙，请稍后再试"
	switch {
	case errors.Is(err, ErrNotFound):
		code = 404
		msg = err.Error()
	case errors.Is(err, ErrBadRequest):
		code = 400
		msg = err.Error()
	}
	c.JSON(code, Resp{Code: code, Message: msg})
}
```

用 errors.Is 而不是 err == 判断的好处是，别人用 fmt.Errorf 包装过的错误也能被正确识别，判断链不断。

## 校验错误的友好化

binding 校验失败返回的 err 是一串英文，直接展示很难看。把校验失败解析成字段加原因的形式：

```go
type FieldError struct {
	Field   string `json:"field"`
	Reason  string `json:"reason"`
}

func parseValidationErr(err error) []FieldError {
	var out []FieldError
	var verr validator.ValidationErrors
	if errors.As(err, &verr) {
		for _, fe := range verr {
			out = append(out, FieldError{
				Field:  fe.Field(),
				Reason: fe.ActualTag(), // 规则名，如 required、email
			})
		}
	}
	return out
}
```

handler 里绑定失败时调用它，返回给前端一组带字段名的错误，前端就能定位到具体输入框：

```go
if err := c.ShouldBindJSON(&req); err != nil {
	c.JSON(400, Resp{Code: 400, Message: "参数错误",
		Data: parseValidationErr(err)})
	return
}
```

## 用一个中间件统一全局 panic 错误

写接口时总有漏处理的错误或突发的 panic，用一个中间件兜底，保证任何未捕获的 panic 都返回统一结构的 500 而不是裸的服务器错误页：

```go
func ErrorHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		defer func() {
			if rec := recover(); rec != nil {
				log.Printf("panic: %v", rec)
				c.AbortWithStatusJSON(500, Resp{
					Code: 500, Message: "内部错误",
				})
			}
		}()
		c.Next()
	}
}
```

AbortWithStatusJSON 在返回 JSON 的同时终止链路。配上 panic 的堆栈打印，线上排查问题就有了第一个线索。

## 完整示例：一个帖子接口

把前面的约定串起来，写一个创建帖子的接口，同时覆盖成功、参数错误、业务错误三条路径：

```go
r.POST("/api/v1/posts", func(c *gin.Context) {
	var req CreatePostReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, Resp{Code: 400, Message: "参数错误",
			Data: parseValidationErr(err)})
		return
	}

	post, err := createPost(c.Request.Context(), req)
	if err != nil {
		if errors.Is(err, ErrDuplicate) {
			SendErr(c, err)
			return
		}
		SendErr(c, err)
		return
	}
	Success(c, post)
})
```

三个 return 对应三条清晰的路径：绑定失败返回参数错误、业务错误由 SendErr 统一翻译、成功走 Success。这样 handler 干净，前端解析统一。

## 常见坑

第一个坑是业务码和 HTTP 状态码混淆。别把业务码直接当 HTTP 状态码用（例如业务码 1001 传成 HTTP 1001），二者独立设计，前端分别处理。

第二个坑是错误信息直接透传底层细节。把 SQL 报错、堆栈、内部路径直接放到 Message 里，等于给攻击者递情报。对外只返回可读的通用信息，细节留在日志。

第三个坑是统一结构中途被破坏。某个接口直接 c.JSON 手写了个不含 code 的对象，前端统一解析就崩了。所有接口一律走 Success 和 SendErr，不允许临时拼裸 JSON。

第四个坑是 SendErr 里漏了默认分支。未知错误会命中默认的 500 分支，这是守底线，不能因为"不会发生"就省略。

第五个坑是校验错误字段名直接用结构体字段名而不是 JSON 名。给前端我的是 Tag 名，要和结构体的 json tag 一致，否则前端对不上输入框。