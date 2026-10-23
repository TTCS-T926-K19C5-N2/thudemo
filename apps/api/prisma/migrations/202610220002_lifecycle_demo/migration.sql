CREATE TABLE refunds (
 id uuid PRIMARY KEY, "orderId" uuid NOT NULL UNIQUE REFERENCES orders(id),
 amount integer NOT NULL CHECK(amount>=0), status text NOT NULL DEFAULT 'QUEUED' CHECK(status IN ('QUEUED','SENDING','SUCCEEDED','FAILED','UNKNOWN')),
 reason text NOT NULL, "actorId" uuid NOT NULL REFERENCES users(id), attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3),
 "nextAttemptAt" timestamptz NOT NULL DEFAULT now(), "leaseUntil" timestamptz, "leaseToken" uuid,
 "providerRef" text UNIQUE, "failureCode" text, "completedAt" timestamptz,
 "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "refunds_status_nextAttemptAt_idx" ON refunds(status,"nextAttemptAt");
CREATE TABLE refund_attempts(id uuid PRIMARY KEY,"refundId" uuid NOT NULL REFERENCES refunds(id),attempt integer NOT NULL,status text NOT NULL,reason text,"createdAt" timestamptz NOT NULL DEFAULT now(),UNIQUE("refundId",attempt));
CREATE TABLE showtime_cancellations("showtimeId" uuid PRIMARY KEY REFERENCES showtimes(id),"actorId" uuid NOT NULL REFERENCES users(id),reason text NOT NULL,status text NOT NULL DEFAULT 'QUEUED',"failureCode" text,"createdAt" timestamptz NOT NULL DEFAULT now(),"updatedAt" timestamptz NOT NULL DEFAULT now());
CREATE TABLE operation_mail(id uuid PRIMARY KEY,"orderId" uuid NOT NULL UNIQUE REFERENCES orders(id),status text NOT NULL DEFAULT 'QUEUED',attempts integer NOT NULL DEFAULT 0,"nextAttemptAt" timestamptz NOT NULL DEFAULT now(),"leaseUntil" timestamptz,"leaseToken" uuid,"createdAt" timestamptz NOT NULL DEFAULT now(),"sentAt" timestamptz);
CREATE TABLE reconciliation_runs(id uuid PRIMARY KEY,"fileHash" text NOT NULL UNIQUE,"actorId" uuid NOT NULL REFERENCES users(id),"periodStart" timestamptz NOT NULL,"periodEnd" timestamptz NOT NULL,result jsonb NOT NULL,"createdAt" timestamptz NOT NULL DEFAULT now());
CREATE TABLE consent_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),"userId" uuid NOT NULL REFERENCES users(id),purpose text NOT NULL,version text NOT NULL,status text NOT NULL,"createdAt" timestamptz NOT NULL DEFAULT now());
CREATE INDEX "consent_events_userId_createdAt_idx" ON consent_events("userId","createdAt");
INSERT INTO consent_events("userId",purpose,version,status,"createdAt") SELECT "userId",'SERVICE',"noticeVersion",status,"acceptedAt" FROM registration_consents;
CREATE FUNCTION public.record_registration_consent() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
 INSERT INTO consent_events("userId",purpose,version,status,"createdAt") VALUES(NEW."userId",'SERVICE',NEW."noticeVersion",NEW.status,NEW."acceptedAt"); RETURN NEW;
END $fn$;
CREATE TRIGGER consent_registration_history AFTER INSERT ON registration_consents FOR EACH ROW EXECUTE FUNCTION public.record_registration_consent();
CREATE TABLE erasure_requests("userId" uuid PRIMARY KEY REFERENCES users(id),status text NOT NULL DEFAULT 'REQUESTED',"approvedBy" uuid REFERENCES users(id),"createdAt" timestamptz NOT NULL DEFAULT now(),"completedAt" timestamptz);
CREATE TRIGGER audit_refund_state AFTER INSERT OR UPDATE ON refunds FOR EACH ROW EXECUTE FUNCTION public.audit_domain_state();
