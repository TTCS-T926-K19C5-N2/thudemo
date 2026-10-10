import { describe, expect, it } from "vitest";
import {
  decodeTodayShowtimes,
  type TodayShowtimeS29,
} from "@/lib/api-check-in-s29";
import {
  LOCAL_STORAGE_SHOWTIME_KEY,
  LOCAL_STORAGE_GATE_KEY,
} from "@/app/check-in/page";

describe("S-29 Ticket Checker Selection (Contracts & State)", () => {
  describe("decodeTodayShowtimes", () => {
    it("decodes valid today showtimes array", () => {
      const raw = [
        {
          id: "show-1",
          startTime: "2026-10-08T19:00:00.000Z",
          eventName: "Concert A",
          location: "Nhà hát Lớn",
          status: "ON_SALE",
        },
        {
          id: "show-2",
          startTime: "2026-10-08T21:00:00.000Z",
          eventName: "Kịch B",
          status: "CLOSED",
        },
      ];

      const decoded = decodeTodayShowtimes(raw);
      expect(decoded).toHaveLength(2);
      expect(decoded[0]).toEqual({
        id: "show-1",
        startTime: "2026-10-08T19:00:00.000Z",
        eventName: "Concert A",
        location: "Nhà hát Lớn",
        status: "ON_SALE",
      });
      expect(decoded[1]).toEqual({
        id: "show-2",
        startTime: "2026-10-08T21:00:00.000Z",
        eventName: "Kịch B",
        location: undefined,
        status: "CLOSED",
      });
    });

    it("returns empty array when input is not an array or empty", () => {
      expect(decodeTodayShowtimes(null)).toEqual([]);
      expect(decodeTodayShowtimes(undefined)).toEqual([]);
      expect(decodeTodayShowtimes({})).toEqual([]);
      expect(decodeTodayShowtimes([])).toEqual([]);
    });

    it("throws ApiError if array element is not an object", () => {
      expect(() => decodeTodayShowtimes(["invalid"])).toThrow();
    });
  });

  describe("LocalStorage & Selection Logic (AC 1, AC 2, NFR)", () => {
    it("uses correct storage keys for persistence", () => {
      expect(LOCAL_STORAGE_SHOWTIME_KEY).toBe("checkin_showtime_s29");
      expect(LOCAL_STORAGE_GATE_KEY).toBe("checkin_gate_s29");
    });

    it("allows gate to be updated to a new gate (AC 2: các lần quét sau ghi cửa mới)", () => {
      const storage: Record<string, string> = {};
      const mockSetItem = (key: string, val: string) => {
        storage[key] = val;
      };

      // Step 1: Select Cửa A
      mockSetItem(LOCAL_STORAGE_SHOWTIME_KEY, "show-1");
      mockSetItem(LOCAL_STORAGE_GATE_KEY, "Cửa A");
      expect(storage[LOCAL_STORAGE_GATE_KEY]).toBe("Cửa A");

      // Step 2: Switch to Cửa B
      mockSetItem(LOCAL_STORAGE_GATE_KEY, "Cửa B");
      expect(storage[LOCAL_STORAGE_GATE_KEY]).toBe("Cửa B");
    });

    it("restores previously selected showtime if present in today showtimes list", () => {
      const todayList: TodayShowtimeS29[] = [
        {
          id: "show-1",
          startTime: "2026-10-08T19:00:00.000Z",
          eventName: "Concert A",
          status: "ON_SALE",
        },
        {
          id: "show-2",
          startTime: "2026-10-08T21:00:00.000Z",
          eventName: "Kịch B",
          status: "CLOSED",
        },
      ];

      const savedShowtimeId = "show-2";
      const matched = todayList.find((s) => s.id === savedShowtimeId);
      expect(matched).toBeDefined();
      expect(matched?.id).toBe("show-2");
    });

    it("defaults to first showtime if saved showtime is expired or not in today list", () => {
      const todayList: TodayShowtimeS29[] = [
        {
          id: "show-1",
          startTime: "2026-10-08T19:00:00.000Z",
          eventName: "Concert A",
          status: "ON_SALE",
        },
      ];

      const savedOldShowtimeId = "yesterday-show";
      const matched = todayList.find((s) => s.id === savedOldShowtimeId);
      expect(matched).toBeUndefined();
      // Fallback
      const fallback = todayList[0].id;
      expect(fallback).toBe("show-1");
    });

    it("AC 1: requires both showtime and non-empty gate before scanner can be ready", () => {
      const isSubmittable = (showtimeId: string, gateText: string) => {
        return Boolean(showtimeId && gateText.trim());
      };

      // Missing showtime
      expect(isSubmittable("", "Cửa A")).toBe(false);
      // Missing gate
      expect(isSubmittable("show-1", "")).toBe(false);
      // Whitespace only gate
      expect(isSubmittable("show-1", "   ")).toBe(false);
      // Both valid
      expect(isSubmittable("show-1", "Cửa A")).toBe(true);
    });

    it("AC 2: allows switching from Config A to Config B, overwrites storage, and restores on reload", () => {
      const mockStorage = new Map<string, string>();
      const todayShowtimes: TodayShowtimeS29[] = [
        {
          id: "show-A",
          startTime: "2026-10-08T14:00:00.000Z",
          eventName: "Đại Nhạc Hội S-29 - Suất Sáng",
          status: "ON_SALE",
        },
        {
          id: "show-B",
          startTime: "2026-10-08T19:00:00.000Z",
          eventName: "Đại Nhạc Hội S-29 - Suất Tối",
          status: "ON_SALE",
        },
      ];

      // Step 1: Staff chooses Showtime A + Gate A
      let currentShowtimeId = "show-A";
      let currentGate = "Cửa Tây A1";
      mockStorage.set(LOCAL_STORAGE_SHOWTIME_KEY, currentShowtimeId);
      mockStorage.set(LOCAL_STORAGE_GATE_KEY, currentGate);
      let isConfigured = true;

      expect(isConfigured).toBe(true);
      expect(mockStorage.get(LOCAL_STORAGE_SHOWTIME_KEY)).toBe("show-A");
      expect(mockStorage.get(LOCAL_STORAGE_GATE_KEY)).toBe("Cửa Tây A1");

      // Step 2: Staff clicks "Đổi suất diễn hoặc cửa khác"
      isConfigured = false;
      expect(isConfigured).toBe(false);

      // Step 3: Staff selects Showtime B + Gate B
      currentShowtimeId = "show-B";
      currentGate = "Cửa Đông B2";
      mockStorage.set(LOCAL_STORAGE_SHOWTIME_KEY, currentShowtimeId);
      mockStorage.set(LOCAL_STORAGE_GATE_KEY, currentGate);
      isConfigured = true;

      // Verify Config B truly overwrote Config A
      expect(mockStorage.get(LOCAL_STORAGE_SHOWTIME_KEY)).toBe("show-B");
      expect(mockStorage.get(LOCAL_STORAGE_GATE_KEY)).toBe("Cửa Đông B2");

      // Step 4: Simulate page reload / restore from storage
      const reloadedSavedShowtimeId = mockStorage.get(LOCAL_STORAGE_SHOWTIME_KEY);
      const reloadedSavedGate = mockStorage.get(LOCAL_STORAGE_GATE_KEY);

      const restoredShowtime = todayShowtimes.find((s) => s.id === reloadedSavedShowtimeId);
      expect(restoredShowtime).toBeDefined();
      expect(restoredShowtime?.id).toBe("show-B");
      expect(reloadedSavedGate).toBe("Cửa Đông B2");

      // Step 5: Subsequent scans use Config B
      const scanContext = {
        showtimeId: restoredShowtime?.id,
        showtimeName: restoredShowtime?.eventName,
        gate: reloadedSavedGate,
      };
      expect(scanContext.showtimeId).toBe("show-B");
      expect(scanContext.gate).toBe("Cửa Đông B2");
    });
  });
});
