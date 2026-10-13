export interface ShowtimeLocalMeta {
  showtimeId: string;
  showtimeName: string;
  downloadedAt: string;
  lastSyncAt: string;
  cursor: string;
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
}

const DB_NAME = "thudemo_scanner_db";
const DB_VERSION = 2;

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
        queueStore.createIndex("showtime_ticket", ["showtimeId", "ticketCode"], {
          unique: false,
        });
      }
    };


    request.onsuccess = () => resolve(request.result);
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
  keyInfo?: Pick<ShowtimeLocalMeta, "keyId" | "publicKey" | "verificationKeys">,
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
            // Local checked_in status ALWAYS wins
            const isLocalCheckedIn =
              existing.localCheckedIn || existing.status === "checked_in";
            const willBeCheckedIn =
              isLocalCheckedIn || incoming.status === "checked_in";

            finalTicket = {
              ...existing,
              seatLabel: incoming.seatLabel,
              ticketType: incoming.ticketType,
              status: willBeCheckedIn ? "checked_in" : incoming.status,
              checkedInAt: willBeCheckedIn
                ? (existing.checkedInAt ??
                  incoming.checkedInAt ??
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
              .count(IDBKeyRange.only(showtimeId));
            countReq.onsuccess = () => {
              meta.ticketCount = countReq.result;
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
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["tickets", "scan_queue"], "readwrite");
    const ticketStore = tx.objectStore("tickets");
    const queueStore = tx.objectStore("scan_queue");

    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(new Error("Giao dịch lưu quét ngoại tuyến bị huỷ"));
    tx.oncomplete = () => resolve();

    // 1. Put scan into scan_queue
    queueStore.put(scan);

    // 2. Mark ticket as checked_in locally
    const ticketReq = ticketStore.get([scan.showtimeId, scan.ticketCode]);
    ticketReq.onsuccess = () => {
      const existing = ticketReq.result as LocalTicket | undefined;
      if (existing) {
        ticketStore.put({
          ...existing,
          status: "checked_in",
          localCheckedIn: true,
          checkedInAt: scan.scannedAt,
        });
      }
    };
  });
}

export async function getPendingOfflineScans(
  showtimeId?: string,
): Promise<OfflineScanRecord[]> {
  const db = await openScannerDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("scan_queue", "readonly");
    const store = tx.objectStore("scan_queue");
    const index = store.index("syncStatus");
    const req = index.getAll(IDBKeyRange.only("pending"));

    req.onsuccess = () => {
      const list = (req.result as OfflineScanRecord[]) ?? [];
      if (showtimeId) {
        resolve(list.filter((s) => s.showtimeId === showtimeId));
      } else {
        resolve(list);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

export async function markOfflineScansSynced(
  scanIds: string[],
): Promise<void> {
  if (!scanIds.length) return;
  const db = await openScannerDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("scan_queue", "readwrite");
    const store = tx.objectStore("scan_queue");

    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => resolve();

    for (const id of scanIds) {
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const item = getReq.result as OfflineScanRecord | undefined;
        if (item) {
          item.syncStatus = "synced";
          store.put(item);
        }
      };
    }
  });
}

export async function hasOfflineScanForTicket(
  showtimeId: string,
  ticketCode: string,
): Promise<boolean> {
  const db = await openScannerDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("scan_queue", "readonly");
    const store = tx.objectStore("scan_queue");
    const index = store.index("showtime_ticket");
    const req = index.getAll(IDBKeyRange.only([showtimeId, ticketCode]));

    req.onsuccess = () => {
      const list = (req.result as OfflineScanRecord[]) ?? [];
      resolve(list.some((s) => s.syncStatus === "pending" || s.syncStatus === "synced"));
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
  const db = await openScannerDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("scan_queue", "readwrite");
    const store = tx.objectStore("scan_queue");

    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => resolve();

    if (!showtimeId) {
      store.clear();
      return;
    }

    const index = store.index("showtimeId");
    const req = index.openKeyCursor(IDBKeyRange.only(showtimeId));
    req.onsuccess = (e) => {
      const cursor = (e.target as IDBRequest).result as IDBCursor;
      if (cursor) {
        store.delete(cursor.primaryKey);
        cursor.continue();
      }
    };
  });
}

