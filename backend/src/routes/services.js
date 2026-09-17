import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { purchaseService } from '../service-provider.js';

const prisma = new PrismaClient();
const router = Router();

const purchaseSchema = z.object({
  network: z.string().trim().min(2).max(30),
  phone: z.string().trim().regex(/^\+?[0-9]{10,15}$/),
  amount: z.coerce.number().positive().finite().max(1000000),
  dataPlan: z.string().trim().max(100).optional()
});

function reference() {
  return `CAF-${randomUUID().replaceAll('-', '').slice(0, 24).toUpperCase()}`;
}

async function createPurchase(req, res, type, next) {
  try {
    const data = purchaseSchema.parse(req.body);
    const orderReference = reference();

    const order = await prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({ where: { userId: req.user.id } });
      if (!wallet) {
        const error = new Error('Wallet not found');
        error.statusCode = 404;
        throw error;
      }
      if (wallet.currency !== 'NGN') {
        const error = new Error('Only NGN service purchases are supported');
        error.statusCode = 400;
        throw error;
      }
      if (wallet.balance.lt(data.amount)) {
        const error = new Error('Insufficient wallet balance');
        error.statusCode = 400;
        throw error;
      }

      const updated = await tx.wallet.updateMany({
        where: { id: wallet.id, balance: { gte: data.amount } },
        data: { balance: { decrement: data.amount } }
      });
      if (updated.count !== 1) {
        const error = new Error('Insufficient wallet balance');
        error.statusCode = 400;
        throw error;
      }

      return tx.serviceOrder.create({
        data: {
          reference: orderReference,
          userId: req.user.id,
          type,
          network: data.network.toUpperCase(),
          phone: data.phone,
          amount: data.amount.toFixed(2),
          currency: 'NGN',
          dataPlan: type === 'DATA' ? data.dataPlan : null,
          status: 'PROCESSING'
        }
      });
    }, { isolationLevel: 'Serializable' });

    try {
      const provider = await purchaseService({
        type,
        network: order.network,
        phone: order.phone,
        amount: Number(order.amount),
        dataPlan: order.dataPlan
      });

      if (!provider.configured) {
        await prisma.$transaction([
          prisma.wallet.update({ where: { userId: req.user.id }, data: { balance: { increment: order.amount } } }),
          prisma.serviceOrder.update({ where: { id: order.id }, data: { status: 'FAILED' } }),
          prisma.transaction.create({
            data: {
              reference: `${order.reference}-R`, userId: req.user.id, type: `${type}_REFUND`,
              amount: order.amount, currency: order.currency, status: 'SUCCESS',
              description: `${type} purchase refunded because provider integration is not configured`
            }
          })
        ]);
        return res.status(503).json({ error: 'Service provider is not configured', reference: order.reference });
      }

      const updatedOrder = await prisma.$transaction([
        prisma.serviceOrder.update({
          where: { id: order.id },
          data: { status: 'SUCCESS', providerReference: provider.providerReference }
        }),
        prisma.transaction.create({
          data: {
            reference: order.reference, userId: req.user.id, type: `${type}_PURCHASE`,
            amount: order.amount, currency: order.currency, status: 'SUCCESS',
            description: `${type} purchase for ${order.phone}`
          }
        })
      ]);

      return res.status(201).json({ message: `${type} purchase successful`, order: updatedOrder[0] });
    } catch (providerError) {
      // A timeout/network failure may leave the provider result unknown. Keep the order PROCESSING
      // so a reconciliation job can safely check the provider before refunding the customer.
      if (providerError?.name === 'AbortError' || !providerError?.providerStatus) {
        return res.status(202).json({ message: `${type} purchase is processing`, reference: order.reference });
      }

      await prisma.$transaction([
        prisma.wallet.update({ where: { userId: req.user.id }, data: { balance: { increment: order.amount } } }),
        prisma.serviceOrder.update({ where: { id: order.id }, data: { status: 'FAILED' } }),
        prisma.transaction.create({
          data: {
            reference: `${order.reference}-R`, userId: req.user.id, type: `${type}_REFUND`,
            amount: order.amount, currency: order.currency, status: 'SUCCESS',
            description: `${type} purchase refund after provider rejection`
          }
        })
      ]);
      return res.status(502).json({ error: 'Service provider rejected the purchase', reference: order.reference });
    }
  } catch (err) {
    if (err?.statusCode) return res.status(err.statusCode).json({ error: err.message });
    next(err);
  }
}

router.post('/airtime', (req, res, next) => createPurchase(req, res, 'AIRTIME', next));
router.post('/data', (req, res, next) => createPurchase(req, res, 'DATA', next));

router.get('/orders/:reference', async (req, res, next) => {
  try {
    const order = await prisma.serviceOrder.findFirst({
      where: { reference: req.params.reference, userId: req.user.id },
      select: { reference: true, type: true, network: true, phone: true, amount: true, currency: true, dataPlan: true, status: true, providerReference: true, createdAt: true, updatedAt: true }
    });
    if (!order) return res.status(404).json({ error: 'Service order not found' });
    res.json({ order });
  } catch (err) { next(err); }
});

export default router;
