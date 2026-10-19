-- Account owns the booking round; sessionHash remains a legacy row locator,
-- never an authorization credential. Keep all older routines for code rollback.
-- No historical claim, order, deadline, token, constraint or data is rewritten.
CREATE FUNCTION public.claim_hold_v5(
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
  active_rounds integer;
  round_locator text;
BEGIN
  -- Same first lock as createFromHold: claims from different login sessions
  -- cannot create separate rounds, or race order creation within this account.
  PERFORM u.id FROM public.users u WHERE u.id=p_user FOR UPDATE;
  SELECT count(*)::int INTO active_rounds FROM public.hold_sessions hs
    WHERE hs."showtimeId"=p_show AND hs."userId"=p_user
      AND hs."expiresAt">clock_timestamp();
  IF active_rounds>1 THEN
    -- Legacy split rounds are not silently merged/repriced/extended. Keep data
    -- intact and fail closed until the original rounds expire or are resolved.
    RETURN QUERY SELECT 'H0006'::text,p_seats,clock_timestamp(),
      NULL::uuid,NULL::timestamptz,'{}'::uuid[];
    RETURN;
  END IF;
  SELECT hs."sessionHash" INTO round_locator FROM public.hold_sessions hs
    WHERE hs."showtimeId"=p_show AND hs."userId"=p_user
    ORDER BY hs."expiresAt" DESC,hs.id DESC LIMIT 1;
  RETURN QUERY SELECT * FROM public.claim_hold_v4(
    p_show,p_user,COALESCE(round_locator,p_session),p_seats,p_id,p_token);
END;
$function$;
