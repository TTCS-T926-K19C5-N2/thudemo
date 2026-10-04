-- Verification database only. Do not delete retained ownership to make rollback pass.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM seat_holds) OR EXISTS (SELECT 1 FROM hold_sessions) THEN
    RAISE EXCEPTION 'Compensation refused: retained ownership exists; preserve/export it first';
  END IF;
END $$;
DROP TABLE seat_holds;
DROP TABLE hold_sessions;
DROP INDEX "seats_id_showtimeId_key";
