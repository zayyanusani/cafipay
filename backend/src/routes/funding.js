import { Router } from 'express';
import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { initializeFunding } from '../funding-provider.js';

const prisma = new PrismaClient();
const router = Router();

const initiateSchema = z.object({
  amount: z.coerce.number().positive().finite().min(100).max(100000000),
  currency: z.string().trim().length(3).default('NGN'),
  callbackUrl: z.string().url().max(2048).optional(),
});

function reference() {
  return `CAFDEP-${crypto.randomBytes(12).toString('hex').toUpperCase()}`;
}

function webhookSignature(rawBody, secret) {
  return crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
}

router.post('/initiate', async (req, res, next) => {
  try {
    const data = initiateSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { id: true, email: true } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const fundingReference = reference();
    const order = await prisma.fundingOrder.create({
      data: {
        reference: fundingReference,
        userId: user.id,
        amount: data.amount.toFixed(2),
        currency: data.currency.toUpperCase(),
        provider: process.env.FUNDING_PROVIDER_NAME || 'generic',
        metadata: { callbackUrl: data.callbackUrl || null },
      },
      select: { reference: true, amount: true, currency: true, provider: true, status: true, paymentUrl: true, createdAt: true },
    });

    try {
      const initialized = await initializeFunding({
        reference: order.reference,
        amount: order.amount,
        currency: order.currency,
        email: user.email,
        callbackUrl: data.callbackUrl || process.env.FUNDING_CALLBACK_URL || undefined,
      });
      const updated = await prisma.fundingOrder.update({
        where: { reference: order.reference },
        data: { providerReference: initialized.providerReference, paymentUrl: initialized.paymentUrl, metadata: { callbackUrl: data.callbackUrl || process.env.FUNDING_CALLBACK_URL || null } },
        select: { reference: true, amount: true, currency: true, provider: true, providerReference: true, status: true, paymentUrl: true, createdAt: true },
      });
      return res.status(201).json({ message: 'Funding initialized', funding: updated });
    } catch (error) {
      await prisma.fundingOrder.update({ where: { reference: order.reference }, data: { status: 'FAILED', metadata: { error: error.message } } });
      if (error.code === 'PROVIDER_NOT_CONFIGURED') return res.status(503).json({ error: 'Funding provider is not configured' });
      if (error.code === 'PROVIDER_TIMEOUT') return res.status(504).json({ error: 'Funding provider timed out; do not retry with the same payment reference' });
      return res.status(502).json({ error: error.message });
    }
  } catch (error) { next(error); }
});

router.get('/:reference', async (req, res, next) => {
  try {
    const order = await prisma.fundingOrder.findFirst({
      where: { reference: req.params.reference, userId: req.user.id },
      select: { reference: true, amount: true, currency: true, provider: true, providerReference: true, status: true, paymentUrl: true, createdAt: true, updatedAt: true },
    });
    if (!order) return res.status(404).json({ error: 'Funding order not found' });
    res.json({ funding: order });
  } catch (error) { next(error); }
});

export function verifyFundingWebhook(req) {
  const secret = process.env.FUNDING_WEBHOOK_SECRET;
  const signature = req.get('x-funding-signature');
  if (!secret || !signature) return false;
  const expected = webhookSignature(req.rawBody || JSON.stringify(req.body), secret);
  return signature.length === expected.length && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export async function handleFundingWebhook(payload) {
  const referenceValue = payload.reference || payload.merchantReference;
  const providerReference = payload.providerReference || payload.transactionId || payload.id;
  const status = String(payload.status || '').toUpperCase();
  if (!referenceValue) throw Object.assign(new Error('Missing funding reference'), { statusCode: 400 });

  return prisma.$transaction(async (tx) => {
    const order = await tx.fundingOrder.findUnique({ where: { reference: referenceValue } });
    if (!order) throw Object.assign(new Error('Funding order not found'), { statusCode: 404 });
    if (order.status === 'SUCCESS') return { alreadyProcessed: true, order };
    if (!['SUCCESS', 'PAID', 'COMPLETED'].includes(status)) {
      const failed = ['FAILED', 'CANCELLED', 'DECLINED', 'EXPIRED'].includes(status);
      if (failed) await tx.fundingOrder.update({ where: { id: order.id }, data: { status: 'FAILED', providerReference: providerReference || order.providerReference } });
      return { alreadyProcessed: false, order: failed ? { ...order, status: 'FAILED' } : order };
    }
    if (payload.amount !== undefined && Number(payload.amount) !== Number(order.amount)) throw Object.assign(new Error('Funding amount mismatch'), { statusCode: 400 });
    if (payload.currency && String(payload.currency).toUpperCase() !== order.currency) throw Object.assign(new Error('Funding currency mismatch'), { statusCode: 400 });

    const wallet = await tx.wallet.findUnique({ where: { userId: order.userId } });
    if (!wallet) throw Object.assign(new Error('Wallet not found'), { statusCode: 404 });
    if (wallet.currency !== order.currency) throw Object.assign(new Error('Wallet currency mismatch'), { statusCode: 400 });

    await tx.wallet.update({ where: { id: wallet.id }, data: { balance: { increment: order.amount } } });
    await tx.transaction.create({ data: { reference: `CAF-${crypto.randomUUID().replaceAll('-', '').slice(0, 24).toUpperCase()}`, userId: order.userId, type: 'WALLET_FUNDING', amount: order.amount, currency: order.currency, status: 'SUCCESS', description: `Wallet funding ${order.reference}` } });
    const completed = await tx.fundingOrder.update({ where: { id: order.id }, data: { status: 'SUCCESS', providerReference: providerReference || order.providerReference }, select: { reference: true, amount: true, currency: true, provider: true, providerReference: true, status: true, createdAt: true, updatedAt: true } });
    return { alreadyProcessed: false, order: completed };
  }, { isolationLevel: 'Serializable' });
}

export default router;
