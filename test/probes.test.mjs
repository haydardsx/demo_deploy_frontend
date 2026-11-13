import { test, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { parseConfig, targetUrl } from '../src/config.ts';
import { emptyStats, record, verdict, sample, request } from '../src/probes.ts';
const base = {server1Url:'https://one.example.com',server2Url:'https://two.example.com',weightedUrl:'https://random.example.com',weight1:50,weight2:50,sampleCount:1000,buildRevision:'v1'};
const nodes = [{instanceId:'one',serviceSlot:'one',buildRevision:'v1'}, {instanceId:'two',serviceSlot:'two',buildRevision:'v1'}];
afterEach(() => { mock.restoreAll(); mock.timers.reset(); });

test('只允许 HTTPS 或本机 HTTP，不允许凭据和路径', () => {
  assert.equal(targetUrl('http://localhost:3000'),'http://localhost:3000');
  for(const input of ['http://public.example.com','https://user:pass@example.com','https://example.com/route','https://example.com/?token=x','javascript:alert(1)']) assert.throws(()=>targetUrl(input));
});
test('拒绝不足采样、双零权重、非整数与负权重', () => {
  for(const config of [{sampleCount:10},{weight1:0,weight2:0},{weight1:-1},{weight1:0.5},{sampleCount:10001}]) assert.throws(()=>parseConfig({...base,...config}));
  assert.equal(parseConfig({...base,weight1:0,weight2:100}).weight1,0);
});
test('失败和未知身份不会被误计为节点二', () => {
  let stats=record(emptyStats(),null,nodes,true);
  stats=record(stats,{instanceId:'unknown'},nodes);
  stats=record(stats,{...nodes[0],buildRevision:'old'},nodes);
  stats=record(stats,nodes[1],nodes);
  assert.deepEqual(stats,{node1:0,node2:1,failed:1,unknown:2,completed:4});
});
test('要求采样完整且无失败、无未知，再判断目标权重', () => {
  const config=parseConfig(base);
  const balanced={node1:500,node2:500,failed:0,unknown:0,completed:1000};
  assert.equal(verdict(balanced,config).passed,true);
  assert.equal(verdict({...balanced,completed:999},config).passed,false);
  assert.equal(verdict({...balanced,node2:499,failed:1},config).passed,false);
  assert.equal(verdict({...balanced,node1:700,node2:300},config).passed,false);
  assert.equal(verdict({...balanced,node1:800,node2:200},parseConfig({...base,weight1:80,weight2:20})).passed,true);
});
test('零权重必须没有任何命中', () => {
  const config=parseConfig({...base,weight1:0,weight2:100});
  assert.equal(verdict({node1:0,node2:1000,failed:0,unknown:0,completed:1000},config).passed,true);
  assert.equal(verdict({node1:1,node2:999,failed:0,unknown:0,completed:1000},config).passed,false);
});
test('采样逐次计数并形成 1000 次响应统计', async () => {
  let calls=0;
  mock.method(globalThis,'fetch',async () => new Response(JSON.stringify(nodes[++calls % 2]),{status:200}));
  const stats=await sample(parseConfig(base),nodes,new AbortController().signal,()=>{});
  assert.equal(calls,1000);
  assert.equal(verdict(stats,parseConfig(base)).passed,true);
});
test('已取消的采样不发送请求，也不能通过验收', async () => {
  const fetchMock=mock.method(globalThis,'fetch');
  const controller=new AbortController();controller.abort();
  const stats=await sample(parseConfig(base),nodes,controller.signal,()=>{});
  assert.equal(fetchMock.mock.callCount(),0);
  assert.equal(verdict(stats,parseConfig(base)).passed,false);
});
test('拒绝重复实例标识，避免无法判别的假通过', async () => {
  await assert.rejects(sample(parseConfig(base),[nodes[0],nodes[0]],new AbortController().signal,()=>{}),/相同/);
});
test('请求在八秒超时后取消', async () => {
  mock.timers.enable({apis:['setTimeout']});
  mock.method(globalThis,'fetch',(_url,options) => new Promise((_resolve,reject) => {
    options.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')));
  }));
  const pending=assert.rejects(request('https://one.example.com/server'),/Aborted/);
  mock.timers.tick(8000);
  await pending;
});
