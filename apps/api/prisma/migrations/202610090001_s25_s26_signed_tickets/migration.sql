-- S-26: store the QR signature made at issue time, with the id of the key that signed it.
ALTER TABLE "tickets" ADD COLUMN "keyId" TEXT,
ADD COLUMN "signature" TEXT;

-- S-25: one ticket per seat of a paid order, so a replayed webhook cannot issue it twice.
CREATE UNIQUE INDEX "tickets_orderId_seatId_key" ON "tickets"("orderId", "seatId");
