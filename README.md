# Deployment demo frontend

[简体中文](README.zh-CN.md)

An Ops deployment demo built with React. It checks two backend instances and measures how a gateway distributes requests between them. [Backend demo](https://github.com/haydardsx/demo_deploy_backend)

## Run locally

Start two deployment demo backends and a gateway that routes to both. Set each backend’s `CORS_ORIGINS` to include the dashboard origin.

```sh
docker compose up --build -d --wait
```

Open `http://localhost:8080`. Compose expects the two backends on local ports 3000 and 3001 and the gateway on 3002. To use other origins, set `DEMO_SERVER1_URL`, `DEMO_SERVER2_URL` and `DEMO_GATEWAY_URL` before starting. These addresses are public browser configuration. Use HTTPS for remote services or HTTP for loopback.

## Develop and test

Use Node.js 22.18 or later.

```sh
npm ci
npm test
npm run test:runtime
npm run build
npm run dev
```

Open `http://localhost:5173`. The development server reads the local endpoints from `public/runtime-config.json`.

[MIT license](LICENSE)
