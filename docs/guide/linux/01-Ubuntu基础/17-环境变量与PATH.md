# 环境变量与PATH

环境变量让程序和 Shell 共享配置，PATH 决定命令去哪找。这一篇讲怎么临时和永久设置环境变量、PATH 怎么生效，以及为什么有时候命令找不到了。

## 环境变量是什么

环境变量是一堆"名字=值"的键值对，当前 Shell 和它启动的子程序都能读到：

```bash
echo $HOME      # 当前用户主目录
echo $USER      # 当前用户
echo $PATH      # 命令搜索路径
echo $SHELL     # 默认 Shell
```

## 临时设置变量

只在当前会话有效，关终端即失效：

```bash
MY_VAR=hello         # 赋值，子进程读不到
export MY_VAR=hello  # export 后子进程才能读到
echo $MY_VAR
```

变量要传给脚本等子进程，必须 export；只在 Shell 内部用则不必。

## PATH 是什么

PATH 是一串用冒号分隔的目录列表。敲一个命令名，Shell 按顺序在这些目录里找可执行文件，找到就执行，全找不到才报 command not found。

## 命令找不到的排查

敲命令报 command not found，通常是三种情况：

1. 软件没装 → apt install 装上。
2. 装了但目录不在 PATH → 把目录加进 PATH。
3. 命令在当前目录 → 用 ./命令名（当前目录默认不在 PATH）。

检查命令位置：

```bash
which 命令名     # 找到返回路径，没找到无输出
whereis 命令名   # 更广地搜
```

## 临时改 PATH

```bash
export PATH=/usr/local/bin:$PATH    # 前面加目录
PATH=$PATH:/opt/mybin               # 后面追加
```

临时改的当前会话有效，开新终端就没了。

## 永久设置：写进配置文件

用户级环境变量写在 ~/.bashrc（Bash）末尾：

```bash
vim ~/.bashrc
# 加入
export MYCONFIG=/data/config
export PATH=$PATH:/opt/mybin
```

改完立即生效（不用重开终端）：

```bash
source ~/.bashrc
```

系统级的写在 /etc/environment（所有用户生效）。日常自定义用 ~/.bashrc 就够。

## 登录 Shell 与交互 Shell 的区别

- ~/.bash_profile：登录时读（如 SSH 刚登录）。
- ~/.bashrc：每次打开交互终端都读。

常见坑：把变量写进 .bash_profile，但脚本或非登录 Shell 走的是 .bashrc，于是"明明配了怎么没生效"。想省心就统一写 ~/.bashrc。

## 小结

环境变量用 export 定义子进程才读得到。PATH 决定命令查找顺序，找不到先用 which 定位，再决定是装软件还是加路径。永久定制写 ~/.bashrc 加 source 生效，系统级写 /etc/environment。会配 PATH 和变量，"命令找不到""程序拿不到配置"这类怪问题就通了。