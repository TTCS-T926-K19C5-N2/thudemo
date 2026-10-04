export interface SeatHoldCountdownResponseDto {
  remainingSeconds: number;
  isExpired: boolean;
  expiresAt: string;
  showtimeId?: string;
  seatId?: string;
  holdId?: string;
}
