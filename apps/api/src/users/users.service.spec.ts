import { describe, it, expect, vi } from 'vitest';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { UsersService } from './users.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '@prisma/client';

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

describe('Employee transaction failure mapping', () => {
  const body = {
    email: 'race@demo.invalid',
    password: 'FixturePassword123!',
    role: 'STAFF',
  };
  it('maps a database unique conflict to400 and never retries a create transaction', async () => {
    const conflict = new Prisma.PrismaClientKnownRequestError(
      'Unique email conflict',
      { code: 'P2002', clientVersion: 'fixture' },
    );
    const transaction = vi.fn().mockRejectedValue(conflict);
    const service = new UsersService({
      $transaction: transaction,
    } as unknown as PrismaService);
    await expect(service.createEmployee('actor', body)).rejects.toMatchObject({
      status: 400,
    });
    expect(transaction).toHaveBeenCalledTimes(1);
  });
  it('preserves an unexpected storage failure for the exception boundary instead of reporting duplicate success', async () => {
    const failure = new Error('fixture unavailable database');
    const transaction = vi.fn().mockRejectedValue(failure);
    const service = new UsersService({
      $transaction: transaction,
    } as unknown as PrismaService);
    await expect(service.createEmployee('actor', body)).rejects.toBe(failure);
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
