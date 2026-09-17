import { PrismaClient } from '@prisma/client';
import crypto from 'node:crypto';

const prisma = new PrismaClient();

const IDEMPOTENT_PATHS = new Set([
  '/api/wallet/transfer',
  '/api/qr/payments',
  '/api/services/airtime',
  '/api/services/data',
  '/api/bills/pay',
]);

function requestHash(req) {
  return crypto.createHash('sha256').update(JSON.stringify(req.body ?? {})).digest('hex');
}

export async function idempotency(req, res, next) {
  if (req.method !== 'POST' || !IDEMPOTENT_PATHS.has(req.path)) return next();

  const key = req.get('Idempotency-Key');
  if (!key || key.length < 16 || key.length > 128) {
    return res.status(400).json({ error: 'Idempotency-Key header is required (16-128 characters)' });
  }
  if (!req.user?.id) return res.status(401).json({ error: 'Authentication required' });

  const hash = requestHash(req);
  try {
    const existing = await prisma.idempotencyKey.findUnique({ where: { userId_key: { userId: req.user.id, key } } });
    if (existing) {
      if (existing.requestHash !== hash) return res.status(409).json({ error: 'Idempotency-Key was already used with a different request' });
      if (existing.status === 'COMPLETED') {
        res.status(existing.responseStatus || 200);
        return res.json(existing.responseBody || {});
      }
      return res.status(409).json({ error: 'A request with this Idempotency-Key is already processing' });
    }

    const created = await prisma.idempotencyKey.create({ data: { userId: req.user.id, key, requestHash: hash } });
    const originalJson = res.json.bind(res);
    res.json = async (body) => {
      try {
        await prisma.idempotencyKey.update({
          where: { id: created.id },
          data: { status: 'COMPLETED', responseStatus: res.statusCode, responseBody: body },
        });
      } catch (error) {
        console.error('Idempotency persistence error:', error);
      }
      return originalJson(body);
    };
    next();
  } catch (error) {
    if (error.code === 'P2002') return res.status(409).json({ error: 'A request with this Idempotency-Key is already processing' });
    next(error);
  }
}
