# 压缩归档tar与zip

传输或长期保存一批文件时，需要把它们打包压缩。这一篇讲 Ubuntu 最常用的两个工具：tar（打包加压缩）和 zip（跨平台压缩包），都是运维日常的铁杆搭档。

## tar 的基本用法

tar 本是打包工具，把一堆文件合成一个文件，加压缩参数顺带压缩。常用组合：

```bash
tar -czvf backup.tar.gz /home/user/data   # 打包 + gzip 压缩
tar -xzvf backup.tar.gz                   # 解压
tar -tzvf backup.tar.gz                   # 只看内容不解压
```

参数拆解：
- c：创建打包文件
- x：解包
- t：列出内容
- z：用 gzip 压缩（.tar.gz / .tgz）
- j：用 bzip2 压缩（.tar.bz2）
- v：显示过程（可省略）
- f：后面跟文件名（必须放最后或紧贴文件名）

## 解压到指定目录

```bash
tar -xzvf backup.tar.gz -C /tmp/restore/
```

-C 指定解压目标目录，避免文件散落当前目录。

## 排除不需要的文件

备份时排除日志、缓存能显著缩小包体：

```bash
tar -czvf app.tar.gz --exclude='*.log' --exclude='cache' /var/www/app
```

## zip 与 unzip

zip 常用于跨平台场景。Ubuntu 默认可能没装：

```bash
sudo apt install zip unzip
```

用法：

```bash
zip -r archive.zip /path/to/dir    # 打包目录，-r 递归
zip files.zip a.txt b.txt          # 打包多个文件
unzip archive.zip                  # 解压到当前目录
unzip archive.zip -d /tmp/out/     # 解压到指定目录
unzip -l archive.zip               # 只看内容列表
```

## 对比压缩前后体积

```bash
ls -lh backup.tar backup.tar.gz
```

gzip 对文本类（配置、日志、代码）压缩率很高，对已压缩的图片视频几乎无效。

## 常见坑

1. 压缩格式与参数不匹配：.tar.gz 用 z，.tar.bz2 用 j，看扩展名选。
2. 解压不指定目录：文件摊一地，养成解压到新目录的习惯。
3. 文件名含空格：给路径加引号。

## 小结

tar 是 Linux 打包压缩的默认工具：c 打包、x 解包、t 查看，配 z（gzip）或 j（bzip2），加 -C 指定解压目录、--exclude 排除。zip/unzip 处理跨平台压缩包。会打包会解压，备份与传输都有了骨架。