# 认识Ubuntu与发行版

这一篇解决的问题是：Ubuntu 到底是什么、它和"Linux"是什么关系、哪些版本号值得记住，以及我刚装好的系统里有哪些常用工具可以先试用。读完你会对 Ubuntu 所处的生态有个清晰定位，并掌握查看系统版本的正确姿势。

## 发行版到底是什么

Linux 本身只是一个内核（kernel），负责管理硬件、进程和内存。单纯一个内核是没有办法日常使用的，必须配上用户态的命令行工具、软件包管理器、桌面环境，这些打包在一起，再加上一个发布节奏和维护团队，才构成一个可用的"发行版"。

Ubuntu 就是这样一个发行版，它基于 Debian，因此继承了 Debian 成熟的软件包生态，默认软件包管理工具是 dpkg 和 apt。Ubuntu 之外的常见发行版还有 CentOS、Fedora、Arch、openSUSE 等，它们对比见下表：

| 发行版 | 包管理 | 适合场景 |
|---|---|---|
| Debian | apt / dpkg | 稳定、社区广，服务器和桌面皆可 |
| Ubuntu | apt / dpkg | 由 Debian 派生，易用、教程多，个人桌面和云服务器都常见 |
| CentOS / RHEL | yum / dnf | 企业服务器主流 |
| Fedora | dnf | 迭代快、紧跟内核新特性 |
| Arch | pacman | 滚动更新、高度可定制 |

## LTS 与非 LTS

Ubuntu 采用年月版本号，比如 22.04、24.04，前面的年份是发布时间。其中带".04"的偶数年小版本通常是长期支持版本（LTS），官方提供 5 年甚至更久的安全维护，适合服务器和想省心的人；而 22.10、23.04 这类是短期版本，只维护 9 个月，适合追新的桌面用户。

```bash
# 查看系统版本信息
lsb_release -a

# 或者
cat /etc/os-release
```

这两条命令是排查环境时最先该敲的：lsb_release 输出发行版名和版本号，/etc/os-release 是多数发行版都会提供的原始信息，字段包括系统名、版本、代号等。

## 内核版本怎么查

内核版本和发行版版本不是一回事，同样一个 Ubuntu 24.04，内核可能升级过多次。查内核用 uname：

```bash
uname -r
uname -a
```

uname -r 只输出内核版本号，uname -a 一次性给出架构、主机名、内核发布日期等完整信息。

## 我装的 Ubuntu 里有哪些值得先试的现成命令

顺手验证一下系统有没有装齐常见工具，这一组命令各取其责：

```bash
# 查看当前登录用户
whoami

# 查看主机名
hostname

# 查看架构（arm64 / amd64）
dpkg --print-architecture

# 确认 apt 是否可用
apt --version
```

这几条不需要安装任何东西，装完系统就能用，适合当作"环境是否正常"的快速自检。

## 小结

Ubuntu 是 Debian 派生出的、以 apt 为包管理器的发行版，LTS 版本适合大多数场景。记住用 lsb_release、cat /etc/os-release 查发行版，用 uname -r 查内核，用 whoami 和 dpkg --print-architecture 确认最基本的系统信息，就足够你在一台陌生的 Ubuntu 上快速定位"这是哪、有没有装对"。
