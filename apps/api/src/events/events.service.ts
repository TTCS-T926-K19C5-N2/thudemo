import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

type EventInput = { name: string; description: string; location: string };

function parseEventInput(value: unknown): EventInput {
  const input =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};
  const errors: Record<string, string> = {};
  const limits = { name: 120, description: 2000, location: 200 } as const;
  for (const field of Object.keys(limits) as (keyof EventInput)[]) {
    const content = input[field];
    if (typeof content !== 'string' || content.trim().length === 0) {
      errors[field] = 'Trường này không được để trống.';
    } else if (content.trim().length > limits[field]) {
      errors[field] = `Tối đa ${limits[field]} ký tự.`;
    }
  }
  if (Object.keys(errors).length > 0) {
    throw new BadRequestException({
      message: 'Kiểm tra lại thông tin sự kiện.',
      errors,
    });
  }
  return {
    name: (input.name as string).trim(),
    description: (input.description as string).trim(),
    location: (input.location as string).trim(),
  };
}

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(organizerId: string, data: unknown) {
    return this.prisma.event.create({
      data: { ...parseEventInput(data), organizerId },
    });
  }

  async findAll() {
    return this.prisma.event.findMany({
      where: { status: 'PUBLISHED' },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const event = await this.prisma.event.findFirst({
      where: { id, status: 'PUBLISHED' },
      include: { showtimes: true },
    });
    if (!event) throw new NotFoundException('Không tìm thấy sự kiện.');
    return event;
  }

  async findMine(organizerId: string) {
    return this.prisma.event.findMany({
      where: { organizerId },
      orderBy: { createdAt: 'desc' },
      include: { showtimes: { orderBy: { startTime: 'asc' } } },
    });
  }

  async findOwned(id: string, organizerId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id },
      include: { showtimes: { orderBy: { startTime: 'asc' } } },
    });
    if (!event) throw new NotFoundException('Không tìm thấy sự kiện.');
    if (event.organizerId !== organizerId)
      throw new ForbiddenException('Bạn không có quyền xem sự kiện này.');
    return event;
  }

  async update(id: string, organizerId: string, input: unknown) {
    await this.findOwned(id, organizerId);
    return this.prisma.event.update({
      where: { id },
      data: parseEventInput(input),
    });
  }

  async addShowtime(eventId: string, organizerId: string, value: unknown) {
    await this.findOwned(eventId, organizerId);
    const input =
      value && typeof value === 'object'
        ? (value as Record<string, unknown>)
        : {};
    const raw = input.startTime;
    if (typeof raw !== 'string' || !/(?:Z|[+-]\d{2}:\d{2})$/i.test(raw)) {
      throw new BadRequestException({
        message: 'Thời gian cần có múi giờ.',
        errors: { startTime: 'Chọn giờ bắt đầu hợp lệ.' },
      });
    }
    const startTime = new Date(raw);
    if (Number.isNaN(startTime.getTime()) || startTime <= new Date()) {
      throw new BadRequestException({
        message: 'Thời gian bắt đầu phải ở tương lai.',
        errors: { startTime: 'Chọn giờ trong tương lai.' },
      });
    }
    const duplicates = await this.prisma.showtime.count({
      where: { eventId, startTime },
    });
    const showtime = await this.prisma.showtime.create({
      data: { eventId, startTime },
    });
    return {
      ...showtime,
      warning:
        duplicates > 0
          ? 'Đã có suất diễn cùng giờ; vẫn lưu vì sự kiện có thể diễn ở nhiều phòng.'
          : null,
    };
  }
}
