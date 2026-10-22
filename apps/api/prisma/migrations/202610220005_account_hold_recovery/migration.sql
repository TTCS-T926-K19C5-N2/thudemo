-- Account owns a booking round across authenticated sessions. Keep prior
-- routines for rollback and preserve every existing token and original expiry.
CREATE FUNCTION public.claim_hold_v6(
  p_show uuid,p_user uuid,p_session text,p_seats uuid[],p_id uuid,p_token uuid
) RETURNS TABLE(failure text,"rejectedSeatIds" uuid[],"serverTime" timestamptz,id uuid,"expiresAt" timestamptz,"seatIds" uuid[])
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog,public AS $fn$
DECLARE active_rounds integer; round_locator text;
BEGIN
  PERFORM u.id FROM public.users u WHERE u.id=p_user FOR UPDATE;
  SELECT count(*)::integer INTO active_rounds FROM public.hold_sessions hs
    WHERE hs."showtimeId"=p_show AND hs."userId"=p_user
      AND hs."expiresAt">clock_timestamp();
  IF active_rounds>1 THEN
    RETURN QUERY SELECT 'H0006'::text,p_seats,clock_timestamp(),NULL::uuid,NULL::timestamptz,'{}'::uuid[];
    RETURN;
  END IF;
  SELECT hs."sessionHash" INTO round_locator FROM public.hold_sessions hs
    WHERE hs."showtimeId"=p_show AND hs."userId"=p_user
    ORDER BY hs."expiresAt" DESC,hs.id DESC LIMIT 1;
  -- v5 still enforces quota, demo-mode rejection and actor audit under the
  -- same account lock; v4 retains the original claim/expiry/fencing rules.
  RETURN QUERY SELECT * FROM public.claim_hold_v5(
    p_show,p_user,COALESCE(round_locator,p_session),p_seats,p_id,p_token);
END $fn$;
