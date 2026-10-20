-- S-54: Consent management and history (SCRUM-264)
CREATE TABLE "user_consents" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "type" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'GRANTED' CHECK ("status" IN ('GRANTED', 'REVOKED')),
  "consentedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "user_consents_userId_type_key" ON "user_consents"("userId", "type");
CREATE INDEX "user_consents_userId_status_idx" ON "user_consents"("userId", "status");

CREATE TABLE "user_consent_history" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "type" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "action" TEXT NOT NULL CHECK ("action" IN ('GRANTED', 'REVOKED')),
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "user_consent_history_userId_createdAt_idx" ON "user_consent_history"("userId", "createdAt");
CREATE INDEX "user_consent_history_userId_type_idx" ON "user_consent_history"("userId", "type");

-- Backfill from existing registration_consents for backward compatibility
INSERT INTO "user_consents" ("id", "userId", "type", "version", "status", "consentedAt", "createdAt", "updatedAt")
SELECT gen_random_uuid(), "userId", 'PRIVACY_POLICY', "noticeVersion", "status", "acceptedAt", "acceptedAt", "acceptedAt"
FROM "registration_consents"
ON CONFLICT ("userId", "type") DO NOTHING;

INSERT INTO "user_consent_history" ("id", "userId", "type", "version", "action", "createdAt")
SELECT gen_random_uuid(), "userId", 'PRIVACY_POLICY', "noticeVersion", 'GRANTED', "acceptedAt"
FROM "registration_consents";
