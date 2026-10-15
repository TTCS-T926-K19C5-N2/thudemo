-- Operational template for a NEW compensating migration, never edit applied history.
-- Populated admission/grant/gate data must be retained: roll back application only.
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM ticket_admissions) OR EXISTS (SELECT 1 FROM check_in_permissions)
    OR EXISTS (SELECT 1 FROM check_in_gates) THEN
    RAISE EXCEPTION 'S31 compensation refused: preserve admission and permission history';
  END IF;
END $$;
DROP TABLE ticket_admissions;
DROP TABLE check_in_permissions;
DROP TABLE check_in_gates;
COMMIT;
