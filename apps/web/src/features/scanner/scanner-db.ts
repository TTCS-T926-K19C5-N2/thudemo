export interface ShowtimeLocalMeta {
  showtimeId: string;
  showtimeName: string;
  downloadedAt: string;
  lastSyncAt: string;
  cursor: string;
  ticketCount: number;
  keyId: string;
  publicKey: string;
  status: 'ready' | 'stale' | 'syncing' | 'error';
}

export interface LocalTicket {
  showtimeId: string;
  code: string;
  status: 'valid' | 'checked_in' | 'cancelled';
  checkedInAt: string | null;
  seatLabel: string;
  ticketType: string;
  localCheckedIn?: boolean;
}

const DB_NAME = 'thudemo_scanner_db';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

export function openScannerDb(): Promise<IDBDatabase> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('IndexedDB is not available on server'));
  }

  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains('showtime_meta')) {
        db.createObjectStore('showtime_meta', { keyPath: 'showtimeId' });
      }

      if (!db.objectStoreNames.contains('tickets')) {
        const ticketStore = db.createObjectStore('tickets', {
          keyPath: ['showtimeId', 'code'],
        });
        ticketStore.createIndex('showtimeId', 'showtimeId', { unique: false });
        ticketStore.createIndex('code', 'code', { unique: false });
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
    const tx = db.transaction('showtime_meta', 'readonly');
    const store = tx.objectStore('showtime_meta');
    const req = store.get(showtimeId);
    req.onsuccess = () => resolve((req.result as ShowtimeLocalMeta) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function saveTicketsAtomic(
  meta: ShowtimeLocalMeta,
  tickets: Array<Omit<LocalTicket, 'showtimeId'>>,
): Promise<void> {
  const db = await openScannerDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['showtime_meta', 'tickets'], 'readwrite');
    const metaStore = tx.objectStore('showtime_meta');
    const ticketStore = tx.objectStore('tickets');

    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(new Error('Transaction aborted'));
    tx.oncomplete = () => resolve();

    // 1. Delete all existing tickets for this showtimeId
    const index = ticketStore.index('showtimeId');
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
  updatedTickets: Array<Omit<LocalTicket, 'showtimeId'>>,
): Promise<ShowtimeLocalMeta> {
  const db = await openScannerDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['showtime_meta', 'tickets'], 'readwrite');
    const metaStore = tx.objectStore('showtime_meta');
    const ticketStore = tx.objectStore('tickets');

    let resolvedMeta: ShowtimeLocalMeta;

    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(new Error('Transaction aborted'));
    tx.oncomplete = () => resolve(resolvedMeta);

    const metaReq = metaStore.get(showtimeId);
    metaReq.onsuccess = () => {
      const meta = metaReq.result as ShowtimeLocalMeta | undefined;
      if (!meta) {
        tx.abort();
        reject(new Error('Không tìm thấy thông tin suất để hợp nhất dữ liệu'));
        return;
      }

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
              existing.localCheckedIn || existing.status === 'checked_in';
            const willBeCheckedIn =
              isLocalCheckedIn || incoming.status === 'checked_in';

            finalTicket = {
              ...existing,
              seatLabel: incoming.seatLabel,
              ticketType: incoming.ticketType,
              status: willBeCheckedIn
                ? 'checked_in'
                : incoming.status,
              checkedInAt: willBeCheckedIn
                ? existing.checkedInAt ?? incoming.checkedInAt ?? new Date().toISOString()
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
            const countReq = ticketStore.index('showtimeId').count(IDBKeyRange.only(showtimeId));
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
    const tx = db.transaction('tickets', 'readonly');
    const store = tx.objectStore('tickets');
    const index = store.index('showtimeId');
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
    const tx = db.transaction('tickets', 'readonly');
    const store = tx.objectStore('tickets');
    const req = store.get([showtimeId, code]);
    req.onsuccess = () => resolve((req.result as LocalTicket) ?? null);
    req.onerror = () => reject(req.error);
  });
}
