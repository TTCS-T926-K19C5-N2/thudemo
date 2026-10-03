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

  async importSeats(dto: ImportSeatsDto) {
    const { showtimeId, categories, seats } = dto;

    return this.prisma.$transaction(async (tx: any) => {
      // 1. Kiểm tra suất diễn có tồn tại không
      const showtime = await tx.showtime.findUnique({
        where: { id: showtimeId },
      });

      if (!showtime) {
        throw new NotFoundException('Suất diễn không tồn tại');
      }

      // 2. Chặn nếu suất diễn đã có sơ đồ ghế
      const existingSeatsCount = await tx.seat.count({
        where: { showtimeId },
      });

      if (existingSeatsCount > 0) {
        throw new ConflictException(
          'Suất diễn này đã có sơ đồ ghế hoặc vé đã được khởi tạo',
        );
      }

      // 3. Tạo các hạng ghế (SeatCategory)
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

      // 4. Chuẩn bị dữ liệu danh sách ghế để chèn theo lô (createMany)
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

      // 5. Ghi theo lô nhiều dòng trong 1 lệnh duy nhất
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
}