import { Injectable, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class EventsService {
  constructor(private prisma: PrismaService) {}

  async create(organizerId: string, data: any) {
    return this.prisma.event.create({
      data: {
        name: data.name,
        description: data.description,
        location: data.location,
        organizerId,
      },
    });
  }

  async findAll() {
    return this.prisma.event.findMany({
      where: { status: 'PUBLISHED' },
    });
  }

  async findOne(id: string) {
    return this.prisma.event.findUnique({
      where: { id },
      include: { showtimes: true },
    });
  }

  async addShowtime(eventId: string, organizerId: string, startTimeStr: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      throw new BadRequestException('Event not found');
    }

    if (event.organizerId !== organizerId) {
      throw new ForbiddenException('You can only modify your own events');
    }

    const startTime = new Date(startTimeStr);
    if (startTime < new Date()) {
      throw new BadRequestException('Showtime cannot be in the past');
    }

    return this.prisma.showtime.create({
      data: {
        eventId,
        startTime,
      },
    });
  }
}
