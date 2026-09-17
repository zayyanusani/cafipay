import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const logs = await prisma.auditLog.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { id: true, method: true, path: true, statusCode: true, ipAddress: true, userAgent: true, durationMs: true, createdAt: true },
    });
    res.json({ logs });
  } catch (err) { next(err); }
});

export default router;
