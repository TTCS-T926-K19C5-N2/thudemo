import { openScannerDb } from "../scanner/scanner-db";

export interface PendingScan {
  id: string; // unique scan ID / requestId (UUID)
  showtimeId: string;
  ticketId: string; // QR payload or code
  gateId: string;
  requestId: string;
  createdAt: string; // ISO timestamp
  status: "pending" | "syncing" | "synced" | "failed";
  retryCount: number;
  lastError?: string;
  syncedAt?: string;
}

type CountListener = (count: number) => void;
const countListeners = new Set<CountListener>();

// In-memory fallback for environments without window.indexedDB (Node/Vitest, SSR)
const memoryQueue: Map<string, PendingScan> = new Map();

function isIndexedDbAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.indexedDB !== "undefined" &&
    window.indexedDB !== null
  );
}

function notifyCountChanged(count: number): void {
  for (const listener of countListeners) {
    try {
      listener(count);
    } catch (err) {
      console.error("Lỗi trong subscriber đếm lượt quét:", err);
    }
  }
}

export function subscribePendingCount(listener: CountListener): () => void {
  countListeners.add(listener);
  return () => {
    countListeners.delete(listener);
  };
}

export async function addPendingScan(scan: PendingScan): Promise<void> {
  if (isIndexedDbAvailable()) {
    try {
      const db = await openScannerDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("pending_scans", "readwrite");
        const store = tx.objectStore("pending_scans");
        const req = store.put(scan);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
      const count = await getPendingScanCount();
      notifyCountChanged(count);
      return;
    } catch (err) {
      console.warn("Không thể lưu lượt quét vào IndexedDB, sử dụng bộ nhớ tạm:", err);
    }
  }

  // Memory fallback
  memoryQueue.set(scan.id, { ...scan });
  const count = await getPendingScanCount();
  notifyCountChanged(count);
}

export async function getPendingScans(
  showtimeId?: string,
): Promise<PendingScan[]> {
  if (isIndexedDbAvailable()) {
    try {
      const db = await openScannerDb();
      const results = await new Promise<PendingScan[]>((resolve, reject) => {
        const tx = db.transaction("pending_scans", "readonly");
        const store = tx.objectStore("pending_scans");
        const req = store.getAll();
        req.onsuccess = () => resolve((req.result as PendingScan[]) ?? []);
        req.onerror = () => reject(req.error);
      });

      const filtered = results.filter((item) => {
        if (item.status !== "pending" && item.status !== "syncing") return false;
        if (showtimeId && item.showtimeId.toLowerCase() !== showtimeId.toLowerCase())
          return false;
        return true;
      });

      // Sort chronological (oldest scan first)
      filtered.sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
      return filtered;
    } catch (err) {
      console.warn("Không thể đọc lượt quét từ IndexedDB, sử dụng bộ nhớ tạm:", err);
    }
  }

  // Memory fallback
  const items = Array.from(memoryQueue.values()).filter((item) => {
    if (item.status !== "pending" && item.status !== "syncing") return false;
    if (showtimeId && item.showtimeId.toLowerCase() !== showtimeId.toLowerCase())
      return false;
    return true;
  });

  items.sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  return items;
}

export async function getPendingScanCount(
  showtimeId?: string,
): Promise<number> {
  const scans = await getPendingScans(showtimeId);
  return scans.length;
}

export async function updatePendingScan(
  id: string,
  updates: Partial<PendingScan>,
): Promise<void> {
  if (isIndexedDbAvailable()) {
    try {
      const db = await openScannerDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("pending_scans", "readwrite");
        const store = tx.objectStore("pending_scans");
        const getReq = store.get(id);
        getReq.onsuccess = () => {
          const existing = getReq.result as PendingScan | undefined;
          if (!existing) {
            resolve();
            return;
          }
          const updated = { ...existing, ...updates };
          const putReq = store.put(updated);
          putReq.onsuccess = () => resolve();
          putReq.onerror = () => reject(putReq.error);
        };
        getReq.onerror = () => reject(getReq.error);
      });
      const count = await getPendingScanCount();
      notifyCountChanged(count);
      return;
    } catch (err) {
      console.warn("Không thể cập nhật lượt quét trong IndexedDB, dùng bộ nhớ tạm:", err);
    }
  }

  // Memory fallback
  const existing = memoryQueue.get(id);
  if (existing) {
    memoryQueue.set(id, { ...existing, ...updates });
    const count = await getPendingScanCount();
    notifyCountChanged(count);
  }
}

export async function removePendingScan(id: string): Promise<void> {
  if (isIndexedDbAvailable()) {
    try {
      const db = await openScannerDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("pending_scans", "readwrite");
        const store = tx.objectStore("pending_scans");
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
      const count = await getPendingScanCount();
      notifyCountChanged(count);
      return;
    } catch (err) {
      console.warn("Không thể xoá lượt quét khỏi IndexedDB, dùng bộ nhớ tạm:", err);
    }
  }

  // Memory fallback
  memoryQueue.delete(id);
  const count = await getPendingScanCount();
  notifyCountChanged(count);
}

export async function clearPendingScans(showtimeId?: string): Promise<void> {
  if (isIndexedDbAvailable()) {
    try {
      const db = await openScannerDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("pending_scans", "readwrite");
        const store = tx.objectStore("pending_scans");
        if (!showtimeId) {
          const req = store.clear();
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
        } else {
          const req = store.getAll();
          req.onsuccess = () => {
            const all = (req.result as PendingScan[]) ?? [];
            for (const item of all) {
              if (item.showtimeId.toLowerCase() === showtimeId.toLowerCase()) {
                store.delete(item.id);
              }
            }
            resolve();
          };
          req.onerror = () => reject(req.error);
        }
      });
      const count = await getPendingScanCount();
      notifyCountChanged(count);
      return;
    } catch (err) {
      console.warn("Không thể dọn sạch lượt quét trong IndexedDB:", err);
    }
  }

  // Memory fallback
  if (!showtimeId) {
    memoryQueue.clear();
  } else {
    for (const [id, item] of memoryQueue.entries()) {
      if (item.showtimeId.toLowerCase() === showtimeId.toLowerCase()) {
        memoryQueue.delete(id);
      }
    }
  }
  const count = await getPendingScanCount();
  notifyCountChanged(count);
}

export async function getPendingScanByTicket(
  showtimeId: string,
  ticketId: string,
): Promise<PendingScan | null> {
  const scans = await getPendingScans(showtimeId);
  return scans.find((s) => s.ticketId === ticketId) ?? null;
}

export function _resetMemoryQueueForTesting(): void {
  memoryQueue.clear();
  notifyCountChanged(0);
}
