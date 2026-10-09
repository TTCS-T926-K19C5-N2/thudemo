-- S-61: add reminderSentAt to tickets table
ALTER TABLE "tickets" ADD COLUMN "reminderSentAt" TIMESTAMPTZ(3);
