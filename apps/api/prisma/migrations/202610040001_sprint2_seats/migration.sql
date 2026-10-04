CREATE TYPE "ShowtimeStatus" AS ENUM ('DRAFT', 'ON_SALE', 'CLOSED');
ALTER TABLE "showtimes" ADD COLUMN "status" "ShowtimeStatus" NOT NULL DEFAULT 'DRAFT', ADD COLUMN "structureLocked" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "seat_categories" (
 "id" UUID NOT NULL, "showtimeId" UUID NOT NULL, "name" TEXT NOT NULL,
 "price" INTEGER, CONSTRAINT "seat_categories_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "seat_categories_price_check" CHECK ("price" IS NULL OR "price" >= 0),
 CONSTRAINT "seat_categories_showtimeId_fkey" FOREIGN KEY ("showtimeId") REFERENCES "showtimes"("id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "seat_categories_showtimeId_name_key" ON "seat_categories"("showtimeId", "name");
CREATE UNIQUE INDEX "seat_categories_id_showtimeId_key" ON "seat_categories"("id", "showtimeId");
CREATE TABLE "seats" (
 "id" UUID NOT NULL, "showtimeId" UUID NOT NULL, "categoryId" UUID NOT NULL,
 "row" TEXT NOT NULL, "seatNumber" INTEGER NOT NULL CHECK ("seatNumber" > 0),
 CONSTRAINT "seats_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "seats_showtimeId_fkey" FOREIGN KEY ("showtimeId") REFERENCES "showtimes"("id") ON DELETE RESTRICT,
 CONSTRAINT "seats_categoryId_showtimeId_fkey" FOREIGN KEY ("categoryId", "showtimeId") REFERENCES "seat_categories"("id", "showtimeId") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "seats_showtimeId_row_seatNumber_key" ON "seats"("showtimeId", "row", "seatNumber");
CREATE INDEX "seats_categoryId_showtimeId_idx" ON "seats"("categoryId", "showtimeId");
CREATE TABLE "catalog_revision" ("id" INTEGER PRIMARY KEY, "version" INTEGER NOT NULL DEFAULT 0);
INSERT INTO "catalog_revision" ("id") VALUES (1);
