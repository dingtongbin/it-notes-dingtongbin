# 包管理apt与dpkg

Ubuntu 装软件、卸载软件、升级系统，几乎全靠包管理器。这一篇把 apt 和它背后的 dpkg 讲清楚：装、删、查、升级这四件套，以及软件源的概念。

## apt 与 dpkg 的关系

apt 和 dpkg 是两层工具：

- dpkg 是底层工具，直接操作以 .deb 结尾的软件包，不做依赖解析。
- apt 是上层封装，基于 dpkg，自动解析和安装依赖，日常操作都用它。

```bash
dpkg --version   # 底层工具
apt --version    # 上层工具
```

日常用 apt 就够了，只有在安装本地 .deb 包或排查包的安装状态时才会亲自用到 dpkg。

## 更新与升级

安装新软件之前，先更新软件源索引，让 apt 知道软件源里最新有哪些版本：

```bash
sudo apt update       # 更新软件源索引（不会升级软件）
sudo apt upgrade      # 升级所有已装软件中可升级的部分
```

执行顺序很关键：先 update 刷新可用包清单，再 upgrade 才真正升级。这是服务器上默认要背熟的第一组命令。

## 安装软件

```bash
sudo apt install nginx          # 安装 nginx，自动带上依赖
sudo apt install git curl tree  # 一次安装多个
sudo apt install -y nginx       # -y 免去确认步骤
```

apt 会自动解析依赖并一起装完。装完后可执行文件一般落在 /usr/bin 下，直接用命令名调用即可。

## 卸载软件

```bash
sudo apt remove nginx      # 移除软件，保留配置文件
sudo apt purge nginx       # 移除软件及配置文件，更彻底
sudo apt autoremove        # 清理变成孤儿依赖的包
sudo apt clean             # 清理下载缓存
```

如需彻底清除某个软件不想留残留配置，用 purge。autoremove 定期跑一次，能清掉积累的无用依赖。

## 搜索与查看已装软件

```bash
apt search nginx          # 在软件源里按名字/描述搜索
apt show nginx            # 查看某个包的详细信息
apt list --installed      # 列出所有已安装软件
dpkg -l | grep nginx      # 精确查看某软件是否安装及其状态
```

想知道"这个软件装了没有"用 dpkg -l 过滤；想知道源里有没有某软件用 apt search。

## 安装本地 .deb 包

偶尔拿到离线 .deb 文件，用 dpkg 安装：

```bash
sudo dpkg -i package.deb
sudo apt -f install     # 若提示缺依赖，运行它自动补齐
```

手动安装 .deb 后若报告缺少依赖，跑 apt -f install 让系统解析依赖补上，是常见的收尾步骤。

## 软件源是什么

软件源（repository）是 apt 下载软件包的来源地址，配置写在 /etc/apt/sources.list 以及 /etc/apt/sources.list.d/ 目录下。默认官方源在境外可能较慢，国内服务器常替换成镜像源加速，这属于软件源专题的内容。不建议手动乱改源文件格式，改错会导致 apt 直接报错。

## 小结

apt 是 Ubuntu 装软件的主通道：update 刷新源、upgrade 升级、install 安装、remove/purge 卸载、search 搜索。dpkg 是底层，主要用于装 .deb 和查包状态。软件源是软件的来源，换镜像加速是接下来的话题。把 apt 四件套用熟，在 Ubuntu 上装什么都不再是问题。