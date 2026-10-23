CREATE TYPE "WaitlistEntryStatus" AS ENUM ('ACTIVE', 'NOTICE_QUEUED', 'NOTIFIED', 'CANCELLED');
CREATE TYPE "WaitlistSignalStatus" AS ENUM ('PENDING', 'PROCESSED', 'CANCELLED');
CREATE TYPE "WaitlistNoticeStatus" AS ENUM ('QUEUED', 'SENDING', 'SENT', 'FAILED', 'CANCELLED');

CREATE TABLE "waitlist_entries" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "showtimeId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "status" "WaitlistEntryStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "notifiedAt" TIMESTAMPTZ(3),
  "cancelledAt" TIMESTAMPTZ(3),
  CONSTRAINT "waitlist_entries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "waitlist_entries_showtime_fkey" FOREIGN KEY ("showtimeId") REFERENCES "showtimes"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "waitlist_entries_user_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "waitlist_entries_showtime_fifo_idx" ON "waitlist_entries"("showtimeId", "status", "createdAt", "id");
CREATE INDEX "waitlist_entries_user_status_idx" ON "waitlist_entries"("userId", "status");
CREATE UNIQUE INDEX "waitlist_entries_active_user_showtime_key" ON "waitlist_entries"("showtimeId", "userId") WHERE "status" IN ('ACTIVE', 'NOTICE_QUEUED', 'NOTIFIED');

CREATE TABLE "waitlist_availability_signals" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "showtimeId" UUID NOT NULL,
  "releasedCount" INTEGER NOT NULL,
  "status" "WaitlistSignalStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMPTZ(3),
  CONSTRAINT "waitlist_availability_signals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "waitlist_availability_signals_count_check" CHECK ("releasedCount" > 0),
  CONSTRAINT "waitlist_availability_signals_showtime_fkey" FOREIGN KEY ("showtimeId") REFERENCES "showtimes"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "waitlist_availability_signals_due_idx" ON "waitlist_availability_signals"("status", "createdAt", "id");

CREATE TABLE "waitlist_notifications" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "entryId" UUID NOT NULL,
  "signalId" UUID NOT NULL,
  "status" "WaitlistNoticeStatus" NOT NULL DEFAULT 'QUEUED',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseToken" UUID,
  "leaseUntil" TIMESTAMPTZ(3),
  "sentAt" TIMESTAMPTZ(3),
  "failureCode" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "waitlist_notifications_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "waitlist_notifications_attempts_check" CHECK ("attempts" >= 0),
  CONSTRAINT "waitlist_notifications_entry_signal_key" UNIQUE ("entryId", "signalId"),
  CONSTRAINT "waitlist_notifications_entry_fkey" FOREIGN KEY ("entryId") REFERENCES "waitlist_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "waitlist_notifications_signal_fkey" FOREIGN KEY ("signalId") REFERENCES "waitlist_availability_signals"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "waitlist_notifications_due_idx" ON "waitlist_notifications"("status", "nextAttemptAt", "createdAt", "id");
