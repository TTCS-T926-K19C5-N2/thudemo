import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AdminUsersController } from './admin-users.controller.js';
import { UsersService } from '../users.service.js';
import { ForbiddenException } from '@nestjs/common';

describe('AdminUsersController', () => {
  let controller: AdminUsersController;
  let usersService: any;

  beforeEach(() => {
    usersService = {
      createAdminUser: vi.fn(),
      updateUserRole: vi.fn(),
      updateUserStatus: vi.fn(),
      getUsers: vi.fn(),
    };
    controller = new AdminUsersController(usersService as unknown as UsersService);
  });

  it('lists users via service', async () => {
    usersService.getUsers.mockResolvedValue([{ id: 'u1' }]);
    const result = await controller.listUsers();
    expect(usersService.getUsers).toHaveBeenCalled();
    expect(result).toEqual([{ id: 'u1' }]);
  });

  it('creates employee user via service', async () => {
    const req = { user: { id: 'admin-id' } };
    const body = { email: 'emp@test.com', password: 'password123', role: 'ORGANIZER' };
    usersService.createAdminUser.mockResolvedValue({ id: 'new-id', ...body });

    const result = await controller.createUser(req, body);
    expect(usersService.createAdminUser).toHaveBeenCalledWith(
      'admin-id',
      'emp@test.com',
      'password123',
      'ORGANIZER',
    );
    expect(result.id).toBe('new-id');
  });

  describe('updateRole', () => {
    it('throws ForbiddenException if admin updates own role', async () => {
      const req = { user: { id: 'admin-1' } };
      await expect(
        controller.updateRole(req, 'admin-1', 'ORGANIZER'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('delegates to service when updating another user role', async () => {
      const req = { user: { id: 'admin-1' } };
      usersService.updateUserRole.mockResolvedValue({ id: 'user-2', role: 'ACCOUNTANT' });

      const result = await controller.updateRole(req, 'user-2', 'ACCOUNTANT');
      expect(usersService.updateUserRole).toHaveBeenCalledWith('admin-1', 'user-2', 'ACCOUNTANT');
      expect(result.role).toBe('ACCOUNTANT');
    });
  });

  describe('updateStatus', () => {
    it('throws ForbiddenException if admin updates own status', async () => {
      const req = { user: { id: 'admin-1' } };
      await expect(
        controller.updateStatus(req, 'admin-1', false),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('delegates to service when updating another user status', async () => {
      const req = { user: { id: 'admin-1' } };
      usersService.updateUserStatus.mockResolvedValue({ id: 'user-2', isActive: false });

      const result = await controller.updateStatus(req, 'user-2', false);
      expect(usersService.updateUserStatus).toHaveBeenCalledWith('admin-1', 'user-2', false);
      expect(result.isActive).toBe(false);
    });
  });
});
