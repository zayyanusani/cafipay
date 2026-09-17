import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export function auditRequests(req, res, next) {
  const startedAt = Date.now();
  res.on('finish', () => {
    prisma.auditLog.create({
      data: {
        userId: req.user?.id || null,
        method: req.method,
        path: req.originalUrl.split('?')[0],
        statusCode: res.statusCode,
        ipAddress: req.ip || null,
        userAgent: req.get('user-agent') || null,
        durationMs: Date.now() - startedAt,
      },
    }).catch(error => console.error('Audit log error:', error));
  });
  next();
}
