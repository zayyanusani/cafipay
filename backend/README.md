# CafiPay Backend

PostgreSQL + Prisma + Express API with JWT authentication.

## Setup

```bash
cd backend
npm install
cp .env.example .env
# Edit DATABASE_URL and JWT_SECRET
npx prisma generate
npx prisma migrate dev --name init
npm run dev
```

Never commit `.env` or production secrets.

## Authentication

### Register

`POST /api/auth/register`

```json
{
  "name": "Zayyanu Sani",
  "email": "user@example.com",
  "password": "StrongPassword123!"
}
```

### Login

`POST /api/auth/login`

```json
{
  "email": "user@example.com",
  "password": "StrongPassword123!"
}
```

The response contains a JWT. Send it to protected endpoints as:

```text
Authorization: Bearer <token>
```

### Current user

`GET /api/auth/me`

### Wallet

`GET /api/wallet`

### Transactions

`GET /api/transactions`

### Logout

`POST /api/auth/logout`

Because access tokens are stateless, the client should discard the token. If immediate server-side revocation is required, add refresh-token/session storage and rotation.

## Production notes

- Use HTTPS.
- Use a strong random JWT secret stored in the deployment secret manager.
- Keep JWT lifetime short.
- Consider HttpOnly Secure SameSite cookies for browser sessions rather than localStorage.
- Add refresh-token rotation/revocation before production fintech use.
- Add email/phone verification, password reset, audit logs, transaction idempotency, and stricter per-route rate limits.
