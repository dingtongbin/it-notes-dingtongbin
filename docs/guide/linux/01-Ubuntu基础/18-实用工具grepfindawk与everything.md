# 实用工具grepfindawk与everything

前几篇零散用过 grep、find 等工具，这一篇把它们归拢成一套"文本与文件检索兵器库"：按内容搜的 grep、按条件找文件的 find、拆列统计的 awk、就地替换的 sed，以及几个高频组合套路。

## 按内容搜索：grep

```bash
grep error app.log            # 找含 error 的行
grep -i error app.log         # 忽略大小写
grep -n error app.log         # 带行号
grep -v error app.log         # 反选，不含 error 的行
grep -c error app.log         # 只输匹配行数
grep -r error /var/log/       # 递归搜整个目录
```

配合管道能筛任何命令的输出：ps aux 管道接 grep 是每天都要用的组合。

## 按条件找文件：find

find 在目录树里按名字、大小、时间、类型找文件：

```bash
find /var -name "*.log"             # 按名字找
find /opt -type f                   # 只找普通文件
find /opt -type d                   # 只找目录
find / -size +100M                  # 找大于 100M 的文件
find /tmp -mtime +7                 # 找 7 天前修改的文件
find /var -name "*.log" -delete     # 找到并删除
```

找大文件清磁盘、找特定名字的配置，find 是主力。

## 文本处理三剑客：grep、awk、sed

- grep：筛选行。
- awk：把一行拆成字段，做统计和格式化。
- sed：流式替换和编辑。

典型用法：

```bash
# awk 取 ls -lh 输出的第 5、9 列（大小和文件名）
ls -lh | awk '{print $5, $9}'

# sed 替换文本（s/旧/新/g 全局替换）
sed 's/old/new/g' file.txt         # 输出到屏幕
sed -i 's/old/new/g' file.txt      # 原地修改文件（危险，先备份）
```

awk 按空白自动拆列，$1、$2 表示第 1、2 列，处理表格化输出非常顺手。

## 下载与网络工具

```bash
curl -O https://example.com/file.zip    # 下载文件
curl -i https://example.com             # 看响应头
wget -q https://example.com/file.zip    # 更简单的下载
dig example.com                         # 查 DNS 解析
```

## 经典组合案例

场景一：找出 /var 下超过 10M 的日志文件：

```bash
find /var -name "*.log" -size +10M -exec ls -lh {} \;
```

场景二：统计访问日志里出现最多的 IP：

```bash
awk '{print $1}' access.log | sort | uniq -c | sort -rn | head
```

"awk 取列、sort 排序、uniq -c 计数、head 取前几名"是经典的数据透视链路，值得背下来。

场景三：统计当前目录所有 .go 文件总行数：

```bash
cat *.go | wc -l
```

## 小结

兵器库清单：grep 按内容筛、find 按属性找、awk 拆列统计、sed 替换编辑、curl/wget 下载、dig 查 DNS。搭配 sort、uniq -c、head 能完成日志统计。这一套玩熟，很多以前靠肉眼翻的活都能一行命令出结果。