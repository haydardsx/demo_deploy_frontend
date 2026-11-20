import { test, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { parseConfig, targetUrl } from '../src/config.ts';
import { emptyStats, record, summary, sample, request, SAMPLE_COUNT } from '../src/probes.ts';
const base = {server1Url:'https://one.example.com',server2Url:'https://two.example.com',gatewayUrl:'https://gateway.example.com',buildRevision:'v1'};
const nodes = [{instanceId:'one',serviceSlot:'one',buildRevision:'v1'}, {instanceId:'two',serviceSlot:'two',buildRevision:'v1'}];
afterEach(() => { mock.restoreAll(); mock.timers.reset(); });

test('只允许 HTTPS 或本机 HTTP，不允许凭据和路径', () => {
  assert.equal(targetUrl('http://localhost:3000'),'http://localhost:3000');
  const credentials = new URL('https://example.com');
  credentials.username = 'sample';
  for(const input of ['http://public.example.com',credentials.href,'https://example.com/route','https://example.com/?token=x','javascript:alert(1)']) assert.throws(()=>targetUrl(input));
});
test('运行配置只需要三个服务地址，版本由镜像提供', () => {
  assert.deepEqual(parseConfig(base),base);
  assert.equal(parseConfig({...base,buildRevision:undefined}).buildRevision,'unknown');
  for (const key of ['server1Url','server2Url','gatewayUrl']) assert.throws(()=>parseConfig({...base,[key]:undefined}));
});
test('失败和未知身份不会被误计为节点二', () => {
  let stats=record(emptyStats(),null,nodes,true);
  stats=record(stats,{instanceId:'unknown'},nodes);
  stats=record(stats,{...nodes[0],buildRevision:'old'},nodes);
  stats=record(stats,nodes[1],nodes);
  assert.deepEqual(stats,{node1:0,node2:1,failed:1,unknown:2,completed:4});
});
test('只统计成功响应的实际分布，不判定流量比例是否符合业务目标', () => {
  assert.deepEqual(summary({node1:700,node2:300,failed:0,unknown:0,completed:1000}),{complete:true,node1Ratio:0.7,node2Ratio:0.3});
  assert.deepEqual(summary({node1:1,node2:3,failed:2,unknown:4,completed:10}),{complete:false,node1Ratio:0.25,node2Ratio:0.75});
  assert.deepEqual(summary(emptyStats()),{complete:false,node1Ratio:0,node2Ratio:0});
});
test('请求只发送到网关，固定采样次数并记录网关真实返回的节点', async () => {
  let calls=0;
  mock.method(globalThis,'fetch',async url => {
    assert.equal(url,`${base.gatewayUrl}/server`);
    calls++;
    return new Response(JSON.stringify(nodes[calls % 4 === 0 ? 0 : 1]),{status:200});
  });
  const stats=await sample(parseConfig(base),nodes,new AbortController().signal,()=>{});
  assert.equal(calls,SAMPLE_COUNT);
  assert.deepEqual(stats,{node1:250,node2:750,failed:0,unknown:0,completed:1000});
});
test('已取消的采样不发送请求，并标记为未完成', async () => {
  const fetchMock=mock.method(globalThis,'fetch');
  const controller=new AbortController();controller.abort();
  const stats=await sample(parseConfig(base),nodes,controller.signal,()=>{});
  assert.equal(fetchMock.mock.callCount(),0);
  assert.equal(summary(stats).complete,false);
});
test('拒绝重复实例标识，避免无法判别的统计', async () => {
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
