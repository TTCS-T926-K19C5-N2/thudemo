-- S-31 STORAGE PROOF ONLY. Not a production migration or scanner implementation.
-- Ticket, QR verification and scoped staff authorization do not exist on main.
-- Keep this fixture isolated until the S-30 contract and PO policy are available.
CREATE SCHEMA s31_verification;

CREATE TABLE s31_verification.tickets (
  id uuid PRIMARY KEY,
  showtime_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('VALID', 'CANCELLED'))
);

CREATE TABLE s31_verification.admissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES s31_verification.tickets(id),
  actor_id uuid NOT NULL,
  actor_name text NOT NULL CHECK (length(btrim(actor_name)) > 0),
  request_id uuid NOT NULL,
  showtime_id uuid NOT NULL,
  gate_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('NORMAL', 'EXCEPTION')),
  reason text,
  entered_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (actor_id, request_id),
  CHECK ((kind = 'NORMAL' AND reason IS NULL) OR
    (kind = 'EXCEPTION' AND reason IS NOT NULL AND
     reason !~ '^[[:space:]]*$' AND length(reason) BETWEEN 1 AND 500))
);

CREATE UNIQUE INDEX s31_one_normal_admission
  ON s31_verification.admissions(ticket_id) WHERE kind = 'NORMAL';

-- No HTTP endpoint calls this function. actor/name are trusted-server inputs
-- in the proposed integration, never browser-supplied identity.
-- Ticket used state is derived from the NORMAL ledger row; no dual-write flag.
CREATE FUNCTION s31_verification.admit_normal(
  ticket uuid, showtime uuid, gate text, actor uuid, actor_name text, request uuid
) RETURNS TABLE (code text, first_entered_at timestamptz, first_gate text, admission_id uuid)
LANGUAGE plpgsql AS $$
DECLARE
  candidate s31_verification.tickets%ROWTYPE;
  previous s31_verification.admissions%ROWTYPE;
  recorded s31_verification.admissions%ROWTYPE;
BEGIN
  SELECT * INTO candidate FROM s31_verification.tickets WHERE id = ticket FOR UPDATE;
  IF NOT FOUND OR candidate.showtime_id <> showtime OR candidate.status <> 'VALID' THEN
    RETURN QUERY SELECT 'TICKET_NOT_ELIGIBLE'::text, NULL::timestamptz, NULL::text, NULL::uuid;
    RETURN;
  END IF;

  SELECT * INTO previous FROM s31_verification.admissions
    WHERE actor_id = actor AND request_id = request;
  IF FOUND THEN
    IF previous.ticket_id = ticket AND previous.showtime_id = showtime
       AND previous.gate_id = gate AND previous.kind = 'NORMAL' THEN
      RETURN QUERY SELECT 'ALREADY_RECORDED'::text, previous.entered_at, previous.gate_id, previous.id;
    ELSE
      RETURN QUERY SELECT 'REQUEST_CONFLICT'::text, NULL::timestamptz, NULL::text, NULL::uuid;
    END IF;
    RETURN;
  END IF;

  SELECT * INTO recorded FROM s31_verification.admissions
    WHERE ticket_id = ticket AND kind = 'NORMAL';
  IF FOUND THEN
    RETURN QUERY SELECT 'TICKET_ALREADY_USED'::text, recorded.entered_at, recorded.gate_id, recorded.id;
    RETURN;
  END IF;

  -- Partial unique index also protects against writers not using the lock.
  -- ON CONFLICT avoids aborting the caller's transaction on a racing insert.
  INSERT INTO s31_verification.admissions
    (ticket_id, showtime_id, gate_id, actor_id, actor_name, request_id, kind)
    VALUES (ticket, showtime, gate, actor, actor_name, request, 'NORMAL')
    ON CONFLICT DO NOTHING RETURNING * INTO recorded;
  IF FOUND THEN
    RETURN QUERY SELECT 'ADMITTED'::text, recorded.entered_at, recorded.gate_id, recorded.id;
    RETURN;
  END IF;

  SELECT * INTO previous FROM s31_verification.admissions
    WHERE actor_id = actor AND request_id = request;
  IF FOUND THEN
    RETURN QUERY SELECT 'REQUEST_CONFLICT'::text, NULL::timestamptz, NULL::text, NULL::uuid;
  ELSE
    SELECT * INTO recorded FROM s31_verification.admissions
      WHERE ticket_id = ticket AND kind = 'NORMAL';
    RETURN QUERY SELECT 'TICKET_ALREADY_USED'::text, recorded.entered_at, recorded.gate_id, recorded.id;
  END IF;
END;
$$;

REVOKE ALL ON SCHEMA s31_verification FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA s31_verification FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA s31_verification FROM PUBLIC;
