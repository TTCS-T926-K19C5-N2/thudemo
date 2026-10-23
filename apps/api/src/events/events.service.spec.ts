import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { EventsService } from './events.service.js';

describe('EventsService description limits', () => {
  const longDescription = 'Mô tả sự kiện nguồn '.repeat(250).trimEnd();
  const currentEvent = {
    id: '12345678-1234-4234-8234-123456789abc',
    organizerId: 'organizer-a',
    name: 'Bệnh sĩ',
    description: longDescription,
    location: 'Nhà hát Kịch Việt Nam',
  };

  it('allows preserving an existing description longer than the create limit', async () => {
    const update = vi.fn(async ({ data }: { data: Record<string, string> }) => ({
      ...currentEvent,
      ...data,
    }));
    const prisma = {
      event: {
        findUnique: vi.fn().mockResolvedValue(currentEvent),
        update,
      },
    } as unknown as PrismaService;
    const service = new EventsService(prisma);

    await expect(
      service.update(currentEvent.id, currentEvent.organizerId, {
        name: currentEvent.name,
        description: currentEvent.description,
        location: currentEvent.location,
      }),
    ).resolves.toMatchObject({ description: longDescription });
    expect(update).toHaveBeenCalledWith({
      where: { id: currentEvent.id },
      data: {
        name: currentEvent.name,
        description: longDescription,
        location: currentEvent.location,
      },
    });
  });

  it('keeps the 2000 character limit for newly created descriptions', async () => {
    const create = vi.fn();
    const prisma = { event: { create } } as unknown as PrismaService;
    const service = new EventsService(prisma);

    await expect(
      service.create('organizer-a', {
        name: 'Sự kiện mới',
        description: longDescription,
        location: 'Nhà hát',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });
});
