import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

export function transactionReference() {
  return `CAF-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
}

export async function transferFunds({ senderId, recipientEmail, amount }) {
  if (!Number.isFinite(amount) || amount <= 0) {
    const error = new Error('Amount must be greater than zero');
    error.status = 400;
    throw error;
  }

  const result = await prisma.$transaction(async (tx) => {
    const sender = await tx.user.findUnique({ where: { id: senderId }, include: { wallet: true } });
    const recipient = await tx.user.findUnique({ where: { email: recipientEmail.toLowerCase() }, include: { wallet: true } });

    if (!sender?.wallet) throw Object.assign(new Error('Sender wallet not found'), { status: 404 });
    if (!recipient?.wallet) throw Object.assign(new Error('Recipient wallet not found'), { status: 404 });
    if (sender.id === recipient.id) throw Object.assign(new Error('You cannot transfer to yourself'), { status: 400 });
    if (sender.wallet.balance < amount) throw Object.assign(new Error('Insufficient balance'), { status: 400 });

    const reference = transactionReference();

    await tx.wallet.update({ where: { id: sender.wallet.id }, data: { balance: { decrement: amount } } });
    await tx.wallet.update({ where: { id: recipient.wallet.id }, data: { balance: { increment: amount } } });

    const transaction = await tx.transaction.create({
      data: {
        reference,
        amount,
        type: 'TRANSFER',
        status: 'SUCCESS',
        senderId: sender.id,
        recipientId: recipient.id
      }
    });

    return transaction;
  });

  return result;
}
