import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomBytes, randomUUID } from 'node:crypto';
import QRCode from 'qrcode';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import serviceRoutes from './routes/services.js';
import billRoutes from './routes/bills.js';
import auditRoutes from './routes/audit.js';
import { idempotency } from './middleware/idempotency.js';
import { auditRequests } from './middleware/audit.js';

const prisma = new PrismaClient();
const app = express();
const PORT = Number(process.env.PORT || 4000);
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET || JWT_SECRET.length < 32) throw new Error('JWT_SECRET must be set and contain at least 32 characters');

app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',').map(s => s.trim()) || true }));
app.use(express.json({ limit: '1mb' }));
app.use(auditRequests);

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });
const qrCreateLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });
const qrPayLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });

const registerSchema = z.object({ name: z.string().trim().min(2).max(100), email: z.string().trim().email().max(254).transform(v => v.toLowerCase()), password: z.string().min(8).max(72) });
const loginSchema = z.object({ email: z.string().trim().email().transform(v => v.toLowerCase()), password: z.string().min(1).max(72) });
const qrCreateSchema = z.object({ amount: z.coerce.number().positive().finite().max(100000000), currency: z.string().trim().length(3).default('NGN'), description: z.string().trim().max(200).optional(), expiresInMinutes: z.coerce.number().int().min(1).max(1440).default(30) });
const qrReferenceSchema = z.object({ reference: z.string().regex(/^CAFQR-[A-Z0-9]{24}$/) });

function signToken(user) { return jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '1h' }); }
function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing bearer token' });
  try { const payload = jwt.verify(header.slice(7), JWT_SECRET); req.user = { id: payload.sub, email: payload.email }; next(); }
  catch { return res.status(401).json({ error: 'Invalid or expired token' }); }
}
function qrReference() { return `CAFQR-${randomBytes(12).toString('hex').toUpperCase()}`; }
function toMoney(value) { return Number(value).toFixed(2); }

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'CafiPay API' }));

app.post('/api/auth/register', authLimiter, async (req, res, next) => {
  try {
    const data = registerSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) return res.status(409).json({ error: 'Email already registered' });
    const passwordHash = await bcrypt.hash(data.password, 12);
    const user = await prisma.user.create({ data: { name: data.name, email: data.email, passwordHash, wallet: { create: { balance: 0, currency: 'NGN' } } }, select: { id: true, name: true, email: true, createdAt: true } });
    const token = signToken(user);
    res.status(201).json({ message: 'Registration successful', token, user });
  } catch (err) { next(err); }
});

app.post('/api/auth/login', authLimiter, async (req, res, next) => {
  try {
    const data = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: data.email } });
    if (!user || !(await bcrypt.compare(data.password, user.passwordHash))) return res.status(401).json({ error: 'Invalid email or password' });
    const token = signToken(user);
    res.json({ message: 'Login successful', token, user: { id: user.id, name: user.name, email: user.email } });
  } catch (err) { next(err); }
});

app.get('/api/auth/me', auth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { id: true, name: true, email: true, createdAt: true, wallet: { select: { balance: true, currency: true } } } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  } catch (err) { next(err); }
});

app.get('/api/wallet', auth, async (req, res, next) => {
  try {
    const wallet = await prisma.wallet.findUnique({ where: { userId: req.user.id } });
    if (!wallet) return res.status(404).json({ error: 'Wallet not found' });
    res.json({ wallet });
  } catch (err) { next(err); }
});

app.get('/api/transactions', auth, async (req, res, next) => {
  try {
    const transactions = await prisma.transaction.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: 'desc' }, take: 50 });
    res.json({ transactions });
  } catch (err) { next(err); }
});

app.post('/api/qr/payments', auth, idempotency, qrCreateLimiter, async (req, res, next) => {
  try {
    const data = qrCreateSchema.parse(req.body);
    const expiresAt = new Date(Date.now() + data.expiresInMinutes * 60 * 1000);
    const reference = qrReference();
    const payment = await prisma.qrPayment.create({ data: { reference, merchantId: req.user.id, amount: toMoney(data.amount), currency: data.currency.toUpperCase(), description: data.description, expiresAt }, select: { reference: true, amount: true, currency: true, description: true, status: true, expiresAt: true, createdAt: true } });
    const payload = JSON.stringify({ type: 'CAFIPAY_QR', reference: payment.reference });
    const qrDataUrl = await QRCode.toDataURL(payload, { errorCorrectionLevel: 'M', margin: 2, width: 320 });
    res.status(201).json({ message: 'QR payment created', payment, qr: { payload, dataUrl: qrDataUrl } });
  } catch (err) { next(err); }
});

app.get('/api/qr/payments/:reference', async (req, res, next) => {
  try {
    const { reference } = qrReferenceSchema.parse(req.params);
    const payment = await prisma.qrPayment.findUnique({ where: { reference }, select: { reference: true, amount: true, currency: true, description: true, status: true, expiresAt: true, createdAt: true, merchant: { select: { id: true, name: true, email: true } } } });
    if (!payment) return res.status(404).json({ error: 'QR payment not found' });
    if (payment.status === 'PENDING' && payment.expiresAt <= new Date()) { await prisma.qrPayment.update({ where: { reference }, data: { status: 'EXPIRED' } }); return res.status(410).json({ error: 'QR payment has expired' }); }
    res.json({ payment });
  } catch (err) { next(err); }
});

app.post('/api/qr/payments/:reference/pay', auth, idempotency, qrPayLimiter, async (req, res, next) => {
  try {
    const { reference } = qrReferenceSchema.parse(req.params);
    const result = await prisma.$transaction(async (tx) => {
      const payment = await tx.qrPayment.findUnique({ where: { reference } });
      if (!payment) { const e = new Error('QR payment not found'); e.statusCode = 404; throw e; }
      if (payment.merchantId === req.user.id) { const e = new Error('Merchant cannot pay its own QR payment'); e.statusCode = 400; throw e; }
      if (payment.status !== 'PENDING') { const e = new Error(`QR payment is ${payment.status.toLowerCase()}`); e.statusCode = 409; throw e; }
      if (payment.expiresAt <= new Date()) { await tx.qrPayment.update({ where: { id: payment.id }, data: { status: 'EXPIRED' } }); const e = new Error('QR payment has expired'); e.statusCode = 410; throw e; }
      const payerWallet = await tx.wallet.findUnique({ where: { userId: req.user.id } });
      const merchantWallet = await tx.wallet.findUnique({ where: { userId: payment.merchantId } });
      if (!payerWallet || !merchantWallet) { const e = new Error('Wallet not found'); e.statusCode = 404; throw e; }
      if (payerWallet.currency !== payment.currency || merchantWallet.currency !== payment.currency) { const e = new Error('Currency mismatch'); e.statusCode = 400; throw e; }
      if (payerWallet.balance.lessThan(payment.amount)) { const e = new Error('Insufficient wallet balance'); e.statusCode = 400; throw e; }
      const payerUpdated = await tx.wallet.updateMany({ where: { id: payerWallet.id, balance: { gte: payment.amount } }, data: { balance: { decrement: payment.amount } } });
      if (payerUpdated.count !== 1) { const e = new Error('Insufficient wallet balance'); e.statusCode = 400; throw e; }
      await tx.wallet.update({ where: { id: merchantWallet.id }, data: { balance: { increment: payment.amount } } });
      const baseReference = `CAF-${randomUUID().replaceAll('-', '').slice(0, 24).toUpperCase()}`;
      await tx.transaction.createMany({ data: [{ reference: baseReference, userId: req.user.id, type: 'QR_PAYMENT', amount: payment.amount, currency: payment.currency, status: 'SUCCESS', description: payment.description || `QR payment to ${payment.merchantId}` }, { reference: `${baseReference}-M`, userId: payment.merchantId, type: 'QR_RECEIPT', amount: payment.amount, currency: payment.currency, status: 'SUCCESS', description: payment.description || `QR payment received from ${req.user.email}` }] });
      const paid = await tx.qrPayment.update({ where: { id: payment.id }, data: { status: 'PAID', paidAt: new Date() }, select: { reference: true, amount: true, currency: true, description: true, status: true, expiresAt: true, paidAt: true } });
      return { payment: paid, transactionReference: baseReference };
    }, { isolationLevel: 'Serializable' });
    res.json({ message: 'QR payment successful', ...result });
  } catch (err) {
    if (err?.statusCode) return res.status(err.statusCode).json({ error: err.message });
    if (err?.code === 'P2034') return res.status(409).json({ error: 'Payment conflict; please retry' });
    next(err);
  }
});

app.use('/api/services', auth, idempotency, serviceRoutes);
app.use('/api/bills', auth, idempotency, billRoutes);
app.use('/api/audit-logs', auth, auditRoutes);

app.post('/api/auth/logout', auth, (_req, res) => res.json({ message: 'Logout acknowledged; discard the token on the client' }));
app.use((err, _req, res, _next) => { if (err instanceof z.ZodError) return res.status(400).json({ error: 'Validation failed', details: err.issues }); console.error(err); res.status(500).json({ error: 'Internal server error' }); });
const server = app.listen(PORT, () => console.log(`CafiPay API listening on port ${PORT}`));
process.on('SIGINT', async () => { server.close(); await prisma.$disconnect(); process.exit(0); });
process.on('SIGTERM', async () => { server.close(); await prisma.$disconnect(); process.exit(0); });
