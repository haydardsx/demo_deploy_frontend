export interface RuntimeConfig {
  server1Url: string;
  server2Url: string;
  weightedUrl: string;
  weight1: number;
  weight2: number;
  sampleCount: number;
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
  const weight1 = Number(input.weight1);
  const weight2 = Number(input.weight2);
  const sampleCount = Number(input.sampleCount);
  if (![weight1, weight2].every(v => Number.isInteger(v) && v >= 0 && v <= 10000) || weight1 + weight2 === 0) {
    throw new Error('权重须为 0–10000 的整数，且不能同时为零');
  }
  if (!Number.isInteger(sampleCount) || sampleCount < 1000 || sampleCount > 10000) {
    throw new Error('采样数须为 1000–10000 的整数');
  }
  return {
    server1Url: targetUrl(input.server1Url), server2Url: targetUrl(input.server2Url),
    weightedUrl: targetUrl(input.weightedUrl), weight1, weight2, sampleCount,
    buildRevision: typeof input.buildRevision === 'string' ? input.buildRevision : 'unknown',
  };
}
