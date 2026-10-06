-- Reduce API round trips, not business checks. The caller retains its bounded
-- transaction and rolls back when status/count/live state is rejected.
-- VOLATILE is essential: the second query sees a fresh snapshot after lock waits.
CREATE FUNCTION public.claim_hold_v1(
  p_show uuid, p_user uuid, p_session text, p_seats uuid[],
  p_id uuid, p_token uuid
)
RETURNS TABLE (
  status text, valid integer, "claimedSeatIds" uuid[],
  "serverTime" timestamptz, id uuid, "expiresAt" timestamptz, "seatIds" uuid[]
)
LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  claim_result record;
BEGIN
  IF cardinality(p_seats) IS NULL OR cardinality(p_seats) NOT BETWEEN 1 AND 2000
     OR EXISTS (SELECT 1 FROM unnest(p_seats) AS x WHERE x IS NULL)
     OR cardinality(p_seats) <> (SELECT count(DISTINCT x) FROM unnest(p_seats) AS x)
  THEN
    RAISE EXCEPTION 'Invalid seat list' USING ERRCODE = '22023';
  END IF;

  WITH requested AS (SELECT p_seats AS ids),
  available_show AS MATERIALIZED (
    SELECT sh.id, sh.status,
      (SELECT count(*)::int FROM public.seats s
       JOIN public.seat_categories c ON c.id=s."categoryId"
       WHERE s."showtimeId"=sh.id AND s.id=ANY(p_seats)
         AND c.price IS NOT NULL) AS valid
    FROM public.showtimes sh WHERE sh.id=p_show FOR SHARE
  ), authority AS (
    INSERT INTO public.hold_sessions AS existing
      (id,"showtimeId","userId","sessionHash",token,"expiresAt","expectedSeatIds")
    SELECT p_id,available_show.id,p_user,p_session,p_token,
      clock_timestamp()+interval '10 minutes',requested.ids
    FROM available_show CROSS JOIN requested
    WHERE available_show.status='ON_SALE' AND available_show.valid=cardinality(p_seats)
    ON CONFLICT ("showtimeId","userId","sessionHash") DO UPDATE SET
      "expectedSeatIds"=CASE
        WHEN existing."expiresAt"<=EXCLUDED."expiresAt"-interval '10 minutes'
          THEN EXCLUDED."expectedSeatIds"
        ELSE ARRAY(SELECT DISTINCT seat_id FROM unnest(existing."expectedSeatIds" ||
          EXCLUDED."expectedSeatIds") AS seat_id ORDER BY seat_id) END,
      token=CASE WHEN existing."expiresAt"<=EXCLUDED."expiresAt"-interval '10 minutes'
        THEN EXCLUDED.token ELSE existing.token END,
      "expiresAt"=CASE WHEN existing."expiresAt"<=EXCLUDED."expiresAt"-interval '10 minutes'
        THEN EXCLUDED."expiresAt" ELSE existing."expiresAt" END
    RETURNING existing.id,existing.token,existing."expiresAt",existing."showtimeId"
  ), claimed AS (
    INSERT INTO public.seat_holds AS existing
      ("seatId","showtimeId","holdSessionId",token,"expiresAt")
    SELECT seat_id,authority."showtimeId",authority.id,authority.token,authority."expiresAt"
    FROM authority CROSS JOIN requested CROSS JOIN unnest(requested.ids) AS seat_id
    ORDER BY seat_id
    ON CONFLICT ("seatId") DO UPDATE SET
      "holdSessionId"=EXCLUDED."holdSessionId",token=EXCLUDED.token,
      "expiresAt"=EXCLUDED."expiresAt",
      "acquiredAt"=CASE WHEN existing.token=EXCLUDED.token
        THEN existing."acquiredAt" ELSE clock_timestamp() END
    WHERE existing."expiresAt"<=clock_timestamp()
      OR (existing."holdSessionId"=EXCLUDED."holdSessionId" AND existing.token=EXCLUDED.token)
    RETURNING existing."seatId"
  )
  SELECT available_show.status::text,available_show.valid,
    COALESCE((SELECT array_agg(claimed."seatId" ORDER BY claimed."seatId") FROM claimed),'{}'::uuid[])
      AS claimed_ids
  INTO claim_result FROM available_show;

  IF NOT FOUND THEN RETURN; END IF;
  -- Separate SQL command deliberately: do not fold into the claim CTE snapshot.
  RETURN QUERY
    SELECT claim_result.status,claim_result.valid,claim_result.claimed_ids,
      clock_timestamp(),hs.id,hs."expiresAt",
      COALESCE(array_agg(h."seatId" ORDER BY h."seatId")
        FILTER (WHERE h."seatId" IS NOT NULL),'{}'::uuid[])
    FROM (SELECT 1) anchor
    LEFT JOIN public.hold_sessions hs ON hs."showtimeId"=p_show
      AND hs."userId"=p_user AND hs."sessionHash"=p_session
      AND hs."expiresAt">clock_timestamp()
    LEFT JOIN public.seat_holds h ON h."holdSessionId"=hs.id
      AND h.token=hs.token AND h."expiresAt">clock_timestamp()
    GROUP BY hs.id,hs."expiresAt";
END;
$function$;
