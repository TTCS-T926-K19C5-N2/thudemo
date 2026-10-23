CREATE TYPE "CouponType" AS ENUM ('PERCENT', 'FIXED');
CREATE TYPE "CouponRedemptionStatus" AS ENUM ('RESERVED', 'REDEEMED', 'RELEASED');

CREATE TABLE "coupons" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "eventId" UUID NOT NULL,
  "code" VARCHAR(32) NOT NULL,
  "type" "CouponType" NOT NULL,
  "value" INTEGER NOT NULL,
  "maxUses" INTEGER NOT NULL,
  "startsAt" TIMESTAMPTZ(3) NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "coupons_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "coupons_value_check" CHECK (
    ("type" = 'PERCENT' AND "value" BETWEEN 1 AND 100) OR
    ("type" = 'FIXED' AND "value" > 0)
  ),
  CONSTRAINT "coupons_max_uses_check" CHECK ("maxUses" > 0),
  CONSTRAINT "coupons_validity_check" CHECK ("expiresAt" > "startsAt"),
  CONSTRAINT "coupons_event_fkey" FOREIGN KEY ("eventId")
    REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "coupons_eventId_code_key" ON "coupons"("eventId", "code");
CREATE UNIQUE INDEX "coupons_event_code_ci_key" ON "coupons"("eventId", upper("code"));
CREATE INDEX "coupons_event_active_validity_idx" ON "coupons"("eventId", "isActive", "startsAt", "expiresAt");

ALTER TABLE "orders"
  ADD COLUMN "subtotalAmount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "discountAmount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "couponCodeSnapshot" TEXT,
  ADD COLUMN "couponTypeSnapshot" TEXT,
  ADD COLUMN "couponValueSnapshot" INTEGER,
  ADD COLUMN "couponId" UUID;

UPDATE "orders"
SET "subtotalAmount" = "totalAmount", "discountAmount" = 0
WHERE "subtotalAmount" = 0 AND "totalAmount" > 0;

CREATE FUNCTION set_legacy_order_subtotal_snapshot() RETURNS trigger AS $$
BEGIN
  IF NEW."couponId" IS NULL AND NEW."discountAmount" = 0
     AND NEW."subtotalAmount" = 0 AND NEW."totalAmount" > 0 THEN
    NEW."subtotalAmount" := NEW."totalAmount";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER orders_legacy_subtotal_snapshot
  BEFORE INSERT OR UPDATE OF "subtotalAmount", "discountAmount", "totalAmount", "couponId"
  ON "orders"
  FOR EACH ROW EXECUTE FUNCTION set_legacy_order_subtotal_snapshot();

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_coupon_amount_check" CHECK (
    "subtotalAmount" >= 0 AND "discountAmount" >= 0 AND
    "discountAmount" <= "subtotalAmount" AND
    "totalAmount" = "subtotalAmount" - "discountAmount"
  ),
  ADD CONSTRAINT "orders_coupon_fkey" FOREIGN KEY ("couponId")
    REFERENCES "coupons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "orders_couponId_idx" ON "orders"("couponId");

CREATE TABLE "coupon_redemptions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "couponId" UUID NOT NULL,
  "orderId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "status" "CouponRedemptionStatus" NOT NULL DEFAULT 'RESERVED',
  "discountAmount" INTEGER NOT NULL,
  "codeSnapshot" VARCHAR(32) NOT NULL,
  "reservedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "redeemedAt" TIMESTAMPTZ(3),
  "releasedAt" TIMESTAMPTZ(3),
  CONSTRAINT "coupon_redemptions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "coupon_redemptions_discount_check" CHECK ("discountAmount" >= 0),
  CONSTRAINT "coupon_redemptions_orderId_key" UNIQUE ("orderId"),
  CONSTRAINT "coupon_redemptions_coupon_fkey" FOREIGN KEY ("couponId")
    REFERENCES "coupons"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "coupon_redemptions_order_fkey" FOREIGN KEY ("orderId")
    REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "coupon_redemptions_user_fkey" FOREIGN KEY ("userId")
    REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "coupon_redemptions_coupon_status_idx" ON "coupon_redemptions"("couponId", "status");
CREATE INDEX "coupon_redemptions_user_reserved_idx" ON "coupon_redemptions"("userId", "reservedAt");
