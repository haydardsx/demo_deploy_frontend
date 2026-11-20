export interface RuntimeConfig {
  server1Url: string;
  server2Url: string;
  gatewayUrl: string;
  buildRevision: string;
}

export function targetUrl(value: unknown): string {
  if (typeof value !== 'string') throw new Error('服务地址缺失');
  const url = new URL(value);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) ||
      url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('服务地址须为 HTTPS origin，本机调试允许 HTTP，不能包含凭据、路径或查询参数');
  }
  return url.origin;
}

export function parseConfig(value: unknown): RuntimeConfig {
  if (!value || typeof value !== 'object') throw new Error('运行配置缺失');
  const input = value as Record<string, unknown>;
  return {
    server1Url: targetUrl(input.server1Url), server2Url: targetUrl(input.server2Url),
    gatewayUrl: targetUrl(input.gatewayUrl),
    buildRevision: typeof input.buildRevision === 'string' ? input.buildRevision : 'unknown',
  };
}
