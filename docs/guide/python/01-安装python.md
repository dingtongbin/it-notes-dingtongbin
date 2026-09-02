---
title: 安装python
---

# 01-安装python

## 安装python 3.12

### windows

1、 打开官网 [Python Releases for Windows | Python.org](https://www.python.org/downloads/windows/)，找到Python 3.14.x 的 Windows installer（64-bit）并下载。

2、安装时必须勾选底部的"Add python.exe to PATH"，然后点击install Now。如果不勾选的话，安装完之后在cmd命令行输入"python"会"提示不是内部或外部命令"。

3、如果忘记勾选，不用重新装，重新运行安装程序，选Modify，勾选Add to PATH就可以了，或者把python安装目录加进系统环境变量path。

### 验证安装

```bash
python --version
#会输出 Python 3.14.x
```

## python的两种运行方法

python有两种运行方法，交互式（像命令行一样输一行返回一行）和脚本式（用解释器启动整个文件）。

### 交互式运行解释器（REPL）

终端直接输入python（不用带任何文件名）就可以启动python控制台。

```bash
C:\Users\30978>python
Python 3.14.3 (main, Feb  5 2026, 13:34:54)  [MINGW GCC UCRT 15.2.0 64 bit (AMD64)] on win32
Type "help", "copyright", "credits" or "license" for more information.
>>> 1+1
2
>>> exit()

C:\Users\30978>
```

">>>"是提示符，意思是等待你输入代码，你输入一行，它立即执行一行并打印代码的返回值，适合快速验证某个函数的行为，做简单计算和查文档。

输入"exit()"或者同时按住"ctrl +z"再回车，就可以退出。

需要注意的是只有在python控制台里面的表达式才会自动打印结果（输入1+1输出2），脚本文件里则不会，这是新手很容易忽略的问题。

### 脚本文件

在用python写项目的时候都是用的脚本式，新建一个“hello.py”（注意扩展名是py），内容：

```python
print("hello world")
```

打开终端然后cd到对应的目录，再运行：

```bash
python hello.py
# 输出：hello world
```

也可以用绝对目录运行，不依赖当前目录

```bash
D:\>python d:code\hello.py
hello world

D:\>
```

### 选择代码编辑器

​	完全零计算机基础推荐pychram，有基础推荐vscode

vscode官网：[[Visual Studio Code - The open source AI code editor | Your home for multi-agent development](https://code.visualstudio.com/)]([Visual Studio Code - The open source AI code editor | Your home for multi-agent development](https://code.visualstudio.com/))

pychram官网：[[PyCharm，您需要的唯一 Python IDE](https://www.jetbrains.com/zh-cn/pycharm/)]([PyCharm，您需要的唯一 Python IDE](https://www.jetbrains.com/zh-cn/pycharm/))

### python代码执行原理

python是解释型语言，运行脚本文件，会先把源代码（.py文件）翻译成字节码（bytecode），这是中间产物，存在内存里或者缓存成"pycache"下的pyc文件。然后python虚拟机（PVM）逐条解释执行代码。

对比java：java是线编译成.class字节码在jvm上跑，比python多了编译成字节码的步骤，加上java项目过大后编译偏慢，所以运行体验会比python差很多。