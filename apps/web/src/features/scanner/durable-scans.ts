import { openScannerDb } from "./scanner-db";
import { parseTicketQr } from "shared/ticket-qr";

export interface DurableScan {
  id: string;
  requestId: string;
  showtimeId: string;
  ticketId: string;
  ticketCode?: string;
  gateId: string;
  staffId?: string;
  deviceId?: string;
  createdAt: string;
  status: "pending" | "syncing" | "synced" | "failed";
  retryCount: number;
  mode?: "offline_admission" | "online_confirmation";
  lastError?: string;
  syncedAt?: string;
  migrationIssue?: string;
}
const listeners = new Set<(count: number) => void>();
const testMemory = new Map<string, DurableScan>();
const browser = () =>
  typeof window !== "undefined" &&
  !(process.env.NODE_ENV === "test" && !window.indexedDB);
export function deviceIdentity() {
  const key = "scanner.device-id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}
export async function allDurableScans(): Promise<DurableScan[]> {
  if (!browser()) return [...testMemory.values()];
  const db = await openScannerDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("durable_scans", "readonly"),
      req = tx.objectStore("durable_scans").getAll();
    req.onsuccess = () => resolve(req.result as DurableScan[]);
    req.onerror = () => reject(req.error);
  });
}
export async function pendingDurableScans(showtimeId?: string) {
  return (await allDurableScans())
    .filter(
      (s) =>
        s.status !== "synced" &&
        (!showtimeId ||
          s.showtimeId.toLowerCase() === showtimeId.toLowerCase()),
    )
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}
export async function notifyDurableCount() {
  const count = (await pendingDurableScans()).length;
  for (const listener of listeners) listener(count);
  if (browser()) window.dispatchEvent(new Event("scanner-queue-changed"));
}
export function subscribeDurableCount(listener: (count: number) => void) {
  listeners.add(listener);
  void pendingDurableScans()
    .then((s) => listener(s.length))
    .catch(() => {
      // Do not invent a zero count or a memory queue if persistent storage fails.
      // Admission writes fail closed and display their actionable storage error.
    });
  return () => {
    listeners.delete(listener);
  };
}
export async function putDurableScan(scan: DurableScan) {
  const item = {
    ...scan,
    ticketCode: scan.ticketCode ?? parseTicketQr(scan.ticketId)?.ticketId,
    mode: scan.mode ?? "online_confirmation",
    deviceId: scan.deviceId ?? (browser() ? deviceIdentity() : "test_device"),
  };
  if (!browser()) testMemory.set(item.id, item);
  else {
    const db = await openScannerDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("durable_scans", "readwrite");
      tx.objectStore("durable_scans").put(item);
      tx.oncomplete = () => resolve();
      tx.onabort = () =>
        reject(tx.error ?? Error("Không lưu được lượt quét bền vững."));
      tx.onerror = () => reject(tx.error);
    });
  }
  await notifyDurableCount();
}
export async function updateDurableScan(
  id: string,
  updates: Partial<DurableScan>,
) {
  if (!browser()) {
    const existing = testMemory.get(id);
    if (existing) testMemory.set(id, { ...existing, ...updates });
  } else {
    const db = await openScannerDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("durable_scans", "readwrite"),
        store = tx.objectStore("durable_scans"),
        req = store.get(id);
      req.onsuccess = () => {
        if (req.result) store.put({ ...req.result, ...updates });
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }
  await notifyDurableCount();
}
export async function acknowledgeDurableScan(id: string) {
  await updateDurableScan(id, {
    status: "synced",
    syncedAt: new Date().toISOString(),
  });
}
// Explicit test/fixture cleanup only. Production sync acknowledges, never clears.
export async function clearDurableScans(showtimeId?: string) {
  const records = await allDurableScans();
  if (!browser()) {
    for (const item of records)
      if (!showtimeId || item.showtimeId === showtimeId)
        testMemory.delete(item.id);
  } else {
    const db = await openScannerDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("durable_scans", "readwrite"),
        store = tx.objectStore("durable_scans");
      for (const item of records)
        if (!showtimeId || item.showtimeId === showtimeId)
          store.delete(item.id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  await notifyDurableCount();
}
export function resetDurableTestMemory() {
  testMemory.clear();
}
