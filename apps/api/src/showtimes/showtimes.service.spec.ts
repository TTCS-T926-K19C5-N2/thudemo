import { Test, TestingModule } from '@nestjs/testing';
import { ShowtimesService } from './showtimes.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ShowtimeStatus } from '@prisma/client';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('ShowtimesService - transitionStatus', () => {
  let service: ShowtimesService;
  let prisma: PrismaService;

  const mockPrismaService = {
    showtime: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShowtimesService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<ShowtimesService>(ShowtimesService);
    prisma = module.get<PrismaService>(PrismaService);

    vi.clearAllMocks();
  });

  it('nên quăng lỗi NotFoundException khi không tìm thấy suất diễn', async () => {
    mockPrismaService.showtime.findUnique.mockResolvedValue(null);

    await expect(
      service.transitionStatus('invalid-id', ShowtimeStatus.ON_SALE)
    ).rejects.toThrow(NotFoundException);
  });

  it('TRƯỜNG HỢP KHÔNG HỢP LỆ: Chuyển từ DRAFT sang ON_SALE khi CHƯA CÓ ghế -> Phải báo lỗi BadRequestException', async () => {
    mockPrismaService.showtime.findUnique.mockResolvedValue({
      id: 'st-1',
      status: ShowtimeStatus.DRAFT,
      seats: [], // Chưa có ghế
    });

    await expect(
      service.transitionStatus('st-1', ShowtimeStatus.ON_SALE)
    ).rejects.toThrow(BadRequestException);
  });

  it('TRƯỜNG HỢP HỢP LỆ: Chuyển từ DRAFT sang ON_SALE khi ĐÃ CÓ ghế -> Thành công', async () => {
    mockPrismaService.showtime.findUnique.mockResolvedValue({
      id: 'st-1',
      status: ShowtimeStatus.DRAFT,
      seats: [{ id: 'seat-1' }], // Đã có ghế
    });

    mockPrismaService.showtime.update.mockResolvedValue({
      id: 'st-1',
      status: ShowtimeStatus.ON_SALE,
    });

    const result = await service.transitionStatus('st-1', ShowtimeStatus.ON_SALE);
    expect(result.status).toBe(ShowtimeStatus.ON_SALE);
    expect(mockPrismaService.showtime.update).toHaveBeenCalledWith({
      where: { id: 'st-1' },
      data: { status: ShowtimeStatus.ON_SALE },
    });
  });

  it('TRƯỜNG HỢP HỢP LỆ: Chuyển từ ON_SALE sang CLOSED -> Thành công', async () => {
    mockPrismaService.showtime.findUnique.mockResolvedValue({
      id: 'st-1',
      status: ShowtimeStatus.ON_SALE,
      seats: [{ id: 'seat-1' }],
    });

    mockPrismaService.showtime.update.mockResolvedValue({
      id: 'st-1',
      status: ShowtimeStatus.CLOSED,
    });

    const result = await service.transitionStatus('st-1', ShowtimeStatus.CLOSED);
    expect(result.status).toBe(ShowtimeStatus.CLOSED);
  });
});