CREATE TABLE "hold_logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "showtimeId" UUID NOT NULL,
  "holdSessionId" UUID,
  "actorId" UUID,
  "seatIds" UUID[] NOT NULL,
  "action" TEXT NOT NULL,
  "fromExpiresAt" TIMESTAMPTZ(3),
  "toExpiresAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT "hold_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "hold_logs_showtimeId_fkey" FOREIGN KEY ("showtimeId") REFERENCES "showtimes"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "hold_logs_holdSessionId_fkey" FOREIGN KEY ("holdSessionId") REFERENCES "hold_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "hold_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "hold_logs_showtimeId_createdAt_idx" ON "hold_logs"("showtimeId", "createdAt");

CREATE OR REPLACE FUNCTION public.audit_seat_hold_change()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  actor_id uuid;
  seat_ids uuid[];
  before_expiry timestamptz;
  after_expiry timestamptz;
  operation text;
BEGIN
  IF TG_OP='INSERT' THEN
    SELECT hs."userId" INTO actor_id FROM public.hold_sessions hs WHERE hs.id=NEW."holdSessionId";
    seat_ids := ARRAY[NEW."seatId"];
    after_expiry := NEW."expiresAt";
    operation := 'CLAIMED';
  ELSIF TG_OP='UPDATE' THEN
    IF NEW."holdSessionId"=OLD."holdSessionId" AND NEW.token=OLD.token
      AND NEW."expiresAt"=OLD."expiresAt" THEN RETURN NEW; END IF;
    SELECT hs."userId" INTO actor_id FROM public.hold_sessions hs WHERE hs.id=NEW."holdSessionId";
    seat_ids := ARRAY[NEW."seatId"];
    before_expiry := OLD."expiresAt";
    after_expiry := NEW."expiresAt";
    operation := 'RECLAIMED';
  ELSE
    SELECT hs."userId" INTO actor_id FROM public.hold_sessions hs WHERE hs.id=OLD."holdSessionId";
    seat_ids := ARRAY[OLD."seatId"];
    before_expiry := OLD."expiresAt";
    operation := CASE WHEN OLD."expiresAt"<=clock_timestamp() THEN 'EXPIRED' ELSE 'RELEASED' END;
  END IF;
  INSERT INTO public.hold_logs("showtimeId","holdSessionId","actorId","seatIds","action","fromExpiresAt","toExpiresAt")
  VALUES (
    CASE WHEN TG_OP='DELETE' THEN OLD."showtimeId" ELSE NEW."showtimeId" END,
    CASE WHEN TG_OP='DELETE' THEN OLD."holdSessionId" ELSE NEW."holdSessionId" END,
    actor_id,
    seat_ids,
    operation,
    before_expiry,
    after_expiry
  );
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER "seat_holds_audit_changes"
AFTER INSERT OR UPDATE OR DELETE ON "seat_holds"
FOR EACH ROW EXECUTE FUNCTION public.audit_seat_hold_change();
