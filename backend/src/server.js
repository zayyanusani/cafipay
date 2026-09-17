import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();
const app = express();
const PORT = Number(process.env.PORT || 4000);
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be set and contain at least 32 characters');
}

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',').map(s => s.trim()) || true }));
app.use(express.json({ limit: '1mb' }));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });

const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254).transform(v => v.toLowerCase()),
  password: z.string().min(8).max(72)
});

const loginSchema = z.object({
  email: z.string().trim().email().transform(v => v.toLowerCase()),
  password: z.string().min(1).max(72)
});

function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '1h' });
}

function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing bearer token' });
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET);
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'CafiPay API' }));

app.post('/api/auth/register', authLimiter, async (req, res, next) => {
  try {
    const data = registerSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const passwordHash = await bcrypt.hash(data.password, 12);
    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        passwordHash,
        wallet: { create: { balance: 0, currency: 'NGN' } }
      },
      select: { id: true, name: true, email: true, createdAt: true }
    });

    const token = signToken(user);
    res.status(201).json({ message: 'Registration successful', token, user });
  } catch (err) { next(err); }
});

app.post('/api/auth/login', authLimiter, async (req, res, next) => {
  try {
    const data = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: data.email } });
    if (!user || !(await bcrypt.compare(data.password, user.passwordHash))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = signToken(user);
    res.json({ message: 'Login successful', token, user: { id: user.id, name: user.name, email: user.email } });
  } catch (err) { next(err); }
});

app.get('/api/auth/me', auth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, name: true, email: true, createdAt: true, wallet: { select: { balance: true, currency: true } } }
    });
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

app.post('/api/auth/logout', auth, (_req, res) => {
  // JWTs are stateless. For immediate revocation, add a server-side token denylist/session table.
  res.json({ message: 'Logout acknowledged; discard the token on the client' });
});

app.use((err, _req, res, _next) => {
  if (err instanceof z.ZodError) return res.status(400).json({ error: 'Validation failed', details: err.issues });
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const server = app.listen(PORT, () => console.log(`CafiPay API listening on port ${PORT}`));

process.on('SIGINT', async () => { server.close(); await prisma.$disconnect(); process.exit(0); });
process.on('SIGTERM', async () => { server.close(); await prisma.$disconnect(); process.exit(0); });
