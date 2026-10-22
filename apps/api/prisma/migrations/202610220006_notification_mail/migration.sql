-- Reuse the durable, leased delivery queue for business notifications.
-- NULL retains the existing PAID/resend ticket-mail contract.
ALTER TABLE ticket_mail_deliveries ADD COLUMN notification jsonb;
