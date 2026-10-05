-- S-15/S-16: snapshot prices when a valid hold becomes a pending order.
CREATE TYPE "OrderStatus" AS ENUM ('PENDING_PAYMENT', 'EXPIRED');

CREATE TABLE "orders" (
  "id" UUID NOT NULL,
  "showtimeId" UUID NOT NULL,
  "buyerId" UUID NOT NULL,
  "status" "OrderStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
  "totalAmount" BIGINT NOT NULL,
  "paymentExpiresAt" TIMESTAMPTZ(3) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "orders_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "orders_showtimeId_fkey" FOREIGN KEY ("showtimeId") REFERENCES "showtimes"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "orders_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "orders_totalAmount_check" CHECK ("totalAmount" >= 0)
);

CREATE TABLE "order_items" (
  "id" UUID NOT NULL,
  "orderId" UUID NOT NULL,
  "seatId" UUID NOT NULL,
  "categoryName" TEXT NOT NULL,
  "unitPrice" INTEGER NOT NULL,
  CONSTRAINT "order_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "order_items_seatId_fkey" FOREIGN KEY ("seatId") REFERENCES "seats"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "order_items_unitPrice_check" CHECK ("unitPrice" >= 0)
);

CREATE INDEX "orders_buyerId_status_idx" ON "orders"("buyerId", "status");
CREATE INDEX "orders_showtimeId_status_idx" ON "orders"("showtimeId", "status");
CREATE UNIQUE INDEX "orders_one_pending_per_buyer_showtime_key"
  ON "orders"("buyerId", "showtimeId") WHERE "status" = 'PENDING_PAYMENT';
CREATE UNIQUE INDEX "order_items_orderId_seatId_key" ON "order_items"("orderId", "seatId");
CREATE INDEX "order_items_seatId_idx" ON "order_items"("seatId");
