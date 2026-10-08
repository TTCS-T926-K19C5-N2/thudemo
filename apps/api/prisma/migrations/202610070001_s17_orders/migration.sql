-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'PENDING';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'NEEDS_REVIEW';

-- AlterTable orders
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "eventId" UUID;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMPTZ(3);
ALTER TABLE "orders" ALTER COLUMN "holdSessionId" DROP NOT NULL;
ALTER TABLE "orders" ALTER COLUMN "holdToken" DROP NOT NULL;
ALTER TABLE "orders" ALTER COLUMN "totalAmount" TYPE INTEGER;

-- Populate eventId and expiresAt
UPDATE "orders" o SET "eventId" = s."eventId" FROM "showtimes" s WHERE o."showtimeId" = s.id AND o."eventId" IS NULL;
UPDATE "orders" SET "expiresAt" = "paymentExpiresAt" WHERE "expiresAt" IS NULL;

-- Add ForeignKey
ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_eventId_fkey";
ALTER TABLE "orders" ADD CONSTRAINT "orders_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable order_items
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "tierName" TEXT;
UPDATE "order_items" SET "tierName" = "categoryName" WHERE "tierName" IS NULL;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "orders_userId_idx" ON "orders"("userId");
CREATE INDEX IF NOT EXISTS "orders_showtimeId_idx" ON "orders"("showtimeId");
CREATE INDEX IF NOT EXISTS "orders_expiresAt_idx" ON "orders"("expiresAt");
