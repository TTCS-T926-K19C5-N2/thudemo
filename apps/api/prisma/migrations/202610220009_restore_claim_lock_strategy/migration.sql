-- Compensate the isolated row-lock experiment without rewriting its applied migration.
-- Avoid writing and rolling back a new hold_session when a conflicting owner
-- is already visible. This is only a read-only rejection fast path; every
-- possible grant still runs the existing atomic, server-validated v3 routine.
-- Keep v1/v2/v3 for code rollback; no data or constraint is removed.
CREATE OR REPLACE FUNCTION public.claim_hold_v4(
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
  show_status text;
  valid integer;
  rejected uuid[];
BEGIN
  -- Invalid inputs and validation precedence retain the existing v3 contract.
  IF cardinality(p_seats) BETWEEN 1 AND 2000
     AND NOT EXISTS (SELECT 1 FROM unnest(p_seats) AS x WHERE x IS NULL)
     AND cardinality(p_seats)=(SELECT count(DISTINCT x) FROM unnest(p_seats) AS x)
  THEN
    SELECT sh.status::text,
      (SELECT count(*)::int FROM public.seats s
        JOIN public.seat_categories c ON c.id=s."categoryId"
        WHERE s."showtimeId"=sh.id AND s.id=ANY(p_seats) AND c.price IS NOT NULL)
    INTO show_status, valid
    FROM public.showtimes sh WHERE sh.id=p_show FOR SHARE;
    IF show_status='ON_SALE' AND valid=cardinality(p_seats) THEN
      SELECT array_agg(h."seatId" ORDER BY h."seatId") INTO rejected
      FROM public.seat_holds h
      JOIN public.hold_sessions hs ON hs.id=h."holdSessionId"
      WHERE h."seatId"=ANY(p_seats) AND h."expiresAt">clock_timestamp()
        AND NOT (hs."userId"=p_user AND hs."sessionHash"=p_session);
      IF cardinality(rejected)>0 THEN
        RETURN QUERY SELECT 'H0004'::text,rejected,clock_timestamp(),
          NULL::uuid,NULL::timestamptz,'{}'::uuid[];
        RETURN;
      END IF;
    END IF;
  END IF;
  -- Races after the read, mixed sets, expiry and retry remain governed by v3's
  -- constraints, original deadline and rollback subtransaction. No cached grant.
  RETURN QUERY SELECT * FROM public.claim_hold_v3(p_show,p_user,p_session,p_seats,p_id,p_token);
END;
$function$;
