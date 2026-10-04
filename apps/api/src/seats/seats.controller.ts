import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { Public, Roles } from '../auth/decorators/roles.decorator.js';
import { Role } from '@prisma/client';
import { ImportSeatsDto } from './dto/import-seats.dto.js';
import { SeatsService } from './seats.service.js';

@Controller('seats')
export class SeatsController {
  constructor(private readonly seatsService: SeatsService) {}

  /**
   * TASK T-19: Lấy toàn bộ trạng thái ghế theo suất diễn (AVAILABLE, HELD, SOLD)
   * Public endpoint cho phép khách truy cập xem sơ đồ ghế
   */
  @Public()
  @Get('status/:showtimeId')
  getStatus(
    @Param('showtimeId') showtimeId: string,
    @Req() request: any,
  ) {
    const currentUserId = request.user?.id;
    return this.seatsService.getSeatStatusByShowtime(showtimeId, currentUserId);
  }

  /**
   * Alias endpoint: GET /seats/showtime/:showtimeId/status
   */
  @Public()
  @Get('showtime/:showtimeId/status')
  getShowtimeStatus(
    @Param('showtimeId') showtimeId: string,
    @Req() request: any,
  ) {
    const currentUserId = request.user?.id;
    return this.seatsService.getSeatStatusByShowtime(showtimeId, currentUserId);
  }

  // T-12: API Import sơ đồ ghế
  @Public()
  @Post('import')
  @HttpCode(HttpStatus.CREATED)
  async importSeats(@Body() dto: ImportSeatsDto) {
    return this.seatsService.importSeats(dto);
  }

  // T-13: API Lấy sơ đồ ghế theo suất diễn (Public)
  @Public()
  @Get('showtime/:showtimeId')
  async getSeatsByShowtime(@Param('showtimeId') showtimeId: string) {
    return this.seatsService.getSeatsByShowtime(showtimeId);
  }

  // T-14: API Lấy danh sách hạng ghế theo suất diễn (Public)
  @Public()
  @Get('categories/showtime/:showtimeId')
  async getSeatCategoriesByShowtime(@Param('showtimeId') showtimeId: string) {
    return this.seatsService.getSeatCategoriesByShowtime(showtimeId);
  }

  /**
   * Giữ ghế tạm thời (phục vụ test và tích hợp)
   */
  @Roles(Role.BUYER, Role.ORGANIZER, Role.ADMIN, Role.STAFF)
  @Post(':seatId/hold')
  holdSeat(
    @Param('seatId') seatId: string,
    @Req() request: any,
    @Body() body: { ttlSeconds?: number },
  ) {
    return this.seatsService.holdSeat(
      seatId,
      request.user?.id,
      body?.ttlSeconds ?? 600,
    );
  }

  /**
   * TASK T-25: Bỏ chọn ghế / hủy lượt giữ chỗ
   */
  @Roles(Role.BUYER, Role.ORGANIZER, Role.ADMIN, Role.STAFF)
  @Delete(':seatId/hold')
  releaseSeatHold(
    @Param('seatId') seatId: string,
    @Req() request: any,
  ) {
    return this.seatsService.releaseSeatHold(seatId, request.user?.id);
  }

  /**
   * Tạo vé đã bán (phục vụ test T-19)
   */
  @Roles(Role.ADMIN, Role.ORGANIZER)
  @Post(':seatId/ticket')
  createTicket(
    @Param('seatId') seatId: string,
    @Req() request: any,
  ) {
    return this.seatsService.createTicket(seatId, request.user?.id);
  }

  /**
   * TASK T-24: Lấy thông tin đếm ngược thời gian giữ ghế theo seatId
   */
  @Public()
  @Get(':seatId/hold/countdown')
  getSeatHoldCountdown(@Param('seatId') seatId: string) {
    return this.seatsService.getSeatHoldCountdown(seatId);
  }

  @Public()
  @Get(':seatId/countdown')
  getCountdown(@Param('seatId') seatId: string) {
    return this.seatsService.getSeatHoldCountdown(seatId);
  }
}