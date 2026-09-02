# 镜像仓库 Registry

镜像要分发到别处，就得放到仓库里。这一篇讲 Docker Hub 之外的自建镜像仓库、打标签上传下载，以及仓库和之前讲的分层怎么配合。

## 从远程仓库拉与推到远程

```bash
docker pull nginx:1.27                    # 从默认仓库拉
docker tag myapp:v1 myrepo/myapp:v1       # 打上带仓库前缀的标签
docker push myrepo/myapp:v1               # 推送到对应仓库
```

镜像名带路径就是仓库的定位：路径的第一段通常是账号或组织，后面的命名空间和标签共同组成唯一地址。

## Registry 是什么

仓库（Registry）是一个存镜像、按名称和标签取镜像的服务。公共的有 Docker Hub、ghcr.io 等，企业常在内部自建，把私有镜像放在内网，避免外传也加快拉取。

## 自建私有仓库

用官方镜像 registry 一条命令就能起一个：

```bash
docker run -d -p 5000:5000 --name registry -v /data/registry:/var/lib/registry registry:2
```

然后推本地镜像到这个私有仓库：

```bash
docker tag myapp:v1 localhost:5000/myapp:v1
docker push localhost:5000/myapp:v1
```

注意：非 TLS 的 HTTP 仓库拉取会默认被拒，需要在客户端配置允许 insecure registry。

## 认证与私有镜像

私有仓库通常要登录才能拉：

```bash
docker login registry.example.com
docker pull registry.example.com/team/app:latest
```

在企业环境里，拉取镜像的凭据一般存在 K8s 的 imagePullSecret 里，让节点能拉私有仓库的镜像，这个在后面 K8s 篇会展开。

## 标签到底是定位还是版本

镜像的 latest 只是默认标签，不代表最新或稳定。生产上推荐用加了语义版本的标签（如 v1.2.3 或带 git 短哈希），这样能精确定位、可回滚，而不是被 latest 牵着走。

## 分层让推送拉取都高效

和之前讲的一样，仓库以层为单位存镜像。推送时没有变化的层不会重复上传；拉取时本地已有的层不用再拉。自建仓库 + 分层，加上 Tag 精确定位，就是大规模发布的基础设施形态。