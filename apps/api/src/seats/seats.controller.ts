import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ImportSeatsDto } from './dto/import-seats.dto.js';
import { SeatsService } from './seats.service.js';

@Controller('seats')
export class SeatsController {
  constructor(private readonly seatsService: SeatsService) {}

  // T-12: API Import sơ đồ ghế
  @Post('import')
  @HttpCode(HttpStatus.CREATED)
  async importSeats(@Body() dto: ImportSeatsDto) {
    return this.seatsService.importSeats(dto);
  }

  // T-13: API Lấy sơ đồ ghế theo suất diễn
  @Get('showtime/:showtimeId')
  async getSeatsByShowtime(@Param('showtimeId') showtimeId: string) {
    return this.seatsService.getSeatsByShowtime(showtimeId);
  }

  // T-14: API Lấy danh sách hạng ghế theo suất diễn
  @Get('categories/showtime/:showtimeId')
  async getSeatCategoriesByShowtime(@Param('showtimeId') showtimeId: string) {
    return this.seatsService.getSeatCategoriesByShowtime(showtimeId);
  }
}