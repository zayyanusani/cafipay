CREATE TABLE "QrPayment" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),
    CONSTRAINT "QrPayment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "QrPayment_reference_key" ON "QrPayment"("reference");
CREATE INDEX "QrPayment_merchantId_createdAt_idx" ON "QrPayment"("merchantId", "createdAt");
CREATE INDEX "QrPayment_status_expiresAt_idx" ON "QrPayment"("status", "expiresAt");

ALTER TABLE "QrPayment" ADD CONSTRAINT "QrPayment_merchantId_fkey"
  FOREIGN KEY ("merchantId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
