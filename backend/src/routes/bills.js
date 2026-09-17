import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { payBill } from '../bill-provider.js';

const router = Router();
const prisma = new PrismaClient();
const billLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });

const schema = z.object({
  category: z.enum(['ELECTRICITY', 'TV', 'INTERNET']),
  provider: z.string().trim().min(2).max(100),
  customerId: z.string().trim().min(3).max(100),
  amount: z.coerce.number().positive().finite().max(100000000),
  currency: z.string().trim().length(3).default('NGN'),
  metadata: z.record(z.string(), z.any()).optional(),
});

function reference() { return `CAF-BILL-${randomUUID().replaceAll('-', '').slice(0, 24).toUpperCase()}`; }
function txReference() { return `CAF-${randomUUID().replaceAll('-', '').slice(0, 24).toUpperCase()}`; }

router.post('/pay', billLimiter, async (req, res, next) => {
  let order;
  try {
    const data = schema.parse(req.body);
    const currency = data.currency.toUpperCase();

    order = await prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({ where: { userId: req.user.id } });
      if (!wallet) { const e = new Error('Wallet not found'); e.statusCode = 404; throw e; }
      if (wallet.currency !== currency) { const e = new Error('Currency mismatch'); e.statusCode = 400; throw e; }
      if (wallet.balance.lessThan(data.amount)) { const e = new Error('Insufficient wallet balance'); e.statusCode = 400; throw e; }

      const orderReference = reference();
      const updated = await tx.wallet.updateMany({
        where: { id: wallet.id, balance: { gte: data.amount } },
        data: { balance: { decrement: data.amount } },
      });
      if (updated.count !== 1) { const e = new Error('Insufficient wallet balance'); e.statusCode = 400; throw e; }

      return tx.billOrder.create({
        data: {
          reference: orderReference,
          userId: req.user.id,
          category: data.category,
          provider: data.provider,
          customerId: data.customerId,
          amount: data.amount.toFixed(2),
          currency,
          metadata: data.metadata,
          status: 'PROCESSING',
        },
      });
    }, { isolationLevel: 'Serializable' });

    let providerResult;
    try {
      providerResult = await payBill(data);
    } catch (error) {
      if (error.code === 'PROVIDER_TIMEOUT') {
        return res.status(202).json({ message: 'Bill payment is processing; provider confirmation is pending', order: { reference: order.reference, status: 'PROCESSING' } });
      }

      await prisma.$transaction(async (tx) => {
        await tx.wallet.update({ where: { userId: req.user.id }, data: { balance: { increment: order.amount } } });
        await tx.billOrder.update({ where: { id: order.id }, data: { status: 'FAILED' } });
        await tx.transaction.create({ data: { reference: txReference(), userId: req.user.id, type: 'BILL_REFUND', amount: order.amount, currency: order.currency, status: 'SUCCESS', description: `Refund for failed bill ${order.reference}` } });
      });

      const status = error.code === 'PROVIDER_NOT_CONFIGURED' ? 503 : 502;
      return res.status(status).json({ error: error.message, order: { reference: order.reference, status: 'FAILED' } });
    }

    await prisma.$transaction(async (tx) => {
      await tx.billOrder.update({ where: { id: order.id }, data: { status: 'SUCCESS', providerReference: providerResult.providerReference } });
      await tx.transaction.create({ data: { reference: txReference(), userId: req.user.id, type: 'BILL_PAYMENT', amount: order.amount, currency: order.currency, status: 'SUCCESS', description: `${order.category} bill payment: ${order.provider}` } });
    });

    res.status(201).json({ message: 'Bill payment successful', order: { reference: order.reference, category: order.category, provider: order.provider, customerId: order.customerId, amount: order.amount, currency: order.currency, status: 'SUCCESS', providerReference: providerResult.providerReference } });
  } catch (err) {
    if (err?.statusCode) return res.status(err.statusCode).json({ error: err.message });
    next(err);
  }
});

router.get('/orders/:reference', async (req, res, next) => {
  try {
    const order = await prisma.billOrder.findFirst({ where: { reference: req.params.reference, userId: req.user.id } });
    if (!order) return res.status(404).json({ error: 'Bill order not found' });
    res.json({ order });
  } catch (err) { next(err); }
});

export default router;
