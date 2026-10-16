-- S-61: add reminderSentAt and remindedStartTime to tickets table
ALTER TABLE "tickets" ADD COLUMN "reminderSentAt" TIMESTAMPTZ(3),
ADD COLUMN "remindedStartTime" TIMESTAMPTZ(3);
