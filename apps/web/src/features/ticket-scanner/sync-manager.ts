import { api, ApiError, object } from "@/lib/api/client";
import { loadCurrentUser } from "@/lib/api";
import { parseTicketQr } from "shared/ticket-qr";
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
      console.warn("Lỗi listener trạng thái đồng bộ:", err);
    }
  }
}

export function isSyncing(): boolean {
  return syncInProgress;
}

export async function syncPendingScans(
  options: SyncOptions = {},
): Promise<SyncResult> {
  const result: SyncResult = {
    totalProcessed: 0,
    syncedCount: 0,
    failedCount: 0,
    remainingCount: await getPendingScanCount(options.showtimeId),
    stoppedDueToNetwork: false,
    errors: [],
  };
  if (syncInProgress) {
    result.errors.push("Tiến trình đồng bộ khác đang chạy.");
    return result;
  }
  setSyncInProgress(true);
  try {
    if (
      options.checkServerBeforeSync !== false &&
      !(await checkServerHealth())
    ) {
      markServerOffline();
      result.stoppedDueToNetwork = true;
      return result;
    }
    const actor = await loadCurrentUser();
    if (!actor?.roles.includes("STAFF")) {
      result.errors.push(
        "Đăng nhập đúng nhân viên để đồng bộ. Hàng đợi được giữ lại.",
      );
      return result;
    }
    const records = await getPendingScans(options.showtimeId);
    const eligible = records.filter((scan) => {
      if (
        scan.migrationIssue ||
        !parseTicketQr(scan.ticketId) ||
        !scan.deviceId ||
        !scan.gateId ||
        (scan.staffId && scan.staffId !== actor.id)
      ) {
        result.errors.push(
          scan.migrationIssue ??
            "Lượt quét thuộc nhân viên khác hoặc thiếu cấu hình; giữ lại để đối chiếu.",
        );
        return false;
      }
      return true;
    });
    for (let offset = 0; offset < eligible.length; offset += 40) {
      const batch = eligible.slice(offset, offset + 40),
        deviceSentAt = new Date().toISOString();
      for (const scan of batch)
        await updatePendingScan(scan.id, { status: "syncing" });
      try {
        const acknowledgements = await api(
          "/scanner/sync-scans",
          (value) => {
            const data = object(value);
            if (data.version !== 2 || !Array.isArray(data.results))
              throw Error("Không đọc được ACK đồng bộ. Hàng đợi được giữ lại.");
            const expected = new Set(batch.map((s) => s.id)),
              seen = new Set<string>();
            return data.results.map((raw) => {
              const ack = object(raw);
              if (
                typeof ack.scanId !== "string" ||
                !expected.has(ack.scanId) ||
                seen.has(ack.scanId) ||
                !["synced", "conflict", "rejected"].includes(
                  String(ack.status),
                ) ||
                ack.ticketCode !==
                  parseTicketQr(
                    batch.find((s) => s.id === ack.scanId)!.ticketId,
                  )?.ticketId
              )
                throw Error("ACK không khớp lượt quét. Hàng đợi được giữ lại.");
              seen.add(ack.scanId);
              return { id: ack.scanId, status: String(ack.status) };
            });
          },
          {
            method: "POST",
            body: {
              scans: batch.map((scan) => ({
                scanId: scan.requestId,
                showtimeId: scan.showtimeId,
                gateId: scan.gateId,
                ticketCode: parseTicketQr(scan.ticketId)!.ticketId,
                qrPayload: scan.ticketId,
                deviceId: scan.deviceId,
                scannedAt: scan.createdAt,
                deviceSentAt,
                mode: scan.mode ?? "online_confirmation",
              })),
            },
          },
        );
        const ackIds = new Set(acknowledgements.map((a) => a.id));
        for (const ack of acknowledgements) {
          await removePendingScan(ack.id);
          await updatePendingScan(ack.id, {
            lastError:
              ack.status === "conflict"
                ? "Có xung đột trong báo cáo suất."
                : ack.status === "rejected"
                  ? "Máy chủ từ chối lượt quét; cần đối chiếu."
                  : undefined,
          });
          result.totalProcessed++;
          if (ack.status === "synced") result.syncedCount++;
          else result.failedCount++;
          const scan = batch.find((s) => s.id === ack.id)!;
          options.onItemSynced?.(
            scan,
            await getPendingScanCount(options.showtimeId),
          );
        }
        for (const scan of batch)
          if (!ackIds.has(scan.id))
            await updatePendingScan(scan.id, { status: "pending" });
        markServerOnline();
        if (ackIds.size !== batch.length) {
          result.errors.push(
            "Máy chủ chưa ACK đủ lô. Lượt còn lại được giữ để gửi tiếp.",
          );
          break;
        }
      } catch (error) {
        for (const scan of batch)
          await updatePendingScan(scan.id, {
            status: "pending",
            retryCount: scan.retryCount + 1,
            lastError: "Chưa nhận ACK; giữ nguyên mã lượt để thử lại.",
          });
        if (error instanceof ApiError && error.status === 0) {
          markServerOffline();
          result.stoppedDueToNetwork = true;
        }
        result.errors.push(
          error instanceof ApiError && [401, 403].includes(error.status)
            ? "Phiên hoặc quyền đã thay đổi. Đăng nhập đúng nhân viên; hàng đợi vẫn còn."
            : "Chưa đồng bộ được lô; dữ liệu vẫn được giữ trên máy.",
        );
        break;
      }
    }
  } catch {
    result.errors.push(
      "Chưa xác minh được phiên hoặc hàng đợi. Thử lại khi có mạng.",
    );
  } finally {
    result.remainingCount = await getPendingScanCount(options.showtimeId);
    setSyncInProgress(false);
    options.onSyncComplete?.(result);
  }
  return result;
}
