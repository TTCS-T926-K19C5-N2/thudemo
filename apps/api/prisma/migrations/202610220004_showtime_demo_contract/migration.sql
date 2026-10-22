-- Existing sellable showtimes retain normal booking semantics.
-- New exhibition/demo showtimes can be marked explicitly by their creator.
ALTER TABLE "showtimes" ADD COLUMN "isDemo" BOOLEAN NOT NULL DEFAULT false;
