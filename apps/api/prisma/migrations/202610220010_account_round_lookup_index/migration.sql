-- Cover account recovery's latest-round lookup and active-round prefix.
-- Non-unique: legacy split rounds must remain detectable, never silently removed.
CREATE INDEX hold_sessions_account_round_lookup
ON public.hold_sessions ("showtimeId", "userId", "expiresAt" DESC, id DESC)
INCLUDE ("sessionHash");
