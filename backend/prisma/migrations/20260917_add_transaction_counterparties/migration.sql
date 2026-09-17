-- Add sender and recipient references to transfer transactions.
ALTER TABLE "Transaction" ADD COLUMN "senderId" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "recipientId" TEXT;

CREATE INDEX "Transaction_senderId_createdAt_idx" ON "Transaction"("senderId", "createdAt");
CREATE INDEX "Transaction_recipientId_createdAt_idx" ON "Transaction"("recipientId", "createdAt");

ALTER TABLE "Transaction"
  ADD CONSTRAINT "Transaction_senderId_fkey"
  FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Transaction"
  ADD CONSTRAINT "Transaction_recipientId_fkey"
  FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
