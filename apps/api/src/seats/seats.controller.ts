import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ImportSeatsDto } from './dto/import-seats.dto.js';
import { SeatsService } from './seats.service.js';

@Controller('seats')
export class SeatsController {
  constructor(private readonly seatsService: SeatsService) {}

  @Post('import')
  @HttpCode(HttpStatus.CREATED)
  async importSeats(@Body() dto: ImportSeatsDto) {
    return this.seatsService.importSeats(dto);
  }
}