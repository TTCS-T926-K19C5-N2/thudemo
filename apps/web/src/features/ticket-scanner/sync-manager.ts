import { api, ApiError } from "@/lib/api/client";
import { decodeCheckIn } from "./admission-response";
import {
  getPendingScans,
  getPendingScanCount,
  removePendingScan,
  updatePendingScan,
  type PendingScan,
} from "./offline-queue";
import {
  checkServerHealth,
  markServerOffline,
  markServerOnline,
} from "./network-status";

export interface SyncOptions {
  showtimeId?: string;
  checkServerBeforeSync?: boolean;
  onItemSynced?: (item: PendingScan, remainingCount: number) => void;
  onSyncComplete?: (result: SyncResult) => void;
}

export interface SyncResult {
  totalProcessed: number;
  syncedCount: number;
  failedCount: number;
  remainingCount: number;
  stoppedDueToNetwork: boolean;
  errors: string[];
}

let syncInProgress = false;

type SyncListener = (syncing: boolean) => void;
const syncListeners = new Set<SyncListener>();

export function subscribeSyncState(listener: SyncListener): () => void {
  syncListeners.add(listener);
  listener(syncInProgress);
  return () => {
    syncListeners.delete(listener);
  };
}

function setSyncInProgress(value: boolean): void {
  syncInProgress = value;
  for (const listener of syncListeners) {
    try {
      listener(value);
    } catch (err) {
      console.error("Lỗi listener trạng thái đồng bộ:", err);
    }
  }
}

export function isSyncing(): boolean {
  return syncInProgress;
}

export async function syncPendingScans(
  options: SyncOptions = {},
): Promise<SyncResult> {
  if (syncInProgress) {
    const remaining = await getPendingScanCount(options.showtimeId);
    return {
      totalProcessed: 0,
      syncedCount: 0,
      failedCount: 0,
      remainingCount: remaining,
      stoppedDueToNetwork: false,
      errors: ["Tiến trình đồng bộ khác đang chạy."],
    };
  }

  setSyncInProgress(true);

  try {
    // 1. Verify server connectivity if requested
    if (options.checkServerBeforeSync !== false) {
      const reachable = await checkServerHealth();
      if (!reachable) {
        markServerOffline("Không thể kết nối máy chủ");
        const remaining = await getPendingScanCount(options.showtimeId);
        const result: SyncResult = {
          totalProcessed: 0,
          syncedCount: 0,
          failedCount: 0,
          remainingCount: remaining,
          stoppedDueToNetwork: true,
          errors: ["Máy chủ không thể truy cập."],
        };
        options.onSyncComplete?.(result);
        return result;
      }
      markServerOnline();
    }

    // 2. Fetch pending scans
    const pendingScans = await getPendingScans(options.showtimeId);
    if (pendingScans.length === 0) {
      const result: SyncResult = {
        totalProcessed: 0,
        syncedCount: 0,
        failedCount: 0,
        remainingCount: 0,
        stoppedDueToNetwork: false,
        errors: [],
      };
      options.onSyncComplete?.(result);
      return result;
    }

    let syncedCount = 0;
    let failedCount = 0;
    let stoppedDueToNetwork = false;
    const errors: string[] = [];

    // 3. Process each scan sequentially to maintain order
    for (const scan of pendingScans) {
      await updatePendingScan(scan.id, { status: "syncing" });

      try {
        await api(
          `/showtimes/${encodeURIComponent(scan.showtimeId)}/check-in`,
          decodeCheckIn,
          {
            method: "POST",
            body: {
              qrPayload: scan.ticketId,
              gateId: scan.gateId,
              requestId: scan.requestId, // Crucial for backend idempotency
            },
          },
        );

        // Server confirmed success (or ALREADY_RECORDED)!
        await removePendingScan(scan.id);
        markServerOnline();
        syncedCount++;

        const currentRemaining = await getPendingScanCount(options.showtimeId);
        options.onItemSynced?.(scan, currentRemaining);
      } catch (err: unknown) {
        if (err instanceof ApiError) {
          // Case A: Network error or timeout
          if (err.status === 0 || err.code === "NETWORK_ERROR") {
            markServerOffline("Mất kết nối máy chủ trong lúc đồng bộ");
            await updatePendingScan(scan.id, {
              status: "pending",
              retryCount: scan.retryCount + 1,
              lastError: err.message,
            });
            stoppedDueToNetwork = true;
            errors.push(`Mất kết nối mạng khi gửi vé ${scan.ticketId}`);
            // Break loop to preserve remaining items
            break;
          }

          // Case B: Ticket already checked in (409)
          if (err.status === 409 && err.code === "TICKET_ALREADY_CHECKED_IN") {
            // Already recorded by server -> resolve scan
            await removePendingScan(scan.id);
            syncedCount++;
            const currentRemaining = await getPendingScanCount(options.showtimeId);
            options.onItemSynced?.(scan, currentRemaining);
            continue;
          }

          // Case C: 4xx non-retryable business error (e.g. invalid QR, wrong showtime)
          if (err.status >= 400 && err.status < 500) {
            // Business error cannot be resolved by retrying
            await removePendingScan(scan.id);
            failedCount++;
            errors.push(err.message);
            const currentRemaining = await getPendingScanCount(options.showtimeId);
            options.onItemSynced?.(scan, currentRemaining);
            continue;
          }

          // Case D: 5xx server error
          await updatePendingScan(scan.id, {
            status: "pending",
            retryCount: scan.retryCount + 1,
            lastError: err.message,
          });
          errors.push(err.message);
          stoppedDueToNetwork = true;
          break;
        } else {
          // Unknown error, keep in queue
          await updatePendingScan(scan.id, {
            status: "pending",
            retryCount: scan.retryCount + 1,
            lastError: err instanceof Error ? err.message : String(err),
          });
          errors.push(err instanceof Error ? err.message : "Lỗi không xác định");
          break;
        }
      }
    }

    const remainingCount = await getPendingScanCount(options.showtimeId);
    const result: SyncResult = {
      totalProcessed: syncedCount + failedCount,
      syncedCount,
      failedCount,
      remainingCount,
      stoppedDueToNetwork,
      errors,
    };
    options.onSyncComplete?.(result);
    return result;
  } finally {
    setSyncInProgress(false);
  }
}
