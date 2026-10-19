-- Additive S03 schema. Existing accounts/roles/sessions/history are retained.
ALTER TABLE "users" ADD COLUMN "fullName" TEXT;

CREATE TABLE "registration_consents" (
  "userId" UUID PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "noticeVersion" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "status" TEXT NOT NULL CHECK ("status" = 'GRANTED'),
  "acceptedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "activation_tokens" (
  "tokenHash" TEXT PRIMARY KEY CHECK ("tokenHash" ~ '^[a-f0-9]{64}$'),
  "userId" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "consumedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "activation_tokens_userId_idx" ON "activation_tokens"("userId");

-- Preserve the validity/deadline of previously issued links without retaining
-- plaintext tokens. PostgreSQL15's built-in sha256(bytea) needs no extension.
INSERT INTO "activation_tokens" ("tokenHash", "userId", "expiresAt", "consumedAt")
SELECT encode(sha256(convert_to("activationToken", 'UTF8')), 'hex'), "id",
       "activationExpires", CASE WHEN "isEmailVerified" THEN CURRENT_TIMESTAMP END
FROM "users" WHERE "activationToken" IS NOT NULL AND "activationExpires" IS NOT NULL;
-- Keep the legacy columns for schema compatibility; all new issuance uses hashes.
UPDATE "users" SET "activationToken" = NULL, "activationExpires" = NULL
WHERE "activationToken" IS NOT NULL OR "activationExpires" IS NOT NULL;

CREATE TABLE "activation_mail" (
  "id" UUID PRIMARY KEY,
  "tokenHash" TEXT NOT NULL UNIQUE REFERENCES "activation_tokens"("tokenHash") ON DELETE CASCADE,
  "encryptedToken" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'QUEUED'
    CHECK ("status" IN ('QUEUED', 'SENDING', 'SENT', 'FAILED', 'CANCELLED')),
  "attempts" INTEGER NOT NULL DEFAULT 0 CHECK ("attempts" >= 0),
  "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseUntil" TIMESTAMPTZ(3),
  "sentAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL
);
CREATE INDEX "activation_mail_status_nextAttemptAt_idx" ON "activation_mail"("status", "nextAttemptAt");
