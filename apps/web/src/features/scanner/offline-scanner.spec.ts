import { describe, expect, it, vi, beforeEach } from 'vitest';
import { generateKeyPairSync, sign } from 'node:crypto';
import { ticketQrInput } from 'shared/ticket-qr';
import { processOfflineScan } from './offline-scanner';
import * as scannerDb from './scanner-db';
import * as scannerApi from './scanner-api';
import { syncOfflineScanQueue } from './scanner-sync';

// Generate a valid Ed25519 keypair for signing test QRs
const testKeyPair = generateKeyPairSync('ed25519');
const testPublicKeyPem = testKeyPair.publicKey
  .export({ type: 'spki', format: 'pem' })
  .toString()
  .trim();

function createSignedQr(
  ticketId: string,
  showtimeId: string,
  keyId = 'key-test-1',
  privateKey = testKeyPair.privateKey,
): string {
  const input = ticketQrInput({
    keyId,
    showtimeId,
    ticketId,
  });
  const sig = sign(null, Buffer.from(input, 'ascii'), privateKey).toString('base64url');
  return `${input}.${sig}`;
}

describe('S-34 Offline Scanner (processOfflineScan & syncOfflineScanQueue)', () => {
  const showtimeId = '11111111-1111-4111-8111-111111111111';
  const otherShowtimeId = '22222222-2222-4222-8222-222222222222';
  const ticketId = '33333333-3333-4333-8333-333333333333';

  beforeEach(() => {
    vi.restoreAllMocks();
    if (typeof navigator !== 'undefined') {
      Object.defineProperty(navigator, 'onLine', {
        value: true,
        configurable: true,
        writable: true,
      });
    }
  });

  describe('8-Step Offline Scan Validation Order', () => {
    it('Step 1 (AC #4): returns NO_LIST_OFFLINE when showtime list has not been downloaded', async () => {
      vi.spyOn(scannerDb, 'getShowtimeMeta').mockResolvedValue(null);

      const qrPayload = createSignedQr(ticketId, showtimeId);
      const outcome = await processOfflineScan({
        showtimeId,
        qrPayload,
      });

      expect(outcome.success).toBe(false);
      expect(outcome.code).toBe('NO_LIST_OFFLINE');
      expect(outcome.message).toContain('Không soát được');
      expect(outcome.message).toContain('Tải danh sách');
    });

    it('Step 1 (AC #4): returns NO_LIST_OFFLINE when ticketCount is 0', async () => {
      vi.spyOn(scannerDb, 'getShowtimeMeta').mockResolvedValue({
        showtimeId,
        showtimeName: 'Test Showtime',
        downloadedAt: new Date().toISOString(),
        lastSyncAt: new Date().toISOString(),
        cursor: 'cur-0',
        ticketCount: 0,
        keyId: 'key-test-1',
        publicKey: testPublicKeyPem,
        status: 'ready',
      });

      const qrPayload = createSignedQr(ticketId, showtimeId);
      const outcome = await processOfflineScan({
        showtimeId,
        qrPayload,
      });

      expect(outcome.success).toBe(false);
      expect(outcome.code).toBe('NO_LIST_OFFLINE');
    });

    it('Step 2: returns INVALID_SIGNATURE when QR is malformed', async () => {
      vi.spyOn(scannerDb, 'getShowtimeMeta').mockResolvedValue({
        showtimeId,
        showtimeName: 'Test Showtime',
        downloadedAt: new Date().toISOString(),
        lastSyncAt: new Date().toISOString(),
        cursor: 'cur-0',
        ticketCount: 10,
        keyId: 'key-test-1',
        publicKey: testPublicKeyPem,
        status: 'ready',
      });

      const outcome = await processOfflineScan({
        showtimeId,
        qrPayload: 'invalid-qr-string',
      });

      expect(outcome.success).toBe(false);
      expect(outcome.code).toBe('INVALID_SIGNATURE');
    });

    it('Step 2: returns INVALID_SIGNATURE when signed by a different key', async () => {
      const otherPair = generateKeyPairSync('ed25519');
      vi.spyOn(scannerDb, 'getShowtimeMeta').mockResolvedValue({
        showtimeId,
        showtimeName: 'Test Showtime',
        downloadedAt: new Date().toISOString(),
        lastSyncAt: new Date().toISOString(),
        cursor: 'cur-0',
        ticketCount: 10,
        keyId: 'key-test-1',
        publicKey: testPublicKeyPem,
        status: 'ready',
      });

      // Signed with otherPair but claiming key-test-1
      const qrPayload = createSignedQr(ticketId, showtimeId, 'key-test-1', otherPair.privateKey);
      const outcome = await processOfflineScan({
        showtimeId,
        qrPayload,
      });

      expect(outcome.success).toBe(false);
      expect(outcome.code).toBe('INVALID_SIGNATURE');
    });

    it('Step 3: returns WRONG_SHOWTIME when QR belongs to a different showtime', async () => {
      vi.spyOn(scannerDb, 'getShowtimeMeta').mockResolvedValue({
        showtimeId,
        showtimeName: 'Test Showtime',
        downloadedAt: new Date().toISOString(),
        lastSyncAt: new Date().toISOString(),
        cursor: 'cur-0',
        ticketCount: 10,
        keyId: 'key-test-1',
        publicKey: testPublicKeyPem,
        status: 'ready',
      });

      const qrPayload = createSignedQr(ticketId, otherShowtimeId);
      const outcome = await processOfflineScan({
        showtimeId,
        qrPayload,
      });

      expect(outcome.success).toBe(false);
      expect(outcome.code).toBe('WRONG_SHOWTIME');
      expect(outcome.message).toContain('Vé không thuộc suất đang soát');
    });

    it('Step 4: returns NOT_IN_LIST when ticket code is not in local IndexedDB', async () => {
      vi.spyOn(scannerDb, 'getShowtimeMeta').mockResolvedValue({
        showtimeId,
        showtimeName: 'Test Showtime',
        downloadedAt: new Date().toISOString(),
        lastSyncAt: new Date().toISOString(),
        cursor: 'cur-0',
        ticketCount: 10,
        keyId: 'key-test-1',
        publicKey: testPublicKeyPem,
        status: 'ready',
      });
      vi.spyOn(scannerDb, 'getTicketByCode').mockResolvedValue(null);

      const qrPayload = createSignedQr(ticketId, showtimeId);
      const outcome = await processOfflineScan({
        showtimeId,
        qrPayload,
      });

      expect(outcome.success).toBe(false);
      expect(outcome.code).toBe('NOT_IN_LIST');
      expect(outcome.message).toContain('Vé không có trong danh sách đã tải');
    });

    it('Step 5: returns CANCELLED when ticket status is cancelled', async () => {
      vi.spyOn(scannerDb, 'getShowtimeMeta').mockResolvedValue({
        showtimeId,
        showtimeName: 'Test Showtime',
        downloadedAt: new Date().toISOString(),
        lastSyncAt: new Date().toISOString(),
        cursor: 'cur-0',
        ticketCount: 10,
        keyId: 'key-test-1',
        publicKey: testPublicKeyPem,
        status: 'ready',
      });
      vi.spyOn(scannerDb, 'getTicketByCode').mockResolvedValue({
        showtimeId,
        code: ticketId,
        status: 'cancelled',
        checkedInAt: null,
        seatLabel: 'A-01',
        ticketType: 'VIP',
      });

      const qrPayload = createSignedQr(ticketId, showtimeId);
      const outcome = await processOfflineScan({
        showtimeId,
        qrPayload,
      });

      expect(outcome.success).toBe(false);
      expect(outcome.code).toBe('CANCELLED');
      expect(outcome.message).toContain('Vé đã bị huỷ');
    });

    it('Step 6 (AC #2): returns ALREADY_CHECKED_IN when ticket was already checked in on server before download', async () => {
      const checkedInTime = '2026-10-12T10:00:00.000Z';
      vi.spyOn(scannerDb, 'getShowtimeMeta').mockResolvedValue({
        showtimeId,
        showtimeName: 'Test Showtime',
        downloadedAt: new Date().toISOString(),
        lastSyncAt: new Date().toISOString(),
        cursor: 'cur-0',
        ticketCount: 10,
        keyId: 'key-test-1',
        publicKey: testPublicKeyPem,
        status: 'ready',
      });
      vi.spyOn(scannerDb, 'getTicketByCode').mockResolvedValue({
        showtimeId,
        code: ticketId,
        status: 'checked_in',
        checkedInAt: checkedInTime,
        seatLabel: 'A-01',
        ticketType: 'VIP',
        localCheckedIn: false,
      });

      const qrPayload = createSignedQr(ticketId, showtimeId);
      const outcome = await processOfflineScan({
        showtimeId,
        qrPayload,
      });

      expect(outcome.success).toBe(false);
      expect(outcome.code).toBe('ALREADY_CHECKED_IN');
      expect(outcome.previousCheckedInAt).toBe(checkedInTime);
      expect(outcome.message).toContain('Vé đã sử dụng');
    });

    it('Step 7 (AC #3): returns DUPLICATE_ON_DEVICE when scanning the same ticket twice offline', async () => {
      vi.spyOn(scannerDb, 'getShowtimeMeta').mockResolvedValue({
        showtimeId,
        showtimeName: 'Test Showtime',
        downloadedAt: new Date().toISOString(),
        lastSyncAt: new Date().toISOString(),
        cursor: 'cur-0',
        ticketCount: 10,
        keyId: 'key-test-1',
        publicKey: testPublicKeyPem,
        status: 'ready',
      });
      // Ticket was already checked in locally on this device
      vi.spyOn(scannerDb, 'getTicketByCode').mockResolvedValue({
        showtimeId,
        code: ticketId,
        status: 'checked_in',
        checkedInAt: '2026-10-12T11:00:00.000Z',
        seatLabel: 'A-01',
        ticketType: 'VIP',
        localCheckedIn: true,
      });

      const qrPayload = createSignedQr(ticketId, showtimeId);
      const outcome = await processOfflineScan({
        showtimeId,
        qrPayload,
      });

      expect(outcome.success).toBe(false);
      expect(outcome.code).toBe('DUPLICATE_ON_DEVICE');
      expect(outcome.message).toContain('DUPLICATE_ON_DEVICE');
    });

    it('Step 8 (AC #1): returns OK, saves to scan_queue and marks ticket checked in locally', async () => {
      vi.spyOn(scannerDb, 'getShowtimeMeta').mockResolvedValue({
        showtimeId,
        showtimeName: 'Test Showtime',
        downloadedAt: new Date().toISOString(),
        lastSyncAt: new Date().toISOString(),
        cursor: 'cur-0',
        ticketCount: 10,
        keyId: 'key-test-1',
        publicKey: testPublicKeyPem,
        status: 'ready',
      });
      vi.spyOn(scannerDb, 'getTicketByCode').mockResolvedValue({
        showtimeId,
        code: ticketId,
        status: 'valid',
        checkedInAt: null,
        seatLabel: 'A-01',
        ticketType: 'VIP',
      });
      vi.spyOn(scannerDb, 'hasOfflineScanForTicket').mockResolvedValue(false);
      const saveSpy = vi.spyOn(scannerDb, 'saveOfflineScanAtomic').mockResolvedValue();

      const qrPayload = createSignedQr(ticketId, showtimeId);
      const outcome = await processOfflineScan({
        showtimeId,
        qrPayload,
        gateId: 'gate-1',
        gateName: 'Cửa VIP',
        deviceId: 'device-test-1',
      });

      expect(outcome.success).toBe(true);
      expect(outcome.code).toBe('OK');
      expect(outcome.ticket?.code).toBe(ticketId);
      expect(outcome.ticket?.seatLabel).toBe('A-01');
      expect(outcome.ticket?.ticketType).toBe('VIP');
      expect(saveSpy).toHaveBeenCalledTimes(1);
      const savedRecord = saveSpy.mock.calls[0][0];
      expect(savedRecord.ticketCode).toBe(ticketId);
      expect(savedRecord.showtimeId).toBe(showtimeId);
      expect(savedRecord.gateId).toBe('gate-1');
      expect(savedRecord.syncStatus).toBe('pending');
      expect(savedRecord.offline).toBe(true);
    });
  });

  describe('Queue Synchronization (syncOfflineScanQueue)', () => {
    it('returns 0 when there are no pending offline scans', async () => {
      vi.spyOn(scannerDb, 'getPendingOfflineScans').mockResolvedValue([]);
      const res = await syncOfflineScanQueue(showtimeId);
      expect(res.syncedCount).toBe(0);
      expect(res.conflictCount).toBe(0);
    });

    it('pushes pending scans to server, marks them synced, and triggers incremental sync', async () => {
      const pendingScans: scannerDb.OfflineScanRecord[] = [
        {
          scanId: 'scan-uuid-1',
          showtimeId,
          ticketCode: ticketId,
          gateId: 'gate-1',
          gateName: 'Cửa 1',
          scannedAt: new Date().toISOString(),
          deviceId: 'device-1',
          staffId: 'staff-1',
          offline: true,
          syncStatus: 'pending',
          seatLabel: 'A-01',
          ticketType: 'VIP',
        },
      ];

      vi.spyOn(scannerDb, 'getPendingOfflineScans').mockResolvedValue(pendingScans);
      const syncApiSpy = vi.spyOn(scannerApi, 'syncOfflineScansApi').mockResolvedValue({
        synced: 1,
        conflicts: [],
        syncedScanIds: ['scan-uuid-1'],
      });
      const markSyncedSpy = vi.spyOn(scannerDb, 'markOfflineScansSynced').mockResolvedValue();
      vi.spyOn(scannerApi, 'fetchShowtimeTickets').mockResolvedValue({
        showtimeId,
        showtimeName: 'Test',
        generatedAt: new Date().toISOString(),
        cursor: 'new-cur',
        publicKey: { keyId: 'k1', key: testPublicKeyPem },
        tickets: [],
      });
      vi.spyOn(scannerDb, 'getShowtimeMeta').mockResolvedValue({
        showtimeId,
        showtimeName: 'Test',
        downloadedAt: new Date().toISOString(),
        lastSyncAt: new Date().toISOString(),
        cursor: 'old-cur',
        ticketCount: 1,
        keyId: 'k1',
        publicKey: testPublicKeyPem,
        status: 'ready',
      });
      vi.spyOn(scannerDb, 'mergeTicketsIncremental').mockResolvedValue({
        showtimeId,
        showtimeName: 'Test',
        downloadedAt: new Date().toISOString(),
        lastSyncAt: new Date().toISOString(),
        cursor: 'new-cur',
        ticketCount: 1,
        keyId: 'k1',
        publicKey: testPublicKeyPem,
        status: 'ready',
      });

      const res = await syncOfflineScanQueue(showtimeId);

      expect(syncApiSpy).toHaveBeenCalledTimes(1);
      expect(markSyncedSpy).toHaveBeenCalledWith(['scan-uuid-1']);
      expect(res.syncedCount).toBe(1);
      expect(res.conflictCount).toBe(0);
    });

    it('returns immediately without calling API when navigator is offline', async () => {
      Object.defineProperty(navigator, 'onLine', {
        value: false,
        configurable: true,
      });
      const syncApiSpy = vi.spyOn(scannerApi, 'syncOfflineScansApi');
      const res = await syncOfflineScanQueue(showtimeId);
      expect(res.syncedCount).toBe(0);
      expect(syncApiSpy).not.toHaveBeenCalled();
    });

    it('marks conflict scans synced so they do not loop endlessly', async () => {
      const pendingScans: scannerDb.OfflineScanRecord[] = [
        {
          scanId: 'scan-conflict-1',
          showtimeId,
          ticketCode: ticketId,
          gateId: 'gate-1',
          scannedAt: new Date().toISOString(),
          deviceId: 'device-1',
          staffId: 'staff-1',
          offline: true,
          syncStatus: 'pending',
          seatLabel: 'A-01',
          ticketType: 'VIP',
        },
      ];

      vi.spyOn(scannerDb, 'getPendingOfflineScans').mockResolvedValue(pendingScans);
      vi.spyOn(scannerApi, 'syncOfflineScansApi').mockResolvedValue({
        synced: 0,
        conflicts: [
          {
            scanId: 'scan-conflict-1',
            ticketCode: ticketId,
            reason: 'ALREADY_CHECKED_IN_PRIOR',
            existingCheckedInAt: '2026-10-12T08:00:00.000Z',
          },
        ],
        syncedScanIds: [],
      });
      vi.spyOn(scannerDb, 'getShowtimeMeta').mockResolvedValue(null);
      const markSyncedSpy = vi.spyOn(scannerDb, 'markOfflineScansSynced').mockResolvedValue();

      const res = await syncOfflineScanQueue(showtimeId);

      expect(res.syncedCount).toBe(0);
      expect(res.conflictCount).toBe(1);
      expect(res.conflicts[0].reason).toBe('ALREADY_CHECKED_IN_PRIOR');
      expect(markSyncedSpy).toHaveBeenCalledWith(['scan-conflict-1']);
    });
  });
});
