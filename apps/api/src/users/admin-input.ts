import { BadRequestException } from '@nestjs/common';
import { ROLE_NAMES, type RoleName } from '../auth/roles.js';

export function adminBody(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new BadRequestException('Dữ liệu tài khoản không hợp lệ.');
  return value as Record<string, unknown>;
}
export function employeeRole(value: unknown): RoleName {
  if (typeof value !== 'string' || !ROLE_NAMES.includes(value as RoleName))
    throw new BadRequestException('Vai trò không hợp lệ.');
  return value as RoleName;
}
export function employeeInput(value: unknown) {
  const body = adminBody(value);
  if (
    typeof body.email !== 'string' ||
    body.email.length > 320 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())
  )
    throw new BadRequestException('Email không hợp lệ.');
  if (
    typeof body.password !== 'string' ||
    body.password.length < 8 ||
    body.password.length > 1024
  )
    throw new BadRequestException('Mật khẩu phải có từ 8 đến 1024 ký tự.');
  return {
    email: body.email.trim().toLowerCase(),
    password: body.password,
    role: employeeRole(body.role),
  };
}
