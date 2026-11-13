FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html tsconfig.json vite.config.ts ./
COPY src ./src
COPY public ./public
RUN npm run build

FROM nginx:stable-alpine
RUN apk add --no-cache jq
ARG BUILD_REVISION=development
ENV BUILD_REVISION=$BUILD_REVISION
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --chmod=755 docker-entrypoint.d/40-runtime-config.sh /docker-entrypoint.d/40-runtime-config.sh
EXPOSE 80
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s CMD wget -q -O /dev/null http://127.0.0.1/health || exit 1
