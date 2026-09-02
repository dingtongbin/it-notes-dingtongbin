# docker-compose 多容器编排

单个 docker run 只能管理一个容器，但真实应用往往由多个容器组合：web、数据库、缓存、消息队列。这一篇讲怎么用 docker-compose 把一组容器一起定义、一起启停。它是进入 K8s 编排之前最近的一级台阶。

## 为什么需要 Compose

docker run 参数冗长，多个容器要反复敲；容器之间靠自定义网络手动连接；重启要逐个操作。Compose 用一份 YAML 把整套应用描述清楚，一条命令全部搞定。

## 一个 Compose 文件

定义一个 web 加一个数据库：

```yaml
# docker-compose.yml
version: "3.9"

services:
  web:
    build: ./web
    ports:
      - "8080:80"
    depends_on:
      - db
    restart: unless-stopped

  db:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD: secret
    volumes:
      - dbdata:/var/lib/postgresql/data

volumes:
  dbdata:
```

## 拆开看关键概念

services 下列出每个容器；每个服务可以 build（从 Dockerfile 构建）或 image（直接用现成镜像）；ports 做端口映射；volumes 定义持久化卷；environment 设置环境变量。

depends_on 声明启动顺序，让 db 先起来 web 再起。restart 控制失败后是否自动重启，unless-stopped 是很常用的策略。

## 常用命令

```bash
docker compose up -d          # 启动整套，-d 后台
docker compose ps             # 看整套状态
docker compose logs -f web    # 跟某个服务的日志
docker compose down           # 停并移除整套网络
docker compose build          # 重新构建
```

Compose 服务之间靠服务名互相访问，Compose 会自动建一个专用网络把它们连起来。

## 环境变量与配置

Compose 支持从 .env 文件读环境变量，这样 secret 不写死在 YAML 里。还支持用 ${VAR} 引用外部变量，让同一份文件在不同环境复用。

## Compose 与 K8s 的关系

Compose 是单机多容器的编排，K8s 是多机大规模的容器编排。概念一脉相承：Compose 里的 service 对应 K8s 的 Deployment + Service，volumes 对应 PV/PVC，ports 对应 NodePort/Ingress，depends_on 对应 K8s 的探针和就绪。

先用 Compose 把"怎么描述一组容器"的心理模型建立起来，再到 K8s 时，只是这个模型被放大到了集群规模。