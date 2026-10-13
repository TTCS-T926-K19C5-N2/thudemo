import { api, object } from "@/lib/api/client";

export interface AssignedShowtime {
  id: string;
  name: string;
  eventName: string;
  startTime: string;
  location: string;
  status: string;
  totalTickets: number;
  checkedInTickets: number;
}

export interface ScannerTicketPayload {
  code: string;
  status: "valid" | "checked_in" | "cancelled";
  checkedInAt: string | null;
  seatLabel: string;
  ticketType: string;
}

export interface ShowtimeTicketsPayload {
  showtimeId: string;
  showtimeName: string;
  generatedAt: string;
  cursor: string;
  publicKey: {
    keyId: string;
    key: string;
    verificationKeys?: { keyId: string; key: string }[];
  };
  tickets: ScannerTicketPayload[];
}

export async function fetchAssignedShowtimes(): Promise<AssignedShowtime[]> {
  return api("/scanner/showtimes", (value: unknown) => {
    if (!Array.isArray(value)) return [];
    return value.map((item) => {
      const obj = object(item);
      return {
        id: String(obj.id),
        name: String(obj.name),
        eventName: String(obj.eventName),
        startTime: String(obj.startTime),
        location: String(obj.location ?? ""),
        status: String(obj.status),
        totalTickets: Number(obj.totalTickets ?? 0),
        checkedInTickets: Number(obj.checkedInTickets ?? 0),
      };
    });
  });
}

export async function fetchShowtimeTickets(
  showtimeId: string,
  since?: string,
  signal?: AbortSignal,
): Promise<ShowtimeTicketsPayload> {
  const query = since ? `?since=${encodeURIComponent(since)}` : "";
  return api(
    `/scanner/showtimes/${showtimeId}/tickets${query}`,
    (value: unknown) => {
      const data = object(value);
      const ticketsRaw = Array.isArray(data.tickets) ? data.tickets : [];
      const pubKey = object(data.publicKey);

      return {
        showtimeId: String(data.showtimeId),
        showtimeName: String(data.showtimeName ?? ""),
        generatedAt: String(data.generatedAt),
        cursor: String(data.cursor),
        publicKey: {
          keyId: String(pubKey.keyId),
          key: String(pubKey.key),
          verificationKeys: Array.isArray(pubKey.verificationKeys)
            ? pubKey.verificationKeys.map((raw) => {
                const key = object(raw);
                return { keyId: String(key.keyId), key: String(key.key) };
              })
            : [{ keyId: String(pubKey.keyId), key: String(pubKey.key) }],
        },
        tickets: ticketsRaw.map((t) => {
          const item = object(t);
          return {
            code: String(item.code),
            status: item.status as "valid" | "checked_in" | "cancelled",
            checkedInAt: item.checkedInAt ? String(item.checkedInAt) : null,
            seatLabel: String(item.seatLabel ?? ""),
            ticketType: String(item.ticketType ?? ""),
          };
        }),
      };
    },
    { signal },
  );
}

export interface OfflineScanPayloadItem {
  scanId: string;
  ticketCode: string;
  gate: string;
  deviceId?: string;
  scannedAt: string;
}

export interface SyncResultPayloadItem {
  scanId: string;
  ticketCode: string;
  status: "ACCEPTED" | "DUPLICATE" | "CONFLICT" | "NOT_FOUND";
  message?: string;
}

export interface SyncOfflineScansResponsePayload {
  showtimeId: string;
  totalReceived: number;
  acceptedCount: number;
  duplicateCount: number;
  conflictCount: number;
  results: SyncResultPayloadItem[];
}

export interface ScanConflictPayloadItem {
  id: string;
  showtimeId: string;
  ticketCode: string;
  firstGate: string;
  firstScannedAt: string;
  conflictGate: string;
  conflictScannedAt: string;
  createdAt: string;
}

export interface RealtimeEntryStatsPayload {
  showtimeId: string;
  showtimeName: string;
  startTime: string;
  totalTickets: number;
  checkedInTickets: number;
  remainingTickets: number;
  entryRatePerMinute: number;
  gateStats: Array<{ gate: string; enteredCount: number }>;
  updatedAt: string;
}

export async function syncOfflineScansApi(
  showtimeId: string,
  scans: OfflineScanPayloadItem[],
): Promise<SyncOfflineScansResponsePayload> {
  return api(
    `/scanner/showtimes/${showtimeId}/sync`,
    (value: unknown) => {
      const data = object(value);
      const resultsRaw = Array.isArray(data.results) ? data.results : [];
      return {
        showtimeId: String(data.showtimeId),
        totalReceived: Number(data.totalReceived ?? 0),
        acceptedCount: Number(data.acceptedCount ?? 0),
        duplicateCount: Number(data.duplicateCount ?? 0),
        conflictCount: Number(data.conflictCount ?? 0),
        results: resultsRaw.map((r) => {
          const item = object(r);
          return {
            scanId: String(item.scanId),
            ticketCode: String(item.ticketCode),
            status: item.status as "ACCEPTED" | "DUPLICATE" | "CONFLICT" | "NOT_FOUND",
            message: item.message ? String(item.message) : undefined,
          };
        }),
      };
    },
    {
      method: "POST",
      body: JSON.stringify({ scans }),
    },
  );
}

export async function fetchShowtimeConflicts(
  showtimeId: string,
): Promise<ScanConflictPayloadItem[]> {
  return api(
    `/scanner/showtimes/${showtimeId}/conflicts`,
    (value: unknown) => {
      if (!Array.isArray(value)) return [];
      return value.map((c) => {
        const item = object(c);
        return {
          id: String(item.id),
          showtimeId: String(item.showtimeId),
          ticketCode: String(item.ticketCode),
          firstGate: String(item.firstGate),
          firstScannedAt: String(item.firstScannedAt),
          conflictGate: String(item.conflictGate),
          conflictScannedAt: String(item.conflictScannedAt),
          createdAt: String(item.createdAt),
        };
      });
    },
  );
}

export async function fetchRealtimeStats(
  showtimeId: string,
): Promise<RealtimeEntryStatsPayload> {
  return api(
    `/scanner/showtimes/${showtimeId}/realtime-stats`,
    (value: unknown) => {
      const data = object(value);
      const gatesRaw = Array.isArray(data.gateStats) ? data.gateStats : [];
      return {
        showtimeId: String(data.showtimeId),
        showtimeName: String(data.showtimeName),
        startTime: String(data.startTime),
        totalTickets: Number(data.totalTickets ?? 0),
        checkedInTickets: Number(data.checkedInTickets ?? 0),
        remainingTickets: Number(data.remainingTickets ?? 0),
        entryRatePerMinute: Number(data.entryRatePerMinute ?? 0),
        gateStats: gatesRaw.map((g) => {
          const item = object(g);
          return {
            gate: String(item.gate),
            enteredCount: Number(item.enteredCount ?? 0),
          };
        }),
        updatedAt: String(data.updatedAt),
      };
    },
  );
}
