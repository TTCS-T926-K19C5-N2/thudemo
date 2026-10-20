import {
  type DurableScan,
  putDurableScan,
  pendingDurableScans,
  updateDurableScan,
  acknowledgeDurableScan,
  clearDurableScans,
  subscribeDurableCount,
  resetDurableTestMemory,
} from "../scanner/durable-scans";
export type PendingScan = DurableScan;
export const addPendingScan = putDurableScan;
export const getPendingScans = pendingDurableScans;
export const updatePendingScan = updateDurableScan;
export const removePendingScan = acknowledgeDurableScan;
export const clearPendingScans = clearDurableScans;
export const subscribePendingCount = subscribeDurableCount;
export async function getPendingScanCount(showtimeId?: string) {
  return (await pendingDurableScans(showtimeId)).length;
}
export async function getPendingScanByTicket(
  showtimeId: string,
  ticketId: string,
) {
  return (
    (await pendingDurableScans(showtimeId)).find(
      (s) => s.ticketId === ticketId,
    ) ?? null
  );
}
export const _resetMemoryQueueForTesting = resetDurableTestMemory;
