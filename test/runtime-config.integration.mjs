import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const script=readFileSync(new URL('../docker-entrypoint.d/40-runtime-config.sh',import.meta.url),'utf8');
function run(environment) {
  const directory=mkdtempSync(join(tmpdir(),'ops-demo-config-'));
  const target=join(directory,'runtime.json');
  try {
    const result=spawnSync('sh',['-c',script.replace('/usr/share/nginx/html/runtime-config.json',JSON.stringify(target))],{env:{PATH:process.env.PATH,...environment},encoding:'utf8'});
    return {status:result.status,data:result.status===0 ? JSON.parse(readFileSync(target,'utf8')) : null};
  } finally { rmSync(directory,{recursive:true,force:true}); }
}
test('容器入口按运行变量生成配置并安全转义',()=>{
  const input='https://example.com/"\n<script>invalid</script>';
  const result=run({DEMO_SERVER1_URL:input,DEMO_EXPECTED_WEIGHT1:'80',DEMO_EXPECTED_WEIGHT2:'20',BUILD_REVISION:'commit-test'});
  assert.equal(result.status,0);
  assert.equal(result.data.server1Url,input);
  assert.equal(result.data.weight1,80);
  assert.equal(result.data.weight2,20);
  assert.equal(result.data.buildRevision,'commit-test');
});
test('容器入口拒绝无效采样和权重',()=>{
  for(const environment of [{DEMO_SAMPLE_COUNT:'10'},{DEMO_EXPECTED_WEIGHT1:'0',DEMO_EXPECTED_WEIGHT2:'0'},{DEMO_SAMPLE_COUNT:'shell text'},{DEMO_EXPECTED_WEIGHT1:'-2'}]) assert.notEqual(run(environment).status,0);
});
