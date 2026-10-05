import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UsersService } from './users.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';

describe('UsersService - S-28 Admin Operations', () => {
  let service: UsersService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        findMany: vi.fn(),
      },
      role: {
        upsert: vi.fn(),
      },
      userRole: {
        deleteMany: vi.fn(),
        create: vi.fn(),
      },
      auditLog: {
        create: vi.fn(),
      },
      $transaction: vi.fn(async (cb) => {
        return cb(prisma);
      }),
    };

    service = new UsersService(prisma as unknown as PrismaService);
  });

  describe('createAdminUser', () => {
    it('creates an employee user and logs audit record in transaction', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.role.upsert.mockResolvedValue({ id: 'role-123', name: 'ORGANIZER' });
      prisma.user.create.mockResolvedValue({
        id: 'user-new',
        email: 'emp@test.com',
        isActive: true,
        createdAt: new Date(),
        userRoles: [{ role: { name: 'ORGANIZER' } }],
      });
      prisma.auditLog.create.mockResolvedValue({});

      const result = await service.createAdminUser(
        'admin-1',
        'emp@test.com',
        'securePass123',
        'ORGANIZER',
      );

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.role.upsert).toHaveBeenCalledWith({
        where: { name: 'ORGANIZER' },
        update: {},
        create: { name: 'ORGANIZER' },
      });
      expect(prisma.user.create).toHaveBeenCalled();
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          performedById: 'admin-1',
          targetUserId: 'user-new',
          action: 'CREATE_EMPLOYEE',
          oldValue: null,
          newValue: expect.stringContaining('emp@test.com'),
        }),
      });
      expect(result.email).toBe('emp@test.com');
      expect(result.roles).toEqual(['ORGANIZER']);
    });

    it('throws BadRequestException if password is under 8 characters', async () => {
      await expect(
        service.createAdminUser('admin-1', 'emp@test.com', 'short', 'ACCOUNTANT'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws BadRequestException if role is invalid', async () => {
      await expect(
        service.createAdminUser('admin-1', 'emp@test.com', 'validPass123', 'SUPERMAN' as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws BadRequestException if user email already exists', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'existing-id' });

      await expect(
        service.createAdminUser('admin-1', 'emp@test.com', 'validPass123', 'ACCOUNTANT'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('updateUserRole', () => {
    it('prevents admin from changing their own role', async () => {
      await expect(
        service.updateUserRole('admin-1', 'admin-1', 'ACCOUNTANT'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws BadRequestException on invalid role', async () => {
      await expect(
        service.updateUserRole('admin-1', 'user-2', 'INVALID_ROLE'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws NotFoundException if user is not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.updateUserRole('admin-1', 'user-missing', 'TICKET_INSPECTOR'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('updates user role and creates AuditLog record in transaction', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-2',
        email: 'user2@test.com',
        userRoles: [{ role: { name: 'BUYER' } }],
      });
      prisma.role.upsert.mockResolvedValue({ id: 'role-inspector', name: 'TICKET_INSPECTOR' });
      prisma.userRole.deleteMany.mockResolvedValue({ count: 1 });
      prisma.userRole.create.mockResolvedValue({});
      prisma.auditLog.create.mockResolvedValue({});

      const result = await service.updateUserRole('admin-1', 'user-2', 'TICKET_INSPECTOR');

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.userRole.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-2' },
      });
      expect(prisma.userRole.create).toHaveBeenCalledWith({
        data: {
          user: { connect: { id: 'user-2' } },
          role: { connect: { id: 'role-inspector' } },
        },
      });
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          performedById: 'admin-1',
          targetUserId: 'user-2',
          action: 'CHANGE_ROLE',
          oldValue: 'BUYER',
          newValue: 'TICKET_INSPECTOR',
        },
      });
      expect(result.role).toBe('TICKET_INSPECTOR');
    });
  });

  describe('updateUserStatus', () => {
    it('prevents admin from deactivating their own account', async () => {
      await expect(
        service.updateUserStatus('admin-1', 'admin-1', false),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws NotFoundException if target user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.updateUserStatus('admin-1', 'user-not-found', false),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('updates user status and logs TOGGLE_STATUS action in transaction', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-3',
        email: 'user3@test.com',
        isActive: true,
      });
      prisma.user.update.mockResolvedValue({
        id: 'user-3',
        email: 'user3@test.com',
        isActive: false,
      });
      prisma.auditLog.create.mockResolvedValue({});

      const result = await service.updateUserStatus('admin-1', 'user-3', false);

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-3' },
        data: { isActive: false },
      });
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          performedById: 'admin-1',
          targetUserId: 'user-3',
          action: 'TOGGLE_STATUS',
          oldValue: 'true',
          newValue: 'false',
        },
      });
      expect(result.isActive).toBe(false);
    });
  });

  describe('getUsers', () => {
    it('returns formatted list of users with roles', async () => {
      prisma.user.findMany.mockResolvedValue([
        {
          id: 'u1',
          email: 'u1@test.com',
          isActive: true,
          createdAt: new Date(),
          userRoles: [{ role: { name: 'ADMIN' } }],
        },
      ]);

      const list = await service.getUsers();
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({
        id: 'u1',
        email: 'u1@test.com',
        isActive: true,
        roles: ['ADMIN'],
      });
    });
  });
});
