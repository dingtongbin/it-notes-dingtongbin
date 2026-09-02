# Docker 环境安装与镜像拉取

理解了容器，这一篇把手动起来：装好 Docker，学会拉镜像、看容器、跑第一个容器。所有后续章节都建立在能顺利跑容器的基础上。

## 安装 Docker

Docker 由客户端守护进程组成，安装方式按平台不同：

- Linux：用官方仓库脚本或发行版包管理器安装 docker-ce 和 docker-compose 插件。
- Windows/macOS：装 Docker Desktop，内置 linux 虚拟化，直接可用。
- 装完验证：

```bash
docker version    # 客户端和守护进程版本
docker info       # 守护进程详细信息
```

Windows 下跑 Linux 容器，本质是在一个轻量虚拟机里跑 Docker 守护进程，命令用法和 Linux 完全一致。

## 从仓库拉镜像

镜像来自镜像仓库，公共的默认是 Docker Hub。拉镜像：

```bash
docker pull nginx:latest      # 指定标签
docker pull nginx:1.27        # 指定版本
docker images                 # 查看本地镜像
docker image rm nginx:latest  # 删镜像
```

分层机制让拉取很快：如果底层层已在本地，只需拉新增层。

## 跑第一个容器

```bash
docker run -d -p 8080:80 --name web nginx
```

一条命令拆开看：-d 后台运行，-p 8080:80 把宿主 8080 端口映射到容器 80 端口，--name 给容器命名，nginx 是镜像。跑起来后浏览器访问宿主 8080 就能看到 nginx 页面。

## 常用的容器操作

```bash
docker ps                     # 看运行中的容器
docker ps -a                  # 看所有容器（含已退出）
docker logs -f web            # 跟踪日志
docker exec -it web bash      # 进入容器开一个 shell
docker stop web               # 停容器
docker start web              # 启容器
docker rm web                 # 删容器
```

进入容器调试是很常用的操作：docker exec -it <容器> bash，如果镜像里没有 bash 就用 sh。

## 先跑起来再说

```
docker run → 容器启动 → 进程运行 → 访问端口 → 看日志 → 进入调试 → 停止删除
```

这一套循环就是后面所有深入内容的地基。先把"能拉镜像、能起容器、能进去看"跑顺，再谈构建、网络、卷这些进阶主题。