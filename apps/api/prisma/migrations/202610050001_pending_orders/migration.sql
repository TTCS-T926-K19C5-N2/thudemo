CREATE TYPE "OrderStatus" AS ENUM ('PENDING_PAYMENT', 'PAID', 'EXPIRED', 'CANCELLED');

CREATE TABLE "orders" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "showtimeId" UUID NOT NULL,
  "holdSessionId" UUID NOT NULL,
  "holdToken" UUID NOT NULL,
  "status" "OrderStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
  "paymentExpiresAt" TIMESTAMPTZ(3) NOT NULL,
  "totalAmount" BIGINT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "orders_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "orders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "orders_showtimeId_fkey" FOREIGN KEY ("showtimeId") REFERENCES "showtimes"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "orders_holdSessionId_showtimeId_fkey" FOREIGN KEY ("holdSessionId", "showtimeId") REFERENCES "hold_sessions"("id", "showtimeId") ON DELETE RESTRICT ON UPDATE CASCADE
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

CREATE UNIQUE INDEX "orders_holdSessionId_holdToken_key" ON "orders"("holdSessionId", "holdToken");
CREATE UNIQUE INDEX "orders_one_pending_per_buyer_showtime_key" ON "orders"("userId", "showtimeId") WHERE "status" = 'PENDING_PAYMENT';
CREATE INDEX "orders_userId_showtimeId_status_idx" ON "orders"("userId", "showtimeId", "status");
CREATE INDEX "orders_status_paymentExpiresAt_idx" ON "orders"("status", "paymentExpiresAt");
CREATE UNIQUE INDEX "order_items_orderId_seatId_key" ON "order_items"("orderId", "seatId");
CREATE INDEX "order_items_seatId_idx" ON "order_items"("seatId");
