-- The lookup index did not improve the full HTTP workload reliably.
-- Compensate it forward; keep both applied files immutable for audit/replay.
DROP INDEX public.hold_sessions_account_round_lookup;
