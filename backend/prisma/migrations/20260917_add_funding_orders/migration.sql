CREATE TABLE "FundingOrder" (
  "id" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'NGN',
  "provider" TEXT NOT NULL,
  "providerReference" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "paymentUrl" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FundingOrder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FundingOrder_reference_key" ON "FundingOrder"("reference");
CREATE UNIQUE INDEX "FundingOrder_providerReference_key" ON "FundingOrder"("providerReference");
CREATE INDEX "FundingOrder_userId_createdAt_idx" ON "FundingOrder"("userId", "createdAt");
CREATE INDEX "FundingOrder_status_createdAt_idx" ON "FundingOrder"("status", "createdAt");

ALTER TABLE "FundingOrder" ADD CONSTRAINT "FundingOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
