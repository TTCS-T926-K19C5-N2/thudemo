-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- AlterTable
ALTER TABLE "tickets" ADD COLUMN "qrCodeData" TEXT;
ALTER TABLE "tickets" ADD COLUMN "qrCodeImage" TEXT;

-- CreateTable
CREATE TABLE "email_logs" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "recipient" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "status" "EmailStatus" NOT NULL DEFAULT 'PENDING',
    "lastError" TEXT,
    "sentAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_logs_orderId_idx" ON "email_logs"("orderId");

-- AddForeignKey
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
