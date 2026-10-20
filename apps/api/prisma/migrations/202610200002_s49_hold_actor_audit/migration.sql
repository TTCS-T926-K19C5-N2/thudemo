CREATE OR REPLACE FUNCTION public.audit_seat_hold_s49()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_actor uuid;
  v_action text;
BEGIN
  IF TG_OP='UPDATE' AND NEW."holdSessionId"=OLD."holdSessionId"
     AND NEW.token=OLD.token AND NEW."expiresAt"=OLD."expiresAt" THEN
    RETURN NEW;
  END IF;

  SELECT hs."userId" INTO v_actor
    FROM public.hold_sessions hs
    WHERE hs.id=NEW."holdSessionId" AND hs."showtimeId"=NEW."showtimeId";
  v_action := CASE WHEN NEW."expiresAt"<=clock_timestamp() THEN 'EXPIRED'
    WHEN TG_OP='INSERT' THEN 'CLAIMED'
    WHEN NEW."holdSessionId"=OLD."holdSessionId" AND NEW.token=OLD.token THEN 'EXTENDED'
    ELSE 'RECLAIMED' END;

  INSERT INTO public.hold_logs
    ("showtimeId","holdSessionId",token,"actorId","actorType","seatIds",action,"fromExpiresAt","toExpiresAt")
  VALUES (NEW."showtimeId",NEW."holdSessionId",NEW.token,
    CASE WHEN v_action='EXPIRED' THEN NULL ELSE v_actor END,
    CASE WHEN v_action='EXPIRED' OR v_actor IS NULL THEN 'SYSTEM' ELSE 'USER' END,
    ARRAY[NEW."seatId"],v_action,
    CASE WHEN TG_OP='UPDATE' THEN OLD."expiresAt" ELSE NULL END,
    NEW."expiresAt");
  IF v_action <> 'EXPIRED' THEN
    UPDATE public.hold_logs
      SET "orderId"=o.id
      FROM public.orders o
      WHERE public.hold_logs."orderId" IS NULL
        AND o."showtimeId"=NEW."showtimeId"
        AND o."holdSessionId"=NEW."holdSessionId"
        AND o."holdToken"=NEW.token;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.classify_hold_release_audit_s49()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_actor uuid;
  v_order uuid;
  v_system boolean;
BEGIN
  v_system := current_setting('app.hold_release_actor', true)='SYSTEM'
    OR OLD."expiresAt"<=clock_timestamp();
  IF NOT v_system THEN
    SELECT hs."userId" INTO v_actor
      FROM public.hold_sessions hs
      WHERE hs.id=OLD."holdSessionId" AND hs."showtimeId"=OLD."showtimeId";
  END IF;
  SELECT o.id INTO v_order
    FROM public.orders o
    WHERE o."showtimeId"=OLD."showtimeId"
      AND o."holdSessionId"=OLD."holdSessionId"
      AND o."holdToken"=OLD.token
    ORDER BY o."createdAt" DESC, o.id DESC LIMIT 1;

  INSERT INTO public.hold_logs
    ("orderId","showtimeId","holdSessionId",token,"actorId","actorType","seatIds",action,"fromExpiresAt")
  VALUES (v_order,OLD."showtimeId",OLD."holdSessionId",OLD.token,
    CASE WHEN v_system THEN NULL ELSE v_actor END,
    CASE WHEN v_system OR v_actor IS NULL THEN 'SYSTEM' ELSE 'USER' END,
    ARRAY[OLD."seatId"],CASE WHEN OLD."expiresAt"<=clock_timestamp() THEN 'EXPIRED' ELSE 'RELEASED' END,
    OLD."expiresAt");
  IF v_order IS NOT NULL THEN
    UPDATE public.hold_logs
      SET "orderId"=v_order
      WHERE "orderId" IS NULL AND "showtimeId"=OLD."showtimeId"
        AND "holdSessionId"=OLD."holdSessionId" AND token=OLD.token
        AND "seatIds" @> ARRAY[OLD."seatId"]::uuid[];
  END IF;
  RETURN OLD;
END;
$function$;

DROP TRIGGER IF EXISTS "seat_holds_delete_audit_s49" ON "seat_holds";
CREATE TRIGGER "seat_holds_delete_audit_s49"
AFTER DELETE ON "seat_holds"
FOR EACH ROW EXECUTE FUNCTION public.classify_hold_release_audit_s49();
