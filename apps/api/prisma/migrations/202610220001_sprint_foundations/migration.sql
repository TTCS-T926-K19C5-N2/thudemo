-- Additive migration: preserves the catalogue, existing tickets and QR keys.
CREATE TABLE domain_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "entityType" text NOT NULL, "entityId" uuid NOT NULL, "orderId" uuid,
  "actorId" uuid, "actorType" text NOT NULL, action text NOT NULL,
  "beforeState" jsonb, "afterState" jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX domain_audit_order_time ON domain_audit("orderId", "createdAt");
CREATE INDEX domain_audit_entity_time ON domain_audit("entityId", "createdAt");

CREATE FUNCTION public.audit_domain_state() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE oldrow jsonb; newrow jsonb; oldstate jsonb; newstate jsonb;
  entity uuid; order_id uuid; actor uuid; field text;
BEGIN
  IF TG_OP <> 'INSERT' THEN oldrow:=to_jsonb(OLD); END IF;
  IF TG_OP <> 'DELETE' THEN newrow:=to_jsonb(NEW); END IF;
  IF TG_TABLE_NAME='seat_holds' THEN
    entity:=COALESCE(newrow,oldrow)->>'holdSessionId';
  ELSE entity:=COALESCE(newrow,oldrow)->>'id'; END IF;
  FOREACH field IN ARRAY ARRAY['status','expiresAt','checkedInAt','cancelledAt','seatId','expectedSeatIds'] LOOP
    IF oldrow ? field THEN oldstate:=COALESCE(oldstate,'{}'::jsonb)||jsonb_build_object(field,oldrow->field); END IF;
    IF newrow ? field THEN newstate:=COALESCE(newstate,'{}'::jsonb)||jsonb_build_object(field,newrow->field); END IF;
  END LOOP;
  IF TG_OP='UPDATE' AND oldstate IS NOT DISTINCT FROM newstate THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME='orders' THEN order_id:=entity;
  ELSIF TG_TABLE_NAME IN ('tickets','refunds') THEN order_id:=COALESCE(newrow,oldrow)->>'orderId';
  ELSE SELECT o.id INTO order_id FROM orders o WHERE o."holdSessionId"=entity ORDER BY o."createdAt" DESC LIMIT 1;
  END IF;
  actor:=NULLIF(current_setting('app.actor_id',true),'')::uuid;
  INSERT INTO domain_audit("entityType","entityId","orderId","actorId","actorType",action,"beforeState","afterState")
  VALUES(TG_TABLE_NAME,entity,order_id,actor,CASE WHEN actor IS NULL THEN 'SYSTEM' ELSE 'USER' END,TG_OP,oldstate,newstate);
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER audit_order_state AFTER INSERT OR UPDATE OR DELETE ON orders FOR EACH ROW EXECUTE FUNCTION public.audit_domain_state();
CREATE TRIGGER audit_ticket_state AFTER INSERT OR UPDATE OR DELETE ON tickets FOR EACH ROW EXECUTE FUNCTION public.audit_domain_state();
CREATE TRIGGER audit_hold_state AFTER INSERT OR UPDATE OR DELETE ON hold_sessions FOR EACH ROW EXECUTE FUNCTION public.audit_domain_state();
CREATE TRIGGER audit_claim_state AFTER INSERT OR UPDATE OR DELETE ON seat_holds FOR EACH ROW EXECUTE FUNCTION public.audit_domain_state();

-- Serialize same-account claims against checkout's existing user row lock.
-- Count distinct seats once across holds, pending checkout and paid orders.
CREATE FUNCTION public.claim_hold_v5(
  p_show uuid,p_user uuid,p_session text,p_seats uuid[],p_id uuid,p_token uuid
) RETURNS TABLE(failure text,"rejectedSeatIds" uuid[],"serverTime" timestamptz,id uuid,"expiresAt" timestamptz,"seatIds" uuid[])
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog,public AS $fn$
DECLARE cap integer; owned integer; demo boolean;
BEGIN
  PERFORM 1 FROM public.users u WHERE u.id=p_user FOR UPDATE;
  PERFORM set_config('app.actor_id',p_user::text,true);
  SELECT sh."maxTicketsPerUser",sh."isDemo" INTO cap,demo FROM public.showtimes sh WHERE sh.id=p_show FOR SHARE;
  IF demo THEN
    RETURN QUERY SELECT 'H0008'::text,p_seats,clock_timestamp(),NULL::uuid,NULL::timestamptz,'{}'::uuid[]; RETURN;
  END IF;
  IF cap IS NOT NULL THEN
    SELECT count(*)::integer INTO owned FROM (
      SELECT h."seatId" FROM public.seat_holds h JOIN public.hold_sessions hs ON hs.id=h."holdSessionId"
        WHERE hs."userId"=p_user AND h."showtimeId"=p_show AND h."expiresAt">clock_timestamp()
      UNION SELECT oi."seatId" FROM public.order_items oi JOIN public.orders o ON o.id=oi."orderId"
        WHERE o."userId"=p_user AND o."showtimeId"=p_show AND (o.status IN ('PAID','NEEDS_REVIEW') OR (o.status IN ('PENDING','PENDING_PAYMENT') AND o."paymentExpiresAt">clock_timestamp()))
      UNION SELECT unnest(p_seats)
    ) inventory;
    IF owned>cap THEN
      RETURN QUERY SELECT 'H0007'::text,p_seats,clock_timestamp(),NULL::uuid,NULL::timestamptz,'{}'::uuid[]; RETURN;
    END IF;
  END IF;
  RETURN QUERY SELECT * FROM public.claim_hold_v4(p_show,p_user,p_session,p_seats,p_id,p_token);
END $fn$;
