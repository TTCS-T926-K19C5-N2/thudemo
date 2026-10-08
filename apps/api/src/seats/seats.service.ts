import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ImportSeatsDto } from './dto/import-seats.dto.js';

@Injectable()
export class SeatsService {
  constructor(private readonly prisma: PrismaService) {}

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
          },
        });
        categoryMap.set(catDto.name, createdCat.id);
      }

      const seatsToCreate = seats.map((s) => {
        const categoryId = s.categoryName
          ? categoryMap.get(s.categoryName)
          : null;

        if (s.categoryName && !categoryId) {
          throw new BadRequestException(
            `Hạng ghế "${s.categoryName}" không có trong danh sách categories khai báo`,
          );
        }

        return {
          showtimeId,
          categoryId: categoryId || null,
          row: s.seatRow,
          seatNumber: s.seatNumber,
        };
      });

      const result = await tx.seat.createMany({
        data: seatsToCreate,
      });

      return {
        success: true,
        importedCategories: categoryMap.size,
        importedSeats: result.count,
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
        category: true,
      },
      // Đổi từ seatRow thành row:
orderBy: [{ row: 'asc' }, { seatNumber: 'asc' }],
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
}