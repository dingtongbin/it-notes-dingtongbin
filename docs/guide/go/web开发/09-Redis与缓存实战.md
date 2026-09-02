# Redis 缓存实战

数据库就位后，下一个坎是延迟与并发：MySQL 扛不住的高频读请求、需要跨进程协调的锁。这一篇用纯 Go 的 go-redis 客户端，把缓存策略落地成代码。重点写三个生产级场景：cache aside、singleflight 防击穿、Lua 校验的分布式锁。

## 客户端初始化

```go
import (
	"context"
	"time"

	"github.com/redis/go-redis/v9"
)

rdb := redis.NewClient(&redis.Options{
	Addr:            "127.0.0.1:6379",
	Password:        "",
	DB:              0,
	PoolSize:        64,                     // 连接池
	ReadTimeout:     500 * time.Millisecond, // 单命令读超时，生产别用默认 3s
	MinIdleConns:    8,                      // 预热连接
})

// v9 铁律：所有命令第一个参数是 ctx
ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
defer cancel()
if err := rdb.Ping(ctx).Err(); err != nil {
	return err // 启动时验活，配置错误第一时间暴露
}
```

go-redis 是纯 Go 实现，不依赖 cgo。v9 相比老版本最明显的变化是把 ctx 塞进了每个方法签名，超时取消都要靠它。

## 五大类型与 Pipeline

| 类型 | 典型场景 | 核心 API |
|---|---|---|
| String | 缓存 JSON、计数器、锁 | Get / Set / SetNX / Incr |
| Hash | 对象部分字段读写 | HSet / HGet / HGetAll |
| List | 简单队列 | LPush / RPop / LRange |
| Set | 去重、共同关注 | SAdd / SIsMember / SInter |
| ZSet | 排行榜、延迟队列 | ZAdd / ZRevRangeWithScores |

```go
// String：缓存对象，序列化成 JSON
data, _ := json.Marshal(host)
rdb.Set(ctx, "monitor:host:1", data, 10*time.Minute)

// Hash：只改一个字段不用整存整取
rdb.HSet(ctx, "monitor:host:1:fields", "status", "active")

// 计数器：Incr 原子自增，配 Expire 做限流窗口
n, _ := rdb.Incr(ctx, "ratelimit:api:u1").Result()
```

批量读写用 Pipeline，N 条命令一次网络往返，省掉 N-1 次 RTT：

```go
cmds, err := rdb.Pipelined(ctx, func(pipe redis.Pipeliner) error {
	for i := 1; i <= 100; i++ {
		pipe.Incr(ctx, fmt.Sprintf("counter:%d", i))
	}
	return nil // 只返回组装阶段的错误，结果在 cmds 里
})
```

Pipelined 只是省网络往返，命令之间没有原子性。需要"这批命令要么整体执行"用 TxPipeline（底层 MULTI/EXEC）。大多数场景 Pipelined 就够。

## cache aside：读与写

读路径三板斧：查缓存、miss 查库、回填。写路径是标准的先库后删缓存：

```go
// 读：miss 就查库回填
func getHostCached(ctx context.Context, rdb *redis.Client, db *sql.DB, id int64) (Host, error) {
	key := fmt.Sprintf("monitor:host:%d", id)

	val, err := rdb.Get(ctx, key).Result()
	if err == nil { // 命中
		var h Host
		if err := json.Unmarshal([]byte(val), &h); err != nil {
			return h, err
		}
		return h, nil
	}
	if !errors.Is(err, redis.Nil) { // redis.Nil 是 miss；别的错误是真故障，别当 miss
		return Host{}, err
	}

	// miss：查库再回填，TTL 加随机抖动防雪崩
	h, err := getHost(ctx, db, id)
	if err != nil {
		return h, err
	}
	data, _ := json.Marshal(h)
	jitter := time.Duration(rand.Intn(300)) * time.Second
	if err := rdb.Set(ctx, key, data, 10*time.Minute+jitter).Err(); err != nil {
		log.Printf("cache set: %v", err) // 回填失败不致命，下次再查库
	}
	return h, nil
}

// 写：先更新库，再删缓存而不是改缓存
func updateHostCached(ctx context.Context, rdb *redis.Client, db *sql.DB, id int64, name string) error {
	if err := renameHost(ctx, db, id, name); err != nil {
		return err
	}
	// 删而非改：并发写时改会互相覆盖出旧值，删则让下次读自己回填
	if err := rdb.Del(ctx, fmt.Sprintf("monitor:host:%d", id)).Err(); err != nil {
		log.Printf("cache del: %v", err) // 删失败只留一份旧数据，TTL 到期自愈
	}
	return nil
}
```

为什么删不是改：两个写请求并发时，改缓存可能把旧值写回；删则幂等，最坏情况是短暂旧值，由 TTL 兜底。

## 缓存三大问题的 Go 落地

穿透（查不存在的 key 每次都打穿到库）用空值缓存：

```go
if errors.Is(err, ErrNotFound) {
	rdb.Set(ctx, key, []byte(""), 30*time.Second) // 空值占位，同样的恶意 id 只打一次库
	return Host{}, ErrNotFound
}
```

击穿（热 key 失效瞬间万级并发同时回源）用 singleflight 合并回源：

```go
import "golang.org/x/sync/singleflight"

var sf singleflight.Group

func getHostSF(ctx context.Context, rdb *redis.Client, db *sql.DB, id int64) (Host, error) {
	key := fmt.Sprintf("monitor:host:%d", id)
	val, err := rdb.Get(ctx, key).Result()
	if err == nil && val != "" { // 命中（含空值占位）
		var h Host
		if err := json.Unmarshal([]byte(val), &h); err != nil {
			return h, err
		}
		return h, nil
	}

	// miss：同 key 并发只放一个查库，其余等它的结果
	v, err, _ := sf.Do(fmt.Sprintf("host:%d", id), func() (any, error) {
		h, err := getHost(ctx, db, id)
		if err != nil {
			return nil, err
		}
		data, _ := json.Marshal(h)
		rdb.Set(ctx, key, data, 10*time.Minute+time.Duration(rand.Intn(300))*time.Second)
		return h, nil
	})
	if err != nil {
		return Host{}, err
	}
	return v.(Host), nil
}
```

Do(key, fn) 的语义：同 key 并发调用只有一个执行 fn，所有调用者共享同一结果。Forget(key) 可以把 key 踢掉，慢请求时让下一个请求不必陪等。

雪崩（大批 key 同时到期）靠 TTL 随机化，上面的 jitter 就是干这个：基准 10 分钟加 0 到 5 分钟抖动，到期时间被打散。

## 分布式锁

定时任务多副本部署会重复执行，需要跨进程互斥锁。Redis 锁的核心是一条原子命令：

```go
// 抢锁：SET NX EX 三合一，必须一条命令完成
ok, err := rdb.SetNX(ctx, "lock:report:cron", token, 30*time.Second).Result()
```

误删问题的解法是用唯一 token 加 Lua 校验删除：

```go
var unlockScript = redis.NewScript(`
if redis.call("GET", KEYS[1]) == ARGV[1] then
    return redis.call("DEL", KEYS[1])
else
    return 0
end
`) // Lua 保证 GET 比对和 DEL 原子执行

func withLock(ctx context.Context, rdb *redis.Client, key string, ttl time.Duration,
	fn func(ctx context.Context) error) error {
	token := uuid.NewString() // 每次加锁生成的唯一值，证明锁还是我的
	ok, err := rdb.SetNX(ctx, key, token, ttl).Result()
	if err != nil {
		return err
	}
	if !ok {
		return ErrLockHeld // 别人持有：本周期跳过
	}
	defer func() {
		uctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		_ = unlockScript.Run(uctx, rdb, []string{key}, token).Err()
	}()

	return fn(ctx) // 业务执行完或 panic，defer 都会放锁
}
```

用 SetNX 抢到锁后必须立刻 defer 解锁；解锁不能用 Del（会误删别人的锁），要用 Lua 校验 token 才删。业务比 ttl 长时要起 goroutine 定期续期（看门狗思想，网上有现成的 redislock 库内置了看门狗）。

## 常见坑

第一个坑是 key 无前缀无 TTL。全业务共用一个 DB 时，monitor: 和自己的 key 混在一起、永远不过期，Redis 变成垃圾场。规范是业务冒号实体冒号 id 三段前缀，写操作强制带 TTL。

第二个坑是 redis.Nil 当错误。Get 查不到返回 redis.Nil，它是 miss 不是故障。判空用 errors.Is(err, redis.Nil) 必须三分支：命中、miss、真错误，漏判会把缓存故障放大成全量打库。

第三个坑是连接池小导致偶发超时。默认池在高并发下排队，报 connection pool timeout 就查 PoolSize。监控 PoolStats 的 Timeouts 字段，持续非零就要调整。

第四个坑是 panic 时锁没释放。抢到锁后业务 panic，没有 defer Unlock 就只能等 TTL 到期。Unlock 紧跟抢锁成功后 defer，解锁用独立短超时的 context。

第五个坑是大 key。一个 key 塞几十万成员读写都慢、还阻塞网络和删除。单 key 控制在几十 KB 内，集合类要分片或用多个小 key。