-- ONLY on an isolated empty migration-verification DB. Never on application data.
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM seats) OR EXISTS (SELECT 1 FROM seat_categories)
 THEN RAISE EXCEPTION 'Compensation refused: Sprint2 data exists; requires backup/data plan'; END IF;
END $$;
DROP TABLE seats;
DROP TABLE seat_categories;
DROP TABLE catalog_revision;
ALTER TABLE showtimes DROP COLUMN status, DROP COLUMN "structureLocked";
DROP TYPE "ShowtimeStatus";
