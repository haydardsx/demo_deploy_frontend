import { useEffect, useRef, useState } from 'react';
import { parseConfig, type RuntimeConfig } from './config';
import { emptyStats, identity, request, sample, summary, SAMPLE_COUNT } from './probes';

function EndpointCard({ title, url, number }: {title: string; url: string; number: string}) {
  const [result, setResult] = useState<unknown>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function probe(path: string, method = 'GET') {
    setBusy(true); setError('');
    try { setResult(await request(`${url}${path}`, method)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '请求失败'); setResult(undefined); }
    finally { setBusy(false); }
  }
  return <section className="card node-card">
    <div className="card-heading"><span className="node-number">{number}</span><div><h2>{title}</h2><a href={`${url}/health`} target="_blank" rel="noreferrer">{url}</a></div></div>
    <div className="actions">
      {[['实例 /server','/server'],['存活 /health','/health'],['就绪 /ready','/ready'],['环境变量','/vartest'],['数据库查询','/pgtest']].map(([label,path]) => <button key={label} disabled={busy} onClick={() => probe(path)}>{label}</button>)}
      <button disabled={busy} onClick={() => probe('/pgtest','POST')}>数据库写读</button>
    </div>
    <div className="output" aria-live="polite">{busy ? '正在请求…' : error ? <span className="error">{error} · 请检查服务、TLS、CORS 与网络。</span> : result ? <pre>{JSON.stringify(result,null,2)}</pre> : <span className="muted">选择一项检查，查看真实服务响应。</span>}</div>
  </section>;
}

export default function App() {
  const [config, setConfig] = useState<RuntimeConfig>();
  const [error, setError] = useState('');
  const [stats, setStats] = useState(emptyStats());
  const [busy, setBusy] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const active = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    request('/runtime-config.json', 'GET', controller.signal).then(value => setConfig(parseConfig(value))).catch(cause => {
      if (!controller.signal.aborted) setError(String(cause.message || cause));
    });
    return () => { controller.abort(); active.current?.abort(); };
  }, []);
  async function run() {
    if (!config) return;
    setBusy(true); setAttempted(true); setError(''); setStats(emptyStats());
    const controller = new AbortController(); active.current = controller;
    try {
      const nodes = await Promise.all([config.server1Url,config.server2Url].map(async url => identity(await request(`${url}/server`, 'GET', controller.signal))));
      await sample(config, [nodes[0], nodes[1]], controller.signal, setStats);
    } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '采样失败'); }
    finally { setBusy(false); active.current = null; }
  }
  const result = config ? summary(stats) : undefined;
  return <main>
    <header><div className="brand"><span className="brand-mark">O</span> OPS <span className="brand-divider">/</span> DEMO</div><span className="pill">部署验收台</span></header>
    <section className="intro"><h1>部署检查</h1><p>查看两个后端的响应和网关的实际流量分布。</p><div className="revision">前端版本 <code>{config?.buildRevision || '加载中'}</code></div></section>
    {error && <div className="banner error" role="alert">{error}</div>}
    {!config && <section className="card"><h2>读取运行配置</h2><p>请配置容器的三个 DEMO 服务地址。配置校验通过后才会发起服务请求。</p></section>}
    {config && <>
      <div className="section-title"><h2>01 / 定向服务</h2><span>身份 · 版本 · 变量 · PostgreSQL</span></div>
      <div className="nodes"><EndpointCard title="服务节点一" number="01" url={config.server1Url}/><EndpointCard title="服务节点二" number="02" url={config.server2Url}/></div>
      <div className="section-title"><h2>02 / 入口流量观察</h2><span>成功、失败与未知节点分别记录</span></div>
      <section className="card sampling-card"><div className="sampling-top"><div><h2>查看实际流量分布</h2><a href={`${config.gatewayUrl}/server`} target="_blank" rel="noreferrer">{config.gatewayUrl}</a><p className="muted">{SAMPLE_COUNT.toLocaleString()} 次请求 · 每次超时 8 秒</p></div><div className="actions"><button className="primary" disabled={busy} onClick={run}>{busy ? '正在采样…' : '开始入口采样'}</button>{busy && <button onClick={() => active.current?.abort()}>停止</button>}</div></div>
        <progress max={SAMPLE_COUNT} value={stats.completed} aria-label="采样进度"/>
        <div className="metrics">{[['节点一',stats.node1],['节点二',stats.node2],['请求失败',stats.failed],['未知身份或版本',stats.unknown]].map(([label,value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
        {attempted && <div className={`result-summary ${result?.complete && (stats.failed || stats.unknown) ? 'failed' : ''}`} role="status">{busy ? `已完成 ${stats.completed} / ${SAMPLE_COUNT}` : !result?.complete ? `采样未完成（${stats.completed} / ${SAMPLE_COUNT}），仅展示已收到的响应。` : stats.failed || stats.unknown ? '采样完成：存在失败或未知节点，请检查服务状态与发布版本。' : '采样完成：所有请求成功，节点和版本符合预期。'}</div>}
        <p className="note">先从定向域名获取两个节点的身份与版本，再统计网关实际返回的节点。成功请求中，节点一占比 {((result?.node1Ratio || 0)*100).toFixed(1)}%，节点二占比 {((result?.node2Ratio || 0)*100).toFixed(1)}%。</p>
      </section>
    </>}
    <footer><span>OPS Community · MIT DEMO</span><span>公开结果只展示白名单变量，秘密仅显示是否配置。</span></footer>
  </main>;
}
