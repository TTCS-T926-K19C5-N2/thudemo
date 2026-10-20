CREATE TABLE "hold_logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "orderId" UUID,
  "showtimeId" UUID NOT NULL,
  "holdSessionId" UUID NOT NULL,
  "token" UUID NOT NULL,
  "actorId" UUID,
  "actorType" TEXT NOT NULL,
  "seatIds" UUID[] NOT NULL,
  "action" TEXT NOT NULL,
  "fromExpiresAt" TIMESTAMPTZ(3),
  "toExpiresAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT "hold_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "hold_logs_orderId_createdAt_idx" ON "hold_logs"("orderId", "createdAt");
CREATE INDEX "hold_logs_session_token_time_idx" ON "hold_logs"("showtimeId", "holdSessionId", "token", "createdAt");

CREATE OR REPLACE FUNCTION public.audit_seat_hold_s49()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_showtime uuid;
  v_session uuid;
  v_token uuid;
  v_actor uuid;
  v_seat uuid;
  v_before timestamptz;
  v_after timestamptz;
  v_action text;
  v_order uuid;
BEGIN
  IF TG_OP='INSERT' THEN
    v_showtime := NEW."showtimeId";
    v_session := NEW."holdSessionId";
    v_token := NEW.token;
    v_seat := NEW."seatId";
    v_after := NEW."expiresAt";
    v_action := CASE WHEN NEW."expiresAt" <= clock_timestamp() THEN 'EXPIRED' ELSE 'CLAIMED' END;
  ELSIF TG_OP='UPDATE' THEN
    IF NEW."holdSessionId"=OLD."holdSessionId" AND NEW.token=OLD.token
       AND NEW."expiresAt"=OLD."expiresAt" THEN RETURN NEW; END IF;
    v_showtime := NEW."showtimeId";
    v_session := NEW."holdSessionId";
    v_token := NEW.token;
    v_seat := NEW."seatId";
    v_before := OLD."expiresAt";
    v_after := NEW."expiresAt";
    v_action := CASE
      WHEN NEW."expiresAt" <= clock_timestamp() THEN 'EXPIRED'
      WHEN NEW."holdSessionId"=OLD."holdSessionId" AND NEW.token=OLD.token THEN 'EXTENDED'
      ELSE 'RECLAIMED' END;
  ELSE
    v_showtime := OLD."showtimeId";
    v_session := OLD."holdSessionId";
    v_token := OLD.token;
    v_seat := OLD."seatId";
    v_before := OLD."expiresAt";
    v_action := CASE WHEN OLD."expiresAt"<=clock_timestamp() THEN 'EXPIRED' ELSE 'RELEASED' END;
  END IF;

  SELECT hs."userId" INTO v_actor FROM public.hold_sessions hs
    WHERE hs.id=v_session AND hs."showtimeId"=v_showtime;
  IF v_action='EXPIRED' THEN
    v_actor := NULL;
  END IF;
  INSERT INTO public.hold_logs
    ("orderId","showtimeId","holdSessionId",token,"actorId","actorType","seatIds",action,"fromExpiresAt","toExpiresAt")
  VALUES (NULL,v_showtime,v_session,v_token,v_actor,
    CASE WHEN v_actor IS NULL THEN 'SYSTEM' ELSE 'USER' END,
    ARRAY[v_seat],v_action,v_before,v_after);
  RETURN NEW;
END;
$function$;


CREATE TRIGGER "seat_holds_audit_s49"
AFTER INSERT OR UPDATE ON "seat_holds"
FOR EACH ROW EXECUTE FUNCTION public.audit_seat_hold_s49();

CREATE OR REPLACE FUNCTION public.link_order_hold_audit_s49()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF NEW."holdSessionId" IS NOT NULL AND NEW."holdToken" IS NOT NULL THEN
    UPDATE public.hold_logs
      SET "orderId"=NEW.id
      WHERE "orderId" IS NULL
        AND "showtimeId"=NEW."showtimeId"
        AND "holdSessionId"=NEW."holdSessionId"
        AND token=NEW."holdToken";
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER "orders_link_hold_audit_s49"
AFTER INSERT ON "orders"
FOR EACH ROW EXECUTE FUNCTION public.link_order_hold_audit_s49();

CREATE OR REPLACE FUNCTION public.classify_hold_release_audit_s49()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF OLD."expiresAt"<=clock_timestamp() THEN
    UPDATE public.hold_logs
      SET action='EXPIRED', "actorId"=NULL, "actorType"='SYSTEM'
      WHERE "showtimeId"=OLD."showtimeId" AND "holdSessionId"=OLD."holdSessionId"
        AND token=OLD.token AND "seatIds" @> ARRAY[OLD."seatId"]::uuid[]
        AND action IN ('CLAIMED','EXTENDED','RECLAIMED');
  ELSIF current_setting('app.hold_release_actor', true)='SYSTEM' THEN
    INSERT INTO public.hold_logs
      ("showtimeId","holdSessionId",token,"actorId","actorType","seatIds",action,"fromExpiresAt")
    VALUES (OLD."showtimeId",OLD."holdSessionId",OLD.token,NULL,'SYSTEM',ARRAY[OLD."seatId"],'RELEASED',OLD."expiresAt");
  ELSE
    INSERT INTO public.hold_logs
      ("showtimeId","holdSessionId",token,"actorId","actorType","seatIds",action,"fromExpiresAt")
    SELECT OLD."showtimeId",OLD."holdSessionId",OLD.token,hs."userId",'USER',ARRAY[OLD."seatId"],'RELEASED',OLD."expiresAt"
    FROM public.hold_sessions hs WHERE hs.id=OLD."holdSessionId";
  END IF;
  RETURN OLD;
END;
$function$;

DROP TRIGGER "seat_holds_audit_s49" ON "seat_holds";
CREATE TRIGGER "seat_holds_audit_s49"
AFTER INSERT OR UPDATE ON "seat_holds"
FOR EACH ROW EXECUTE FUNCTION public.audit_seat_hold_s49();
CREATE TRIGGER "seat_holds_delete_audit_s49"
AFTER DELETE ON "seat_holds"
FOR EACH ROW EXECUTE FUNCTION public.classify_hold_release_audit_s49();
