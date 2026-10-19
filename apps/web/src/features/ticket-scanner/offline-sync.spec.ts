import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID, generateKeyPairSync, sign } from "node:crypto";
import { ticketQrInput, parseTicketQr } from "shared/ticket-qr";
import {
  addPendingScan,
  getPendingScans,
  getPendingScanCount,
  getPendingScanByTicket,
  subscribePendingCount,
  _resetMemoryQueueForTesting,
  type PendingScan,
} from "./offline-queue";
import {
  markServerOffline,
  markServerOnline,
  getCurrentNetworkStatus,
  _setMockServerReachableForTesting,
} from "./network-status";
import { syncPendingScans } from "./sync-manager";
import { api, ApiError } from "@/lib/api/client";
import { loadCurrentUser } from "@/lib/api";
vi.mock("@/lib/api/client", async (original) => ({
  ...(await original<typeof import("@/lib/api/client")>()),
  api: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ loadCurrentUser: vi.fn() }));
const transport = vi.mocked(api),
  actor = vi.mocked(loadCurrentUser),
  showtimeId = randomUUID(),
  gateId = randomUUID(),
  staffId = randomUUID(),
  pair = generateKeyPairSync("ed25519");
function scan(): PendingScan {
  const ticket = randomUUID(),
    input = ticketQrInput({ keyId: "unit", showtimeId, ticketId: ticket }),
    id = randomUUID();
  return {
    id,
    requestId: id,
    showtimeId,
    ticketId:
      input +
      "." +
      sign(null, Buffer.from(input), pair.privateKey).toString("base64url"),
    gateId,
    staffId,
    deviceId: "test_device_001",
    createdAt: new Date().toISOString(),
    status: "pending",
    retryCount: 0,
    mode: "offline_admission",
  };
}
function ack(body: unknown, status = "synced") {
  const scans = (body as { scans: { scanId: string; ticketCode: string }[] })
    .scans;
  return {
    version: 2,
    results: scans.map((s) => ({
      scanId: s.scanId,
      ticketCode: s.ticketCode,
      status,
      code: "SCAN_RECORDED",
    })),
  };
}
const options = { showtimeId, checkServerBeforeSync: false };
beforeEach(() => {
  vi.resetAllMocks();
  _resetMemoryQueueForTesting();
  _setMockServerReachableForTesting(null);
  markServerOnline();
  actor.mockResolvedValue({
    id: staffId,
    email: "staff@demo.invalid",
    roles: ["STAFF"],
  });
  transport.mockImplementation(async (_path, decode, config) =>
    decode(ack(config?.body)),
  );
});
describe("S35/S37 canonical queue and batched ACK contract", () => {
  it("reports online empty counter; server failure changes network state without deleting records", async () => {
    expect(getCurrentNetworkStatus().isOnline).toBe(true);
    expect(await getPendingScanCount()).toBe(0);
    markServerOffline();
    expect(getCurrentNetworkStatus().isOnline).toBe(false);
    expect(await getPendingScanCount()).toBe(0);
  });
  it("counts new pending records exactly once and finds duplicate device ticket", async () => {
    const first = scan(),
      second = scan(),
      counts: number[] = [];
    const unsub = subscribePendingCount((c) => counts.push(c));
    await addPendingScan(first);
    await addPendingScan(second);
    expect(await getPendingScanCount(showtimeId)).toBe(2);
    expect(counts.at(-1)).toBe(2);
    expect((await getPendingScanByTicket(showtimeId, first.ticketId))?.id).toBe(
      first.id,
    );
    expect(await getPendingScanByTicket(showtimeId, "unknown")).toBeNull();
    unsub();
  });
  it("retains counter and original IDs until a validated server ACK arrives", async () => {
    const record = scan();
    await addPendingScan(record);
    let release: (() => void) | undefined;
    transport.mockImplementationOnce(async (_path, decode, config) => {
      await new Promise<void>((r) => {
        release = r;
      });
      return decode(ack(config?.body));
    });
    const pending = syncPendingScans(options);
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    expect(await getPendingScanCount()).toBe(1);
    expect((await getPendingScans())[0].requestId).toBe(record.id);
    release!();
    expect((await pending).syncedCount).toBe(1);
    expect(await getPendingScanCount()).toBe(0);
  });
  it("sends40records in one actual contract batch and counter reaches0 after40ACKs", async () => {
    const records = Array.from({ length: 40 }, scan);
    for (const item of records) await addPendingScan(item);
    const result = await syncPendingScans(options);
    expect(result.syncedCount).toBe(40);
    expect(result.remainingCount).toBe(0);
    expect(transport).toHaveBeenCalledTimes(1);
    const [path, , config] = transport.mock.calls[0];
    expect(path).toBe("/scanner/sync-scans");
    const sent = (config?.body as { scans: Record<string, unknown>[] }).scans;
    expect(sent).toHaveLength(40);
    expect(sent.map((s) => s.scanId)).toEqual(records.map((s) => s.id));
    expect(
      sent.every(
        (s) =>
          s.ticketCode === parseTicketQr(String(s.qrPayload))?.ticketId &&
          s.gateId === gateId &&
          s.deviceId === "test_device_001" &&
          s.mode === "offline_admission",
      ),
    ).toBe(true);
  });
  it("continues the next batch without exceeding40 or losing record41", async () => {
    for (let i = 0; i < 41; i++) await addPendingScan(scan());
    const result = await syncPendingScans(options);
    expect(result.syncedCount).toBe(41);
    expect(transport).toHaveBeenCalledTimes(2);
    expect(
      (transport.mock.calls[1][2]?.body as { scans: unknown[] }).scans,
    ).toHaveLength(1);
  });
  it("lost ACK keeps exact scan IDs/QR/gate/time and replay acknowledges without client duplicate", async () => {
    const record = scan();
    await addPendingScan(record);
    transport.mockRejectedValueOnce(
      new ApiError("lost ACK", 0, "NETWORK_ERROR"),
    );
    const failed = await syncPendingScans(options);
    expect(failed.stoppedDueToNetwork).toBe(true);
    expect(failed.remainingCount).toBe(1);
    expect((await getPendingScans())[0]).toMatchObject({
      id: record.id,
      ticketId: record.ticketId,
      retryCount: 1,
    });
    const first = (
      transport.mock.calls[0][2]?.body as { scans: Record<string, unknown>[] }
    ).scans[0];
    const retried = await syncPendingScans(options);
    expect(retried.remainingCount).toBe(0);
    const second = (
      transport.mock.calls[1][2]?.body as { scans: Record<string, unknown>[] }
    ).scans[0];
    for (const key of [
      "scanId",
      "ticketCode",
      "qrPayload",
      "gateId",
      "scannedAt",
      "deviceId",
      "mode",
    ])
      expect(second[key]).toBe(first[key]);
  });
  it.each([400, 401, 403, 409, 503])(
    "HTTP%d without per-item ACK never discards pending data",
    async (status) => {
      const record = scan();
      await addPendingScan(record);
      transport.mockRejectedValueOnce(
        new ApiError("safe server failure", status, "HTTP_" + status),
      );
      const result = await syncPendingScans(options);
      expect(result.remainingCount).toBe(1);
      expect((await getPendingScans())[0]).toMatchObject({
        id: record.id,
        retryCount: 1,
        status: "pending",
      });
    },
  );
  it("ACKed business rejection/conflict complete transport but are never counted as accepted admission", async () => {
    await addPendingScan(scan());
    transport.mockImplementationOnce(async (_path, decode, config) =>
      decode(ack(config?.body, "conflict")),
    );
    const result = await syncPendingScans(options);
    expect(result.syncedCount).toBe(0);
    expect(result.failedCount).toBe(1);
    expect(result.remainingCount).toBe(0);
  });
  it("partial ACK removes only acknowledged IDs and preserves the rest", async () => {
    const first = scan(),
      second = scan();
    await addPendingScan(first);
    await addPendingScan(second);
    transport.mockImplementationOnce(async (_path, decode, config) => {
      const reply = ack(config?.body);
      reply.results = reply.results.slice(0, 1);
      return decode(reply);
    });
    const result = await syncPendingScans(options);
    expect(result.totalProcessed).toBe(1);
    expect(result.remainingCount).toBe(1);
    expect((await getPendingScans())[0].id).toBe(second.id);
  });
  it("wrong or duplicate ACK identity is rejected before any queue deletion", async () => {
    const record = scan();
    await addPendingScan(record);
    transport.mockImplementationOnce(async (_path, decode) =>
      decode({
        version: 2,
        results: [
          { scanId: record.id, ticketCode: randomUUID(), status: "synced" },
        ],
      }),
    );
    expect((await syncPendingScans(options)).remainingCount).toBe(1);
  });
  it("another employee or unresolved legacy QR is retained for reconciliation", async () => {
    await addPendingScan({ ...scan(), staffId: randomUUID() });
    await addPendingScan({
      ...scan(),
      ticketId: "legacy",
      migrationIssue: "Missing signed QR",
    });
    const result = await syncPendingScans(options);
    expect(result.remainingCount).toBe(2);
    expect(transport).not.toHaveBeenCalled();
    expect(result.errors).toContain("Missing signed QR");
  });
  it("does not start a second transport while first batch is awaiting ACK", async () => {
    await addPendingScan(scan());
    let release: (() => void) | undefined;
    transport.mockImplementationOnce(async (_path, decode, config) => {
      await new Promise<void>((r) => {
        release = r;
      });
      return decode(ack(config?.body));
    });
    const pending = syncPendingScans(options);
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    const second = await syncPendingScans(options);
    expect(second.errors).toContain("Tiến trình đồng bộ khác đang chạy.");
    expect(transport).toHaveBeenCalledTimes(1);
    release!();
    await pending;
  });
  it("server probe failure blocks sync even when browser navigator online", async () => {
    await addPendingScan(scan());
    _setMockServerReachableForTesting(false);
    const result = await syncPendingScans({ showtimeId });
    expect(result.stoppedDueToNetwork).toBe(true);
    expect(result.remainingCount).toBe(1);
    expect(transport).not.toHaveBeenCalled();
  });
});
