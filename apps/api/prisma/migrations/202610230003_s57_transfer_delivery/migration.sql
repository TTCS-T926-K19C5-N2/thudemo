ALTER TABLE "ticket_mail_deliveries"
  ADD COLUMN "recipientEmail" TEXT,
  ADD COLUMN "ticketId" UUID;

CREATE INDEX "ticket_mail_deliveries_transfer_ticket_idx"
  ON "ticket_mail_deliveries"("ticketId", "status");
