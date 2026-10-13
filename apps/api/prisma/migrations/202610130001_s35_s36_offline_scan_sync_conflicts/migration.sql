-- S-35: offline scan sync and gate tracking
ALTER TABLE "tickets" ADD COLUMN "gate" TEXT;

CREATE TABLE "offline_scan_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "scanId" TEXT NOT NULL,
    "showtimeId" UUID NOT NULL,
    "ticketCode" TEXT NOT NULL,
    "gate" TEXT NOT NULL,
    "deviceId" TEXT,
    "scannedAt" TIMESTAMPTZ(3) NOT NULL,
    "syncedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL,

    CONSTRAINT "offline_scan_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "offline_scan_logs_scanId_key" ON "offline_scan_logs"("scanId");
CREATE INDEX "offline_scan_logs_showtimeId_ticketCode_idx" ON "offline_scan_logs"("showtimeId", "ticketCode");

-- S-36: scan conflicts between gates
CREATE TABLE "scan_conflicts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "showtimeId" UUID NOT NULL,
    "ticketCode" TEXT NOT NULL,
    "firstGate" TEXT NOT NULL,
    "firstScannedAt" TIMESTAMPTZ(3) NOT NULL,
    "conflictGate" TEXT NOT NULL,
    "conflictScannedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scan_conflicts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "scan_conflicts_showtimeId_idx" ON "scan_conflicts"("showtimeId");
CREATE INDEX "scan_conflicts_ticketCode_idx" ON "scan_conflicts"("ticketCode");
