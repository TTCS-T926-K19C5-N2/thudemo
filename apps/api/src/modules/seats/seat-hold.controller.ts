import {
  Controller,
  Post,
  Param,
  Body,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SeatHoldService, HoldSeatsResult } from './seat-hold.service.js';
import { HoldSeatsDto } from './dto/hold-seats.dto.js';
import { Public } from '../../auth/decorators/roles.decorator.js';

@Controller(['api/showtimes', 'showtimes'])
export class SeatHoldController {
  constructor(private readonly seatHoldService: SeatHoldService) {}

  @Public()
  @Post(':showtimeId/hold-seats')
  @HttpCode(HttpStatus.OK)
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
}
