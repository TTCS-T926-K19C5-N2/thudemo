export type SeatStatus = 'AVAILABLE' | 'HELD' | 'SOLD';

export interface SeatStatusResponseDto {
  id: string;
  showtimeId: string;
  seatRow: string;
  seatNumber: number;
  seatCategoryId: string | null;
  categoryName: string | null;
  price: number | null;
  color: string;
  status: SeatStatus;
  holdExpiresAt: string | null;
  isMyHold: boolean;
}

export interface ShowtimeSeatSummaryDto {
  showtimeId: string;
  totalSeats: number;
  availableCount: number;
  heldCount: number;
  soldCount: number;
  queryDurationMs: number;
  seats: SeatStatusResponseDto[];
}
