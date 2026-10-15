-- S-42: per-account ticket limit per showtime. Default 4 (owner chốt);
-- organizer may set 1..2000 per showtime or NULL for unlimited.
ALTER TABLE "showtimes" ADD COLUMN "maxTicketsPerUser" INTEGER DEFAULT 4;
