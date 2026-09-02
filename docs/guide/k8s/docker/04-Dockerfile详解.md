# Dockerfile 详解

把应用固化成镜像靠 Dockerfile。这一篇把最常用的指令逐个讲清楚，并说明每条指令和镜像分层的关系。读完能写出正确、可读、尽量小的 Dockerfile。

## 最基本的 Dockerfile

用 Go 写的一个小服务举例，最简单的 Dockerfile 长这样：

```dockerfile
FROM golang:1.22
WORKDIR /app
COPY . .
RUN go build -o server .
CMD ["./server"]
```

## 逐个指令

| 指令 | 作用 |
|---|---|
| FROM | 基础镜像，一切从这里开始。可以很小，如 scratch/alpine |
| WORKDIR | 设定工作目录，后续指令都以它为基准 |
| COPY | 把构建上下文里的文件拷进镜像 |
| ADD | 类似 COPY，还能自动解压 tar、支持远程 URL（一般用 COPY） |
| RUN | 在构建时执行命令，结果固化成一层 |
| CMD | 容器启动时执行的命令，可被覆盖 |
| ENTRYPOINT | 容器的主命令，docker run 后的参数不能覆盖它 |
| ENV | 设置环境变量 |
| EXPOSE | 声明容器要暴露的端口（只是声明，不改运行） |
| ARG | 构建期变量，构建时可传 |
| VOLUME | 声明匿名卷挂载点 |
| USER | 指定运行用户，安全相关 |

## 关键区分：CMD 和 ENTRYPOINT

两者都决定了容器启动时执行什么，但语义不同。ENTRYPOINT 定义"主程序"，CMD 提供默认参数，而 docker run 后面带参数时会覆盖 CMD，ENTRYPOINT 保持不变：

```dockerfile
ENTRYPOINT ["./server"]
CMD ["--port", "8080"]
```

这样 docker run image --port 9090 就能改端口，而主程序不会被替换。原则：主程序放 ENTRYPOINT，默认参数放 CMD。

## 每一条指令产出一层

RUN、COPY、ADD 都会产生新镜像层，所以指令顺序直接决定缓存命中率。构建时如果某层没变，Docker 直接复用缓存；一旦某层变了，它下面所有层都要重建。把容易变的放后面，把基本不变的（装依赖）放前面，是优化构建速度的关键。

## 构建上下文与 .dockerignore

docker build 会把当前目录作为上下文打包发给守护进程。上下文里的文件会在 COPY 时可见。为了避免把 node_modules、.git、日志这些不该进镜像的东西发出去，用 .dockerignore 排除：

```dockerfile
# .dockerignore
node_modules
.git
*.log
```

它只影响发进构建上下文的东西，不影响其他方面。

## 构建与运行

```bash
docker build -t myapp:v1 .
docker run --rm -p 8080:8080 myapp:v1
```

第一个点指构建上下文目录，--rm 让容器退出后自动清理。

## 常见坑

1. 上下文里塞了巨量文件：docker build 慢，先配 .dockerignore。
2. 依赖放后面导致缓存失效：把不变的层放前面。
3. 用 root 跑进程：安全风险，用 USER 换成非特权用户。
4. CMD 和 ENTRYPOINT 混用没想清楚：导致启动方式不可控。