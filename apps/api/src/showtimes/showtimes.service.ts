import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ShowtimeStatus } from '@prisma/client';

@Injectable()
export class ShowtimesService {
  constructor(private readonly prisma: PrismaService) {}

  async transitionStatus(showtimeId: string, newStatus: ShowtimeStatus) {
    // 1. Tìm suất diễn kèm theo danh sách ghế
    const showtime = await this.prisma.showtime.findUnique({
      where: { id: showtimeId },
      include: { seats: true },
    });

    if (!showtime) {
      throw new NotFoundException('Showtime not found');
    }

    const currentStatus = showtime.status;

    // 2. Kiểm tra điều kiện: Từ DRAFT -> ON_SALE bắt buộc phải có ghế
    if (currentStatus === ShowtimeStatus.DRAFT && newStatus === ShowtimeStatus.ON_SALE) {
      const seatCount = showtime.seats?.length || 0;
      if (seatCount === 0) {
        throw new BadRequestException('Cannot transition from DRAFT to ON_SALE without seats');
      }
    }

    // 3. Cập nhật trạng thái
    return await this.prisma.showtime.update({
      where: { id: showtimeId },
      data: { status: newStatus },
    });
  }
}