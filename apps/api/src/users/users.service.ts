import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { ROLE_NAMES, type RoleName } from '../auth/roles.js';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private prisma: PrismaService) { }

  async register(email: string, pass: string) {
    if (pass.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters');
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });
    if (existingUser) {
      this.logger.log('Registration attempt for an existing account');
      return {
        message: 'If the email is valid, you will receive instructions.',
      };
    }

    const hashedPassword = await argon2.hash(pass);
    const activationToken = crypto.randomBytes(32).toString('hex');
    const expires = new Date();
    expires.setHours(expires.getHours() + 24);

    await this.prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        activationToken,
        activationExpires: expires,
        isEmailVerified: false,
        isActive: true,
        userRoles: {
          create: { role: { connect: { name: 'BUYER' } } },
        },
      } as any,
    });

    this.logger.log('Account activation delivery is not configured');

    return { message: 'If the email is valid, you will receive instructions.' };
  }

  async activate(token: unknown) {
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) {
      throw new BadRequestException('Invalid activation token');
    }

    const result = await this.prisma.user.updateMany({
      where: {
        activationToken: token,
        activationExpires: { gt: new Date() },
        isEmailVerified: false,
      },
      data: {
        isEmailVerified: true,
        activationToken: null,
        activationExpires: null,
      },
    });

    if (result.count !== 1) {
      throw new BadRequestException('Invalid or expired activation token');
    }

    return { message: 'Account activated successfully.' };
  }

  async resendActivation(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user || user.isEmailVerified) {
      return {
        message:
          'If the email is valid and unverified, you will receive a new link.',
      };
    }

    const activationToken = crypto.randomBytes(32).toString('hex');
    const expires = new Date();
    expires.setHours(expires.getHours() + 24);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        activationToken,
        activationExpires: expires,
      },
    });

    this.logger.log('Account activation delivery is not configured');

    return {
      message:
        'If the email is valid and unverified, you will receive a new link.',
    };
  }

  async createAdminUser(
    adminId: string,
    emailOrDto: string | { email: string; password?: string; role: RoleName },
    pass?: string,
    roleArg?: RoleName,
  ) {
    const email = typeof emailOrDto === 'string' ? emailOrDto : emailOrDto.email;
    const password = typeof emailOrDto === 'string' ? pass : emailOrDto.password;
    const role = (typeof emailOrDto === 'string' ? roleArg : emailOrDto.role) as RoleName;

    if (!email || !password || !role) {
      throw new BadRequestException('Email, password, and role are required');
    }

    if (password.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters');
    }

    if (!ROLE_NAMES.includes(role)) {
      throw new BadRequestException(`Invalid role: ${role}`);
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });
    if (existingUser) {
      throw new BadRequestException('User with this email already exists');
    }

    const hashedPassword = await argon2.hash(password, {
      type: argon2.argon2id,
    });

    return this.prisma.$transaction(async (tx: any) => {
      const roleRecord = await tx.role.upsert({
        where: { name: role },
        update: {},
        create: { name: role },
      });

      const user: any = await tx.user.create({
        data: {
          email,
          password: hashedPassword,
          isEmailVerified: true,
          isActive: true,
          userRoles: {
            create: {
              role: {
                connect: { id: roleRecord.id },
              },
            },
          },
        } as any,
        include: {
          userRoles: {
            include: {
              role: true,
            },
          },
        },
      });

      if (tx.auditLog) {
        await tx.auditLog.create({
          data: {
            performedById: adminId,
            targetUserId: user.id,
            action: 'CREATE_EMPLOYEE',
            oldValue: null,
            newValue: JSON.stringify({ email: user.email, role }),
          },
        });
      }

      const userRolesList = user.userRoles || user.roles || [];

      return {
        id: user.id,
        email: user.email,
        isActive: user.isActive ?? true,
        roles: userRolesList.map((ur: any) => ur.role?.name || ur.name || role),
        createdAt: user.createdAt,
      };
    });
  }

  async updateUserRole(adminId: string, targetUserId: string, role: string) {
    if (adminId === targetUserId) {
      throw new ForbiddenException('Admin cannot change their own role');
    }

    if (!ROLE_NAMES.includes(role as RoleName)) {
      throw new BadRequestException(`Invalid role: ${role}`);
    }

    return this.prisma.$transaction(async (tx: any) => {
      const user: any = await tx.user.findUnique({
        where: { id: targetUserId },
        include: {
          userRoles: {
            include: {
              role: true,
            },
          },
        },
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      const userRolesList = user.userRoles || user.roles || [];
      const oldRole = userRolesList[0]?.role?.name ?? null;

      const targetRole = await tx.role.upsert({
        where: { name: role },
      });

      if (tx.userRole) {
        await tx.userRole.deleteMany({
          where: { userId: targetUserId },
        });

        await tx.userRole.create({
          data: {
            user: { connect: { id: targetUserId } },
            role: { connect: { id: targetRole.id } },
          },
        });
      }

      if (tx.auditLog) {
        await tx.auditLog.create({
          data: {
            performedById: adminId,
            targetUserId,
            action: 'CHANGE_ROLE',
            oldValue: oldRole,
            newValue: role,
          },
        });
      }

      return {
        id: user.id,
        email: user.email,
        role,
      };
    });
  }

  async updateUserStatus(adminId: string, targetUserId: string, isActive: boolean) {
    if (adminId === targetUserId && !isActive) {
      throw new ForbiddenException('Admin cannot deactivate their own account');
    }

    return this.prisma.$transaction(async (tx: any) => {
      const user: any = await tx.user.findUnique({
        where: { id: targetUserId },
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      const oldStatus = String(user.isActive ?? true);

      const updatedUser: any = await tx.user.update({
        where: { id: targetUserId },
        data: { isActive } as any,
      });

      if (tx.auditLog) {
        await tx.auditLog.create({
          data: {
            performedById: adminId,
            targetUserId,
            action: 'TOGGLE_STATUS',
            oldValue: oldStatus,
            newValue: String(isActive),
          },
        });
      }

      return {
        id: updatedUser.id,
        email: updatedUser.email,
        isActive: updatedUser.isActive,
      };
    });
  }

  async getUsers() {
    const users: any[] = await (this.prisma.user as any).findMany({
      select: {
        id: true,
        email: true,
        isActive: true,
        createdAt: true,
        userRoles: {
          select: {
            role: {
              select: {
                name: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return users.map((u: any) => {
      const userRolesList = u.userRoles || u.roles || [];
      return {
        id: u.id,
        email: u.email,
        isActive: u.isActive ?? true,
        roles: userRolesList.map((ur: any) => ur.role?.name || ur.name || 'BUYER'),
        createdAt: u.createdAt,
      };
    });
  }
}