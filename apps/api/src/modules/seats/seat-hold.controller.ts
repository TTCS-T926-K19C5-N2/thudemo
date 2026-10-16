import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  Query,
  Request,
  HttpCode,
  Optional,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { SeatHoldService, HoldSeatsResult, SeatHoldRecord } from './seat-hold.service.js';
import { SeatAvailabilityQueryService, SeatStatusItem } from './queries/seat-availability.query.js';
import { SeatHoldCountdownService } from './services/seat-hold-countdown.service.js';
import type { SeatHoldCountdownResponseDto } from './dto/seat-hold-countdown.dto.js';
import { HoldSeatsDto } from './dto/hold-seats.dto.js';
import { Public } from '../../auth/decorators/roles.decorator.js';

@Controller(['api/showtimes', 'showtimes'])
export class SeatHoldController {
  constructor(
    private readonly seatHoldService: SeatHoldService,
    private readonly seatAvailabilityQueryService: SeatAvailabilityQueryService,
    @Optional() private readonly countdownService?: SeatHoldCountdownService,
  ) {}

  /**
   * API Giữ ghế (Task T-23)
   * Method: POST /api/showtimes/:showtimeId/hold-seats
   * Response: 201 Created kèm { success, holdId, showtimeId, seatIds, heldSeats, expiresInSeconds, expiresAt }
   */
  @Public()
  @Post(':showtimeId/hold-seats')
  @HttpCode(HttpStatus.CREATED)
  async holdSeats(
    @Param('showtimeId') showtimeId: string,
    @Body() body: HoldSeatsDto,
    @Request() req: any,
  ): Promise<HoldSeatsResult> {
    HoldSeatsDto.validate(body);

    const userId =
      req?.user?.id ||
      body.userId ||
      (req?.headers ? (req.headers['x-user-id'] as string) : undefined) ||
      'usr_mock_123';

    return this.seatHoldService.holdSeats({
      showtimeId,
      seatIds: body.seatIds,
      userId,
      holdId: body.holdId,
      ttlSeconds: body.ttlSeconds,
    });
  }

  /**
   * Truy vấn trạng thái ghế của suất chiếu (T-28)
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

  /**
   * Lấy chi tiết thông tin giữ ghế theo holdId
   */
  @Public()
  @Get(':showtimeId/holds/:holdId')
  async getHold(
    @Param('showtimeId') _showtimeId: string,
    @Param('holdId') holdId: string,
  ): Promise<SeatHoldRecord> {
    const hold = await this.seatHoldService.getHold(holdId);
    if (!hold) {
      throw new NotFoundException(`Không tìm thấy phiên giữ ghế với holdId: ${holdId}`);
    }
    return hold;
  }

  /**
   * Hủy / giải phóng giữ ghế theo holdId
   */
  @Public()
  @Delete(':showtimeId/holds/:holdId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async releaseHold(
    @Param('showtimeId') _showtimeId: string,
    @Param('holdId') holdId: string,
  ): Promise<void> {
    const deleted = await this.seatHoldService.deleteHold(holdId);
    if (!deleted) {
      throw new NotFoundException(`Không tìm thấy phiên giữ ghế để hủy với holdId: ${holdId}`);
    }
  }

  /**
   * Giải phóng danh sách ghế theo showtimeId
   */
  @Public()
  @Delete(':showtimeId/hold-seats')
  @HttpCode(HttpStatus.NO_CONTENT)
  async releaseSeats(
    @Param('showtimeId') showtimeId: string,
    @Body() body: { seatIds: string[] },
  ): Promise<void> {
    if (body?.seatIds && Array.isArray(body.seatIds)) {
      await this.seatHoldService.releaseSeats(showtimeId, body.seatIds);
    }
  }
}
