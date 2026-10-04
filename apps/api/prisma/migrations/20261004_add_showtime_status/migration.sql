-- CreateEnum
CREATE TYPE "ShowtimeStatus" AS ENUM ('DRAFT', 'ON_SALE', 'CLOSED');

-- AlterTable
ALTER TABLE "Showtime" ADD COLUMN "status" "ShowtimeStatus" NOT NULL DEFAULT 'DRAFT';
