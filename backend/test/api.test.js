import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

const port = Number(process.env.TEST_PORT || 4100);
const baseUrl = `http://127.0.0.1:${port}`;
const serverPath = new URL('../src/server.js', import.meta.url).pathname;
const prisma = new PrismaClient();
let serverProcess;
let serverStartupError = '';
let token;
let secondToken;
let userId;
let secondUserId;
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
    if (serverProcess.exitCode !== null) {
      throw new Error(`CafiPay API exited before startup (code ${serverProcess.exitCode}). ${serverStartupError}`.trim());
    }
    try {
      const { response } = await request('/api/health');
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`CafiPay API did not start within 30 seconds.${serverStartupError ? ` Startup error: ${serverStartupError}` : ''}`);
}

before(async () => {
  email = `test-${randomUUID()}@example.com`;
  secondEmail = `test-${randomUUID()}@example.com`;
  serverProcess = spawn(process.execPath, [serverPath], {
    cwd: new URL('..', import.meta.url).pathname,
    env: {
      ...process.env,
      PORT: String(port),
      JWT_SECRET: process.env.JWT_SECRET || 'ci-test-secret-at-least-32-characters-long',
      FUNDING_PROVIDER_URL: '',
      FUNDING_PROVIDER_API_KEY: '',
      FUNDING_WEBHOOK_SECRET: 'ci-webhook-secret',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  serverProcess.stderr.setEncoding('utf8');
  serverProcess.stderr.on('data', chunk => { serverStartupError += chunk; });
  await waitForServer();
});

after(async () => {
  if (serverProcess && !serverProcess.killed) serverProcess.kill('SIGTERM');
  await prisma.$disconnect();
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
  userId = body.user.id;
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

test('JWT rejects tokens signed with an unapproved algorithm', async () => {\n  const forgedToken = jwt.sign({ sub: userId, email }, process.env.JWT_SECRET || 'ci-test-secret-at-least-32-characters-long', { algorithm: 'HS384', expiresIn: '1h' });\n  const { response, body } = await request('/api/auth/me', { headers: { authorization: 'Bearer ' + forgedToken } });\n  assert.equal(response.status, 401);\n  assert.match(body.error, /invalid|expired/i);\n});\n\ntest('JWT rejects tokens with an invalid payload shape', async () => {\n  const malformedToken = jwt.sign({ email }, process.env.JWT_SECRET || 'ci-test-secret-at-least-32-characters-long', { algorithm: 'HS256', expiresIn: '1h' });\n  const { response, body } = await request('/api/auth/me', { headers: { authorization: 'Bearer ' + malformedToken } });\n  assert.equal(response.status, 401);\n  assert.match(body.error, /invalid token payload/i);\n});\n\ntest('CORS allows the configured origin and omits headers for an unapproved origin', async () => {\n  const allowed = await request('/api/health', { headers: { origin: 'http://localhost:3000' } });\n  assert.equal(allowed.response.status, 200);\n  assert.equal(allowed.response.headers.get('access-control-allow-origin'), 'http://localhost:3000');\n  const blocked = await request('/api/health', { headers: { origin: 'https://untrusted.example' } });\n  assert.equal(blocked.response.status, 200);\n  assert.equal(blocked.response.headers.get('access-control-allow-origin'), null);\n});\ntest('protected wallet endpoint requires authentication', async () => {
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
  secondUserId = body.user.id;
  assert.ok(secondToken);
});

test('wallet transfer succeeds and credits the recipient', async () => {
  await prisma.wallet.update({ where: { userId: userId }, data: { balance: '5000.00' } });

  const key = `transfer-${randomUUID()}`;
  const { response, body } = await request('/api/wallet/transfer', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'Idempotency-Key': key },
    body: JSON.stringify({ recipientEmail: secondEmail, amount: 1200 }),
  });

  assert.equal(response.status, 201);
  assert.equal(body.transaction.type, 'TRANSFER');
  assert.equal(body.transaction.senderId, userId);
  assert.equal(body.transaction.recipientId, secondUserId);

  const sender = await prisma.wallet.findUnique({ where: { userId } });
  const recipient = await prisma.wallet.findUnique({ where: { userId: secondUserId } });
  assert.equal(Number(sender.balance), 3800);
  assert.equal(Number(recipient.balance), 1200);
});

test('wallet transfer is idempotent', async () => {
  const key = `transfer-${randomUUID()}`;
  const options = {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'Idempotency-Key': key },
    body: JSON.stringify({ recipientEmail: secondEmail, amount: 100 }),
  };
  const first = await request('/api/wallet/transfer', options);
  const second = await request('/api/wallet/transfer', options);
  assert.equal(first.response.status, 201);
  assert.equal(second.response.status, 201);
  assert.equal(second.body.transaction.reference, first.body.transaction.reference);

  const sender = await prisma.wallet.findUnique({ where: { userId } });
  assert.equal(Number(sender.balance), 3700);
});

test('wallet transfer rejects insufficient balance without changing balances', async () => {
  const senderBefore = await prisma.wallet.findUnique({ where: { userId } });
  const recipientBefore = await prisma.wallet.findUnique({ where: { userId: secondUserId } });
  const { response } = await request('/api/wallet/transfer', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'Idempotency-Key': `transfer-${randomUUID()}` },
    body: JSON.stringify({ recipientEmail: secondEmail, amount: 999999 }),
  });
  assert.equal(response.status, 400);
  const senderAfter = await prisma.wallet.findUnique({ where: { userId } });
  const recipientAfter = await prisma.wallet.findUnique({ where: { userId: secondUserId } });
  assert.equal(Number(senderAfter.balance), Number(senderBefore.balance));
  assert.equal(Number(recipientAfter.balance), Number(recipientBefore.balance));
});

test('wallet transfer rejects self transfer', async () => {
  const { response } = await request('/api/wallet/transfer', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'Idempotency-Key': `transfer-${randomUUID()}` },
    body: JSON.stringify({ recipientEmail: email, amount: 100 }),
  });
  assert.equal(response.status, 400);
});

test('concurrent transfers never make the sender balance negative', async () => {
  await prisma.wallet.update({ where: { userId }, data: { balance: '3000.00' } });
  await prisma.wallet.update({ where: { userId: secondUserId }, data: { balance: '0.00' } });

  const requests = Array.from({ length: 8 }, (_, index) => request('/api/wallet/transfer', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'Idempotency-Key': `concurrent-${randomUUID()}-${index}` },
    body: JSON.stringify({ recipientEmail: secondEmail, amount: 750 }),
  }));
  const results = await Promise.all(requests);
  const successful = results.filter(({ response }) => response.status === 201);
  const sender = await prisma.wallet.findUnique({ where: { userId } });
  const recipient = await prisma.wallet.findUnique({ where: { userId: secondUserId } });

  assert.ok(successful.length <= 4);
  assert.ok([201, 400, 409].includes(results[0].response.status));
  assert.ok(Number(sender.balance) >= 0);
  assert.equal(Number(sender.balance) + Number(recipient.balance), 3000);
});

test('transaction history includes transfer counterparty records', async () => {
  const { response, body } = await request('/api/wallet/transactions', {
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(response.status, 200);
  assert.ok(body.transactions.some(tx => tx.type === 'TRANSFER' && tx.recipientId === secondUserId));
});

test('authentication rate limit returns 429 after the configured threshold', async () => {\n  const attempts = Array.from({ length: 11 }, () => request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'rate-limit-' + randomUUID() + '@example.com', password: 'WrongPassword123!' }) }));\n  const results = await Promise.all(attempts);\n  const statuses = results.map(({ response }) => response.status);\n  assert.ok(statuses.includes(429), 'Expected a 429 response, received: ' + statuses.join(', '));\n});\n\ntest('concurrent QR payments can settle only once', async () => {\n  await prisma.wallet.update({ where: { userId }, data: { balance: '2000.00' } });\n  await prisma.wallet.update({ where: { userId: secondUserId }, data: { balance: '0.00' } });\n  const created = await request('/api/qr/payments', { method: 'POST', headers: { authorization: 'Bearer ' + secondToken, 'Idempotency-Key': 'qr-create-' + randomUUID() }, body: JSON.stringify({ amount: 1000, currency: 'NGN', description: 'Concurrent QR test' }) });\n  assert.equal(created.response.status, 201);\n  const reference = created.body.payment.reference;\n  const [first, second] = await Promise.all([\n    request('/api/qr/payments/' + reference + '/pay', { method: 'POST', headers: { authorization: 'Bearer ' + token, 'Idempotency-Key': 'qr-pay-' + randomUUID() }, body: JSON.stringify({}) }),\n    request('/api/qr/payments/' + reference + '/pay', { method: 'POST', headers: { authorization: 'Bearer ' + token, 'Idempotency-Key': 'qr-pay-' + randomUUID() }, body: JSON.stringify({}) }),\n  ]);\n  const statuses = [first.response.status, second.response.status].sort((a, b) => a - b);\n  assert.deepEqual(statuses, [201, 409]);\n  const payer = await prisma.wallet.findUnique({ where: { userId } });\n  const merchant = await prisma.wallet.findUnique({ where: { userId: secondUserId } });\n  const payment = await prisma.qrPayment.findUnique({ where: { reference } });\n  const transactions = await prisma.transaction.findMany({ where: { userId: { in: [userId, secondUserId] }, type: { in: ['QR_PAYMENT', 'QR_RECEIPT'] } } });\n  assert.equal(Number(payer.balance), 1000);\n  assert.equal(Number(merchant.balance), 1000);\n  assert.equal(payment.status, 'PAID');\n  assert.equal(transactions.length, 2);\n});\ntest('audit logs are available to authenticated users', async () => {
  const { response, body } = await request('/api/audit-logs', {
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(response.status, 200);
  assert.ok(Array.isArray(body.logs));
  assert.ok(body.logs.length > 0);
});

test('JWT rejects tokens signed with an unexpected algorithm', async () => {
  const secret = process.env.JWT_SECRET || 'ci-test-secret-at-least-32-characters-long';
  const forgedToken = jwt.sign({ sub: userId, email }, secret, { algorithm: 'HS384', expiresIn: '1h' });
  const { response } = await request('/api/auth/me', {
    headers: { authorization: `Bearer ${forgedToken}` },
  });
  assert.equal(response.status, 401);
});

test('JWT rejects tokens with an invalid payload shape', async () => {
  const secret = process.env.JWT_SECRET || 'ci-test-secret-at-least-32-characters-long';
  const malformedToken = jwt.sign({ email }, secret, { algorithm: 'HS256', expiresIn: '1h' });
  const { response } = await request('/api/auth/me', {
    headers: { authorization: `Bearer ${malformedToken}` },
  });
  assert.equal(response.status, 401);
});

test('CORS allows the configured origin and rejects an unconfigured origin', async () => {
  const allowed = await request('/api/health', { headers: { origin: 'http://localhost:3000' } });
  assert.equal(allowed.response.status, 200);
  assert.equal(allowed.response.headers.get('access-control-allow-origin'), 'http://localhost:3000');
  const denied = await request('/api/health', { headers: { origin: 'https://evil.example' } });
  assert.equal(denied.response.status, 200);
  assert.equal(denied.response.headers.get('access-control-allow-origin'), null);
});

test('service API rate limit returns 429 after the configured threshold', async () => {
  const responses = await Promise.all(Array.from({ length: 61 }, (_, index) => request(`/api/services/orders/SECURITY-RATE-LIMIT-${index}`, {
    headers: { authorization: `Bearer ${token}` },
  })));
  assert.ok(responses.some(({ response }) => response.status === 429));
  assert.ok(responses.some(({ response }) => response.status === 404));
});

test('concurrent QR payments charge the payer only once', async () => {
  await prisma.wallet.update({ where: { userId }, data: { balance: '2000.00' } });
  await prisma.wallet.update({ where: { userId: secondUserId }, data: { balance: '0.00' } });
  const qr = await request('/api/qr/payments', {
    method: 'POST',
    headers: { authorization: `Bearer ${secondToken}`, 'Idempotency-Key': `qr-concurrency-create-${randomUUID()}` },
    body: JSON.stringify({ amount: 1000, currency: 'NGN', description: 'Concurrent QR security test' }),
  });
  assert.equal(qr.response.status, 201);
  const reference = qr.body.payment.reference;
  const results = await Promise.all([
    request(`/api/qr/payments/${reference}/pay`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'Idempotency-Key': `qr-concurrency-pay-a-${randomUUID()}` }, body: JSON.stringify({}) }),
    request(`/api/qr/payments/${reference}/pay`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'Idempotency-Key': `qr-concurrency-pay-b-${randomUUID()}` }, body: JSON.stringify({}) }),
  ]);
  const successful = results.filter(({ response }) => response.status === 201);
  const conflicts = results.filter(({ response }) => response.status === 409);
  assert.equal(successful.length, 1);
  assert.equal(conflicts.length, 1);
  const payer = await prisma.wallet.findUnique({ where: { userId } });
  const merchant = await prisma.wallet.findUnique({ where: { userId: secondUserId } });
  const payment = await prisma.qrPayment.findUnique({ where: { reference } });
  const qrTransactions = await prisma.transaction.count({ where: { type: { in: ['QR_PAYMENT', 'QR_RECEIPT'] } } });
  assert.equal(Number(payer.balance), 1000);
  assert.equal(Number(merchant.balance), 1000);
  assert.equal(payment.status, 'PAID');
  assert.equal(qrTransactions, 2);
});