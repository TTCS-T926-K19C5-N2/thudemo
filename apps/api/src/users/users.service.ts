import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import * as argon2 from 'argon2';
import { employeeInput, employeeRole } from './admin-input.js';

const projection = {
  id: true,
  email: true,
  isActive: true,
  createdAt: true,
  userRoles: { select: { role: { select: { name: true } } } },
} satisfies Prisma.UserSelect;
type ProjectedUser = Prisma.UserGetPayload<{ select: typeof projection }>;
function publicUser(user: ProjectedUser) {
  const { userRoles, ...rest } = user;
  return { ...rest, roles: userRoles.map((r) => r.role.name) };
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  // A stable lock order serializes account mutations without cross-admin deadlocks.
  private async lockAdmin(
    tx: Prisma.TransactionClient,
    actorId: string,
    targetId?: string,
  ) {
    const ids = [...new Set([actorId, ...(targetId ? [targetId] : [])])].sort();
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM users WHERE id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))}) ORDER BY id FOR UPDATE`,
    );
    const actor = await tx.user.findUnique({
      where: { id: actorId },
      include: { userRoles: { include: { role: true } } },
    });
    if (
      !actor?.isActive ||
      !actor.userRoles.some((r) => r.role.name === 'ADMIN')
    )
      throw new ForbiddenException(
        'Chỉ quản trị viên đang hoạt động được quản lý tài khoản.',
      );
  }

  async createEmployee(actorId: string, value: unknown) {
    const input = employeeInput(value);
    const password = await argon2.hash(input.password, {
      type: argon2.argon2id,
    });
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.lockAdmin(tx, actorId);
        if (
          await tx.user.findFirst({
            where: { email: { equals: input.email, mode: 'insensitive' } },
          })
        )
          throw new BadRequestException('Email đã được sử dụng.');
        const user = await tx.user.create({
          data: {
            email: input.email,
            password,
            isActive: true,
            isEmailVerified: true,
            userRoles: { create: { role: { connect: { name: input.role } } } },
          },
          select: projection,
        });
        await tx.userAdminAudit.create({
          data: {
            performedById: actorId,
            targetUserId: user.id,
            action: 'CREATE_EMPLOYEE',
            newValue: input.role,
          },
        });
        return publicUser(user);
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new BadRequestException('Email đã được sử dụng.');
      throw error;
    }
  }

  async changeRole(actorId: string, id: string, input: unknown) {
    const role = employeeRole(input);
    if (actorId === id)
      throw new ForbiddenException('Không thể tự đổi vai trò.');
    return this.prisma.$transaction(async (tx) => {
      await this.lockAdmin(tx, actorId, id);
      const user = await tx.user.findUnique({
        where: { id },
        select: projection,
      });
      if (!user) throw new NotFoundException('Không tìm thấy tài khoản.');
      const previous = user.userRoles
        .map((r) => r.role.name)
        .sort()
        .join(',');
      if (previous !== role) {
        await tx.userRole.deleteMany({ where: { userId: id } });
        await tx.userRole.create({
          data: {
            user: { connect: { id } },
            role: { connect: { name: role } },
          },
        });
        await tx.userAdminAudit.create({
          data: {
            performedById: actorId,
            targetUserId: id,
            action: 'CHANGE_ROLE',
            oldValue: previous,
            newValue: role,
          },
        });
      }
      return { id, role };
    });
  }

  async setActive(actorId: string, id: string, isActive: unknown) {
    if (typeof isActive !== 'boolean')
      throw new BadRequestException('Trạng thái phải là true hoặc false.');
    if (actorId === id)
      throw new ForbiddenException(
        'Không thể tự thay đổi trạng thái tài khoản.',
      );
    return this.prisma.$transaction(async (tx) => {
      await this.lockAdmin(tx, actorId, id);
      const user = await tx.user.findUnique({
        where: { id },
        select: { isActive: true },
      });
      if (!user) throw new NotFoundException('Không tìm thấy tài khoản.');
      await tx.user.update({ where: { id }, data: { isActive } });
      if (!isActive) await tx.session.deleteMany({ where: { userId: id } });
      if (user.isActive !== isActive)
        await tx.userAdminAudit.create({
          data: {
            performedById: actorId,
            targetUserId: id,
            action: 'TOGGLE_STATUS',
            oldValue: String(user.isActive),
            newValue: String(isActive),
          },
        });
      return { id, isActive };
    });
  }

  async list(pageInput: unknown) {
    const page = pageInput === undefined ? 1 : Number(pageInput);
    if (!Number.isSafeInteger(page) || page < 1 || page > 100000)
      throw new BadRequestException('Trang không hợp lệ.');
    const users = await this.prisma.user.findMany({
      select: projection,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * 20,
      take: 21,
    });
    return {
      items: users.slice(0, 20).map(publicUser),
      page,
      hasNext: users.length > 20,
    };
  }
}
