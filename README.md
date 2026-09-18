# CafiPay

CafiPay is an MVP fintech API for wallet accounts, user authentication, transfers, QR payments, wallet funding, airtime/data purchases, bill payments, transaction history, idempotency protection, rate limiting, and audit logging.

## Stack

- Node.js + Express
- PostgreSQL + Prisma
- JWT authentication
- bcrypt password hashing
- Zod request validation
- Helmet + CORS
- Paystack-compatible wallet funding webhook flow
- Provider adapters for airtime/data and bill payments

## Local setup

1. Create a PostgreSQL database.
2. Copy `backend/.env.example` to `backend/.env`.
3. Set a strong `JWT_SECRET` (32+ characters) and your database credentials.
4. Install dependencies:

```bash
cd backend
npm install
```

5. Generate Prisma Client and create the development schema:

```bash
npx prisma generate
npx prisma db push
```

6. Start the API:

```bash
npm run dev
```

Health check: `GET /api/health`.

## Production configuration

- Set `NODE_ENV=production`.
- Set `CORS_ORIGIN` to the exact trusted frontend origin(s), comma-separated when multiple origins are required.
- Set `TRUST_PROXY` only when the API is behind a trusted reverse proxy/load balancer. Use `true` for one trusted hop or a numeric hop count.
- Never commit `backend/.env` or real provider/API secrets.
- Use a managed PostgreSQL database with backups and monitoring.
- Run migrations with:

```bash
cd backend
npm run prisma:deploy
```

- Configure provider webhook secrets and verify webhook signatures before accepting funding events.
- Keep provider API keys server-side only.
- Use HTTPS in production.

## Testing

From `backend/`:

```bash
npm test
```

CI runs the API test suite against PostgreSQL on Node.js 22 and 24.

## Main API areas

- `/api/auth` — registration, login, current user
- `/api/wallet` — wallet balance, transfers, transaction lookup/history
- `/api/wallet/funding` — wallet funding and webhook verification
- `/api/qr/payments` — QR creation, lookup, and payment
- `/api/services` — airtime and data
- `/api/bills` — bill payments
- `/api/audit-logs` — authenticated audit log access

CafiPay is an MVP. Real-money production use requires provider certification, operational monitoring, reconciliation, fraud controls, compliance/KYC requirements, secure secret management, and independent security review.
