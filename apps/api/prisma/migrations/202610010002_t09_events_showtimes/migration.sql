CREATE TABLE "events" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "organizerId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "events_organizerId_idx" ON "events"("organizerId");

ALTER TABLE "events" ADD CONSTRAINT "events_organizerId_fkey"
    FOREIGN KEY ("organizerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "showtimes" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "startTime" TIMESTAMPTZ(3) NOT NULL,
    "seatMapId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "showtimes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "showtimes_eventId_idx" ON "showtimes"("eventId");

-- Deliberate RESTRICT: deleting an event with showtimes must be handled explicitly.
ALTER TABLE "showtimes" ADD CONSTRAINT "showtimes_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
