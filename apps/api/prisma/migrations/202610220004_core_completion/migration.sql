-- Reconcile the legacy demo flag if a fresh checkout did not contain its old addition.
ALTER TABLE showtimes ADD COLUMN IF NOT EXISTS "isDemo" boolean NOT NULL DEFAULT false;
ALTER TABLE showtimes ADD COLUMN "scheduleVersion" integer NOT NULL DEFAULT 0;
CREATE TABLE schedule_changes (
 id uuid PRIMARY KEY, "showtimeId" uuid NOT NULL REFERENCES showtimes(id), "actorId" uuid NOT NULL REFERENCES users(id),
 "requestId" uuid NOT NULL UNIQUE, "oldTime" timestamptz NOT NULL, "newTime" timestamptz NOT NULL,
 reason text NOT NULL, version integer NOT NULL, "createdAt" timestamptz NOT NULL DEFAULT now(),
 UNIQUE("showtimeId",version)
);
CREATE TABLE notification_mail (
 id uuid PRIMARY KEY, "orderId" uuid NOT NULL REFERENCES orders(id), "recipientId" uuid NOT NULL REFERENCES users(id),
 "showtimeId" uuid NOT NULL REFERENCES showtimes(id), kind text NOT NULL CHECK(kind IN ('REMINDER','RESCHEDULED')),
 version integer NOT NULL, "changeId" uuid REFERENCES schedule_changes(id), "dedupeKey" text NOT NULL UNIQUE,
 "parentId" uuid REFERENCES notification_mail(id), status text NOT NULL DEFAULT 'QUEUED' CHECK(status IN ('QUEUED','SENDING','SENT','FAILED','CANCELLED')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3), "nextAttemptAt" timestamptz NOT NULL DEFAULT now(),
 "leaseToken" uuid, "leaseUntil" timestamptz, "failureCode" text, "sentAt" timestamptz,
 "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notification_mail_due ON notification_mail(status,"nextAttemptAt");
CREATE TABLE password_resets (
 "tokenHash" text PRIMARY KEY, "userId" uuid NOT NULL REFERENCES users(id), "encryptedToken" text NOT NULL,
 "expiresAt" timestamptz NOT NULL, "consumedAt" timestamptz, status text NOT NULL DEFAULT 'QUEUED',
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3), "nextAttemptAt" timestamptz NOT NULL DEFAULT now(),
 "leaseToken" uuid, "leaseUntil" timestamptz, "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX password_resets_user ON password_resets("userId");
CREATE INDEX password_resets_due ON password_resets(status,"nextAttemptAt");
CREATE TABLE mail_retry_requests (
 "requestId" uuid PRIMARY KEY, "actorId" uuid NOT NULL REFERENCES users(id), "sourceId" uuid NOT NULL,
 kind text NOT NULL, "deliveryId" uuid NOT NULL, "createdAt" timestamptz NOT NULL DEFAULT now()
);
