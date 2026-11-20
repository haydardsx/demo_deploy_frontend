# 部署演示前端

[English](README.md)

Ops 部署演示前端使用 React 查看两个后端实例的状态，并测量网关在两个实例间的实际请求分布。[后端演示](https://github.com/haydardsx/demo_deploy_backend)

## 本地运行

先启动两个演示后端和向它们转发请求的网关。在每个后端的 `CORS_ORIGINS` 中加入前端页面的来源。

```sh
docker compose up --build -d --wait
```

打开 `http://localhost:8080`。Compose 默认连接本机端口 3000 和 3001 上的两个后端，以及端口 3002 上的网关。使用其他地址时，在启动前设置 `DEMO_SERVER1_URL`、`DEMO_SERVER2_URL` 和 `DEMO_GATEWAY_URL`。这些地址对浏览器公开。远端服务使用 HTTPS，本机回环地址可使用 HTTP。

## 开发与测试

使用 Node.js 22.18 或更高版本。

```sh
npm ci
npm test
npm run test:runtime
npm run build
npm run dev
```

打开 `http://localhost:5173`。开发服务器从 `public/runtime-config.json` 读取本地服务地址。

[MIT 许可证](LICENSE)
