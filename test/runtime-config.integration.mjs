import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';

async function freePort() {
  const listener = createServer().listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  return port;
}

async function withConfig(server1Url, check) {
  const port = await freePort();
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: new URL('..', import.meta.url),
    env: {
      PATH: process.env.PATH,
      PORT: String(port),
      DEMO_SERVER1_URL: server1Url,
      DEMO_SERVER2_URL: 'https://two.example.com',
      DEMO_GATEWAY_URL: 'https://gateway.example.com',
      BUILD_REVISION: 'commit-test',
      PRIVATE_VALUE: randomBytes(16).toString('hex'),
    },
    stdio: 'ignore',
  });
  try {
    const origin = `http://127.0.0.1:${port}`;
    let ready = false;
    for (let attempt = 0; attempt < 100 && !ready; attempt++) {
      try { ready = (await fetch(`${origin}/health`)).ok; } catch {}
      if (!ready) await setTimeout(20);
    }
    assert.equal(ready, true, '运行入口未就绪');
    const response = await fetch(`${origin}/runtime-config.json`);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    await check(response);
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
  }
}

test('运行入口仅返回公开的服务地址和版本', { timeout: 5000 }, async () => {
  const server1Url = 'https://one.example.com';
  await withConfig(server1Url, async response => {
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      server1Url,
      server2Url: 'https://two.example.com',
      gatewayUrl: 'https://gateway.example.com',
      buildRevision: 'commit-test',
    });
  });
});

test('配置地址误含凭据时，错误响应隐藏原始值', { timeout: 5000 }, async () => {
  const origin = new URL('https://one.example.com');
  origin.password = randomBytes(24).toString('hex');
  await withConfig(origin.href, async response => {
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: 'RUNTIME_CONFIG_INVALID' });
  });
});
