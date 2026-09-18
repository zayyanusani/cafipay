import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID, createHmac } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

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
      PAYSTACK_SECRET_KEY: 'ci-paystack-secret',
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

test('funding webhook rejects missing or invalid signatures', async () => {
  const payload = JSON.stringify({ reference: 'CAFDEP-MISSING', status: 'SUCCESS', amount: 5000, currency: 'NGN' });
  const missing = await request('/api/wallet/funding/webhook', {
    method: 'POST',
    body: payload,
  });
  assert.equal(missing.response.status, 401);

  const invalid = await request('/api/wallet/funding/webhook', {
    method: 'POST',
    headers: { 'x-paystack-signature': 'invalid-signature' },
    body: payload,
  });
  assert.equal(invalid.response.status, 401);
});

test('funding webhook credits wallet once and is idempotent', async () => {
  const fundingReference = `CAFDEP-${randomUUID().replaceAll('-', '').slice(0, 24).toUpperCase()}`;
  await prisma.fundingOrder.create({
    data: {
      reference: fundingReference,
      userId,
      amount: '5000.00',
      currency: 'NGN',
      provider: 'paystack',
      status: 'PENDING',
    },
  });

  const payload = JSON.stringify({
    reference: fundingReference,
    providerReference: `paystack-${randomUUID()}`,
    status: 'SUCCESS',
    amount: 5000,
    currency: 'NGN',
  });
  const signature = createHmac('sha512', 'ci-paystack-secret').update(payload).digest('hex');
  const options = {
    method: 'POST',
    headers: { 'x-paystack-signature': signature },
    body: payload,
  };

  const before = await prisma.wallet.findUnique({ where: { userId } });
  const first = await request('/api/wallet/funding/webhook', options);
  assert.equal(first.response.status, 200);
  assert.equal(first.body.order.status, 'SUCCESS');

  const afterFirst = await prisma.wallet.findUnique({ where: { userId } });
  assert.equal(Number(afterFirst.balance) - Number(before.balance), 5000);

  const second = await request('/api/wallet/funding/webhook', options);
  assert.equal(second.response.status, 200);
  assert.equal(second.body.alreadyProcessed, true);

  const afterSecond = await prisma.wallet.findUnique({ where: { userId } });
  assert.equal(Number(afterSecond.balance), Number(afterFirst.balance));

  const transactions = await prisma.transaction.findMany({
    where: { userId, type: 'WALLET_FUNDING' },
  });
  assert.equal(transactions.filter(tx => tx.description === `Wallet funding ${fundingReference}`).length, 1);
});

test('funding webhook rejects amount mismatch without crediting wallet', async () => {
  const fundingReference = `CAFDEP-${randomUUID().replaceAll('-', '').slice(0, 24).toUpperCase()}`;
  await prisma.fundingOrder.create({
    data: {
      reference: fundingReference,
      userId,
      amount: '2500.00',
      currency: 'NGN',
      provider: 'paystack',
      status: 'PENDING',
    },
  });

  const payload = JSON.stringify({
    reference: fundingReference,
    providerReference: `paystack-${randomUUID()}`,
    status: 'SUCCESS',
    amount: 2500.01,
    currency: 'NGN',
  });
  const signature = createHmac('sha512', 'ci-paystack-secret').update(payload).digest('hex');
  const before = await prisma.wallet.findUnique({ where: { userId } });

  const { response } = await request('/api/wallet/funding/webhook', {
    method: 'POST',
    headers: { 'x-paystack-signature': signature },
    body: payload,
  });
  assert.equal(response.status, 400);

  const after = await prisma.wallet.findUnique({ where: { userId } });
  assert.equal(Number(after.balance), Number(before.balance));

  const order = await prisma.fundingOrder.findUnique({ where: { reference: fundingReference } });
  assert.equal(order.status, 'PENDING');
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

test('transaction lookup is protected by participant ownership', async () => {
  const history = await request('/api/wallet/transactions', {
    headers: { authorization: `Bearer ${token}` },
  });
  const transfer = history.body.transactions.find(tx => tx.type === 'TRANSFER' && tx.senderId === userId && tx.recipientId === secondUserId);
  assert.ok(transfer?.reference);

  const senderLookup = await request(`/api/wallet/transactions/${transfer.reference}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(senderLookup.response.status, 200);
  assert.equal(senderLookup.body.transaction.reference, transfer.reference);

  const recipientLookup = await request(`/api/wallet/transactions/${transfer.reference}`, {
    headers: { authorization: `Bearer ${secondToken}` },
  });
  assert.equal(recipientLookup.response.status, 200);
  assert.equal(recipientLookup.body.transaction.reference, transfer.reference);

  const unrelatedEmail = `unrelated-${randomUUID()}@example.com`;
  const unrelated = await request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name: 'Unrelated Test User', email: unrelatedEmail, password: 'StrongPass789!' }),
  });
  assert.equal(unrelated.response.status, 201);

  const unrelatedLookup = await request(`/api/wallet/transactions/${transfer.reference}`, {
    headers: { authorization: `Bearer ${unrelated.body.token}` },
  });
  assert.equal(unrelatedLookup.response.status, 404);

  const unauthenticated = await request(`/api/wallet/transactions/${transfer.reference}`);
  assert.equal(unauthenticated.response.status, 401);
});

test('transaction lookup validates references and returns 404 for missing references', async () => {
  const invalidShort = await request('/api/wallet/transactions/short');
  assert.equal(invalidShort.response.status, 401);

  const invalidShortAuthenticated = await request('/api/wallet/transactions/short', {
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(invalidShortAuthenticated.response.status, 400);

  const missing = await request(`/api/wallet/transactions/MISSING-${randomUUID()}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(missing.response.status, 404);
});

test('transaction history includes transfer counterparty records', async () => {
  const { response, body } = await request('/api/wallet/transactions', {
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(response.status, 200);
  assert.ok(body.transactions.some(tx => tx.type === 'TRANSFER' && tx.recipientId === secondUserId));
});

test('audit logs are available to authenticated users', async () => {
  const { response, body } = await request('/api/audit-logs', {
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(response.status, 200);
  assert.ok(Array.isArray(body.logs));
  assert.ok(body.logs.length > 0);
});
