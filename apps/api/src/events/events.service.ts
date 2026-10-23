import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { SeatEventsService } from '../showtimes/seat-events.service.js';

type EventInput = { name: string; description: string; location: string };

function parseEventInput(value: unknown, descriptionLimit = 2000): EventInput {
  const input =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};
  const errors: Record<string, string> = {};
  const limits = { name: 120, description: descriptionLimit, location: 200 } as const;
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
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly seatEvents?: SeatEventsService,
  ) {}

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

  async publication(id: string, organizerId: string, input: unknown) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))
      throw new BadRequestException('Mã sự kiện không hợp lệ.');
    const status =
      input && typeof input === 'object'
        ? (input as Record<string, unknown>).status
        : undefined;
    if (status !== 'DRAFT' && status !== 'PUBLISHED')
      throw new BadRequestException('Trạng thái công bố không hợp lệ.');

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM events WHERE id=${id}::uuid FOR UPDATE`;
      const event = await tx.event.findUnique({ where: { id } });
      if (!event) throw new NotFoundException('Không tìm thấy sự kiện.');
      if (event.organizerId !== organizerId)
        throw new ForbiddenException('Bạn không có quyền sửa sự kiện này.');
      if (event.status === status)
        return { event, showtimeIds: [] as string[], changed: false };

      let showtimeIds: string[] = [];
      if (status === 'PUBLISHED') {
        await tx.$queryRaw`SELECT id FROM showtimes WHERE "eventId"=${id}::uuid FOR UPDATE`;
        const showtimes = await tx.showtime.findMany({
          where: {
            eventId: id,
            status: 'ON_SALE',
            isDemo: false,
            startTime: { gt: new Date() },
          },
          select: {
            id: true,
            categories: { select: { price: true } },
            _count: { select: { seats: true } },
          },
        });
        const ready = showtimes.filter(
          (showtime) =>
            showtime._count.seats > 0 &&
            showtime.categories.length > 0 &&
            showtime.categories.every(
              (category) => category.price !== null && category.price >= 0,
            ),
        );
        if (!ready.length)
          throw new ConflictException(
            'Cần ít nhất một suất ON_SALE trong tương lai có sơ đồ ghế và giá hợp lệ.',
          );
        showtimeIds = ready.map((showtime) => showtime.id);
      } else {
        const showtimes = await tx.showtime.findMany({
          where: { eventId: id },
          select: { id: true },
        });
        showtimeIds = showtimes.map((showtime) => showtime.id);
      }

      const updated = await tx.event.update({
        where: { id },
        data: { status },
      });
      await tx.catalogRevision.update({
        where: { id: 1 },
        data: { version: { increment: 1 } },
      });
      await tx.domainAudit.create({
        data: {
          entityType: 'EVENT',
          entityId: id,
          actorId: organizerId,
          actorType: 'ORGANIZER',
          action: status === 'PUBLISHED' ? 'EVENT_PUBLISHED' : 'EVENT_HIDDEN',
          beforeState: { status: event.status } as Prisma.InputJsonValue,
          afterState: { status } as Prisma.InputJsonValue,
        },
      });
      return { event: updated, showtimeIds, changed: true };
    });

    if (result.changed)
      for (const showtimeId of result.showtimeIds)
        this.seatEvents?.invalidate(showtimeId);
    return result.event;
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
    const current = await this.findOwned(id, organizerId);
    return this.prisma.event.update({
      where: { id },
      data: parseEventInput(input, Math.max(2000, current.description.length)),
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
