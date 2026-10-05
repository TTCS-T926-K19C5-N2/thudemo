-- DropForeignKey
ALTER TABLE "hold_sessions" DROP CONSTRAINT "hold_sessions_showtimeId_fkey";

-- DropForeignKey
ALTER TABLE "hold_sessions" DROP CONSTRAINT "hold_sessions_userId_fkey";

-- DropForeignKey
ALTER TABLE "seat_categories" DROP CONSTRAINT "seat_categories_showtimeId_fkey";

-- DropForeignKey
ALTER TABLE "seat_holds" DROP CONSTRAINT "seat_holds_holdSessionId_showtimeId_fkey";

-- DropForeignKey
ALTER TABLE "seat_holds" DROP CONSTRAINT "seat_holds_seatId_showtimeId_fkey";

-- DropForeignKey
ALTER TABLE "seats" DROP CONSTRAINT "seats_categoryId_showtimeId_fkey";

-- DropForeignKey
ALTER TABLE "seats" DROP CONSTRAINT "seats_showtimeId_fkey";

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "performedById" UUID NOT NULL,
    "targetUserId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_logs_performedById_idx" ON "audit_logs"("performedById");

-- CreateIndex
CREATE INDEX "audit_logs_targetUserId_idx" ON "audit_logs"("targetUserId");

-- AddForeignKey
ALTER TABLE "seat_categories" ADD CONSTRAINT "seat_categories_showtimeId_fkey" FOREIGN KEY ("showtimeId") REFERENCES "showtimes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seats" ADD CONSTRAINT "seats_showtimeId_fkey" FOREIGN KEY ("showtimeId") REFERENCES "showtimes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seats" ADD CONSTRAINT "seats_categoryId_showtimeId_fkey" FOREIGN KEY ("categoryId", "showtimeId") REFERENCES "seat_categories"("id", "showtimeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hold_sessions" ADD CONSTRAINT "hold_sessions_showtimeId_fkey" FOREIGN KEY ("showtimeId") REFERENCES "showtimes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hold_sessions" ADD CONSTRAINT "hold_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seat_holds" ADD CONSTRAINT "seat_holds_seatId_showtimeId_fkey" FOREIGN KEY ("seatId", "showtimeId") REFERENCES "seats"("id", "showtimeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seat_holds" ADD CONSTRAINT "seat_holds_holdSessionId_showtimeId_fkey" FOREIGN KEY ("holdSessionId", "showtimeId") REFERENCES "hold_sessions"("id", "showtimeId") ON DELETE RESTRICT ON UPDATE CASCADE;
