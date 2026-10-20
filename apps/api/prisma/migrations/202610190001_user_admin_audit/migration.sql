CREATE TABLE "user_admin_audit" (
  "id" UUID NOT NULL PRIMARY KEY,
  "performedById" UUID NOT NULL,
  "targetUserId" UUID NOT NULL,
  "action" TEXT NOT NULL CHECK ("action" IN ('CREATE_EMPLOYEE','CHANGE_ROLE','TOGGLE_STATUS')),
  "oldValue" TEXT,
  "newValue" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "user_admin_audit_targetUserId_createdAt_idx" ON "user_admin_audit"("targetUserId","createdAt");
