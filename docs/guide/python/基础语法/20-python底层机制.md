﻿﻿﻿# 底层机制：GIL与内存管理

这一篇是Python基础模块的收官，把面试最常问的底层问题一次讲清：GIL到底锁了什么、引用计数怎么工作、垃圾回收何时出手、循环引用怎么解决。理解这些，前面篇章里的很多"规则"（多进程绕GIL、可变默认参数、del的行为）会全部贯通。

## GIL：全局解释器锁

它是什么CPython（标准解释器）里有一把全局互斥锁：**同一时刻，只有一个线程能执行Python字节码**。这就是GIL（Global Interpreter Lock）。

为什么存在？CPython的内存管理（引用计数）不是线程安全的。两个线程同时PyObject_DECREF同一个对象，计数可能被并发减两次，对象提前释放 → 崩溃或内存错误。给每个对象加细粒度锁的开销和复杂度太高，CPython选择了简单粗暴的方案：一把大锁保护整个解释器状态。

### 它锁了什么、没锁什么

```
线程A: [执行字节码]──等GIL──[执行字节码]──等GIL──
线程B: ──等GIL──[执行字节码]──等GIL──[执行字节码]
                    ↑
        同一时刻只有一个人在跑字节码
```

- 锁住的是：**Python字节码的执行**。所以CPU密集的多线程完全无法并行，4线程跑纯计算 = 串行甚至更慢（加上锁竞争）。
- 没锁住的是：**阻塞式系统调用**（网络IO、磁盘读写、time.sleep）。线程一进阻塞，GIL释放，别的线程接着跑。这就是第16篇"IO密集任务多线程有效"的底层原因。

验证CPU密集下多线程的失效：

```python
import time
from concurrent.futures import ThreadPoolExecutor, ProcessPoolExecutor

def cpu_heavy(n):
    total = 0
    for i in range(n):
        total += i * i
    return total

N = 20_000_000
start = time.perf_counter()
cpu_heavy(N); cpu_heavy(N)                       # 串行两次
print(f"串行: {time.perf_counter() - start:.2f}s")

start = time.perf_counter()
with ThreadPoolExecutor(2) as pool:              # 两个线程：GIL下无收益
    pool.map(cpu_heavy, [N, N])
print(f"双线程: {time.perf_counter() - start:.2f}s")

start = time.perf_counter()
with ProcessPoolExecutor(2) as pool:             # 两个进程：真并行
    pool.map(cpu_heavy, [N, N])
print(f"双进程: {time.perf_counter() - start:.2f}s")
```

典型结果：串行1.6s、双线程1.6s（零收益）、双进程0.9s（近半）。

### 与GIL共存的三条路1. **IO密集**：多线程 / asyncio，等待期间GIL让出，够用。
**CPU密集**：multiprocessing / ProcessPoolExecutor，每进程一个GIL。

**让重计算走C**：numpy、pandas的核心循环在C里执行，执行期间主动放GIL；自己写扩展也可以。

补充：Python 3.13起提供free-threaded（无GIL）实验性构建，3.12时代的主流仍是带GIL的CPython，按上面三条路走。

## 内存管理：引用计数为主

### 引用计数（reference counting）

每个Python对象头部都有一个计数器，记录"有多少个引用指着我"：

```python
import sys

a = [1, 2, 3]
print(sys.getrefcount(a))   # 2：a引用它 + getrefcount的临时参数引用它
b = a
print(sys.getrefcount(a))   # 3
b = None                    # b不再引用，计数 -1
del a                       # 计数归0，对象立刻被销毁
```

规则：

- 绑定名字、放进容器、传参数，计数 +1；离开作用域、del、从容器移除，计数 -1。
- **计数归0，立即回收**（确定性析构，C++ RAII风格）。这就是Python里"del之后马上释放"的原因。

__del__ 方法的触发时机就是计数归0时（慎用，异常环境和解释器退出时行为微妙）。

### 循环引用与分代回收

引用计数有一个致命盲区：

```python
a = []
b = [a]
a.append(b)     # a和b互相引用
del a, b        # 两个对象的外部引用都没了，但互相引用，计数永远 >= 1
# 引用计数法永远收不回这两个对象！
```

解法是**分代垃圾回收器**（gc模块）：定期扫描对象图，找出"外部不可达但内部互相引用"的孤岛并回收。分代策略基于经验：对象越新越可能早死。

- 0代：新建对象，扫描最频繁。
- 0代扫描后存活的对象升入1代，1代升2代，2代扫描最少。

```python
import gc

print(gc.get_threshold())    # (700, 10, 10)：0代700次分配触发一次，之后按比例升级
gc.collect()                 # 手动触发全代回收
gc.disable()                 # 关闭自动GC（极少数高性能场景用，风险自负）
```

验证循环引用能被回收：

```python
import gc

class Node:
    def __init__(self):
        self.other = None

x, y = Node(), Node()
x.other, y.other = y, x
x = y = None
print(gc.collect())     # 输出回收的对象数，包含刚才那两个
```

### 小对象缓存与驻留（intern）

两个前面埋过的"怪现象"现在能解释了：

- **小整数缓存**：CPython启动时预创建 -5~256的int对象，全程序共享。a = 256; b = 256; a is b为True；257起各自创建，交互式里is可能False。**这再次说明比较值用 ==，is只用于None等单例**。
- **字符串驻留**：符合标识符样式的短字符串自动驻留（同一内容共享一份），所以有些s1 is s2意外为True。同样是"不要用is比较字符串"的理由。

### 内存占用模型Python对象很"胖"：

一个空列表56字节起，每个int对象28字节，list里存的其实是指针（8字节/个）加对象本体。

```python
import sys
print(sys.getsizeof([]))         # 56
print(sys.getsizeof(1))          # 28
print(sys.getsizeof("a"))        # 50
# 百万元素列表的内存 ≈ 列表本体(8MB指针) + 元素对象开销
```

数据密集场景的对策（了解即可）：numpy数组存裸数据（百万int8 = 1MB）；__slots__ 省实例dict（第11篇）；大数据用生成器流式处理不落内存。

## 把前面所有"规则"串起来

现在回看前面篇章的规则，全部能从本篇推出：

| 规则                                     | 底层原因                                        |
| ---------------------------------------- | ----------------------------------------------- |
| 可变对象传参，函数内原地修改会影响调用方 | 传的是对象引用，两边指着同一个对象              |
| 默认参数在def时创建一次                | 函数对象创建时求值默认值，绑定在函数上          |
| 字符串拼接循环慢                         | 不可变对象每次拼接分配新串，旧串等回收          |
| CPU密集用多进程                         | GIL只允许一个线程跑字节码                      |
| IO多线程/asyncio有效                   | 阻塞时释放GIL/让出循环                         |
| del后内存未必立刻还给OS              | 对象回收了，但CPython的小对象内存池保留着备用 |
| 用 == 不用is比较值                 | is比较对象身份，受缓存和驻留干扰               |
| 可变对象不能做dict键                   | 内容变则hash变，哈希表定位失效                |

## 常见坑

1. **sys.getrefcount永远比直觉多1**：参数传递本身产生一个临时引用。

2. **依赖 __del__ 做关键清理**：循环引用时 __del__ 的调用时机不确定（靠gc），甚至解释器退出时不再调用。资源清理用with/try-finally，别赌析构。
3. **gc.collect() 当常规手段**：自动GC够用，手动collect只在诊断内存泄漏时用。
4. **误以为del obj立即释放所有内存**：只减引用；若还有引用（比如某个全局缓存），对象活着。内存"不降"先查引用，gc.get_referrers(obj) 能帮上忙。
5. **多线程共享对象无需加锁的错觉**：引用计数本身是原子的（对象不会"半死"），但**对共享容器的同时修改**依然会坏（第16篇counter += 1的实验），该加锁加锁。
6. **free-threaded构建的兼容性**：3.13+ 的nogil版本部分C扩展不兼容，生产上3.12主流版本照旧用GIL思维设计。
