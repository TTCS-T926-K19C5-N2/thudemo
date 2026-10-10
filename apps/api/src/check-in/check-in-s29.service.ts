import { Injectable } from '@nestjs/common';
import { ShowtimeStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class CheckInServiceS29 {
  constructor(private readonly db: PrismaService) {}

  async getTodayShowtimes() {
    const now = new Date();
    // Support Vietnam timezone (UTC+7) as required by project conventions
    // "thời gian lưu ở UTC, hiển thị theo múi giờ Việt Nam"
    const vnOffsetMs = 7 * 60 * 60 * 1000;
    const vnTime = new Date(now.getTime() + vnOffsetMs);
    const y = vnTime.getUTCFullYear();
    const m = vnTime.getUTCMonth();
    const d = vnTime.getUTCDate();
    const startOfDay = new Date(Date.UTC(y, m, d, 0, 0, 0) - vnOffsetMs);
    const endOfDay = new Date(Date.UTC(y, m, d + 1, 0, 0, 0) - vnOffsetMs);

    const showtimes = await this.db.showtime.findMany({
      where: {
        startTime: {
          gte: startOfDay,
          lt: endOfDay,
        },
        status: {
          in: [ShowtimeStatus.ON_SALE, ShowtimeStatus.CLOSED],
        },
      },
      include: {
        event: {
          select: { name: true, location: true },
        },
      },
      orderBy: { startTime: 'asc' },
    });

    return showtimes.map((s) => ({
      id: s.id,
      startTime: s.startTime.toISOString(),
      eventName: s.event.name,
      location: s.event.location,
      status: s.status,
    }));
  }
}
