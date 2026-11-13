import type { RuntimeConfig } from './config';
export interface Identity { instanceId: string; serviceSlot: string; buildRevision: string }
export interface Stats { node1: number; node2: number; failed: number; unknown: number; completed: number }
export const emptyStats = (): Stats => ({ node1: 0, node2: 0, failed: 0, unknown: 0, completed: 0 });

export async function request(url: string, method = 'GET', signal?: AbortSignal): Promise<unknown> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timeout = setTimeout(abort, 8000);
  try {
    const response = await fetch(url, { method, cache: 'no-store', credentials: 'omit', signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally { clearTimeout(timeout); signal?.removeEventListener('abort', abort); }
}

export function identity(value: unknown): Identity {
  if (!value || typeof value !== 'object') throw new Error('实例响应无效');
  const data = value as Record<string, unknown>;
  if (['instanceId','serviceSlot','buildRevision'].some(k => typeof data[k] !== 'string' || !data[k])) {
    throw new Error('实例响应缺少身份、槽位或版本');
  }
  return data as unknown as Identity;
}

export function record(stats: Stats, value: unknown, nodes: [Identity, Identity], failed = false): Stats {
  const next = { ...stats, completed: stats.completed + 1 };
  if (failed) next.failed++;
  else {
    try {
      const actual = identity(value);
      const same = (node: Identity) => node.instanceId === actual.instanceId && node.serviceSlot === actual.serviceSlot && node.buildRevision === actual.buildRevision;
      if (same(nodes[0])) next.node1++;
      else if (same(nodes[1])) next.node2++;
      else next.unknown++;
    } catch { next.unknown++; }
  }
  return next;
}

export function verdict(stats: Stats, config: RuntimeConfig) {
  const expected = config.weight1 / (config.weight1 + config.weight2);
  const successes = stats.node1 + stats.node2;
  const actual = successes ? stats.node1 / successes : 0;
  // 零权重要求零命中；其他比例允许三倍标准差，至少两个百分点。
  const tolerance = expected === 0 || expected === 1 ? 0 : Math.max(0.02, 3 * Math.sqrt(expected * (1 - expected) / config.sampleCount));
  const complete = stats.completed === config.sampleCount;
  return { expected, actual, tolerance, complete,
    passed: complete && stats.failed === 0 && stats.unknown === 0 && Math.abs(actual - expected) <= tolerance };
}

export async function sample(config: RuntimeConfig, nodes: [Identity, Identity], signal: AbortSignal, update: (stats: Stats) => void) {
  if (nodes[0].instanceId === nodes[1].instanceId) throw new Error('两个定向服务的 INSTANCE_ID 相同，无法验证分流');
  let stats = emptyStats();
  for (let index = 0; index < config.sampleCount; index++) {
    if (signal.aborted) break;
    try { stats = record(stats, await request(`${config.weightedUrl}/server`, 'GET', signal), nodes); }
    catch { if (signal.aborted) break; stats = record(stats, null, nodes, true); }
    if (stats.completed % 10 === 0 || stats.completed === config.sampleCount) update({ ...stats });
  }
  update({ ...stats });
  return stats;
}
