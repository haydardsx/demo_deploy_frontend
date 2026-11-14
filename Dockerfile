FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html tsconfig.json vite.config.ts ./
COPY src ./src
COPY public ./public
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ARG BUILD_REVISION=development
ENV BUILD_REVISION=$BUILD_REVISION
COPY --from=build /app/dist ./dist
COPY server.mjs ./server.mjs
EXPOSE 80
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.mjs"]
