import { describe, it, expect, vi } from 'vitest';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { UsersService } from './users.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

describe('Account management rejection has no side effects', () => {
  const transaction = vi.fn();
  const service = new UsersService({
    $transaction: transaction,
  } as unknown as PrismaService);
  it.each([
    null,
    {},
    { email: 'invalid', password: '12345678', role: 'STAFF' },
    { email: 'staff@demo.invalid', password: 7, role: 'STAFF' },
    {
      email: 'staff@demo.invalid',
      password: '12345678',
      role: 'TICKET_INSPECTOR',
    },
  ])('rejects invalid employee input %j before transaction', async (body) => {
    await expect(service.createEmployee('admin', body)).rejects.toThrow(
      BadRequestException,
    );
    expect(transaction).not.toHaveBeenCalled();
  });
  it('rejects self role/status change and invalid status', async () => {
    await expect(service.changeRole('same', 'same', 'STAFF')).rejects.toThrow(
      ForbiddenException,
    );
    await expect(service.setActive('same', 'same', false)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(service.setActive('admin', 'staff', 'false')).rejects.toThrow(
      BadRequestException,
    );
    expect(transaction).not.toHaveBeenCalled();
  });
});
