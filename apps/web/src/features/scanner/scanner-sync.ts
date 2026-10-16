import {
  fetchShowtimeTickets,
  syncOfflineScansApi,
  type ShowtimeTicketsPayload,
  type OfflineScanItemPayload,
  type SyncOfflineScansResponse,
} from "./scanner-api";
import {
  getShowtimeMeta,
  saveTicketsAtomic,
  mergeTicketsIncremental,
  getPendingOfflineScans,
  markOfflineScansSynced,
  type ShowtimeLocalMeta,
} from "./scanner-db";

export const SCANNER_LIST_STALE_MINUTES = 30;

export function isListStale(lastSyncAt: string | null | undefined): boolean {
  if (!lastSyncAt) return true;
  const syncTime = new Date(lastSyncAt).getTime();
  if (Number.isNaN(syncTime)) return true;
  const diffMinutes = (Date.now() - syncTime) / (1000 * 60);
  return diffMinutes >= SCANNER_LIST_STALE_MINUTES;
}

let isSyncing = false;

export async function downloadTicketsFull(
  showtimeId: string,
  onProgress?: (step: "fetching" | "saving" | "done", count?: number) => void,
): Promise<ShowtimeLocalMeta> {
  if (isSyncing) {
    throw new Error("Đang có tiến trình đồng bộ khác đang chạy.");
  }

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    throw new Error(
      "Thiết bị đang mất kết nối mạng. Hãy kết nối lại trước khi tải.",
    );
  }

  isSyncing = true;
  try {
    onProgress?.("fetching");
    const payload: ShowtimeTicketsPayload =
      await fetchShowtimeTickets(showtimeId);

    onProgress?.("saving", payload.tickets.length);
    const meta: ShowtimeLocalMeta = {
      showtimeId: payload.showtimeId,
      showtimeName: payload.showtimeName,
      downloadedAt: payload.generatedAt,
      lastSyncAt: payload.generatedAt,
      cursor: payload.cursor,
      ticketCount: payload.tickets.length,
      keyId: payload.publicKey.keyId,
      publicKey: payload.publicKey.key,
      verificationKeys: payload.publicKey.verificationKeys,
      status: "ready",
    };

    await saveTicketsAtomic(meta, payload.tickets);
    onProgress?.("done", payload.tickets.length);
    return meta;
  } finally {
    isSyncing = false;
  }
}

export async function syncTicketsIncremental(
  showtimeId: string,
): Promise<ShowtimeLocalMeta | null> {
  if (isSyncing) return null;

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return null;
  }

  const existingMeta = await getShowtimeMeta(showtimeId);
  if (!existingMeta || !existingMeta.cursor) {
    return null;
  }

  isSyncing = true;
  try {
    const payload = await fetchShowtimeTickets(showtimeId, existingMeta.cursor);

    const updatedMeta = await mergeTicketsIncremental(
      showtimeId,
      payload.cursor,
      payload.tickets,
      {
        keyId: payload.publicKey.keyId,
        publicKey: payload.publicKey.key,
        verificationKeys: payload.publicKey.verificationKeys,
      },
    );

    return updatedMeta;
  } catch (err) {
    console.warn("Lỗi tự động đồng bộ phần thay đổi:", err);
    return null;
  } finally {
    isSyncing = false;
  }
}

export async function syncOfflineScanQueue(
  showtimeId?: string,
): Promise<{
  syncedCount: number;
  conflictCount: number;
  conflicts: SyncOfflineScansResponse["conflicts"];
}> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { syncedCount: 0, conflictCount: 0, conflicts: [] };
  }

  const pending = await getPendingOfflineScans(showtimeId);
  if (pending.length === 0) {
    return { syncedCount: 0, conflictCount: 0, conflicts: [] };
  }

  const payload: OfflineScanItemPayload[] = pending.map((item) => ({
    scanId: item.scanId,
    showtimeId: item.showtimeId,
    ticketCode: item.ticketCode,
    gateId: item.gateId,
    scannedAt: item.scannedAt,
    deviceId: item.deviceId,
  }));

  try {
    const res = await syncOfflineScansApi(payload);
    const toMarkSynced = [
      ...res.syncedScanIds,
      ...res.conflicts.map((c) => c.scanId),
    ];
    if (toMarkSynced.length > 0) {
      await markOfflineScansSynced(toMarkSynced);
    }

    // Trigger incremental sync after queue sync
    const distinctShowtimes = Array.from(
      new Set(pending.map((p) => p.showtimeId)),
    );
    for (const sid of distinctShowtimes) {
      try {
        await syncTicketsIncremental(sid);
      } catch (e) {
        console.warn(`Lỗi đồng bộ vé sau khi đẩy hàng đợi suất ${sid}:`, e);
      }
    }

    return {
      syncedCount: res.synced,
      conflictCount: res.conflicts.length,
      conflicts: res.conflicts,
    };
  } catch (err) {
    console.warn("Lỗi đồng bộ hàng đợi quét ngoại tuyến:", err);
    throw err;
  }
}

export function startAutoSync(
  showtimeId: string,
  onMetaUpdated: (meta: ShowtimeLocalMeta) => void,
): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const checkAndSync = async () => {
    if (!navigator.onLine) return;
    try {
      await syncOfflineScanQueue(showtimeId);
    } catch {
      // ignore
    }

    const meta = await getShowtimeMeta(showtimeId);
    if (!meta) return;

    if (isListStale(meta.lastSyncAt)) {
      const updated = await syncTicketsIncremental(showtimeId);
      if (updated) {
        onMetaUpdated(updated);
      }
    }
  };

  // Check every 60 seconds
  const intervalId = window.setInterval(() => {
    void checkAndSync();
  }, 60 * 1000);

  // Trigger when network comes back online
  const onOnline = () => {
    void checkAndSync();
  };
  window.addEventListener("online", onOnline);

  // Initial check
  void checkAndSync();

  return () => {
    window.clearInterval(intervalId);
    window.removeEventListener("online", onOnline);
  };
}

