// Starts the app on a random port and checks the key behaviours of each scenario.
import assert from 'node:assert/strict';
import { app } from '../src/app.js';

const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
const call = async (path, opts = {}) => {
  const r = await fetch(base + path, opts);
  const text = await r.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  return { status: r.status, headers: r.headers, body };
};
const post = (path, json, headers = {}) =>
  call(path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(json) });

const results = [];
const check = async (name, fn) => {
  try { await fn(); results.push(['PASS', name]); } catch (e) { results.push(['FAIL', name + ' -> ' + e.message]); }
};

await check('index lists endpoints', async () => { const r = await call('/?format=json'); assert.ok(r.body.count > 30); });
await check('non-blocking ok', async () => assert.equal((await call('/concurrency/non-blocking?ms=50')).status, 200));
await check('worker thread computes fib', async () => assert.equal((await call('/concurrency/cpu-worker?n=20')).body.result, 6765));
await check('child process has different pid', async () => { const r = (await call('/concurrency/child-process')).body; assert.notEqual(r.parentPid, r.childPid); });
await check('operational error -> 404 json', async () => { const r = await call('/errors/operational'); assert.equal(r.status, 404); assert.equal(r.body.error.code, 'ORDER_NOT_FOUND'); });
await check('validation -> 422', async () => assert.equal((await call('/errors/validation?qty=abc')).status, 422));
await check('async throw -> 409', async () => assert.equal((await call('/errors/async-throw')).status, 409));
await check('bug -> generic 500 (no leak)', async () => { const r = await call('/errors/bug'); assert.equal(r.status, 500); assert.equal(r.body.error.message, 'Something went wrong'); });
await check('upstream timeout -> 504', async () => assert.equal((await call('/errors/slow-upstream?timeout=200')).status, 504));
await check('overload sheds load', async () => { const rs = await Promise.all(Array.from({ length: 5 }, () => call('/errors/overload'))); assert.ok(rs.some((r) => r.status === 503)); });
await check('streamed generate sends 5MB', async () => { const r = await fetch(base + '/files/generate?mb=5'); assert.equal((await r.arrayBuffer()).byteLength, 5 * 1024 * 1024); });
await check('upload streams to disk', async () => { const r = await call('/files/upload', { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: Buffer.alloc(1024 * 1024) }); assert.equal(r.status, 201); assert.equal(r.body.bytes, 1048576); });
await check('path traversal blocked', async () => assert.equal((await call('/files/download/..%2Fpackage.json')).status, 400));
await check('N+1 uses far more queries than batched', async () => { const a = (await call('/perf/n-plus-one')).body, b = (await call('/perf/batched')).body; assert.ok(a.queries > 40 && b.queries === 2); });
await check('parallel faster than sequential', async () => { const s = (await call('/perf/sequential')).body, p = (await call('/perf/parallel')).body; assert.ok(p.ms < s.ms); });
await check('cache miss then hit; coalescing', async () => {
  await Promise.all(Array.from({ length: 10 }, () => call('/cache/product/1')));
  assert.equal((await call('/cache/product/1')).body.cache, 'HIT');
  assert.equal((await call('/cache/stats')).body.dbReads, 1);
  await call('/cache/product/1', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: '{"price":99}' });
  assert.equal((await call('/cache/product/1')).body.cache, 'MISS');
});
await check('pool queues requests', async () => { const r = (await call('/db/pool-demo?requests=6')).body; assert.ok(r.ok.some((x) => x.waitedMs > 300)); });
await check('auth flow, roles, tenant isolation', async () => {
  assert.equal((await post('/auth/register', { email: 'a@acme.com', password: 'password123', org: 'acme' })).status, 201);
  assert.equal((await post('/auth/register', { email: 'g@globex.com', password: 'password123', org: 'globex' })).status, 201);
  assert.equal((await post('/auth/login', { email: 'a@acme.com', password: 'wrong' })).status, 401);
  const { accessToken, refreshToken } = (await post('/auth/login', { email: 'a@acme.com', password: 'password123' })).body;
  const auth = { authorization: `Bearer ${accessToken}` };
  assert.equal((await call('/auth/me')).status, 401);
  assert.equal((await call('/auth/me', { headers: auth })).status, 200);
  assert.equal((await call('/auth/admin-only', { headers: auth })).status, 403);
  assert.equal((await call('/auth/invoices/1', { headers: auth })).status, 200);
  assert.equal((await call('/auth/invoices/3', { headers: auth })).status, 404);
  assert.equal((await post('/auth/refresh', { refreshToken })).status, 200);
  assert.equal((await post('/auth/refresh', { refreshToken })).status, 401); // rotated: old token dead
});
await check('token bucket -> 429', async () => { let last; for (let i = 0; i < 7; i++) last = await call('/rate-limit/token-bucket'); assert.equal(last.status, 429); assert.ok(last.headers.get('retry-after')); });
await check('job retries then completes; idempotency key dedupes', async () => {
  const j = await post('/jobs/email', { to: 'x@y.com', failTimes: 2, idempotencyKey: 'k1' });
  assert.equal(j.status, 202);
  assert.equal((await post('/jobs/email', { to: 'x@y.com', idempotencyKey: 'k1' })).body.duplicate, true);
  let job; for (let i = 0; i < 40; i++) { job = (await call(`/jobs/${j.body.jobId}`)).body; if (job.status === 'completed') break; await new Promise((r) => setTimeout(r, 200)); }
  assert.equal(job.status, 'completed'); assert.equal(job.attempts, 3);
});
await check('retry endpoint reports attempts', async () => { const r = await call('/reliability/retry?failRate=0'); assert.equal(r.status, 200); assert.equal(r.body.attempts.length, 1); });
await check('circuit breaker opens', async () => { for (let i = 0; i < 3; i++) await call('/reliability/breaker?fail=true'); assert.equal((await call('/reliability/breaker-state')).body.state, 'OPEN'); });
await check('metrics + health', async () => { assert.match((await call('/metrics')).body, /http_requests_total/); assert.equal((await call('/health/ready')).status, 200); });
await check('leak endpoint grows, bounded stays capped', async () => { for (let i = 0; i < 25; i++) { await call('/leak/leaky'); await call('/leak/bounded'); } const s = (await call('/leak/stats')).body; assert.equal(s.boundedItems, 20); assert.ok(s.leakedItems >= 25); await call('/leak/reset', { method: 'DELETE' }); });
await check('unknown route -> 404 json', async () => assert.equal((await call('/nope')).status, 404));

server.close();
for (const [s, n] of results) console.log(`${s === 'PASS' ? '✅' : '❌'} ${n}`);
const failed = results.filter(([s]) => s === 'FAIL').length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
