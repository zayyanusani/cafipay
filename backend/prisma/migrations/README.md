# Prisma migration note

Run Prisma migrations after pulling this branch:

```bash
npx prisma migrate dev --name add_audit_logs_idempotency
npx prisma generate
```

For deployment, use `npx prisma migrate deploy` instead of `migrate dev`.
