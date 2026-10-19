-- DropIndex
DROP INDEX IF EXISTS "payments_gatewayRef_idx";

-- CreateIndex
CREATE UNIQUE INDEX "payments_gatewayRef_key" ON "payments"("gatewayRef");

-- CreateIndex
CREATE UNIQUE INDEX "payments_gateway_transactionId_key" ON "payments"("gateway", "transactionId");
