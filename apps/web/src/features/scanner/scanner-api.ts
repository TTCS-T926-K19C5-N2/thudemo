import { api, object } from '@/lib/api/client';

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
  status: 'valid' | 'checked_in' | 'cancelled';
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
  };
  tickets: ScannerTicketPayload[];
}

export async function fetchAssignedShowtimes(): Promise<AssignedShowtime[]> {
  return api('/scanner/showtimes', (value: unknown) => {
    if (!Array.isArray(value)) return [];
    return value.map((item) => {
      const obj = object(item);
      return {
        id: String(obj.id),
        name: String(obj.name),
        eventName: String(obj.eventName),
        startTime: String(obj.startTime),
        location: String(obj.location ?? ''),
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
  const query = since ? `?since=${encodeURIComponent(since)}` : '';
  return api(
    `/scanner/showtimes/${showtimeId}/tickets${query}`,
    (value: unknown) => {
      const data = object(value);
      const ticketsRaw = Array.isArray(data.tickets) ? data.tickets : [];
      const pubKey = object(data.publicKey);

      return {
        showtimeId: String(data.showtimeId),
        showtimeName: String(data.showtimeName ?? ''),
        generatedAt: String(data.generatedAt),
        cursor: String(data.cursor),
        publicKey: {
          keyId: String(pubKey.keyId),
          key: String(pubKey.key),
        },
        tickets: ticketsRaw.map((t) => {
          const item = object(t);
          return {
            code: String(item.code),
            status: item.status as 'valid' | 'checked_in' | 'cancelled',
            checkedInAt: item.checkedInAt ? String(item.checkedInAt) : null,
            seatLabel: String(item.seatLabel ?? ''),
            ticketType: String(item.ticketType ?? ''),
          };
        }),
      };
    },
    { signal },
  );
}
