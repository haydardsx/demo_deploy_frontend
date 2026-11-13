# OPS 前端验收 DEMO

React / TypeScript / Vite / Nginx 构成的部署验收台，采用 MIT 许可。使用真实后端检查节点身份、提交版本、数据库读写、变量覆盖和加权路由，不内置任何个人服务器、凭据或生产域名。

## 本地运行

```sh
npm ci
npm test
npm run dev
# 或构建并启动 Nginx 容器：
docker compose up --build -d --wait
```

开发服务器默认 `http://localhost:5173`，Compose 为 `http://localhost:8080`。本地默认后端入口为 `localhost:3000`、`localhost:3001`、`localhost:3002`；只有启动真实的两个后端和加权网关后，权重测试才可能通过。可在开发时修改 `public/runtime-config.json`，或通过 Compose 环境变量配置已部署的 HTTPS 服务。

## OPS 部署

绑定本仓 Git，使用根 `Jenkinsfile`、`sourcePath=.`，选择受管构建服务器。Jenkinsfile 调用由 OPS 受管 Jenkins 安装的 `iquops` 可信库；项目步骤只包含依赖、测试、构建与 Dockerfile 输入，不持有部署凭据。普通 Jenkins 需先安装相同受管库。

创建一个前端服务槽位，容器端口 `80`，绑定前端 HTTPS 域名。三个后端地址必须是完整 HTTPS origin，不带路径、查询参数或凭据；本机调试可使用 localhost 的 HTTP。

| 运行时变量 | 用途 | 默认值 |
| --- | --- | --- |
| `DEMO_SERVER1_URL` | 第一个定向后端 HTTPS origin | `https://server1.example.com` |
| `DEMO_SERVER2_URL` | 第二个定向后端 HTTPS origin | `https://server2.example.com` |
| `DEMO_WEIGHTED_URL` | 加权后端 HTTPS origin | `https://weighted.example.com` |
| `DEMO_EXPECTED_WEIGHT1` / `DEMO_EXPECTED_WEIGHT2` | 与 OPS 两服务槽位权重一致 | `50` / `50` |
| `DEMO_SAMPLE_COUNT` | 1000–10000 次采样 | `1000` |
| `BUILD_REVISION` | 由 Docker 构建参数注入精确提交版本 | `development` |

容器启动时用 jq 安全生成 `/runtime-config.json`。这是公开配置，不允许填写任何秘密。变更运行变量后通过 OPS 重新发布，无需改写前端源码。后端 `CORS_ORIGINS` 必须包含当前前端的 HTTPS origin；TLS 由网关终止。

## 如何验收

1. 分别检查两个定向服务的 `/server`、`/health`、`/ready`。实例 ID 应不同，槽位、版本应与 OPS 配置一致。
2. 点击环境变量，检查全局值和服务覆盖；秘密只显示布尔状态。
3. 点击数据库查询与写读，后者使用临时表事务并回滚，不留持久记录。
4. 开始至少 1000 次加权采样。系统先读取两个定向实例的身份和版本，然后区分目标节点、未知身份/旧版本与失败。
5. 要求所有请求成功、无未知实例、采样完整，比例在三倍标准差或最低两个百分点误差内。零权重必须零命中。再把 OPS 与前端预期权重都改成 `80:20`，重新发布并重复验证。
6. 取消采样会显示未完成，不会把部分结果判为通过。每个请求最长 8 秒；浏览器错误须结合网络、证书、CORS 和后端状态排查。

`npm run test:runtime` 使用 jq 验证实际容器入口的 JSON 转义与错误配置拒绝。`npm test` 覆盖 URL/权重验证、失败与未知节点计数、比例判断和零权重；`npm run build` 执行 TypeScript 检查和生产构建。CI 还验证真实 Nginx 镜像、健康和运行配置。此看板验证应用路径；OPS Agent、备份恢复等系统功能按 Community 验收矩阵独立验证。
