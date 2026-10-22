CREATE INDEX ticket_logs_revoked_qr ON ticket_logs ((detail->>'revokedQrId'))
WHERE action='TRANSFERRED';
