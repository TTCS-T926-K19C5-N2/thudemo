import { BadRequestException } from '@nestjs/common';

export const DEFAULT_ORDER_PAGE_SIZE = 10;
export const MAX_ORDER_PAGE_SIZE = 50;

export function orderPagination(query: { page?: unknown; pageSize?: unknown }) {
  function integer(value: unknown, fallback: number, maximum: number): number {
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value))
      throw new BadRequestException(
        'Trang và số đơn mỗi trang phải là số nguyên dương.',
      );
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number > maximum)
      throw new BadRequestException(
        'Tham số phân trang vượt giới hạn cho phép.',
      );
    return number;
  }
  const pageSize = integer(
    query.pageSize,
    DEFAULT_ORDER_PAGE_SIZE,
    MAX_ORDER_PAGE_SIZE,
  );
  // PostgreSQL OFFSET and Prisma take/skip are signed 32-bit integers.
  const page = integer(query.page, 1, Math.floor(2147483647 / pageSize));
  return { page, pageSize, skip: (page - 1) * pageSize };
}
