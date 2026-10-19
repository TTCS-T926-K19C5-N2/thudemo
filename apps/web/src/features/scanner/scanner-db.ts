import { parseTicketQr } from "shared/ticket-qr";
import {
  type DurableScan,
  pendingDurableScans,
  acknowledgeDurableScan,
  allDurableScans,
  clearDurableScans,
  notifyDurableCount,
} from "./durable-scans";

export interface ShowtimeLocalMeta {
  showtimeId: string;
  showtimeName: string;
  downloadedAt: string;
  lastSyncAt: string;
  cursor: string;
  version?: string;
  ticketCount: number;
  keyId: string;
  publicKey: string;
  verificationKeys?: { keyId: string; key: string }[];
  status: "ready" | "stale" | "syncing" | "error";
}

export interface LocalTicket {
  showtimeId: string;
  code: string;
  status: "valid" | "checked_in" | "cancelled";
  checkedInAt: string | null;
  seatLabel: string;
  ticketType: string;
  localCheckedIn?: boolean;
}

export interface OfflineScanRecord {
  scanId: string;
  ticketCode: string;
  showtimeId: string;
  gateId?: string;
  gateName?: string;
  scannedAt: string;
  deviceId: string;
  staffId: string;
  offline: true;
  syncStatus: "pending" | "synced" | "failed" | "conflict";
  seatLabel?: string;
  ticketType?: string;
  qrPayload?: string;
}

export interface PendingScanRecord {
  id: string;
  showtimeId: string;
  ticketId: string;
  gateId: string;
  requestId: string;
  createdAt: string;
  status: "pending" | "syncing" | "synced" | "failed";
  retryCount: number;
  lastError?: string;
  syncedAt?: string;
}

const DB_NAME = "thudemo_scanner_db";
const DB_VERSION = 3;

let dbPromise: Promise<IDBDatabase> | null = null;

export function openScannerDb(): Promise<IDBDatabase> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("IndexedDB is not available on server"));
  }

  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains("showtime_meta")) {
        db.createObjectStore("showtime_meta", { keyPath: "showtimeId" });
      }

      if (!db.objectStoreNames.contains("tickets")) {
        const ticketStore = db.createObjectStore("tickets", {
          keyPath: ["showtimeId", "code"],
        });
        ticketStore.createIndex("showtimeId", "showtimeId", { unique: false });
        ticketStore.createIndex("code", "code", { unique: false });
      }

      if (!db.objectStoreNames.contains("scan_queue")) {
        const queueStore = db.createObjectStore("scan_queue", {
          keyPath: "scanId",
        });
        queueStore.createIndex("showtimeId", "showtimeId", { unique: false });
        queueStore.createIndex("ticketCode", "ticketCode", { unique: false });
        queueStore.createIndex("syncStatus", "syncStatus", { unique: false });
        queueStore.createIndex(
          "showtime_ticket",
          ["showtimeId", "ticketCode"],
          {
            unique: false,
          },
        );
      }

      if (!db.objectStoreNames.contains("pending_scans")) {
        const pendingStore = db.createObjectStore("pending_scans", {
          keyPath: "id",
        });
        pendingStore.createIndex("showtimeId", "showtimeId", { unique: false });
        pendingStore.createIndex("status", "status", { unique: false });
        pendingStore.createIndex("createdAt", "createdAt", { unique: false });
      }
      if (!db.objectStoreNames.contains("durable_scans")) {
        const unified = db.createObjectStore("durable_scans", {
          keyPath: "id",
        });
        unified.createIndex("showtimeId", "showtimeId", { unique: false });
        const transaction = request.transaction!;
        // Retain both legacy stores as recovery evidence. Upgrade copies every
        // record, including unresolvable old scans, in the same IDB transaction.
        for (const source of ["pending_scans", "scan_queue"]) {
          const cursorRequest = transaction.objectStore(source).openCursor();
          cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result;
            if (!cursor) return;
            const old = cursor.value as Record<string, unknown>;
            const payload = String(
              source === "pending_scans" ? old.ticketId : (old.qrPayload ?? ""),
            );
            const claims = parseTicketQr(payload);
            const scanId = String(old.id ?? old.scanId);
            const candidate: DurableScan = {
              id: scanId,
              requestId: scanId,
              showtimeId: String(old.showtimeId),
              ticketId: payload,
              ticketCode: claims?.ticketId ?? String(old.ticketCode ?? ""),
              gateId: String(old.gateId ?? ""),
              deviceId: String(old.deviceId ?? "legacy_device"),
              staffId:
                typeof old.staffId === "string" ? old.staffId : undefined,
              createdAt: String(old.createdAt ?? old.scannedAt),
              status:
                old.status === "synced" || old.syncStatus === "synced"
                  ? "synced"
                  : "pending",
              retryCount: Number(old.retryCount ?? 0),
              mode:
                source === "scan_queue"
                  ? "offline_admission"
                  : "online_confirmation",
              ...(claims
                ? {}
                : {
                    migrationIssue:
                      "Lượt cũ thiếu QR đã ký; giữ lại để đối chiếu, không tự gửi mã không có chữ ký.",
                  }),
            };
            const prior = unified.get(scanId);
            prior.onsuccess = () => {
              if (!prior.result) unified.put(candidate);
              else if (
                JSON.stringify(prior.result) !== JSON.stringify(candidate)
              )
                unified.put({
                  ...candidate,
                  id: `legacy:${source}:${scanId}`,
                  migrationIssue:
                    "Hai hàng đợi cũ trùng mã lượt; giữ cả hai để đối chiếu.",
                });
              cursor.continue();
            };
          };
        }
      }
    };

    request.onsuccess = () => {
      request.result.onversionchange = () => {
        request.result.close();
        dbPromise = null;
      };
      resolve(request.result);
    };
    request.onerror = () => {
      dbPromise = null;
      reject(request.error);
    };
  });

  return dbPromise;
}

export async function getShowtimeMeta(
  showtimeId: string,
): Promise<ShowtimeLocalMeta | null> {
  const db = await openScannerDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("showtime_meta", "readonly");
    const store = tx.objectStore("showtime_meta");
    const req = store.get(showtimeId);
    req.onsuccess = () => resolve((req.result as ShowtimeLocalMeta) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function saveTicketsAtomic(
  meta: ShowtimeLocalMeta,
  tickets: Array<Omit<LocalTicket, "showtimeId">>,
): Promise<void> {
  const db = await openScannerDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["showtime_meta", "tickets"], "readwrite");
    const metaStore = tx.objectStore("showtime_meta");
    const ticketStore = tx.objectStore("tickets");

    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(new Error("Transaction aborted"));
    tx.oncomplete = () => resolve();

    // 1. Delete all existing tickets for this showtimeId
    const index = ticketStore.index("showtimeId");
    const keyRange = IDBKeyRange.only(meta.showtimeId);
    const deleteReq = index.openKeyCursor(keyRange);

    deleteReq.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result as IDBCursor;
      if (cursor) {
        ticketStore.delete(cursor.primaryKey);
        cursor.continue();
      } else {
        // 2. Insert all new tickets
        for (const t of tickets) {
          ticketStore.put({
            ...t,
            showtimeId: meta.showtimeId,
          });
        }
        // 3. Save meta
        metaStore.put(meta);
      }
    };

    deleteReq.onerror = () => reject(deleteReq.error);
  });
}

export async function mergeTicketsIncremental(
  showtimeId: string,
  newCursor: string,
  updatedTickets: Array<Omit<LocalTicket, "showtimeId">>,
  keyInfo?: Pick<
    ShowtimeLocalMeta,
    "keyId" | "publicKey" | "verificationKeys" | "version"
  >,
): Promise<ShowtimeLocalMeta> {
  const db = await openScannerDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["showtime_meta", "tickets"], "readwrite");
    const metaStore = tx.objectStore("showtime_meta");
    const ticketStore = tx.objectStore("tickets");

    let resolvedMeta: ShowtimeLocalMeta;

    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(new Error("Transaction aborted"));
    tx.oncomplete = () => resolve(resolvedMeta);

    const metaReq = metaStore.get(showtimeId);
    metaReq.onsuccess = () => {
      const meta = metaReq.result as ShowtimeLocalMeta | undefined;
      if (!meta) {
        tx.abort();
        reject(new Error("Không tìm thấy thông tin suất để hợp nhất dữ liệu"));
        return;
      }
      if (keyInfo) Object.assign(meta, keyInfo);

      let pendingReads = updatedTickets.length;
      if (pendingReads === 0) {
        meta.cursor = newCursor;
        meta.lastSyncAt = new Date().toISOString();
        metaStore.put(meta);
        resolvedMeta = meta;
        return;
      }

      for (const incoming of updatedTickets) {
        const getReq = ticketStore.get([showtimeId, incoming.code]);
        getReq.onsuccess = () => {
          const existing = getReq.result as LocalTicket | undefined;
          let finalTicket: LocalTicket;

          if (existing) {
            // Retain actual device admissions, while accepting authoritative
            // cancellation and the final server timestamp/ranking.
            const isLocalCheckedIn = Boolean(existing.localCheckedIn);
            const willBeCheckedIn =
              isLocalCheckedIn || incoming.status === "checked_in";

            finalTicket = {
              ...existing,
              seatLabel: incoming.seatLabel,
              ticketType: incoming.ticketType,
              status:
                incoming.status === "cancelled"
                  ? "cancelled"
                  : willBeCheckedIn
                    ? "checked_in"
                    : incoming.status,
              checkedInAt: willBeCheckedIn
                ? (incoming.checkedInAt ??
                  existing.checkedInAt ??
                  new Date().toISOString())
                : incoming.checkedInAt,
              localCheckedIn: isLocalCheckedIn,
            };
          } else {
            finalTicket = {
              ...incoming,
              showtimeId,
            };
          }

          ticketStore.put(finalTicket);
          pendingReads--;

          if (pendingReads === 0) {
            // Count total tickets for this showtime
            const countReq = ticketStore
              .index("showtimeId")
              .getAll(IDBKeyRange.only(showtimeId));
            countReq.onsuccess = () => {
              meta.ticketCount = (countReq.result as LocalTicket[]).filter(
                (t) => t.status !== "cancelled",
              ).length;
              meta.cursor = newCursor;
              meta.lastSyncAt = new Date().toISOString();
              metaStore.put(meta);
              resolvedMeta = meta;
            };
          }
        };
        getReq.onerror = () => tx.abort();
      }
    };
  });
}

export async function getTicketsForShowtime(
  showtimeId: string,
): Promise<LocalTicket[]> {
  const db = await openScannerDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("tickets", "readonly");
    const store = tx.objectStore("tickets");
    const index = store.index("showtimeId");
    const req = index.getAll(IDBKeyRange.only(showtimeId));
    req.onsuccess = () => resolve((req.result as LocalTicket[]) ?? []);
    req.onerror = () => reject(req.error);
  });
}

export async function getTicketByCode(
  showtimeId: string,
  code: string,
): Promise<LocalTicket | null> {
  const db = await openScannerDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("tickets", "readonly");
    const store = tx.objectStore("tickets");
    const req = store.get([showtimeId, code]);
    req.onsuccess = () => resolve((req.result as LocalTicket) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function saveOfflineScanAtomic(
  scan: OfflineScanRecord,
): Promise<void> {
  const db = await openScannerDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(["tickets", "durable_scans"], "readwrite"),
      tickets = tx.objectStore("tickets"),
      queue = tx.objectStore("durable_scans");
    const req = tickets.get([scan.showtimeId, scan.ticketCode]);
    req.onsuccess = () => {
      const ticket = req.result as LocalTicket | undefined;
      if (!ticket || ticket.status !== "valid" || ticket.localCheckedIn) {
        tx.abort();
        return;
      }
      const claims = parseTicketQr(scan.qrPayload ?? "");
      if (!claims || claims.ticketId !== scan.ticketCode) {
        tx.abort();
        return;
      }
      queue.add({
        id: scan.scanId,
        requestId: scan.scanId,
        showtimeId: scan.showtimeId,
        ticketCode: scan.ticketCode,
        ticketId: scan.qrPayload!,
        gateId: scan.gateId ?? "",
        staffId: scan.staffId,
        deviceId: scan.deviceId,
        createdAt: scan.scannedAt,
        status: "pending",
        retryCount: 0,
        mode: "offline_admission",
      } satisfies DurableScan);
      tickets.put({
        ...ticket,
        status: "checked_in",
        localCheckedIn: true,
        checkedInAt: scan.scannedAt,
      });
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () =>
      reject(
        Error(
          "Không lưu được lượt quét hoặc vé đã dùng trên thiết bị. Chưa cho vào.",
        ),
      );
  });
  await notifyDurableCount();
}

export async function getPendingOfflineScans(
  showtimeId?: string,
): Promise<OfflineScanRecord[]> {
  return (await pendingDurableScans(showtimeId)).map((s) => ({
    scanId: s.id,
    ticketCode: s.ticketCode ?? "",
    showtimeId: s.showtimeId,
    gateId: s.gateId,
    scannedAt: s.createdAt,
    deviceId: s.deviceId ?? "",
    staffId: s.staffId ?? "",
    offline: true,
    syncStatus: "pending",
    qrPayload: s.ticketId,
  }));
}

export async function markOfflineScansSynced(scanIds: string[]): Promise<void> {
  for (const id of scanIds) await acknowledgeDurableScan(id);
}

export async function hasOfflineScanForTicket(
  showtimeId: string,
  ticketCode: string,
): Promise<boolean> {
  return (await allDurableScans()).some(
    (s) =>
      s.showtimeId === showtimeId &&
      s.ticketCode === ticketCode &&
      s.mode === "offline_admission",
  );
}

export async function markTicketAsLocalCheckedIn(
  showtimeId: string,
  code: string,
): Promise<void> {
  const db = await openScannerDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("tickets", "readwrite");
    const store = tx.objectStore("tickets");
    const req = store.get([showtimeId, code]);
    req.onsuccess = () => {
      const ticket = req.result as LocalTicket | undefined;
      if (ticket) {
        ticket.localCheckedIn = true;
        ticket.status = "checked_in";
        ticket.checkedInAt = ticket.checkedInAt ?? new Date().toISOString();
        const putReq = store.put(ticket);
        putReq.onsuccess = () => resolve();
        putReq.onerror = () => reject(putReq.error);
      } else {
        resolve();
      }
    };
    req.onerror = () => reject(req.error);
  });
}

export async function countPendingOfflineScans(
  showtimeId?: string,
): Promise<number> {
  const list = await getPendingOfflineScans(showtimeId);
  return list.length;
}

export async function clearOfflineScanQueue(
  showtimeId?: string,
): Promise<void> {
  await clearDurableScans(showtimeId);
}
