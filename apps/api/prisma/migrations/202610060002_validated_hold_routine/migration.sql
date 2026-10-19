-- Validation must execute before the pipelined COMMIT on the same connection.
-- Any rejection RAISEs, aborting the entire transaction including v1 writes.
CREATE FUNCTION public.claim_hold_v2(
  p_show uuid, p_user uuid, p_session text, p_seats uuid[], p_id uuid, p_token uuid
)
RETURNS TABLE (
  status text, valid integer, "claimedSeatIds" uuid[],
  "serverTime" timestamptz, id uuid, "expiresAt" timestamptz, "seatIds" uuid[]
)
LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  result record;
  rejected uuid[];
BEGIN
  SELECT * INTO result FROM public.claim_hold_v1(p_show,p_user,p_session,p_seats,p_id,p_token);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hold show missing' USING ERRCODE='H0001';
  END IF;
  IF result.status <> 'ON_SALE' THEN
    RAISE EXCEPTION 'Hold show closed' USING ERRCODE='H0002';
  END IF;
  IF result.valid <> cardinality(p_seats) THEN
    RAISE EXCEPTION 'Hold seats invalid or unpriced' USING ERRCODE='H0003';
  END IF;
  IF cardinality(result."claimedSeatIds") <> cardinality(p_seats) THEN
    SELECT array_agg(x ORDER BY x) INTO rejected
      FROM unnest(p_seats) AS x WHERE NOT (x=ANY(result."claimedSeatIds"));
    RAISE EXCEPTION 'Hold seat conflict' USING ERRCODE='H0004',
      DETAIL=array_to_json(rejected)::text;
  END IF;
  IF result.id IS NULL OR result."expiresAt" IS NULL OR cardinality(result."seatIds")=0 THEN
    RAISE EXCEPTION 'Hold expired after lock wait' USING ERRCODE='H0005';
  END IF;
  RETURN QUERY SELECT result.status,result.valid,result."claimedSeatIds",result."serverTime",
    result.id,result."expiresAt",result."seatIds";
END;
$function$;
