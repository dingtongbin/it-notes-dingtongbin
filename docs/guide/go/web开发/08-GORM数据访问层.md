# GORM 数据访问层

上一章手写 Scan 之后，你会立刻体会到样板之痛。这一篇用 GORM 把模型定义、CRUD、关联、事务都收进类型安全的 API。GORM 依赖的 MySQL 驱动是纯 Go 的 gorm.io/driver/mysql，全程无 cgo。顺便把本章重点落下来：把 ORM 藏在数据访问接口后面，方便测试。

## ORM 选型

先辩论再选。Go 生态的数据访问方式分四档：

| 方案 | 样板量 | 类型安全 | 迁移 | 适合 |
|---|---|---|---|---|
| database/sql | 最多 | 弱（手工 Scan） | 无 | 学原语、极端控 SQL |
| sqlx | 少 | 中（标签映射） | 无 | 想写 SQL 又懒得 Scan |
| GORM | 最少 | 强（模型字段） | AutoMigrate | 业务 CRUD 为主的团队 |
| sqlc | 少（生成） | 最强（SQL 即真理） | 无 | 信 SQL 不信 ORM 的团队 |

GORM 之于 database/sql，就像 SQLAlchemy ORM 之于 Python 的 DBAPI。本章主线 GORM，它贴你熟悉的 ORM 心智模型，生态也全；但记住它只是实现细节，后面会把它隔离在接口后面。

## 模型定义

```go
import (
	"time"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"
)

dsn := "app:secret@tcp(127.0.0.1:3306)/monitor?charset=utf8mb4&parseTime=true"
db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{
	Logger: gorm.Default.LogMode(gorm.Warn), // 慢 SQL 和错误才打日志
})
if err != nil {
	return err
}
// gorm.DB 内部就是 sql.DB 的池，可取出原生池设参数，和上一章同一套
sqlDB, _ := db.DB()
sqlDB.SetMaxOpenConns(64)
sqlDB.SetMaxIdleConns(16)
```

模型定义靠 tag 表达建表与校验意图：

```go
type Host struct {
	ID        uint           `gorm:"primaryKey"`
	Name      string         `gorm:"column:host_name;size:64;not null"`
	IP        string         `gorm:"size:45;uniqueIndex"`
	Memo      string         `gorm:"size:255"`
	Status    string         `gorm:"size:16;default:active"`
	CreatedAt time.Time      // 约定：创建时自动填
	UpdatedAt time.Time      // 每次更新自动填
	DeletedAt gorm.DeletedAt // 软删除标记
}
```

gorm.Model 是一组内嵌的 ID 加两个时间加软删四件套，嵌入后效果等价。

软删除原理：带 DeletedAt 字段的模型，Delete 只执行 UPDATE hosts SET deleted_at = now() WHERE deleted_at IS NULL；所有查询自动追加 WHERE deleted_at IS NULL。想查含已删数据用 Unscoped。

AutoMigrate 能自动建表加列，但生产环境禁用——DDL 不走审核流程等于事故预备，而且它不会删列改类型。开发期方便，上线前自己维护版本化迁移。

## CRUD 与零值陷阱

```go
// 创建：默认跳过零值字段，Status 空串不进 INSERT，落库走列默认 active
db.Create(&Host{Name: "web-1", IP: "10.0.0.1"})

// 查询单条
var h Host
err := db.First(&h, "host_name = ?", "web-1").Error
if errors.Is(err, gorm.ErrRecordNotFound) {
	// 没查到，转自己的哨兵错误
}

// 更新：struct 版只更新非零值字段，Status 空串会被当"没改"
db.Model(&h).Updates(Host{Name: "web-1-new", Status: ""})
// 想更新零值，用 map 版显式列字段
db.Model(&h).Updates(map[string]any{"status": "", "memo": "维护中"})
// 或用 Select 显式指定
db.Model(&h).Select("Status").Updates(Host{Status: ""})
```

零值陷阱是 GORM 第一大坑：struct 更新只发非零值。想清空字段（置空串、0、false），用 map 或 Select，这条决定上线 review 时要盯所有 Updates 调用。

## 查询构建：链式与 Scopes

```go
var hosts []Host
db.Where("status = ?", "active").
	Where("host_name LIKE ?", "web%").
	Order("created_at DESC").
	Limit(20).
	Offset(40). // 翻页 = (page-1)*size
	Find(&hosts)
```

复用的通用条件抽成 Scope，本质就是接收并返回 *gorm.DB 的函数：

```go
func Paginate(page, size int) func(*gorm.DB) *gorm.DB {
	return func(db *gorm.DB) *gorm.DB {
		if page < 1 {
			page = 1
		}
		if size < 1 || size > 100 {
			size = 20 // size 设上限
		}
		return db.Offset((page - 1) * size).Limit(size)
	}
}

// 用法：链上即插即用
db.Model(&Host{}).Where("status = ?", "active").Scopes(Paginate(page, 10)).Find(&hosts)

// 裸 SQL 兜底：复杂查询别硬扭链式 API
var total int64
db.Model(&Host{}).Where("status = ?", "active").Count(&total)
```

## 关联与预加载

一对多和外键约定，建模如下：

```go
type MetricItem struct {
	ID     uint      `gorm:"primaryKey"`
	HostID uint      // 外键约定：所属模型类型名 + ID
	Host   Host      // BelongsTo，多对一
	Name   string    `gorm:"size:64"`
	Value  float64
	Time   time.Time
}
```

预加载用两条 SQL（先查主机，再按 host_id 批量查指标），消除 N+1：

```go
var hosts []Host
db.Preload("MetricItems").Find(&hosts) // hosts[i].MetricItems 已填充

// 条件预加载：只加载 cpu 指标
db.Preload("MetricItems", "name = ?", "cpu").Find(&hosts)
```

反面教材是循环查库：

```go
for _, h := range hosts {
	db.Where("host_id = ?", h.ID).Find(&h.MetricItems) // 100 台主机 = 100 条 SQL
}
```

原则：列表接口一律 Preload，循环查库禁止。

## 事务与钩子

事务在 GORM 里浓缩成一个闭包，出错自动回滚，成功自动提交：

```go
err := db.Transaction(func(tx *gorm.DB) error {
	if err := tx.Model(&Host{}).Where("id = ?", 7).Update("status", "maintaining").Error; err != nil {
		return err // 返回 error 触发回滚
	}
	item := MetricItem{HostID: 7, Name: "cpu", Value: 0.42, Time: time.Now()}
	if err := tx.Create(&item).Error; err != nil {
		return err // 触发回滚
	}
	return nil // 提交
})
```

panic 同样安全，闭包内 GORM 会回滚后重新抛出。需要手动控制长事务时用 db.Begin() 回到上章模板，但优先闭包。

Hook 是模型生命周期回调，典型如入库前校验：

```go
func (h *Host) BeforeCreate(tx *gorm.DB) error {
	if ip := net.ParseIP(h.IP); h.IP != "" && ip == nil {
		return errors.New("invalid ip") // 返回 error 中断创建
	}
	return nil
}
```

横切副作用（发通知、调 RPC）别放 Hook，应放业务层。Hook 只管本模型的数据合法性；隐式行为是双刃剑，三个月后没人记得它干了什么。

## 把 ORM 隔离在接口后面

别在 handler 里直接 db.Where，那会把 GORM 类型漏进每一层。定义仓储接口，业务只依赖接口：

```go
// 接口属于业务层，不 import gorm
type HostRepo interface {
	Create(ctx context.Context, h *Host) error
	GetByID(ctx context.Context, id uint) (*Host, error)
	ListByStatus(ctx context.Context, status string, page, size int) ([]Host, int64, error)
}

// GORM 实现
type hostRepo struct{ db *gorm.DB }

func NewHostRepo(db *gorm.DB) HostRepo { return &hostRepo{db: db} }

func (r *hostRepo) GetByID(ctx context.Context, id uint) (*Host, error) {
	var h Host
	err := r.db.WithContext(ctx).First(&h, id).Error // WithContext：ctx 全链路传递
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrNotFound // 驱动/ORM 的错误翻译成业务错误，GORM 细节不出门
	}
	return &h, err
}
```

配一个内存 fake 让单测不碰数据库：

```go
type hostRepoFake struct {
	mu    sync.Mutex
	items map[uint]*Host
	next  uint
}

func (f *hostRepoFake) GetByID(_ context.Context, id uint) (*Host, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if v, ok := f.items[id]; ok {
		cp := *v
		return &cp, nil
	}
	return nil, ErrNotFound
}
```

业务逻辑测试不再需要 MySQL，毫秒级跑完。这一层就是后面分层的"数据访问层"，依赖倒置让业务可测。

## 常见坑

第一个坑是 Updates 用 struct 丢零值。想置空必须用 map 或 Select 显式指定，上生产前 review 所有 Updates。

第二个坑是 Delete 是软删。带 DeletedAt 的模型 Delete 发的是 UPDATE 不是 DELETE，真删要 Unscoped。同时唯一索引会和软删冲突（同 IP 删了再建可能撞唯一键）。

第三个坑是 Preload 条件写错位置。db.Where 作用于主表，想过滤关联数据要写进 Preload 的第二参数，写反结果是主表被过滤、关联全量返回。

第四个坑是每条链结束忘了查 .Error。db.Find 的 SQL 失败错误在 .Error 字段里，忘了检查就用结果会静默拿到零值切片。每条链结束必查 Error。

第五个坑是用 db.Where 起链时 ctx 没传，ctx 没传。那是 context.Background()，超时取消全失效。仓储实现统一 db.WithContext(ctx) 起链。