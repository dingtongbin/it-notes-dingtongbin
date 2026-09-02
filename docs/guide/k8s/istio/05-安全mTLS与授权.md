# 安全：mTLS 与授权策略

服务网格的安全核心是服务间默认加密和按身份授权：mTLS 保证传输加密和身份验证，AuthorizationPolicy 管控谁能访问谁。这一篇讲这块的模型和配置方式。

## 为什么要服务间加密

集群内服务按约定可能默认就信任彼此。但真要安全，服务之间应该互相验证身份、加密传输，防止中间人。让每个服务都自己配 TLS 太麻烦，网格用 sidecar 代劳。

## mTLS：双向 TLS

普通 TLS 客户端验证服务器的证书；mTLS（双向 TLS）双方都出示证书、互相验证、密钥加密：

```
服务A ──➤ envoy(A) ══mutual TLS══ envoy(B) ──➤ 服务B
            出示证书   互相验证+加密    出示证书
```

对业务来说完全透明：进出的流量被 sidecar 用 mTLS 保护，业务代码不知道加密这回事。

## 命名空间的 mTLS 模式

istio 有 mTLS 相关配置，最简单的做法是让网格默认启用 mTLS。可配置的模式：

| 模式 | 行为 |
|---|---|
| PERMISSIVE | 尽量用 mTLS，允许明文（迁移过渡） |
| STRICT | 强制 mTLS，明文请求被拒 |

生产最终应切到 STRICT，保证网格内传输都是加密且双向验证的。迁移时先 PERMISSIVE 再切 STRICT，避免一上来拒绝掉大量流量。

## 身份验证：请求必须有证书

启用 mTLS 后，网格内服务身份由证书决定，而非 IP。这对防中间人、标识调用来源都更可靠，因为 IP 可变、证书可背书。

## AuthorizationPolicy：按身份授权

有了身份，就能配授权规则：允许谁访问谁。基于命名空间、服务账号或请求属性做条件：

```yaml
apiVersion: security.istio.io/v1
kind: AuthorizationPolicy
metadata:
  name: api-policy
  namespace: demo
spec:
  selector:
    matchLabels:
      app: api
  rules:
    - from:
        - source:
            principals: ["cluster.local/ns/demo/sa/web"]
      to:
        - operation:
            methods: ["GET"]
```

意思是只允许来自 web 服务账号的 GET 请求访问 api。没有命中允许规则的请求被拒绝。这层授权在应用层的 JWT 认证之外，又为网格内通信加了一道访问控制。

## 常见坑

1. 直接切 STRICT：明文流量没切过来，很多场景会直接断，先 PERMISSIVE 过渡。
2. 授权规则没配 deny：默认如果没有允许规则服务可能是全拒绝或全允许，要看 action 语义。
3. principal 写错：服务账号名对不上授权失效。

## 小结

网格安全 = mTLS（传输加密 + 双向身份验证）+ AuthorizationPolicy（按身份授权）。业务零侵入即可获得加密传输和细粒度访问控制，这是服务网格相对裸 K8s 的又一大价值。