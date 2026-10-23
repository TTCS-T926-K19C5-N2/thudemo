import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UsersService } from './users.service.js';
import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service.js';

describe('UsersService - S-28 Employee Management', () => {
  let service: UsersService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      user: {
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
    };
    service = new UsersService(mockPrisma as unknown as PrismaService);
  });

  describe('createStaff', () => {
    it('creates a STAFF user with active status and verified email', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({ id: 'staff-uuid-1', email: 'staff@test.com' });

      const result = await service.createStaff('staff@test.com', 'ValidPass123!');
      expect(result).toEqual({ message: 'Staff account created successfully', id: 'staff-uuid-1' });
      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: 'staff@test.com',
          isEmailVerified: true,
          isActive: true,
          userRoles: {
            create: { role: { connect: { name: 'STAFF' } } },
          },
        }),
      });
    });

    it('rejects password shorter than 8 characters', async () => {
      await expect(service.createStaff('staff@test.com', 'short')).rejects.toThrow(BadRequestException);
    });

    it('rejects duplicate email', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'existing-id' });
      await expect(service.createStaff('staff@test.com', 'ValidPass123!')).rejects.toThrow(BadRequestException);
    });
  });

  describe('disableAccount', () => {
    it('sets isActive to false for given user ID', async () => {
      mockPrisma.user.update.mockResolvedValue({ id: 'user-id-1', isActive: false });
      const result = await service.disableAccount('user-id-1');
      expect(result).toEqual({ message: 'Account disabled successfully' });
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-id-1' },
        data: { isActive: false },
      });
    });
  });
});
