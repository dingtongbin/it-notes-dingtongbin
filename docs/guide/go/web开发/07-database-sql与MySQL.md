# database/sql 与 MySQL

前面的接口数据都存在内存里，一重启就没了。这一篇接上真数据库：标准库 database/sql 提供统一的 SQL 接口层，配一个纯 Go 的 MySQL 驱动就能写生产级的数据访问代码。理解了连接池、Scan、事务这些惯用法，下一章的 ORM 就是把这里的样板抽掉。

## 接口层加驱动

database/sql 本身不连数据库，它定义的是 DB、Rows、Tx 这套接口和连接池；真正干活的是驱动。所以代码永远 import 标准库，驱动只注册一次：

```go
import (
	"database/sql"

	_ "github.com/go-sql-driver/mysql" // blank import：只执行驱动的 init() 注册，不直接用它的符号
)
```

blank import 是 Go 的插件注册惯用法：驱动的 init() 把自己塞进 sql.Register，database/sql 按名字找到它。忘写这一行，sql.Open 直接报 unknown driver mysql，这是新手第一坑。

go-sql-driver/mysql 是纯 Go 实现，不依赖 cgo 和任何系统库，这也是选它当示例驱动的原因。

## 连接与验活

DSN 里参数比密码重要，连接池的存活与否取决于这一串配置：

```go
dsn := "app:secret@tcp(127.0.0.1:3306)/monitor?charset=utf8mb4" +
	"&parseTime=true"            // DATETIME 扫到 time.Time（不开只能扫 []byte）

db, err := sql.Open("mysql", dsn)
if err != nil {
	return fmt.Errorf("open mysql: %w", err)
}
defer db.Close() // 进程退出路径关闭整个池

// Open 不建连，真正验活要 Ping。启动时做一次，配置错误第一时间暴露
ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
defer cancel()
if err := db.PingContext(ctx); err != nil {
	return fmt.Errorf("ping mysql: %w", err)
}
```

sql.Open 不连库是故意的惰性设计：配置阶段不依赖数据库存活，健康检查交给 Ping。parseTime=true 必须开，否则拿到的 DATETIME 是字节数组，还要手动转 time.Time。

## 连接池的三个旋钮

db 是池不是单连接，全局一个，并发安全。每个请求开新 db 是重大错误，等于自建连接风暴。三个设置参数各管一种病：

```go
db.SetMaxOpenConns(64)                  // 上限，接近 MySQL 给这个服务预算的连接数
db.SetMaxIdleConns(16)                  // 空闲保留，略低于峰值并发，避免反复建连
db.SetConnMaxLifetime(30 * time.Minute) // 连接太老就换掉，防中间件或数据库静默断开拿到死连接
```

哪个参数管什么：MaxOpenConns 防打满把 MySQL 打爆，MaxIdleConns 防高峰反复握手建连，ConnMaxLifetime 防连接过期自动断掉。经验值是 MaxOpenConns 不是越大越好，慢 SQL 才是瓶颈。

用 db.Stats() 诊断池的健康：

```go
s := db.Stats()
log.Printf("open=%d inUse=%d idle=%d wait=%d",
	s.OpenConnections, s.InUse, s.Idle, s.WaitCount)
```

WaitCount 持续增长说明池打满或在排队，第一反应是查慢 SQL而不是加连接。

## 单行查询：QueryRow

QueryRow 封装了 Query 加 Close，返回一行。Scan 按 SELECT 的列顺序填入字段：

```go
type Host struct {
	ID   int64
	Name string
	IP   string
}

func getHost(ctx context.Context, db *sql.DB, id int64) (Host, error) {
	var h Host
	err := db.QueryRowContext(ctx,
		`SELECT id, name, ip FROM hosts WHERE id = ?`, id,
	).Scan(&h.ID, &h.Name, &h.IP)
	if errors.Is(err, sql.ErrNoRows) {
		return h, ErrNotFound // 哨兵错误，上层用 errors.Is 判断
	}
	return h, err
}
```

Scan 的参数必须与 SELECT 列顺序严格一致，类型不匹配要么静默错位要么报错。永远显式写列名，历史教训是禁 SELECT * 配手写 Scan。

## 多行查询：Query 与 rows 游标

多行返回的是一个游标，必须显式关闭：

```go
func listHosts(ctx context.Context, db *sql.DB) ([]Host, error) {
	rows, err := db.QueryContext(ctx,
		`SELECT id, name, ip FROM hosts ORDER BY id LIMIT 100`)
	if err != nil {
		return nil, err
	}
	defer rows.Close() // 惯用法：循环前就 defer，幂等、安全

	var hosts []Host
	for rows.Next() {
		var h Host
		if err := rows.Scan(&h.ID, &h.Name, &h.IP); err != nil {
			return nil, err
		}
		hosts = append(hosts, h)
	}
	// 循环结束必须检查 rows.Err()：Next 返回 false 可能是读完，也可能是网络中断
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return hosts, nil
}
```

defer rows.Close() 是肌肉记忆：不关闭，连接无法归还池，泄漏到 MaxOpenConns 后全站挂起。

## 插入与更新：Exec

不返回行集的语句用 Exec，result 给两个元信息：

```go
func createHost(ctx context.Context, db *sql.DB, h *Host) error {
	res, err := db.ExecContext(ctx,
		`INSERT INTO hosts (name, ip) VALUES (?, ?)`, h.Name, h.IP)
	if err != nil {
		return err
	}
	id, err := res.LastInsertId() // MySQL 的自增 ID 回填
	if err != nil {
		return err
	}
	h.ID = id
	return nil
}
```

注意所有方法都带 Context 后缀：QueryContext、ExecContext。ctx 从 handler 一路传进来，超时和取消靠它；无 Context 的版本无法中断，生产代码一律用 Context 版。

## 参数化查询与注入

拼接 SQL 是自毁式写法。先看攻击如何发生：

```go
// 危险：用户输入直接进 SQL 文本
q := c.Query("name")
rows, _ := db.Query("SELECT id, name FROM hosts WHERE name = '" + q + "'")
// 攻击者传：' OR '1'='1 -- 就能把全部行拖出来
```

参数化把 SQL 结构和数据彻底分离，驱动负责转义：

```go
rows, _ := db.QueryContext(ctx,
	`SELECT id, name FROM hosts WHERE name = ?`, q)
```

铁律：任何含用户输入的 SQL 都必须参数化。表名、列名无法参数化（它们是结构不是数据），需要白名单校验后再拼，不能拿用户原文去拼。

## 事务：标准模板

单条 SQL 自带原子性，多条要打包就必须显式事务。惯用模板是 defer Rollback 加最后 Commit：

```go
func transferHost(ctx context.Context, db *sql.DB, hostID, toOwner int64) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	// defer Rollback：已 Commit 的 tx 回滚是 no-op，任何 return 出错的路径都会自动回滚，panic 也是
	defer tx.Rollback()

	if _, err := tx.ExecContext(ctx,
		`UPDATE hosts SET owner_id = ?, updated_at = ? WHERE id = ?`,
		toOwner, time.Now(), hostID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO host_audit (host_id, action, created_at) VALUES (?, 'transfer', ?)`,
		hostID, time.Now()); err != nil {
		return err
	}

	return tx.Commit() // 真正落盘的时刻
}
```

事务三纪律：事务内 SQL 越少越好，别在事务里调外部 HTTP（连接被占着，池会耗尽）；别把 *sql.Tx 存进结构体（事务是一次性对象，用完即弃）；ctx 取消时整个事务作废，超时即回滚，天然保护。

## 在 Gin 里用起来

把 db 初始化好，handler 接收 ctx 使用：

```go
r.GET("/api/v1/hosts/:id", func(c *gin.Context) {
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	h, err := getHost(c.Request.Context(), db, id)
	if err != nil {
		SendErr(c, err) // 统一错误里，NotFound 映射成 404
		return
	}
	Success(c, h)
})
```

注意把 c.Request.Context() 一路传进数据库查询，请求被取消或超时，数据库操作也会跟着停，不会白白占着连接。

## 常见坑

第一个坑是 blank import 忘写。sql.Open 直接报 unknown driver mysql，这个 import 带下划线开头，清理未用 import 的时候最容易被误删。

第二个坑是 Scan 列顺序错位或数量不匹配。少写一个参数会在运行时报错，多写或写错类型更隐蔽。显式写列名、对齐 Scan，或用带标签映射的工具（下一章的 ORM）。

第三个坑是 rows 没关闭。Query 后不 Close 连接无法归还，泄漏到池满全站挂起，defer rows.Close() 是条件反射。

第四个坑是查询参数没走参数化，埋下 SQL 注入。记死一条：含用户输入的 SQL 一律参数化。

第五个坑是事务里做外部 IO。HTTP、消息、文件都别放事务里，连接被占十几秒池就空了，事务只包纯数据库操作。