import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Query,
  Request,
  HttpCode,
  HttpStatus,
  Optional,
  BadRequestException,
} from '@nestjs/common';
import { SeatHoldService, HoldSeatsResult } from './seat-hold.service.js';
import { SeatAvailabilityQueryService, SeatStatusItem } from './queries/seat-availability.query.js';
import { SeatHoldCountdownService } from './services/seat-hold-countdown.service.js';
import type { SeatHoldCountdownResponseDto } from './dto/seat-hold-countdown.dto.js';
import type { ExpiredHoldsResponseDto } from './dto/expired-holds.dto.js';
import { HoldSeatsDto } from './dto/hold-seats.dto.js';
import { Public } from '../../auth/decorators/roles.decorator.js';

@Controller(['api/showtimes', 'showtimes'])
export class SeatHoldController {
  constructor(
    private readonly seatHoldService: SeatHoldService,
    private readonly seatAvailabilityQueryService: SeatAvailabilityQueryService,
    @Optional() private readonly countdownService?: SeatHoldCountdownService,
  ) {}

  @Public()
  @Post(':showtimeId/hold-seats')
  @HttpCode(HttpStatus.CREATED)
  async holdSeats(
    @Param('showtimeId') showtimeId: string,
    @Body() body: HoldSeatsDto,
    @Request() req: any,
  ): Promise<HoldSeatsResult> {
    HoldSeatsDto.validate(body);

    // Mockup userId từ Header/Body hoặc mặc định usr_mock_123 nếu chưa có Auth từ T-19
    const userId =
      req?.user?.id ||
      body.userId ||
      (req?.headers ? (req.headers['x-user-id'] as string) : undefined) ||
      'usr_mock_123';

    return this.seatHoldService.holdSeats({
      showtimeId,
      seatIds: body.seatIds,
      userId,
    });
  }

  /**
   * Truy vấn trạng thái ghế của suất chiếu (T-28)
   * Tự động lọc các ghế hết hạn và trả về AVAILABLE ngay lập tức
   */
  @Public()
  @Get(':showtimeId/seats')
  async getSeatsAvailability(
    @Param('showtimeId') showtimeId: string,
    @Query('seatIds') seatIdsQuery?: string,
  ): Promise<SeatStatusItem[]> {
    const seatIds = seatIdsQuery
      ? seatIdsQuery.split(',').map((s) => s.trim()).filter(Boolean)
      : [];

    return this.seatAvailabilityQueryService.getSeatsAvailability(showtimeId, seatIds);
  }

  /**
   * Truy vấn danh sách tất cả các lượt giữ chỗ đã hết hạn trong hệ thống (Task T-28)
   * GET /api/showtimes/expired-holds?showtimeId=...
   */
  @Public()
  @Get('expired-holds')
  async getExpiredHolds(
    @Query('showtimeId') showtimeId?: string,
  ): Promise<ExpiredHoldsResponseDto> {
    return this.seatAvailabilityQueryService.getExpiredHolds(showtimeId);
  }

  /**
   * Truy vấn danh sách các lượt giữ chỗ đã hết hạn theo suất chiếu cụ thể (Task T-28)
   * GET /api/showtimes/:showtimeId/expired-holds
   */
  @Public()
  @Get(':showtimeId/expired-holds')
  async getExpiredHoldsByShowtime(
    @Param('showtimeId') showtimeId: string,
  ): Promise<ExpiredHoldsResponseDto> {
    return this.seatAvailabilityQueryService.getExpiredHolds(showtimeId);
  }

  /**
   * Giải phóng/xóa các lượt giữ chỗ đã hết hạn theo suất chiếu (Task T-28)
   * POST /api/showtimes/:showtimeId/release-expired-holds
   */
  @Public()
  @Post(':showtimeId/release-expired-holds')
  @HttpCode(HttpStatus.OK)
  async releaseExpiredHoldsByShowtime(
    @Param('showtimeId') showtimeId: string,
  ): Promise<{ releasedCount: number; seatIds: string[] }> {
    return this.seatAvailabilityQueryService.releaseExpiredHolds(showtimeId);
  }


  /**
   * API Đếm ngược thời gian giữ ghế theo suất chiếu và ghế cụ thể (Task T-24)
   * GET /api/showtimes/:showtimeId/seats/:seatId/countdown
   */
  @Public()
  @Get(':showtimeId/seats/:seatId/countdown')
  async getSeatCountdown(
    @Param('showtimeId') showtimeId: string,
    @Param('seatId') seatId: string,
  ): Promise<SeatHoldCountdownResponseDto> {
    if (!this.countdownService) {
      const nowIso = new Date().toISOString();
      return { remainingSeconds: 0, isExpired: true, expiresAt: nowIso, showtimeId, seatId };
    }
    return this.countdownService.getCountdownBySeat(showtimeId, seatId);
  }

  /**
   * API Đếm ngược thời gian giữ ghế theo holdId (Task T-24)
   * GET /api/showtimes/:showtimeId/holds/:holdId/countdown
   */
  @Public()
  @Get(':showtimeId/holds/:holdId/countdown')
  async getHoldCountdown(
    @Param('showtimeId') _showtimeId: string,
    @Param('holdId') holdId: string,
  ): Promise<SeatHoldCountdownResponseDto> {
    if (!this.countdownService) {
      const nowIso = new Date().toISOString();
      return { remainingSeconds: 0, isExpired: true, expiresAt: nowIso, holdId };
    }
    return this.countdownService.getCountdownByHoldId(holdId);
  }

  /**
   * API Đếm ngược linh hoạt nhận query params (seatId, holdId hoặc expiresAt) (Task T-24)
   * GET /api/showtimes/:showtimeId/countdown?seatId=A1
   */
  @Public()
  @Get(':showtimeId/countdown')
  async getCountdown(
    @Param('showtimeId') showtimeId: string,
    @Query('seatId') seatId?: string,
    @Query('holdId') holdId?: string,
    @Query('expiresAt') expiresAt?: string,
  ): Promise<SeatHoldCountdownResponseDto> {
    if (!this.countdownService) {
      const nowIso = new Date().toISOString();
      return { remainingSeconds: 0, isExpired: true, expiresAt: nowIso, showtimeId };
    }

    if (expiresAt) {
      return this.countdownService.calculateCountdown(expiresAt);
    }
    if (seatId) {
      return this.countdownService.getCountdownBySeat(showtimeId, seatId);
    }
    if (holdId) {
      return this.countdownService.getCountdownByHoldId(holdId);
    }

    throw new BadRequestException('Vui lòng truyền seatId, holdId hoặc expiresAt để truy vấn đếm ngược');
  }
}
