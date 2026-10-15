-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('INITIATED', 'SUCCEEDED', 'FAILED', 'AMOUNT_MISMATCH', 'LATE');

-- AlterTable
ALTER TABLE "seats" ADD COLUMN "isSold" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "seats_isSold_idx" ON "seats"("isSold");

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'INITIATED',
    "gateway" TEXT NOT NULL,
    "gatewayRef" TEXT NOT NULL,
    "transactionId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payments_orderId_idx" ON "payments"("orderId");
CREATE INDEX "payments_gatewayRef_idx" ON "payments"("gatewayRef");
CREATE INDEX "payments_transactionId_idx" ON "payments"("transactionId");
CREATE INDEX "payments_status_idx" ON "payments"("status");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
