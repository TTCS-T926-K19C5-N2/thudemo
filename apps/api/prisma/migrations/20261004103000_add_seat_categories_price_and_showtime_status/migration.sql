CREATE TYPE "ShowtimeStatus" AS ENUM ('nhap', 'dang_ban', 'da_dong');

ALTER TABLE "Showtime" ADD COLUMN "status" "ShowtimeStatus" NOT NULL DEFAULT 'nhap';

CREATE TABLE "seat_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" INTEGER,
    "showtimeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seat_categories_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "seat_categories" ADD CONSTRAINT "seat_categories_showtimeId_fkey" FOREIGN KEY ("showtimeId") REFERENCES "Showtime"("id") ON DELETE CASCADE ON UPDATE CASCADE;