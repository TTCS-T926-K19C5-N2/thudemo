import { api, object } from "./api/client";

export type TodayShowtimeS29 = {
  id: string;
  startTime: string;
  eventName: string;
  location?: string;
  status: string;
};

export function decodeTodayShowtimes(value: unknown): TodayShowtimeS29[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => {
    const obj = object(v);
    return {
      id: String(obj.id),
      startTime: String(obj.startTime),
      eventName: String(obj.eventName),
      location: obj.location ? String(obj.location) : undefined,
      status: String(obj.status),
    };
  });
}

export async function fetchTodayShowtimesS29(): Promise<TodayShowtimeS29[]> {
  return await api("/check-in/today", decodeTodayShowtimes);
}
