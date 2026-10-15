import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  addPendingScan,
  getPendingScanByTicket,
  getPendingScanCount,
  getPendingScans,
  subscribePendingCount,
  _resetMemoryQueueForTesting,
  type PendingScan,
} from "./offline-queue";
import {
  getCurrentNetworkStatus,
  markServerOffline,
  markServerOnline,
  subscribeNetworkStatus,
  _setMockServerReachableForTesting,
} from "./network-status";
import { syncPendingScans } from "./sync-manager";
import { ApiError } from "@/lib/api/client";

// Mock client api
vi.mock("@/lib/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/client")>();
  return {
    ...actual,
    api: vi.fn(),
  };
});

import { api } from "@/lib/api/client";
const mockedApi = vi.mocked(api);

describe("S-37: Offline Status & Pending Scan Counter", () => {
  const showtimeId = "showtime-uuid-001";
  const gateId = "gate-uuid-001";

  beforeEach(async () => {
    vi.clearAllMocks();
    _resetMemoryQueueForTesting();
    _setMockServerReachableForTesting(null);
    markServerOnline();
  });

  describe("1. Online, không có dữ liệu chờ", () => {
    it("báo trạng thái trực tuyến và bộ đếm bằng 0", async () => {
      markServerOnline();
      const status = getCurrentNetworkStatus();
      expect(status.isOnline).toBe(true);

      const count = await getPendingScanCount(showtimeId);
      expect(count).toBe(0);
    });
  });

  describe("2. Mất mạng & phát hiện trạng thái ngoại tuyến", () => {
    it("chuyển sang Offline kịp thời và giữ đúng số lượt chờ", async () => {
      let latestOnline = true;
      const unsubscribe = subscribeNetworkStatus((state) => {
        latestOnline = state.isOnline;
      });

      // Mất mạng
      markServerOffline("Mất kết nối mạng");
      expect(latestOnline).toBe(false);
      expect(getCurrentNetworkStatus().isOnline).toBe(false);

      const count = await getPendingScanCount(showtimeId);
      expect(count).toBe(0);

      unsubscribe();
    });
  });

  describe("3. Tạo lượt quét khi ngoại tuyến (AC1)", () => {
    it("lưu lượt quét vào hàng đợi offline và bộ đếm tăng chính xác", async () => {
      markServerOffline();

      let subscriberCount = 0;
      const unsub = subscribePendingCount((cnt) => {
        subscriberCount = cnt;
      });

      const scan1: PendingScan = {
        id: "req-1",
        showtimeId,
        ticketId: "TK-001",
        gateId,
        requestId: "req-1",
        createdAt: new Date().toISOString(),
        status: "pending",
        retryCount: 0,
      };

      await addPendingScan(scan1);
      expect(subscriberCount).toBe(1);
      expect(await getPendingScanCount(showtimeId)).toBe(1);

      const scan2: PendingScan = {
        id: "req-2",
        showtimeId,
        ticketId: "TK-002",
        gateId,
        requestId: "req-2",
        createdAt: new Date(Date.now() + 1000).toISOString(),
        status: "pending",
        retryCount: 0,
      };

      await addPendingScan(scan2);
      expect(subscriberCount).toBe(2);
      expect(await getPendingScanCount(showtimeId)).toBe(2);

      // Dữ liệu quét được lưu trữ đầy đủ
      const stored = await getPendingScans(showtimeId);
      expect(stored).toHaveLength(2);
      expect(stored[0].ticketId).toBe("TK-001");
      expect(stored[1].ticketId).toBe("TK-002");

      unsub();
    });

    it("phát hiện lượt quét trùng ngay khi ngoại tuyến", async () => {
      const scan: PendingScan = {
        id: "req-1",
        showtimeId,
        ticketId: "TK-DUPLICATE",
        gateId,
        requestId: "req-1",
        createdAt: new Date().toISOString(),
        status: "pending",
        retryCount: 0,
      };

      await addPendingScan(scan);
      const duplicate = await getPendingScanByTicket(showtimeId, "TK-DUPLICATE");
      expect(duplicate).not.toBeNull();
      expect(duplicate?.requestId).toBe("req-1");
    });
  });

  describe("4. Có mạng trở lại & bắt đầu đồng bộ (AC2)", () => {
    it("giữ nguyên bộ đếm trong lúc request đang gửi, không giảm trước khi server xác nhận", async () => {
      const scan: PendingScan = {
        id: "req-1",
        showtimeId,
        ticketId: "TK-001",
        gateId,
        requestId: "req-1",
        createdAt: new Date().toISOString(),
        status: "pending",
        retryCount: 0,
      };
      await addPendingScan(scan);
      expect(await getPendingScanCount(showtimeId)).toBe(1);

      let countDuringSync = -1;
      // Server xử lý chậm, trong lúc request bay đi kiểm tra count
      mockedApi.mockImplementationOnce(async () => {
        countDuringSync = await getPendingScanCount(showtimeId);
        return {
          status: "SUCCESS",
          ticketId: "TK-001",
          gateName: "Cửa 1",
          kind: "NORMAL",
          seat: { category: "VIP", row: "A", number: 1, label: "A-1" },
          checkedInAt: new Date().toISOString(),
        };
      });

      await syncPendingScans({ showtimeId, checkServerBeforeSync: false });

      // Trong lúc request đang gửi, bộ đếm không giảm!
      expect(countDuringSync).toBe(1);

      // Sau khi server xác nhận thành công, bộ đếm mới giảm về 0
      expect(await getPendingScanCount(showtimeId)).toBe(0);
    });
  });

  describe("5. Đồng bộ thành công (AC2)", () => {
    it("đánh dấu hoàn tất, giảm bộ đếm và trở về 0 khi xong toàn bộ", async () => {
      _setMockServerReachableForTesting(true);
      markServerOffline();

      await addPendingScan({
        id: "req-1",
        showtimeId,
        ticketId: "TK-001",
        gateId,
        requestId: "req-1",
        createdAt: new Date(Date.now() - 2000).toISOString(),
        status: "pending",
        retryCount: 0,
      });

      await addPendingScan({
        id: "req-2",
        showtimeId,
        ticketId: "TK-002",
        gateId,
        requestId: "req-2",
        createdAt: new Date(Date.now() - 1000).toISOString(),
        status: "pending",
        retryCount: 0,
      });

      expect(await getPendingScanCount(showtimeId)).toBe(2);

      // Mock server trả về 200 cho cả 2 lượt
      mockedApi.mockResolvedValue({
        status: "SUCCESS",
        ticketId: "TK-test",
        gateName: "Cửa 1",
        kind: "NORMAL",
        seat: { category: "VIP", row: "A", number: 1, label: "A-1" },
        checkedInAt: new Date().toISOString(),
      });

      const result = await syncPendingScans({
        showtimeId,
        checkServerBeforeSync: false,
      });

      expect(result.syncedCount).toBe(2);
      expect(result.remainingCount).toBe(0);
      expect(await getPendingScanCount(showtimeId)).toBe(0);
      expect(getCurrentNetworkStatus().isOnline).toBe(true);
    });

    it("xử lý phản hồi ALREADY_RECORDED như thành công (idempotent)", async () => {
      await addPendingScan({
        id: "req-replay",
        showtimeId,
        ticketId: "TK-REPLAY",
        gateId,
        requestId: "req-replay",
        createdAt: new Date().toISOString(),
        status: "pending",
        retryCount: 0,
      });

      // Server trả về ALREADY_RECORDED vì requestId đã tồn tại
      mockedApi.mockResolvedValueOnce({
        status: "ALREADY_RECORDED",
        ticketId: "TK-REPLAY",
        gateName: "Cửa 1",
        kind: "NORMAL",
        seat: { category: "VIP", row: "A", number: 1, label: "A-1" },
        checkedInAt: new Date().toISOString(),
      });

      const result = await syncPendingScans({
        showtimeId,
        checkServerBeforeSync: false,
      });

      expect(result.syncedCount).toBe(1);
      expect(result.remainingCount).toBe(0);
      expect(await getPendingScanCount(showtimeId)).toBe(0);
    });
  });

  describe("6. Đồng bộ thất bại hoặc timeout (AC1 & AC2)", () => {
    it("giữ nguyên dữ liệu trong hàng đợi khi gặp lỗi mạng và dừng tiến trình", async () => {
      await addPendingScan({
        id: "req-net-fail",
        showtimeId,
        ticketId: "TK-FAIL",
        gateId,
        requestId: "req-net-fail",
        createdAt: new Date().toISOString(),
        status: "pending",
        retryCount: 0,
      });

      // Mock lỗi mạng (status 0)
      mockedApi.mockRejectedValueOnce(
        new ApiError("Không thể kết nối máy chủ", 0, "NETWORK_ERROR"),
      );

      const result = await syncPendingScans({
        showtimeId,
        checkServerBeforeSync: false,
      });

      expect(result.stoppedDueToNetwork).toBe(true);
      expect(result.remainingCount).toBe(1);

      // Không mất dữ liệu, lượt quét vẫn còn trong hàng đợi
      const pending = await getPendingScans(showtimeId);
      expect(pending).toHaveLength(1);
      expect(pending[0].id).toBe("req-net-fail");
      expect(pending[0].retryCount).toBe(1);

      // Trạng thái mạng chuyển sang offline
      expect(getCurrentNetworkStatus().isOnline).toBe(false);
    });

    it("loại bỏ lỗi nghiệp vụ 4xx không thể khắc phục để tránh retry vô hạn", async () => {
      await addPendingScan({
        id: "req-invalid",
        showtimeId,
        ticketId: "TK-INVALID",
        gateId,
        requestId: "req-invalid",
        createdAt: new Date().toISOString(),
        status: "pending",
        retryCount: 0,
      });

      // 400 Bad Request
      mockedApi.mockRejectedValueOnce(
        new ApiError("Chữ ký QR không hợp lệ", 400, "INVALID_QR_SIGNATURE"),
      );

      const result = await syncPendingScans({
        showtimeId,
        checkServerBeforeSync: false,
      });

      expect(result.failedCount).toBe(1);
      expect(result.remainingCount).toBe(0);
      expect(await getPendingScanCount(showtimeId)).toBe(0);
    });

    it("giữ lượt quét chưa xác nhận khi máy chủ trả lỗi 5xx", async () => {
      await addPendingScan({
        id: "req-server-error",
        showtimeId,
        ticketId: "TK-SERVER-ERROR",
        gateId,
        requestId: "req-server-error",
        createdAt: new Date().toISOString(),
        status: "pending",
        retryCount: 0,
      });
      mockedApi.mockRejectedValueOnce(
        new ApiError("Máy chủ tạm thời không khả dụng", 503, "HTTP_503"),
      );

      const result = await syncPendingScans({
        showtimeId,
        checkServerBeforeSync: false,
      });

      expect(result.stoppedDueToNetwork).toBe(true);
      expect(result.remainingCount).toBe(1);
      expect(await getPendingScanCount(showtimeId)).toBe(1);
      expect((await getPendingScans(showtimeId))[0].retryCount).toBe(1);
    });
  });

  describe("7. Khởi động lại ứng dụng / Khôi phục hàng đợi", () => {
    it("khôi phục chính xác danh sách và số lượng lượt chờ sau khi mở lại", async () => {
      await addPendingScan({
        id: "scan-persist-1",
        showtimeId,
        ticketId: "TK-P1",
        gateId,
        requestId: "scan-persist-1",
        createdAt: "2026-10-13T10:00:00.000Z",
        status: "pending",
        retryCount: 0,
      });

      await addPendingScan({
        id: "scan-persist-2",
        showtimeId,
        ticketId: "TK-P2",
        gateId,
        requestId: "scan-persist-2",
        createdAt: "2026-10-13T10:01:00.000Z",
        status: "pending",
        retryCount: 0,
      });

      // Query lại từ nguồn dữ liệu
      const reloadedScans = await getPendingScans(showtimeId);
      expect(reloadedScans).toHaveLength(2);
      expect(reloadedScans[0].ticketId).toBe("TK-P1");
      expect(reloadedScans[1].ticketId).toBe("TK-P2");
      expect(await getPendingScanCount(showtimeId)).toBe(2);
    });
  });

  describe("8. Chống đồng bộ trùng lặp (Concurrency Guard)", () => {
    it("ngăn chặn chạy nhiều tiến trình đồng bộ cùng lúc", async () => {
      await addPendingScan({
        id: "req-slow",
        showtimeId,
        ticketId: "TK-SLOW",
        gateId,
        requestId: "req-slow",
        createdAt: new Date().toISOString(),
        status: "pending",
        retryCount: 0,
      });

      // Lần gọi 1 kéo dài thời gian
      let resolveFirstCall: (value: unknown) => void = () => {};
      const firstCallPromise = new Promise((resolve) => {
        resolveFirstCall = resolve;
      });

      mockedApi.mockImplementationOnce(() => firstCallPromise as Promise<never>);

      const syncPromise1 = syncPendingScans({
        showtimeId,
        checkServerBeforeSync: false,
      });

      // Lần gọi 2 được kích hoạt ngay khi lần 1 đang chạy
      const syncPromise2 = syncPendingScans({
        showtimeId,
        checkServerBeforeSync: false,
      });

      const res2 = await syncPromise2;
      expect(res2.errors).toContain("Tiến trình đồng bộ khác đang chạy.");

      // Kết thúc lần 1
      resolveFirstCall({
        status: "SUCCESS",
        ticketId: "TK-SLOW",
        gateName: "Cửa 1",
        kind: "NORMAL",
        seat: { category: "VIP", row: "A", number: 1, label: "A-1" },
        checkedInAt: new Date().toISOString(),
      });

      const res1 = await syncPromise1;
      expect(res1.syncedCount).toBe(1);
    });
  });
});
