import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const port = Number(process.env.TEST_PORT || 4100);
const baseUrl = `http://127.0.0.1:${port}`;
let serverProcess;
let token;
let secondToken;
let email;
let secondEmail;

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

async function waitForServer() {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      const { response } = await request('/api/health');
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('CafiPay API did not start within 30 seconds');
}

before(async () => {
  email = `test-${randomUUID()}@example.com`;
  secondEmail = `test-${randomUUID()}@example.com`;
  serverProcess = spawn(process.execPath, ['src/server.js'], {
    cwd: new URL('..', import.meta.url).pathname,
    env: {
      ...process.env,
      PORT: String(port),
      JWT_SECRET: process.env.JWT_SECRET || 'ci-test-secret-at-least-32-characters-long',
      FUNDING_PROVIDER_URL: '',
      FUNDING_PROVIDER_API_KEY: '',
      FUNDING_WEBHOOK_SECRET: 'ci-webhook-secret',
    },
    stdio: 'ignore',
  });
  await waitForServer();
});

after(() => {
  if (serverProcess && !serverProcess.killed) serverProcess.kill('SIGTERM');
});

test('health endpoint is available', async () => {
  const { response, body } = await request('/api/health');
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
});

test('registration creates a user and wallet', async () => {
  const { response, body } = await request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name: 'CafiPay Test User', email, password: 'StrongPass123!' }),
  });
  assert.equal(response.status, 201);
  assert.ok(body.token);
  assert.equal(body.user.email, email);
  token = body.token;
});

test('duplicate registration is rejected', async () => {
  const { response } = await request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name: 'Duplicate', email, password: 'StrongPass123!' }),
  });
  assert.equal(response.status, 409);
});

test('login returns a JWT', async () => {
  const { response, body } = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password: 'StrongPass123!' }),
  });
  assert.equal(response.status, 200);
  assert.ok(body.token);
  token = body.token;
});

test('protected wallet endpoint requires authentication', async () => {
  const { response } = await request('/api/wallet');
  assert.equal(response.status, 401);
});

test('wallet starts with zero NGN balance', async () => {
  const { response, body } = await request('/api/wallet', {
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(response.status, 200);
  assert.equal(body.wallet.currency, 'NGN');
  assert.equal(Number(body.wallet.balance), 0);
});

test('QR payment creation is idempotent', async () => {
  const key = `test-${randomUUID()}-idempotency`;
  const options = {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'Idempotency-Key': key },
    body: JSON.stringify({ amount: 1000, currency: 'NGN', description: 'CI QR test' }),
  };
  const first = await request('/api/qr/payments', options);
  const second = await request('/api/qr/payments', options);
  assert.equal(first.response.status, 201);
  assert.equal(second.response.status, 201);
  assert.equal(second.body.payment.reference, first.body.payment.reference);
});

test('QR payment rejects unauthenticated payment attempts', async () => {
  const { response } = await request('/api/qr/payments/CAFQR-000000000000000000000000/pay', {
    method: 'POST',
    headers: { 'Idempotency-Key': `test-${randomUUID()}-idempotency` },
    body: JSON.stringify({}),
  });
  assert.equal(response.status, 401);
});

test('funding initialization fails safely when provider is not configured', async () => {
  const { response, body } = await request('/api/wallet/funding/initiate', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'Idempotency-Key': `test-${randomUUID()}-idempotency` },
    body: JSON.stringify({ amount: 5000, currency: 'NGN' }),
  });
  assert.equal(response.status, 503);
  assert.match(body.error, /not configured/i);
});

test('second user can register and authenticate', async () => {
  const { response, body } = await request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name: 'Second Test User', email: secondEmail, password: 'StrongPass456!' }),
  });
  assert.equal(response.status, 201);
  secondToken = body.token;
  assert.ok(secondToken);
});

test('audit logs are available to authenticated users', async () => {
  const { response, body } = await request('/api/audit-logs', {
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(response.status, 200);
  assert.ok(Array.isArray(body.logs));
  assert.ok(body.logs.length > 0);
});
