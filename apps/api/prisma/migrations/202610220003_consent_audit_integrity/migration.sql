-- Original consent table allowed GRANTED only; erasure records withdrawal.
ALTER TABLE registration_consents DROP CONSTRAINT registration_consents_status_check;
ALTER TABLE registration_consents ADD CONSTRAINT registration_consents_status_check CHECK(status IN ('GRANTED','WITHDRAWN'));
ALTER TABLE consent_events ADD COLUMN "eventNo" serial NOT NULL;
CREATE UNIQUE INDEX "consent_events_eventNo_key" ON consent_events("eventNo");
CREATE FUNCTION public.protect_domain_audit() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN RAISE EXCEPTION 'Domain audit entries are append-only' USING ERRCODE='42501'; END $fn$;
CREATE TRIGGER domain_audit_append_only BEFORE UPDATE OR DELETE ON domain_audit FOR EACH ROW EXECUTE FUNCTION public.protect_domain_audit();
