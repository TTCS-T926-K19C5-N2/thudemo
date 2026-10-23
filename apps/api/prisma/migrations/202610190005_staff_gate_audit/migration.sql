-- Preserve all existing audit rows and action checks while allowing the
-- capability changes required to operate S-29/S-31 through the admin UI.
BEGIN;
ALTER TABLE "user_admin_audit" DROP CONSTRAINT "user_admin_audit_action_check";
ALTER TABLE "user_admin_audit" ADD CONSTRAINT "user_admin_audit_action_check"
  CHECK ("action" IN ('CREATE_EMPLOYEE','CHANGE_ROLE','TOGGLE_STATUS','ASSIGN_GATE','REVOKE_GATE'));
COMMIT;
