import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

export function transactionReference() {
  return `CAF-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
}

export async function transferFunds({ senderId, recipientEmail, amount }) {
  if (!Number.isFinite(amount) || amount <= 0) {
    const error = new Error('Amount must be greater than zero');
    error.status = 400;
    throw error;
  }

  const maxAttempts = 4;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const result = await prisma.$transaction(async (tx) => {
    const sender = await tx.user.findUnique({ where: { id: senderId }, include: { wallet: true } });
    const recipient = await tx.user.findUnique({ where: { email: recipientEmail.toLowerCase() }, include: { wallet: true } });

    if (!sender?.wallet) throw Object.assign(new Error('Sender wallet not found'), { status: 404 });
    if (!recipient?.wallet) throw Object.assign(new Error('Recipient wallet not found'), { status: 404 });
    if (sender.id === recipient.id) throw Object.assign(new Error('You cannot transfer to yourself'), { status: 400 });
    if (sender.wallet.currency !== recipient.wallet.currency) throw Object.assign(new Error('Currency mismatch'), { status: 400 });

    const senderUpdated = await tx.wallet.updateMany({
      where: { id: sender.wallet.id, currency: sender.wallet.currency, balance: { gte: amount } },
      data: { balance: { decrement: amount } }
    });

    if (senderUpdated.count !== 1) throw Object.assign(new Error('Insufficient balance'), { status: 400 });

    await tx.wallet.update({
      where: { id: recipient.wallet.id },
      data: { balance: { increment: amount } }
    });

    const reference = transactionReference();
    return tx.transaction.create({
      data: {
        reference,
        userId: sender.id,
        senderId: sender.id,
        recipientId: recipient.id,
        amount,
        currency: sender.wallet.currency,
        type: 'TRANSFER',
        status: 'SUCCESS',
        description: `Transfer to ${recipient.email}`
      }
    });
      }, { isolationLevel: 'Serializable' });

      return result;
    } catch (error) {
      // PostgreSQL can abort a Serializable transaction when concurrent transfers
      // touch the same wallet. Retry those transient serialization failures.
      if (error?.code !== 'P2034' || attempt === maxAttempts) throw error;
      await new Promise(resolve => setTimeout(resolve, 10 * attempt));
    }
  }

  throw new Error('Transfer could not be completed');
}
