-- CreateTable
CREATE TABLE "offline_scan_logs" (
    "id" UUID NOT NULL,
    "scanId" UUID NOT NULL,
    "ticketCode" TEXT NOT NULL,
    "showtimeId" UUID NOT NULL,
    "gateId" UUID,
    "staffId" UUID NOT NULL,
    "deviceId" TEXT NOT NULL,
    "scannedAt" TIMESTAMPTZ(3) NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "offline_scan_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "offline_scan_logs_scanId_key" ON "offline_scan_logs"("scanId");

-- CreateIndex
CREATE INDEX "offline_scan_logs_showtimeId_ticketCode_idx" ON "offline_scan_logs"("showtimeId", "ticketCode");

-- CreateIndex
CREATE INDEX "offline_scan_logs_staffId_idx" ON "offline_scan_logs"("staffId");

-- AddForeignKey
ALTER TABLE "offline_scan_logs" ADD CONSTRAINT "offline_scan_logs_showtimeId_fkey" FOREIGN KEY ("showtimeId") REFERENCES "showtimes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offline_scan_logs" ADD CONSTRAINT "offline_scan_logs_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
