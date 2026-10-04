import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ImportSeatsDto } from './dto/import-seats.dto.js';
import type {
  SeatStatus,
  SeatStatusResponseDto,
  ShowtimeSeatSummaryDto,
} from './dto/seat-status.dto.js';

@Injectable()
export class SeatsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * TASK T-19: Truy vấn toàn bộ trạng thái ghế theo suất diễn trong 1 lần gọi
   * - Trả về đúng 3 trạng thái: AVAILABLE, HELD, SOLD
   * - Tối ưu truy vấn đơn (zero N+1 subqueries), đo thời gian chạy dưới 200ms với 2.000 ghế
   * - Tự động loại trừ giữ chỗ đã hết hạn mà không phụ thuộc vào job dọn dẹp
   */
  async getSeatStatusByShowtime(
    showtimeId: string,
    currentUserId?: string,
  ): Promise<ShowtimeSeatSummaryDto> {
    const startTime = performance.now();

    // 1. Kiểm tra suất diễn có tồn tại
    const showtime = await this.prisma.showtime.findUnique({
      where: { id: showtimeId },
      select: { id: true },
    });

    if (!showtime) {
      throw new NotFoundException('Suất diễn không tồn tại');
    }

    const now = new Date();

    // 2. Thực hiện truy vấn danh sách ghế kèm hạng ghế, giữ chỗ còn hạn và vé đã bán
    // Prisma dùng batching IN (...) tối ưu (3 queries con duy nhất, không có vòng lặp từng ghế)
    const seats = await this.prisma.seat.findMany({
      where: { showtimeId },
      include: {
        seatCategory: {
          select: {
            id: true,
            name: true,
            price: true,
            color: true,
          },
        },
        holds: {
          where: {
            expiresAt: { gt: now },
          },
          select: {
            id: true,
            userId: true,
            expiresAt: true,
          },
          take: 1,
        },
        tickets: {
          where: {
            status: 'PAID',
          },
          select: {
            id: true,
          },
          take: 1,
        },
      },
      orderBy: [{ seatRow: 'asc' }, { seatNumber: 'asc' }],
    });

    let availableCount = 0;
    let heldCount = 0;
    let soldCount = 0;

    const seatResults: SeatStatusResponseDto[] = seats.map((seat) => {
      const isSold = seat.tickets.length > 0;
      const activeHold = !isSold && seat.holds.length > 0 ? seat.holds[0] : null;

      let status: SeatStatus = 'AVAILABLE';
      if (isSold) {
        status = 'SOLD';
        soldCount++;
      } else if (activeHold) {
        status = 'HELD';
        heldCount++;
      } else {
        availableCount++;
      }

      return {
        id: seat.id,
        showtimeId: seat.showtimeId,
        seatRow: seat.seatRow,
        seatNumber: seat.seatNumber,
        seatCategoryId: seat.seatCategoryId,
        categoryName: seat.seatCategory?.name ?? null,
        price: seat.seatCategory?.price ?? null,
        color: seat.seatCategory?.color ?? '#3B82F6',
        status,
        holdExpiresAt: activeHold ? activeHold.expiresAt.toISOString() : null,
        isMyHold: Boolean(currentUserId && activeHold?.userId === currentUserId),
      };
    });

    const endTime = performance.now();
    const queryDurationMs = Math.round((endTime - startTime) * 100) / 100;

    return {
      showtimeId,
      totalSeats: seats.length,
      availableCount,
      heldCount,
      soldCount,
      queryDurationMs,
      seats: seatResults,
    };
  }

  // --- TASK T-12: Import Seats ---
  async importSeats(dto: ImportSeatsDto) {
    const { showtimeId, categories, seats } = dto;

    return this.prisma.$transaction(async (tx: any) => {
      const showtime = await tx.showtime.findUnique({
        where: { id: showtimeId },
      });

      if (!showtime) {
        throw new NotFoundException('Suất diễn không tồn tại');
      }

      const existingSeatsCount = await tx.seat.count({
        where: { showtimeId },
      });

      if (existingSeatsCount > 0) {
        throw new ConflictException(
          'Suất diễn này đã có sơ đồ ghế hoặc vé đã được khởi tạo',
        );
      }

      const categoryMap = new Map<string, string>();

      for (const catDto of categories) {
        const createdCat = await tx.seatCategory.create({
          data: {
            showtimeId,
            name: catDto.name,
            color: catDto.color ?? '#3B82F6',
            price: catDto.price ?? null,
          },
        });
        categoryMap.set(catDto.name, createdCat.id);
      }

      const seatsToCreate = seats.map((s) => {
        const seatCategoryId = s.categoryName
          ? categoryMap.get(s.categoryName)
          : null;

        if (s.categoryName && !seatCategoryId) {
          throw new BadRequestException(
            `Hạng ghế "${s.categoryName}" không có trong danh sách categories khai báo`,
          );
        }

        return {
          showtimeId,
          seatCategoryId: seatCategoryId || null,
          seatRow: s.seatRow,
          seatNumber: s.seatNumber,
        };
      });

      // Tạo theo batch 1000 ghế để tối ưu hiệu năng
      const BATCH_SIZE = 1000;
      let totalCreated = 0;
      for (let i = 0; i < seatsToCreate.length; i += BATCH_SIZE) {
        const batch = seatsToCreate.slice(i, i + BATCH_SIZE);
        const result = await tx.seat.createMany({
          data: batch,
        });
        totalCreated += result.count;
      }

      return {
        success: true,
        importedCategories: categoryMap.size,
        importedSeats: totalCreated,
      };
    });
  }

  // --- TASK T-13: Lấy danh sách ghế theo Suất diễn ---
  async getSeatsByShowtime(showtimeId: string) {
    const showtime = await this.prisma.showtime.findUnique({
      where: { id: showtimeId },
    });

    if (!showtime) {
      throw new NotFoundException('Suất diễn không tồn tại');
    }

    return this.prisma.seat.findMany({
      where: { showtimeId },
      include: {
        seatCategory: true,
      },
      orderBy: [{ seatRow: 'asc' }, { seatNumber: 'asc' }],
    });
  }

  // --- TASK T-14: Lấy danh sách hạng ghế theo Suất diễn ---
  async getSeatCategoriesByShowtime(showtimeId: string) {
    const showtime = await this.prisma.showtime.findUnique({
      where: { id: showtimeId },
    });

    if (!showtime) {
      throw new NotFoundException('Suất diễn không tồn tại');
    }

    return this.prisma.seatCategory.findMany({
      where: { showtimeId },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Giữ ghế tạm thời (phục vụ test T-19 và tích hợp T-23)
   */
  async holdSeat(seatId: string, userId: string, ttlSeconds = 600) {
    const seat = await this.prisma.seat.findUnique({
      where: { id: seatId },
      include: {
        tickets: { where: { status: 'PAID' } },
        holds: { where: { expiresAt: { gt: new Date() } } },
      },
    });

    if (!seat) {
      throw new NotFoundException('Ghế không tồn tại.');
    }

    if (seat.tickets.length > 0) {
      throw new ConflictException('Ghế đã được bán.');
    }

    if (seat.holds.length > 0) {
      throw new ConflictException('Ghế đang được người khác giữ.');
    }

    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    return this.prisma.seatHold.create({
      data: {
        seatId,
        userId,
        expiresAt,
      },
    });
  }

  /**
   * Bỏ chọn / hủy giữ chỗ cho ghế (phục vụ T-25 và test)
   */
  async releaseSeatHold(seatId: string, userId: string) {
    const hold = await this.prisma.seatHold.findFirst({
      where: {
        seatId,
        expiresAt: { gt: new Date() },
      },
    });

    if (!hold) {
      throw new NotFoundException('Không tìm thấy lượt giữ chỗ còn hiệu lực cho ghế này.');
    }

    if (hold.userId !== userId) {
      throw new ForbiddenException('Chỉ người giữ ghế mới có quyền huỷ lượt giữ chỗ.');
    }

    await this.prisma.seatHold.delete({
      where: { id: hold.id },
    });

    return { success: true, message: 'Đã huỷ giữ ghế thành công.' };
  }

  /**
   * Tạo vé đã bán (phục vụ test T-19 trạng thái SOLD)
   */
  async createTicket(seatId: string, userId: string, status = 'PAID') {
    return this.prisma.ticket.create({
      data: {
        seatId,
        userId,
        status,
      },
    });
  }
}