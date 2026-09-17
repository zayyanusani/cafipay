import { Router } from 'express';
import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { initializeFunding, verifyFunding } from '../funding-provider.js';

const prisma = new PrismaClient();
const router = Router();

const initiateSchema = z.object({ amount: z.coerce.number().positive().finite().min(100).max(100000000), currency: z.string().trim().length(3).default('NGN'), callbackUrl: z.string().url().max(2048).optional() });
function reference() { return `CAFDEP-${crypto.randomBytes(12).toString('hex').toUpperCase()}`; }
function webhookSignature(rawBody, secret) { return crypto.createHmac('sha512', secret).update(rawBody).digest('hex'); }

router.post('/initiate', async (req, res, next) => {
  try {
    const data = initiateSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { id: true, email: true } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (data.currency.toUpperCase() !== 'NGN') return res.status(400).json({ error: 'Only NGN funding is currently supported by Paystack integration' });
    const fundingReference = reference();
    const order = await prisma.fundingOrder.create({ data: { reference: fundingReference, userId: user.id, amount: data.amount.toFixed(2), currency: 'NGN', provider: 'paystack', metadata: { callbackUrl: data.callbackUrl || null } }, select: { reference: true, amount: true, currency: true, provider: true, status: true, paymentUrl: true, createdAt: true } });
    try {
      const initialized = await initializeFunding({ reference: order.reference, amount: order.amount, currency: order.currency, email: user.email, callbackUrl: data.callbackUrl || process.env.FUNDING_CALLBACK_URL || undefined });
      const updated = await prisma.fundingOrder.update({ where: { reference: order.reference }, data: { providerReference: initialized.providerReference, paymentUrl: initialized.paymentUrl, metadata: { callbackUrl: data.callbackUrl || process.env.FUNDING_CALLBACK_URL || null, accessCode: initialized.accessCode } }, select: { reference: true, amount: true, currency: true, provider: true, providerReference: true, status: true, paymentUrl: true, createdAt: true } });
      return res.status(201).json({ message: 'Funding initialized', funding: updated, accessCode: initialized.accessCode });
    } catch (error) {
      await prisma.fundingOrder.update({ where: { reference: order.reference }, data: { status: 'FAILED', metadata: { error: error.message } } });
      if (error.code === 'PROVIDER_NOT_CONFIGURED') return res.status(503).json({ error: 'Paystack provider is not configured' });
      if (error.code === 'PROVIDER_TIMEOUT') return res.status(504).json({ error: 'Paystack provider timed out; check the funding status before retrying' });
      return res.status(502).json({ error: error.message });
    }
  } catch (error) { next(error); }
});

router.post('/:reference/verify', async (req, res, next) => {
  try {
    const order = await prisma.fundingOrder.findFirst({ where: { reference: req.params.reference, userId: req.user.id } });
    if (!order) return res.status(404).json({ error: 'Funding order not found' });
    if (order.status === 'SUCCESS') return res.json({ message: 'Funding already completed', funding: order });
    const payment = await verifyFunding(order.providerReference || order.reference);
    if (payment.reference !== order.providerReference && payment.reference !== order.reference) return res.status(502).json({ error: 'Provider reference mismatch' });
    const result = await handleFundingWebhook({ reference: order.reference, providerReference: payment.reference, status: payment.status, amount: Number(payment.amount) / 100, currency: payment.currency });
    res.json({ message: result.order.status === 'SUCCESS' ? 'Funding verified and wallet credited' : 'Funding status checked', funding: result.order });
  } catch (error) {
    if (error.code === 'PROVIDER_TIMEOUT') return res.status(504).json({ error: 'Payment verification timed out' });
    if (error.code === 'PROVIDER_NOT_CONFIGURED') return res.status(503).json({ error: 'Paystack provider is not configured' });
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    next(error);
  }
});

router.get('/:reference', async (req, res, next) => {
  try {
    const order = await prisma.fundingOrder.findFirst({ where: { reference: req.params.reference, userId: req.user.id }, select: { reference: true, amount: true, currency: true, provider: true, providerReference: true, status: true, paymentUrl: true, createdAt: true, updatedAt: true } });
    if (!order) return res.status(404).json({ error: 'Funding order not found' });
    res.json({ funding: order });
  } catch (error) { next(error); }
});

export function verifyFundingWebhook(req) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  const signature = req.get('x-paystack-signature');
  if (!secret || !signature || !req.rawBody) return false;
  const expected = webhookSignature(req.rawBody, secret);
  return signature.length === expected.length && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export async function handleFundingWebhook(payload) {
  const isPaystackEvent = payload?.event && payload?.data;
  const event = isPaystackEvent ? payload.data : payload;
  const referenceValue = event.reference || event.merchantReference;
  const providerReference = event.reference || event.providerReference || event.transactionId || event.id;
  const status = String(event.status || (payload.event === 'charge.success' ? 'SUCCESS' : payload.event || '')).toUpperCase();
  if (!referenceValue) throw Object.assign(new Error('Missing funding reference'), { statusCode: 400 });

  return prisma.$transaction(async (tx) => {
    const order = await tx.fundingOrder.findUnique({ where: { reference: referenceValue } });
    if (!order) throw Object.assign(new Error('Funding order not found'), { statusCode: 404 });
    if (order.status === 'SUCCESS') return { alreadyProcessed: true, order };
    if (!['SUCCESS', 'PAID', 'COMPLETED'].includes(status)) {
      const failed = ['FAILED', 'CANCELLED', 'DECLINED', 'EXPIRED', 'REVERSED', 'ABANDONED'].includes(status);
      if (failed) await tx.fundingOrder.update({ where: { id: order.id }, data: { status: 'FAILED', providerReference: providerReference || order.providerReference } });
      return { alreadyProcessed: false, order: failed ? { ...order, status: 'FAILED' } : order };
    }
    const rawAmount = event.amount;
    const normalizedAmount = isPaystackEvent ? Number(rawAmount) / 100 : Number(rawAmount);
    if (rawAmount !== undefined && normalizedAmount !== Number(order.amount)) throw Object.assign(new Error('Funding amount mismatch'), { statusCode: 400 });
    if (event.currency && String(event.currency).toUpperCase() !== order.currency) throw Object.assign(new Error('Funding currency mismatch'), { statusCode: 400 });

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
