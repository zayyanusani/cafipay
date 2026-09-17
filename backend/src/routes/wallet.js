import { Router } from 'express';
import { z } from 'zod';
import { prisma, transferFunds } from '../wallet-transfer.js';

const router = Router();
const transferSchema = z.object({
  recipientEmail: z.string().email(),
  amount: z.coerce.number().positive().finite()
});

router.get('/', async (req, res, next) => {
  try {
    const wallet = await prisma.wallet.findUnique({ where: { userId: req.user.id } });
    if (!wallet) return res.status(404).json({ error: 'Wallet not found' });
    res.json({ wallet: { id: wallet.id, balance: wallet.balance, currency: wallet.currency } });
  } catch (error) { next(error); }
});

router.post('/transfer', async (req, res, next) => {
  try {
    const parsed = transferSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid transfer data', details: parsed.error.flatten() });
    const transaction = await transferFunds({ senderId: req.user.id, ...parsed.data });
    res.status(201).json({ message: 'Transfer successful', transaction });
  } catch (error) { next(error); }
});

router.get('/transactions', async (req, res, next) => {
  try {
    const transactions = await prisma.transaction.findMany({
      where: { OR: [{ senderId: req.user.id }, { recipientId: req.user.id }] },
      orderBy: { createdAt: 'desc' },
      take: 100
    });
    res.json({ transactions });
  } catch (error) { next(error); }
});

export default router;
