-- Expected business rejections are outcomes, not 1000 server log errors per
-- burst. The exception subtransaction rolls back every write before returning.
CREATE FUNCTION public.claim_hold_v3(
  p_show uuid, p_user uuid, p_session text, p_seats uuid[], p_id uuid, p_token uuid
)
RETURNS TABLE (
  failure text, "rejectedSeatIds" uuid[], "serverTime" timestamptz,
  id uuid, "expiresAt" timestamptz, "seatIds" uuid[]
)
LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  result record;
  error_code text;
  error_constraint text;
BEGIN
  BEGIN
    SELECT * INTO result FROM public.claim_hold_v1(p_show,p_user,p_session,p_seats,p_id,p_token);
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='H0001'; END IF;
    IF result.status <> 'ON_SALE' THEN RAISE EXCEPTION USING ERRCODE='H0002'; END IF;
    IF result.valid <> cardinality(p_seats) THEN RAISE EXCEPTION USING ERRCODE='H0003'; END IF;
    IF cardinality(result."claimedSeatIds") <> cardinality(p_seats) THEN
      SELECT array_agg(x ORDER BY x) INTO "rejectedSeatIds"
        FROM unnest(p_seats) AS x WHERE NOT (x=ANY(result."claimedSeatIds"));
      RAISE EXCEPTION USING ERRCODE='H0004';
    END IF;
    IF result.id IS NULL OR result."expiresAt" IS NULL OR cardinality(result."seatIds")=0 THEN
      RAISE EXCEPTION USING ERRCODE='H0005';
    END IF;
    "serverTime" := result."serverTime";
    id := result.id;
    "expiresAt" := result."expiresAt";
    "seatIds" := result."seatIds";
    "rejectedSeatIds" := '{}'::uuid[];
  EXCEPTION
    WHEN SQLSTATE 'H0001' OR SQLSTATE 'H0002' OR SQLSTATE 'H0003'
      OR SQLSTATE 'H0004' OR SQLSTATE 'H0005' THEN
      GET STACKED DIAGNOSTICS error_code = RETURNED_SQLSTATE;
      failure := error_code;
      -- Variables survive the subtransaction; database writes do not.
    WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS error_constraint = CONSTRAINT_NAME;
      IF error_constraint IS DISTINCT FROM 'seat_holds_seatId_showtimeId_key' THEN RAISE; END IF;
      -- Fresh query AFTER rollback, same ownership predicate as the API fallback.
      SELECT COALESCE(array_agg(h."seatId" ORDER BY h."seatId"),'{}'::uuid[])
      INTO "rejectedSeatIds" FROM public.seat_holds h
      JOIN public.hold_sessions hs ON hs.id=h."holdSessionId"
      WHERE h."seatId"=ANY(p_seats) AND h."expiresAt">clock_timestamp()
        AND NOT (hs."userId"=p_user AND hs."sessionHash"=p_session);
      failure := CASE WHEN cardinality("rejectedSeatIds")>0 THEN 'H0004' ELSE 'H0006' END;
  END;
  IF failure IS NOT NULL THEN
    id := NULL;
    "expiresAt" := NULL;
    "seatIds" := '{}'::uuid[];
    "serverTime" := clock_timestamp();
    "rejectedSeatIds" := COALESCE("rejectedSeatIds",p_seats);
  END IF;
  RETURN NEXT;
END;
$function$;
